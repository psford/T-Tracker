// tests/route-stops-cache.test.js — Unit tests for route-stops cache with localStorage TTL

import assert from 'assert';

// Mock localStorage before importing route-stops-cache.js
globalThis.localStorage = {
    _store: {},
    getItem(key) {
        return this._store[key] ?? null;
    },
    setItem(key, value) {
        this._store[key] = String(value);
    },
    removeItem(key) {
        delete this._store[key];
    },
    clear() {
        this._store = {};
    },
};

import {
    getCachedRouteStops,
    setCachedRouteStops,
    clearRouteStopsCache,
} from '../src/route-stops-cache.js';

/**
 * Test startup-perf.AC1.1: Cache stores route-stops mapping per-route with timestamp,
 * retrievable after page reload
 */
function testCacheStoreRetrieve() {
    localStorage.clear();

    // Write a route-stops mapping
    setCachedRouteStops('Red', ['stop1', 'stop2', 'stop3']);

    // Retrieve it back
    const { cached, uncached } = getCachedRouteStops(['Red']);

    assert.strictEqual(cached.size, 1, 'Should have 1 cached route');
    assert.strictEqual(cached.has('Red'), true, 'Red route should be in cached Map');
    assert.deepStrictEqual(
        Array.from(cached.get('Red')).sort(),
        ['stop1', 'stop2', 'stop3'],
        'Cached stops should match what was written'
    );
    assert.deepStrictEqual(uncached, [], 'Uncached array should be empty');

    // Verify localStorage contains cachedAt timestamp
    const stored = localStorage.getItem('ttracker-route-stops-cache');
    assert(stored, 'Should store in localStorage');
    const parsed = JSON.parse(stored);
    assert(parsed.routes.Red.cachedAt, 'Should have cachedAt timestamp');
    assert(typeof parsed.routes.Red.cachedAt === 'number', 'cachedAt should be a number');

    console.log('✓ startup-perf.AC1.1 — Cache stores route-stops mapping per-route with timestamp');
}

/**
 * Test startup-perf.AC1.2: Cache entries within 24hr TTL return stored stop IDs
 * without API fetch
 */
function testCacheTTLValid() {
    localStorage.clear();

    // Write a route-stops mapping
    setCachedRouteStops('Blue', ['stop-a', 'stop-b']);

    // Immediately retrieve with default TTL
    const { cached, uncached } = getCachedRouteStops(['Blue']);

    assert.strictEqual(cached.size, 1, 'Should have 1 cached route within TTL');
    assert(cached.has('Blue'), 'Blue should be cached');
    assert.deepStrictEqual(
        Array.from(cached.get('Blue')).sort(),
        ['stop-a', 'stop-b'],
        'Should return stops from cache'
    );
    assert.deepStrictEqual(uncached, [], 'Should have no uncached routes');

    console.log('✓ startup-perf.AC1.2 — Cache entries within 24hr TTL return without fetch');
}

/**
 * Test startup-perf.AC1.3: Cache entries older than 24hr are treated as stale
 * and trigger re-fetch
 */
function testCacheTTLExpired() {
    localStorage.clear();

    // Manually create a cache entry with cachedAt far in the past
    const cache = {
        version: 1,
        routes: {
            'Orange': {
                stopIds: ['stop-old-1', 'stop-old-2'],
                cachedAt: Date.now() - 86_400_001, // Just past 24 hours
            },
        },
    };
    localStorage.setItem('ttracker-route-stops-cache', JSON.stringify(cache));

    // Try to retrieve with default TTL
    const { cached, uncached } = getCachedRouteStops(['Orange']);

    assert.strictEqual(cached.size, 0, 'Expired entry should not be in cached Map');
    assert.deepStrictEqual(cached, new Map(), 'Cached should be empty Map');
    assert.deepStrictEqual(uncached, ['Orange'], 'Orange should be in uncached array');

    console.log('✓ startup-perf.AC1.3 — Cache entries older than 24hr are stale');
}

/**
 * Test startup-perf.AC1.4: Malformed or corrupted cache JSON falls back to API fetch
 * without error
 */
function testCorruptedCacheJSON() {
    localStorage.clear();

    // Set malformed JSON
    localStorage.setItem('ttracker-route-stops-cache', 'invalid json{{{');

    // Should not throw, should fall back to uncached
    const { cached, uncached } = getCachedRouteStops(['Red']);

    assert.strictEqual(cached.size, 0, 'Should have no cached routes');
    assert.deepStrictEqual(cached, new Map(), 'Cached should be empty Map');
    assert.deepStrictEqual(uncached, ['Red'], 'Red should be uncached');
    assert.strictEqual(localStorage.getItem('ttracker-route-stops-cache'), null, 'Malformed cache should be removed');

    console.log('✓ startup-perf.AC1.4 — Malformed cache falls back without error');
}

