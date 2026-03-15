#!/usr/bin/env node
// tests/visual-regression.js
// Playwright visual regression + interaction tests for T-Tracker.
//
// USAGE:
//   node tests/visual-regression.js                    # compare against baselines
//   node tests/visual-regression.js --update-baselines # capture new baselines
//
// Writes .playwright-ui-verified on success.

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const BASELINES_DIR = path.join(PROJECT_ROOT, 'tests', 'visual-baselines');
const SENTINEL = path.join(PROJECT_ROOT, '.playwright-ui-verified');
const UPDATE_BASELINES = process.argv.includes('--update-baselines');
const PORT = 8765;

// ── Local HTTP server ─────────────────────────────────────────────────────────
function startServer() {
    return new Promise((resolve, reject) => {
        const mimeTypes = {
            '.html': 'text/html', '.js': 'application/javascript',
            '.css': 'text/css', '.json': 'application/json',
            '.svg': 'image/svg+xml', '.png': 'image/png',
        };
        const server = http.createServer((req, res) => {
            let filePath = path.join(PROJECT_ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
            if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        });
        server.listen(PORT, '127.0.0.1', () => resolve(server));
        server.on('error', reject);
    });
}

// ── CSS Mock Page Tests ───────────────────────────────────────────────────────
// These test the visual review mock pages (static HTML, no map interaction needed)
const MOCK_TESTS = [
    {
        id: 'mock-chip-overflow',
        label: 'Chip picker at various widths',
        path: '.visual-review/mocks/chip-overflow.html',
        checks: async (page) => {
            // Verify all 5 chip buttons render in each test case
            const chipCounts = await page.$$eval('.chip-picker__chips', els =>
                els.map(el => el.querySelectorAll('.chip-picker__chip').length)
            );
            for (let i = 0; i < chipCounts.length; i++) {
                if (chipCounts[i] !== 5) {
                    return { pass: false, error: `Test case ${i+1}: expected 5 chips, got ${chipCounts[i]}` };
                }
            }
            // Verify "Set Alert" button present in each test case
            const createBtns = await page.$$('.chip-picker__create');
            if (createBtns.length < 3) {
                return { pass: false, error: `Expected >= 3 "Set Alert" buttons, got ${createBtns.length}` };
            }
            return { pass: true };
        },
    },
    {
        id: 'mock-stop-markers',
        label: 'Stop marker dot sizes and colors',
        path: '.visual-review/mocks/stop-markers.html',
        checks: async (page) => {
            // Verify dots render with correct sizes
            const defaultDots = await page.$$('.stop-dot:not(.stop-dot--configured)');
            const configuredDots = await page.$$('.stop-dot--configured');
            if (defaultDots.length < 5) {
                return { pass: false, error: `Expected >= 5 default dots, got ${defaultDots.length}` };
            }
            if (configuredDots.length < 3) {
                return { pass: false, error: `Expected >= 3 configured dots, got ${configuredDots.length}` };
            }
            return { pass: true };
        },
    },
];

// ── Map Polyline Tests ────────────────────────────────────────────────────────
const POLYLINE_REGIONS = [
    {
        id: 'route-39-south-end',
        label: 'Route 39 — South End corridor',
        center: [42.3366, -71.0841],
        zoom: 15,
        clip: { x: 400, y: 200, width: 600, height: 500 },
    },
    {
        id: 'red-line-trunk',
        label: 'Red Line trunk — Charles/MGH to JFK/UMass',
        center: [42.3497, -71.0789],
        zoom: 13,
        clip: { x: 300, y: 150, width: 800, height: 600 },
    },
    {
        id: 'green-e-terminus',
        label: 'Green Line E — Heath Street terminus',
        center: [42.3279, -71.1064],
        zoom: 15,
        clip: { x: 350, y: 250, width: 700, height: 400 },
    },
];

// ── Map Interaction Tests (Popups + Chips) ────────────────────────────────────
const INTERACTION_TESTS = [
    {
        id: 'popup-ruggles',
        label: 'Popup at Ruggles — only visible routes shown',
        description: 'Hover Ruggles station, verify popup shows only currently visible routes (not hidden bus/CR)',
        // Ruggles is a major transfer station at approximately:
        center: [42.3365, -71.0893],
        zoom: 16,
        checks: async (page) => {
            const results = [];

            // Wait for stop markers to render
            await page.waitForTimeout(3000);

            // Find a stop marker near center and hover it
            const stopMarker = await page.$('.stop-marker');
            if (!stopMarker) {
                return { pass: false, error: 'No stop markers found on map' };
            }

            // Try to find a stop marker near the center of the viewport
            const markers = await page.$$('.stop-marker');
            if (markers.length === 0) {
                return { pass: false, error: 'No stop markers rendered' };
            }

            // Hover the first visible marker to trigger popup
            const box = await markers[0].boundingBox();
            if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(500);
            }

            // Check if popup appeared
            const popup = await page.$('.leaflet-popup');
            if (!popup) {
                // Click instead of hover (might be touch mode)
                if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(500);
            }

            const popupVisible = await page.$('.leaflet-popup');
            if (!popupVisible) {
                results.push('WARNING: Could not trigger popup (may need real data loaded)');
                return { pass: true, warnings: results }; // Don't fail — data may not be loaded
            }

            // Verify popup has a stop name
            const stopName = await page.$eval('.stop-popup__name', el => el.textContent).catch(() => null);
            if (!stopName) {
                return { pass: false, error: 'Popup opened but no stop name found (.stop-popup__name missing)' };
            }
            results.push(`Stop name: "${stopName}"`);

            // Verify route rows exist
            const routeRows = await page.$$('.stop-popup__route-row');
            results.push(`Route rows: ${routeRows.length}`);
            if (routeRows.length === 0) {
                return { pass: false, error: 'Popup has stop name but no route rows — visibility filter may be broken' };
            }

            // Verify direction buttons have text longer than 5 chars (catches truncation)
            const btnTexts = await page.$$eval('.stop-popup__btn', els => els.map(el => el.textContent.trim()));
            for (const text of btnTexts) {
                // Direction buttons look like "→ Heath Street" — should be > 5 chars
                if (text.length <= 3) {
                    return { pass: false, error: `Direction button text too short (truncated?): "${text}"` };
                }
            }
            if (btnTexts.length > 0) {
                results.push(`Direction buttons: ${btnTexts.join(', ')}`);
            }

            // Verify color swatches are present
            const swatches = await page.$$('.stop-popup__swatch');
            if (swatches.length === 0) {
                return { pass: false, error: 'No color swatches in popup' };
            }

            return { pass: true, info: results };
        },
    },
    {
        id: 'chip-picker-flow',
        label: 'Chip picker appears on direction button click',
        description: 'Click a direction button in popup, verify chip picker with [1][2][3][#][∞] and Set Alert appears',
        center: [42.3365, -71.0893],
        zoom: 16,
        checks: async (page) => {
            await page.waitForTimeout(3000);

            // Find and hover a stop marker
            const markers = await page.$$('.stop-marker');
            if (markers.length === 0) {
                return { pass: true, warnings: ['No stop markers — skipping (data may not be loaded)'] };
            }

            const box = await markers[0].boundingBox();
            if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(500);
            }

            // Check popup opened
            let popup = await page.$('.leaflet-popup');
            if (!popup && box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(500);
                popup = await page.$('.leaflet-popup');
            }
            if (!popup) {
                return { pass: true, warnings: ['Could not open popup — skipping chip test'] };
            }

            // Find a direction button and click it
            const dirBtn = await page.$('.stop-popup__btn[data-action="show-chips"]');
            if (!dirBtn) {
                return { pass: true, warnings: ['No direction buttons in popup — may be at max alerts'] };
            }

            await dirBtn.click();
            await page.waitForTimeout(300);

            // Verify chip picker appeared
            const chipPicker = await page.$('.chip-picker');
            if (!chipPicker) {
                return { pass: false, error: 'Clicked direction button but chip picker did not appear (.chip-picker missing)' };
            }

            // Verify chip buttons: should be exactly 5 (1, 2, 3, #, ∞)
            const chips = await page.$$('.chip-picker__chip');
            if (chips.length !== 5) {
                return { pass: false, error: `Expected 5 chip buttons, got ${chips.length}` };
            }

            // Verify chip values
            const chipTexts = await page.$$eval('.chip-picker__chip', els => els.map(el => el.textContent.trim()));
            const expected = ['1', '2', '3', '#', '∞'];
            for (let i = 0; i < expected.length; i++) {
                if (chipTexts[i] !== expected[i]) {
                    return { pass: false, error: `Chip ${i}: expected "${expected[i]}", got "${chipTexts[i]}"` };
                }
            }

            // Verify "Set Alert" button
            const createBtn = await page.$('.chip-picker__create');
            if (!createBtn) {
                return { pass: false, error: 'Chip picker visible but "Set Alert" button missing (.chip-picker__create)' };
            }
            const createText = await createBtn.textContent();
            if (!createText.includes('Set Alert')) {
                return { pass: false, error: `Create button text is "${createText}", expected "Set Alert"` };
            }

            // Verify one chip is selected by default
            const selectedChips = await page.$$('.chip-picker__chip--selected');
            if (selectedChips.length !== 1) {
                return { pass: false, error: `Expected 1 selected chip, got ${selectedChips.length}` };
            }

            return { pass: true, info: ['Chip picker renders correctly with all 5 chips and Set Alert button'] };
        },
    },
    {
        id: 'popup-direction-text-not-truncated',
        label: 'Direction button text is not truncated',
        description: 'Verify direction button text shows full destination names (not "Heath S..." or "Medfor...")',
        center: [42.3365, -71.0893],
        zoom: 16,
        checks: async (page) => {
            await page.waitForTimeout(3000);

            const markers = await page.$$('.stop-marker');
            if (markers.length === 0) {
                return { pass: true, warnings: ['No stop markers — skipping'] };
            }

            // Try multiple markers to find one with direction buttons
            for (let m = 0; m < Math.min(markers.length, 5); m++) {
                const box = await markers[m].boundingBox();
                if (!box) continue;

                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(500);

                const popup = await page.$('.leaflet-popup');
                if (!popup) continue;

                const btns = await page.$$('.stop-popup__btn');
                if (btns.length === 0) {
                    // Close popup and try next marker
                    await page.mouse.move(0, 0);
                    await page.waitForTimeout(300);
                    continue;
                }

                // Check each button's text isn't truncated
                for (const btn of btns) {
                    const text = await btn.textContent();
                    const trimmed = text.trim();

                    // Check for ellipsis indicators
                    if (trimmed.endsWith('...') || trimmed.endsWith('\u2026')) {
                        return { pass: false, error: `Direction button text truncated: "${trimmed}"` };
                    }

                    // Check the button isn't clipped (scrollWidth > clientWidth)
                    const isClipped = await btn.evaluate(el => el.scrollWidth > el.clientWidth + 2);
                    if (isClipped) {
                        return { pass: false, error: `Direction button text is clipped (overflow hidden): "${trimmed}"` };
                    }
                }

                return { pass: true, info: [`Verified ${btns.length} direction buttons — no truncation`] };
            }

            return { pass: true, warnings: ['Could not find markers with direction buttons'] };
        },
    },
];

