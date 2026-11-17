# Compatibility and verification

Verified against **DeepSeek Harness Desktop 0.2.2-rc.3** (profile `web`, isolated
`DSH_HOME`, Chromium 1254). The bundle declares
`engines.dsh: ">=0.2.2-rc.3 <0.3.0"`; the selector audit below is the upgrade
gate for a newer release.

## 1. Which "update version" dialog is fixed

The installed release has two unrelated update surfaces:

| Surface | Owner | DOM | Reachable in the `web` profile |
| --- | --- | --- | --- |
| `HostReleasePrompt` in `@deepseek-ai/dsh-client-ui-settings-general` | Client plugin, `shell.overlay` slot | Yes: a `Modal` with `role="dialog" aria-modal="true"`, two text buttons in the footer, `data-modal-autofocus` on "Not now" | Yes — shown when the page's Host release changes |
| Desktop updater window opened by `desktop-update-source.ts` → `bridge.open()` | Electron shell/preload | **No client DOM** | No (bridge is absent in a browser) |

`dsh-i18n-layout-fix` fixes the client-owned dialog. The shell updater is an
Electron window that the page neither renders nor styles; the installed
release exposes no client extension point for it (`dshDesktop.updates` only has
`status`, `subscribe` and `open`), so a CSS plugin cannot reach it without
modifying the shell.

**Criterion status:** the Web-client update-version dialog is fixed and
verified. The Electron-shell updater is **not** fixed by this plugin and is
reported as a partial fulfilment of the original criterion. No owner
screenshot or Desktop version was available during this implementation to
confirm that the reported dialog was the shell window; the web dialog is the
one this plugin can prove.

Evidence at 1440×900, `ru-RU`, before the plugin:

```json
// HostReleasePrompt footer, shipped Button (height:36px, footer nowrap)
{"text":"Не сейчас","w":95.6,"h":36,"scrollHeight":39,"lines":2,"clipped":true}
{"text":"Перезагрузите, чтобы загрузить новую версию","w":328.4,"h":36,"scrollHeight":40,"lines":2,"clipped":true}
```

After the plugin: the footer wraps, buttons grow (`35px` / `44px`), both text
ranges end above the button box, and both buttons stay inside the dialog
(clipped: false). See `tests/ui/update-dialog.spec.ts`.

### How the real notification is reproduced

The page's release gate (`ReleaseChangeGate`) reacts to the graph frame that the
Host broadcasts on the public SSE route `plugins/events`. The E2E harness boots
the Host, lets the page subscribe (first `/plugins/events` request is passed
through to the real server), then restarts the Host on the same port and
`DSH_HOME` (the browser keeps its signed auth cookie). The reconnect is served
the *real* next graph frame by the harness, with only `release.commit` changed —
exactly the frame a new Host release produces. No dialog is faked, no Desktop
update is downloaded, and no install action is invoked.

## 2. Locale ownership and the corrected Russian language

`LocaleRuntime.register` enforces one owner per `(namespace, locale)` pair
(`src/client/index.ts:419-422`) and `addLanguage` only adds a catalog entry
(`:276`). The installed release has **no dictionary-overwrite API** and no
`ctx.locale.override`. The plugin therefore uses the official path:

1. Own namespace `dsh-i18n-layout-fix`, registered for `en` and `ru` with
   `ctx.locale.register` disposers.
2. Additional selectable language `ru-x-dshfix`
   (`label: "Русский (исправленный)"`, `fallback: "ru"`) via
   `ctx.locale.addLanguage`.
3. Under **that language only**, an overlay dictionary for the built-in
   `settings` namespace. Plain `ru` keeps the shipped dictionaries; no correct
   built-in translation is replaced.

Audited overlay keys (all are action labels whose shipped Russian is a full
sentence rather than the short imperative the control needs):

| Key | Shipped `ru` | Overlay `ru-x-dshfix` | Why |
| --- | --- | --- | --- |
| `settings/connection.reconnect` | `Соединение отключено, подключитесь снова сейчас` | `Переподключиться` | Rendered as a reconnect action |
| `settings/connection.restart` | `Повторное подключение, повторное подключение сейчас` | `Переподключиться сейчас` | Reconnect action during restart; the shipped text repeats itself |
| `settings/hostRelease.reload` | `Перезагрузите, чтобы загрузить новую версию` | `Перезагрузить страницу` | Rendered as a button label; the shipped text is an instruction sentence |

Everything else in `ru-x-dshfix` falls back to `ru`, then `en`, through the
runtime's normal per-key chain. The language is never selected automatically:
the user enables it from the plugin's Settings → General row ("Enable corrected
Russian") or from the shipped Language row. The switch calls
`LocaleRuntime.setLocale`, the same durable preference write as the built-in
row; `<html lang>` follows.

