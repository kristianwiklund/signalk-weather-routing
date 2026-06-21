# Things to Fix With the GRIB Loader

Audit of format-specific code remaining in the generic GRIB architecture (REQ-141). Identified 2026-06-21.

## Architecture goal

One generic pipeline: `readGribMeta` → `loadGribFile` → `loadedFileCache` → `MultiFileGribProvider` → facades. No format-specific branching. Adding a new GRIB type = register a channel spec, no code changes to the loader or engine.

## What's already generic (working)

- `MultiFileGribProvider` engine — channel-based, file ranking, per-channel sample/covers/filePathFor/times. ✅
- `WindField` / `CurrentField` facades — thin wrappers over the engine. ✅
- `LoadedGribFile` / `ChannelKey` / `ChannelGrid` types. ✅
- `loadedFileCache` (one Map<path, LoadedGribFile>). ✅
- `loadGribFile` — scans all bands, reads whatever channels are present. ✅ (but channel classification is hardcoded — see #3)

## What's format-specific (broken / debt)

### #1 — `readGribMeta` time collection (BLOCKING — causes the wave bug)

**Where:** `src/lib/grib.ts`, `readGribMeta`.

**Problem:** Three separate time sets (`windTimeMs`, `currentTimeMs`, `waveTimeMs`). Time axis selected by type. Wave-only files get an empty time axis (the wave times are in `waveTimeMs` but the three-set pattern is fragile and the immediate fix added a third format-specific branch).

**Fix:** One `allTimeMs` set collecting ALL recognised bands' valid times. Eliminates all three format-specific sets.

**Priority:** Fix now (Phase 3 blocking — wave files need valid metadata).

### #2 — `readGribMeta` type classification (fragile)

**Where:** `src/lib/grib.ts`, `readGribMeta`.

**Problem:** Type classified by time-set *size* (`windTimeMs.size > 0 ? 'wind' : ...`). Depends on having collected times, not on what elements are present.

**Fix:** Boolean flags (`hasWind`, `hasCurrent`, `hasWave`) set in the band loop. Classify by flags, not set sizes.

**Priority:** Fix now (same refactor as #1).

### #3 — `loadGribFile` channel classification (hardcoded if/else)

**Where:** `src/lib/grib.ts`, `loadGribFile`.

**Problem:** Channel detection is a hardcoded `if/else` chain by element name (`UGRD`→windU, `VGRD`→windV, `UOGRD`→currentU, `VOGRD`→currentV, `HTSGW`→swh). Adding a channel (e.g. wave direction `DIRPW`) = editing the loader.

**Fix:** A `ChannelSpec` registry (as specified in the design doc `docs/generic-grib-engine.md`). Each spec declares: key, band-matcher (element/shortName/discipline), optional custom reader. The loader iterates the registry, not a hardcoded chain. Adding a channel = register a spec.

**Priority:** Defer (works for the three known channel types; matters when adding a new type). Not YAGNI — documented path for extensibility.

### #4 — `loadGribFile` swh special case (hardcoded extraction)

**Where:** `src/lib/grib.ts`, `loadGribFile` + `readSwhFromOceanMessages`.

**Problem:** swh reading has two hardcoded paths: inline (from the main grid) and ocean-message extraction (discipline=10 via vsimem). This is a special case for the mixed-grid swh channel. Any future channel needing special extraction would require another hardcoded path.

**Fix:** swh's ChannelSpec includes a custom reader (the `readSwhFromOceanMessages` logic). The loader calls the spec's reader instead of inlining the extraction.

**Priority:** Defer (works now; matters when adding channels with custom extraction).

### #5 — `index.ts` file routing (two arrays by type)

**Where:** `src/index.ts`, `scanAndIndexGribDir`.

**Problem:** Files routed to `gribFiles` (wind+wave) or `currentFiles` (current) by `meta.type`. Wave-only files go to `gribFiles` (the else branch) — works by accident. The two-array split is format-specific.

**Fix:** One `loadedFiles` collection (Map<path, LoadedGribFile> or array). No type-based routing. The engine's per-channel filtering handles which files contribute to which field.

**Priority:** Defer (works by accident; cleanup for clarity).

### #6 — `index.ts` endpoint filters (per-array)

**Where:** `src/index.ts`, `/wind-grid`, `/wave-grid`, `/current-grid`, `/calculate`.

**Problem:** Wind endpoints filter from `gribFiles`; current from `currentFiles`. Wave-only files in `gribFiles` are included in wind endpoint iteration (harmless — engine returns undefined for windU — but conceptually wrong).

**Fix:** All endpoints filter from the unified `loadedFiles` collection by channel presence + enabled paths.

**Priority:** Defer (follows from #5).

### #7 — Legacy entry types (dead `.data` fields)

**Where:** `src/types.ts`, `GribFileEntry`, `CurrentFileEntry`.

**Problem:** Both have a `data` field (GribData / CurrentGribData) that's now unused (loadedFileCache replaced it). The types are dead weight.

**Fix:** Either remove the `.data` field (keeping just `.meta`) or replace with one unified `LoadedEntry { meta, loadedFile }`.

**Priority:** Defer (cleanup; no functional impact).

### #8 — Frontend type-based filtering

**Where:** `public/index.html`, `windFileEnabled`.

**Problem:** `f.type !== 'current'` excludes current files from the wind enabled-set check. A wave-only file (type='wave') passes this → included in wind overlay fetch. Harmless (engine returns undefined) but format-specific.

**Fix:** `windFileEnabled` just checks `enabledGribPaths.has(f.path)`. The engine's channel filtering handles the rest.

**Priority:** Defer (harmless; cleanup).

## Old type-specific loaders (retained but unused)

`loadGrib` and `loadCurrentGrib` still exist in `grib.ts` (used by tests as safety references). They're unused in production (loadGribFile replaced them). Can be removed when tests are migrated to test loadGribFile directly.

## Summary

| # | Issue | Priority | Effort |
|---|---|---|---|
| 1 | readGribMeta three time sets | **Fix now** | ~20 lines |
| 2 | readGribMeta type by size not flag | **Fix now** | (same refactor) |
| 3 | loadGribFile hardcoded if/else | Defer | ChannelSpec registry |
| 4 | loadGribFile swh special case | Defer | ChannelSpec custom reader |
| 5 | index.ts two-array routing | Defer | Unify collection |
| 6 | index.ts per-array filters | Defer | (follows from 5) |
| 7 | Legacy entry types | Defer | Remove dead fields |
| 8 | Frontend type filtering | Defer | Remove type check |
