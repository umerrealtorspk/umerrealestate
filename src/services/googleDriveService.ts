import { PropertyListing } from '../types/inventory';
import { clearExpiredSession } from './googleDriveAuth';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  iconLink?: string;
}

export const LAHORE_DATA_FOLDER_NAME = 'Lahore Data';
export const UMER_REALTORS_FOLDER_NAME = 'Umer Realtors - Lahore Real Estate';

/**
 * Format Google Drive modifiedTime/createdTime into clean human-readable date and time.
 * E.g., "19 Oct 2024, 04:30 PM (2h ago)"
 */
export function formatDriveTime(isoString?: string): {
  formatted: string;
  dateStr: string;
  timeStr: string;
  relative: string;
  full: string;
} {
  if (!isoString) {
    return {
      formatted: 'Recently updated',
      dateStr: 'Recent',
      timeStr: '',
      relative: 'Just now',
      full: 'Recently updated'
    };
  }

  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return {
        formatted: 'Recently updated',
        dateStr: 'Recent',
        timeStr: '',
        relative: 'Just now',
        full: 'Recently updated'
      };
    }

    const dateStr = d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const timeStr = d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const formatted = `${dateStr}, ${timeStr}`;

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relative = '';
    if (diffMins < 1) relative = 'Just now';
    else if (diffMins < 60) relative = `${diffMins}m ago`;
    else if (diffHours < 24) relative = `${diffHours}h ago`;
    else if (diffDays === 1) relative = 'Yesterday';
    else if (diffDays < 7) relative = `${diffDays}d ago`;
    else relative = dateStr;

    return {
      formatted,
      dateStr,
      timeStr,
      relative,
      full: `${formatted} (${d.toLocaleTimeString()})`
    };
  } catch {
    return {
      formatted: 'Recently updated',
      dateStr: 'Recent',
      timeStr: '',
      relative: 'Just now',
      full: 'Recently updated'
    };
  }
}

/**
 * Extracts a user-friendly error message from Google API responses
 */
async function parseGoogleApiError(res: Response, defaultMsg: string): Promise<string> {
  if (res.status === 401) {
    clearExpiredSession();
    return 'AUTH_EXPIRED: Your Google Drive session has expired. Please sign in with Google again to continue.';
  }
  if (res.status === 403) {
    return 'PERMISSION_DENIED: Access to this Google Drive file or folder was denied. Please verify permissions.';
  }
  try {
    const errJson = await res.json();
    if (errJson?.error?.message) {
      return errJson.error.message;
    }
  } catch {
    // If not JSON, try text
    try {
      const text = await res.text();
      if (text && text.length < 150) return text;
    } catch {}
  }
  return `${defaultMsg} (HTTP ${res.status})`;
}

/**
 * Searches for a folder by name or creates it if not found.
 */
export async function findOrCreateFolder(folderName: string, accessToken: string): Promise<string> {
  const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const err = await parseGoogleApiError(searchRes, `Failed to search Google Drive folder '${folderName}'`);
    throw new Error(err);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!createRes.ok) {
    const err = await parseGoogleApiError(createRes, `Failed to create Google Drive folder '${folderName}'`);
    throw new Error(err);
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

/**
 * Lists all files inside a specific Google Drive folder.
 */
export async function listFilesInFolder(folderId: string, accessToken: string): Promise<DriveFileItem[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,iconLink)&orderBy=modifiedTime desc&pageSize=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const err = await parseGoogleApiError(res, 'Failed to list files in Google Drive folder');
    throw new Error(err);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Downloads binary or text file content from Google Drive using its fileId.
 * Supports standard files, as well as native Google Sheets and Docs exports.
 */
export async function downloadDriveFileBlob(fileId: string, accessToken: string, mimeType?: string): Promise<Blob> {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  // Handle Google Docs & Google Sheets export URLs (prevents 403 binary download error)
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
  } else if (mimeType === 'application/vnd.google-apps.document') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const err = await parseGoogleApiError(res, 'Failed to download file from Google Drive');
    throw new Error(err);
  }

  return await res.blob();
}

/**
 * Uploads a file (e.g. WhatsApp export .zip or chat .txt) directly into a Google Drive folder.
 */
export async function uploadFileToFolder(file: File, folderId: string, accessToken: string): Promise<DriveFileItem> {
  const metadata = {
    name: file.name,
    parents: [folderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,createdTime,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });

  if (!res.ok) {
    const err = await parseGoogleApiError(res, 'Failed to upload file to Google Drive');
    throw new Error(err);
  }

  return await res.json();
}

/**
 * Deletes a file from Google Drive.
 * Must be preceded by user confirmation in UI.
 */
export async function deleteDriveFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok && res.status !== 204) {
    const err = await parseGoogleApiError(res, 'Failed to delete Google Drive file');
    throw new Error(err);
  }
}

/**
 * Saves or updates a master inventory backup file in Google Drive.
 */
export async function backupInventoryToDrive(inventory: PropertyListing[], accessToken: string): Promise<DriveFileItem> {
  const folderId = await findOrCreateFolder(UMER_REALTORS_FOLDER_NAME, accessToken);
  const fileName = `Lahore_Master_Inventory_${new Date().toISOString().slice(0, 10)}.json`;

  const blob = new Blob([JSON.stringify(inventory, null, 2)], { type: 'application/json' });
  const file = new File([blob], fileName, { type: 'application/json' });

  return await uploadFileToFolder(file, folderId, accessToken);
}
