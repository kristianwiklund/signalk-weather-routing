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

## 7. Testable recovery plan (2026-06-21)

Supersedes the **execution ordering** in §4 for the work on `feature/generic-grib-engine`.
The design in §3 stands; this section re-plans the execution with mechanical testability
gates. It exists because Phases 1–3 shipped format-specific shortcuts (logged in
`things_to_fix_with_the_grib_loader.md` items #1–#8 and in commits 0710045, 1457915,
d26bdb1, 6279aba) that contradict REQ-141's generic-loader ask. The user does not trust
the §4 plan; this section replaces it as the binding plan.

### 7.1 What this plan changes

- **Symptom.** `loadGribFile` contains a hardcoded `if/else` chain classifying bands by
  element name (`UGRD`→windU, `VGRD`→windV, `UOGRD`→currentU, …) and a bespoke swh
  branch with an inline ocean-message extraction. `readGribMeta` keeps three separate
  time sets (`windTimeMs`/`currentTimeMs`/`waveTimeMs`) and classifies `type` by
  time-set size. Adding a channel still requires editing the loader. This is the
  opposite of what REQ-141 asks.
- **Root cause.** Phase 1 delivered types and an engine that *looked* generic
  (`LoadedGribFile`, `MultiFileGribProvider`) while keeping type-specific branching
  inside the loader. Phase 3 started the same way and was reverted.
- **What this plan changes.** Generic-ness is enforced by a **contract test** that
  registers a synthetic channel at runtime and must flow through the loader with zero
  edits to `loadGribFile` or the engine. Behaviour-equivalence with the legacy path is
  proven by a **differential harness** before any legacy code is deleted. Each phase
  has a green-test gate plus written sign-off; no phase may start before the previous
  gate is recorded.

### 7.2 Testability principles (binding for all phases)

1. **Generic-ness is a test, not an inspection.** A contract test registers a synthetic
   `ChannelSpec` (`'testScalar'`, matched by a sentinel element name) at runtime and
   asserts the loader classifies a band with that element to the `testScalar` channel,
   and that `MultiFileGribProvider.sample('testScalar', …)` returns the value. The test
   fails the moment a hardcoded `if/else` chain is reintroduced.
2. **No legacy deletion without differential proof.** Until Phase E, the legacy path
   (`loadGrib`, `loadCurrentGrib`, `MultiFileWindProvider`, `SingleFileCurrentProvider`)
   stays in the tree as an oracle. A differential test runs both paths on every real
   fixture and asserts equality.
3. **Tests first, always.** Each phase lists its test files by name and fixture. Phase
   implementation cannot start until the tests exist (they may initially be red).
4. **Gate = green + sign-off + DoD.** A phase is done only when (a) the full suite is
   green, (b) the differential harness reports zero divergences on every fixture,
   (c) the user has approved in writing, (d) `DoD.md` is satisfied for the commit(s).
5. **One concern per commit.** No mixing of "generalise loader" with "delete legacy"
   with "add wave facade". Revertability is per-commit.

### 7.3 Phase sequence

§4's Phase 1 (engine + wind) and Phase 2 (current onto engine) have shipped on
`feature/generic-grib-engine`. Phase 3 partially shipped (`loadGribFile` exists;
`readGribMeta` accepts wave-only; no `WaveField`; consumers still read via `WindField`).
The remaining work is rephased **A → B → C → D → E → F**. Each phase: tests first →
implement → gate → stop and ask.

#### Phase A — Characterization & contract harness (no production code change)

**Purpose.** Establish the safety net that earns the right to generalise and later
delete. No production code is touched in this phase.

**Test artifacts (new files, all must initially pass against current code):**

- `src/lib/__tests__/gribEquivalence.test.ts` — for each real fixture in `test-data/`
  (Baltic ICON_EU_EWAM ×4 including 20260614, Current_ba_2026061400, Denmark ×2),
  load via both the legacy path (`loadGrib`/`loadCurrentGrib` →
  `MultiFileWindProvider`/`SingleFileCurrentProvider`) and the new path
  (`loadGribFile` → `MultiFileGribProvider` → `WindField`/`CurrentField`). Sample a
  dense grid of (lat, lon, timeIdx) points covering interior, edges, corners, and
  out-of-domain. Assert exact equality of `{u,v}`, `swh`, coverage, and
  `filePathFor`. Tolerance: exact for Float32; if a legitimate algorithmic difference
  is found, log it to BUGS.md and document it in the test before relaxing.