**Scope reduction (not owner-approved):** choosing plain **Russian** still
uses the built-in `ru` copy because the official runtime refuses a second owner
for `(settings, ru)`. The corrected copy is available only as the opt-in
`ru-x-dshfix` language. This is the maximum reachable through the installed
public API; a true in-place override for `(settings, ru)` remains open until
DSH publishes an override API. The reduction has no explicit owner acceptance
in this run and is recorded as a limitation, not as a completed requirement.

## 3. Layout contract and measured evidence

Selectors (all verified against the running DOM; the E2E suite asserts them):

| Contract | Selector | Effect |
| --- | --- | --- |
| S | `[role="dialog"][data-shortcut-modal="settings"]` | scope marker only; panel sizing stays with SettingsRoot |
| S-children | `S > div, S > nav` | `min-inline-size:0` |
| S-nav cell | `S > nav > div > button` | `height:auto`, `min-block-size:2.5em`, no artificial inline minimum |
| S-nav label | cell `> span:last-child:not([aria-hidden])` | `white-space:normal`, `overflow-wrap:anywhere`, no ellipsis/clip |
| D | `[role="dialog"][aria-modal="true"]:not([data-shortcut-modal]):has(button[data-modal-autofocus]):has(> div:last-child > button + button):has(> div:first-child > div:last-child > div > span[aria-hidden="true"])` | the release prompt: two-button footer **and** the release transition body |
| C | `D > div:first-child` | scroll owner for the content column (`overflow-y:auto`, `min-block-size:0`) |
| A | `D > div:last-child` | `flex-wrap:wrap`, `gap:.5em` |
| A-button | `A > button` | `flex:1 1 12em`, `height:auto`, `min-block-size:2.5em`, wrap, no clip; full-width below 480px |
| forms | `[role="dialog"] :is(form, fieldset)` and `:is(input, select, textarea)` | drop artificial minimums; never shrink below `0` |
| tabs | `[role="dialog"] [role="tablist"] / [role="tab"]` | tab rows may wrap; tab labels wrap instead of clipping |

The settings navigation was the only clipped settings text found in Russian:

```
before: "Встроенные плагины"  label 112px, scrollWidth 138px, ellipsis → clipped
before: "Настройки агента"    label 112px, scrollWidth 115px, ellipsis → clipped
after:  cells 40px/62px, labels wrap, scrollWidth == clientWidth, overflow visible
```

The settings panel's own `max-inline-size`/`max-block-size` are shipped and
already tighter than any viewport-unit value this plugin could add; the plugin
therefore does not restate them. The actual settings overflow mechanism is the
nav cell/label sizing above.

The release prompt is different: the shipped Modal does not cap its height
usefully at a short viewport (measured 284px in a 240px-tall viewport), so `D`
does set `max-inline-size: calc(100dvw - 1rem)` / `max-block-size: calc(100dvh -
1rem)` and the content column owns the scroll. This is asserted by the
`dialogHeight <= 240` and `overflowY: auto` checks in
`tests/ui/update-dialog.spec.ts`.

### Which real dialogs match D

`D` is deliberately narrower than "any modal with two footer buttons". The
release transition body — a grid of spans with two decorative `aria-hidden`
separators rendered by `HostReleasePrompt` — is required. Source inventory for
every `data-modal-autofocus` button in 0.2.2-rc.3:

| Source | Matches D? | Shape |
| --- | --- | --- |
| `settings-general/HostReleasePrompt.tsx` | **yes** | 2 text buttons + release transition body |
| `settings-models/ModelsSection.tsx:737` | no | 2 text buttons, no release body |
| `agent-team/TeamDisableConfirmation.tsx:64` | no | 2 text buttons, no release body |
| `schedule/TaskDetail.tsx:426` | no | footer wraps its buttons in `div.confirmActions`, so the direct-child footer test fails |
| `shortcuts/Reference.tsx:218` (reset confirmation) | no | 2 text buttons, no release body; the headless reference modal at `:155` declares `data-shortcut-modal` and is excluded as well |
| `workspace/WorkspaceDialogs.tsx`, `RenameSession.tsx`, `ImportSessions.tsx`, `plugin-manager`, `directory-picker`, `plugin-market` | no | autofocus is an input/textarea |
| `cua/PermissionPanel.tsx`, `voice-input/VoiceSetupDialog.tsx`, `plugin-manager:1188` | no | single action button |

