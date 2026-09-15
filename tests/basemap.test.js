// tests/basemap.test.js — TT-1.1 AC2: the basemap provider seam.
//
// The point of these tests is that they are written entirely from outside src/.
// Every descriptor is passed in as an argument. If swapping provider ever required
// editing a file under src/, these tests could not be written at all.
import assert from 'assert';
import { test } from 'node:test';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildBasemapStyle, expandSubdomains, resolveMaxZoom, resolveZoom, zoomOffset } from '../src/basemap.js';

const SHADOW = {
    kind: 'vector',
    style: 'https://tiles.versatiles.org/assets/styles/shadow/style.json',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
};

test('AC2: a vector descriptor hands MapLibre the style URL it names', () => {
    assert.strictEqual(buildBasemapStyle(SHADOW), SHADOW.style);
});

test('AC2: a raster descriptor becomes a raster style, with no code change', () => {
    const style = buildBasemapStyle({
        kind: 'raster',
        url: 'https://example.test/{z}/{x}/{y}.png',
        attribution: 'Example',
        maxZoom: 16,
    });

    assert.strictEqual(typeof style, 'object', 'raster providers need a style document');
    assert.strictEqual(style.sources.basemap.type, 'raster');
    assert.deepStrictEqual(style.sources.basemap.tiles, ['https://example.test/{z}/{x}/{y}.png']);
    assert.strictEqual(style.sources.basemap.maxzoom, 16);
    assert.strictEqual(style.layers[0].type, 'raster');
    assert.strictEqual(style.layers[0].source, 'basemap');
});

test('AC2: a {s} template expands to one tile URL per subdomain', () => {
    // Leaflet's {s} token has no MapLibre equivalent; MapLibre round-robins tiles[].
    // The old CARTO config used exactly this shape, so a swap back to any Leaflet-era
    // raster provider has to keep working.
    assert.deepStrictEqual(
        expandSubdomains('https://{s}.example.test/{z}/{x}/{y}.png', 'abc'),
        [
            'https://a.example.test/{z}/{x}/{y}.png',
            'https://b.example.test/{z}/{x}/{y}.png',
            'https://c.example.test/{z}/{x}/{y}.png',
        ]
    );

    assert.deepStrictEqual(
        expandSubdomains('https://{s}.example.test/{z}/{x}/{y}.png', ['a', 'b']),
        ['https://a.example.test/{z}/{x}/{y}.png', 'https://b.example.test/{z}/{x}/{y}.png']
    );

    // No {s} means one URL, and subdomains are irrelevant rather than an error.
    assert.deepStrictEqual(
        expandSubdomains('https://example.test/{z}/{x}/{y}.png', 'abc'),
        ['https://example.test/{z}/{x}/{y}.png']
    );
});

test('a {s} template with no subdomains fails loudly rather than requesting {s}.host', () => {
    assert.throws(
        () => expandSubdomains('https://{s}.example.test/{z}/{x}/{y}.png', undefined),
        /subdomains/,
        'silently requesting the literal host "{s}.example.test" is a broken map with no error'
    );
});

test("AC2: the provider's zoom ceiling reaches the map when it is lower than the app's", () => {
    // Esri Dark Gray Canvas stops at z16. Above its ceiling it serves nothing, which
    // reads as a broken map rather than a provider limit — so the provider wins.
    assert.strictEqual(resolveMaxZoom({ kind: 'raster', maxZoom: 16 }, 18), 16);

    // A provider that goes higher than the app wants does not raise the app's limit.
    assert.strictEqual(resolveMaxZoom({ kind: 'raster', maxZoom: 22 }, 18), 18);

    // A vector provider states no ceiling, but its 512px tiles still shift the scale,
    // so the app's 18 becomes 17 in the provider's terms.
    assert.strictEqual(resolveMaxZoom({ kind: 'vector' }, 18), 17);
});

