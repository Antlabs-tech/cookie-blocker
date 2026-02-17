# Cookie Blocker (standalone)

Chrome extension with Vite + CRXJS build. Output is optimized (minified JS/CSS, bundled background + rules).

Source lives in **src/** (background, popup, options, data, rules, assets, img). Root holds config (package.json, vite.config.js, manifest.js).

## Setup

```bash
npm install
```

## Commands

- **`npm run build`** — Production build to `build/`. Load the `build/` folder in Chrome (chrome://extensions → Load unpacked).
- **`npm run dev`** — Development with hot reload.

## Output

- **Background** (service worker) and `rules.js` are bundled and minified into one chunk.
- **Popup** and **options** scripts are bundled and minified.
- **data/js/** and **data/css/common.css** are copied then minified by the post-build script.
- **rules.json** is compacted (no whitespace).