`tests/ui/regressions.spec.ts` proves the boundary on real components: the
shortcut-reset confirmation is a genuine two-button Modal (count of the generic
shape is 1) but `releaseDialog` is 0 and its footer stays `flex-wrap:nowrap`
with 36px buttons. The settings dialog and a real input-autofocus dialog
(workspace rename) are also asserted untouched. The generic two-button shape is
never used as an acceptance target for the release prompt.

The models-delete and agent-team-disable confirmations are not opened by the
UI suite because they require a custom provider/active team fixture; their
exclusion is guaranteed by the same release-body anchor and their source
structure is listed above. They are **not** claimed as covered regression
targets.

Forbidden by contract and asserted by
`src/client/__tests__/compatibility.test.ts`: bare `button`, CSS-Modules class
substrings, `[data-slot]` guesses, selectors over translated text, `!important`,
`zoom`, `content`. The plugin never registers a `MutationObserver`, never
changes text nodes, handlers, preload or theme preferences. Its own node goes
into `document.head`; it never writes to `#root` and never appends a second
application to `document.body`.

## 4. Test matrix

| Axis | Values |
| --- | --- |
| Width (CSS px) | 320, 480, 768, 1440 |
| Height | 900; 450 (200% zoom equivalent), 360 (settings short viewport), 240 (update-dialog short viewport) |
| Zoom / DPR | 1440×900 at DPR 2; 720×450 layout viewport at DPR 2 (200% zoom equivalence) |
| Text scale | `html { font-size: 200% }` (em-based minimums follow the control font; long labels still wrap without clipping) |
| Locale | `ru-RU` (clipped source language) and `en-US` (regression baseline) |
| Dialogs | real HostReleasePrompt; real settings panel; real shortcut-reset confirmation (generic shape, not D); real preset-guide tab dialog; real workspace rename (non-match); synthetic Modal/tab fixture (unit-level CSS coverage only) |

"Not clipped" is measured with `Range.getClientRects()`: the text's bottom must
not exceed the button's bottom, and `scrollHeight` must not exceed
`clientHeight`. Horizontal overflow is measured with
`document.documentElement.scrollWidth <= clientWidth` and
`scrollWidth <= clientWidth` on each label.

The synthetic form/tab fixture in `tests/ui/layout.spec.ts` is labelled as
unit-level CSS coverage. Real component coverage is:
`regressions.spec.ts` for a settings form, and `layout.spec.ts` for the shipped
preset-guide `role=tablist` at 320px (two tabs, `flex-wrap:wrap`, 60px tall,
unclipped, no page overflow).

Verified on this checkout: 29 unit tests and 19 Playwright tests pass. The update dialog was measured at 1440×900
(`ru-RU`): before the plugin the footer was `nowrap`, both buttons were 36px
tall with `scrollHeight` 39/40 and clipped text; after the plugin the footer
wraps, buttons are 35/44px tall, and every text range ends inside its button
box. The settings navigation changed from `"Встроенные плагины"` at
`scrollWidth 138 / clientWidth 112` with ellipsis to wrapped labels in 40/62px
cells.

## 5. Enable / disable / cleanup

- One `<style data-dsh-i18n-layout-fix="0.1.0">` is appended to `document.head`.
  A stale node of the same namespace is replaced, so repeated HMR generations
  do not accumulate CSS. The disposer removes its own node only.
- Dictionaries, the `ru-x-dshfix` language, and the settings row are registered
  inside `ctx.effect`; disabling the bundle disposes all of them. Ten
  enable/disable cycles are covered by `src/client/__tests__/lifecycle.test.ts`.
- Removing the active `ru-x-dshfix` language follows the runtime's standard
  transition: the catalog entry disappears, the page falls back to the
  browser-derived locale, and the stored preference is not cleared. Re-enabling
  the bundle registers the language again, so the stored id resolves again.
- A failure while acquiring a later dictionary rolls back the style and the
  earlier dictionaries before the plugin fiber fails.
- No engine source file, profile file, preload or theme preference is modified.

## 6. Selector audit for a new DSH release

Before widening `engines.dsh`:

1. Build a fresh isolated `DSH_HOME` and open Settings in `ru-RU`.
2. In DevTools run:
   `document.querySelectorAll('[role="dialog"][data-shortcut-modal="settings"] > nav > div > button').length`
   and check the nav cell/label structure.
3. Open the Host release prompt (restart the Host with a changed graph release)
   and check
   `document.querySelectorAll('D').length` with the exact `D` above, the
   content/footer child order, and the footer's direct buttons.
4. Run `tests/ui/update-dialog.spec.ts`, `tests/ui/regressions.spec.ts` and
   `tests/ui/layout.spec.ts`.
5. Update this document with the new measured baseline. If the release prompt
   loses its transition body, `D` stops matching: move the anchor to the new
   stable marker and re-run the regression matrix before shipping.
