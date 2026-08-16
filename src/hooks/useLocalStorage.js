import { useState, useEffect, useRef, useCallback } from 'react';
import { DEFAULT_SETTINGS, INITIAL_DATA } from '../lib/constants';
import { persistNotebookData, setLiveTree } from '../lib/sync-outbox';

/**
 * Hook for managing localStorage persistence of settings and data.
 * Notebook data is not written until persistEnabled (after boot merge).
 */
export function useLocalStorage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [data, setDataState] = useState(INITIAL_DATA);
  const [persistEnabled, setPersistEnabled] = useState(false);

  const setData = useCallback((updater) => {
    setDataState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setLiveTree(next);
      return next;
    });
  }, []);

  const debouncedSaveRef = useRef(null);

  useEffect(() => {
    const savedSettings = localStorage.getItem('note-app-settings-v1');
    if (savedSettings) {
      try {
        setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) }));
      } catch (e) {
        console.error('Error loading settings:', e);
      }
    }
  }, []);

  const loadFromLocalStorage = useCallback(() => {
    const saved = localStorage.getItem('note-app-data-v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error loading data from localStorage:', e);
      }
    }
    return null;
  }, []);

  const saveSettings = useCallback((newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('note-app-settings-v1', JSON.stringify(newSettings));
  }, []);

  useEffect(() => {
    if (!persistEnabled) return;

    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }

    debouncedSaveRef.current = setTimeout(() => {
      localStorage.setItem('note-app-settings-v1', JSON.stringify(settings));
      persistNotebookData(data);
    }, 150);

    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
      }
    };
  }, [data, settings, persistEnabled]);

  useEffect(() => {
    const root = document.documentElement;
    let effectiveTheme = settings.theme;
    if (settings.theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
  }, [settings.theme]);

  return {
    settings,
    setSettings: saveSettings,
    data,
    setData,
    loadFromLocalStorage,
    persistEnabled,
    setPersistEnabled,
  };
}
