# Cookie Blocker

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-blue?logo=google-chrome)](https://chromewebstore.google.com/detail/cookie-blocker/pdiamhjdeflkiilhdhicpdklfammkljm)

**Automatically block cookie consent popups and trackers across the web.**

Cookie Blocker is a Chrome browser extension that removes cookie consent banners, blocks tracking scripts, and helps you browse the web without interruptions. It uses network-level blocking combined with intelligent DOM manipulation to provide a seamless browsing experience.

👉 **[Install from Chrome Web Store](https://chromewebstore.google.com/detail/cookie-blocker/pdiamhjdeflkiilhdhicpdklfammkljm)**

---

## ⚠️ License & Attribution

**This project is licensed under the GNU General Public License v3.0 (GPL-3.0).**

This extension is a derivative work based on **[I Still Don't Care About Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies)**, which is also licensed under GPL-3.0.

### Copyright Notice

- Original work: Copyright (c) I-Still-Dont-Care-About-Cookies contributors
- Modifications: Copyright (c) Cookie Blocker contributors

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU General Public License](https://www.gnu.org/licenses/gpl-3.0) for more details.

---

## Features

- **Network-Level Blocking**: Uses Declarative Net Request API to block cookie consent scripts before they load
- **Automatic Banner Removal**: Intelligently detects and removes cookie consent popups via DOM manipulation
- **Tracker Blocking**: Blocks known tracking scripts and cookies
- **Customizable Settings**: Fine-tune blocking behavior through the extension popup and options page
- **Lightweight & Fast**: Optimized build with minified assets and efficient rule matching
- **Open Source**: Fully transparent and community-driven

---

## How It Works

Cookie Blocker operates on multiple levels to ensure cookie banners are effectively blocked:

1. **Declarative Net Request Rules** (`rules.json`): Blocks known cookie consent scripts and styles at the network level before they execute
2. **Content Scripts**: Injected scripts that handle remaining cookie banners through:
   - DOM manipulation and element hiding
   - Automatic "Accept" button clicking
   - Storage cleanup (cookies, localStorage, sessionStorage)
3. **Popup UI**: Quick-access controls to enable/disable blocking and adjust settings
4. **Options Page**: Detailed configuration for advanced users

---

## Architecture

```
src/
├── background/index.js       # Service worker — core logic, rules management, tab state, badges
├── popup.{html,css,js}       # Extension popup — quick toggle + settings
├── options.{html}            # Options page (also used as side panel)
├── options/index.{css,js}    # Options page scripts and styles
├── rules.js                  # JS rules: block URLs, commons, handlers
├── rules.json                # Declarative Net Request rules for network-level blocking
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

---

## Tech Stack

- **Runtime**: Chrome Extension Manifest V3
- **Build**: Vite 5 + CRXJS (`@crxjs/vite-plugin`)
- **Styling**: Tailwind CSS 4
- **Minification**: esbuild (post-build script)
- **Scripts**: Node.js (ESM)

---

## Setup & Installation

### Prerequisites

- Node.js (v18 or higher)
- npm

### Install Dependencies

```bash
npm install
```

### Development

Start the development server with hot reload:

```bash
npm run dev
```

### Production Build

Build the extension for production:

```bash
npm run build
```

This creates an optimized, minified build in the `build/` directory.

### Load the Extension

1. Run `npm run build`
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `build/` directory

---

## Available Commands

| Command                       | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `npm install`                 | Install dependencies                                |
| `npm run dev`                 | Start development server with hot reload            |
| `npm run build`               | Production build to `build/` (minified + optimized) |
| `npm run preview`             | Preview the build output                            |
| `npm run sync-issues`         | Sync GitHub issues (uses `.env` for token)          |
| `npm run sync-issues:test`    | Test sync-issues script                             |
| `npm run sync-issues:combine` | Combine extracted PRs                               |

---

## Build Output

The build process (`build/` directory) produces:

- **Background service worker** + `rules.js` bundled into a single minified chunk
- **Popup** and **options** scripts bundled and minified
- **data/js/** and **data/css/common.css** copied then minified via post-build script (`scripts/minify-data.mjs`)
- **rules.json** compacted (whitespace removed)

---

## Configuration

| File             | Purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `manifest.js`    | Extension manifest definition (permissions, icons, background, DNR rules) |
| `vite.config.js` | Vite build config with CRXJS plugin, Tailwind, static copy                |
| `package.json`   | Dependencies, scripts, version info                                       |

### Permissions

The extension requests:

- `tabs`, `storage`, `webRequest`, `webNavigation`
- `declarativeNetRequestWithHostAccess`
- `scripting`, `sidePanel`
- Host permissions: `http://*/*`, `https://*/*`

---

## Contributing

Contributions are welcome! Since this project is based on [I Still Don't Care About Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies), please ensure any contributions comply with the GPL-3.0 license.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Privacy

This extension respects your privacy:

- No personal data is collected or transmitted
- All blocking rules run locally on your machine
- No analytics or tracking embedded in the extension itself

---

## License

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](LICENSE) file for details.

Original project: [I Still Don't Care About Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies) (GPL-3.0)

---

## Support

- 🐛 **Report Bugs**: [Open an issue](../../issues)
- 💡 **Feature Requests**: [Open an issue](../../issues)
- 📧 **Contact**: Via GitHub Issues

---

**Enjoy browsing without cookie banners!** 🍪🚫