- `src/lib/__tests__/genericLoaderContract.test.ts` — registers a fake `ChannelSpec`
  (`key: 'testScalar'`, `match: (el) => el === '__TEST_SCALAR__'`) at runtime via the
  registry API, then calls the loader's pure classification function
  (`classifyBand(md)` — to be extracted in Phase B; until then the test exercises the
  current `if/else` chain via a thin shim and is written to fail-pass-style: it asserts
  the fake spec is *not* classified, proving the chain is hardcoded). After Phase B the
  same test asserts the fake spec *is* classified. This is the mechanical enforcement
  of REQ-141.
- `src/lib/__tests__/rankingEquivalence.test.ts` — constructs two overlapping synthetic
  `LoadedGribFile`s and the equivalent legacy-shape files; asserts
  `MultiFileGribProvider.rankedFiles` order matches `MultiFileWindProvider`'s sort
  across all four ranking keys (referenceTime, granularity, spatial, mtime) including
  ties.

**Production changes:** none.

**Gate:** all three new test files merged and green; differential harness reports zero
divergences across all fixtures. → ask before Phase B.

#### Phase B — Generalise the loader (audit items #1–#4)

**Purpose.** Make `loadGribFile` and `readGribMeta` genuinely generic. This is the
heart of REQ-141.

**Test artifacts (written first, must initially fail):**

- `src/lib/__tests__/channelRegistry.test.ts` — each registered spec (`windU`, `windV`,
  `currentU`, `currentV`, `swh`) matches its target band metadata and rejects
  non-target bands; the swh spec's custom `read` hook is invoked for discipline=10
  messages.
- `src/lib/__tests__/readGribMetaGeneric.test.ts` — a file with mixed bands produces a
  meta whose `type` reflects all present channels via boolean flags (not time-set
  sizes); one merged `allTimeMs` set populates `timeStart`/`timeEnd`/`nTimes`.

**Production changes:**

- New file `src/lib/grib/channels.ts` exporting `ChannelSpec`, the registry
  (`registerChannel`, `allChannels`), and the five built-in specs. The swh spec's
  `read` hook wraps the existing `readSwhFromOceanMessages` logic.
