# dsh-i18n-layout-fix Contributor Guide

DSH bundle plugin (`dsh-i18n-layout-fix`) fixing clipped Russian translations in dialogs/settings/tabs and providing the `ru-x-dshfix` ("Русский (исправленный)") locale. See [README.md](README.md), [VERIFICATION.md](VERIFICATION.md), [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md), and [../AGENTS.md](../AGENTS.md).

## Layout

- `src/index.ts`, `src/domain/` (`i18nInstall`, `i18nApply` XState machines), `src/client/`: TypeScript & React sources.
- `scripts/build.ts`, `tsdown.config.ts`, `tsconfig.{json,host.json,client.json}`: builds `lib/index.js`, `lib/client.js`, and `lib/client.graph.json`.
- `locale/`: `en.json`, `ru.json`.
- `tests/` (Vitest unit + `tests/ui/` Playwright), `scripts/__tests__/release-package.test.ts`.

## Invariants

- **Targeted CSS only:** Global styles (including portals) must stay scoped to documented components; never use universal `button` selectors, CSS Module substring hacks, translation-text selectors, or `MutationObserver`.
- **LocaleRuntime isolation:** Never overwrite built-in `(settings, ru)` in `LocaleRuntime`; corrected strings live strictly under `ru-x-dshfix` with opt-in activation.
- **Desktop shell boundary:** `HostReleasePrompt` fixes apply to the Web UI dialog; the Electron wrapper update modal (`dshDesktop.updates.open()`) has no client DOM hook.
- **Committed `lib/`:** Commit `lib/` output after edits (`node scripts/build.ts`). Note `release-package.test.ts` handles npm >= 11's object-shaped `npm pack --dry-run --json`.

## Verification

```sh
npm ci
npm run typecheck
npm test          # node scripts/build.ts && vitest run
npm run test:ui   # playwright test (browser UI tests)
```

Sync `../machines` if state machines change, and update `../repositories.json` snapshot metadata when files here change.
