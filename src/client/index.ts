/**
 * Client half of `dsh-i18n-layout-fix`.
 *
 * Registers, on the plugin fiber:
 *
 * - one plugin-owned `<style>` node with the scoped layout corrections,
 * - the `dsh-i18n-layout-fix` English and Russian dictionaries,
 * - the optional `ru-x-dshfix` language (fallback `ru`) and its audited
 *   corrections for the built-in `settings` namespace,
 * - the "Layout and localization" row in Settings → General.
 *
 * Every resource is acquired inside `ctx.effect` or `ctx.slots.inject`, so
 * disabling the bundle disposes all of them. A failure while applying the
 * later resources rolls the already acquired ones back before rethrowing.
 *
 * @module dsh-i18n-layout-fix/src/client
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { LocaleRuntime } from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";

import {
  type ApplyStatus,
  nextApplyState,
} from "../domain/machines/apply.machine.ts";
import {
  type InstallStatus,
  nextInstallState,
} from "../domain/machines/install.machine.ts";
import {
  CORRECTED_NAMESPACE,
  en,
  FIX_LANGUAGE,
  NS,
  RU_FIX_CORRECTIONS,
  ru,
} from "./locale.ts";
import { FixStatusRow, type FixStatusInjected } from "./StatusRow.tsx";
import { installLayoutStyle } from "./styles.ts";

/** Services required before the first resource is acquired. */
export const inject = ["locale", "slots"] as const;

/** Settings slot owning the status row. */
export const SETTINGS_SLOT = "settings.general.item";

/** Entry id: the slot row and the patch row share it. */
export const ENTRY_ID = "dsh-i18n-layout-fix";

/** Subset of the locale service used by the resource factory (fake-friendly). */
export type LocaleFace = Pick<LocaleRuntime, "register" | "addLanguage">;

/**
 * Acquire the stylesheet and dictionaries atomically.
 *
 * The factory performs no Cordis registration itself; the caller wraps it in an
 * effect. If any later acquisition throws, the resources acquired so far are
 * released and the error is rethrown, so a partially applied plugin leaves no
 * style or dictionary behind.
 *
 * @param options - document (absent outside a browser) and locale face.
 * @returns disposer releasing the acquired resources in reverse order.
 */
export function installResources(options: {
  document?: Document;
  locale: LocaleFace;
}): () => void {
  const owned: (() => void)[] = [];
  let status: InstallStatus = "installing";

  const acquire = (create: () => () => void): void => {
    try {
      owned.push(create());
      status = nextInstallState(status, "ACQUIRED");
    } catch (error) {
      status = nextInstallState(status, "ACQUIRE_FAILED");
      for (const dispose of owned.reverse()) {
        try {
          dispose();
        } catch {
          // The original failure is the one worth reporting.
        }
      }
      status = nextInstallState(status, "RELEASED");
      status = nextInstallState(status, "RETHROW");
      throw error;
    }
  };

  if (options.document !== undefined) {
    const doc = options.document;
    acquire(() => installLayoutStyle(doc).dispose);
  }

  acquire(() => options.locale.register(NS, "en", en));
  acquire(() => options.locale.register(NS, "ru", ru));
  acquire(() => options.locale.addLanguage(FIX_LANGUAGE));
  acquire(() =>
    options.locale.register(
      CORRECTED_NAMESPACE,
      FIX_LANGUAGE.id,
      RU_FIX_CORRECTIONS,
    ));

  status = nextInstallState(status, "ALL_ACQUIRED");
  return () => {
    if (status === "disposed") return;
    status = nextInstallState(status, "DISPOSE");
    for (const dispose of owned.reverse()) dispose();
  };
}

/**
 * Mount the client half.
 *
 * @param ctx - client Cordis context with `locale` and `slots`.
 */
export function apply(ctx: ClientContext): void {
  const disposed: (() => void)[] = [];
  let status: ApplyStatus = "mounting";

  try {
    disposed.push(
      ctx.effect(
        () =>
          installResources({
            document: typeof document === "undefined" ? undefined : document,
            locale: ctx.locale,
          }),
        "dsh-i18n-layout-fix: stylesheet and dictionaries",
      ),
    );

    disposed.push(
      ctx.effect(
        () => {
          const release = ctx.slots.inject(SETTINGS_SLOT, () =>
            ctx.slots.register(
              {
                name: SETTINGS_SLOT,
                id: ENTRY_ID,
                order: 10.6,
                locale: NS,
                inject: (): FixStatusInjected => ({ locale: ctx.locale }),
              },
              FixStatusRow,
            ));
          return () => {
            release();
            status = nextApplyState(status, "DISPOSE");
          };
        },
        "dsh-i18n-layout-fix: settings row",
      ),
    );

    status = nextApplyState(status, "MOUNTED");
  } catch (error) {
    status = nextApplyState(status, "MOUNT_FAILED");
    for (const dispose of disposed.reverse()) {
      try {
        dispose();
      } catch {
        // Keep the original failure.
      }
    }
    status = nextApplyState(status, "RELEASED");
    throw error;
  }
}
