// config.example.js — Configuration template
// Copy to config.js and replace YOUR_API_KEY_HERE with your MBTA API key
// Get a free key at https://api-v3.mbta.com
// Streams: Light Rail (Green), Heavy Rail (Red/Orange/Blue), Commuter Rail, Bus, Ferry

// GitHub Actions secret required for CI:
//   Repository Settings → Secrets and variables → Actions → New repository secret
//   Name: MBTA_API_KEY
//   Value: your MBTA V3 API key (get one at https://api-v3.mbta.com/)
//
// Local development: copy this file to config.js and replace YOUR_API_KEY_HERE

export const config = {
    api: {
        key: 'YOUR_API_KEY_HERE',
        baseUrl: 'https://api-v3.mbta.com',
    },
    map: {
        center: [42.3601, -71.0589], // Boston
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
    },
    // Basemap provider. Swapping supplier is a change HERE and nowhere else —
    // src/basemap.js turns this descriptor into a MapLibre style, and nothing else
    // in the app knows who supplies the tiles.
    //
    // kind: 'vector' — style is a MapLibre style JSON URL.
    // kind: 'raster' — url is a {z}/{x}/{y} tile template; {s} subdomains supported.
    //
    // A raster provider needs no code change, only this block. For example:
    //   basemap: {
    //       kind: 'raster',
    //       url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    //       attribution: 'Tiles &copy; Esri',
    //       maxZoom: 16,
    //   }
    basemap: {
        kind: 'vector',
        style: 'https://tiles.versatiles.org/assets/styles/shadow/style.json',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles by <a href="https://versatiles.org">VersaTiles</a>',
        maxZoom: 18,
    },
    routes: {
        defaultVisible: ['Green-B', 'Green-C', 'Green-D', 'Green-E', 'Red', 'Orange', 'Blue'],
    },
    animation: {
        interpolationDuration: 800,
        fadeInDuration: 200,
        fadeOutDuration: 200,
        snapThreshold: 100, // meters — snap instead of animate above this
    },
};