test('zoom is translated into the provider\'s terms, so a swap keeps the same view', () => {
    // Measured against the running app, not assumed: MapLibre at z11 and Leaflet at
    // z12 both span 0.4395 degrees of longitude across a 1280px viewport. A vector
    // style ships 512px tiles, so every configured zoom is one level tighter unless
    // something corrects for it — which is how the whole app silently zoomed in.
    assert.strictEqual(zoomOffset({ kind: 'vector' }), 1);
    assert.strictEqual(zoomOffset({ kind: 'raster' }), 0);
    assert.strictEqual(zoomOffset({ kind: 'raster', tileSize: 512 }), 1);

    // config.map keeps meaning what it always meant, whoever supplies the tiles.
    assert.strictEqual(resolveZoom(SHADOW, 12), 11);
    assert.strictEqual(resolveZoom({ kind: 'raster', url: 'x' }, 12), 12);

    // The point of the seam: the same configured view survives a provider swap.
    const vectorView = resolveZoom({ kind: 'vector' }, 12);
    const rasterView = resolveZoom({ kind: 'raster' }, 12);
    assert.strictEqual(
        2 ** vectorView * 512, 2 ** rasterView * 256,
        'both providers should cover the same ground at the app\'s configured zoom'
    );
});

test('a malformed descriptor is refused with a message naming the problem', () => {
    assert.throws(() => buildBasemapStyle(undefined), /config\.basemap is missing/);
    assert.throws(() => buildBasemapStyle({ kind: 'vector' }), /requires a style URL/);
    assert.throws(() => buildBasemapStyle({ kind: 'raster' }), /requires a .* url template/);
    assert.throws(() => buildBasemapStyle({ kind: 'wms' }), /unknown kind "wms"/);
});

// TT-1.4 AC4 — a stale "the app renders on Leaflet / CartoDB" claim misleads the next
// session silently: nothing errors, nobody notices, and the wrong mental model spreads.
// This scans every tracked file (outside the dated history directories, which are
// allowed to describe what was true when they were written) for a mention of Leaflet
// or CARTO, and requires each one to be either fixed to describe the current renderer
// (MapLibre GL + VersaTiles Shadow) or explicitly marked as historical.
//
// "Marked as historical" means the word "history" appears on the same line, or —
// for a Markdown file — in the nearest heading above it. A file with no Markdown
// headings of its own (every .js/.css/.html file here) has no closer heading than
// its own leading comment block, so that block, if it says "history", governs every
// line below it — the same way an H1 with no other heading governs a whole document.
test('no live file describes Leaflet or CARTO as the current renderer or basemap', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const HISTORY_DIRS = [
        'docs/design-plans/',
        'docs/implementation-plans/',
        'docs/test-plans/',
        'docs/retro-archive/',
    ];
    const MENTION = /leaflet|carto/i;
    const HISTORY = /history/i;
    const MD_HEADING = /^#{1,6}\s+(.*)$/;

    // The leading run of blank/comment lines at the top of a non-Markdown file —
    // its only "heading", in the absence of any closer one.
    function leadingHeader(lines) {
        let header = '';
        let inBlock = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (inBlock) {
                header += line + '\n';
                if (trimmed.includes('*/') || trimmed.includes('-->')) inBlock = false;
                continue;
            }
            if (trimmed === '' || trimmed.startsWith('#!') || trimmed.startsWith('//')) {
                header += line + '\n';
                continue;
            }
            if (trimmed.startsWith('/*') || trimmed.startsWith('<!--')) {
                header += line + '\n';
                if (!trimmed.includes('*/') && !trimmed.includes('-->')) inBlock = true;
                continue;
            }
            break; // first line of real content ends the header
        }
        return header;
    }

    const files = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .filter((f) => !HISTORY_DIRS.some((dir) => f.startsWith(dir)));

    const violations = [];

    for (const file of files) {
        let content;
        try {
            content = readFileSync(path.join(repoRoot, file), 'utf8');
        } catch {
            continue; // tracked but not present in this checkout (e.g. a submodule) — not this test's concern
        }
        const lines = content.split('\n');
        const isMarkdown = file.endsWith('.md');
        const fileGovernedByHistory = !isMarkdown && HISTORY.test(leadingHeader(lines));

        let currentHeading = '';
        lines.forEach((line, idx) => {
            if (isMarkdown) {
                const heading = line.match(MD_HEADING);
                if (heading) currentHeading = heading[1];
            }
            if (!MENTION.test(line)) return;
            if (HISTORY.test(line)) return;
            if (isMarkdown && HISTORY.test(currentHeading)) return;
            if (fileGovernedByHistory) return;
            violations.push(`${file}:${idx + 1}: ${line.trim()}`);
        });
    }

    assert.deepStrictEqual(
        violations,
        [],
        `Leaflet/CARTO mentioned without a history marker, in ${new Set(violations.map((v) => v.split(':')[0])).size} file(s):\n${violations.join('\n')}`
    );
});
