/**
 * Host half of `dsh-i18n-layout-fix`.
 *
 * The plugin has no Host configuration: it owns no settings namespace, no
 * Host route and no agent tool. The Host entry exists so the bundle patch can
 * mount the package and its Client module; it deliberately registers nothing.
 *
 * @module dsh-i18n-layout-fix
 */

import type { Context } from "@deepseek-ai/cordis";

/** Cordis plugin name for loader diagnostics. */
export const name = "dsh-i18n-layout-fix";

/**
 * Mount the Host half.
 *
 * @param _ctx - Host plugin context (unused).
 */
export function apply(_ctx: Context): void {
  // Intentionally empty: all behavior lives in the Client half.
}
