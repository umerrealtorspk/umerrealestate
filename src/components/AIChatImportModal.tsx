import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Send, 
  Paperclip, 
  X, 
  Sparkles, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Building2, 
  ArrowUp,
  MessageSquare,
  FileCheck,
  RotateCcw,
  Search,
  Database,
  CloudCheck,
  AlertTriangle,
  Phone,
  User,
  Undo2,
  Archive,
  HardDrive,
  RefreshCw,
  FolderOpen,
  Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { PropertyListing, SheetConfig } from '../types/inventory';
import { isValidContactNumber, formatPakistaniPhoneNumber } from '../utils/phoneUtils';
import { 
  initAuth, 
  googleSignIn, 
  getAccessToken,
  getPersistedUser 
} from '../services/googleDriveAuth';
import { 
  findOrCreateFolder, 
  listFilesInFolder, 
  downloadDriveFileBlob, 
  DriveFileItem, 
  LAHORE_DATA_FOLDER_NAME,
  formatDriveTime
} from '../services/googleDriveService';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  action?: 'query' | 'add' | 'delete' | 'update' | 'chat';
  modelUsed?: string;
  fileAttachment?: {
    name: string;
    type: string;
    sizeFormatted: string;
    isDriveFile?: boolean;
    driveFileId?: string;
  };
  addedListings?: PropertyListing[];
  deletedListings?: PropertyListing[];
  matchedListings?: PropertyListing[];
  updatedListing?: PropertyListing;
  driveFiles?: DriveFileItem[];
  showDriveLoginPrompt?: boolean;
}

interface AIChatImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: PropertyListing[];
  sheetConfig: SheetConfig;
  onAddListings: (listings: PropertyListing[]) => void;
  onDeleteListings: (ids: string[]) => void;
  onUpdateListing?: (listing: PropertyListing) => void;
  onNotify: (msg: string) => void;
  defaultSociety?: string;
  onOpenDriveManager?: () => void;
}

