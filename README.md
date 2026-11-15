# Protocols app

Personal protocol pyramid with levels. Plain HTML/CSS/JavaScript, no build step, no server, no accounts.
Spec: `Protocols-App-Spec.md` (decisions), rules in `logic.js`.

## Put it on GitHub Pages
1. Create a repository and upload everything in this folder to the root (keep `icons/`).
2. Repository Settings, Pages, Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/` on the phone, then "Add to Home screen" / "Install".

Docs: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Data
- Stored only in the browser on that device (IndexedDB). Nothing is sent anywhere.
- Browsers can clear site data. Use Review, Settings and backup, Export JSON now and then.
- Import accepts a backup or the plain library file (`protocols-library.json`).

## Changing things
- Efforts, limits, XP numbers: in the app (Pyramid edit mode, protocol cards, Settings).
- Starter library: `library.js` (only used on first start or "Load starter library").
- After changing any file on GitHub, bump `VERSION` in `sw.js` so phones fetch the new files.

## Tests
`node tests/logic.test.js` checks the level formula, capacity limits, weekly targets, XP and test verdict rules.
