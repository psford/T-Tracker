// collector/src/sink.mjs — Buffering JSONL sink with gzip-member flushes
//
// Records are buffered per partition path and flushed on an interval (or
// explicitly). Each flush gzips that partition's buffered lines into ONE gzip
// member and appends it via the configured appender. Concatenated gzip members
// form a valid multi-member gzip file — `gunzip`, DuckDB, and zlib all read
// them transparently — which is what makes append-only blob storage work
// without ever rewriting a file.

import { gzipSync } from 'node:zlib';

/**
 * Creates a buffering sink.
 *
 * @param {Object} options
 * @param {Object} options.appender — { append(path: string, buf: Buffer): Promise<void> }
 * @param {number} [options.flushIntervalMs] — periodic flush interval (default 60s)
 * @param {Function} [options.onError] — callback(err, path) on failed append;
 *   failed partitions retain their lines and retry next flush
 * @returns {{ write: Function, flush: Function, start: Function, stop: Function, pendingCount: Function }}
 */
export function createSink({ appender, flushIntervalMs = 60_000, onError = () => {} }) {
    /** @type {Map<string, string[]>} partition path → buffered JSONL lines */
    const buffers = new Map();
    let timer = null;
    let flushing = Promise.resolve();

    function write(path, record) {
        if (!buffers.has(path)) {
            buffers.set(path, []);
        }
        buffers.get(path).push(JSON.stringify(record));
    }

    async function flushNow() {
        const entries = [...buffers.entries()].filter(([, lines]) => lines.length > 0);
        buffers.clear();
        for (const [path, lines] of entries) {
            const member = gzipSync(lines.join('\n') + '\n');
            try {
                await appender.append(path, member);
            } catch (err) {
                // Put the lines back (in front of anything buffered meanwhile)
                // so data survives transient append failures.
                const existing = buffers.get(path) ?? [];
                buffers.set(path, [...lines, ...existing]);
                onError(err, path);
            }
        }
    }

    function flush() {
        // Serialize flushes so overlapping timer/shutdown flushes can't
        // interleave appends to the same partition.
        flushing = flushing.then(flushNow);
        return flushing;
    }

    return {
        write,
        flush,
        start() {
            if (timer) return;
            timer = setInterval(flush, flushIntervalMs);
        },
        async stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            await flush();
        },
        /** Number of buffered (unflushed) lines across all partitions. */
        pendingCount() {
            let n = 0;
            for (const lines of buffers.values()) n += lines.length;
            return n;
        },
    };
}
