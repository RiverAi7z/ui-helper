# UI Helper

A Chrome/Edge visual feedback extension for local front-end projects. Select DOM elements, preview style changes, annotate regions, record GIFs, and copy complete context for a coding agent.

## Install before Chrome Web Store approval

Until the Chrome Web Store review is complete, install the signed-off GitHub build manually:

1. Open the [latest GitHub release](https://github.com/RiverAi7z/ui-helper/releases/latest).
2. Download `ui-helper-v0.2.0-chrome.zip` and unzip it.
3. Open `chrome://extensions` in Chrome or Edge.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the unzipped folder.
6. Pin **UI Helper**, open the local page you want to review, and click the extension icon.

Chrome may show a developer-mode warning because this build has not been verified by the Chrome Web Store. Only install release files from this repository. To update, download the newest release, replace the extracted folder, and click **Reload** on the extension card.

## Build from source

```bash
npm install
npm run build
```

Load `apps/extension/.output/chrome-mv3` from `chrome://extensions` with **Developer mode → Load unpacked**.

## Usage

1. Open the local page you want to review and click the UI Helper extension icon. Tools and editors open in the browser's **native Side Panel** (Chrome/Edge 116+). The browser allocates a separate viewport, so page zoom does not scale UI Helper and no page layout styles are changed. Use the browser's sidebar × button to close it. The sidebar side/width follows browser settings. When switching to a tab without permission, click the extension icon again to connect it.
2. Hover and select an element. Drag the selected area to move it, or drag its eight edge/corner handles to resize it. Mouse resizing keeps the original layout footprint in an inert placeholder so neighboring elements do not reflow; the real DOM element and its event listeners are retained. You can also adjust values in the editor, then save the annotation. Selecting the same element again reopens its existing annotation instead of creating a duplicate. Mouse changes are included in **Copy for AI**; Cancel restores the previous styles. Enable style-change preview to use the drag handles.
3. Use the region tool for layout areas or canvas content.
4. Click Record when a problem involves motion, then choose **Window** for the visible web page or **Area** to drag a recording rectangle. The first recording opens Chromium's project-folder permission dialog from the sidebar. Keep the sidebar and recording tab open until saving finishes. Window capture includes only the page, not the native sidebar. GIFs are written to `.ui-helper/recordings/`.
   While recording, you can still inspect, move and resize page elements, add region annotations, and toggle the eye icon to compare style previews. Starting or stopping a recording preserves the active annotation draft; if a draft is open when recording finishes, use the GIF tag to annotate the recording later.
5. After the GIF is saved, describe the issue in the recording annotation editor. Click a red GIF label later to edit its annotation. The trash button removes that GIF from the current feedback session and its page marker, but keeps the saved local file. Toggle the camera button to open or close recording options.
6. Click **Copy for AI** and paste the resulting Markdown into an Agent running at the project root. The clipboard includes all DOM/style context, recording annotations, and `@.ui-helper/recordings/…gif` references.

Copying annotations never requires folder access, a local server, a pairing token, or a command-line process.

Only selection outlines, transform handles, and annotation markers are injected into the inspected page. Editing controls, file permission dialogs, and clipboard operations run in the separate extension document. Page viewport units, media queries, and fixed positioning remain browser-managed.

## Commands

```bash
npm run dev
npm run test-page # http://127.0.0.1:5173
npm run check
npm run build
npm test # native-panel routing, tab isolation, disconnect and file-request tests
```

### Native sidebar verification

`node tests/sidepanel-harness.mjs` serves the production content-script and panel bundles in separate documents. Run `tests/ego-sidebar.js` in an Ego task space with `p1` and `p2` to check toolbar widths, selection/edit messaging, untouched page styles, isolated page CSS zoom, and mocked recording/file/clipboard flows. Chrome transport and capture are mocked in this harness.

Real loaded-extension coverage and artifacts are documented in [native regression results](tests/native-regression-results.md). The `tests/ego-native-*.js` scripts exercise the actual native panel, messaging, browser zoom, clipboard, recording/file saving and worker restart. They require the user to grant activeTab by clicking the extension icon and to authorize a folder for recording; they do not substitute mocks for those browser permissions.

For a manual smoke test, use `http://127.0.0.1:5173`, reload the unpacked extension **and the inspected page**, open UI Helper, and change page zoom to 50%, 100%, and 200%. Check Copy for AI, switch tabs, then record a short GIF. Port disconnections reconnect automatically; if a page cannot be reached, the panel shows an error and **Retry connection** instead of spinning forever.
