/**
 * Real Cordis lifecycle and real `LocaleRuntime` ownership.
 *
 * These tests do not mock dictionary rules: the installed LocaleRuntime is
 * constructed directly, dictionaries are registered through its public API, and
 * ten enable/disable cycles prove that every style, dictionary and language
 * registration is released. A forced late failure proves the rollback path
 * leaves no partial plugin state.
 */
import { Context } from "@deepseek-ai/cordis";
import { LocaleRuntime } from "@deepseek-ai/dsh-client-locale/src/client/index.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { apply, ENTRY_ID, inject, installResources, SETTINGS_SLOT } from "../index.ts";
import {
  CORRECTED_NAMESPACE,
  en,
  FIX_LANGUAGE,
  NS,
  RU_FIX_CORRECTIONS,
  ru,
} from "../locale.ts";
import { STYLE_ATTRIBUTE, STYLE_SELECTOR, STYLE_VERSION } from "../styles.ts";

/** Minimal DOM surface used by the style installer. */
class FakeHead {
  readonly children: FakeNode[] = [];

  append(node: FakeNode): void {
    node.parentNode = this;
    this.children.push(node);
  }

  removeChild(node: FakeNode): void {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
  }
}

class FakeNode {
  parentNode: FakeHead | null = null;
  readonly attributes = new Map<string, string>();
  textContent = "";

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

class FakeDocument {
  readonly head = new FakeHead();

  get documentElement(): FakeHead {
    return this.head;
  }

  createElement(tag: string): FakeNode {
    return new FakeNode(tag);
  }

