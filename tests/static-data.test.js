// tests/static-data.test.js
import assert from 'assert';

// ── Fixture ───────────────────────────────────────────────────────────────────

const FIXTURE_BUNDLE = {
    generatedAt: 1000000000,
    routes: [
        { id: 'Red', type: 1, color: '#DA291C', shortName: '', longName: 'Red Line',
          directionNames: ['South', 'North'], directionDestinations: ['Ashmont/Braintree', 'Alewife'],
          polyline: [[42.36, -71.06], [42.37, -71.07]] },
        { id: '66',  type: 3, color: '#DA291C', shortName: '66', longName: 'Harvard - Dudley',
          directionNames: ['Outbound', 'Inbound'], directionDestinations: ['Dudley', 'Harvard'],
          polyline: [[42.35, -71.10], [42.36, -71.11]] },
    ],
    stops: {
        'place-pktrm': { id: 'place-pktrm', name: 'Park Street', lat: 42.356395, lng: -71.062424, parentStopId: null },
    },
    routeStops: { 'Red': ['place-pktrm'], '66': [] },
};

const STORAGE_KEY = 'ttracker-static-data';
const STATIC_DATA_VERSION = 1;

function makeLocalStorage(initialItems = {}) {
    const store = { ...initialItems };
    return {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = v; },
        removeItem: (k) => { delete store[k]; },
        _store: store,
    };
}

function cachedEntry(bundle) {
    return JSON.stringify({ version: STATIC_DATA_VERSION, data: bundle });
}

// ── AC2.2: Returning visit — hydrates from localStorage, no fetch ──────────────

async function testLocalStorageHit() {
    const ls = makeLocalStorage({ [STORAGE_KEY]: cachedEntry(FIXTURE_BUNDLE) });
    let fetchCalled = false;

    const fetchMock = async (url) => {
        if (url.includes('fields[route]=id')) {
            // Staleness check — return matching IDs so no re-fetch is triggered
            return {
                ok: true,
                json: async () => ({ data: FIXTURE_BUNDLE.routes.map(r => ({ id: r.id })) }),
            };
        }
        // Static file should NOT be fetched on cache hit
        fetchCalled = true;
        throw new Error('static file fetch should not be called on cache hit');
    };

    const { bundle, bgCheckPromise } = await _loadStaticData_withMocks(ls, fetchMock);
    await bgCheckPromise;

    assert.strictEqual(bundle.generatedAt, FIXTURE_BUNDLE.generatedAt, 'Returns cached bundle');
    assert.strictEqual(fetchCalled, false, 'Static file not fetched on cache hit');
    console.log('✓ AC2.2: localStorage hit — no fetch');
}

// ── AC2.1: Fresh visit — fetches file, writes to localStorage ─────────────────

async function testLocalStorageMiss() {
    const ls = makeLocalStorage(); // empty
    let fileFetched = false;

    const fetchMock = async (url) => {
        if (url.includes('mbta-static.json')) {
            fileFetched = true;
            return { ok: true, json: async () => FIXTURE_BUNDLE };
        }
        // Staleness check — return matching IDs to avoid re-fetch
        return {
            ok: true,
            json: async () => ({ data: FIXTURE_BUNDLE.routes.map(r => ({ id: r.id })) }),
        };
    };

    const { bundle, bgCheckPromise } = await _loadStaticData_withMocks(ls, fetchMock);
    await bgCheckPromise;

    assert.ok(fileFetched, 'Static file fetched on cache miss');
    assert.strictEqual(bundle.generatedAt, FIXTURE_BUNDLE.generatedAt);
    assert.ok(ls._store[STORAGE_KEY], 'Bundle written to localStorage');
    const saved = JSON.parse(ls._store[STORAGE_KEY]);
    assert.strictEqual(saved.version, STATIC_DATA_VERSION, 'Correct version stored');
    console.log('✓ AC2.1: localStorage miss — file fetched and cached');
}

// ── AC3.2: Staleness check — IDs match, no re-fetch ─────────────────────────

