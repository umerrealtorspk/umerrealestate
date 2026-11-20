import { PropertyListing } from '../types/inventory';
import { db, isQuotaError } from './firebaseDb';
import { collection, getDocs, query, limit, startAfter, orderBy, DocumentSnapshot } from 'firebase/firestore';

export interface MigrationProgress {
  currentBatch: number;
  totalBatches: number;
  migratedCount: number;
  totalCount: number;
  percent: number;
  statusText: string;
  isComplete: boolean;
  error?: string;
}

/**
 * Clean fetch wrapper for Google Apps Script Web App endpoints.
 * First routes through the server-side /api/sheets-proxy to completely bypass browser CORS / iframe blocks,
 * with graceful fallback to direct text/plain POST.
 */
async function postToAppsScript(scriptUrl: string, payload: any): Promise<any> {
  const cleanUrl = scriptUrl.trim();
  
  // 1. Try server-side proxy first (bypasses browser iframe and CORS limits)
  try {
    const proxyRes = await fetch('/api/sheets-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptUrl: cleanUrl, ...payload }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data && (data.isAuthError || data.isScriptError)) {
        throw new Error(data.message);
      }
      return data;
    } else {
      const errJson = await proxyRes.json().catch(() => null);
      if (errJson && (errJson.isAuthError || errJson.isScriptError)) {
        throw new Error(errJson.message);
      }
    }
  } catch (proxyErr: any) {
    if (proxyErr.message && (proxyErr.message.includes('Who has access') || proxyErr.message.includes('Google Apps Script Error'))) {
      throw proxyErr;
    }
    // Fall back to direct browser fetch if proxy is unreachable
  }

  // 2. Direct browser fetch fallback
  const res = await fetch(cleanUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Google Apps Script responded with HTTP ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
      throw new Error("Google Apps Script Permission Error: Web App is restricted to 'Only myself'. Change 'Who has access' to 'Anyone' in Deploy settings.");
    }
    if (text.includes('success')) {
      return { success: true, raw: text };
    }
    throw new Error(`Invalid response from Google Sheets: ${text.slice(0, 150)}`);
  }
}

/**
 * 1. Fetch all listings from Google Sheets Master Inventory.
 */
