import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  RefreshCw, 
  HardDrive, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  FileArchive, 
  FileText, 
  Trash2, 
  ExternalLink, 
  LogOut, 
  FolderSync, 
  Download, 
  Sparkles,
  ShieldCheck,
  Plus,
  Clock
} from 'lucide-react';
import { User } from 'firebase/auth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { PropertyListing } from '../types/inventory';
import { isValidContactNumber, formatPakistaniPhoneNumber } from '../utils/phoneUtils';
import { 
  initAuth, 
  googleSignIn, 
  logoutGoogle, 
  getAccessToken,
  getPersistedUser 
} from '../services/googleDriveAuth';
import { 
  findOrCreateFolder, 
  listFilesInFolder, 
  downloadDriveFileBlob, 
  uploadFileToFolder, 
  deleteDriveFile, 
  backupInventoryToDrive,
  DriveFileItem, 
  LAHORE_DATA_FOLDER_NAME,
  formatDriveTime
} from '../services/googleDriveService';

interface GoogleDriveManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: PropertyListing[];
  onAddListings: (listings: PropertyListing[]) => void;
  onNotify: (msg: string) => void;
  defaultSociety?: string;
}

export const GoogleDriveManagerModal: React.FC<GoogleDriveManagerModalProps> = ({
  isOpen,
  onClose,
  inventory,
  onAddListings,
  onNotify,
  defaultSociety = 'All Lahore'
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  // Destructive Confirmation Dialog State
  const [fileToDelete, setFileToDelete] = useState<DriveFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileUploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if device already has a saved Google Drive session
    getAccessToken().then((cached) => {
      if (cached) {
        setToken(cached);
        const persisted = getPersistedUser();
        if (persisted) {
          setUser({ email: persisted.email, displayName: persisted.displayName } as any);
        }
      }
    });

    const unsubscribe = initAuth(
      (authUser, authToken) => {
        setUser(authUser);
        setToken(authToken);
      },
      () => {
        // Only clear if no persisted token is in storage
        getAccessToken().then((cached) => {
          if (!cached) {
            setUser(null);
            setToken(null);
          }
        });
      }
    );
    return () => unsubscribe();
  }, []);

  // When user is authenticated and modal opens, load folder and files
  useEffect(() => {
    if (isOpen) {
      if (token) {
        loadDriveFolderAndFiles(token);
      } else {
        // Check if token can be loaded immediately from storage
        getAccessToken().then((cached) => {
          if (cached) {
            setToken(cached);
            const persisted = getPersistedUser();
            if (persisted) {
              setUser({ email: persisted.email, displayName: persisted.displayName } as any);
            }
            loadDriveFolderAndFiles(cached);
          }
        });
      }
    }
  }, [isOpen, token]);

  const loadDriveFolderAndFiles = async (accessToken: string) => {
    setIsLoadingFiles(true);
    setSyncSummary(null);
    try {
      const fId = await findOrCreateFolder(LAHORE_DATA_FOLDER_NAME, accessToken);
      setFolderId(fId);
      const folderFiles = await listFilesInFolder(fId, accessToken);
      setFiles(folderFiles);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('AUTH_EXPIRED') || msg.includes('401')) {
        console.info('[Google Drive] Session expired. Resetting auth state.');
        await handleLogout();
        setSyncSummary('Your Google Drive session has expired. Please click "Sign in with Google" to continue.');
      } else {
        console.warn('[Google Drive] Could not load files:', msg);
        onNotify(`Google Drive: ${msg || 'Could not load files'}`);
      }
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        onNotify(`Connected to Google Drive as ${result.user.displayName || result.user.email}!`);
        await loadDriveFolderAndFiles(result.accessToken);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (!msg.includes('closed-by-user') && !msg.includes('cancelled') && !msg.includes('popup-closed')) {
        console.warn('Google Sign-in status:', msg);
      }
      onNotify('Google Sign-in was cancelled or closed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutGoogle();
      setUser(null);
      setToken(null);
      setFiles([]);
      setFolderId(null);
      onNotify('Disconnected from Google Drive.');
    } catch (err: any) {
      console.error('Logout error:', err);
    }
  };

  // Smart area and society extractor from file name
  const parseAreaFromFileName = (rawFileName: string): { society: string; block: string } => {
    const clean = rawFileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const lower = clean.toLowerCase();

    let society = defaultSociety || 'All Lahore';
    if (lower.includes('bahria orchard') || lower.includes('orchard')) {
      society = 'Bahria Orchard';
    } else if (lower.includes('bahria town') || lower.includes('bahria')) {
      society = 'Bahria Town';
    } else if (lower.includes('dha') || lower.includes('defence')) {
      society = 'DHA Lahore';
    } else if (lower.includes('lake city')) {
      society = 'Lake City';
    } else if (lower.includes('johar')) {
      society = 'Johar Town';
    } else if (lower.includes('gulberg')) {
      society = 'Gulberg';
    } else if (lower.includes('model town')) {
      society = 'Model Town';
    } else if (lower.includes('park view')) {
      society = 'Park View City';
    } else if (lower.includes('state life')) {
      society = 'State Life';
    } else if (lower.includes('valencia')) {
      society = 'Valencia Town';
    } else if (lower.includes('wapda')) {
      society = 'Wapda Town';
    } else if (lower.includes('fazaia')) {
      society = 'Fazaia Housing';
    } else if (lower.includes('smart city')) {
      society = 'Lahore Smart City';
    } else if (lower.includes('etihad')) {
      society = 'Etihad Town';
    } else if (lower.includes('al jalil') || lower.includes('al-jalil')) {
      society = 'Al-Jalil Garden';
    } else if (lower.includes('paragon')) {
      society = 'Paragon City';
    } else if (lower.includes('new lahore')) {
      society = 'New Lahore City';
    } else if (lower.includes('central park')) {
      society = 'Central Park';
    } else if (lower.includes('al kabir') || lower.includes('al-kabir')) {
      society = 'Al-Kabir Town';
    } else {
      // Dynamic: If file contains e.g. "Etihad Town" or "Chinar Bagh"
      const nameParts = clean.split(/phase|block|sector/i)[0].trim();
      if (nameParts.length > 3 && !nameParts.toLowerCase().includes('chat')) {
        society = nameParts;
      }
    }

    let block = clean;
    const blockMatch = clean.match(/(?:Block|Blk|Sector|Sec|Phase)\s*([A-Za-z0-9\-]+(?:\s+[A-Za-z0-9]+)?)/i);
    if (blockMatch) {
      block = blockMatch[0].trim();
    }

    return { society, block };
  };

  // Process a single drive file (.zip, .txt, .csv, .xlsx, .xls) and extract listings
  const processDriveFile = async (fileItem: DriveFileItem, accessToken: string): Promise<PropertyListing[]> => {
    const blob = await downloadDriveFileBlob(fileItem.id, accessToken, fileItem.mimeType);
    let chatText = '';
    const lowerName = fileItem.name.toLowerCase();

    if (lowerName.endsWith('.zip') || (fileItem.mimeType && fileItem.mimeType.includes('zip'))) {
      const zip = await JSZip.loadAsync(blob);
      const fileNames = Object.keys(zip.files);
      for (const relPath of fileNames) {
        const entry = zip.files[relPath];
        if (!entry.dir && (relPath.toLowerCase().endsWith('.txt') || relPath.toLowerCase().endsWith('.csv'))) {
          const content = await entry.async('string');
          if (content.trim()) {
            chatText += `\n--- File: ${relPath} ---\n${content}\n`;
          }
        }
      }
    } else if (
      lowerName.endsWith('.xlsx') || 
      lowerName.endsWith('.xls') || 
      lowerName.endsWith('.csv') ||
      (fileItem.mimeType && (fileItem.mimeType.includes('spreadsheet') || fileItem.mimeType.includes('excel')))
    ) {
      // Direct Excel spreadsheet parsing
      const buffer = await blob.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) {
          chatText += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
        }
      }
    } else {
      chatText = await blob.text();
    }

    if (!chatText.trim()) return [];

    const { society: derivedSociety, block: derivedBlock } = parseAreaFromFileName(fileItem.name);

    // Call server AI parser endpoint
    const res = await fetch('/api/parse-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatText: chatText.slice(0, 50000),
        defaultSociety: derivedSociety,
        fileName: fileItem.name,
        defaultContact: '-'
      })
    });

    if (!res.ok) {
      throw new Error(`Parser failed for file ${fileItem.name} (HTTP ${res.status})`);
    }

    const data = await res.json();
    const rawListings = Array.isArray(data.listings) ? data.listings : [];

    // STRICT USER REQUIREMENT:
    // Only retain properties that have a valid contact number. Filter out any without phone!
    const validWithPhone = rawListings.filter((item: any) => isValidContactNumber(item.contactNumber));

    // Ensure society and block are accurately assigned from filename if missing
    return validWithPhone.map((item: any, idx: number) => ({
      ...item,
      id: item.id || `drive_${Date.now()}_${idx}`,
      society: item.society && item.society !== 'All Lahore' ? item.society : derivedSociety,
      block: item.block && item.block !== '-' ? item.block : derivedBlock,
      contactNumber: formatPakistaniPhoneNumber(item.contactNumber),
      source: `Google Drive: ${fileItem.name}`,
      dateAdded: item.dateAdded || new Date().toISOString()
    }));
  };

  // Scan and Sync all files in "Lahore Data" folder with deduplication
  const handleSyncAllLahoreData = async () => {
    if (!token) return;
    setIsSyncing(true);
    setSyncSummary(null);

    try {
      const folderFiles = await listFilesInFolder(folderId || await findOrCreateFolder(LAHORE_DATA_FOLDER_NAME, token), token);
      setFiles(folderFiles);

      const targetFiles = folderFiles.filter(f => {
        const lower = f.name.toLowerCase();
        return lower.endsWith('.zip') || 
               lower.endsWith('.txt') || 
               lower.endsWith('.csv') ||
               lower.endsWith('.xlsx') ||
               lower.endsWith('.xls') ||
               (f.mimeType && (f.mimeType.includes('zip') || f.mimeType.includes('spreadsheet') || f.mimeType.includes('text')));
      });

      if (targetFiles.length === 0) {
        setSyncSummary("No property files found in 'Lahore Data' folder. Please upload WhatsApp .zip, .txt, or Excel files.");
        onNotify("No files found in 'Lahore Data' folder.");
        return;
      }

      // Existing listing keys for deduplication: [Society]_[Block]_[UnitNumber]
      const existingKeys = new Set(
        inventory.map(item => `${(item.society || '').toLowerCase().trim()}_${(item.block || '').toLowerCase().trim()}_${(item.unitNumber || '').toLowerCase().trim()}`)
      );

      let totalExtracted = 0;
      let totalAdded = 0;
      let totalSkipped = 0;
      let totalFilteredNoContact = 0;
      let failedFiles = 0;
      const allNewListings: PropertyListing[] = [];

      for (const f of targetFiles) {
        try {
          onNotify(`Reading ${f.name} from Google Drive...`);
          const extracted = await processDriveFile(f, token);
          totalExtracted += extracted.length;

          for (const item of extracted) {
            // Double-check: ensure listing has a valid phone number before adding to inventory
            if (!isValidContactNumber(item.contactNumber)) {
              totalFilteredNoContact++;
              continue;
            }

            const key = `${(item.society || '').toLowerCase().trim()}_${(item.block || '').toLowerCase().trim()}_${(item.unitNumber || '').toLowerCase().trim()}`;
            // Deduplication: If plot number is specified and already exists, skip it
            if (item.unitNumber && item.unitNumber !== '-' && existingKeys.has(key)) {
              totalSkipped++;
            } else {
              existingKeys.add(key);
              allNewListings.push(item);
              totalAdded++;
            }
          }
        } catch (fileErr: any) {
          console.warn(`[Drive Sync Error] Skipping file ${f.name}:`, fileErr);
          failedFiles++;
        }
      }

      if (allNewListings.length > 0) {
        onAddListings(allNewListings);
      }

      const summary = `🎉 Google Drive Sync Complete!\n• Scanned ${targetFiles.length} files from 'Lahore Data'\n• Added ${totalAdded} verified properties (with contact numbers) to inventory\n• Skipped ${totalSkipped} existing duplicates${totalFilteredNoContact > 0 ? `\n• Omitted ${totalFilteredNoContact} listings without contact numbers` : ''}${failedFiles > 0 ? `\n• Note: ${failedFiles} file(s) were empty or unreadable` : ''}`;
      setSyncSummary(summary);
      onNotify(`Synced ${totalAdded} verified listings with phone numbers!`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('AUTH_EXPIRED') || msg.includes('401')) {
        console.info('[Google Drive] Session expired during sync. Resetting state.');
        await handleLogout();
        setSyncSummary('Your Google Drive session has expired. Please click "Sign in with Google" to reconnect.');
        onNotify('Google Drive session expired. Please sign in again.');
      } else {
        console.warn('[Google Drive] Sync issue:', msg);
        setSyncSummary(`Sync error: ${msg || 'Failed to process files'}`);
        onNotify('Google Drive sync encountered an issue.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync a single file
  const handleSyncSingleFile = async (fileItem: DriveFileItem) => {
    if (!token) return;
    setIsSyncing(true);
    try {
      onNotify(`Processing ${fileItem.name}...`);
      const extracted = await processDriveFile(fileItem, token);
      const validWithPhone = extracted.filter(item => isValidContactNumber(item.contactNumber));
      const omittedNoPhone = extracted.length - validWithPhone.length;

      const existingKeys = new Set(
        inventory.map(item => `${(item.society || '').toLowerCase().trim()}_${(item.block || '').toLowerCase().trim()}_${(item.unitNumber || '').toLowerCase().trim()}`)
      );

      const newListings: PropertyListing[] = [];
      let skipped = 0;

      for (const item of validWithPhone) {
        const key = `${(item.society || '').toLowerCase().trim()}_${(item.block || '').toLowerCase().trim()}_${(item.unitNumber || '').toLowerCase().trim()}`;
        if (item.unitNumber && item.unitNumber !== '-' && existingKeys.has(key)) {
          skipped++;
        } else {
          existingKeys.add(key);
          newListings.push(item);
        }
      }

      if (newListings.length > 0) {
        onAddListings(newListings);
      }

      onNotify(`Imported ${newListings.length} verified listings from ${fileItem.name} (${skipped} duplicates, ${omittedNoPhone} without phone omitted).`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('AUTH_EXPIRED') || msg.includes('401')) {
        await handleLogout();
        onNotify('Session expired. Please sign in with Google again.');
      } else {
        console.warn(`[Google Drive] Import ${fileItem.name}:`, msg);
        onNotify(`Could not import ${fileItem.name}: ${msg}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Direct upload from local machine to Google Drive "Lahore Data" folder
  const handleUploadToDrive = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token || !folderId) return;

    setIsUploading(true);
    try {
      onNotify(`Uploading ${file.name} to Google Drive 'Lahore Data' folder...`);
      const uploaded = await uploadFileToFolder(file, folderId, token);
      setFiles(prev => [uploaded, ...prev]);
      onNotify(`Uploaded ${file.name} to Google Drive successfully!`);
    } catch (err: any) {
      console.error('Upload to Drive failed:', err);
      onNotify(`Failed to upload to Google Drive: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileUploadInputRef.current) fileUploadInputRef.current.value = '';
    }
  };

  // Backup current live system inventory to Google Drive
  const handleBackupInventory = async () => {
    if (!token) return;
    setIsBackingUp(true);
    try {
      onNotify('Creating inventory backup in Google Drive...');
      const backupFile = await backupInventoryToDrive(inventory, token);
      onNotify(`Saved backup: ${backupFile.name} to Google Drive!`);
    } catch (err: any) {
      console.error('Backup failed:', err);
      onNotify(`Failed to backup inventory: ${err.message}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  // Destructive Confirmation handler: Delete file from Google Drive
  const confirmDeleteFile = async () => {
    if (!fileToDelete || !token) return;
    setIsDeleting(true);
    try {
      await deleteDriveFile(fileToDelete.id, token);
      setFiles(prev => prev.filter(f => f.id !== fileToDelete.id));
      onNotify(`Deleted file '${fileToDelete.name}' from Google Drive.`);
      setFileToDelete(null);
    } catch (err: any) {
      console.error('Delete file error:', err);
      onNotify(`Failed to delete file: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-9 sm:w-10 h-9 sm:h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20 shrink-0">
              <HardDrive className="w-4 sm:w-5 h-4 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold text-white flex items-center gap-1.5 sm:gap-2 truncate">
                <span>Google Drive Manager</span>
                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/20 font-mono hidden sm:inline">
                  Official OAuth
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Sync WhatsApp .zip chat files from &ldquo;{LAHORE_DATA_FOLDER_NAME}&rdquo; folder
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0 ml-2"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1">
          
          {/* Section 1: Authentication State */}
          {!user ? (
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <HardDrive className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Connect Your Google Drive
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Sign in with your Google account to automatically read WhatsApp export <span className="text-amber-400 font-semibold">.zip files</span> uploaded to your Google Drive <span className="text-amber-400 font-semibold">&ldquo;Lahore Data&rdquo;</span> folder.
                </p>
              </div>

              {/* Official Google Sign-In Button */}
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="inline-flex items-center justify-center gap-3 px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-medium text-xs sm:text-sm shadow-md transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isLoggingIn ? 'Connecting to Google...' : 'Sign in with Google'}</span>
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 pt-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tokens cached in-memory only &bull; Read-only permissions by default</span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              {/* Account Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'Google User'} className="w-10 h-10 rounded-full border border-amber-500/30" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-sm">
                      {user.displayName?.[0] || user.email?.[0] || 'U'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white">{user.displayName || 'Google User'}</p>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Connected
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 rounded-xl text-xs text-rose-400 hover:text-white hover:bg-rose-500/10 border border-rose-500/20 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>

              {/* Folder & Status Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-xl space-y-1">
                  <p className="text-slate-400">Target Google Drive Folder:</p>
                  <p className="font-bold text-amber-400 text-sm flex items-center gap-1.5">
                    <span>&ldquo;{LAHORE_DATA_FOLDER_NAME}&rdquo;</span>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    Folder ID: {folderId || 'Detecting...'}
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-xl space-y-1">
                  <p className="text-slate-400">Detected Files in Folder:</p>
                  <p className="font-bold text-white text-sm">
                    {files.length} Files found
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {files.filter(f => f.name.endsWith('.zip')).length} WhatsApp .zip archives
                  </p>
                </div>

                <div className="p-3 bg-slate-900/90 border border-emerald-500/20 rounded-xl space-y-1 sm:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Gemini 3.8 Flash Phraser Engine Active</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Extracts plot unit #, society, block, marla size, price, and dealer details.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25 shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified Contacts Only (Enforced)</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {/* Primary: Scan & Sync All */}
                <button
                  onClick={handleSyncAllLahoreData}
                  disabled={isSyncing || isLoadingFiles}
                  className="flex-1 min-w-[200px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Scanning & Phrasing...' : 'Scan & Sync Lahore Data Folder'}</span>
                </button>

                {/* Upload to Drive */}
                <input
                  ref={fileUploadInputRef}
                  type="file"
                  accept=".zip,.txt,.csv,.xlsx"
                  onChange={handleUploadToDrive}
                  className="hidden"
                />
                <button
                  onClick={() => fileUploadInputRef.current?.click()}
                  disabled={isUploading || isSyncing}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                  title="Upload .zip or chat export to Google Drive 'Lahore Data' folder"
                >
                  <UploadCloud className="w-4 h-4 text-amber-400" />
                  <span>{isUploading ? 'Uploading...' : 'Upload to Drive'}</span>
                </button>

                {/* Backup System to Drive */}
                <button
                  onClick={handleBackupInventory}
                  disabled={isBackingUp || isSyncing}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                  title="Create backup copy of all listings in Google Drive"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>{isBackingUp ? 'Saving...' : 'Backup System'}</span>
                </button>
              </div>

              {/* Sync Summary Notification */}
              {syncSummary && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200 whitespace-pre-line animate-fadeIn">
                  {syncSummary}
                </div>
              )}
            </div>
          )}

          {/* Section 2: Files in "Lahore Data" Folder */}
          {user && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Files inside &ldquo;{LAHORE_DATA_FOLDER_NAME}&rdquo;
                  </h3>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                    {files.length}
                  </span>
                </div>

                <button
                  onClick={() => token && loadDriveFolderAndFiles(token)}
                  disabled={isLoadingFiles}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                  <span>Refresh List</span>
                </button>
              </div>

              {isLoadingFiles ? (
                <div className="py-10 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
                  <p className="text-xs">Fetching Google Drive folder contents...</p>
                </div>
              ) : files.length === 0 ? (
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
                  <FileArchive className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-medium text-slate-300">
                    No files found in &ldquo;{LAHORE_DATA_FOLDER_NAME}&rdquo; folder.
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Upload your WhatsApp export .zip files (e.g. <span className="text-slate-300 font-mono">DHA Phase 6 Block C.zip</span>) to this Google Drive folder or use the upload button above.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {files.map((file, idx) => {
                    const isZip = file.name.toLowerCase().endsWith('.zip') || (file.mimeType && file.mimeType.includes('zip'));
                    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.csv') || (file.mimeType && file.mimeType.includes('spreadsheet'));
                    const { society, block } = parseAreaFromFileName(file.name);
                    const timeInfo = formatDriveTime(file.modifiedTime || file.createdTime);

                    return (
                      <div
                        key={`${file.id}_${idx}`}
                        className="p-3 sm:p-3.5 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 text-xs transition shadow-xs"
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                            isZip 
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                              : isExcel 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-slate-800 text-slate-300'
                          }`}>
                            {isZip ? <FileArchive className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-white truncate max-w-full sm:max-w-md">
                                {file.name}
                              </p>
                              {file.webViewLink && (
                                <a 
                                  href={file.webViewLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-slate-500 hover:text-amber-400 transition"
                                  title="Open in Google Drive"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 mt-1">
                              <span className="text-amber-300 font-medium">{society}</span>
                              <span className="text-slate-600">&bull;</span>
                              <span>Area: <span className="text-slate-300">{block}</span></span>
                              <span className="text-slate-600">&bull;</span>
                              {/* Exact Time & Date Display */}
                              <span 
                                className="inline-flex items-center gap-1 text-amber-200/90 bg-amber-500/[0.08] border border-amber-500/20 px-2 py-0.5 rounded-md font-mono text-[10px]"
                                title={`Google Drive Timestamp: ${timeInfo.full}`}
                              >
                                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="font-semibold text-amber-300">{timeInfo.formatted}</span>
                                <span className="text-slate-400">({timeInfo.relative})</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06] w-full sm:w-auto">
                          {/* Sync this file button */}
                          <button
                            onClick={() => handleSyncSingleFile(file)}
                            disabled={isSyncing}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                            title="Extract listings and add non-duplicates to inventory"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Import</span>
                          </button>

                          {/* Delete from Drive button (triggers confirmation dialog) */}
                          <button
                            onClick={() => setFileToDelete(file)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer"
                            title="Delete file from Google Drive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section 3: Automatic Phrasing & Deduplication Rules Info */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-2 text-xs text-slate-400">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <FolderSync className="w-4 h-4 text-amber-400" />
              <span>Autonomous Area Identification &amp; Deduplication Rules</span>
            </h4>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
              <li><strong className="text-slate-300">File Name Parsing:</strong> Society &amp; Block are extracted directly from the zip file name (e.g., &ldquo;DHA Phase 6 Block C.zip&rdquo;).</li>
              <li><strong className="text-slate-300">Deduplication:</strong> Unique key <code className="text-amber-300 font-mono">[Society]_[Block]_[UnitNumber]</code> is checked. Duplicates are skipped completely.</li>
              <li><strong className="text-slate-300">Empty Dealers:</strong> Dealer Name and Phone Number are strictly set to <code className="text-amber-300 font-mono">&ldquo;-&rdquo;</code> if not present in the chat.</li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-500">
          <span>Connected to Google Cloud Project &bull; vast-lightning-vzbz0</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>

      {/* Mandatory Destructive Confirmation Dialog for deleting file from Google Drive */}
      {fileToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete File from Google Drive?</h3>
                <p className="text-xs text-slate-400">This will remove the file from your Google Drive.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <p className="text-slate-400">File Name:</p>
              <p className="font-semibold text-white font-mono truncate">{fileToDelete.name}</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteFile}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
