# UI Helper

A Chrome/Edge visual feedback extension for local front-end projects. Select DOM elements, preview style changes, annotate regions, record GIFs, and copy complete context for a coding agent.

## Install before Chrome Web Store approval

Until the Chrome Web Store review is complete, install the signed-off GitHub build manually:

1. Open the [latest GitHub release](https://github.com/RiverAi7z/ui-helper/releases/latest).
2. Download `ui-helper-v0.1.4-chrome.zip` and unzip it.
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

1. Open the local page you want to review and click the UI Helper extension icon.
2. Hover and select an element. Drag the selected area to move it, or drag its eight edge/corner handles to resize it. You can also adjust values in the editor, then save the annotation. Selecting the same element again reopens its existing annotation instead of creating a duplicate. Mouse changes are included in **Copy for AI**; Cancel restores the previous styles. Enable style-change preview to use the drag handles.
3. Use the region tool for layout areas or canvas content.
4. Click Record when a problem involves motion, then choose **Window** for the visible web page or **Area** to drag a recording rectangle. The first recording opens Chromium's project-folder permission dialog directly over the current page. GIFs are written to `.ui-helper/recordings/`.
5. After the GIF is saved, describe the issue in the recording annotation editor. Click a red GIF label later to edit its annotation.
6. Click **Copy for AI** and paste the resulting Markdown into an Agent running at the project root. The clipboard includes all DOM/style context, recording annotations, and `@.ui-helper/recordings/…gif` references.

Copying annotations never requires folder access, a local server, a pairing token, or a command-line process.

## Commands

```bash
npm run dev
npm run test-page # http://127.0.0.1:5173
npm run check
npm run build
```
