/**
 * Stylesheet scope contract.
 *
 * The plugin fixes layout globally in the main document (portals included), so
 * every selector must stay inside the audited component boundary. These tests
 * fail if a future edit raises the blast radius: universal `button`, CSS-Modules
 * class substrings, slot guesses, translated-text selectors or `!important`.
 */
import { describe, expect, it } from "vitest";

import css from "../layout.css?raw";
import { STYLE_ATTRIBUTE, STYLE_SELECTOR } from "../styles.ts";

/** Split a selector list at top-level commas only (commas inside `:is()` stay). */
function splitTopLevel(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter((part) => part !== "");
}

/** Selector blocks of the stylesheet, excluding at-rule preludes. */
function selectors(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const block of withoutComments.split("}")) {
    const open = block.lastIndexOf("{");
    if (open < 0) continue;
    const selector = block.slice(0, open).trim();
    if (selector === "" || selector.startsWith("@")) continue;
    found.push(...splitTopLevel(selector));
  }
  return found;
}

const SETTINGS_SCOPE = '[role="dialog"][data-shortcut-modal="settings"]';
const DIALOG_SCOPE =
  '[role="dialog"][aria-modal="true"]:not([data-shortcut-modal]):has(button[data-modal-autofocus]):has(> div:last-child > button + button):has(> div:first-child > div:last-child > div > span[aria-hidden="true"])';
const ROW_SCOPE = "[data-dsh-i18n-layout-fix-row]";

const allowedPrefixes = [
  ROW_SCOPE,
  SETTINGS_SCOPE,
  DIALOG_SCOPE,
  '[role="dialog"] ',
  '[role="dialog"]:is(',
];

describe("layout.css scope contract", () => {
  const all = selectors(css);

  it("has selectors to check", () => {
    expect(all.length).toBeGreaterThan(10);
  });

  it("only targets the audited component boundaries", () => {
    for (const selector of all) {
      expect(
        allowedPrefixes.some((prefix) => selector.startsWith(prefix)),
        selector,
      ).toBe(true);
    }
  });

  it("never uses a universal button or CSS-Modules class selector", () => {
    for (const selector of all) {
      // Scoped button selectors are the point; only a bare universal button
      // rule (no ancestor/role boundary) is forbidden.
      expect(selector, selector).not.toBe("button");
      expect(selector, selector).not.toMatch(/^button[\s>+~]/);
      expect(selector, selector).not.toContain("[class");
      expect(selector, selector).not.toMatch(/\._?[a-zA-Z]+_[a-zA-Z0-9]{4,}/);
      expect(selector, selector).not.toContain("[data-slot");
      expect(selector, selector).not.toContain("aria-label");
      expect(selector, selector).not.toContain(":contains");
    }
  });

  it("scopes the update-dialog rule to the release prompt", () => {
    expect(DIALOG_SCOPE).toContain(":not([data-shortcut-modal])");
    expect(DIALOG_SCOPE).toContain("button[data-modal-autofocus]");
    expect(DIALOG_SCOPE).toContain("> div:last-child > button + button");
    // The release transition body separates HostReleasePrompt from other
    // two-button confirmations (models delete, agent-team disable, reset).
    expect(DIALOG_SCOPE).toContain(
      "> div:first-child > div:last-child > div > span[aria-hidden=\"true\"]",
    );
    expect(css).not.toContain(":not(:has(>:not(button)))");
  });

  it("does not restate the shipped settings-panel sizing", () => {
    // The shipped settings panel caps itself tighter than viewport-unit rules
    // would, so the S scope has no standalone sizing block.
    expect(css).not.toMatch(/\[data-shortcut-modal="settings"\]\s*\{/);
    // The release prompt does need the cap at a short viewport.
    expect(css).toContain("max-inline-size: calc(100dvw - 1rem)");
    expect(css).toContain("max-block-size: calc(100dvh - 1rem)");
  });

  it("wraps instead of clipping and keeps a scroll owner for long dialogs", () => {
    expect(css).toContain("white-space: normal");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("text-overflow: clip");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("min-block-size: 2.5em");
  });

  it("stacks dialog actions at 480 CSS pixels", () => {
    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*flex-basis: 100%/);
  });

  it("does not use !important, zoom or layout-affecting content", () => {
    expect(css).not.toContain("!important");
    expect(css).not.toContain("zoom:");
    expect(css).not.toMatch(/(^|[;{\s])content\s*:/);
    expect(css).not.toContain("MutationObserver");
  });

  it("stamps the installed style node with one versioned attribute", () => {
    expect(STYLE_ATTRIBUTE).toBe("data-dsh-i18n-layout-fix");
    expect(STYLE_SELECTOR).toBe('style[data-dsh-i18n-layout-fix]');
    expect(css).toContain("dsh-i18n-layout-fix 0.1.0");
  });

  it("keeps plugin-owned row rules free of forced colors and font sizes", () => {
    const rowBlocks = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .filter((block) => block.includes(ROW_SCOPE));
    expect(rowBlocks.length).toBeGreaterThan(0);
    for (const block of rowBlocks) {
      expect(block).not.toMatch(/color\s*:/);
      expect(block).not.toMatch(/font-size\s*:/);
    }
  });
});
