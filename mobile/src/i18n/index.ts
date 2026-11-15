/**
 * Minimal i18n with a runtime language switch.
 *
 * Azerbaijani is the default; the choice is kept in platform storage. Components
 * that render text call `useLocale()` once at the top of the screen: changing
 * the language re-renders that screen and every `t()` below it.
 *
 * To add a language: create `<code>.json` with the same keys, import it here,
 * add it to `locales` and `LOCALES`.
 */
import { useSyncExternalStore } from "react";
import { platform, STORAGE_KEYS } from "../platform";
import az from "./az.json";
import en from "./en.json";

type Dict = { [key: string]: string | Dict };
type Params = Record<string, string | number | null | undefined>;

export type Locale = "az" | "en";

// Compile-time check: every key of the default locale exists in the others.
const english: typeof az = en;

const locales: Record<Locale, Dict> = { az, en: english };
export const LOCALES: { code: Locale; label: string; name: string }[] = [
  { code: "az", label: "AZ", name: "Azərbaycan dili" },
  { code: "en", label: "EN", name: "English" },
];

const FALLBACK: Locale = "az";

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && value in locales;
}

function initialLocale(): Locale {
  const stored = platform.storage.get(STORAGE_KEYS.locale);
  return isLocale(stored) ? stored : FALLBACK;
}

const listeners = new Set<() => void>();
let current: Locale = FALLBACK;

/** Re-read the stored language. Call once after platform storage has been loaded from disk. */
export function reloadLocale(): void {
  current = initialLocale();
  listeners.forEach((notify) => notify());
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  platform.storage.set(STORAGE_KEYS.locale, locale);
  listeners.forEach((notify) => notify());
}

/** Calls `listener` after every language change; returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current locale; the calling component re-renders when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

function lookup(locale: Locale, key: string): string | undefined {
  let node: string | Dict | undefined = locales[locale];
  // Keys may themselves contain dots (e.g. "audit.alert.confirmed"), so try
  // the longest matching segment at every level.
  let rest = key;
  while (node && typeof node === "object" && rest) {
    const dict: Dict = node;
    const match = Object.keys(dict)
      .filter((k) => rest === k || rest.startsWith(`${k}.`))
      .sort((a, b) => b.length - a.length)[0];
    if (!match) return undefined;
    node = dict[match];
    rest = rest.slice(match.length + 1);
  }
  return typeof node === "string" && !rest ? node : undefined;
}

/** Translate `key`, replacing `{name}` placeholders. Unknown keys return `fallback ?? key`. */
export function t(key: string, params?: Params, fallback?: string): string {
  const template = lookup(current, key) ?? lookup(FALLBACK, key) ?? fallback ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}
