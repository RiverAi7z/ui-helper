# Native Side Panel regression — 2026-09-17

## Environment and method

- Ego Lite, real unpacked extension `poabincophklgfndilijfgkiombejogo` loaded from `apps/extension/.output/chrome-mv3`.
- Actual inspected page: `http://127.0.0.1:5173/`; not the mocked `5186` transport harness.
- Used real Chrome runtime ports, activeTab permissions, Side Panel, clipboard, tabCapture, offscreen encoder, and a user-authorized project directory. No messaging, recording, or file-system stubs in these native runs.
- The user clicked the extension action to grant activeTab and completed the real directory permission dialog. Ego's native-view focus emulation was enabled only during automation because agent-space focus hides browser-chrome views; it was disabled afterwards.

## Defects fixed

1. **Infinite Connecting on the 5186 harness page.** Its page-world script creates `ui-helper-root`, so the previous DOM-only guard caused the isolated-world extension to skip installing its listener. Mount ownership now lives in the extension's isolated global, not a page-controlled tag. Invalidation unmounts the owned React root.
2. **One-shot readiness race.** Injection completion does not mean React has registered its message listener. A bounded main-frame handshake retries after injection instead of waiting forever for one `PANEL_READY` notification. Both receiver and injection timeouts produce actionable errors; the frontend also has a connection watchdog and Retry button.
3. **Disconnected sidebar after MV3 worker suspension.** Added bounded automatic port reconnection and recovery on becoming visible. Existing page drafts and the current sidebar's directory handle survive a port reconnect. Verified by actually terminating the extension worker and observing a new worker and successful subsequent edits.

## Verified in the real extension

| Area                                                                                       | Result |
| ------------------------------------------------------------------------------------------ | ------ |
| Open/connect; page refresh without another permission click                                | PASS   |
| Same-name foreign DOM node; repeated content-script injection                              | PASS   |
| Unauthorized tab, Retry error, return to original tab; no cross-tab editor leakage         | PASS   |
| Actual worker termination and automatic reconnect with draft/style preservation            | PASS   |
| Actual native sidebar close/open, interception cleanup and draft restoration               | PASS   |
| Inspect without triggering page buttons; unique annotations; save/reopen/cancel/delete     | PASS   |
| Text, text color, font, weight, font size, opacity, borders, padding and margin fields     | PASS   |
| Select/popover controls, linked aspect ratio, linked padding                               | PASS   |
| Preview hide/show and original DOM/style restoration                                       | PASS   |
| Move and all eight resize handles; neighbor layout preservation; placeholder cleanup       | PASS   |
| Real browser tab zoom 50%, 100%, 200%; panel size/font unchanged; outline alignment        | PASS   |
| Copy for AI stays on the same toolbar row                                                  | PASS   |
| Region annotation; actual OS clipboard contents and copy/reset                             | PASS   |
| Window GIF: real tab capture, timed stop, encoding and file save                           | PASS   |
| Edit during capture; preserve an active annotation draft when capture finishes             | PASS   |
| Area GIF: rectangle crop, manual stop, recording notes and exported file/region references | PASS   |

## Element matrix

`ego-native-element-matrix.js`: **20 passed, 1 explicitly skipped**. Headings, paragraphs, flex buttons/text/avatar, grid swatches/panels/items/navigation, nested/block cards, box-model containers, absolute decoration, canvas, progress block and inline text all moved/resized/restored without changing their neighbors.

Skipped `.profile-copy`: its children cover the whole parent's hit area, so the inspector cannot select that parent by clicking it. This is an existing hit-testing limitation, not a passing test. The two child text elements and containing card were covered. Test scrolling is instant to avoid selecting the wrong element while smooth wheel scrolling is still moving.

## Actual generated artifacts

Saved in the project directory chosen in the real file picker:

- `.ui-helper/recordings/recording-20260917125438-f730d6.gif`: **960×608, 19 frames, 3.23 seconds**. Verified with ffprobe; inspected its first frame and confirmed the native sidebar is not captured.
- `.ui-helper/recordings/recording-20260917125441-828682.gif`: **648×432, 1 frame, 0.17 seconds** (manual stop immediately after starting). Its aspect ratio matches the selected **300×200 CSS-pixel** region. Verified with ffprobe and exported Markdown.

The recordings remain in the gitignored recordings directory for inspection. Native tests do not claim coverage of every website or OS-specific permission-dialog cancellation flow.

## Reproducible checks

- `npm run check`
- `npm test` — 8 connection/routing unit tests, including delayed readiness, unresponsive receiver/injection and cancelled tab attachment.
- `npm run build`
- `tests/ego-native-regression.js` — core editing, zoom, clipboard and mount collision.
- `tests/ego-native-element-matrix.js` — 21-case matrix (20 pass, 1 skip).
- `tests/ego-native-recording.js` — real capture and saving, after the user chooses a folder.
- `tests/ego-native-lifecycle.js` — linked fields, worker restart, two-tab isolation, deletion and reload.
- `tests/ego-native-close.js` — native close/reopen; closes its agent-owned control tab afterwards.

Native scripts take `uiHelperTestSpace` and `uiHelperProjectRoot` globals and reuse a single Ego space. `p1` is the authorized test page; lifecycle/close tests also need an agent-owned `p2` in the same browser window. The separate `ego-sidebar.js` / `sidepanel-harness.mjs` tests are still mocked integration tests and are not the evidence for the native results above.
