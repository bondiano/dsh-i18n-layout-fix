/**
 * Client `apply()` lifecycle for `dsh-i18n-layout-fix`.
 *
 * Mirrors `extensions/dsh/machines/machines/dsh-i18n-layout-fix.mjs`
 * (`i18nApply`): `apply` wraps `installResources` and the settings row in a
 * second rollback layer. Pure `resolveState`/`transition` calls only.
 */
import { createMachine, transition } from "xstate";

export const i18nApplyMachine = createMachine({
  id: "i18nApply",
  initial: "mounting",
  description: "Client apply(): mount the resource effect and settings row together, or dispose both.",
  states: {
    mounting: { on: { MOUNTED: "active", MOUNT_FAILED: "rollingBack" } },
    rollingBack: { on: { RELEASED: "failed" } },
    active: { on: { DISPOSE: "disposed" } },
    disposed: { type: "final" },
    failed: { type: "final" },
  },
});

export type ApplyStatus =
  | "mounting"
  | "rollingBack"
  | "active"
  | "disposed"
  | "failed";

export type ApplyEvent = "MOUNTED" | "MOUNT_FAILED" | "RELEASED" | "DISPOSE";

/** Advance the apply machine one event; illegal transitions throw. */
export function nextApplyState(status: ApplyStatus, event: ApplyEvent): ApplyStatus {
  const snapshot = i18nApplyMachine.resolveState({ value: status });
  if (!snapshot.can({ type: event })) {
    throw new Error(`illegal transition: i18nApply ${status} --${event}-->`);
  }
  return transition(i18nApplyMachine, snapshot, {
    type: event,
  })[0].value as ApplyStatus;
}
