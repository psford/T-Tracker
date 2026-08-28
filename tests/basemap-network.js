#!/usr/bin/env node
// tests/basemap-network.js — TT-1.1 AC1.
//
// Asserts on the REQUEST LOG, not on config. Reading config back proves only that
// config says what config says; it proves nothing about what the map fetched, and
// the bug this whole epic exists for was a request going somewhere nobody checked.
//
// Also smoke-tests the port end to end: a map that requests the right tiles but
// renders no routes, vehicles or stops is not a working map.
//
// USAGE:
//   node tests/basemap-network.js
//
// This repo has no package.json and no node_modules by design, so a bare
// `import from 'playwright'` does not resolve here — tests/visual-regression.js has
// the same import and the same problem. Point PLAYWRIGHT_MODULE at an install to run
// it without adding a dependency to a repo that deliberately has none:
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs \
//     node tests/basemap-network.js
//
// Exits non-zero on failure.
const { firefox } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const PORT = 8766;

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const rel = req.url === '/' ? 'index.html' : req.url.split('?')[0];
            const filePath = path.join(PROJECT_ROOT, rel);
            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404); res.end('Not found'); return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        });
        server.listen(PORT, '127.0.0.1', () => resolve(server));
        server.on('error', reject);
    });
}

const failures = [];
function check(ok, label) {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} — ${label}`);
    if (!ok) failures.push(label);
}

const server = await startServer();
const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

const hosts = new Map();
const pageErrors = [];
page.on('request', (r) => {
    const host = new URL(r.url()).host;
    hosts.set(host, (hosts.get(host) || 0) + 1);
});
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(15000);   // let tiles, SSE vehicles and hydration settle

    const configuredHost = await page.evaluate(async () => {
        const { config } = await import('/config.js');
        const target = config.basemap.style || config.basemap.url;
        return new URL(target.replace('{s}', 'a')).host;
    });

    console.log('\nAC1 — request hosts:');
    for (const [h, n] of [...hosts].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(4)}  ${h}`);
    }
    console.log('');

    check(![...hosts.keys()].some(h => h.includes('cartocdn')),
        'no request goes to basemaps.cartocdn.com');
    check([...hosts.keys()].some(h => h === configuredHost),
        `tiles are requested from the configured provider (${configuredHost})`);

    const state = await page.evaluate(() => {
        const map = document.getElementById('map')?.__maplibreMap;
        if (!map) return null;
        return {
            styleLoaded: map.isStyleLoaded(),
            hasRouteLayer: !!map.getLayer('route-lines'),
            vehicleMarkers: document.querySelectorAll('.vehicle-marker').length,
            stopMarkers: document.querySelectorAll('.stop-marker').length,
            canvas: !!document.querySelector('#map .maplibregl-canvas'),
        };
    });

    console.log('smoke — the map actually rendered:');
    check(state !== null, 'map instance is reachable on its container');
    check(!!state?.styleLoaded, 'basemap style loaded');
    check(!!state?.canvas, 'MapLibre canvas is in the DOM');
    check(!!state?.hasRouteLayer, 'route line layer exists');
    check((state?.vehicleMarkers ?? 0) > 0, `vehicle markers rendered (${state?.vehicleMarkers ?? 0})`);
    check((state?.stopMarkers ?? 0) > 0, `stop markers rendered (${state?.stopMarkers ?? 0})`);
    check(pageErrors.length === 0, `no page errors (${pageErrors.length})`);
    if (pageErrors.length) pageErrors.slice(0, 10).forEach(e => console.log(`       ${e}`));
} finally {
    await browser.close();
    server.close();
}

console.log(`\n${failures.length === 0 ? 'PASS' : `FAIL — ${failures.length} check(s)`}`);
process.exit(failures.length === 0 ? 0 : 1);
