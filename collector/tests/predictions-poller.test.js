// collector/tests/predictions-poller.test.js — Predictions capture tests
import assert from 'assert';
import { createPredictionsPoller } from '../src/predictions-poller.mjs';

function makeSink() {
    const writes = [];
    return { writes, write: (path, record) => writes.push({ path, record }) };
}

async function testPollWritesPartitionedRecords() {
    const sink = makeSink();
    let requestedUrl = null;
    const poller = createPredictionsPoller({
        baseUrl: 'https://api.test',
        apiKey: 'k',
        routes: ['Green-E', 'Green-B'],
        sink,
        fetchImpl: async (url) => {
            requestedUrl = url;
            return {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: 'p1',
                            attributes: { arrival_time: '2026-07-04T17:36:00-04:00' },
                            relationships: { route: { data: { id: 'Green-E' } }, stop: { data: { id: '70239' } } },
                        },
                        {
                            id: 'p2',
                            attributes: { arrival_time: null },
                            relationships: { route: { data: { id: 'Green-B' } } },
                        },
                    ],
                }),
            };
        },
    });

    const ts = Date.UTC(2026, 6, 4, 21, 0, 0);
    const count = await poller.pollOnce(ts);

    assert.strictEqual(count, 2, 'Both predictions captured');
    assert.ok(requestedUrl.includes('filter%5Broute%5D=Green-E%2CGreen-B'), 'Route filter applied');
    assert.strictEqual(sink.writes[0].path, 'Green-E/2026-07-04/21.jsonl.gz', 'Partitioned by route');
    assert.strictEqual(sink.writes[1].path, 'Green-B/2026-07-04/21.jsonl.gz');
    assert.strictEqual(sink.writes[0].record.predictionId, 'p1');
    assert.strictEqual(sink.writes[0].record.ts, '2026-07-04T21:00:00.000Z', 'Receive-time stamped');
    console.log('✓ poll writes partitioned records');
}

async function testPollErrorPropagates() {
    const sink = makeSink();
    const poller = createPredictionsPoller({
        baseUrl: 'https://api.test',
        apiKey: 'k',
        routes: ['Green-E'],
        sink,
        fetchImpl: async () => ({ ok: false, status: 500 }),
    });

    await assert.rejects(() => poller.pollOnce(), /500/, 'Non-OK response rejects');
    assert.strictEqual(sink.writes.length, 0, 'Nothing written on failure');
    console.log('✓ poll error propagates');
}

async function testEmptyResponse() {
    const sink = makeSink();
    const poller = createPredictionsPoller({
        baseUrl: 'https://api.test',
        apiKey: 'k',
        routes: ['Green-E'],
        sink,
        fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }),
    });

    const count = await poller.pollOnce();
    assert.strictEqual(count, 0, 'Empty data handled');
    assert.strictEqual(sink.writes.length, 0);
    console.log('✓ empty response');
}

await testPollWritesPartitionedRecords();
await testPollErrorPropagates();
await testEmptyResponse();
console.log('All predictions-poller tests passed');