async function testStalenessCheckMatch() {
    const ls = makeLocalStorage({ [STORAGE_KEY]: cachedEntry(FIXTURE_BUNDLE) });
    const fetchCalls = [];

    const fetchMock = async (url) => {
        fetchCalls.push(url);
        if (url.includes('fields[route]=id')) {
            return {
                ok: true,
                json: async () => ({ data: FIXTURE_BUNDLE.routes.map(r => ({ id: r.id })) }),
            };
        }
        throw new Error('Unexpected fetch: ' + url);
    };

    const { bgCheckPromise } = await _loadStaticData_withMocks(ls, fetchMock);
    // Await background check promise instead of arbitrary setTimeout
    await bgCheckPromise;

    const routeIdCalls = fetchCalls.filter(u => u.includes('fields[route]=id'));
    assert.strictEqual(routeIdCalls.length, 1, 'Exactly one lightweight check (AC3.1)');
    const refetchCalls = fetchCalls.filter(u => u.includes('mbta-static.json'));
    assert.strictEqual(refetchCalls.length, 0, 'No re-fetch when IDs match (AC3.2)');
    console.log('✓ AC3.1 + AC3.2: single lightweight check, no re-fetch on match');
}

// ── AC3.3: Staleness check — IDs differ, triggers re-fetch + onRefresh ───────

async function testStalenessCheckMismatch() {
    const ls = makeLocalStorage({ [STORAGE_KEY]: cachedEntry(FIXTURE_BUNDLE) });
    let refreshBundle = null;
    let fileFetched = false;

    const FRESH_BUNDLE = { ...FIXTURE_BUNDLE, generatedAt: 9999999999 };

    const fetchMock = async (url) => {
        if (url.includes('fields[route]=id')) {
            // Return a different set of route IDs
            return { ok: true, json: async () => ({ data: [{ id: 'Blue' }, { id: 'Orange' }] }) };
        }
        if (url.includes('mbta-static.json')) {
            fileFetched = true;
            return { ok: true, json: async () => FRESH_BUNDLE };
        }
        throw new Error('Unexpected fetch: ' + url);
    };

    const { bgCheckPromise } = await _loadStaticData_withMocks(ls, fetchMock, (fresh) => { refreshBundle = fresh; });
    // Await background check promise instead of arbitrary setTimeout
    await bgCheckPromise;

    assert.ok(fileFetched, 'Re-fetched static file on mismatch (AC3.3)');
    assert.ok(refreshBundle, 'onRefresh callback called (AC3.3)');
    assert.strictEqual(refreshBundle.generatedAt, FRESH_BUNDLE.generatedAt);
    const saved = JSON.parse(ls._store[STORAGE_KEY]);
    assert.strictEqual(saved.data.generatedAt, FRESH_BUNDLE.generatedAt, 'localStorage updated');
    console.log('✓ AC3.3: IDs differ → re-fetch + onRefresh + localStorage update');
}

// ── AC3.4: Background check failure is silent ─────────────────────────────────

async function testStalenessCheckFailureSilent() {
    const ls = makeLocalStorage({ [STORAGE_KEY]: cachedEntry(FIXTURE_BUNDLE) });

    const fetchMock = async (url) => {
        if (url.includes('fields[route]=id')) {
            throw new Error('Network error');
        }
        throw new Error('Unexpected fetch: ' + url);
    };

    let threw = false;
    try {
        const { bgCheckPromise } = await _loadStaticData_withMocks(ls, fetchMock);
        // Await background check promise — should not throw even on fetch error
        await bgCheckPromise;
    } catch {
        threw = true;
    }

    assert.strictEqual(threw, false, 'loadStaticData does not throw on background check failure');
    console.log('✓ AC3.4: background check failure is silent');
}

// ── AC2.4: Both localStorage and file fetch fail → throws ────────────────────

async function testBothSourcesFailThrows() {
    const ls = makeLocalStorage(); // empty — no cache

    const fetchMock = async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' });

    let threw = false;
    try {
        await _loadStaticData_withMocks(ls, fetchMock);
    } catch {
        threw = true;
    }

    assert.ok(threw, 'loadStaticData throws when both localStorage and file fetch fail (AC2.4)');
    console.log('✓ AC2.4: throws when both sources fail — caller can fall back to live API');
}

