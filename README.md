# Protocols

A personal, device-only protocol practice app based on `Protocols-App-Spec.md` and the accompanying library. No accounts, servers, analytics, or runtime dependencies. Protocol abstracts are drafts supplied in the library, not verified medical guidance.

## Run locally

Requires Node.js 20 or newer. No installation step.

```sh
npm start
```

Open http://127.0.0.1:4173. Use an HTTP server rather than opening `index.html` directly; IndexedDB and the service worker need a supported origin.

```sh
npm test
```

## Available in v0.1

- Today: check/undo, daily XP, Layer 2 weekly targets and bonuses, pause days, last-three-day backfill, repeatable as-needed actions.
- Pyramid: capacity indicators, adjustable effort limits, capacity checks and one-protocol swaps. XP follows protocols between layers.
- Library: one-time seed import, search/category/layer filters, detail cards, source pages, 30-day completion heat maps, effort and schedule edits, custom protocols, pause and archive.
- Experiments: queue ordering, up to two concurrent tests within effort capacity, 14–28-day plans, rating/numeric/boolean metrics, baseline chart with gaps, notes, early ending, required verdict, capacity checks, completion bonus, and test history.
- Review: current week / 30-day summaries, consistency, levels, heat maps, local Sunday reminder, validated JSON backup import/export.
- PWA: relative paths for GitHub project Pages, offline cache after first successful visit, manifest and icon, install help.

## Data and backup

State is stored in IndexedDB under database `protocols`. Data belongs to the browser profile and origin. Export JSON from Settings or Review before clearing browser storage or moving to another browser, device, or hosting URL. Import validates schema version 1 and requires a separate replacement action. Backups contain your personal observations and notes.

Daily and weekly records retain awarded XP. Undoing a Layer 2 completion that takes a week below target removes its weekly bonus. Level thresholds use the configured arithmetic series. Consistency begins at the later of app setup or protocol creation; it counts eligible days in the last 30 days, excluding global and protocol pause dates and applying fixed weekdays. It does not reconstruct historical layer changes.

## GitHub Pages

This folder is prepared for GitHub Pages but has not been published. Create or select a repository, put these files on its `main` branch, and select **Settings → Pages → Source → GitHub Actions**. The included workflow runs the calculation tests and deploys only the app assets. All paths work under a repository subpath.

## Choices still open

- EP2 and EP3 keep their supplied target of three. Their fixed weekdays are unset until you choose them in Edit protocol.
- Initial effort/frequency values and capacity limits remain the supplied guesses.
- Levels are visual; they do not automatically change effort.
- Browser installation behavior varies. Home-screen icons and offline behavior still require verification on your target phone.
- No cross-device synchronization. Existing browser data is not transferred automatically to the deployed origin.

The original specification and library are retained unchanged.
