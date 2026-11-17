# Verification

Environment: DeepSeek Harness **0.2.2-rc.3**, isolated `DSH_HOME` under
`.artifacts/e2e-home`, Chromium 1254. The plugin is mounted through the same
loader patch the bundle installer applies
(`- insert: - id: dsh-i18n-layout-fix`); no engine source is modified.

## Results

```
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsc --noEmit -p tsconfig.host.json
./node_modules/.bin/tsc --noEmit -p tsconfig.client.json   # 3 configs pass
node scripts/build.ts                                     # index.js, client.js, graph
npx vitest run                                            # 38 tests, 5 files
npx playwright test                                       # 19 tests, 4 files
node scripts/verify-packages.mjs                          # verify:packages ok
node --test scripts/verify-packages.test.mjs              # 6 tests
```

Dependencies install with plain `npm install` (typescript and vitest are
pinned directly; the upstream pnpm `catalog:` references cannot resolve in this
standalone package).

Unit coverage:

- dictionary parity (keys, placeholders, non-empty copy), corrected-Russian
  overlay audit;
- real `LocaleRuntime`: registration, `ru`/`ru-x-dshfix` switching, fallback to
  built-in Russian, dictionary removal, duplicate-owner throw;
- real Cordis lifecycle: 10 enable/disable cycles, focused style node,
  rollback after a late registration failure;
- XState lifecycle (`xstate@5.33.4` bundled into `lib/client.js`): the install
  and apply machines walk installing → active → disposed and the rollback paths;
  reverse-order rollback of every acquired resource, original-error
  preservation, double-dispose idempotence, settings-row mount failure, and
  illegal-transition rejection.
- stylesheet scope allowlist, release-body anchor, no shipped-sizing restatement,
  forbidden-selector checks;
- release manifest/patch/metadata, built client graph, inlined CSS, tarball
  file list.

UI coverage (real running application):

| Spec | What passed |
| --- | --- |
| `layout.spec.ts` | settings dialog and nav labels at 320/480/768/1440; 200% zoom equivalent (720×450 @ DPR 2); 200% text scale; English baseline; **real preset-guide tablist** at 320px (2 tabs, wrap, 60px, unclipped); synthetic form/tab fixture (unit-level CSS only); short-viewport scroll owner |
| `update-dialog.spec.ts` | real `HostReleasePrompt` after a Host release change: both Russian buttons visible, wrapped, unclipped, inside the dialog; 240px-tall viewport caps the dialog and scrolls its content; safe autofocus on "Не сейчас"; Escape dismisses with zero navigations; reload navigates exactly once; no Desktop download request; corrected-Russian overlay label |
| `lifecycle.spec.ts` | exactly one style node and one row while enabled; with the patch absent there is no style, no row, and the shipped ellipsis clipping returns |
| `regressions.spec.ts` | settings dialog excluded from D; **real shortcut-reset confirmation** is a genuine two-button Modal (generic shape count 1) but not D: footer stays `nowrap`, buttons 36px, `overflow-wrap:normal`, `flex:0 1 auto`; workspace rename untouched; real settings form input capped at its column |

Measured before/after for the update dialog at 1440×900, `ru-RU`:

```
before  footer nowrap, buttons 36px, scrollHeight 39/40, text clipped: true/true
after   footer wrap,   buttons 35/44px, text ranges end inside the box, clipped: false
short   before: dialog 284px in a 240px viewport; after: <=240px, content overflow-y:auto
```

Measured before/after for settings navigation at 1440×900, `ru-RU`:

```
before  "Встроенные плагины" scrollWidth 138 > clientWidth 112, ellipsis
after   labels wrap, cells 40px/62px, scrollWidth == clientWidth
```

## Boundaries

- The client `HostReleasePrompt` is fixed and reproduced from a real Host
  release notification. The Electron-shell updater opened by
  `dshDesktop.updates.open()` has no client DOM and no installed extension
  point; it is **not** fixed. The update-dialog criterion is therefore only
  partially fulfilled.
- The official locale runtime refuses a second owner for `(settings, ru)`, so
  corrected Russian ships as the opt-in `ru-x-dshfix` language. Plain `ru` is
  unchanged. This scope reduction has no explicit owner acceptance.

## Installation in current profile

On 2026-11-16 the built local directory was installed into the active `web`
profile with the official `plugin_manager` `install_bundle` action. It returned
`stage: enable`, `application: applied`, `enabled: true`, no warnings, and a
successful package operation. The linked package points to this workspace.
This confirms official installation and Host application; the connected Web
page's visual state after refresh has not been independently observed.

## Reproduce

```bash
DSH_HOME=$PWD/.artifacts/e2e-home dsh --profile e2e \
  --patch .artifacts/e2e-plugin.patch.yml --port 3996 --no-open
npx playwright test
```

The Host prints its own URL/token; the test harness reads the URL inside the
test process and never writes the token into test output.
