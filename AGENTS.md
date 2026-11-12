# Network Bandwidth Calculator

Dependency-free static web tool for network engineers: estimates the
bandwidth needed on switch access ports, uplinks and WLAN APs from a typical
client mix, for customer consulting. Published on GitHub Pages from `main`
(https://sg303.github.io/network-bandwidth-calculator/). Public repo.

Follows the SG303 baseline v2 (`sgstack/global/AGENTS.md`,
`sgstack/baseline/tools.md`). If you cannot read those: work on a branch,
open a PR, merge only with green checks (squash); never commit secrets or
personal data; English for everything in the repo; talk to me in German.

## Commands

- Run locally: `python3 -m http.server 8000 --bind 0.0.0.0` in the repo root
  (or open `index.html` directly; it works offline via `file://`).
- Test: `node --test` (calculation tests in `test/`).

## Release

No releases or tags. Every merge to `main` goes live on GitHub Pages within a
few minutes.

## Conventions

- `SPEC.md` is the specification: formulas, defaults and acceptance examples.
  Keep it in sync with `app.js` and the tests when the model changes.
- Everything lives in `index.html`, `app.js` and `style.css`: no build step,
  no dependencies, no external requests (fonts, CDNs, analytics). Keep it that
  way.
- `app.js` exports its calculation functions and tables for `node --test`;
  the browser and the tests use the same code.
- Assumptions and reference values (application bandwidths, PHY rates,
  concurrency) must be realistic and traceable; cite the source in SPEC.md
  when adding or changing one.
- Saved inputs live in `localStorage` under versioned keys (`nbc-wired-v1`,
  `nbc-wlan-v1`); bump the key when the stored format changes incompatibly.
- UI work: use the frontend-design skill.

## Deviations from baseline

- `tool-canon`: no npm, ESLint or Vitest. The tool is dependency-free on
  purpose; tests use Node's built-in `node --test`.
