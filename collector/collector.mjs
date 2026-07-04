// collector/collector.mjs — MBTA data collector entry point
//
// Always-on process (Azure continuous WebJob in prod, plain `node` locally):
//   1. Subscribes to MBTA V3 SSE /vehicles for the configured routes and
//      appends raw position events to {route}/{date}/{hour}.jsonl.gz
//   2. Polls /predictions for the same routes (capture-only, flag-controlled)
//   3. Records gap events under _meta/ whenever the stream drops, so analysis
//      can exclude unobserved windows
//
// Configuration is environment-only (WebJob app settings in prod):
//   MBTA_API_KEY               required
//   ROUTES                     comma-separated route IDs (default: Green-B,Green-C,Green-D,Green-E)
//   SINK                       'fs' (default) or 'blob'
//   OUT_DIR                    fs sink root (default: ./out)
//   RAW_CONTAINER_URL          blob sink: container URL for mbta-raw
//   PREDICTIONS_CONTAINER_URL  blob sink: container URL for mbta-predictions-raw
//   BLOB_SAS                   blob sink: container SAS token (no leading '?')
//   FLUSH_INTERVAL_MS          sink flush cadence (default 60000)
//   ENABLE_PREDICTIONS_LOG     'true'/'false' (default true)
//   PREDICTIONS_INTERVAL_MS    poll cadence (default 60000)

import { join } from 'node:path';
import { createSseClient } from './src/sse-client.mjs';
import { createSink } from './src/sink.mjs';
import { createFsAppender } from './src/fs-appender.mjs';
import { createBlobAppender } from './src/blob-appender.mjs';
import { createPredictionsPoller } from './src/predictions-poller.mjs';
import { flattenVehicleEvent } from './src/flatten.mjs';
import { partitionPath } from './src/partitioner.mjs';

const env = process.env;

function requireEnv(name) {
    const value = env[name];
    if (!value) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
}

const apiKey = requireEnv('MBTA_API_KEY');
const baseUrl = env.MBTA_BASE_URL || 'https://api-v3.mbta.com';
const routes = (env.ROUTES || 'Green-B,Green-C,Green-D,Green-E')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
const flushIntervalMs = Number(env.FLUSH_INTERVAL_MS) || 60_000;
const predictionsEnabled = (env.ENABLE_PREDICTIONS_LOG ?? 'true') !== 'false';
const predictionsIntervalMs = Number(env.PREDICTIONS_INTERVAL_MS) || 60_000;

function buildAppenders() {
    if ((env.SINK || 'fs') === 'blob') {
        const sasToken = requireEnv('BLOB_SAS');
        return {
            raw: createBlobAppender({ containerUrl: requireEnv('RAW_CONTAINER_URL'), sasToken }),
            predictions: createBlobAppender({ containerUrl: requireEnv('PREDICTIONS_CONTAINER_URL'), sasToken }),
        };
    }
    const outDir = env.OUT_DIR || './out';
    return {
        raw: createFsAppender(join(outDir, 'mbta-raw')),
        predictions: createFsAppender(join(outDir, 'mbta-predictions-raw')),
    };
}

const appenders = buildAppenders();
const logFlushError = (err, path) => console.error(`[sink] append failed for ${path}: ${err.message} — retrying next flush`);
const rawSink = createSink({ appender: appenders.raw, flushIntervalMs, onError: logFlushError });
const predictionsSink = createSink({ appender: appenders.predictions, flushIntervalMs, onError: logFlushError });

// --- Vehicle stream ---

function handleSseEvent({ event, data }) {
    const now = Date.now();
    let parsed;
    try {
        parsed = JSON.parse(data);
    } catch (err) {
        console.warn(`[sse] unparseable ${event} event: ${err.message}`);
        return;
    }
    const items = event === 'reset' ? parsed : [parsed];
    if (!Array.isArray(items)) {
        console.warn(`[sse] unexpected payload shape for ${event} event`);
        return;
    }
    for (const item of items) {
        const record = flattenVehicleEvent(event, item, now);
        rawSink.write(partitionPath(record.routeId, now), record);
    }
}

function handleGap({ startMs, endMs, reason }) {
    const record = {
        ts: new Date(endMs).toISOString(),
        event: 'gap',
        startUtc: new Date(startMs).toISOString(),
        endUtc: new Date(endMs).toISOString(),
        seconds: Math.round((endMs - startMs) / 1000),
        reason,
    };
    console.warn(`[gap] ${record.seconds}s unobserved (${record.startUtc} → ${record.endUtc})`);
    rawSink.write(partitionPath('_meta', endMs), record);
}

const sseUrl = `${baseUrl}/vehicles?${new URLSearchParams({
    api_key: apiKey,
    'filter[route]': routes.join(','),
})}`;

const sseClient = createSseClient({
    url: sseUrl,
    onEvent: handleSseEvent,
    onGap: handleGap,
    onStatus: (state, message) => console.log(`[sse] ${state}: ${message}`),
});

// --- Predictions poller ---

const poller = predictionsEnabled
    ? createPredictionsPoller({
        baseUrl,
        apiKey,
        routes,
        sink: predictionsSink,
        intervalMs: predictionsIntervalMs,
        onError: (err) => console.warn(`[predictions] poll failed: ${err.message}`),
    })
    : null;

// --- Lifecycle ---

async function shutdown(signal) {
    console.log(`[collector] ${signal} received — flushing and exiting`);
    sseClient.stop();
    if (poller) poller.stop();
    await rawSink.stop();
    await predictionsSink.stop();
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log(`[collector] starting — routes: ${routes.join(', ')} | sink: ${env.SINK || 'fs'} | predictions log: ${predictionsEnabled ? 'on' : 'off'}`);
rawSink.start();
predictionsSink.start();
if (poller) poller.start();
sseClient.start();
