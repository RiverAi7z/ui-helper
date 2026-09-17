# UI Helper Privacy Policy

Effective date: September 4, 2026

UI Helper is a browser extension for collecting visual feedback during front-end development. It lets users inspect page elements, preview style and text changes, annotate regions, record short GIFs, and copy implementation context for a coding assistant.

## Data collection

UI Helper does not collect, transmit, sell, or share personal information or browsing data. It does not use analytics, advertising, tracking, or remote application servers.

## Page access

UI Helper receives temporary access to the active tab only after the user clicks the extension or invokes its keyboard shortcut. It processes selected DOM content, text, computed styles, page metadata, and annotation coordinates locally in the browser to provide its visual feedback features.

This page information is not transmitted by UI Helper. When the user clicks **Copy for AI**, the selected feedback is written to the local clipboard so the user can decide where to paste it.

## Screen recording and local files

A recording starts only after the user explicitly chooses the Window or Area recording option. Recorded frames are processed locally and encoded as a GIF. The GIF is saved only to a project folder selected by the user, under `.ui-helper/recordings/`.

UI Helper does not upload recordings or other project files.

## Data retention

Annotations are kept only in the current page session and are cleared when the user presses Escape, copies the feedback, reloads the page, or closes the tab. Locally saved GIF files remain in the user-selected project folder until the user deletes them.

## Permissions

- `activeTab`: temporarily accesses the page chosen by the user.
- `scripting`: injects selection outlines and page-editing logic after an explicit user action.
- `sidePanel`: displays editing controls separately from the inspected page.
- `tabCapture`: records the current tab after the user starts a recording.
- `offscreen`: processes captured frames and encodes GIF files locally.
- `clipboardWrite`: copies feedback when the user selects Copy for AI.

## Changes to this policy

Material changes to this policy will be published with an updated effective date.

## Contact

For privacy questions, contact the developer through the support channel on the UI Helper Chrome Web Store listing.
