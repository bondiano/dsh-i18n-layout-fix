/**
 * Dictionaries and the optional corrected-Russian language pack.
 *
 * The client locale service allows one owner per `(namespace, locale)` pair and
 * has no overwrite API. The plugin therefore:
 *
 * 1. owns the `dsh-i18n-layout-fix` namespace (English + Russian), and
 * 2. publishes an additional selectable language, `ru-x-dshfix`, whose
 *    fallback is the built-in `ru`. Only keys proven wrong in the shipped
 *    Russian copy are overlaid for that additional language; plain `ru`
 *    dictionaries stay untouched, so correct built-in translations are never
 *    replaced.
 *
 * See docs/COMPATIBILITY.md for the audit of the overlaid keys.
 *
 * @module dsh-i18n-layout-fix/src/client/locale
 */

import type { LanguageRegistration, LocaleDict } from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";

import enJson from "./locales/en.json";
import ruJson from "./locales/ru.json";
import ruFixJson from "./locales/ru-x-dshfix.json";

/** Namespace owned by this plugin's settings row. */
export const NS = "dsh-i18n-layout-fix";

/** Additional selectable language carrying the corrected Russian copy. */
export const FIX_LANGUAGE: LanguageRegistration = {
  id: "ru-x-dshfix",
  label: "Русский (исправленный)",
  fallback: "ru",
};

/** Built-in namespace whose Russian copy contains proven mistakes. */
export const CORRECTED_NAMESPACE = "settings";

/** Own dictionary key union. */
export type FixLocaleKey = keyof typeof enJson;

/** English dictionary. */
export const en: Record<FixLocaleKey, string> = enJson;

/** Russian dictionary. */
export const ru: Record<FixLocaleKey, string> = ruJson;

/**
 * Corrections registered only under {@link FIX_LANGUAGE}. Every key is a label
 * the shipped Russian dictionary renders as a full sentence where the control
 * needs a short imperative: the disconnect banner's reconnect/restart actions
 * and the update-release dialog's reload action. The overlay reuses the
 * official single-locale registration path; it is not a mutation of the
 * built-in `ru` dictionary.
 */
export const RU_FIX_CORRECTIONS: LocaleDict = ruFixJson;

/** Keys overlaid by {@link RU_FIX_CORRECTIONS}; stable for audits and tests. */
export const CORRECTED_KEYS: readonly string[] = Object.freeze(Object.keys(RU_FIX_CORRECTIONS));

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** Settings row copy for the layout and locale fixes. */
    "dsh-i18n-layout-fix": FixLocaleKey;
  }
}
