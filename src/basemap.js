// src/basemap.js — the basemap provider seam.
//
// One place in the app knows how to turn a provider descriptor from config into a
// MapLibre style. Changing basemap provider is a config edit; nothing under src/
// should need to change to point the map at a different supplier.
//
// This module exists because it did not. T-Tracker hardcoded a CARTO raster URL,
// CARTO retired the keyless endpoint without warning, and the live site was defaced
// with "API KEY REQUIRED" watermarks until someone edited application code.

/**
 * Expands a Leaflet-style {s} subdomain placeholder into one URL per subdomain.
 * MapLibre has no {s} token — it round-robins across the tiles[] array instead.
 *
 * @param {string} url — tile URL template, possibly containing {s}
 * @param {string|string[]} [subdomains] — e.g. 'abcd' or ['a','b','c','d']
 * @returns {string[]} — one template per subdomain, or [url] if there is no {s}
 */
export function expandSubdomains(url, subdomains) {
    if (!url.includes('{s}')) return [url];

    const list = typeof subdomains === 'string' ? subdomains.split('') : (subdomains || []);
    if (list.length === 0) {
        throw new Error(
            `[basemap] tile url contains {s} but no subdomains were configured: ${url}`
        );
    }
    return list.map(s => url.replace('{s}', s));
}

/**
 * Builds the `style` value to hand MapLibre from a basemap provider descriptor.
 *
 * A vector provider is already a MapLibre style document, so its URL passes straight
 * through. A raster provider is a tile template, so we wrap it in the minimal style
 * document that renders it.
 *
 * @param {object} basemap — config.basemap
 * @param {'vector'|'raster'} basemap.kind
 * @param {string} [basemap.style] — style JSON URL; required when kind is 'vector'
 * @param {string} [basemap.url] — {z}/{x}/{y} template; required when kind is 'raster'
 * @param {string|string[]} [basemap.subdomains] — only meaningful for {s} templates
 * @param {string} [basemap.attribution]
 * @param {number} [basemap.maxZoom] — highest zoom the provider has tiles for
 * @param {number} [basemap.tileSize] — raster only; defaults to 256
 * @returns {string|object} — a style URL (vector) or a style document (raster)
 */
export function buildBasemapStyle(basemap) {
    if (!basemap || typeof basemap !== 'object') {
        throw new Error('[basemap] config.basemap is missing — see config.example.js');
    }

    const { kind } = basemap;

    if (kind === 'vector') {
        if (!basemap.style) {
            throw new Error("[basemap] kind 'vector' requires a style URL");
        }
        return basemap.style;
    }

    if (kind === 'raster') {
        if (!basemap.url) {
            throw new Error("[basemap] kind 'raster' requires a {z}/{x}/{y} url template");
        }
        return {
            version: 8,
            sources: {
                basemap: {
                    type: 'raster',
                    tiles: expandSubdomains(basemap.url, basemap.subdomains),
                    tileSize: basemap.tileSize || 256,
                    attribution: basemap.attribution || '',
                    ...(basemap.maxZoom ? { maxzoom: basemap.maxZoom } : {}),
                },
            },
            layers: [
                { id: 'basemap', type: 'raster', source: 'basemap' },
            ],
        };
    }

    throw new Error(
        `[basemap] unknown kind ${JSON.stringify(kind)} — expected 'vector' or 'raster'`
    );
}

/**
 * How many zoom levels this provider's tiles are offset from the 256px convention.
 *
 * Zoom is not comparable across tile sizes. A vector style ships 512px tiles, so it
 * covers the same ground at zoom N that a 256px raster provider covers at N+1 —
 * measured, not assumed: MapLibre z11 and Leaflet z12 both span 0.4395 degrees of
 * longitude across a 1280px viewport.
 *
 * config.map keeps meaning what it has always meant. This is what stops a provider
 * swap from quietly rescaling the whole app.
 *
 * @param {object} basemap — config.basemap
 * @returns {number} — levels to subtract from a configured zoom
 */
export function zoomOffset(basemap) {
    const tileSize = basemap?.tileSize || (basemap?.kind === 'vector' ? 512 : 256);
    return Math.log2(tileSize / 256);
}

/**
 * Translates a zoom expressed in the app's terms into this provider's terms.
 *
 * @param {object} basemap — config.basemap
 * @param {number} zoom — a zoom from config.map
 * @returns {number}
 */
export function resolveZoom(basemap, zoom) {
    return zoom - zoomOffset(basemap);
}

/**
 * The highest zoom the map should allow.
 *
 * The provider's ceiling wins when it is lower than the app's: a raster provider that
 * stops at z16 (Esri's Dark Gray Canvas, for one) renders blank tiles above its own
 * limit, which reads as a broken map rather than a provider limit. Vector styles
 * overzoom cleanly, so the app's preference stands unless the provider states a lower
 * cap of its own.
 *
 * @param {object} basemap — config.basemap
 * @param {number} appMaxZoom — config.map.maxZoom
 * @returns {number}
 */
export function resolveMaxZoom(basemap, appMaxZoom) {
    const appMax = resolveZoom(basemap, appMaxZoom);
    const providerMax = basemap?.maxZoom;
    if (typeof providerMax !== 'number') return appMax;
    return Math.min(providerMax, appMax);
}