- `loadGribFile` rewritten to iterate the registry instead of the hardcoded `if/else`
  chain (debt #3); swh's ocean-message extraction moves into the swh spec's `read` hook
  (debt #4). A pure `classifyBand(md)` function is extracted and exported.
- `readGribMeta` rewritten with one `allTimeMs` set (debt #1) and boolean
  `hasWind`/`hasCurrent`/`hasWave` flags driving `type` (debt #2).

**Gate:** new tests green; Phase A equivalence tests still green (no behaviour change);
`genericLoaderContract.test.ts` now passes the "fake spec is classified" assertion;
audit doc updated (#1–#4 marked done). → ask.

#### Phase C — Generalise the wiring (audit items #5–#8)

**Purpose.** Remove type-based branching from `index.ts` and the frontend.

**Test artifacts:**

- `src/lib/__tests__/unifiedFileCollection.test.ts` — wave-only, wind, and current
  files coexist in one collection; `/wind-grid`, `/current-grid`, `/wave-grid` filter
  by channel presence + enabled set, not by `meta.type`.

**Production changes:**

- `index.ts`: replace `gribFiles` + `currentFiles` with one `loadedFiles` collection
  (debt #5); endpoints filter by channel (debt #6); legacy entry types lose their
  `.data` field (debt #7).
- `public/index.html`: `windFileEnabled` becomes `enabledGribPaths.has(f.path)`
  (debt #8).

**Gate:** unified-collection tests green; Phase A equivalence still green; manual smoke
(Grib Manager lists all files; enabling/disabling behaves per-type). → ask.

#### Phase D — Finish Phase 3 wave (REQ-140)

**Purpose.** Standalone wave is first-class; REQ-140 unblocked.

**Test artifacts:**

- `src/lib/__tests__/waveField.test.ts` — a wave-only fixture loads as `LoadedGribFile`
  with only `swh`; `WaveField.getHeight` returns the value; multi-file wave combination
  (two regional EWAM files, e.g. Baltic_South + Denmark) stitches correctly.
- `src/lib/__tests__/waveConsumers.test.ts` — wave overlay, conditions graph, and the
  comfort constraint (REQ-45) read from `WaveField`, not `WindField`.

**Production changes:**

- New `WaveField` facade in `src/lib/fields.ts`.
- Wave consumers rewired to `WaveField`.

**Gate:** wave tests green; Phase A equivalence still green; manual smoke of a
wavewatch file end-to-end (acquire fixture if not present — see "Test data" below). →
ask.

#### Phase E — Delete legacy

**Pre-condition:** Phases A–D merged and signed off; legacy code untouched throughout
(oracle role complete).

**Production changes:**

- Delete `loadGrib`, `loadCurrentGrib`, `getWindAt`, `getWaveAt`, `getCurrentAt`,
  `nearestTimeIndex`, `nearestCurrentTimeIndex` from `grib.ts`.
- Delete `MultiFileWindProvider` (`windprovider.ts`), `SingleFileCurrentProvider`
  (`currentprovider.ts`).
- Migrate the one caller of `gribCombination` (`/propose-combination` in `index.ts`)
  onto metadata derived from `LoadedGribFile`; delete `gribCombination.ts`.
- Delete legacy types `GribData`, `CurrentGribData`, `GribFileEntry`, `CurrentFileEntry`
  from `types.ts`.
- Migrate `windprovider.test.ts` and `currentprovider.test.ts` onto `WindField` /
  `CurrentField`; capture Phase A differential outputs as the new golden master;
  delete `gribEquivalence.test.ts` (its oracle is gone).

**Gate:** full suite green; bundle size reduced; coverage maintained or improved;
`DoD.md` satisfied. → ask.

#### Phase F — Closure

- `SPEC.md`: REQ-141 → done (link to this section); REQ-140 → done (Phase D).
- `BUGS.md`: BUG-135 → fixed.
- GitHub issues #373 (REQ-141), #370 (BUG-135), and the REQ-140 issue: closed with
  links to the merging PR.
- Final `DoD.md` pass.

**Gate:** all closure artifacts updated; user confirms REQ-141 delivered.

### 7.4 Test data

Phase A requires the existing fixtures (`test-data/*.grb2`) plus the three untracked
additions already on the branch (`Baltic_South_ICON_EU_EWAM_20260614-00.grb2`,
`Current_ba_2026061400_00.grb2`, `Denmark_ICON_EU_EWAM_20260614-00.grb2`) — these
untracked test-data files must be committed before Phase A so the differential harness
is reproducible.

**Wave-only is not a fixture class.** The contract test
(`genericLoaderContract.test.ts`) proves in Phase A that the engine loads any
single-channel file generically; a wave-only file is just the swh-only configuration
of that mechanism — proven by the contract test, not by acquiring a specific product.
The existing ICON_EU_EWAM fixtures carry `swh` alongside wind and exercise the wave
path end-to-end. If a real wave-only file happens to be available later, it may be
used as an opportunistic manual smoke; its absence does not block any phase, and
"acquire a wavewatch file" is explicitly **not** a precondition. (Requiring a specific
product fixture to prove a generic mechanism is the same anti-pattern this plan
exists to break.)

### 7.5 Rollback

Each phase is a clean commit (or short series). If a gate fails or sign-off is
withheld: revert the phase's commits; the tree returns to the previous gate's green
state; legacy code remains present until Phase E, so production behaviour is unchanged
at every intermediate point.

### 7.6 What "done" means for REQ-141

REQ-141 is done when **all** of the following hold:

1. `genericLoaderContract.test.ts` passes — a channel registered at runtime flows
   through the loader with zero edits to `loadGribFile` or `MultiFileGribProvider`.
2. The legacy code path is gone (Phase E merged).
3. The differential harness (Phase A) ran green across every real fixture before
   deletion.
4. Wind, current, and wave each have a facade over the same engine; no type-specific
   loader remains.
5. Audit items #1–#8 are resolved (none deferred).
6. `SPEC.md`, `BUGS.md`, and the linked GitHub issues are closed.

Anything less is not REQ-141; it is Phase 1+2+partial-3 with debt, which is the
current untrusted state.
