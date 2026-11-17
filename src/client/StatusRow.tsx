/**
 * "Layout and localization" row in Settings → General.
 *
 * The row is the visible status surface of the plugin: it names the applied
 * fixes and offers the opt-in corrected-Russian language. The language switch
 * goes through the official `LocaleRuntime.setLocale`, so it is the same
 * durable preference write as the shipped Language row; the plugin never
 * selects a language on its own.
 *
 * @module dsh-i18n-layout-fix/src/client/StatusRow
 */

import * as React from "react";
import type { CSSProperties, ReactElement } from "react";
import type { LocaleRuntime } from "@deepseek-ai/dsh-client-locale/client";
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";

import { FIX_LANGUAGE, NS } from "./locale.ts";

const { useCallback, useSyncExternalStore } = React;

/** Face injected into the row by src/client/index.ts. */
export interface FixStatusInjected {
  /** Live client locale registry. */
  locale: LocaleRuntime;
}

/** Full row props. */
export type FixStatusProps = PropsRuntime<"settings.general.item">
  & PropsLocale<typeof NS>
  & InjectFace<FixStatusInjected>;

const TITLE: CSSProperties = {
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: "20px",
};

const DESCRIPTION: CSSProperties = {
  color: "var(--dsw-alias-label-secondary)",
  fontSize: "12px",
  lineHeight: "18px",
};

const BUTTON: CSSProperties = {
  boxSizing: "border-box",
  maxWidth: "100%",
  minHeight: "28px",
  padding: "0 10px",
  border: "0.5px solid var(--dsw-alias-border-l3)",
  borderRadius: "var(--dsw-radius-sm)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  font: "inherit",
  fontSize: "12px",
  lineHeight: "18px",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  cursor: "pointer",
};

/**
 * Render the plugin status and the opt-in language action.
 *
 * @param props - slot props, typed dictionary, and the injected registry.
 * @returns the settings row.
 */
export function FixStatusRow({ locale, t }: FixStatusProps): ReactElement {
  const subscribe = useCallback(
    (onChange: () => void) => locale.subscribe(onChange),
    [locale],
  );
  const getSnapshot = useCallback(() => locale.getSnapshot(), [locale]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  const active = snapshot.locales.find((entry) => entry.id === snapshot.active);
  const fixAvailable = snapshot.locales.some(
    (entry) => entry.id === FIX_LANGUAGE.id,
  );
  const fixActive = snapshot.active === FIX_LANGUAGE.id;

  const status = fixActive
    ? t("row.status.active")
    : fixAvailable
      ? `${t("row.status.language", { language: active?.label ?? snapshot.active })} ${t("row.status.available")}`
      : t("row.status.unavailable");

  return (
    <div data-dsh-i18n-layout-fix-row="">
      <div data-dsh-i18n-layout-fix-copy="">
        <span style={TITLE}>{t("row.title")}</span>
        <span style={DESCRIPTION}>{t("row.description")}</span>
        <span
          data-dsh-i18n-layout-fix-description=""
          style={DESCRIPTION}
          aria-live="polite"
        >
          {status}
        </span>
      </div>
      <div data-dsh-i18n-layout-fix-actions="">
        {fixAvailable && !fixActive ? (
          <button
            type="button"
            style={BUTTON}
            onClick={() => {
              locale.setLocale(FIX_LANGUAGE.id);
            }}
          >
            {t("row.enable")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
