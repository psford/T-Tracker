// src/route-stops-cache.js
// Pure cache module for route-stops mapping. No DOM, no network, no app imports.

const STORAGE_KEY = 'ttracker-route-stops-cache';
const CACHE_VERSION = 2; // bumped to invalidate caches with unfiltered variant stops
const DEFAULT_TTL_MS = 86_400_000; // 24 hours

function readCache() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || parsed.version !== CACHE_VERSION) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

function writeCache(cache) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
        // Quota exceeded — silently fail, fetch from API next time
    }
}

export function getCachedRouteStops(routeIds, ttlMs = DEFAULT_TTL_MS) {
    const cached = new Map();
    const uncached = [];
    const cache = readCache();
    const now = Date.now();

    for (const routeId of routeIds) {
        const entry = cache?.routes?.[routeId];
        if (entry && Array.isArray(entry.stopIds) && typeof entry.cachedAt === 'number' && (now - entry.cachedAt) < ttlMs) {
            cached.set(routeId, new Set(entry.stopIds));
        } else {
            uncached.push(routeId);
        }
    }

    return { cached, uncached };
}

export function setCachedRouteStops(routeId, stopIds) {
    let cache = readCache();
    if (!cache) {
        cache = { version: CACHE_VERSION, routes: {} };
    }
    cache.routes[routeId] = {
        stopIds: Array.isArray(stopIds) ? stopIds : [...stopIds],
        cachedAt: Date.now(),
    };
    writeCache(cache);
}

export function clearRouteStopsCache() {
    localStorage.removeItem(STORAGE_KEY);
}
