import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  writeBatch, 
  onSnapshot,
  Unsubscribe 
} from 'firebase/firestore';
import { getApps, initializeApp, getApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';
import { PropertyListing, SheetConfig } from '../types/inventory';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Target user's specific Firestore database ID
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
export const db = getFirestore(app, databaseId);

const PROPERTIES_COLLECTION = 'properties';
const SETTINGS_COLLECTION = 'settings';
const CONFIG_DOC_ID = 'config';

/**
 * Checks whether an error is a Firestore quota / resource-exhausted error
 */
export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('quota exceeded') ||
    msg.includes('resource-exhausted') ||
    msg.includes('free daily read units') ||
    msg.includes('quota metric')
  );
}

// Global flag tracking if Firestore quota is currently exhausted for this session
let isQuotaExceeded = false;

export function isFirestoreQuotaExceeded(): boolean {
  return isQuotaExceeded;
}

export function resetFirestoreQuotaFlag(): void {
  isQuotaExceeded = false;
}

/**
 * Real-time listener for the properties collection with seamless quota fallback.
 */
export function subscribeToInventory(
  onData: (listings: PropertyListing[]) => void,
  onError?: (err: any) => void
): Unsubscribe {
  // If quota was already marked as exceeded, immediately fallback to local server
  if (isQuotaExceeded) {
    if (onError) {
      setTimeout(() => onError(new Error('Quota exceeded')), 0);
    }
    return () => {};
  }

  let activeUnsubscribe: Unsubscribe | null = null;
  const colRef = collection(db, PROPERTIES_COLLECTION);

  try {
    activeUnsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const items: PropertyListing[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as PropertyListing;
          items.push({
            ...data,
            id: docSnap.id,
          });
        });

        // Sort by dateAdded descending by default (fast string comparison)
        items.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
        onData(items);
      },
      (error) => {
        if (isQuotaError(error)) {
          isQuotaExceeded = true;
          console.warn('[Firestore] Daily free quota exceeded. Falling back smoothly to local server backend API & browser cache.');
          if (activeUnsubscribe) {
            try {
              activeUnsubscribe();
            } catch (e) {}
            activeUnsubscribe = null;
          }
          if (onError) onError(error);
          return;
        }

        console.error('[Firestore] Real-time listener error:', error);
        if (onError) onError(error);
      }
    );
  } catch (err: any) {
    if (isQuotaError(err)) {
      isQuotaExceeded = true;
      console.warn('[Firestore] Daily quota exceeded during subscription setup.');
      if (onError) onError(err);
      return () => {};
    }
    console.error('[Firestore] Real-time listener setup error:', err);
    if (onError) onError(err);
    return () => {};
  }

  return () => {
    if (activeUnsubscribe) {
      try {
        activeUnsubscribe();
      } catch (e) {}
    }
  };
}

/**
 * Fetch all properties once from Firestore.
 */
export async function fetchAllPropertiesFromFirestore(): Promise<PropertyListing[]> {
  if (isQuotaExceeded) return [];
  try {
    const colRef = collection(db, PROPERTIES_COLLECTION);
    const snap = await getDocs(colRef);
    const items: PropertyListing[] = [];
    snap.forEach((d) => {
      items.push({ ...(d.data() as PropertyListing), id: d.id });
    });
    return items;
  } catch (err: any) {
    if (isQuotaError(err)) {
      isQuotaExceeded = true;
      console.warn('[Firestore] Free quota reached on fetch. Using server backup.');
      return [];
    }
    console.error('[Firestore] Error fetching properties:', err);
    return [];
  }
}

/**
 * Save or update a single property in Firestore.
 */
export async function savePropertyToFirestore(property: PropertyListing): Promise<void> {
  if (isQuotaExceeded) return;
  try {
    const docRef = doc(db, PROPERTIES_COLLECTION, property.id);
    await setDoc(docRef, { ...property, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err: any) {
    if (isQuotaError(err)) {
      isQuotaExceeded = true;
      console.warn('[Firestore] Free quota reached on save. Persisting to server disk.');
      return;
    }
    console.error('[Firestore] Error saving property:', err);
    throw err;
  }
}

/**
 * Atomically save batch of properties in Firestore (chunks of 400 to stay under limit 500).
 */
export async function saveBatchPropertiesToFirestore(properties: PropertyListing[]): Promise<void> {
  if (!properties || properties.length === 0 || isQuotaExceeded) return;

  const chunkSize = 400;
  for (let i = 0; i < properties.length; i += chunkSize) {
    const chunk = properties.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const docRef = doc(db, PROPERTIES_COLLECTION, item.id);
      batch.set(docRef, { ...item, updatedAt: new Date().toISOString() }, { merge: true });
    });
    try {
      await batch.commit();
    } catch (err: any) {
      if (isQuotaError(err)) {
        isQuotaExceeded = true;
        console.warn('[Firestore] Free quota reached on batch save. Persisting to server disk.');
        return;
      }
      console.error('[Firestore] Error saving batch properties:', err);
      throw err;
    }
  }
}

/**
 * Delete a single property from Firestore.
 */
export async function deletePropertyFromFirestore(id: string): Promise<void> {
  if (isQuotaExceeded) return;
  try {
    const docRef = doc(db, PROPERTIES_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (err: any) {
    if (isQuotaError(err)) {
      isQuotaExceeded = true;
      console.warn('[Firestore] Free quota reached on delete.');
      return;
    }
    console.error('[Firestore] Error deleting property:', err);
    throw err;
  }
}

/**
 * Delete a batch of properties from Firestore.
 */
export async function deleteBatchPropertiesFromFirestore(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0 || isQuotaExceeded) return;

  const chunkSize = 400;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      const docRef = doc(db, PROPERTIES_COLLECTION, id);
      batch.delete(docRef);
    });
    try {
      await batch.commit();
    } catch (err: any) {
      if (isQuotaError(err)) {
        isQuotaExceeded = true;
        console.warn('[Firestore] Free quota reached on batch delete.');
        return;
      }
      console.error('[Firestore] Error deleting batch properties:', err);
      throw err;
    }
  }
}

/**
 * Save settings config to Firestore & server API.
 */
export async function saveConfigToFirestore(config: Partial<SheetConfig>): Promise<void> {
  // Always also persist to local server config route
  try {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).catch(() => {});
  } catch (e) {}

  if (isQuotaExceeded) return;

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, CONFIG_DOC_ID);
    await setDoc(docRef, { ...config, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err: any) {
    if (isQuotaError(err)) {
      isQuotaExceeded = true;
      console.warn('[Firestore] Free quota reached while saving config. Persisted to server.');
      return;
    }
    console.error('[Firestore] Error saving config:', err);
  }
}

/**
 * Load settings config from Firestore or gracefully return null to trigger server/local fallback.
 */
export async function loadConfigFromFirestore(): Promise<SheetConfig | null> {
  if (isQuotaExceeded) return null;
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, CONFIG_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as SheetConfig;
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      isQuotaExceeded = true;
      console.warn('[Firestore] Free quota reached while loading config. Using local server backup.');
      return null;
    }
    console.error('[Firestore] Error loading config:', err);
  }
  return null;
}
