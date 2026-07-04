// collector/tests/partitioner.test.js — Unit tests for partition path building
import assert from 'assert';
import { datePartition, partitionPath } from '../src/partitioner.mjs';

function testDatePartition() {
    // 2026-07-04T21:05:30Z
    const ts = Date.UTC(2026, 6, 4, 21, 5, 30);
    assert.strictEqual(datePartition(ts), '2026-07-04/21');
    // Zero-padding
    const ts2 = Date.UTC(2026, 0, 9, 3, 0, 0);
    assert.strictEqual(datePartition(ts2), '2026-01-09/03');
    console.log('✓ datePartition UTC formatting');
}

function testPartitionPath() {
    const ts = Date.UTC(2026, 6, 4, 21, 0, 0);
    assert.strictEqual(partitionPath('Green-E', ts), 'Green-E/2026-07-04/21.jsonl.gz');
    assert.strictEqual(partitionPath('_meta', ts), '_meta/2026-07-04/21.jsonl.gz');
    console.log('✓ partitionPath layout');
}

function testPathSafety() {
    const ts = Date.UTC(2026, 6, 4, 21, 0, 0);
    assert.strictEqual(
        partitionPath('../../evil', ts),
        '______evil/2026-07-04/21.jsonl.gz',
        'Path traversal characters neutralized'
    );
    assert.strictEqual(
        partitionPath(undefined, ts),
        'unknown/2026-07-04/21.jsonl.gz',
        'Missing route falls back to unknown'
    );
    console.log('✓ path safety');
}

testDatePartition();
testPartitionPath();
testPathSafety();
console.log('All partitioner tests passed');
