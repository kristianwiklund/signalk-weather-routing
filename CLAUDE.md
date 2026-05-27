# signalk-weather-routing

A SignalK plugin that calculates optimal sailing routes using GRIB2 weather forecasts and the isochrone method. Wind data from OpenSkiron (ICON-EU, 7 km grid). Polar diagrams in ORC/OpenCPN semicolon-delimited CSV format. Land avoidance via GSHHG. Result stored in SignalK `resources/routes` for display in freeboard-sk. Separate Leaflet-based UI served from `public/`.

## Code Quality Principles

Follow YAGNI, SOLID, DRY, and KISS. Only make changes directly requested or clearly necessary. Keep solutions simple and focused.

Do not add features, refactor, or make improvements beyond what was asked. Do not add error handling or validation for scenarios that cannot happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs, file I/O).

Write self-documenting code. Comments explain "why", not "what". No echo comments. Keep functions small and single-responsibility. Prefer composition over inheritance. No magic numbers — use named constants. Documentation describes current state, not history.

## Type Safety

All code is TypeScript. Use strict type checking; avoid `any`. Validate external inputs at system boundaries. Prefer immutable data where practical.

## Performance

The plugin runs on Raspberry Pi 3–5, often on battery. The isochrone inner loop (per-point × per-heading × per-time-step) is the hot path — keep it allocation-free. Rules:

- Guard `debug()` arguments — wrap with `debug.enabled &&` to avoid eager evaluation.
- Build objects in their final shape on hot paths (consistent key order for V8 hidden classes).
- Minimize allocations in the isochrone loop: hoist constants to module scope, prefer `for...of` over `.forEach`.
- Use `structuredClone`, not `JSON.parse(JSON.stringify(...))`, for deep cloning.
- Prefer `Set` over `Array.includes` for repeated membership checks.

## Testing

All new code requires tests. Test behaviour, not implementation. Unit tests for business logic (polar interpolation, geo math, isochrone pruning); integration tests for GRIB loading and route output.

## Git Commit Conventions

Format: `<type>(<scope>): <subject>` — type = feat|fix|docs|refactor|test|chore|perf. Subject: 50 chars max, imperative mood, no period. One logical change per commit. Rebase and clean up history before PR; amend fixes into the relevant commit rather than adding "fix typo" commits.

## Pull Request Guidelines

- Branch from latest `master`; rebase, never merge commits
- Run `npm run build` and tests before opening PR
- One logical change per PR
- PR title is descriptive and self-contained
- Description: motivation (why) and approach (how) — the diff shows what
- **Never change version numbers**
- Reference issues with `closes #N` / `fixes #N`

## Specification Rule

All requirements and design decisions must be recorded in `SPEC.md` at the repo root before any code is written. If it is not in SPEC.md, it is not decided.

## Session Start Rule

At the start of every session, read and apply all rules in:
- `~/.claude/CLAUDE.md` (global rules)
- `~/src/weather-routing/CLAUDE.md` (project rules)
- All memory files listed in `~/.claude/projects/-home-kw-src-weather-routing/memory/MEMORY.md`

## No Assumptions Rule

Do not assume things, and do not simplify things on your own. If a decision has not been made explicitly, ask. If a simplification would change behaviour or omit information, do not apply it without explicit instruction.

Before using any value, dataset, or boundary as a proxy for something else, ask: is this explicitly required, or am I assuming it's equivalent? This applies to algorithms, data filters, display choices, query boundaries, and any other design decision.

Examples of assumptions that caused real bugs in this project:
- Using the GRIB bbox as the land overlay query boundary (BUG-14) — violated REQ-17
- Stride sampling and size filtering on land polygons (BUG-12) — violated REQ-17
- Assuming the package was published to npm — caused wrong installation instructions in README

## Bug Report Rule

Before acting on any user message, ask: does this describe behavior that differs from expectation? If yes, it is a bug report — regardless of phrasing. Examples that are bug reports: "X is empty", "Y shows wrong values", "Z doesn't appear", "it's not working", "the numbers are wrong". Conversational descriptions of problems are bug reports just as much as formal "bug:" prefixes.

When a bug is reported: write one entry to BUGS.md and stop. No code reads, no root cause analysis, no proposed fix, no troubleshooting of any kind. There are no exceptions — even if the code was just written, even if the cause seems obvious.

## New Requirements Rule

When any new feature or requirement is requested — regardless of how it is phrased ("feature:", "new requirement:", "add this", "we need X", or any other wording) — add one entry to SPEC.md and stop. Do not analyse it, do not plan it, do not propose an implementation, do not ask clarifying questions about implementation. Implementation happens later, explicitly on request.

## Planning Rule

Before writing any code or changing a technical decision, present a plan and wait for explicit approval.

## Commit Rule

When something is marked complete (requirement done, bug fixed), update the documentation to reflect that status and commit both the code changes and the documentation changes together in the same commit. Do not mark something complete without committing.
