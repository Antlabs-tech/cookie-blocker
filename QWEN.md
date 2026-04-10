# Cookie Blocker — QWEN Context

## Project Overview

**Cookie Blocker** is a Chrome browser extension that blocks cookie consent popups and trackers across the web. It uses **Manifest V3** with a build pipeline powered by **Vite + CRXJS** to produce optimized, minified output.

The extension works by:

- Using **Declarative Net Request** rules (`rules.json`) to block known cookie consent scripts/styles at the network level
- Injecting content scripts that handle remaining cookie banners via DOM manipulation (click handlers, storage handlers, etc.)
- Providing a popup UI for quick controls and an options/side panel for detailed settings

## Architecture

```
src/
├── background/index.js       # Service worker — core logic, rules management, tab state, badges
├── popup.{html,css,js}       # Extension popup — quick toggle + settings
├── options.{html}            # Options page (also used as side panel)
├── options/index.{css,js}    # Options page scripts and styles
├── rules.js                  # JS rules: block URLs, commons, handlers
├── rules.json                # Declarative Net Request rules (~20K lines of blocking rules)
├── data/js/                  # Content script handlers (cookie, click, storage, Google, embeds)
├── data/css/                 # Shared CSS for content scripts
├── img/                      # Extension icons (16–128px)
├── assets/                   # Static assets
├── _locales/                 # i18n localization files
└── tailwind.css              # Tailwind CSS entry point
```

### Key Components

| Component             | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `background/index.js` | Service worker: manages rules, tab state, settings, badges, event listeners              |
| `rules.json`          | Declarative Net Request rules for network-level blocking                                 |
| `rules.js`            | JS-based rules and common handlers merged with background                                |
| `data/js/*.js`        | Content scripts injected into pages (cookie handling, click automation, storage cleanup) |
| `popup/`              | Quick-access popup UI                                                                    |
| `options/`            | Full settings page (also configured as side panel)                                       |

## Tech Stack

- **Runtime**: Chrome Extension Manifest V3
- **Build**: Vite 5 + CRXJS (`@crxjs/vite-plugin`)
- **Styling**: Tailwind CSS 4
- **Minification**: esbuild (post-build script)
- **Scripts**: Node.js (ESM)

## Commands

| Command                       | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `npm install`                 | Install dependencies                                |
| `npm run dev`                 | Start development server with hot reload            |
| `npm run build`               | Production build to `build/` (minified + optimized) |
| `npm run preview`             | Preview the build output                            |
| `npm run sync-issues`         | Sync GitHub issues (uses `.env` for token)          |
| `npm run sync-issues:test`    | Test sync-issues script                             |
| `npm run sync-issues:combine` | Combine extracted PRs                               |

### Loading the Extension

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `build/` directory

## Build Output

The build process (`build/` directory) produces:

- **Background service worker** + `rules.js` bundled into a single minified chunk
- **Popup** and **options** scripts bundled and minified
- **data/js/** and **data/css/common.css** copied then minified via post-build script (`scripts/minify-data.mjs`)
- **rules.json** compacted (whitespace removed)

## Configuration Files

| File             | Purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `manifest.js`    | Extension manifest definition (permissions, icons, background, DNR rules) |
| `vite.config.js` | Vite build config with CRXJS plugin, Tailwind, static copy                |
| `package.json`   | Dependencies, scripts, version (`1.2.16`)                                 |
| `.env.example`   | GitHub token template for issue sync scripts                              |

## Permissions

The extension requests:

- `tabs`, `storage`, `webRequest`, `webNavigation`
- `declarativeNetRequestWithHostAccess`
- `scripting`, `sidePanel`
- Host permissions: `http://*/*`, `https://*/*`

## Development Notes

- The background worker is defined as an ES module (`type: "module"`)
- Version is driven from `package.json` via Vite `define`
- Static assets (images, data scripts, locales) are copied via `vite-plugin-static-copy`
- Post-build minification uses esbuild for JS/CSS and JSON compaction for rules
- Tailwind CSS is processed through `@tailwindcss/vite` plugin
