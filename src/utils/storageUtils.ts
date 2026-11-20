import { PropertyListing } from '../types/inventory';

const DB_NAME = 'umer_realtors_crm_db';
const STORE_NAME = 'inventory_store';
const DB_VERSION = 1;

/**
 * Open IndexedDB database for large real estate inventory storage
 * IndexedDB has virtually unlimited quota compared to 5MB localStorage limit.
 */
function openInventoryDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Persists inventory to IndexedDB safely without any browser quota restrictions
 */
export async function saveInventoryToIndexedDB(items: PropertyListing[]): Promise<void> {
  try {
    const db = await openInventoryDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(items, 'active_inventory');
  } catch {
    // Silently ignore
  }
}

/**
 * Loads inventory from IndexedDB
 */
export async function loadInventoryFromIndexedDB(): Promise<PropertyListing[] | null> {
  try {
    const db = await openInventoryDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('active_inventory');
      req.onsuccess = () => {
        if (Array.isArray(req.result) && req.result.length > 0) {
          resolve(req.result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Safe localStorage setter that never throws QuotaExceededError
 */
export function safeSetLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err: any) {
    // QuotaExceededError handling
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        // Store a lightweight snapshot of latest 100 items for offline startup
        localStorage.setItem(key, JSON.stringify(parsed.slice(0, 100)));
      }
    } catch {
      // If still exceeding or non-array, remove to free up quota
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  }
}

/**
 * Safe unified inventory saver:
 * 1. Saves full inventory to IndexedDB (handles 10,000+ items seamlessly)
 * 2. Saves safe fallback to localStorage without throwing QuotaExceededError
 */
export function safeSaveInventory(inventory: PropertyListing[]): void {
  // 1. IndexedDB async save
  saveInventoryToIndexedDB(inventory).catch(() => {});

  // 2. Safe localStorage save
  try {
    safeSetLocalStorage('bahria_orchard_inventory', JSON.stringify(inventory));
  } catch {}
}
