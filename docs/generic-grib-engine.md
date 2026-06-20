# Generic Multi-File GRIB Engine — Design & Plan

Status: planned 2026-06-20. Implements REQ-141 (generic multi-file combination for
all input types). Resolves BUG-135 (multiple ocean-current GRIBs). Unblocks REQ-140
(standalone wave-only GRIBs). Phased: 1 → 2 → 3, tests-first, gate (tests green +
user sign-off) before each next phase.

## 1. Problem & motivation

GRIB data is spread across **both time and space**. For longer passages it is necessary
to combine several physical files for coverage. This is a **generic** requirement for
**all** valid input data types — wind, ocean current, wave height, and future variables
(wave direction, etc.). Nowhere in the spec is multi-file restricted to wind.

Today the plugin duplicates the mechanism and only fully supports wind:

- Two near-identical loaders: `loadGrib` (wind: `u10`/`v10` + `swhByTime`) and
  `loadCurrentGrib` (current: `u`/`v`).
- Two data shapes: `GribData` and `CurrentGribData` (both `{ times, grid, u, v }`).
- Two bilinear samplers: `getWindAt`/`getWaveAt` and `getCurrentAt`.
- Two nearest-time helpers, two providers (`MultiFileWindProvider`,
  `SingleFileCurrentProvider`).

Ocean current is **single-file** (`SingleFileCurrentProvider` loads only the freshest
current GRIB), so with several regional current files (e.g. norkyst800m) only one
region is served and the UI misbehaves (BUG-135). "Copy wind and tweak for current"
would make the duplication threefold and leave wave as another special case. This
document specifies a generic, reusable architecture instead.

## 2. Principle (REQ-141)

> **All valid GRIB input types (wind, current, wave, and future) support multi-file
> combination across time and space**, by the same mechanism. A GRIB file is a set of
> named **channels**; the engine combines files per channel, ranking overlapping files
> by model run recency then granularity.

The ranking already established for wind — **referenceTime → temporal granularity →
spatial resolution → file mtime** — is file-level and applies uniformly to every channel.

## 3. Architecture

### 3.1 Core types (`src/types.ts`)

```ts
type ChannelKey = 'windU' | 'windV' | 'currentU' | 'currentV' | 'swh' | 'waveDir' | string;

interface ChannelGrid {
  latMin: number; latStep: number; lonMin: number; lonStep: number; nLat: number; nLon: number;
  byTime: Map<number /*validTimeMs*/, Float32Array>; // one row-major grid per timestep
}

interface LoadedGribFile {
  meta: GribFileMeta;            // path, bbox, timeStart/End, nTimes, referenceTime
  channels: Map<ChannelKey, ChannelGrid>; // only the channels present in this file
}
```

`LoadedGribFile` replaces both `GribData` and `CurrentGribData`. A channel may have its
**own grid** (`ChannelGrid` carries its own params) — this natively handles the mixed-grid
`swh` case (wave on a different grid than wind in ICON-EU EWAM files).

### 3.2 Channel registry (`src/lib/grib/channels.ts`)

```ts
interface ChannelSpec {
  key: ChannelKey;
  // identify this channel's band(s) in a GRIB file
  match: (element: string, shortName: string, discipline: number) => boolean;
  // optional custom reader for special cases (e.g. swh via discipline=10 vsimem extraction)
  read?: (path: string) => Promise<ChannelGrid | null>;
}
```

Registry entries (added per phase):
- Phase 1: `windU` (`UGRD` + `10-HTGL`), `windV` (`VGRD` + `10-HTGL`), `swh`
  (`HTSGW`, discipline=10 — reuses the existing `readSwhFromOceanMessages` as its reader).
- Phase 2: `currentU` (`UOGRD`), `currentV` (`VOGRD`).
- Phase 3 / future: `waveDir`, … — register here, no engine change.

This replaces the scattered `GRIB_*_ELEMENT` constants and the `hasWave` flag.

### 3.3 Unified loader (`src/lib/grib.ts`)

One `loadGribFile(path, meta): Promise<LoadedGribFile>` scans all bands, classifies each
via the registry, reads each present channel's grids, and returns `LoadedGribFile`.
Replaces `loadGrib` + `loadCurrentGrib`. The existing band-reading and the `swh`
discipline-10 extractor are reused.

### 3.4 Engine (`src/lib/multiFileGribProvider.ts`)

```ts
class MultiFileGribProvider {
  constructor(files: LoadedGribFile[]);            // ranks once: refTime→gran→spatial→mtime
  sample(channel, lat, lon, t): number | undefined; // single pass over ranked files that
                                                     // carry the channel AND cover point+time;
                                                     // bilinear-interpolates the first covering file
  covers(channel, lat, lon, t): boolean;
  filePathFor(channel, lat, lon, t): string | undefined;
  times(channel): Date[];                           // merged time axis for that channel
}
```

One generic bilinear sampler (operates on any `ChannelGrid`) replaces `getWindAt` /
`getCurrentAt` / `getWaveAt`. Per-channel file filtering happens at `sample` time
(iterate the globally-ranked files, skip those lacking the channel or not covering).

