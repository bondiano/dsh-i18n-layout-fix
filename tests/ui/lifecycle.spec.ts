/**
 * Enable / disable evidence at the rendered-UI boundary.
 *
 * The enabled run adds exactly one style node and one settings row. The
 * disabled run uses the same profile *without* the loader patch: the style,
 * the row and the wrap rules are gone, and the shipped ellipsis behaviour is
 * back — no residual attributes or styles.
 */
import { expect, test } from "@playwright/test";

import {
  openApp,
  openSettings,
  settingsDialog,
  startHost,
} from "./helpers.ts";

test("enabled plugin owns exactly one style node and one row", async ({ page }) => {
  const host = await startHost();
  try {
    await openApp(page, host);
    await openSettings(page);

    await expect(page.locator("style[data-dsh-i18n-layout-fix]")).toHaveCount(1);
    await expect(page.locator("[data-dsh-i18n-layout-fix-row]")).toHaveCount(1);

    const owned = await page.evaluate(() =>
      [...document.querySelectorAll("[data-dsh-i18n-layout-fix-row], [data-dsh-i18n-layout-fix-copy], [data-dsh-i18n-layout-fix-description], [data-dsh-i18n-layout-fix-actions]")]
        .map((element) => element.getAttributeNames().filter((name) => name.startsWith("data-dsh"))),
    );
    for (const attributes of owned) {
      for (const attribute of attributes) {
        expect(attribute).toMatch(/^data-dsh-i18n-layout-fix/);
      }
    }

    const nav = await page.evaluate(() => {
      const label = document.querySelector(
        '[role="dialog"][data-shortcut-modal="settings"] > nav > div > button > span:last-child',
      );
      if (label === null) return null;
      return getComputedStyle(label).whiteSpace;
    });
    expect(nav).toBe("normal");
  } finally {
    await host.stop();
  }
});

test("disabled plugin leaves no style, row or wrap rules", async ({ page }) => {
  const host = await startHost({ withPlugin: false });
  try {
    await openApp(page, host);
    await openSettings(page);

    await expect(page.locator("style[data-dsh-i18n-layout-fix]")).toHaveCount(0);
    await expect(page.locator("[data-dsh-i18n-layout-fix-row]")).toHaveCount(0);

    const labels = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][data-shortcut-modal="settings"]');
      if (dialog === null) throw new Error("settings not open");
      return [...dialog.querySelectorAll<HTMLElement>(":scope > nav > div > button")].map((cell) => {
        const label = cell.querySelector<HTMLElement>(":scope > span:last-child")!;
        return {
          text: label.textContent ?? "",
          whiteSpace: getComputedStyle(label).whiteSpace,
          overflow: getComputedStyle(label).overflow,
          clipped: label.scrollWidth > label.clientWidth + 1,
        };
      });
    });

    const longLabels = labels.filter((label) => label.text.length > 12);
    expect(longLabels.length).toBeGreaterThan(0);
    for (const label of longLabels) {
      expect(label.whiteSpace, label.text).toBe("nowrap");
      expect(label.overflow, label.text).toBe("hidden");
      expect(label.clipped, label.text).toBe(true);
    }

    await expect(settingsDialog(page)).toBeVisible();
  } finally {
    await host.stop();
  }
});
