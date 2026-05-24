# Known Bugs

| # | Description |
|---|---|
| ~~1~~ | ~~`saveRoute` fails with "Invalid resource id provided (urn:mrn:signalk:uuid:…)" — `setResource` expects a plain UUID, not the full URN~~ — **fixed** |
| ~~2~~ | ~~OSM tiles blocked — webapp violates OSM tile usage policy~~ — **fixed** (tile `<img>` elements patched with `referrerpolicy` attribute to override SignalK's `Referrer-Policy: no-referrer`) |
| ~~3~~ | ~~`saveRoute` rejected by resources provider — `feature.properties.coordinatesMeta` items fail schema validation: each item must have `name` or `href` property~~ — **fixed** |
| ~~4~~ | ~~Route fetch returns 404 — webapp was using `/signalk/v1/api/resources/routes/` but resources API is only mounted at v2~~ — **fixed** |
| 5 | Route passes through islands (Hellman/Enskär/Signilskär) — land avoidance not working or land mask not loaded |
