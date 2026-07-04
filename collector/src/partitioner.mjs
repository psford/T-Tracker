// collector/src/partitioner.mjs — Blob/file partition paths for raw logs (pure)
//
// Layout (per design plan 2026-07-04):
//   mbta-raw:             {route}/{yyyy-MM-dd}/{HH}.jsonl.gz
//   mbta-predictions-raw: {route}/{yyyy-MM-dd}/{HH}.jsonl.gz
//   collector meta (gaps): _meta/{yyyy-MM-dd}/{HH}.jsonl.gz

/**
 * Formats a UTC date/hour partition suffix for a timestamp.
 *
 * @param {number} tsMs — epoch milliseconds
 * @returns {string} e.g. "2026-07-04/21"
 */
export function datePartition(tsMs) {
    const d = new Date(tsMs);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}/${hh}`;
}

/**
 * Builds the partition path for a record.
 *
 * Route IDs come from the MBTA API and are used verbatim as path segments;
 * anything outside [A-Za-z0-9_-] is replaced so a malformed ID can never
 * escape the partition root.
 *
 * @param {string} routeId — MBTA route ID (e.g. "Green-E"), or "_meta"
 * @param {number} tsMs — epoch milliseconds
 * @returns {string} e.g. "Green-E/2026-07-04/21.jsonl.gz"
 */
export function partitionPath(routeId, tsMs) {
    const safeRoute = String(routeId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
    return `${safeRoute}/${datePartition(tsMs)}.jsonl.gz`;
}
