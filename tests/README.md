# Test entry points

## Automated (no browser)

```sh
npm test
npm run check
npm run build
```

`*.test.mjs` uses Node's test runner. `helpers/load-typescript.mjs` transpiles and
loads actual local TS modules in an isolated VM with explicit browser mocks;
unmocked package imports fail instead of silently resolving to unrelated modules.
No new test framework or dependency is required.

## Maintained two-document browser harness

```sh
npm run build
node tests/sidepanel-harness.mjs
```

Create one Ego task space with p1 (page) and p2 (panel), then run each script with
`globalThis.uiHelperTestSpace` set to that numeric space ID:

- `ego-sidebar.js`: toolbar widths, selection/save/cancel, CSS-zoom isolation,
  recording file references, delete and clipboard/reset.
- `ego-feedback-regression.js`: nested resize-slot hiding and cleanup, GIF comment
  typing, save/reopen/cancel.
- `ego-refactor-parity.js`: move/all eight resize handles, neighbors and original
  node identity, cancellation, clipboard failure, real-DOM long-HTML compaction,
  and draft selection during delayed encoding.

These tests use real production UI in separate documents, but mock Chrome
transport/capture/file permission. They are **not** loaded-extension tests.
Clipboard checks can replace the system clipboard with test feedback.

## Real native extension

See [native regression instructions](native-regression-results.md) and the six
`ego-native-*.js` scripts. They require the loaded extension, a user action granting
activeTab, and a user-authorized directory for recording. Do not substitute mocked
browser permissions for these checks. Run `ego-native-recording-controls.js` after
folder authorization (and before `ego-native-close.js`, which recreates the panel
and loses its in-memory directory handle). Current refactor results and real GIF
artifacts are documented in [native refactor results](native-refactor-results.md).

## Legacy page-only scripts (retained, not current pass evidence)

The following inject/mock a page-owned editor and select panel buttons in the
page document. They predate the native-panel boundary and need porting before use:

- `ego-element-matrix.js`
- `ego-flex-resize.js`
- `ego-grid-resize.js`
- `ego-recording-edit.js`
- `ego-resize-lifecycle.js`
- `ego-unique-annotation.js`

Their cases are useful reference material. Map unique coverage to the native or
two-document suites before deletion; a similar filename is not proof of parity.

For refactor contracts, gates and actual results, see [parity matrix](parity-matrix.md)
and [refactor results](refactor-results.md).
