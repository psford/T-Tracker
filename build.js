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

// Copy static files
const rootFiles = ['index.html', 'styles.css', 'favicon.svg'];
rootFiles.forEach(file => {
    fs.copyFileSync(path.join(__dirname, file), path.join(DIST, file));
});

// Copy all src/*.js files
const srcFiles = fs.readdirSync(path.join(__dirname, 'src'))
    .filter(f => f.endsWith('.js'));
srcFiles.forEach(file => {
    fs.copyFileSync(
        path.join(__dirname, 'src', file),
        path.join(DIST, 'src', file)
    );
});

// Generate config.js from template with API key injected
const configContent = fs.readFileSync(
    path.join(__dirname, 'config.example.js'), 'utf-8'
).replaceAll('YOUR_API_KEY_HERE', API_KEY);

fs.writeFileSync(path.join(DIST, 'config.js'), configContent, 'utf-8');

console.log(`Build complete. API key injected. Output: dist/`);
console.log(`Files: ${rootFiles.length} root + ${srcFiles.length} src + config.js`);