### 3.5 Facades (`src/lib/fields.ts`)

Thin wrappers over the engine, implementing the existing interfaces so routing and
endpoints change minimally:

- `WindField(provider)` — `getWind(lat,lon,t)` = `{u: sample('windU'), v: sample('windV')}`,
  `getWave(lat,lon,t)` = `sample('swh')`, `coversPointAtTime`, `getFilePathForPoint`,
  `times`. Implements `WindProvider`.
- `CurrentField(provider)` — `getCurrent(lat,lon,t)` = `{u: sample('currentU'), v: sample('currentV')}`.
  Implements `CurrentProvider`. (Phase 2.)
- `WaveField(provider)` — `getHeight(lat,lon,t)` = `sample('swh')`. (Phase 3.)

Adding a new variable (e.g. wave direction) = register a channel + add a facade; the
engine is untouched.

### 3.6 Enable model (decision: unified, per-file)

One `enabledGribPaths: Set<string>` across **all** types. Each facade samples only from
files that are (in the set) AND (carry the relevant channel). One checkbox per file in
the Grib Manager, regardless of type. This replaces the wind-only `enabledGribPaths` and
the `useCurrentGrib` boolean. (The existing per-layer overlay toggles in the Layers panel
are orthogonal — "is the overlay drawn" — and remain unchanged.)

### 3.7 What it replaces

`loadGrib` + `loadCurrentGrib` → `loadGribFile`; `GribData` + `CurrentGribData` →
`LoadedGribFile`; `getWindAt`/`getWaveAt`/`getCurrentAt` → one generic sampler;
`MultiFileWindProvider` + `SingleFileCurrentProvider` → `MultiFileGribProvider` +
facades.

## 4. Phased plan

Each phase: tests first → implement → all tests green → **stop and ask before the next phase.**

### Phase 1 — engine + wind migration (behaviour-preserving)

1. **Tests first.** `windprovider.test.ts` is the wind golden master (ranking, per-point
   selection, `getWave`, coverage, single-pass, BUG-75/93/101/104). Augment gaps
   (`getFilePathForPoint`, wave across two files). Add `multiFileGribProvider.test.ts`:
   channel-agnostic engine tests with synthetic `LoadedGribFile`s (per-channel resolution,
   regional stitch, ranking, single pass).
2. Core types; `ChannelSpec` registry (`windU/windV/swh`).
3. `loadGribFile`; `MultiFileGribProvider` + generic bilinear sampler; `WindField`/`WaveField`.
4. Wire `index.ts`: load wind via `loadGribFile`, build the provider, expose `WindField`
   as the `WindProvider`; `/wind-grid`, `/wind-times`, `/wave-grid` and the isochrone loop
   use it.
5. Record REQ-141 (this principle) in `SPEC.md`; write BUG-135 investigation notes as
   implementation proceeds.
6. **Gate:** all wind tests green; no user-visible change. → ask before Phase 2.

### Phase 2 — current onto the engine (fixes BUG-135)

1. Register `currentU/currentV`; `loadGribFile` reads current files into channels.
2. `readGribMeta` generalises to return the channel set (accepts wind/current/swh — no
   more "neither wind nor current" rejection of valid files).
3. `index.ts`: load **all** current files; `CurrentField`; `/current-grid`, `/current-times`
   use the engine; per-file current enable via the unified set.
4. Frontend: per-file current enable (mirror wind rows); bbox for **every** current file;
   the shared `currentEnabled` becomes overlay on/off only.
5. Multi-current tests (regional stitch, ranking, single pass) — mirror the wind suite.
6. **Gate:** green. → ask.

### Phase 3 — wave as a first-class channel (REQ-140)

1. `readGribMeta` accepts wave-only files (`swh`-only) → they load as `LoadedGribFile`
   with just the `swh` channel.
2. Decouple wave consumers from wind files: wave overlay, conditions graph, and the
   comfort constraint (REQ-45) read from `WaveField`.
3. Tests: standalone wave file loads + contributes `swh`; multi-file wave combination;
   consumers read `WaveField`. Verify the wavewatch file works end-to-end.
4. **Gate:** green. → ask.

## 5. Out of scope (separate efforts)

- Comfort-constraint overhaul (REQ-133): wind/TWA-aware comfort, wave direction — rides
  on `WaveField`/`CurrentField` once present, but is its own requirement.
- Wind-against-current sea-state model (REQ-135): depends on `CurrentField`; separate.
- Tidal-current GRIB compatibility (BUG-86): validation gap; separate.

## 6. Decisions recorded

- Enable model: **A — unified per-file `enabledGribPaths`** (all types; facades filter by channel).
- File layout: **new files** (`channels.ts`, `multiFileGribProvider.ts`, `fields.ts`).
- Order: **Phase 1 → 2 → 3**, tests-first, green gate + user sign-off between phases.
- Ranking: **referenceTime → granularity → spatial → mtime** (file-level, all channels).
