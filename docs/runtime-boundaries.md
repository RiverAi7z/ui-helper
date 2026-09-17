# Runtime boundaries

| Runtime | Owns | Must not move across the boundary |
| --- | --- | --- |
| Content (`content/App.tsx`) | DOM identity, original styles/text, annotation drafts, overlay gestures, recording UI state, export/reset | HTMLElement references, resize slots |
| Native panel (`sidepanel/main.tsx`) | Editor UI, optimistic typing, port connection, clipboard, directory picker/handle, GIF file writing | FileSystemDirectoryHandle |
| MV3 worker (`background.ts`) | Window/tab routing, activeTab injection/readiness, port ownership, file request correlation, capture startup | Panel port instances |
| Offscreen (`offscreen/main.ts`) | MediaStream, video/canvas, GIF encoder, frame timer | MediaStream and encoder state |

## Existing protocol

Panel port name: `ui-helper-panel`. Payload shapes live in `lib/panel-protocol.ts`
and `packages/shared/src/index.ts`; extraction must not rename messages or keys.

- Panel → worker: `PANEL_HELLO {windowId, visible}`, `PANEL_VISIBLE {visible}`,
  `PANEL_PING`, `PANEL_COMMAND {id, tabId, command}`,
  `PANEL_FILE_RESULT {id, result}`.
- Worker → panel: `PANEL_LOADING {tabId}`, `PANEL_STATE {tabId, state}`,
  `PANEL_ERROR {tabId, error}`, `PANEL_RESULT {id, result}`,
  `PANEL_SAVE_GIF {id, dataUrl, filename}`.
- Worker → content: `PANEL_ATTACH`, `PANEL_VISIBILITY {active}`,
  `PANEL_COMMAND {command}`. Content responds asynchronously for commands.
- Content → worker: `PANEL_READY` (best effort), `PANEL_STATE {state}`,
  `PANEL_SAVE_GIF {dataUrl, filename}`, `START_RECORDING {crop}`,
  `STOP_RECORDING`.
- Worker → offscreen: `START_CAPTURE {target: "offscreen", streamId, crop}`,
  `STOP_CAPTURE {target: "offscreen"}`.

State is JSON-only. Commands with selection IDs are rejected when stale. Worker
routing rejects commands targeting a different tab; main-frame checks gate page
state and file requests. File replies belong to their originating port.

## Timing and lifecycle constraints

- `chrome.sidePanel.open` runs synchronously in the extension-action gesture.
- `connectPage` retains bounded readiness probing/injection and generation checks.
- Panel initial watchdog: 6 seconds; command timeout: 120 seconds; file-save
  timeout in worker: 60 seconds; heartbeat: 20 seconds.
- Automatic reconnect delays: 250, 500, 1000 ms. A successful state resets attempts;
  visibility recovery/manual Retry also reset attempts.
- Disconnect resolves pending commands as failures and clears timers. Worker
  disconnect fails its owned file requests and hides the page UI.
- Ref-backed current selection/state prevents stale asynchronous callbacks from
  dismissing newer drafts. Preserve effect dependencies and mutation ordering
  when extracting code; a state-machine rewrite is a separate architecture task.

## Separate migrations

Framework/dependency upgrades, replacement test runners/state libraries, stricter
runtime payload rejection, schema changes, relocation of page recording controls,
new persistence, capture/transport replacement, and privacy behavior changes need
separate proposals. A refactor must not broaden permissions or change public APIs.
