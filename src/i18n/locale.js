import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, messages } from './messages';

const LOCALE_STORAGE_KEY = 'heliosync:locale';

function resolveLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

function getStoredLocale() {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  return resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY) || DEFAULT_LOCALE);
}

function getValue(target, path) {
  return path.split('.').reduce((current, segment) => current?.[segment], target);
}

function interpolate(template, params = {}) {
  if (typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => (
    params[key] === undefined || params[key] === null ? '' : String(params[key])
  ));
}

const LocaleContext = createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
});

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => getStoredLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo(() => {
    const setLocale = (nextLocale) => {
      setLocaleState(resolveLocale(nextLocale));
    };

    const t = (key, params) => {
      const dictionary = messages[locale] || messages[DEFAULT_LOCALE];
      const fallbackDictionary = messages.en;
      const valueAtKey = getValue(dictionary, key) ?? getValue(fallbackDictionary, key) ?? key;
      return interpolate(valueAtKey, params);
    };

    return {
      locale,
      setLocale,
      t,
    };
  }, [locale]);

  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function formatLocaleNumber(locale, value, options = {}) {
  return new Intl.NumberFormat(resolveLocale(locale), options).format(value);
}
