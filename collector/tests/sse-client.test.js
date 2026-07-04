// collector/tests/sse-client.test.js — SSE client reconnect + gap behavior
// Uses an injected fetch that yields scripted stream bodies.
import assert from 'assert';
import { createSseClient } from '../src/sse-client.mjs';

/** Builds a fetch response whose body streams the given chunks then ends. */
function streamResponse(chunks) {
    const encoder = new TextEncoder();
    return {
        ok: true,
        status: 200,
        body: (async function* () {
            for (const chunk of chunks) {
                yield encoder.encode(chunk);
            }
        })(),
    };
}

async function testEventsAndGapOnReconnect() {
    const events = [];
    const gaps = [];
    let connection = 0;

    const client = createSseClient({
        url: 'http://test/vehicles',
        onEvent: (e) => events.push(e),
        onGap: (g) => gaps.push(g),
        fetchImpl: async () => {
            connection++;
            if (connection === 1) {
                return streamResponse(['event: reset\ndata: [{"id":"a"}]\n\n']);
            }
            if (connection === 2) {
                return streamResponse(['event: update\ndata: {"id":"a"}\n\n']);
            }
            // Third connection: stop the client from inside the stream
            client.stop();
            return streamResponse([]);
        },
        setTimeoutImpl: (fn) => { fn(); return 0; }, // no real waiting
    });

    await client.start();

    assert.strictEqual(events.length, 2, 'Events from both connections received');
    assert.strictEqual(events[0].event, 'reset');
    assert.strictEqual(events[1].event, 'update');
    // Connection 1 ended → gap opened; first event on connection 2 closes it
    assert.strictEqual(gaps.length, 1, 'One gap recorded across the reconnect');
    assert.strictEqual(gaps[0].reason, 'reconnect');
    assert.ok(gaps[0].endMs >= gaps[0].startMs, 'Gap interval well-formed');
    console.log('✓ events across reconnect + gap record');
}

async function testHttpErrorRetries() {
    let attempts = 0;
    const client = createSseClient({
        url: 'http://test/vehicles',
        onEvent: () => {},
        onGap: () => {},
        fetchImpl: async () => {
            attempts++;
            if (attempts < 3) {
                return { ok: false, status: 429, body: null };
            }
            client.stop();
            return streamResponse([]);
        },
        setTimeoutImpl: (fn) => { fn(); return 0; },
    });

    await client.start();
    assert.strictEqual(attempts, 3, 'Retried after non-OK responses');
    console.log('✓ HTTP error retry loop');
}

async function testPartialEventNotBleedAcrossReconnect() {
    const events = [];
    let connection = 0;
    const client = createSseClient({
        url: 'http://test/vehicles',
        onEvent: (e) => events.push(e),
        onGap: () => {},
        fetchImpl: async () => {
            connection++;
            if (connection === 1) {
                // Connection dies mid-event — no trailing blank line
                return streamResponse(['event: update\ndata: {"id":"trunc']);
            }
            client.stop();
            return streamResponse(['event: add\ndata: {"id":"clean"}\n\n']);
        },
        setTimeoutImpl: (fn) => { fn(); return 0; },
    });

    await client.start();
    assert.strictEqual(events.length, 1, 'Truncated event never dispatched');
    assert.strictEqual(events[0].data, '{"id":"clean"}', 'Fresh connection parses cleanly');
    console.log('✓ partial event discarded on reconnect');
}

await testEventsAndGapOnReconnect();
await testHttpErrorRetries();
await testPartialEventNotBleedAcrossReconnect();
console.log('All sse-client tests passed');
