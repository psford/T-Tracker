# TT-1.3 — record the basemap and renderer decisions

This story writes documentation, so be honest about what a test can prove. A test can
prove a decision was recorded and that no stale claim survives. It cannot prove the
recorded reasoning is good. Do not dress up presence checks as more than that.

## AC1 / AC2 / AC3 — decisions.md content

Assert on `docs/decisions.md`:

- A DECIDED entry naming MapLibre, VersaTiles Shadow, undarkened line colours, and the
  absence of light/dark theming.
- A REJECTED entry for each of: Esri Dark Gray Canvas, unmodified VersaTiles Eclipse,
  Graybeard, Neutrino, OpenFreeMap Dark, the client-side recolour pass — each with a
  reason on the entry, matching the existing file's DECIDED/REJECTED format.
- The VersaTiles fair-use gap recorded as an accepted risk.

A presence check per required entry. It fails on the realistic mistake — half the list
recorded, or an entry with no reason — which is worth catching, since `docs/decisions.md`
is the file that stops a future session re-proposing a rejected basemap. The repo has
already had approaches re-proposed 4-5 times; that is the failure this guards.

## AC4 — no stale claims

Sweep the repo:

    grep -rniE "leaflet|carto|cartocdn" --include=*.md --include=*.html --include=*.js .

Every remaining hit must be either inside a REJECTED/historical entry or in
`docs/retro-archive/`. Anything else is stale and in scope.

Expected legitimate survivors, to be confirmed rather than assumed: the new REJECTED
entries themselves, and any dated design document that describes what the app was at
the time it was written. Historical documents should not be rewritten to pretend the
port always existed — mark them as history if that is not already obvious from context.

Exclude `node_modules` and `dist` if present. Run the sweep and read the output rather
than trusting this list; the point of the criterion is the hits nobody predicted.
