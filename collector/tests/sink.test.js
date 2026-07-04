// collector/tests/sink.test.js — Unit tests for buffering sink + fs appender
import assert from 'assert';
import { gunzipSync } from 'node:zlib';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSink } from '../src/sink.mjs';
import { createFsAppender } from '../src/fs-appender.mjs';

async function testBufferAndFlush() {
    const appends = [];
    const sink = createSink({
        appender: { append: async (path, buf) => appends.push({ path, buf }) },
    });

    sink.write('Green-E/2026-07-04/21.jsonl.gz', { a: 1 });
    sink.write('Green-E/2026-07-04/21.jsonl.gz', { a: 2 });
    sink.write('Green-B/2026-07-04/21.jsonl.gz', { b: 1 });
    assert.strictEqual(sink.pendingCount(), 3, 'Records buffered until flush');
    assert.strictEqual(appends.length, 0, 'No appends before flush');

    await sink.flush();
    assert.strictEqual(appends.length, 2, 'One append per partition');
    assert.strictEqual(sink.pendingCount(), 0, 'Buffers cleared after flush');

    const greenE = appends.find((a) => a.path.startsWith('Green-E'));
    const lines = gunzipSync(greenE.buf).toString().trim().split('\n');
    assert.deepStrictEqual(lines.map((l) => JSON.parse(l)), [{ a: 1 }, { a: 2 }], 'JSONL roundtrip');
    console.log('✓ buffer and flush');
}

async function testMultiMemberGzip() {
    const dir = await mkdtemp(join(tmpdir(), 'ttracker-sink-'));
    try {
        const sink = createSink({ appender: createFsAppender(dir) });
        sink.write('r/2026-07-04/21.jsonl.gz', { flush: 1 });
        await sink.flush();
        sink.write('r/2026-07-04/21.jsonl.gz', { flush: 2 });
        await sink.flush();

        // Two flushes = two gzip members appended to one file.
        // zlib gunzipSync handles multi-member gzip — this is the property
        // the whole append-only design rests on.
        const raw = await readFile(join(dir, 'r/2026-07-04/21.jsonl.gz'));
        const lines = gunzipSync(raw).toString().trim().split('\n');
        assert.deepStrictEqual(
            lines.map((l) => JSON.parse(l)),
            [{ flush: 1 }, { flush: 2 }],
            'Multi-member gzip decompresses to concatenated JSONL'
        );
        console.log('✓ multi-member gzip append');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

async function testFailedAppendRetainsData() {
    let failNext = true;
    const appends = [];
    const errors = [];
    const sink = createSink({
        appender: {
            append: async (path, buf) => {
                if (failNext) {
                    failNext = false;
                    throw new Error('transient blob failure');
                }
                appends.push({ path, buf });
            },
        },
        onError: (err, path) => errors.push({ err, path }),
    });

    sink.write('r/2026-07-04/21.jsonl.gz', { n: 1 });
    await sink.flush();
    assert.strictEqual(errors.length, 1, 'Failure reported');
    assert.strictEqual(sink.pendingCount(), 1, 'Lines retained after failed append');

    sink.write('r/2026-07-04/21.jsonl.gz', { n: 2 });
    await sink.flush();
    assert.strictEqual(appends.length, 1, 'Retry succeeded');
    const lines = gunzipSync(appends[0].buf).toString().trim().split('\n');
    assert.deepStrictEqual(
        lines.map((l) => JSON.parse(l)),
        [{ n: 1 }, { n: 2 }],
        'Retained lines flushed before newer ones — order preserved'
    );
    console.log('✓ failed append retains data');
}

await testBufferAndFlush();
await testMultiMemberGzip();
await testFailedAppendRetainsData();
console.log('All sink tests passed');
