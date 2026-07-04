// collector/src/blob-appender.mjs — Azure Append Blob appender via REST + SAS
//
// No Azure SDK dependency: an append blob is created with a zero-length PUT
// (x-ms-blob-type: AppendBlob), then each flush is one Append Block call.
// Auth is a container-scoped SAS token supplied via environment — the
// collector never sees account keys.
//
// Azure Append Blob limits (50,000 blocks / 4 MiB per block) are far beyond
// this workload: one block per partition per flush ≈ 60 blocks per hourly file.

/**
 * Creates an appender targeting an Azure blob container.
 *
 * @param {Object} options
 * @param {string} options.containerUrl — e.g. "https://acct.blob.core.windows.net/mbta-raw"
 * @param {string} options.sasToken — SAS query string WITHOUT leading '?'
 *   (needs racwl on the container: read to check existence not required — create/add/write suffice)
 * @param {Function} [options.fetchImpl] — injectable for tests (default global fetch)
 * @returns {{ append: Function }}
 */
export function createBlobAppender({ containerUrl, sasToken, fetchImpl = fetch }) {
    const base = containerUrl.replace(/\/+$/, '');

    function blobUrl(path, params = '') {
        return `${base}/${path}?${sasToken}${params}`;
    }

    async function createAppendBlob(path) {
        const res = await fetchImpl(blobUrl(path), {
            method: 'PUT',
            headers: {
                'x-ms-blob-type': 'AppendBlob',
                'x-ms-version': '2021-08-06',
                'Content-Length': '0',
            },
        });
        // 201 = created; 409 = already exists (race with another flush) — both fine
        if (!res.ok && res.status !== 409) {
            throw new Error(`Create append blob failed: ${res.status} ${await res.text()}`);
        }
    }

    async function appendBlock(path, buf) {
        return fetchImpl(blobUrl(path, '&comp=appendblock'), {
            method: 'PUT',
            headers: {
                'x-ms-version': '2021-08-06',
                'Content-Length': String(buf.length),
            },
            body: buf,
        });
    }

    return {
        async append(path, buf) {
            let res = await appendBlock(path, buf);
            if (res.status === 404) {
                // Blob doesn't exist yet (first write of this hour) — create, retry once
                await createAppendBlob(path);
                res = await appendBlock(path, buf);
            }
            if (!res.ok) {
                throw new Error(`Append block failed for ${path}: ${res.status} ${await res.text()}`);
            }
        },
    };
}