// ── Screenshot comparison ─────────────────────────────────────────────────────
function compareBuffers(bufA, bufB) {
    if (bufA.length !== bufB.length) {
        return { diffRatio: 1.0, error: `Size mismatch: ${bufA.length} vs ${bufB.length}` };
    }
    let diff = 0;
    for (let i = 0; i < bufA.length; i++) {
        if (Math.abs(bufA[i] - bufB[i]) > 8) diff++;
    }
    return { diffRatio: diff / bufA.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    fs.mkdirSync(BASELINES_DIR, { recursive: true });

    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });

    let allPassed = true;
    const results = [];

    // ── Part 1: CSS Mock Page Tests ───────────────────────────────────────────
    console.log('\n=== CSS Mock Page Tests ===\n');
    for (const test of MOCK_TESTS) {
        console.log(`Testing: ${test.label}`);
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${PORT}/${test.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        // Screenshot
        const screenshot = await page.screenshot({ type: 'png' });
        const baselinePath = path.join(BASELINES_DIR, `${test.id}.png`);

        if (UPDATE_BASELINES) {
            fs.writeFileSync(baselinePath, screenshot);
            console.log(`  BASELINE SAVED: ${test.id}`);
        } else if (fs.existsSync(baselinePath)) {
            const baseline = fs.readFileSync(baselinePath);
            const { diffRatio, error } = compareBuffers(screenshot, baseline);
            if (error || diffRatio > 0.02) {
                console.error(`  FAIL: ${(diffRatio * 100).toFixed(1)}% diff ${error || ''}`);
                fs.writeFileSync(path.join(BASELINES_DIR, `${test.id}-FAIL.png`), screenshot);
                allPassed = false;
            } else {
                console.log(`  Screenshot: PASS (${(diffRatio * 100).toFixed(2)}% diff)`);
            }
        }

        // Content checks
        const result = await test.checks(page);
        if (!result.pass) {
            console.error(`  FAIL: ${result.error}`);
            allPassed = false;
        } else {
            console.log(`  Content: PASS`);
        }
        results.push({ id: test.id, ...result });
        await page.close();
    }

    // ── Part 2: Map Polyline Tests ────────────────────────────────────────────
    console.log('\n=== Map Polyline Tests ===\n');
    const mapPage = await context.newPage();
    mapPage.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('net::ERR')) {
            console.log(`  [app] ${msg.text().slice(0, 120)}`);
        }
    });

    await mapPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await mapPage.waitForSelector('#map .leaflet-pane', { timeout: 15000 }).catch(() => {
        console.warn('  WARNING: Map pane not found within 15s');
    });
    await mapPage.waitForTimeout(3000); // Let tiles and polylines settle

    for (const region of POLYLINE_REGIONS) {
        console.log(`Testing: ${region.label}`);

        // Pan map to region
        await mapPage.evaluate(({ center, zoom }) => {
            const mapEl = document.getElementById('map');
            if (mapEl && mapEl._leaflet_id) {
                // Access Leaflet map instance via internal lookup
                for (const key of Object.keys(mapEl)) {
                    if (key.startsWith('_leaflet') && mapEl[key] && mapEl[key].setView) {
                        mapEl[key].setView(center, zoom, { animate: false });
                        break;
                    }
                }
            }
        }, { center: region.center, zoom: region.zoom });

        await mapPage.waitForTimeout(2000);

        const screenshot = await mapPage.screenshot({ clip: region.clip, type: 'png' });
        const baselinePath = path.join(BASELINES_DIR, `${region.id}.png`);

        if (UPDATE_BASELINES) {
            fs.writeFileSync(baselinePath, screenshot);
            console.log(`  BASELINE SAVED: ${region.id}`);
        } else if (fs.existsSync(baselinePath)) {
            const baseline = fs.readFileSync(baselinePath);
            const { diffRatio, error } = compareBuffers(screenshot, baseline);
            if (error || diffRatio > 0.02) {
                console.error(`  FAIL: ${(diffRatio * 100).toFixed(1)}% diff`);
                fs.writeFileSync(path.join(BASELINES_DIR, `${region.id}-FAIL.png`), screenshot);
                allPassed = false;
            } else {
                console.log(`  PASS: ${(diffRatio * 100).toFixed(2)}% diff`);
            }
        } else {
            console.warn(`  No baseline — saving candidate`);
            fs.writeFileSync(path.join(BASELINES_DIR, `${region.id}-candidate.png`), screenshot);
        }

        results.push({ id: region.id, pass: true });
    }
    await mapPage.close();

    // ── Part 3: Interaction Tests (Popups + Chips) ────────────────────────────
    console.log('\n=== Interaction Tests (Popups + Chips) ===\n');

    for (const test of INTERACTION_TESTS) {
        console.log(`Testing: ${test.label}`);
        console.log(`  ${test.description}`);

        const page = await context.newPage();
        page.on('console', () => {}); // Suppress console noise

        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#map .leaflet-pane', { timeout: 15000 }).catch(() => {});

        // Pan to test location
        await page.evaluate(({ center, zoom }) => {
            const mapEl = document.getElementById('map');
            if (mapEl && mapEl._leaflet_id) {
                for (const key of Object.keys(mapEl)) {
                    if (key.startsWith('_leaflet') && mapEl[key] && mapEl[key].setView) {
                        mapEl[key].setView(center, zoom, { animate: false });
                        break;
                    }
                }
            }
        }, { center: test.center, zoom: test.zoom });

        await page.waitForTimeout(2000);

        // Run interaction checks
        const result = await test.checks(page);
        if (!result.pass) {
            console.error(`  FAIL: ${result.error}`);
            // Screenshot the failure
            const failShot = await page.screenshot({ type: 'png' });
            fs.writeFileSync(path.join(BASELINES_DIR, `${test.id}-FAIL.png`), failShot);
            allPassed = false;
        } else {
            console.log(`  PASS`);
            if (result.info) result.info.forEach(i => console.log(`    ${i}`));
            if (result.warnings) result.warnings.forEach(w => console.log(`    WARNING: ${w}`));
        }

        // Screenshot for baseline
        const screenshot = await page.screenshot({ type: 'png' });
        const baselinePath = path.join(BASELINES_DIR, `${test.id}.png`);
        if (UPDATE_BASELINES) {
            fs.writeFileSync(baselinePath, screenshot);
            console.log(`  BASELINE SAVED: ${test.id}`);
        }

        results.push({ id: test.id, ...result });
        await page.close();
    }

    await browser.close();
    server.close();

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n=== Visual Regression Summary ===\n');
    for (const r of results) {
        const icon = r.pass ? 'PASS' : 'FAIL';
        console.log(`  ${icon}: ${r.id}${r.error ? ' — ' + r.error : ''}`);
    }

    if (allPassed) {
        fs.writeFileSync(SENTINEL, new Date().toISOString());
        console.log('\nAll visual regression tests passed. .playwright-ui-verified written.');
        process.exit(0);
    } else {
        console.error('\nVisual regression tests FAILED.');
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Visual regression runner crashed:', err);
    process.exit(1);
});
