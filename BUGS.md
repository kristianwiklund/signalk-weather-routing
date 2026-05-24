# Known Bugs

| # | Description |
|---|---|
| ~~1~~ | ~~`saveRoute` fails with "Invalid resource id provided (urn:mrn:signalk:uuid:…)" — `setResource` expects a plain UUID, not the full URN~~ — **fixed** |
| 2 | OSM tiles blocked — webapp violates OSM tile usage policy; see https://wiki.openstreetmap.org/wiki/Blocked_tiles |
| 3 | `saveRoute` rejected by resources provider — `feature.properties.coordinatesMeta` items fail schema validation: each item must have `name` or `href` property |
