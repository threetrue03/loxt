import { useSyncExternalStore } from 'react';
import { cleanError } from './SettingsProvider.jsx';
import { sharedModelStore } from './modelStoreSnapshot.js';

export default function useModelStore({ includeEnvironment = true } = {}) {
  const store = sharedModelStore(window.desktop);
  const value = useSyncExternalStore(store.subscribe, includeEnvironment ? store.getSnapshot : store.getSummary);
  return { ...value, error: value.error ? cleanError(new Error(value.error)) : '', reload: store.reload };
}
