/**
 * Client install lifecycle for `dsh-i18n-layout-fix`.
 *
 * Mirrors `extensions/dsh/machines/machines/dsh-i18n-layout-fix.mjs`
 * (`i18nInstall`): resources are acquired in order (stylesheet, en, ru, added
 * language, corrections); a late failure rolls every acquired resource back,
 * and unload disposes the plugin. Pure `resolveState`/`transition` calls only.
 */
import { createMachine, transition } from "xstate";

export const i18nInstallMachine = createMachine({
  id: "i18nInstall",
  initial: "installing",
  description: "Atomic resource acquisition for the i18n layout fix: active, rolled back, or disposed.",
  states: {
    installing: {
      on: {
        ACQUIRED: "installing",
        ALL_ACQUIRED: "active",
        ACQUIRE_FAILED: "rollingBack",
      },
    },
    rollingBack: {
      on: {
        RELEASED: { target: "rolledBack" },
      },
    },
    active: {
      on: {
        DISPOSE: "disposed",
      },
    },
    rolledBack: { on: { RETHROW: "failed" } },
    disposed: { type: "final" },
    failed: { type: "final" },
  },
});

export type InstallStatus =
  | "installing"
  | "rollingBack"
  | "rolledBack"
  | "active"
  | "disposed"
  | "failed";

export type InstallEvent =
  | "ACQUIRED"
  | "ALL_ACQUIRED"
  | "ACQUIRE_FAILED"
  | "RELEASED"
  | "RETHROW"
  | "DISPOSE";

/** Advance the install machine one event; illegal transitions throw. */
export function nextInstallState(
  status: InstallStatus,
  event: InstallEvent,
): InstallStatus {
  const snapshot = i18nInstallMachine.resolveState({ value: status });
  if (!snapshot.can({ type: event })) {
    throw new Error(`illegal transition: i18nInstall ${status} --${event}-->`);
  }
  return transition(i18nInstallMachine, snapshot, {
    type: event,
  })[0].value as InstallStatus;
}