/**
 * Test startup-perf.AC1.5: Cache version mismatch triggers full cache clear and re-fetch
 */
function testCacheVersionMismatch() {
    localStorage.clear();

    // Set cache with wrong version
    localStorage.setItem('ttracker-route-stops-cache', JSON.stringify({
        version: 999,
        routes: {
            'Green': {
                stopIds: ['stop-x', 'stop-y'],
                cachedAt: Date.now(),
            },
        },
    }));

    // Should treat as uncached due to version mismatch
    const { cached, uncached } = getCachedRouteStops(['Green']);

    assert.strictEqual(cached.size, 0, 'Should have no cached routes (version mismatch)');
    assert.deepStrictEqual(uncached, ['Green'], 'Green should be uncached');
    assert.strictEqual(localStorage.getItem('ttracker-route-stops-cache'), null, 'Version mismatch should clear cache');

    console.log('✓ startup-perf.AC1.5 — Cache version mismatch triggers clear and re-fetch');
}

/**
 * Additional test: clearRouteStopsCache removes the storage key entirely
 */
function testClearCache() {
    localStorage.clear();

    // Add a cache entry
    setCachedRouteStops('Purple', ['stop-1', 'stop-2']);
    assert(localStorage.getItem('ttracker-route-stops-cache'), 'Cache should exist');

    // Clear it
    clearRouteStopsCache();
    assert.strictEqual(localStorage.getItem('ttracker-route-stops-cache'), null, 'Cache should be removed after clear');

    console.log('✓ clearRouteStopsCache removes storage key');
}

/**
 * Additional test: setCachedRouteStops accepts both Array and Set inputs
 */
function testArrayAndSetInputs() {
    localStorage.clear();

    // Test Array input
    setCachedRouteStops('Red', ['stop-1', 'stop-2']);
    let { cached } = getCachedRouteStops(['Red']);
    assert(cached.has('Red'), 'Should cache with Array input');
    assert.deepStrictEqual(
        Array.from(cached.get('Red')).sort(),
        ['stop-1', 'stop-2'],
        'Array stops should be cached correctly'
    );

    // Test Set input
    localStorage.clear();
    const stopSet = new Set(['stop-a', 'stop-b', 'stop-c']);
    setCachedRouteStops('Blue', stopSet);
    ({ cached } = getCachedRouteStops(['Blue']));
    assert(cached.has('Blue'), 'Should cache with Set input');
    assert.deepStrictEqual(
        Array.from(cached.get('Blue')).sort(),
        ['stop-a', 'stop-b', 'stop-c'],
        'Set stops should be cached correctly'
    );

    console.log('✓ setCachedRouteStops accepts both Array and Set inputs');
}

/**
 * Additional test: Mixed cache hit/miss with multiple routes
 */
function testMixedHitMiss() {
    localStorage.clear();

    // Cache only Red and Blue
    setCachedRouteStops('Red', ['stop-r1', 'stop-r2']);
    setCachedRouteStops('Blue', ['stop-b1']);

    // Query Red, Blue, Green (uncached)
    const { cached, uncached } = getCachedRouteStops(['Red', 'Blue', 'Green']);

    assert.strictEqual(cached.size, 2, 'Should have 2 cached routes');
    assert(cached.has('Red'), 'Red should be cached');
    assert(cached.has('Blue'), 'Blue should be cached');
    assert(!cached.has('Green'), 'Green should not be cached');
    assert.deepStrictEqual(uncached, ['Green'], 'Green should be in uncached array');

    console.log('✓ Mixed cache hit/miss works correctly');
}

/**
 * Additional test: Empty routeIds array
 */
function testEmptyRouteIds() {
    localStorage.clear();

    // Add some cache entries (should be ignored)
    setCachedRouteStops('Red', ['stop-1']);

    // Query with empty array
    const { cached, uncached } = getCachedRouteStops([]);

    assert.strictEqual(cached.size, 0, 'Cached Map should be empty');
    assert.deepStrictEqual(uncached, [], 'Uncached array should be empty');

    console.log('✓ Empty routeIds array returns empty results');
}

/**
 * Additional test: Custom TTL parameter
 */