export const AIChatImportModal: React.FC<AIChatImportModalProps> = ({
  isOpen,
  onClose,
  inventory,
  sheetConfig,
  onAddListings,
  onDeleteListings,
  onUpdateListing,
  onNotify,
  defaultSociety = 'All Lahore',
  onOpenDriveManager
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Salam Umer Bhai! Inventory aur Google Drive assist ke liye main ready hoon. Kisi bhi plot, rate, dealer, ya file import ke baray mein poochein.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'chat'
    }
  ]);

  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFileItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [totalAddedThisSession, setTotalAddedThisSession] = useState(0);
  const [totalDeletedThisSession, setTotalDeletedThisSession] = useState(0);

  // Google Drive state inside AI Chat
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveUser, setDriveUser] = useState<any | null>(null);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [driveFolderFiles, setDriveFolderFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize Auth state listener with persistent token support
  useEffect(() => {
    // Check cached token immediately so user never has to re-login on the device
    getAccessToken().then((cached) => {
      if (cached) {
        setDriveToken(cached);
        const persisted = getPersistedUser();
        if (persisted) {
          setDriveUser({ email: persisted.email, displayName: persisted.displayName } as any);
        }
      }
    });

    const unsubscribe = initAuth(
      (authUser, authToken) => {
        setDriveUser(authUser);
        setDriveToken(authToken);
      },
      () => {
        getAccessToken().then((cached) => {
          if (!cached) {
            setDriveUser(null);
            setDriveToken(null);
          }
        });
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
        scrollToBottom();
      }, 150);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (!isOpen) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setSelectedDriveFile(null); // Clear drive file if local file is selected
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setSelectedDriveFile(null);
    }
  };

  // Helper: Extract Area, Block and Society from file name (e.g., "DHA Phase 6 Block C.zip" or "Bahria Orchard Phase 2 G5.zip")
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

  // Helper: Download, Unzip & Parse Google Drive file and add to inventory
  const processAndImportDriveFile = async (
    driveFile: DriveFileItem, 
    token: string
  ): Promise<{ added: PropertyListing[]; skipped: number; skippedNoContact?: number }> => {
    const blob = await downloadDriveFileBlob(driveFile.id, token, driveFile.mimeType);
    let chatText = '';
    const lowerName = driveFile.name.toLowerCase();

    const isZip = lowerName.endsWith('.zip') || (driveFile.mimeType && driveFile.mimeType.includes('zip'));
    if (isZip) {
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
      (driveFile.mimeType && (driveFile.mimeType.includes('spreadsheet') || driveFile.mimeType.includes('excel')))
    ) {
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

    if (!chatText.trim()) {
      return { added: [], skipped: 0 };
    }

    const { society: derivedSociety, block: derivedBlock } = parseAreaFromFileName(driveFile.name);

    // Call parser API
    const res = await fetch('/api/parse-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatText: chatText.slice(0, 50000),
        defaultSociety: derivedSociety,
        fileName: driveFile.name,
        defaultContact: '-'
      })
    });

    const data = await res.json();
    const rawListings = Array.isArray(data.listings) ? data.listings : [];

    // Deduplication check: [Society]_[Block]_[UnitNumber]
    const existingKeys = new Set(
      inventory.map(item => `${(item.society || '').toLowerCase().trim()}_${(item.block || '').toLowerCase().trim()}_${(item.unitNumber || '').toLowerCase().trim()}`)
    );

    const newListings: PropertyListing[] = [];
    let skipped = 0;
    let skippedNoContact = 0;

    for (let i = 0; i < rawListings.length; i++) {
      const item = rawListings[i];
      // STRICT FILTER: Discard any listing without a valid contact number!
      if (!isValidContactNumber(item.contactNumber)) {
        skippedNoContact++;
        continue;
      }

      const soc = item.society && item.society !== 'All Lahore' ? item.society : derivedSociety;
      const blk = item.block && item.block !== '-' ? item.block : derivedBlock;
      const unit = item.unitNumber && item.unitNumber.trim() !== '' ? item.unitNumber.trim() : '-';

      const key = `${soc.toLowerCase().trim()}_${blk.toLowerCase().trim()}_${unit.toLowerCase().trim()}`;
      if (unit !== '-' && existingKeys.has(key)) {
        skipped++;
      } else {
        existingKeys.add(key);
        newListings.push({
          ...item,
          id: item.id || `drive_${Date.now()}_${i}`,
          society: soc,
          block: blk,
          unitNumber: unit,
          dealerName: item.dealerName || 'Dealer Broadcast',
          contactNumber: formatPakistaniPhoneNumber(item.contactNumber),
          source: `Google Drive: ${driveFile.name}`,
          dateAdded: new Date().toISOString()
        });
      }
    }

    if (newListings.length > 0) {
      onAddListings(newListings);
      setTotalAddedThisSession(prev => prev + newListings.length);
    }

    return { added: newListings, skipped, skippedNoContact };
  };

  // Open Drive file picker popup inside AI Chat
  const handleOpenDrivePicker = async () => {
    let token = driveToken;
    if (!token) {
      try {
        const result = await googleSignIn();
        if (result) {
          setDriveUser(result.user);
          setDriveToken(result.accessToken);
          token = result.accessToken;
          onNotify(`Connected to Google Drive as ${result.user.displayName || result.user.email}!`);
        } else {
          return;
        }
      } catch (err: any) {
        onNotify(`Google Sign-in failed: ${err.message || 'Cancelled'}`);
        return;
      }
    }

    if (!token) return;
    setIsDrivePickerOpen(true);
    setIsLoadingDriveFiles(true);

    try {
      const folderId = await findOrCreateFolder(LAHORE_DATA_FOLDER_NAME, token);
      const files = await listFilesInFolder(folderId, token);
      setDriveFolderFiles(files);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('AUTH_EXPIRED') || msg.includes('401')) {
        setDriveToken(null);
        setDriveUser(null);
        try {
          const res = await googleSignIn();
          if (res) {
            setDriveUser(res.user);
            setDriveToken(res.accessToken);
            const fId = await findOrCreateFolder(LAHORE_DATA_FOLDER_NAME, res.accessToken);
            const fls = await listFilesInFolder(fId, res.accessToken);
            setDriveFolderFiles(fls);
            return;
          }
        } catch {
          onNotify('Session expired. Please click Google Drive to sign in again.');
        }
      } else {
        console.warn('[Drive Picker]', msg);
        onNotify(`Could not fetch Drive files: ${msg}`);
      }
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  // Direct trigger to import a file from chat widget
  const handleDirectImportDriveFileFromChat = async (fileItem: DriveFileItem) => {
    let token = driveToken;
    if (!token) {
      try {
        const res = await googleSignIn();
        if (res) {
          token = res.accessToken;
          setDriveToken(token);
          setDriveUser(res.user);
        } else {
          return;
        }
      } catch (e: any) {
        onNotify('Google Drive login required.');
        return;
      }
    }

    setIsProcessing(true);
    onNotify(`AI is reading and phrasing '${fileItem.name}' from Google Drive...`);

    try {
      const result = await processAndImportDriveFile(fileItem, token!);
      const { society, block } = parseAreaFromFileName(fileItem.name);

      const botReply: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'assistant',
        text: `Main ne Google Drive ke **"Lahore Data"** folder se **"${fileItem.name}"** ko Gemini 3.8 Flash Engine se phrase kar liya hai.\n\n• **Society / Area**: ${society} (${block})\n• **Naye Plots Add Huay**: ${result.added.length} verified properties (with dealer phone numbers)\n• **Duplicates Skipped**: ${result.skipped} pehle se majood listings${(result.skippedNoContact || 0) > 0 ? `\n• **Filter Kiye Gaye (No Phone)**: ${result.skippedNoContact} plots jin ka contact number nahi tha unhe add nahi kiya gaya` : ''}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: 'add',
        addedListings: result.added.length > 0 ? result.added : undefined
      };

      setMessages(prev => [...prev, botReply]);
      onNotify(`🎉 Added ${result.added.length} plots from Google Drive!`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('AUTH_EXPIRED') || msg.includes('401')) {
        setDriveToken(null);
        setDriveUser(null);
        onNotify('Google Drive session expired. Please sign in again.');
      } else {
        console.warn('Error importing Drive file:', msg);
        onNotify(`Error reading Drive file: ${msg}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const readFileContent = async (file: File): Promise<{ text?: string; inlineData?: { data: string; mimeType: string } }> => {
    const fileName = file.name.toLowerCase();

    // 0. ZIP files (WhatsApp exported chat .zip)
    if (fileName.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      try {
        const zip = await JSZip.loadAsync(file);
        let combinedChatText = '';
        const fileNames = Object.keys(zip.files);
        for (const relativePath of fileNames) {
          const zipEntry = zip.files[relativePath];
          if (!zipEntry.dir && (relativePath.toLowerCase().endsWith('.txt') || relativePath.toLowerCase().endsWith('.csv'))) {
            const content = await zipEntry.async('string');
            if (content.trim()) {
              combinedChatText += `--- File: ${relativePath} ---\n${content}\n\n`;
            }
          }
        }
        return { text: combinedChatText || 'Empty ZIP export' };
      } catch (err: any) {
        console.error('Error unzipping file:', err);
      }
    }

    // 1. Excel files (.xlsx, .xls, .csv)
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      let combinedCsv = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) {
          combinedCsv += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
        }
      }
      return { text: combinedCsv || 'Empty Spreadsheet' };
    }

    // 2. Images (screenshots, property slips)
    if (file.type.startsWith('image/')) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1] || '';
          resolve({
            inlineData: {
              data: base64,
              mimeType: file.type || 'image/jpeg'
            }
          });
        };
        reader.readAsDataURL(file);
      });
    }

    // 3. Text files (txt, WhatsApp export, json, etc.)
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({ text: (reader.result as string) || '' });
      };
      reader.onerror = () => {
        resolve({ text: '' });
      };
      reader.readAsText(file);
    });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend && !selectedFile && !selectedDriveFile) return;

    const currentFile = selectedFile;
    const currentDriveFile = selectedDriveFile;

    const fileMeta = currentFile ? {
      name: currentFile.name,
      type: currentFile.type || 'unknown',
      sizeFormatted: formatFileSize(currentFile.size),
      isDriveFile: false
    } : currentDriveFile ? {
      name: currentDriveFile.name,
      type: 'google_drive',
      sizeFormatted: currentDriveFile.size ? `${(parseInt(currentDriveFile.size) / (1024 * 1024)).toFixed(1)} MB` : 'Google Drive File',
      isDriveFile: true,
      driveFileId: currentDriveFile.id
    } : undefined;

    // Add User Message to UI
    const userMsgId = `user_${Date.now()}`;
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: textToSend || (currentDriveFile ? `Google Drive file "${currentDriveFile.name}" read aur phrase karke data add kardo.` : 'File analyze karo'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fileAttachment: fileMeta
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputText('');
    setSelectedFile(null);
    setSelectedDriveFile(null);
    setIsProcessing(true);

    try {
      // CASE 1: User explicitly attached a file from Google Drive
      if (currentDriveFile) {
        let token = driveToken || await getAccessToken();
        if (!token) {
          const authRes = await googleSignIn();
          if (authRes) {
            token = authRes.accessToken;
            setDriveToken(token);
            setDriveUser(authRes.user);
          }
        }

        if (!token) {
          setMessages(prev => [
            ...prev,
            {
              id: `bot_auth_${Date.now()}`,
              sender: 'assistant',
              text: 'Google Drive se file access karne ke liye pehle apna Google account connect karein.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              showDriveLoginPrompt: true
            }
          ]);
          setIsProcessing(false);
          return;
        }

        const result = await processAndImportDriveFile(currentDriveFile, token);
        const { society, block } = parseAreaFromFileName(currentDriveFile.name);

        const botReply: ChatMessage = {
          id: `bot_${Date.now()}`,
          sender: 'assistant',
          text: `Main ne Google Drive se **"${currentDriveFile.name}"** ko mukammal open, read aur phrase kar liya hai.\n\n• **Society / Area**: ${society} (${block})\n• **Naye Plots Add Huay**: ${result.added.length} properties\n• **Duplicates Skipped**: ${result.skipped} pehle se majood listings`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          action: 'add',
          addedListings: result.added.length > 0 ? result.added : undefined
        };

        setMessages(prev => [...prev, botReply]);
        onNotify(`🎉 Added ${result.added.length} plots from Google Drive!`);
        setIsProcessing(false);
        return;
      }

      // CASE 2: Conversational query about Google Drive files ("drive me konsi files hn", "drive files sync kardo", etc.)
      const lowerText = textToSend.toLowerCase();
      const isDriveQuery = (lowerText.includes('drive') || lowerText.includes('google drive')) && 
                           (lowerText.includes('file') || lowerText.includes('files') || lowerText.includes('sync') || lowerText.includes('read') || lowerText.includes('open') || lowerText.includes('batao') || lowerText.includes('dikhao') || lowerText.includes('check'));

      if (isDriveQuery && !currentFile) {
        const token = driveToken || await getAccessToken();
        if (!token) {
          setMessages(prev => [
            ...prev,
            {
              id: `bot_auth_${Date.now()}`,
              sender: 'assistant',
              text: 'Google Drive se files read aur phrase karne ke liye baraye meharbani pehle Google Drive connect karein.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              showDriveLoginPrompt: true
            }
          ]);
          setIsProcessing(false);
          return;
        }

        // Fetch files from "Lahore Data" folder
        const folderId = await findOrCreateFolder(LAHORE_DATA_FOLDER_NAME, token);
        const folderFiles = await listFilesInFolder(folderId, token);

        // If user asked to sync / add all files from Drive
        if (lowerText.includes('sync') || lowerText.includes('add') || lowerText.includes('phrase') || lowerText.includes('tamam')) {
          const targetFiles = folderFiles.filter(f => f.name.endsWith('.zip') || f.name.endsWith('.txt') || f.name.endsWith('.csv'));
          if (targetFiles.length === 0) {
            setMessages(prev => [
              ...prev,
              {
                id: `bot_empty_${Date.now()}`,
                sender: 'assistant',
                text: `Aapke Google Drive ke **"${LAHORE_DATA_FOLDER_NAME}"** folder me filhal koi WhatsApp export zip ya txt file nahi mili. Folder me files upload karein ya Google Drive button se upload karein.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
            setIsProcessing(false);
            return;
          }

          let allAdded: PropertyListing[] = [];
          let totalSkipped = 0;

          for (const f of targetFiles) {
            const res = await processAndImportDriveFile(f, token);
            allAdded = [...allAdded, ...res.added];
            totalSkipped += res.skipped;
          }

          setMessages(prev => [
            ...prev,
            {
              id: `bot_sync_${Date.now()}`,
              sender: 'assistant',
              text: `Main ne Google Drive ke **"${LAHORE_DATA_FOLDER_NAME}"** folder se tamam ${targetFiles.length} files ko read aur phrase kar liya hai!\n\n• **Naye Plots Add Huay**: ${allAdded.length} properties\n• **Duplicates Skipped**: ${totalSkipped} listings`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              action: 'add',
              addedListings: allAdded.length > 0 ? allAdded : undefined
            }
          ]);
          onNotify(`Synced ${allAdded.length} listings from Google Drive!`);
          setIsProcessing(false);
          return;
        }

        // Otherwise: List the files with interactive "Open & Read with AI" action buttons!
        setMessages(prev => [
          ...prev,
          {
            id: `bot_files_${Date.now()}`,
            sender: 'assistant',
            text: folderFiles.length > 0
              ? `Mujhe aapke Google Drive **"${LAHORE_DATA_FOLDER_NAME}"** folder me ye ${folderFiles.length} files mili hain. Aap kisi bhi file par click kar ke foran AI se read aur phrase karwa sakte hain:`
              : `Aapke Google Drive ke **"${LAHORE_DATA_FOLDER_NAME}"** folder me abhi koi file mojood nahi hai.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            driveFiles: folderFiles
          }
        ]);
        setIsProcessing(false);
        return;
      }

      // CASE 3: Standard Local File Attachment or Text Message
      let fileText: string | undefined;
      let inlineData: { data: string; mimeType: string } | undefined;

      if (currentFile) {
        const parsedFile = await readFileContent(currentFile);
        fileText = parsedFile.text;
        inlineData = parsedFile.inlineData;
      }

      // Compact inventory context to send to backend AI
      const inventoryContext = inventory.map(item => ({
        id: item.id,
        society: item.society,
        block: item.block,
        unitNumber: item.unitNumber,
        category: item.category,
        marlaSize: item.marlaSize,
        sizeLabel: item.sizeLabel,
        priceInLakhs: item.priceInLakhs,
        formattedPrice: item.formattedPrice,
        features: item.features,
        dealerName: item.dealerName,
        contactNumber: item.contactNumber,
        notes: item.notes,
        dateAdded: item.dateAdded,
        isSold: item.isSold
      }));

      // Build conversation history (last 5 messages)
      const conversationHistory = messages.slice(-5).map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        content: m.text
      }));

      const res = await fetch('/api/ai-chat-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          conversationHistory,
          fileText,
          fileMeta: fileMeta ? { name: fileMeta.name, type: fileMeta.type } : null,
          inlineData,
          defaultSociety,
          inventoryContext,
          sheetConfig
        })
      });

      const data = await res.json();
      const action = data.action || 'chat';

      // 1. Handle Deletions if requested
      const deleteIds: string[] = Array.isArray(data.listingIdsToDelete) ? data.listingIdsToDelete : [];
      let deletedItems: PropertyListing[] = [];
      if (deleteIds.length > 0) {
        deletedItems = inventory.filter(i => deleteIds.includes(i.id));
        onDeleteListings(deleteIds);
        setTotalDeletedThisSession(prev => prev + deleteIds.length);
        onNotify(`🗑️ ${deleteIds.length} listings deleted from inventory!`);
      }

      // 2. Handle Additions if extracted
      const extracted: PropertyListing[] = Array.isArray(data.listingsToAdd) ? data.listingsToAdd : [];
      if (extracted.length > 0) {
        onAddListings(extracted);
        setTotalAddedThisSession(prev => prev + extracted.length);
        onNotify(`🎉 ${extracted.length} properties added to live inventory!`);
      }

      // 3. Handle Updates if requested
      let updatedItem: PropertyListing | undefined;
      if (data.listingToUpdate && onUpdateListing) {
        const found = inventory.find(i => i.id === data.listingToUpdate.id);
        if (found) {
          updatedItem = {
            ...found,
            priceInLakhs: data.listingToUpdate.priceInLakhs !== undefined ? data.listingToUpdate.priceInLakhs : found.priceInLakhs,
            formattedPrice: data.listingToUpdate.formattedPrice || found.formattedPrice,
            notes: data.listingToUpdate.notes || found.notes
          };
          onUpdateListing(updatedItem);
          onNotify(`Updated listing Plot #${updatedItem.unitNumber}`);
        }
      }

      // 4. Handle Search Matches
      const matched: PropertyListing[] = Array.isArray(data.matchedListings) ? data.matchedListings : [];

      const botReply: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'assistant',
        text: data.reply || 'Action executed successfully.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action,
        modelUsed: data._modelUsed,
        addedListings: extracted.length > 0 ? extracted : undefined,
        deletedListings: deletedItems.length > 0 ? deletedItems : undefined,
        matchedListings: matched.length > 0 ? matched : undefined,
        updatedListing: updatedItem
      };

      setMessages(prev => [...prev, botReply]);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          sender: 'assistant',
          text: 'Maazrat, request process karne me takleef hui. Baraye meharbani dubara koshish karein ya prompt chhota karein.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      onNotify('Failed to process message with AI. Please retry.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoDelete = (deletedListings: PropertyListing[]) => {
    onAddListings(deletedListings);
    onNotify(`Restored ${deletedListings.length} deleted listings back to inventory!`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text: `Chat history cleared. Main aapke system ke tamam ${inventory.length} listings aur Google Drive ke sath tayyar hoon.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const handlePromptChipClick = (prompt: string) => {
    setInputText(prompt);
    textareaRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      
      {/* Modal Dialog Box styled like ChatGPT */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl h-[92vh] sm:h-[86vh] flex overflow-hidden shadow-2xl relative"
      >

        {/* Drag and Drop Full Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-amber-500/10 border-2 border-dashed border-amber-500/80 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6 animate-pulse">
            <Archive className="w-16 h-16 text-amber-400 mb-3" />
            <h3 className="text-xl font-bold text-white mb-1">Drop WhatsApp .zip or Chat File Here</h3>
            <p className="text-sm text-amber-200">AI will automatically analyze and phrase property listings</p>
          </div>
        )}

        {/* Left Sidebar (ChatGPT Style) */}
        <div className="w-64 bg-slate-950/90 border-r border-slate-800/80 p-4 flex flex-col justify-between hidden md:flex shrink-0">
          <div>
            {/* Header Brand */}
            <div className="flex items-center justify-between pb-4 mb-3 border-b border-slate-800/80">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white leading-tight">Umer AI Agent</h2>
                  <p className="text-[11px] text-amber-400 font-medium">Full Data &amp; Drive Access</p>
                </div>
              </div>
            </div>

            {/* New Chat Button */}
            <button
              onClick={clearChat}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700/60 transition cursor-pointer mb-4"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>New Conversation</span>
            </button>

            {/* Quick Suggestions / Sample Prompts */}
            <div className="space-y-1.5 hidden md:block">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Sample Commands
              </p>
              {[
                'Google Drive se Lahore Data folder ki files sync kardo',
                'Drive me konsi files hain dikhao',
                'Plot 340 DHA Phase 6 ki details batao',
                'Lake City me 5 marla k plots dikhao',
                'Bahria Town Sector C ke saray plots delete kardo',
                'Pichlay mahenay ka data delete kardo'
              ].map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePromptChipClick(p)}
                  className="w-full text-left p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 text-[11px] text-slate-300 hover:text-white border border-slate-800/80 hover:border-slate-700 transition truncate cursor-pointer"
                  title={p}
                >
                  &ldquo;{p}&rdquo;
                </button>
              ))}
            </div>
          </div>

          {/* Live System & Drive Data Stats */}
          <div className="pt-4 border-t border-slate-800/80 hidden md:block space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span>Live Inventory:</span>
              </span>
              <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                {inventory.length} listings
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span>Google Drive:</span>
              </span>
              {driveToken ? (
                <button
                  type="button"
                  onClick={handleOpenDrivePicker}
                  className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 hover:border-emerald-400 transition cursor-pointer flex items-center gap-1"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Lahore Data</span>
                </button>
              ) : onOpenDriveManager ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDriveManager();
                  }}
                  className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 hover:border-amber-400 transition cursor-pointer flex items-center gap-1"
                >
                  <HardDrive className="w-3 h-3" />
                  <span>Connect</span>
                </button>
              ) : (
                <span className="text-[11px] text-amber-400">Offline</span>
              )}
            </div>

            {(totalAddedThisSession > 0 || totalDeletedThisSession > 0) && (
              <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 space-y-1">
                {totalAddedThisSession > 0 && (
                  <p className="text-emerald-400 font-medium">+{totalAddedThisSession} added this session</p>
                )}
                {totalDeletedThisSession > 0 && (
                  <p className="text-rose-400 font-medium">-{totalDeletedThisSession} deleted this session</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Interface */}
        <div className="flex-1 flex flex-col h-full bg-slate-900 relative">
          
          {/* Top Bar with Online status and Close */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/70 backdrop-blur-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-white">Umer AI Agent</span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
                Drive Reading &bull; Area Phrasing &bull; Deduplication
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close Chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Chat Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${
                  msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                    msg.sender === 'user'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-800 border border-slate-700 text-amber-400'
                  }`}
                >
                  {msg.sender === 'user' ? 'U' : <Bot className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-amber-500/15 border border-amber-500/30 text-amber-50 rounded-tr-xs'
                      : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-xs'
                  }`}
                >
                  {/* Attached File Preview inside User Bubble */}
                  {msg.fileAttachment && (
                    <div className="mb-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center gap-2 text-xs text-slate-200">
                      {msg.fileAttachment.isDriveFile ? (
                        <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : msg.fileAttachment.name.endsWith('.zip') ? (
                        <Archive className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      <div className="truncate flex-1">
                        <p className="font-medium truncate flex items-center gap-1.5">
                          {msg.fileAttachment.isDriveFile && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1 rounded border border-amber-500/20">Google Drive</span>
                          )}
                          <span>{msg.fileAttachment.name}</span>
                        </p>
                        <p className="text-[10px] text-slate-400">{msg.fileAttachment.sizeFormatted}</p>
                      </div>
                      <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                        Read by AI
                      </span>
                    </div>
                  )}

                  {/* Message Text */}
                  <div className="whitespace-pre-wrap">{msg.text}</div>

                  {/* WIDGET 0: Google Drive Files List in Chat with "Open & Read with AI" buttons */}
                  {msg.driveFiles && msg.driveFiles.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                        <HardDrive className="w-4 h-4 text-amber-400" />
                        <span>Google Drive &ldquo;{LAHORE_DATA_FOLDER_NAME}&rdquo; Files ({msg.driveFiles.length})</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        {msg.driveFiles.map((df, dIdx) => {
                          const isZip = df.name.toLowerCase().endsWith('.zip');
                          const { society, block } = parseAreaFromFileName(df.name);
                          const timeInfo = formatDriveTime(df.modifiedTime || df.createdTime);

                          return (
                            <div
                              key={`${df.id}_${dIdx}`}
                              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition"
                            >
                              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                                {isZip ? (
                                  <Archive className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-white truncate">{df.name}</p>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 mt-0.5">
                                    <span className="text-amber-300 font-medium">{society}</span>
                                    <span className="text-slate-600">&bull;</span>
                                    <span>{block}</span>
                                    <span className="text-slate-600">&bull;</span>
                                    <span className="inline-flex items-center gap-1 text-amber-300/90 font-mono bg-white/[0.04] px-1.5 py-0.2 rounded" title={timeInfo.full}>
                                      <Clock className="w-2.5 h-2.5 text-amber-400" />
                                      <span>{timeInfo.formatted}</span>
                                      <span className="text-slate-500">({timeInfo.relative})</span>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDirectImportDriveFileFromChat(df)}
                                disabled={isProcessing}
                                className="self-end sm:self-center px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1 shrink-0"
                                title="AI will open, read, un-zip, phrase, and add listings"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>Read &amp; Add</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* WIDGET: Google Drive Sign-In Prompt inside Chat Bubble */}
                  {msg.showDriveLoginPrompt && (
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={handleOpenDrivePicker}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs shadow-md transition cursor-pointer"
                      >
                        <HardDrive className="w-4 h-4 text-amber-600" />
                        <span>Connect Google Drive</span>
                      </button>
                    </div>
                  )}

                  {/* WIDGET 1: Matched Listings for Search / Query */}
                  {msg.matchedListings && msg.matchedListings.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                        <Search className="w-4 h-4" />
                        <span>Found {msg.matchedListings.length} Matching Properties in System / Drive</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {msg.matchedListings.slice(0, 6).map((prop, idx) => (
                          <div key={`${prop.id || 'match'}_${idx}`} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white truncate">{prop.society}</span>
                              <span className="text-amber-400 font-mono font-bold">#{prop.unitNumber}</span>
                            </div>
                            <div className="text-slate-400 text-[11px] flex items-center justify-between">
                              <span>Block: {prop.block} &bull; {prop.sizeLabel}</span>
                              <span className="text-emerald-400 font-bold">{prop.formattedPrice}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between">
                              <span className="truncate max-w-[120px]">{prop.dealerName}</span>
                              <span className="font-mono">{prop.contactNumber}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* WIDGET 2: Deleted Listings with Undo Option */}
                  {msg.deletedListings && msg.deletedListings.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-rose-500/20 bg-rose-500/5 p-3 rounded-xl border border-rose-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                          <Trash2 className="w-4 h-4 text-rose-400" />
                          <span>{msg.deletedListings.length} Properties Deleted from System</span>
                        </div>
                        <button
                          onClick={() => handleUndoDelete(msg.deletedListings!)}
                          className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700 cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>Undo Delete</span>
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-300 max-h-36 overflow-y-auto space-y-1 divide-y divide-slate-800/60">
                        {msg.deletedListings.slice(0, 5).map((d, dIdx) => (
                          <div key={`${d.id || 'del'}_${dIdx}`} className="pt-1 flex items-center justify-between">
                            <span>{d.society} ({d.block}) - Plot #{d.unitNumber}</span>
                            <span className="text-rose-400">{d.formattedPrice}</span>
                          </div>
                        ))}
                        {msg.deletedListings.length > 5 && (
                          <p className="text-slate-500 text-[10px] text-center pt-1">
                            +{msg.deletedListings.length - 5} more items deleted
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* WIDGET 3: Added Listings Interactive Card */}
                  {msg.addedListings && msg.addedListings.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{msg.addedListings.length} Properties Added to Live Inventory</span>
                        </div>
                      </div>

                      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/90 text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-slate-800/60 text-slate-400 sticky top-0 text-[11px]">
                            <tr>
                              <th className="px-2.5 py-1.5">Society / Loc</th>
                              <th className="px-2.5 py-1.5">Plot #</th>
                              <th className="px-2.5 py-1.5">Size</th>
                              <th className="px-2.5 py-1.5">Price</th>
                              <th className="px-2.5 py-1.5">Dealer</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-300">
                            {msg.addedListings.slice(0, 8).map((prop, pIdx) => (
                              <tr key={`${prop.id || 'add'}_${pIdx}`} className="hover:bg-slate-800/40">
                                <td className="px-2.5 py-1.5 font-medium text-white truncate max-w-[120px]">
                                  {prop.society} {prop.block !== '-' ? `(${prop.block})` : ''}
                                </td>
                                <td className="px-2.5 py-1.5 text-amber-300 font-mono">
                                  {prop.unitNumber}
                                </td>
                                <td className="px-2.5 py-1.5 text-slate-300">
                                  {prop.sizeLabel}
                                </td>
                                <td className="px-2.5 py-1.5 text-emerald-400 font-semibold whitespace-nowrap">
                                  {prop.formattedPrice}
                                </td>
                                <td className="px-2.5 py-1.5 text-slate-400 truncate max-w-[100px]">
                                  {prop.dealerName}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Timestamp */}
                  <div
                    className={`text-[10px] mt-1.5 ${
                      msg.sender === 'user' ? 'text-amber-200/60 text-right' : 'text-slate-500'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing / Processing Indicator */}
            {isProcessing && (
              <div className="flex gap-3 max-w-xl mr-auto items-center">
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-amber-400">
                  <Bot className="w-4 h-4 animate-spin" />
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl rounded-tl-xs px-4 py-3 text-sm text-slate-300 flex items-center gap-2">
                  <div className="flex space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span className="text-xs text-slate-400">
                    {selectedDriveFile ? `Opening & unzipping '${selectedDriveFile.name}' from Google Drive...` : selectedFile ? 'Analyzing file & syncing with system data...' : 'Searching system & drive data / executing command...'}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input Bar (ChatGPT Style) */}
          <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/70 backdrop-blur-xs relative">
            
            {/* Drive File Picker Popover */}
            {isDrivePickerOpen && (
              <div className="mb-3 p-3 bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl max-h-56 overflow-y-auto space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <HardDrive className="w-4 h-4 text-amber-400" />
                    <span>Select from Google Drive &ldquo;{LAHORE_DATA_FOLDER_NAME}&rdquo;</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDrivePickerOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {isLoadingDriveFiles ? (
                  <div className="py-6 text-center text-xs text-slate-400 space-y-1">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto text-amber-400" />
                    <p>Loading files from Google Drive...</p>
                  </div>
                ) : driveFolderFiles.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    No files found in &ldquo;{LAHORE_DATA_FOLDER_NAME}&rdquo; folder.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {driveFolderFiles.map((df) => {
                      const timeInfo = formatDriveTime(df.modifiedTime || df.createdTime);
                      return (
                        <div
                          key={df.id}
                          onClick={() => {
                            setSelectedDriveFile(df);
                            setSelectedFile(null);
                            setIsDrivePickerOpen(false);
                          }}
                          className="p-2.5 rounded-xl hover:bg-slate-800/80 cursor-pointer flex items-center justify-between gap-2 text-xs text-slate-200 transition border border-transparent hover:border-slate-700"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {df.name.endsWith('.zip') ? (
                              <Archive className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{df.name}</p>
                              <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                                <Clock className="w-2.5 h-2.5 text-amber-400" />
                                <span>{timeInfo.formatted}</span>
                                <span className="text-slate-500">({timeInfo.relative})</span>
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-full shrink-0 border border-amber-500/20">
                            Attach
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Selected File Chip Previews */}
            {selectedDriveFile && (
              <div className="mb-2 p-2 bg-slate-800/90 border border-amber-500/50 rounded-xl flex items-center justify-between text-xs text-white max-w-md animate-fadeIn">
                <div className="flex items-center gap-2 truncate">
                  <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded font-bold">Google Drive</span>
                  <span className="truncate font-medium">{selectedDriveFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDriveFile(null)}
                  className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                  title="Remove Drive file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {selectedFile && (
              <div className="mb-2 p-2 bg-slate-800/90 border border-slate-700 rounded-xl flex items-center justify-between text-xs text-white max-w-md animate-fadeIn">
                <div className="flex items-center gap-2 truncate">
                  {selectedFile.name.endsWith('.zip') ? (
                    <Archive className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate font-medium">{selectedFile.name}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    ({formatFileSize(selectedFile.size)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Input Box */}
            <form onSubmit={handleSendMessage} className="relative flex items-end bg-slate-900 border border-slate-700/80 rounded-2xl p-1.5 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 transition shadow-inner">
              
              {/* Local File Upload Hidden Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.xlsx,.xls,.json,.pdf,.docx,.zip,application/zip,application/x-zip-compressed,image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Local File Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer shrink-0"
                title="Attach local file (WhatsApp .zip, Excel, etc.)"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Google Drive Direct Attachment Button */}
              <button
                type="button"
                onClick={handleOpenDrivePicker}
                className="p-2.5 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer shrink-0"
                title="Select file directly from Google Drive 'Lahore Data' folder"
              >
                <HardDrive className="w-5 h-5 text-amber-400" />
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedDriveFile ? `Press Send to read & phrase "${selectedDriveFile.name}" with AI...` : selectedFile ? "Add instruction (optional) or press Send..." : "Poocho, delete karwao, ya Google Drive files read karne ka kahein..."}
                className="flex-1 bg-transparent border-0 text-white placeholder-slate-500 text-sm focus:ring-0 focus:outline-none resize-none py-2.5 px-2 max-h-36 min-h-[40px]"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={(!inputText.trim() && !selectedFile && !selectedDriveFile) || isProcessing}
                className={`p-2 rounded-xl transition duration-200 cursor-pointer shrink-0 flex items-center justify-center ${
                  (inputText.trim() || selectedFile || selectedDriveFile) && !isProcessing
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                }`}
                title="Send message / Execute action"
              >
                <ArrowUp className="w-5 h-5 stroke-[2.5]" />
              </button>
            </form>

            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span>Google Drive &bull; Area Phrasing &bull; Auto-Deduplication</span>
              <span className="hidden sm:inline">Shift + Enter for new line</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
