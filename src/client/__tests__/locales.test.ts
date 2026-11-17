/**
 * Dictionary parity and the audit of the corrected-Russian overlay.
 */
import { describe, expect, it } from "vitest";

import {
  CORRECTED_KEYS,
  en,
  FIX_LANGUAGE,
  NS,
  RU_FIX_CORRECTIONS,
  ru,
} from "../locale.ts";

/** Placeholder names in a template string. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("dsh-i18n-layout-fix dictionaries", () => {
  it("uses the plugin id as the namespace", () => {
    expect(NS).toBe("dsh-i18n-layout-fix");
  });

  it("covers exactly the same keys in Russian and English", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps the same placeholders in both languages", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("does not ship empty labels", () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(ru)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("declares the opt-in corrected language with the built-in Russian fallback", () => {
    expect(FIX_LANGUAGE).toEqual({
      id: "ru-x-dshfix",
      label: "Русский (исправленный)",
      fallback: "ru",
    });
  });

  it("overlays only audited, non-empty, long-sentence corrections", () => {
    expect([...CORRECTED_KEYS].sort()).toEqual([
      "connection.reconnect",
      "connection.restart",
      "hostRelease.reload",
    ]);
    for (const key of CORRECTED_KEYS) {
      expect(RU_FIX_CORRECTIONS[key]?.trim(), key).not.toBe("");
    }
    expect(RU_FIX_CORRECTIONS["hostRelease.reload"]).toBe("Перезагрузить страницу");
    expect(RU_FIX_CORRECTIONS["connection.reconnect"]).toBe("Переподключиться");
    expect(RU_FIX_CORRECTIONS["connection.restart"]).toBe("Переподключиться сейчас");
  });

  it("does not reuse a shipped key name for the overlay", () => {
    for (const key of CORRECTED_KEYS) {
      expect(key in en, key).toBe(false);
    }
  });
});