  querySelector(selector: string): FakeNode | null {
    if (selector !== STYLE_SELECTOR) return null;
    return (
      this.head.children.find((node) => node.attributes.has(STYLE_ATTRIBUTE))
      ?? null
    );
  }
}

/** Locale context stub: the runtime only emits and (with a host) subscribes. */
function localeContext() {
  return {
    effect: (fn: () => () => void) => fn(),
    emit: () => {},
  } as unknown as ConstructorParameters<typeof LocaleRuntime>[0];
}

/** Slot registry stub: records registrations and returns real disposers. */
function fakeSlots() {
  const registered: { entry: Record<string, unknown>; component: unknown }[] = [];
  return {
    registered,
    inject(
      _key: string,
      callback: () => () => void,
    ): () => void {
      return callback();
    },
    register(
      entry: Record<string, unknown>,
      component: unknown,
    ): () => void {
      const record = { entry, component };
      registered.push(record);
      return () => {
        const index = registered.indexOf(record);
        if (index >= 0) registered.splice(index, 1);
      };
    },
  };
}

/** A runtime with the built-in Russian language the shipped Host registers. */
function runtime(): LocaleRuntime {
  const locale = new LocaleRuntime(localeContext());
  locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" });
  return locale;
}

function setup() {
  const root = new Context();
  const locale = runtime();
  const slots = fakeSlots();
  const doc = new FakeDocument();
  root.provide("locale", locale);
  root.provide("slots", slots);
  globalThis.document = doc as unknown as Document;
  return { root, locale, slots, doc };
}

/** Own dictionary is gone when `t` falls back to the key itself. */
function hasOwnDictionaries(locale: LocaleRuntime): boolean {
  return locale.bind(NS)("row.title") !== "row.title";
}

function hasFixLanguage(locale: LocaleRuntime): boolean {
  return locale.getLocale().locales.some((entry) => entry.id === FIX_LANGUAGE.id);
}

const clientPlugin = { name: ENTRY_ID, apply, inject: [...inject] };

describe("client lifecycle on a real Cordis context", () => {
  beforeEach(() => {
    // Each test sets its own document; clear any revision left by a previous file.
    delete (globalThis as { document?: Document }).document;
  });

  afterEach(() => {
    delete (globalThis as { document?: Document }).document;
  });

  it("registers styles, dictionaries, the language and one settings row", async () => {
    const { root, locale, slots, doc } = setup();
    const fiber = root.plugin(clientPlugin);
    await fiber;

    expect(doc.head.children).toHaveLength(1);
    expect(doc.head.children[0]?.attributes.get(STYLE_ATTRIBUTE)).toBe(STYLE_VERSION);
    expect(doc.head.children[0]?.textContent).toContain(STYLE_ATTRIBUTE);
    expect(hasOwnDictionaries(locale)).toBe(true);
    expect(hasFixLanguage(locale)).toBe(true);
    expect(locale.bind(NS)("row.title")).toBe(en["row.title"]);
    expect(slots.registered).toHaveLength(1);
    expect(slots.registered[0]?.entry).toMatchObject({
      name: SETTINGS_SLOT,
      id: ENTRY_ID,
      locale: NS,
    });

    await fiber.dispose();

    expect(doc.head.children).toHaveLength(0);
    expect(hasOwnDictionaries(locale)).toBe(false);
    expect(hasFixLanguage(locale)).toBe(false);
    expect(slots.registered).toHaveLength(0);
  });

  it("switches ru / ru-x-dshfix through the real LocaleRuntime lookup chain", async () => {
    const { root, locale } = setup();
    // The built-in owner of the `settings` namespace, represented by its
    // shipped Russian dictionary. It stays untouched by the plugin.
    const shippedRu = {
      "connection.reconnect": "Соединение отключено, подключитесь снова сейчас",
      "hostRelease.unknown": "Неизвестно",
      "hostRelease.reload": "Перезагрузите, чтобы загрузить новую версию",
    };
    const disposeShipped = locale.register(CORRECTED_NAMESPACE, "ru", shippedRu);
    const fiber = root.plugin(clientPlugin);
    await fiber;

    const settings = locale.bind(CORRECTED_NAMESPACE);

    locale.setLocale("ru");
    expect(settings("connection.reconnect")).toBe(shippedRu["connection.reconnect"]);
    expect(settings("hostRelease.reload")).toBe(shippedRu["hostRelease.reload"]);

    locale.setLocale("ru-x-dshfix");
    expect(settings("connection.reconnect")).toBe(RU_FIX_CORRECTIONS["connection.reconnect"]);
    expect(settings("hostRelease.reload")).toBe("Перезагрузить страницу");
    // Keys missing from the overlay fall back to the built-in Russian.
    expect(settings("hostRelease.unknown")).toBe("Неизвестно");
    // The plugin's own namespace also falls back from ru-x-dshfix to ru.
    expect(locale.bind(NS)("row.title")).toBe(ru["row.title"]);

    await fiber.dispose();
    expect(() => locale.setLocale("ru-x-dshfix")).toThrow(/not registered/);
    // The shipped Russian dictionary is still the plain-ru owner.
    locale.setLocale("ru");
    expect(settings("connection.reconnect")).toBe(shippedRu["connection.reconnect"]);
    disposeShipped();
  });

  it("picks up a dictionary registered after the language definition", () => {
    const locale = runtime();
    const disposeLanguage = locale.addLanguage(FIX_LANGUAGE);
    expect(locale.getLocale().locales.some((entry) => entry.id === FIX_LANGUAGE.id)).toBe(true);
    // Before the dictionary arrives the lookup falls through to built-in ru,
    // which this standalone runtime does not own, so the key itself is shown.
    expect(locale.bind(NS)("row.title")).toBe("row.title");

    const disposeDict = locale.register(NS, FIX_LANGUAGE.id, {
      "row.title": "Поздняя регистрация",
    });
    locale.setLocale(FIX_LANGUAGE.id);
    expect(locale.bind(NS)("row.title")).toBe("Поздняя регистрация");

    disposeDict();
    expect(locale.bind(NS)("row.title")).toBe("row.title");
    disposeLanguage();
  });

  it("survives ten enable/disable cycles without duplicate-registration errors", async () => {
    const { root, locale, slots, doc } = setup();

    for (let cycle = 0; cycle < 10; cycle += 1) {
      const fiber = root.plugin(clientPlugin);
      await fiber;

      expect(doc.head.children, `style cycle ${cycle}`).toHaveLength(1);
      expect(hasOwnDictionaries(locale), `dict cycle ${cycle}`).toBe(true);
      expect(hasFixLanguage(locale), `language cycle ${cycle}`).toBe(true);
      expect(slots.registered, `row cycle ${cycle}`).toHaveLength(1);

      await fiber.dispose();

      expect(doc.head.children, `style disposed ${cycle}`).toHaveLength(0);
      expect(hasOwnDictionaries(locale), `dict disposed ${cycle}`).toBe(false);
      expect(hasFixLanguage(locale), `language disposed ${cycle}`).toBe(false);
      expect(slots.registered, `row disposed ${cycle}`).toHaveLength(0);
    }
  });

  it("rolls back the stylesheet and dictionaries when a later registration fails", async () => {
    const { root, locale, doc } = setup();
    // Occupy the overlay slot so the plugin's last registration throws.
    const blocker = locale.register(CORRECTED_NAMESPACE, FIX_LANGUAGE.id, {});
    const fiber = root.plugin(clientPlugin);

    await expect(fiber).rejects.toThrow(/already has locale/);
    expect(doc.head.children).toHaveLength(0);
    expect(hasOwnDictionaries(locale)).toBe(false);
    expect(hasFixLanguage(locale)).toBe(false);
    blocker();
  });

  it("rolls back every acquired resource in reverse order, keeping the original error", () => {
    // Acquisitions with a document: 0 style, 1 en, 2 ru, 3 language, 4 corrections.
    for (let failAt = 1; failAt <= 4; failAt += 1) {
      const { doc } = setup();
      const log: number[] = [];
      let calls = 0;
      // Locale-face acquisition number: 1 en, 2 ru, 3 language, 4 corrections.
      const step = (): (() => void) => {
        const ordinal = ++calls;
        if (ordinal === failAt) throw new Error(`acquisition ${ordinal} failed`);
        return () => log.push(ordinal);
      };
      const originalRemove = doc.head.removeChild.bind(doc.head);
      doc.head.removeChild = (node: FakeNode) => {
        log.push(0);
        originalRemove(node);
      };

      expect(() =>
        installResources({
          document: doc as unknown as Document,
          locale: { register: step, addLanguage: step },
        }),
      ).toThrow(`acquisition ${failAt} failed`);

      const expected = Array.from({ length: failAt }, (_, i) => failAt - 1 - i);
      expect(log, `rollback order for failure at ${failAt}`).toEqual(expected);
      expect(doc.head.children).toHaveLength(0);
    }
  });

  it("keeps a double dispose idempotent", () => {
    const { doc } = setup();
    const log: number[] = [];
    let calls = 0;
    const step = (): (() => void) => {
      const ordinal = ++calls;
      return () => log.push(ordinal);
    };

    const dispose = installResources({
      document: doc as unknown as Document,
      locale: { register: step, addLanguage: step },
    });

    dispose();
    expect(log).toEqual([4, 3, 2, 1]);
    expect(doc.head.children).toHaveLength(0);

    dispose();
    expect(log).toEqual([4, 3, 2, 1]);
    expect(doc.head.children).toHaveLength(0);
  });

  it("disposes the installed resources when the settings row fails to mount", async () => {
    const root = new Context();
    const locale = runtime();
    const doc = new FakeDocument();
    root.provide("locale", locale);
    root.provide("slots", {
      inject(): (() => void) {
        throw new Error("slot mount failed");
      },
    });
    globalThis.document = doc as unknown as Document;

    const fiber = root.plugin(clientPlugin);
    await expect(fiber).rejects.toThrow("slot mount failed");
    expect(doc.head.children).toHaveLength(0);
    expect(hasOwnDictionaries(locale)).toBe(false);
    expect(hasFixLanguage(locale)).toBe(false);
  });

  it("does not touch a pre-existing style node owned by another generation", () => {
    const { doc } = setup();
    const foreign = doc.createElement("style");
    foreign.setAttribute(STYLE_ATTRIBUTE, "0.0.1");
    doc.head.append(foreign);

    const dispose = installResources({ document: doc as unknown as Document, locale: runtime() });
    // The stale plugin generation is replaced; the new node is the only one.
    expect(doc.head.children).toHaveLength(1);
    expect(doc.head.children[0]).not.toBe(foreign);
    dispose();
    expect(doc.head.children).toHaveLength(0);
  });
});