function testCustomTTL() {
    localStorage.clear();

    // Add a fresh cache entry
    setCachedRouteStops('Red', ['stop-1']);

    // Query with very short TTL (1ms) — should treat as stale
    const { cached, uncached } = getCachedRouteStops(['Red'], 1);

    // The entry was just created, but with 1ms TTL it will likely be expired
    // (depending on execution time). We'll be lenient and test the logic:
    // If it's still within TTL, it should be cached; otherwise uncached.
    // For safety, let's wait a tiny bit then check.

    // Actually, let's set the timestamp manually to guarantee staleness
    localStorage.clear();
    const cache = {
        version: 1,
        routes: {
            'Red': {
                stopIds: ['stop-1'],
                cachedAt: Date.now() - 1000, // 1 second ago
            },
        },
    };
    localStorage.setItem('ttracker-route-stops-cache', JSON.stringify(cache));

    // Query with 500ms TTL (cache is 1 second old)
    const { cached: cached2, uncached: uncached2 } = getCachedRouteStops(['Red'], 500);

    assert.strictEqual(cached2.size, 0, 'Old cache should be uncached with short TTL');
    assert.deepStrictEqual(uncached2, ['Red'], 'Red should be uncached with short TTL');

    console.log('✓ Custom TTL parameter works correctly');
}

/**
 * Additional test: Multiple routes in single cache
 */
function testMultipleRoutesInCache() {
    localStorage.clear();

    // Add multiple routes to cache
    setCachedRouteStops('Red', ['r-stop-1', 'r-stop-2']);
    setCachedRouteStops('Blue', ['b-stop-1']);
    setCachedRouteStops('Green', ['g-stop-1', 'g-stop-2', 'g-stop-3']);

    // Retrieve all
    const { cached, uncached } = getCachedRouteStops(['Red', 'Blue', 'Green']);

    assert.strictEqual(cached.size, 3, 'Should have 3 cached routes');
    assert.deepStrictEqual(
        Array.from(cached.get('Red')).sort(),
        ['r-stop-1', 'r-stop-2'],
        'Red stops should match'
    );
    assert.deepStrictEqual(
        Array.from(cached.get('Blue')),
        ['b-stop-1'],
        'Blue stops should match'
    );
    assert.deepStrictEqual(
        Array.from(cached.get('Green')).sort(),
        ['g-stop-1', 'g-stop-2', 'g-stop-3'],
        'Green stops should match'
    );
    assert.deepStrictEqual(uncached, [], 'Uncached should be empty');

    console.log('✓ Multiple routes in single cache works correctly');
}

/**
 * Additional test: Updating existing route in cache
 */
function testUpdateCachedRoute() {
    localStorage.clear();

    // Add initial route
    setCachedRouteStops('Red', ['old-stop-1', 'old-stop-2']);
    let { cached } = getCachedRouteStops(['Red']);
    assert.strictEqual(cached.get('Red').size, 2, 'Should have 2 stops initially');

    // Update the same route
    setCachedRouteStops('Red', ['new-stop-1', 'new-stop-2', 'new-stop-3']);
    ({ cached } = getCachedRouteStops(['Red']));
    assert.deepStrictEqual(
        Array.from(cached.get('Red')).sort(),
        ['new-stop-1', 'new-stop-2', 'new-stop-3'],
        'Should have new stops after update'
    );

    console.log('✓ Updating existing route in cache works correctly');
}

/**
 * Additional test: Quota exceeded handling (silent failure)
 */
function testQuotaExceededHandling() {
    localStorage.clear();

    // Mock setItem to throw QuotaExceededError
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
    };

    try {
        // This should not throw, quota errors are silently handled
        setCachedRouteStops('Red', ['stop-1']);

        // Calling getCachedRouteStops should return uncached (no error thrown)
        const { uncached } = getCachedRouteStops(['Red']);
        assert.deepStrictEqual(uncached, ['Red'], 'Should treat as uncached when quota exceeded');

        console.log('✓ Quota exceeded handling (silent failure) works');
    } finally {
        localStorage.setItem = originalSetItem;
    }
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Running route-stops-cache unit tests...\n');

    testCacheStoreRetrieve();
    testCacheTTLValid();
    testCacheTTLExpired();
    testCorruptedCacheJSON();
    testCacheVersionMismatch();
    testClearCache();
    testArrayAndSetInputs();
    testMixedHitMiss();
    testEmptyRouteIds();
    testCustomTTL();
    testMultipleRoutesInCache();
    testUpdateCachedRoute();
    testQuotaExceededHandling();

    console.log('\n✓ All route-stops-cache tests passed!');
}

// Run tests
try {
    runTests();
} catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
}
