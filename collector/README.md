# MBTA Data Collector

Always-on collector for raw MBTA vehicle positions and predictions.
Design: [docs/design-plans/2026-07-04-mbta-data-collector.md](../docs/design-plans/2026-07-04-mbta-data-collector.md)

Phase 1 scope: raw capture only — SSE vehicle events and polled predictions to
gzipped JSONL, partitioned `{route}/{yyyy-MM-dd}/{HH}.jsonl.gz`, with `_meta/`
gap records for unobserved windows. No derivation, no SQL (that's Phase 2).

Zero npm dependencies, same as the rest of the repo. Requires Node 18+.

## Run locally (filesystem sink)

```sh
MBTA_API_KEY=your-key node collector/collector.mjs
```

Output lands in `./out/mbta-raw/` and `./out/mbta-predictions-raw/`.
Inspect: `gunzip -c out/mbta-raw/Green-E/2026-07-04/21.jsonl.gz | head`
(files are multi-member gzip — gunzip/zcat/DuckDB read them natively).

## Run against Azure (blob sink)

```sh
SINK=blob \
MBTA_API_KEY=... \
RAW_CONTAINER_URL=https://<acct>.blob.core.windows.net/mbta-raw \
PREDICTIONS_CONTAINER_URL=https://<acct>.blob.core.windows.net/mbta-predictions-raw \
BLOB_SAS='<container SAS, no leading ?>' \
node collector/collector.mjs
```

The SAS needs `acw` (add/create/write) on both containers. No account keys.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MBTA_API_KEY` | — (required) | MBTA V3 API key |
| `ROUTES` | `Green-B,Green-C,Green-D,Green-E` | Routes to capture |
| `SINK` | `fs` | `fs` or `blob` |
| `OUT_DIR` | `./out` | fs sink root |
| `FLUSH_INTERVAL_MS` | `60000` | Buffer flush cadence |
| `ENABLE_PREDICTIONS_LOG` | `true` | Predictions capture on/off (portal toggle, no deploy) |
| `PREDICTIONS_INTERVAL_MS` | `60000` | Predictions poll cadence |

## Tests

```sh
node collector/tests/sse-parser.test.js
node collector/tests/partitioner.test.js
node collector/tests/flatten.test.js
node collector/tests/sink.test.js
node collector/tests/sse-client.test.js
node collector/tests/predictions-poller.test.js
```
