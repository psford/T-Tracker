// collector/src/predictions-poller.mjs — Periodic /predictions capture (raw only)
//
// Capture-only by design (design plan 2026-07-04): predictions cannot be
// fetched retroactively, so this archives what MBTA claimed, when. No
// derivation, no SQL — the prediction-vs-actual study is a future DuckDB
// project over these blobs.

import { flattenPrediction } from './flatten.mjs';
import { partitionPath } from './partitioner.mjs';

/**
 * Creates a predictions poller.
 *
 * @param {Object} options
 * @param {string} options.baseUrl — MBTA API base (e.g. https://api-v3.mbta.com)
 * @param {string} options.apiKey
 * @param {string[]} options.routes — route IDs to capture
 * @param {Object} options.sink — { write(path, record) }
 * @param {number} [options.intervalMs] — poll interval (default 60s)
 * @param {Function} [options.fetchImpl] — injectable for tests
 * @param {Function} [options.onError] — callback(err) on poll failure
 * @returns {{ start: Function, stop: Function, pollOnce: Function }}
 */
export function createPredictionsPoller({
    baseUrl,
    apiKey,
    routes,
    sink,
    intervalMs = 60_000,
    fetchImpl = fetch,
    onError = () => {},
}) {
    let timer = null;

    async function pollOnce(nowMs = Date.now()) {
        const params = new URLSearchParams({
            api_key: apiKey,
            'filter[route]': routes.join(','),
        });
        const res = await fetchImpl(`${baseUrl}/predictions?${params}`);
        if (!res.ok) {
            throw new Error(`Predictions poll failed: ${res.status}`);
        }
        const body = await res.json();
        const items = Array.isArray(body.data) ? body.data : [];
        for (const item of items) {
            const record = flattenPrediction(item, nowMs);
            sink.write(partitionPath(record.routeId, nowMs), record);
        }
        return items.length;
    }

    return {
        pollOnce,
        start() {
            if (timer) return;
            timer = setInterval(() => {
                pollOnce().catch(onError);
            }, intervalMs);
        },
        stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        },
    };
}
