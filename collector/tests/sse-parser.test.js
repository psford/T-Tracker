// collector/tests/sse-parser.test.js — Unit tests for incremental SSE parser
import assert from 'assert';
import { createSseParser } from '../src/sse-parser.mjs';

function collect() {
    const events = [];
    const parser = createSseParser((e) => events.push(e));
    return { events, parser };
}

function testBasicDispatch() {
    const { events, parser } = collect();
    parser.feed('event: update\ndata: {"id":"y1"}\n\n');
    assert.strictEqual(events.length, 1, 'One event dispatched');
    assert.deepStrictEqual(events[0], { event: 'update', data: '{"id":"y1"}' });
    console.log('✓ basic dispatch');
}

function testChunkBoundaries() {
    const { events, parser } = collect();
    // Split mid-field-name, mid-value, and mid-newline
    const stream = 'event: reset\ndata: [{"id":"a"},{"id":"b"}]\n\nevent: add\ndata: {"id":"c"}\n\n';
    for (const char of stream) {
        parser.feed(char);
    }
    assert.strictEqual(events.length, 2, 'Two events despite 1-char chunks');
    assert.strictEqual(events[0].event, 'reset');
    assert.strictEqual(events[0].data, '[{"id":"a"},{"id":"b"}]');
    assert.strictEqual(events[1].event, 'add');
    console.log('✓ chunk boundary handling');
}

function testCrlfAndComments() {
    const { events, parser } = collect();
    parser.feed(': keep-alive\r\nevent: update\r\ndata: {"x":1}\r\n\r\n');
    assert.strictEqual(events.length, 1, 'Comment ignored, CRLF handled');
    assert.deepStrictEqual(events[0], { event: 'update', data: '{"x":1}' });
    console.log('✓ CRLF and comment lines');
}

function testMultiLineData() {
    const { events, parser } = collect();
    parser.feed('data: line1\ndata: line2\n\n');
    assert.strictEqual(events[0].event, 'message', 'Default event type');
    assert.strictEqual(events[0].data, 'line1\nline2', 'Multi-line data joined');
    console.log('✓ multi-line data');
}

function testBlankWithoutData() {
    const { events, parser } = collect();
    parser.feed('\n\n\nevent: update\n\n');
    assert.strictEqual(events.length, 0, 'No dispatch without data lines');
    console.log('✓ no dispatch without data');
}

function testReset() {
    const { events, parser } = collect();
    parser.feed('event: update\ndata: {"partial":');
    parser.reset();
    parser.feed('event: add\ndata: {"id":"z"}\n\n');
    assert.strictEqual(events.length, 1, 'Partial event discarded on reset');
    assert.strictEqual(events[0].event, 'add');
    assert.strictEqual(events[0].data, '{"id":"z"}', 'No bleed from pre-reset buffer');
    console.log('✓ reset discards partial state');
}

testBasicDispatch();
testChunkBoundaries();
testCrlfAndComments();
testMultiLineData();
testBlankWithoutData();
testReset();
console.log('All sse-parser tests passed');
