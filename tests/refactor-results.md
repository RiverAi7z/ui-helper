# Refactor implementation and validation

Baseline: `ef46f97` (v0.2.0). No dependency, manifest, permission, minimum-browser,
shared-package API, component-prop, or wire-format migration was performed.

## Review by pass

| Pass | Implementation | Validation |
| --- | --- | --- |
| 1: dead code / stale paths | Removed unused `.ui-separator`, recording-editor `origin` argument and unused click argument. Corrected README ownership description and stale selectors/document targets in two maintained browser scripts. Retained dynamic resize classes and compatibility fallbacks. | Repository usage search; browser sidebar and feedback regressions |
| 2: export | `lib/feedback-markdown.ts` separates formatting; `lib/compact-html.ts` retains browser DOM compaction. Export/reset orchestration remains content-owned. | Golden Markdown fixture, compaction boundary/fallback tests, browser long-HTML export, clipboard success/reset and failure/retention |
| 3: dependencies | `lib/style-properties.ts` owns property metadata/color conversion; `dom.ts` retains compatibility re-exports. Panel code no longer imports content utilities. | Exact property list and conversion fixtures; workspace type checks |
| 4: annotation edits | `content/annotations.ts` owns annotation models, creation, geometry, deltas, apply/restore helpers. Equivalent reapply paths share `applyAnnotationEdits`; original ordering/guards retained. | Helper tests for priorities, removal, text guards, baseline reapply, scroll coordinates; browser cancellation, node identity and slot cleanup |
| 5: content views | `content/overlays.tsx` and `content/element-transform.tsx` extract views/gestures without changing controller effects or selection ownership. | Emitted-function comparison against baseline; browser move/all eight handles, neighbor layout and DOM identity |
| 6: panel transport | `lib/use-panel-connection.ts` owns port/watchdog/heartbeat/reconnect/pending commands. Direct folder-picker and clipboard gestures remain in `sidepanel/main.tsx`. | Deterministic fake-port/timer tests plus real React two-document harness |
| 7: recording | `lib/capture-geometry.ts`, `recording-limit.ts`, and `recording-client.ts` isolate crop math, distinct limit conversions, and encode/save message workflow. Content retains selection refs, timer effects, and completion-time draft checks. | Geometry/limit/message/error fixtures; browser draft opened during delayed encoding, GIF annotation typing/cancel and file-reference deletion |
| 8: worker routing | Typed existing port envelopes; `lib/background-recording.ts` extracts the capture bridge. Test loader now resolves actual local TS modules instead of substituting connectPage for every import. | Missing tab/capture errors/offscreen reuse tests; routing tests including stale attachments, multi-window isolation and wrong-port file replies |
| 9: presentation | Toolbar/recording editor moved to dedicated modules with stable re-exports. Shared CSS split into seven ordered modules under `lib/styles/`; content CSS remains a compatibility entry point, panel imports the neutral stylesheet. | Compiled panel CSS byte-for-byte identical before/after splitting; emitted component comparisons; 320/360/480px toolbar and page-CSS-zoom isolation |

The controller intentionally still owns coordinated React state/effects. This is
not a state-machine rewrite. Theme declarations in `:host` and panel `:root` remain
separate to keep the cascade unchanged; deduplicating those declarations is a
follow-up visual pass, not a claimed change here.

## Executed checks

- Initial automated baseline: **9 tests passed**, workspace type checks and build
  passed. Corrected `ego-sidebar.js` passed against the baseline production bundle
  before production refactoring.
- Final automated suite: **36 tests passed** (`npm test`).
- `npm run check`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- `ego-sidebar.js`: passed against refactored production bundles.
- `ego-refactor-parity.js`: passed against refactored production bundles.
- `ego-feedback-regression.js`: passed after correcting its stale selectors.
- Compared normalized emitted JS for 12 moved functions/components against the
  baseline: annotation creation/normalization/apply/restore/deltas, compactHtml,
  Box, InspectorTip, ElementTransform, Toolbar, RecordingEditor all matched.
- Compared generated `sidepanel-*.css` bytes immediately before and after the CSS
  split (and after formatting): identical. The earlier intentional removal of the
  unused separator rule is not included in this equality claim.

Browser tests used one Ego space (16), p1 as inspected page and p2 as panel, with
production bundles served by `sidepanel-harness.mjs`. Chrome transport/capture and
file permission/writing are **mocked**. DOM layout, pointer/keyboard interactions,
React rendering, HTML compaction and clipboard interaction are real.

## Native-extension follow-up completed

After the user granted activeTab and authorized a recording folder, all five
original native suites and the added `ego-native-recording-controls.js` passed
on the actual refactored extension in Ego task space 17. The element matrix is
**20 passed, 1 known hit-testing skip, 0 failures**. Three real GIF files were
verified independently with ffprobe; deletion retained the local GIF unchanged.

See [native refactor results](native-refactor-results.md) for the complete scope,
artifact paths, loaded-bundle SHA-256 and remaining compatibility/error-path gaps.
These are new native results, separate from the earlier mocked tests above.

The extraction does not justify deleting old page-only scripts until their
unique cases have been mapped to maintained coverage. See `README.md` in this
folder for the supported/legacy distinction. Framework/dependency upgrades,
protocol/schema changes, runtime validation changes, state architecture changes,
recording-control relocation, and bug fixes remain separate tasks.