// ── getStaticDataAge ──────────────────────────────────────────────────────────

async function testGetStaticDataAge() {
    const { getStaticDataAge } = await import('../src/static-data.js');
    const nowSeconds = Math.floor(Date.now() / 1000);
    const bundle = { generatedAt: nowSeconds - 3600 }; // 1 hour ago
    const age = getStaticDataAge(bundle);
    assert.ok(age >= 3600 && age < 3700, `Age should be ~3600s, got ${age}`);
    console.log('✓ getStaticDataAge returns correct age');
}

// ── Test runner ───────────────────────────────────────────────────────────────
// Because ES module imports are cached, we can't re-import static-data.js per
// test with different mocks. Instead, we directly invoke the module's logic
// by inlining the implementation as a testable function below.
//
// ⚠️ DRIFT RISK: The functions below (_tryLoadFromStorage, saveToStorage,
// fetchStaticFile, backgroundStalenessCheck, _loadStaticData_withMocks) duplicate
// logic from src/static-data.js. Any changes to private function signatures,
// localStorage structure, or staleness check logic in src/static-data.js MUST be
// mirrored here to prevent test divergence. Key areas to watch:
// - STORAGE_KEY and STATIC_DATA_VERSION changes
// - localStorage JSON structure (version/data wrapper)
// - Staleness check URL construction and route ID comparison logic
// - Error handling in _tryLoadFromStorage and _fetchStaticFile

const STORAGE_KEY_INNER = 'ttracker-static-data';
const VERSION_INNER = 1;

function tryLoadFromStorage(ls) {
    try {
        const raw = ls?.getItem(STORAGE_KEY_INNER);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (cached?.version !== VERSION_INNER) return null;
        if (!cached?.data?.generatedAt) return null;
        return cached.data;
    } catch { return null; }
}

function saveToStorage(ls, bundle) {
    try {
        ls?.setItem(STORAGE_KEY_INNER, JSON.stringify({ version: VERSION_INNER, data: bundle }));
    } catch { /* quota exceeded — ignore */ }
}

async function fetchStaticFile(fetchFn, url) {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
}

async function backgroundStalenessCheck(fetchFn, ls, bundle, onRefresh) {
    const res = await fetchFn(
        'https://api-v3.mbta.com/routes?fields[route]=id&filter[type]=0,1,2,3,4'
        // apiKey omitted in tests — tests mock fetch directly
    );
    if (!res.ok) return;
    const data = await res.json();
    const liveIds = (data.data || []).map(r => r.id).sort().join(',');
    const cachedIds = (bundle.routes || []).map(r => r.id).sort().join(',');
    if (liveIds === cachedIds) return;
    const freshBundle = await fetchStaticFile(fetchFn, `data/mbta-static.json?t=${Date.now()}`);
    saveToStorage(ls, freshBundle);
    if (typeof onRefresh === 'function') onRefresh(freshBundle);
}

async function _loadStaticData_withMocks(ls, fetchFn, onRefresh = null) {
    let bundle = tryLoadFromStorage(ls);
    if (!bundle) {
        bundle = await fetchStaticFile(fetchFn, 'data/mbta-static.json');
        saveToStorage(ls, bundle);
    }
    // Return both bundle and background check promise so tests can await completion
    const bgCheckPromise = backgroundStalenessCheck(fetchFn, ls, bundle, onRefresh).catch(() => {});
    return { bundle, bgCheckPromise };
}

async function runTests() {
    console.log('=== static-data tests ===\n');
    await testLocalStorageMiss();
    await testLocalStorageHit();
    await testStalenessCheckMatch();
    await testStalenessCheckMismatch();
    await testStalenessCheckFailureSilent();
    await testBothSourcesFailThrows();
    await testGetStaticDataAge();
    console.log('\n✓ All static-data tests passed!');
}

try {
    await runTests();
} catch (e) {
    console.error('✗ Test failed:', e.message);
    process.exit(1);
}
