export type ItemFoundLogEntry = {
  // The unique identifier for the item that was discovered.
  id: string;
  // ISO timestamp for when the item was first detected as found.
  foundAt: string;
  // Name of the character/save file that discovered the item.
  foundBy?: string;
};

// Storage key used for persisting the item-found log across sessions.
const ITEM_FOUND_LOG_STORAGE_KEY = 'holyGrailItemFoundLog';

// Cap the log size to avoid unbounded growth in persistent storage.
const MAX_ITEM_FOUND_LOG_ENTRIES = 200;

// Safely read the item-found log from localStorage.
export const loadItemFoundLog = (): ItemFoundLogEntry[] => {
  // Guard against non-browser environments where localStorage is unavailable.
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  // Read the raw JSON string from storage.
  const rawLog = window.localStorage.getItem(ITEM_FOUND_LOG_STORAGE_KEY);
  if (!rawLog) {
    return [];
  }

  // Parse and validate the JSON data before returning it.
  try {
    const parsedLog = JSON.parse(rawLog);
    if (!Array.isArray(parsedLog)) {
      return [];
    }

    // Filter entries to ensure they have the expected shape.
    return parsedLog.filter(
      (entry) =>
        entry &&
        typeof entry.id === 'string' &&
        typeof entry.foundAt === 'string' &&
        (entry.foundBy === undefined || typeof entry.foundBy === 'string')
    );
  } catch (error) {
    // If parsing fails, return an empty log to avoid breaking the UI.
    return [];
  }
};

// Persist the item-found log to localStorage.
const saveItemFoundLog = (entries: ItemFoundLogEntry[]) => {
  // Guard against non-browser environments where localStorage is unavailable.
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  // Store the trimmed log to keep the data payload small.
  window.localStorage.setItem(
    ITEM_FOUND_LOG_STORAGE_KEY,
    JSON.stringify(entries.slice(-MAX_ITEM_FOUND_LOG_ENTRIES))
  );
};

// Append newly found item IDs to the persistent log.
export const appendItemFoundLogEntries = (itemIds: Array<{ id: string; foundBy?: string }>) => {
  // Skip work when there are no new items to log.
  if (itemIds.length === 0) {
    return;
  }

  // Create log entries using a single timestamp for this discovery batch.
  const foundAt = new Date().toISOString();
  const newEntries = itemIds.map(({ id, foundBy }) => ({
    id,
    foundAt,
    foundBy,
  }));

  // Load existing entries, append new entries, and persist the result.
  const updatedLog = loadItemFoundLog().concat(newEntries);
  saveItemFoundLog(updatedLog);

  // Notify the UI that the log has changed so it can refresh.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('holyGrailItemFoundLogUpdated'));
  }
};