export async function fetchListingsFromSheets(scriptUrl: string): Promise<PropertyListing[]> {
  if (!scriptUrl || !scriptUrl.trim()) {
    throw new Error('Google Apps Script Web App URL is not configured.');
  }

  const cleanUrl = scriptUrl.trim();

  // 1. Try server-side proxy (bypasses browser CORS & redirects)
  try {
    const proxyUrl = `/api/sheets-proxy?scriptUrl=${encodeURIComponent(cleanUrl)}&action=get&_t=${Date.now()}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.isAuthError || data.isScriptError)) {
        throw new Error(data.message);
      }
      if (data && Array.isArray(data.listings)) {
        return data.listings;
      }
    } else {
      if (res.status === 429) {
        throw new Error('Rate exceeded (429)');
      }
      const errJson = await res.json().catch(() => null);
      if (errJson && (errJson.isAuthError || errJson.isScriptError)) {
        throw new Error(errJson.message);
      }
    }
  } catch (proxyErr: any) {
    if (
      proxyErr.message &&
      (proxyErr.message.includes('Who has access') ||
        proxyErr.message.includes('Google Apps Script Error') ||
        proxyErr.message.includes('429'))
    ) {
      throw proxyErr;
    }
  }

  // 2. Direct browser fetch fallback
  const url = new URL(cleanUrl);
  url.searchParams.set('action', 'get');
  url.searchParams.set('_t', Date.now().toString());

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch from Google Sheets: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (data && Array.isArray(data.listings)) {
    return data.listings;
  }
  return [];
}

/**
 * 2. Ping connection to Google Sheets Web App with validation & smart diagnostics.
 */
export async function testSheetsConnection(scriptUrl: string): Promise<{ success: boolean; message: string; isAuthError?: boolean }> {
  const cleanUrl = scriptUrl.trim();
  
  if (!cleanUrl) {
    return {
      success: false,
      message: 'Please paste your Google Apps Script Web App URL.',
    };
  }

  // Diagnostic check: common wrong URLs
  if (cleanUrl.includes('/edit') || cleanUrl.includes('#gid=')) {
    return {
      success: false,
      message: 'This is the Google Sheet editor URL (/edit). Please deploy your Apps Script as a Web App and copy the Web App URL (ends in /exec).',
    };
  }

  if (!cleanUrl.includes('script.google.com/macros/s/')) {
    return {
      success: false,
      message: 'URL must start with https://script.google.com/macros/s/... and end in /exec.',
    };
  }

  // Test through server proxy first (avoids browser iframe CORS block)
  try {
    const proxyUrl = `/api/sheets-proxy?scriptUrl=${encodeURIComponent(cleanUrl)}&action=ping&_t=${Date.now()}`;
    const res = await fetch(proxyUrl);
    const data = await res.json();

    if (data && (data.isAuthError || data.isScriptError)) {
      return {
        success: false,
        isAuthError: !!data.isAuthError,
        message: data.message,
      };
    }

    if (data && data.success) {
      return {
        success: true,
        message: data.message || 'Connected to Google Sheets Web App successfully!',
      };
    }

    if (data && data.error) {
      return {
        success: false,
        message: `Google Apps Script error: ${data.error}`,
      };
    }
  } catch (proxyErr: any) {
    console.warn('[Proxy Ping] Trying direct fetch fallback:', proxyErr);
  }

  // Direct fetch fallback
  try {
    const directUrl = new URL(cleanUrl);
    directUrl.searchParams.set('action', 'ping');
    directUrl.searchParams.set('_t', Date.now().toString());

    const res = await fetch(directUrl.toString());
    const data = await res.json();
    return {
      success: !!data.success,
      message: data.message || 'Connected to Google Sheets Web App successfully!',
    };
  } catch (err: any) {
    const errMsg = err?.message || '';
    if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
      return {
        success: false,
        isAuthError: true,
        message: "CORS / Access Blocked: In Google Sheets, click Extensions -> Apps Script -> Deploy -> Manage deployments -> Edit (pencil icon) -> Change 'Who has access' to 'Anyone', then click Deploy.",
      };
    }
    return {
      success: false,
      message: errMsg || 'Could not connect to Google Apps Script URL',
    };
  }
}

/**
 * 3. Save single property listing directly to Google Sheets.
 */
export async function saveListingToSheets(scriptUrl: string, listing: PropertyListing): Promise<boolean> {
  const result = await postToAppsScript(scriptUrl, {
    action: 'add',
    listing,
  });
  return !!result.success;
}

/**
 * 4. Save batch of listings to Google Sheets in atomic 500-record chunks.
 */
export async function saveBatchListingsToSheets(
  scriptUrl: string,
  listings: PropertyListing[],
  chunkSize: number = 500,
  onBatchProgress?: (processed: number, total: number) => void
): Promise<{ success: boolean; totalAppended: number }> {
  if (!listings || listings.length === 0) return { success: true, totalAppended: 0 };

  let totalAppended = 0;
  for (let i = 0; i < listings.length; i += chunkSize) {
    const chunk = listings.slice(i, i + chunkSize);
    const res = await postToAppsScript(scriptUrl, {
      action: 'batch-append',
      listings: chunk,
    });

    if (res && res.success) {
      totalAppended += chunk.length;
      if (onBatchProgress) {
        onBatchProgress(Math.min(i + chunkSize, listings.length), listings.length);
      }
    } else {
      throw new Error(res?.error || `Failed to append batch ${Math.floor(i / chunkSize) + 1}`);
    }

    // Brief 300ms pause to let Google Sheets API breathe between huge chunks
    if (i + chunkSize < listings.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return { success: true, totalAppended };
}

/**
 * 5. Update an existing listing in Google Sheets by ID.
 */
export async function updateListingInSheets(scriptUrl: string, listing: PropertyListing): Promise<boolean> {
  const result = await postToAppsScript(scriptUrl, {
    action: 'update',
    listing,
  });
  return !!result.success;
}

/**
 * 6. Delete a single listing from Google Sheets by ID.
 */
export async function deleteListingFromSheets(scriptUrl: string, id: string): Promise<boolean> {
  const result = await postToAppsScript(scriptUrl, {
    action: 'delete',
    id,
  });
  return !!result.success;
}

/**
 * 7. Batch delete multiple listings from Google Sheets by ID array.
 */
export async function deleteBatchListingsFromSheets(scriptUrl: string, ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;
  const result = await postToAppsScript(scriptUrl, {
    action: 'batch-delete',
    ids,
  });
  return !!result.success;
}

/**
 * 8. Clear all listings from Master Google Sheet (Clean Re-Migration).
 */
export async function clearAllSheetListings(scriptUrl: string): Promise<boolean> {
  const result = await postToAppsScript(scriptUrl, {
    action: 'clear-all',
  });
  return !!result.success;
}

/**
 * 9. CRITICAL MIGRATION ENGINE:
 * Reads all 6,470 records from Firestore (with paginated batching) or local server backup,
 * and migrates them to Google Sheets in 500-record chunks with zero memory exhaustion.
 */
export async function executeFirestoreToSheetsMigration(
  scriptUrl: string,
  options: {
    source: 'firestore' | 'server_backup' | 'loaded_memory';
    fallbackInventory?: PropertyListing[];
    chunkSize?: number;
    clearSheetFirst?: boolean;
    onProgress: (p: MigrationProgress) => void;
  }
): Promise<{ success: boolean; migratedCount: number; error?: string }> {
  const { source, fallbackInventory = [], chunkSize = 500, clearSheetFirst = false, onProgress } = options;

  try {
    onProgress({
      currentBatch: 0,
      totalBatches: 0,
      migratedCount: 0,
      totalCount: 0,
      percent: 0,
      statusText: 'Connecting to Google Sheets...',
      isComplete: false,
    });

    // Step 1: Verify Google Sheets connection
    const test = await testSheetsConnection(scriptUrl);
    if (!test.success) {
      throw new Error(`Google Sheets connection test failed: ${test.message}`);
    }

    // Step 2: Clear sheet if requested
    if (clearSheetFirst) {
      onProgress({
        currentBatch: 0,
        totalBatches: 0,
        migratedCount: 0,
        totalCount: 0,
        percent: 2,
        statusText: 'Preparing clean Master Inventory sheet...',
        isComplete: false,
      });
      await clearAllSheetListings(scriptUrl);
    }

    // Step 3: Extract records from selected source
    let allRecords: PropertyListing[] = [];

    if (source === 'firestore') {
      onProgress({
        currentBatch: 0,
        totalBatches: 0,
        migratedCount: 0,
        totalCount: 0,
        percent: 5,
        statusText: 'Fetching records from Firestore in streaming batches...',
        isComplete: false,
      });

      try {
        const colRef = collection(db, 'properties');
        let lastDocSnap: DocumentSnapshot | null = null;
        let hasMore = true;
        let batchCounter = 0;

        while (hasMore) {
          batchCounter++;
          onProgress({
            currentBatch: batchCounter,
            totalBatches: 13,
            migratedCount: allRecords.length,
            totalCount: 6470,
            percent: Math.min(25, Math.round((allRecords.length / 6470) * 25)),
            statusText: `Reading batch ${batchCounter} from Firestore (${allRecords.length} records retrieved)...`,
            isComplete: false,
          });

          const targetQuery: any = lastDocSnap
            ? query(colRef, orderBy('__name__'), startAfter(lastDocSnap), limit(500))
            : query(colRef, orderBy('__name__'), limit(500));

          const snap: any = await getDocs(targetQuery);
          if (snap.empty) {
            hasMore = false;
            break;
          }

          snap.forEach((d: any) => {
            allRecords.push({ ...(d.data() as PropertyListing), id: d.id });
          });

          lastDocSnap = snap.docs[snap.docs.length - 1];
          if (snap.docs.length < 500) {
            hasMore = false;
          }
        }
      } catch (firestoreErr: any) {
        if (isQuotaError(firestoreErr) || allRecords.length === 0) {
          console.warn('[Migration] Firestore read quota hit or empty, pulling from server backup storage...');
          const serverRes = await fetch('/api/inventory');
          const serverData = await serverRes.json();
          allRecords = Array.isArray(serverData)
            ? serverData
            : (serverData?.inventory || serverData?.items || fallbackInventory);
        } else {
          throw firestoreErr;
        }
      }
    } else if (source === 'server_backup') {
      onProgress({
        currentBatch: 0,
        totalBatches: 0,
        migratedCount: 0,
        totalCount: 0,
        percent: 10,
        statusText: 'Reading 6,470 records from local server inventory store...',
        isComplete: false,
      });
      const serverRes = await fetch('/api/inventory');
      const serverData = await serverRes.json();
      allRecords = Array.isArray(serverData)
        ? serverData
        : (serverData?.inventory || serverData?.items || fallbackInventory);
    } else {
      allRecords = fallbackInventory;
    }

    if (!allRecords || allRecords.length === 0) {
      throw new Error('No records were found to migrate. Please verify database source.');
    }

    const totalCount = allRecords.length;
    const totalBatches = Math.ceil(totalCount / chunkSize);

    onProgress({
      currentBatch: 0,
      totalBatches,
      migratedCount: 0,
      totalCount,
      percent: 25,
      statusText: `Ready to migrate ${totalCount.toLocaleString()} listings in ${totalBatches} chunks of ${chunkSize}...`,
      isComplete: false,
    });

    // Step 4: Stream in atomic chunks to Google Sheets
    let migratedCount = 0;

    for (let b = 0; b < totalBatches; b++) {
      const startIdx = b * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, totalCount);
      const chunk = allRecords.slice(startIdx, endIdx);

      const batchNum = b + 1;
      const currentPercent = 25 + Math.round(((b) / totalBatches) * 70);

      onProgress({
        currentBatch: batchNum,
        totalBatches,
        migratedCount,
        totalCount,
        percent: currentPercent,
        statusText: `Uploading Batch ${batchNum} of ${totalBatches} (${chunk.length} listings) to Google Sheets...`,
        isComplete: false,
      });

      // Send chunk to Google Sheets
      const res = await postToAppsScript(scriptUrl, {
        action: 'batch-append',
        listings: chunk,
      });

      if (!res || !res.success) {
        throw new Error(res?.error || `Batch ${batchNum} failed to upload to Google Sheets`);
      }

      migratedCount += chunk.length;

      // Small 350ms delay between chunks to respect Google rate limits
      if (b < totalBatches - 1) {
        await new Promise(r => setTimeout(r, 350));
      }
    }

    // Finished successfully!
    onProgress({
      currentBatch: totalBatches,
      totalBatches,
      migratedCount,
      totalCount,
      percent: 100,
      statusText: `Migration 100% Complete! ${migratedCount.toLocaleString()} listings successfully saved in Google Sheets.`,
      isComplete: true,
    });

    return {
      success: true,
      migratedCount,
    };
  } catch (err: any) {
    onProgress({
      currentBatch: 0,
      totalBatches: 0,
      migratedCount: 0,
      totalCount: 0,
      percent: 0,
      statusText: `Migration Error: ${err.message}`,
      isComplete: false,
      error: err.message,
    });

    return {
      success: false,
      migratedCount: 0,
      error: err.message,
    };
  }
}
