// src/static-data.js
// Loads MBTA static data from localStorage cache or data/mbta-static.json.
// Runs a background staleness check after hydration.

const STORAGE_KEY = 'ttracker-static-data';
const STATIC_DATA_VERSION = 1;

/**
 * Load static MBTA data. Returns a hydrated bundle { generatedAt, routes, stops, routeStops }.
 * On fresh visit: fetches data/mbta-static.json, writes to localStorage.
 * On returning visit: reads from localStorage (version-checked).
 * After hydration: fires background staleness check (non-blocking).
 * Throws if both localStorage and file fetch fail (caller should fall back to live API).
 *
 * @param {Function|null} onRefresh - called with fresh bundle if staleness check detects change
 * @param {string} apiKey - MBTA API key appended to staleness check URL (prevents rate limiting)
 * @returns {Promise<{generatedAt: number, routes: Array, stops: Object, routeStops: Object}>}
 */
export async function loadStaticData(onRefresh = null, apiKey = '') {
    let bundle = _tryLoadFromStorage();

    if (!bundle) {
        bundle = await _fetchStaticFile('data/mbta-static.json');
        _saveToStorage(bundle);
    }

    // Fire background staleness check — do not await, must not block hydration
    _backgroundStalenessCheck(bundle, onRefresh, apiKey).catch(() => {
        // Failures are silent per AC3.4
    });

    return bundle;
}

/**
 * Returns age of the bundle in seconds since it was generated.
 * @param {{ generatedAt: number }} bundle
 * @returns {number}
 */
export function getStaticDataAge(bundle) {
    return Math.floor(Date.now() / 1000) - bundle.generatedAt;
}

// ── Private ──────────────────────────────────────────────────────────────────

function _tryLoadFromStorage() {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (cached?.version !== STATIC_DATA_VERSION) return null;
        if (!cached?.data?.generatedAt) return null;
        return cached.data;
    } catch {
        return null;
    }
}

function _saveToStorage(bundle) {
    try {
        globalThis.localStorage?.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: STATIC_DATA_VERSION, data: bundle })
        );
    } catch {
        // localStorage quota exceeded or unavailable — continue without caching
    }
}

async function _fetchStaticFile(url) {
    const res = await globalThis.fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
}

async function _backgroundStalenessCheck(bundle, onRefresh, apiKey) {
    // Fetch only route IDs — lightweight check (AC3.1)
    const keyParam = apiKey ? `&api_key=${apiKey}` : '';
    const res = await globalThis.fetch(
        `https://api-v3.mbta.com/routes?fields[route]=id&filter[type]=0,1,2,3,4${keyParam}`
    );
    if (!res.ok) return; // Silent failure per AC3.4

    const data = await res.json();
    const liveIds = (data.data || []).map(r => r.id).sort().join(',');
    const cachedIds = (bundle.routes || []).map(r => r.id).sort().join(',');

    if (liveIds === cachedIds) return; // AC3.2 — no further calls

    // Route set changed — re-fetch the static file (cache-busted) (AC3.3)
    const freshBundle = await _fetchStaticFile(`data/mbta-static.json?t=${Date.now()}`);
    _saveToStorage(freshBundle);
    if (typeof onRefresh === 'function') {
        onRefresh(freshBundle);
    }
}
