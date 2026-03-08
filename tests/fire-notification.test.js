// tests/fire-notification.test.js — Tests for notification pathway selection
// Tests selectNotificationPathway() pure function exported from notifications.js
import assert from 'assert';

// Minimal localStorage mock required by notifications.js module initialization
globalThis.localStorage = {
    _store: {},
    getItem(key) { return this._store[key] ?? null; },
    setItem(key, value) { this._store[key] = String(value); },
    removeItem(key) { delete this._store[key]; },
    clear() { this._store = {}; },
};

// Minimal Notification stub so the module loads without error
globalThis.Notification = function(title, opts) {};
globalThis.Notification.permission = 'granted';
globalThis.Notification.requestPermission = async () => 'granted';

import { selectNotificationPathway } from '../src/notifications.js';

/**
 * Helper: build a fake navigator with or without an active SW controller.
 */
function makeNav({ hasServiceWorker = false, hasController = false } = {}) {
    if (!hasServiceWorker) return {};
    return {
        serviceWorker: hasController
            ? { controller: { state: 'activated' } }
            : { controller: null },
    };
}

/**
 * Test: SW pathway chosen when navigator.serviceWorker.controller is set.
 * This is the iOS PWA path — must be preferred over constructor.
 */
function testSWPathwayWhenControllerActive() {
    const nav = makeNav({ hasServiceWorker: true, hasController: true });
    const result = selectNotificationPathway(nav, function Notification() {});
    assert.strictEqual(result, 'sw', 'Should prefer SW pathway when controller is active');
    console.log('  ok — SW pathway selected when controller active');
}

/**
 * Test: constructor fallback when no SW controller (desktop browsers without SW).
 */
function testConstructorFallbackWhenNoController() {
    const nav = makeNav({ hasServiceWorker: true, hasController: false });
    const result = selectNotificationPathway(nav, function Notification() {});
    assert.strictEqual(result, 'constructor', 'Should fall back to constructor when SW has no controller');
    console.log('  ok — constructor fallback when SW controller is null');
}

/**
 * Test: constructor fallback when no serviceWorker at all.
 */
function testConstructorFallbackWhenNoServiceWorker() {
    const nav = makeNav({ hasServiceWorker: false });
    const result = selectNotificationPathway(nav, function Notification() {});
    assert.strictEqual(result, 'constructor', 'Should fall back to constructor when no serviceWorker');
    console.log('  ok — constructor fallback when serviceWorker unavailable');
}

/**
 * Test: 'none' when both SW and Notification are unavailable.
 */
function testNoneWhenBothUnavailable() {
    const nav = makeNav({ hasServiceWorker: false });
    // Must temporarily remove globalThis.Notification so the default parameter picks up undefined
    const savedNotification = globalThis.Notification;
    delete globalThis.Notification;
    const result = selectNotificationPathway(nav);
    globalThis.Notification = savedNotification;
    assert.strictEqual(result, 'none', 'Should return none when Notification unavailable');
    console.log('  ok — none returned when both pathways unavailable');
}

/**
 * Test: SW is ALWAYS preferred over constructor even when Notification constructor exists.
 * Critical for iOS PWA — constructor silently no-ops on iOS, SW is the only real path.
 */
function testSWTakesPriorityOverConstructor() {
    const nav = makeNav({ hasServiceWorker: true, hasController: true });
    const result = selectNotificationPathway(nav, function Notification() {});
    assert.strictEqual(result, 'sw', 'SW must take priority over constructor when controller active');
    console.log('  ok — SW takes priority over constructor (iOS PWA correctness)');
}

/**
 * Test: explicit null Notification class treated as unavailable.
 */
function testNullNotificationTreatedAsUnavailable() {
    const nav = makeNav({ hasServiceWorker: false });
    // Explicitly pass null — not undefined (which triggers default parameter)
    const result = selectNotificationPathway(nav, null);
    assert.strictEqual(result, 'none', 'null Notification should be treated as unavailable');
    console.log('  ok — null Notification treated as unavailable');
}

function runTests() {
    try {
        console.log('fire-notification pathway tests:');
        testSWPathwayWhenControllerActive();
        testConstructorFallbackWhenNoController();
        testConstructorFallbackWhenNoServiceWorker();
        testNoneWhenBothUnavailable();
        testSWTakesPriorityOverConstructor();
        testNullNotificationTreatedAsUnavailable();
        console.log('\n  All fire-notification pathway tests passed\n');
    } catch (err) {
        console.error('FAIL:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

runTests();
