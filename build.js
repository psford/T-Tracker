// build.js — Cloudflare Pages build script
// Copies site to dist/ and injects MBTA_API_KEY into config.js

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const API_KEY = process.env.MBTA_API_KEY;

if (!API_KEY) {
    console.error('ERROR: MBTA_API_KEY environment variable is not set');
    process.exit(1);
}

// Clean and create dist/
if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'src'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });

// Copy static files
const rootFiles = ['index.html', 'styles.css', 'favicon.svg', 'manifest.json', 'sw.js'];
rootFiles.forEach(file => {
    fs.copyFileSync(path.join(__dirname, file), path.join(DIST, file));
});

// Copy and validate icons directory
const iconsDir = path.join(__dirname, 'icons');
const distIcons = path.join(DIST, 'icons');
fs.mkdirSync(distIcons, { recursive: true });

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const MIN_ICON_SIZE = 1024; // Valid 192x192+ PNGs are always > 1KB; broken renders are < 500 bytes

// Get required icons from manifest + apple-touch-icon
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));
const requiredIcons = [...new Set([
    ...(manifest.icons || []).map(entry => path.basename(entry.src)),
    'apple-touch-icon.png',
])];

const iconErrors = [];
for (const iconFile of requiredIcons) {
    const srcPath = path.join(iconsDir, iconFile);
    if (!fs.existsSync(srcPath)) {
        iconErrors.push(`Missing: ${iconFile}`);
        continue;
    }
    const stat = fs.statSync(srcPath);
    if (stat.size < MIN_ICON_SIZE) {
        iconErrors.push(`${iconFile}: ${stat.size} bytes (< ${MIN_ICON_SIZE}). Likely a broken render — regenerate with inline SVG, not file:// protocol.`);
        continue;
    }
    const fd = fs.openSync(srcPath, 'r');
    const header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    if (!header.subarray(0, 4).equals(PNG_MAGIC.subarray(0, 4))) {
        iconErrors.push(`${iconFile}: invalid PNG header (got 0x${header.subarray(0, 4).toString('hex')})`);
    }
}

if (iconErrors.length > 0) {
    console.error('ERROR: Icon validation failed:');
    iconErrors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
}

// All icons validated — copy
fs.readdirSync(iconsDir).filter(f => f.endsWith('.png')).forEach(file => {
    fs.copyFileSync(path.join(iconsDir, file), path.join(distIcons, file));
});
console.log(`Icons: ${requiredIcons.length} validated and copied`);

// Copy all src/*.js files
const srcFiles = fs.readdirSync(path.join(__dirname, 'src'))
    .filter(f => f.endsWith('.js'));
srcFiles.forEach(file => {
    fs.copyFileSync(
        path.join(__dirname, 'src', file),
        path.join(DIST, 'src', file)
    );
});

// Verify service worker fetch handler has origin guard
const swContent = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf-8');
if (swContent.includes('respondWith') && !swContent.includes('self.location.origin')) {
    console.error('ERROR: sw.js fetch handler intercepts requests without origin guard.');
    console.error('  respondWith(fetch()) on cross-origin SSE streams breaks EventSource streaming.');
    console.error('  The fetch handler must check: new URL(event.request.url).origin === self.location.origin');
    process.exit(1);
}

// Validate and copy data/mbta-static.json (required for app to function)
const staticDataSrc = path.join(__dirname, 'data', 'mbta-static.json');
if (!fs.existsSync(staticDataSrc)) {
    console.error('ERROR: data/mbta-static.json does not exist.');
    console.error('  Run: MBTA_API_KEY=<key> node scripts/fetch-mbta-data.mjs');
    process.exit(1);
}
fs.copyFileSync(staticDataSrc, path.join(DIST, 'data', 'mbta-static.json'));
console.log('Static data: data/mbta-static.json copied to dist/data/');

// Generate config.js from template with API key injected
const configContent = fs.readFileSync(
    path.join(__dirname, 'config.example.js'), 'utf-8'
).replaceAll('YOUR_API_KEY_HERE', API_KEY);

fs.writeFileSync(path.join(DIST, 'config.js'), configContent, 'utf-8');

console.log(`Build complete. API key injected. Output: dist/`);
console.log(`Files: ${rootFiles.length} root + ${srcFiles.length} src + config.js`);
