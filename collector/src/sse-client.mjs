// collector/src/sse-client.mjs — Streaming SSE client with reconnect + gap tracking
//
// Node has no EventSource; this uses fetch() body streaming plus the
// incremental parser. Reconnect behavior mirrors src/api.js (exponential
// backoff 1s→30s, ×2; aggressive ×4 step on rapid closes = likely rate
// limiting). Unlike the browser client, a dropped connection here produces a
// GAP RECORD so analysis can distinguish "no trains" from "not watching".

import { createSseParser } from './sse-parser.mjs';

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30_000;
const RECONNECT_MULTIPLIER = 2;
const RAPID_CLOSE_THRESHOLD = 1000;

/**
 * Creates and starts an SSE client.
 *
 * @param {Object} options
 * @param {string} options.url — SSE endpoint (with api_key + filters)
 * @param {Function} options.onEvent — callback({ event, data }) per SSE dispatch
 * @param {Function} options.onGap — callback({ startMs, endMs, reason }) when a
 *   connection is reestablished after a gap
 * @param {Function} [options.onStatus] — callback(state, message) for logging
 * @param {Function} [options.fetchImpl] — injectable for tests
 * @param {Function} [options.setTimeoutImpl] — injectable for tests
 * @returns {{ start: Function, stop: Function }}
 */
export function createSseClient({
    url,
    onEvent,
    onGap,
    onStatus = () => {},
    fetchImpl = fetch,
    setTimeoutImpl = setTimeout,
}) {
    let stopped = false;
    let abortController = null;
    let reconnectDelay = INITIAL_RECONNECT_DELAY;
    let rapidCloseCount = 0;
    let gapStartMs = null; // set when a connection drops; cleared on first event after reconnect
    let receivedEventThisConnection = false;

    const parser = createSseParser((evt) => {
        if (gapStartMs !== null) {
            onGap({ startMs: gapStartMs, endMs: Date.now(), reason: 'reconnect' });
            gapStartMs = null;
        }
        receivedEventThisConnection = true;
        reconnectDelay = INITIAL_RECONNECT_DELAY;
        rapidCloseCount = 0;
        onEvent(evt);
    });

    async function connectOnce() {
        const connectionStart = Date.now();
        receivedEventThisConnection = false;
        parser.reset();
        abortController = new AbortController();

        onStatus('connecting', 'Connecting to MBTA SSE...');
        const res = await fetchImpl(url, {
            headers: { Accept: 'text/event-stream' },
            signal: abortController.signal,
        });
        if (!res.ok) {
            throw new Error(`SSE endpoint returned ${res.status}`);
        }
        onStatus('connected', 'Stream open');

        const decoder = new TextDecoder();
        for await (const chunk of res.body) {
            parser.feed(decoder.decode(chunk, { stream: true }));
        }

        // Stream ended without error — treat as a drop
        if (Date.now() - connectionStart < RAPID_CLOSE_THRESHOLD && !receivedEventThisConnection) {
            rapidCloseCount++;
        }
    }

    async function runLoop() {
        while (!stopped) {
            const attemptStart = Date.now();
            try {
                await connectOnce();
                if (stopped) break;
                onStatus('reconnecting', 'Stream closed by server');
            } catch (err) {
                if (stopped) break;
                if (Date.now() - attemptStart < RAPID_CLOSE_THRESHOLD) {
                    rapidCloseCount++;
                }
                onStatus('reconnecting', `Stream error: ${err.message}`);
            }

            if (gapStartMs === null) {
                gapStartMs = Date.now();
            }

            if (rapidCloseCount >= 2) {
                // Likely rate limited — back off aggressively (mirrors src/api.js)
                reconnectDelay = Math.min(reconnectDelay * 4, MAX_RECONNECT_DELAY);
                rapidCloseCount = 0;
                onStatus('reconnecting', `Rapid closes — backing off ${reconnectDelay}ms`);
            }

            await new Promise((resolve) => setTimeoutImpl(resolve, reconnectDelay));
            reconnectDelay = Math.min(reconnectDelay * RECONNECT_MULTIPLIER, MAX_RECONNECT_DELAY);
        }
    }

    return {
        start() {
            stopped = false;
            return runLoop();
        },
        stop() {
            stopped = true;
            if (abortController) {
                abortController.abort();
            }
        },
    };
}
