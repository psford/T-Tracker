# TT-1.2 — streamdeck displays on MapLibre

`streamdeck-display.html` (494 lines) and `streamdeck-display-v2.html` (429 lines) are
standalone pages with their own map setup. They share no code with `src/map.js`, which
is why this is a separate story — but it also means nothing in TT-1.1's test suite
covers them.

Read both files first. They are not the same page at two versions; establish what each
does before porting either.

## AC1 / AC2 — no CARTO, no Leaflet

Static assertion over both files: neither contains `basemaps.cartocdn.com` nor loads
Leaflet from any CDN. A grep-style test is adequate here and honest about what it
proves — it proves the old dependency is gone, not that the new one works. AC3 and AC4
carry that.

Assert on both files by globbing `streamdeck-display*.html` rather than naming them,
so a third display added later is covered rather than silently skipped.

## AC3 — both read the shared descriptor

The point of the story: two more places that hardcoded a tile URL now go through the
same seam. Load each page in Playwright against the local server with a test config
whose `basemap` names a distinctive host, and assert the page requests tiles from that
host.

Fails if: a page is ported to MapLibre but keeps its own hardcoded style URL — which
still satisfies AC1 and AC2 while leaving the second copy of the original bug in place.
This is the criterion that matters most in this story.

## AC4 — manual, Firefox

Capture each display before the port and after, at the viewport the display is actually
used at, and compare by eye. This is a renderer swap; visible change is a defect, not
an improvement. Note that the basemap itself legitimately changes appearance — the
judgement is about the display's own chrome, layout and data rendering.

## Regression surface

The streamdeck pages are not covered by the unit suite at all. If either page has logic
worth keeping correct beyond rendering, say so when read, and file it rather than
absorbing it into this story.
