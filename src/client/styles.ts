/**
 * One plugin-owned `<style>` node, injected into the main document.
 *
 * Portals mount inside the same document, so a single global stylesheet also
 * reaches dialogs rendered beside `#root`. The factory is side-effect free:
 * `apply` calls {@link installLayoutStyle} inside a Cordis effect and disposes
 * the returned handle on unload. The disposer removes the exact node it
 * created and never touches other styles or DOM nodes.
 *
 * @module dsh-i18n-layout-fix/src/client/styles
 */

import layoutCss from "./layout.css?raw";

/** Attribute naming the plugin-owned style node. */
export const STYLE_ATTRIBUTE = "data-dsh-i18n-layout-fix";

/** Version stamped into the attribute and the first CSS comment. */
export const STYLE_VERSION = "0.1.0";

/** Selector for any generation of the plugin style node. */
export const STYLE_SELECTOR = `style[${STYLE_ATTRIBUTE}]`;

/** Handle owned by the caller (a Cordis effect). */
export interface LayoutStyleHandle {
  /** Remove the node created by this call; safe to call twice. */
  dispose: () => void;
}

/**
 * Build the stylesheet text handed to the browser.
 *
 * @param css - bundled stylesheet text.
 * @returns a versioned comment plus the stylesheet.
 */
export function buildStyleText(css: string): string {
  return `/* ${STYLE_ATTRIBUTE} ${STYLE_VERSION} */\n${css}`;
}

/**
 * Inject the scoped layout corrections.
 *
 * A stale node carrying the same plugin attribute (an earlier generation that
 * did not run its disposer, for example after a crashed HMR replacement) is
 * removed before the fresh one is appended, so exactly one plugin node exists.
 *
 * @param document - document that owns the application root and its portals.
 * @param css - stylesheet text; defaults to the bundled `layout.css`.
 * @returns handle removing only the node created here.
 */
export function installLayoutStyle(
  document: Document,
  css: string = layoutCss,
): LayoutStyleHandle {
  const stale = document.querySelector(STYLE_SELECTOR);
  stale?.remove();

  const node = document.createElement("style");
  node.setAttribute(STYLE_ATTRIBUTE, STYLE_VERSION);
  node.textContent = buildStyleText(css);

  const parent = document.head ?? document.documentElement;
  parent.append(node);

  let disposed = false;
  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (node.parentNode !== null) node.parentNode.removeChild(node);
    },
  };
}
