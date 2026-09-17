# Refactor native-extension regression — 2026-09-17

## Result

**No new product regression found in the exercised scenarios.** All six native
suites passed; the element matrix contains **20 passes, 1 explicit known skip,
0 failures**. This is evidence for the cases below, not a guarantee for every
website, browser version, operating system, or permission-dialog failure mode.
No production-code change was needed during this native verification.

## Environment and provenance

- Ego Lite / Chromium 152, macOS; a single task space **17** throughout the run.
- Real unpacked UI Helper `poabincophklgfndilijfgkiombejogo`, reloaded from
  `apps/extension/.output/chrome-mv3` to **0.2.0** before testing.
- p1: `http://127.0.0.1:5173/`; p2: agent-owned extension-management/control tab.
- Actual native Side Panel, Chrome ports, activeTab, clipboard, tabCapture,
  offscreen GIF encoder and local file writes. No transport/capture/file mocks.
- User clicked the extension icon and completed the real directory authorization.
  Recording initially waited on the picker; automation handed control back and
  resumed only after the user completed it. That attempt is not counted as a pass.
- Loaded content bundle SHA-256 matched the local production bundle exactly:
  `052bd49e2c1e266d0e0663bfb6993e52ede01d69c8bb194b3d897ab2bb6d3873`.
- Native-view focus emulation was enabled only during each suite and disabled in
  cleanup. The close/reopen suite used the actual sidePanel API, not a mock.

## Executed native suites

| Suite | Checked behavior | Result |
| --- | --- | --- |
| `ego-native-regression.js` | Selection suppresses page clicks; unique annotations; save/reopen/cancel; text, color, font, weight, opacity, border and spacing controls; popover/select; preview/restore | PASS |
| same | Move and all 8 resize handles; neighbors/parent remain stable; cancellation removes slots | PASS |
| same | Actual browser zoom 50%, 100%, 200%; stable panel dimensions/toolbar; aligned outlines; unchanged page body styles | PASS |
| same | Region annotation; actual clipboard Markdown; reset after copy; foreign-host collision and repeated injection | PASS |
| `ego-native-recording.js` | Real Window GIF, timed stop, editing during capture, preserved draft; Area crop, manual stop; annotation and exported paths/region | PASS |
| `ego-native-element-matrix.js` | Flex/grid/block/inline/nested/absolute/canvas/progress move, resize, surrounding layout and original DOM restoration | 20 PASS, 1 SKIP |
| `ego-native-lifecycle.js` | Linked dimensions/padding; actual worker termination and restart; reconnect with draft/styles; post-reconnect save; unauthorized-tab guidance, Retry, no leaked editor state; delete/restore; reload reconnect | PASS |
| `ego-native-recording-controls.js` | Page-owned options toggle/close; pointer drag; duration `00→20`, `99→60`, `1→1`; real recording after worker restart with retained directory; GIF save/reopen/cancel/delete; marker/count cleanup; byte-identical saved file after delete; empty export error | PASS |
| `ego-native-close.js` | Native panel close deactivates page interception/overlays; reopen restores draft | PASS |

The full matrix data is preserved in [native-refactor-matrix.json](native-refactor-matrix.json).
The `.profile-copy` parent's children cover its entire hit area; there is no direct
clickable point. This is the previously documented limitation. Its child text and
containing card passed. The test now skips only that precise hit-testing error,
not arbitrary future failures on that selector.

## Actual GIF artifacts

Saved in the user-authorized project `.ui-helper/recordings/` directory. Metadata
below was independently read with `ffprobe -count_frames`.

| File | Dimensions | Frames | Duration |
| --- | --- | --- | --- |
| `recording-20260917170054-a27eb7.gif` | 960×634 | 19 | 3.23 s |
| `recording-20260917170055-1eed15.gif` | 648×432 | 1 | 0.17 s |
| `recording-20260917170321-7fe3d9.gif` | 960×634 | 7 | 1.19 s |

The Area recording corresponds to a 300×200 CSS-pixel region and retains its 3:2
aspect ratio. The immediately stopped Area recording intentionally has one frame.
The Window recording's first frame was decoded with ffmpeg and visually inspected:
it contains the inspected page, not the native sidebar. The third GIF was removed
from feedback through the real UI, then re-read from disk: **165,983 bytes remained
byte-for-byte unchanged**, as required by the delete contract.

## Test maintenance during verification

- Updated `ego-native-recording.js` to operate Window/Area/duration in the page's
  floating controls rather than the old panel location. This fixes stale test
  assumptions; product UI was not moved.
- Added `ego-native-recording-controls.js` for controls, retained folder access after
  worker restart, real GIF comment lifecycle, file retention and empty export.
- Tightened the matrix's known-skip classification and added explicit totals;
  reran the full matrix after that change.
- Automated checks were rerun: **36/36 tests**, workspace type checks, build and
  diff whitespace checks passed. Earlier mocked-browser results remain separate
  in [refactor-results.md](refactor-results.md).

## Boundaries of this sign-off

The existing covered flows show no observed regression. This run does not claim
exhaustive coverage of OS picker cancellation/denial, disk-full errors, arbitrary
third-party sites, minimum-version Chrome 116, Edge, multiple monitors or every
recording timing race. Those remain separate compatibility/error-path checks.
