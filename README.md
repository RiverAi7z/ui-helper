# UI Helper

A Chrome/Edge visual feedback extension for local front-end projects. Select DOM elements, preview style changes, annotate regions, record GIFs, and copy complete context for a coding agent.

## Build

```bash
npm install
npm run build
```

Load `apps/extension/.output/chrome-mv3` from `chrome://extensions` with **Developer mode → Load unpacked**.

## Usage

1. Open the local page you want to review and click the UI Helper extension icon.
2. Hover and select an element, adjust its values in the editor, then save the annotation.
3. Use the region tool for layout areas or canvas content.
4. Click Record when a problem involves motion, then choose **Window** for the visible web page or **Area** to drag a recording rectangle. The first recording opens Chromium's project-folder permission dialog directly over the current page. GIFs are written to `.ui-helper/recordings/`.
5. Click **Copy for AI** and paste the resulting Markdown into an Agent running at the project root. The clipboard includes all DOM/style context and `@.ui-helper/recordings/…gif` references.

Copying annotations never requires folder access, a local server, a pairing token, or a command-line process.

## Commands

```bash
npm run dev
npm run test-page # http://127.0.0.1:5173
npm run check
npm run build
```
