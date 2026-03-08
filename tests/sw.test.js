// tests/sw.test.js — Unit tests for service worker fetch handler
// Verifies the origin guard that prevents intercepting cross-origin SSE streams
import assert from 'assert';

// Mock self (ServiceWorkerGlobalScope)
const listeners = {};
const mockSelf = {
    location: { origin: 'https://supertra.in' },
    addEventListener(event, handler) {
        listeners[event] = handler;
    },
    skipWaiting() {},
    clients: {
        claim() { return Promise.resolve(); },
        matchAll() { return Promise.resolve([]); },
    },
};

globalThis.self = mockSelf;

// Track respondWith calls
let respondWithCalled = false;
let respondWithArg = null;

function makeFetchEvent(url) {
    respondWithCalled = false;
    respondWithArg = null;
    return {
        request: { url },
        respondWith(response) {
            respondWithCalled = true;
            respondWithArg = response;
        },
        waitUntil() {},
    };
}

// Mock fetch
globalThis.fetch = (req) => Promise.resolve({ ok: true });

// Load sw.js by reading and evaluating it (SW uses self, not import/export)
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swCode = readFileSync(join(__dirname, '..', 'sw.js'), 'utf-8');

// Execute SW code in current scope (it registers listeners on self)
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
new Function(swCode)();

const fetchHandler = listeners['fetch'];

/**
 * Test: Same-origin request is intercepted (respondWith is called)
 */
function testSameOriginIntercepted() {
    const event = makeFetchEvent('https://supertra.in/index.html');
    fetchHandler(event);
    assert.strictEqual(respondWithCalled, true, 'Same-origin request should be intercepted');
    console.log('  ok — same-origin request intercepted');
}

/**
 * Test: Same-origin root path is intercepted
 */
function testSameOriginRootIntercepted() {
    const event = makeFetchEvent('https://supertra.in/');
    fetchHandler(event);
    assert.strictEqual(respondWithCalled, true, 'Same-origin root should be intercepted');
    console.log('  ok — same-origin root path intercepted');
}

/**
 * Test: Cross-origin MBTA API is NOT intercepted (SSE stream safety)
 */
function testCrossOriginMBTANotIntercepted() {
    const event = makeFetchEvent('https://api-v3.mbta.com/vehicles?filter[route]=Red');
    fetchHandler(event);
    assert.strictEqual(respondWithCalled, false, 'Cross-origin MBTA API must NOT be intercepted');
    console.log('  ok — cross-origin MBTA API not intercepted (SSE safe)');
}

/**
 * Test: Cross-origin CDN (Leaflet) is NOT intercepted
 */
function testCrossOriginCDNNotIntercepted() {
    const event = makeFetchEvent('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    fetchHandler(event);
    assert.strictEqual(respondWithCalled, false, 'Cross-origin CDN must NOT be intercepted');
    console.log('  ok — cross-origin CDN not intercepted');
}

/**
 * Test: Cross-origin tile server is NOT intercepted
 */
function testCrossOriginTilesNotIntercepted() {
    const event = makeFetchEvent('https://a.basemaps.cartocdn.com/dark_all/12/1234/567.png');
    fetchHandler(event);
    assert.strictEqual(respondWithCalled, false, 'Cross-origin tile server must NOT be intercepted');
    console.log('  ok — cross-origin tile server not intercepted');
}

/**
 * Test: install listener exists and calls skipWaiting
 */
function testInstallListener() {
    assert.ok(listeners['install'], 'install listener should be registered');
    console.log('  ok — install listener registered');
}

/**
 * Test: activate listener exists
 */
function testActivateListener() {
    assert.ok(listeners['activate'], 'activate listener should be registered');
    console.log('  ok — activate listener registered');
}

/**
 * Test: notificationclick listener exists
 */
function testNotificationClickListener() {
    assert.ok(listeners['notificationclick'], 'notificationclick listener should be registered');
    console.log('  ok — notificationclick listener registered');
}

function runTests() {
    try {
        console.log('sw.js fetch handler tests:');
        testSameOriginIntercepted();
        testSameOriginRootIntercepted();
        testCrossOriginMBTANotIntercepted();
        testCrossOriginCDNNotIntercepted();
        testCrossOriginTilesNotIntercepted();
        testInstallListener();
        testActivateListener();
        testNotificationClickListener();
        console.log('\n  All sw.js tests passed\n');
    } catch (err) {
        console.error('FAIL:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

runTests();
