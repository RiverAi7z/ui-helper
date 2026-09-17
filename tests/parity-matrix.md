# Refactor parity matrix

Baseline: `ef46f97`. `npm test`, `npm run check`, and `npm run build` are required
for every pass. Historical native results in `native-regression-results.md` are
not evidence that a new refactor passed.

| Pass | Current behavior | Structural change | Parity gate |
| --- | --- | --- | --- |
| 1: dead code | Same recording controls and styling | Remove unreferenced CSS and unused local arguments; audit old harnesses | Usage audit; sidebar harness |
| 2: export | Exact Markdown, saved-only export, copy/reset order | Extract formatting and DOM compaction | Golden Markdown and compaction fixtures; browser clipboard/reset |
| 3: dependencies | Same style list/color handling | Neutral style module, compatibility re-exports | Style/color fixtures; check/build; editor controls |
| 4: DOM edits | Same original values/priorities, saved baseline, preview and replacement | Annotation model and apply/restore helpers | Helper tests; native save/reopen/cancel, replacement, flex/grid and slot cleanup |
| 5: content views | Same hit testing and gesture events | Extract Box/InspectorTip/ElementTransform without moving state | Browser move/eight handles/cancel, scroll, 50/100/200% native zoom |
| 6: panel transport | Same retries, pending requests, user gestures | Extract transport hook, retain UI ownership | Fake ports/timers plus native restart, tabs, close/reopen and permissions |
| 7: recording | Same crop rounding, encoder and draft handling | Pure capture geometry first; lifecycle separately | Geometry fixtures; real Window/Area GIF, manual/timed stop, draft during encoding |
| 8: routing | Same messages and port/tab ownership | Typed envelopes and focused worker handlers | Strict test loader; routing, stale replies, wrong-port and multi-window checks |
| 9: presentation | Same cascade and component props | Component files first; CSS split separately | UI snapshots, narrow toolbar/popovers, page-style and zoom isolation |

## Browser checks

- `node tests/sidepanel-harness.mjs` serves production bundles on port 5186.
  `tests/ego-sidebar.js` uses p1 (page), p2 (panel) in one Ego space. Capture,
  transport and file access are mocked, not native-extension evidence.
- Native scripts require a user-authorized activeTab and recording directory.
  Run `ego-native-regression.js`, `ego-native-element-matrix.js`,
  `ego-native-recording.js`, `ego-native-lifecycle.js`, and `ego-native-close.js`.
- The native matrix's `.profile-copy` parent is a known hit-testing skip, not a pass.
- Older page-injected scripts (including `ego-element-matrix.js`) assume the old
  page-owned editor. Do not delete them until unique cases are mapped to maintained
  native/two-document coverage. Do not list them as passing current regression tests.

## Acceptance

Record commands and results in `refactor-results.md`. Separate automated checks,
mocked-browser checks, and real-extension checks. Leave unrun gates pending; do
not infer native permission, encoding or worker-lifecycle parity from the harness.
