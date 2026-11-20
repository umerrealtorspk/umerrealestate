import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  ExternalLink, 
  Send, 
  ShieldCheck, 
  Sparkles, 
  MessageSquare, 
  Bot, 
  Check, 
  Layers, 
  Clock, 
  Phone, 
  Filter, 
  SlidersHorizontal,
  Flame,
  Info,
  Code,
  FileSpreadsheet,
  Terminal,
  ArrowRight,
  QrCode,
  Wifi,
  Zap,
  FileDown,
  Download,
  Users
} from 'lucide-react';
import { PropertyListing } from '../types/inventory';

interface WhatsAppMessageLog {
  id: string;
  timestamp: string;
  senderNumber: string;
  senderName: string;
  rawText: string;
  status: 'added' | 'duplicate_skipped' | 'no_contact_discarded' | 'no_properties_found' | 'error';
  extractedCount: number;
  addedListings: any[];
  skippedDuplicatesCount: number;
  rejectedNoContactCount: number;
  error?: string;
}

interface WhatsAppAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (msg: string) => void;
  onRefreshInventory: () => void;
}

export const WhatsAppAutomationModal: React.FC<WhatsAppAutomationModalProps> = ({
  isOpen,
  onClose,
  onNotify,
  onRefreshInventory,
}) => {
  const [activeTab, setActiveTab] = useState<'direct' | 'group_export' | 'greenapi' | 'webhook' | 'logs' | 'simulator' | 'settings'>('direct');
  const [webhookSubMethod, setWebhookSubMethod] = useState<'script' | 'direct'>('script');
  const [isSyncingSheetInbox, setIsSyncingSheetInbox] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Group Export & Phraser State
  const [exportGroups, setExportGroups] = useState<Array<{
    id: string;
    name: string;
    count: number;
    firstMessageAt: string | null;
    lastMessageAt: string | null;
  }>>([]);
  const [selectedExportGroupId, setSelectedExportGroupId] = useState<string>('all');
  const [totalStoredGroupMessages, setTotalStoredGroupMessages] = useState<number>(0);
  const [isLoadingExportSummary, setIsLoadingExportSummary] = useState<boolean>(false);
  const [isPhrasingExport, setIsPhrasingExport] = useState<boolean>(false);
  const [customExportInput, setCustomExportInput] = useState<string>('');
  const [exportPhrasingResult, setExportPhrasingResult] = useState<any | null>(null);

  // Direct Built-in WhatsApp Web (Baileys) State
  const [directState, setDirectState] = useState<{
    status: 'disconnected' | 'connecting' | 'qr_ready' | 'pairing_code_ready' | 'connected' | 'error';
    qrDataUrl: string | null;
    pairingCode: string | null;
    pairingPhone: string | null;
    connectedPhone: string | null;
    connectedName: string | null;
    lastError: string | null;
    listenMode: 'groups_only' | 'all_chats';
    selectedGroupIds: string[];
    groups: { id: string; subject: string; participantsCount: number }[];
    messagesReceivedCount: number;
    hasSavedSession: boolean;
  }>({
    status: 'disconnected',
    qrDataUrl: null,
    pairingCode: null,
    pairingPhone: null,
    connectedPhone: null,
    connectedName: null,
    lastError: null,
    listenMode: 'groups_only',
    selectedGroupIds: [],
    groups: [],
    messagesReceivedCount: 0,
    hasSavedSession: false,
  });
  const [isConnectingDirect, setIsConnectingDirect] = useState(false);
  const [directLoginMethod, setDirectLoginMethod] = useState<'qr' | 'phone'>('qr');
  const [pairingPhoneInput, setPairingPhoneInput] = useState('');
  const [isRequestingPairingCode, setIsRequestingPairingCode] = useState(false);
  const [isRefreshingGroups, setIsRefreshingGroups] = useState(false);
  const prevDirectRef = useRef<{ status: string; messagesReceivedCount: number }>({
    status: 'disconnected',
    messagesReceivedCount: 0,
  });

  // Hourly .txt Buffer State
  const [bufferState, setBufferState] = useState<{
    mode: 'hourly_txt' | 'instant';
    messageCount: number;
    byteSize: number;
    previewText: string;
    nextBatchRunAt: number;
    lastBatchRunAt: number | null;
    lastBatchResult: any | null;
    isProcessing: boolean;
  }>({
    mode: 'hourly_txt',
    messageCount: 0,
    byteSize: 0,
    previewText: '',
    nextBatchRunAt: Date.now() + 3600000,
    lastBatchRunAt: null,
    lastBatchResult: null,
    isProcessing: false,
  });
  const [isTriggeringBuffer, setIsTriggeringBuffer] = useState(false);

  // Green-API State
  const [greenApiIdInstance, setGreenApiIdInstance] = useState('umer_realtors_webhook_2026');
  const [greenApiTokenInstance, setGreenApiTokenInstance] = useState('umer_realtors_webhook_2026');
  const [greenApiState, setGreenApiState] = useState<'idle' | 'authorized' | 'notAuthorized' | 'blocked' | 'error' | 'loading'>('idle');
  const [greenApiQr, setGreenApiQr] = useState<string | null>(null);
  const [isCheckingGreenApi, setIsCheckingGreenApi] = useState(false);
  const [isSyncingGreenApi, setIsSyncingGreenApi] = useState(false);
  const [greenApiSyncSummary, setGreenApiSyncSummary] = useState<any | null>(null);

  // Status & Logs State
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalProcessed: 0,
    totalAdded: 0,
    totalSkippedDuplicates: 0,
    totalRejectedNoContact: 0,
  });
  const [config, setConfig] = useState({
    webhookVerifyToken: 'umer_realtors_webhook_2026',
    autoSyncToSheets: true,
    autoSyncToFirestore: true,
    phoneNumberId: '',
    enabled: true,
    greenApiIdInstance: 'umer_realtors_webhook_2026',
    greenApiTokenInstance: 'umer_realtors_webhook_2026',
  });
  const [logs, setLogs] = useState<WhatsAppMessageLog[]>([]);

  // Simulator State
  const [simMessage, setSimMessage] = useState(
    'Salam bhai! DHA Phase 6 Block C Plot 318 1 Kanal Demand 4.35 Crore Direct Deal. Contact Ch. Kamran 03008455667'
  );
  const [simSenderPhone, setSimSenderPhone] = useState('03008455667');
  const [simSenderName, setSimSenderName] = useState('Ch. Kamran (Signature Estate)');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  // Determine current origin for Webhook URL
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://your-crm-domain.com';
  const webhookUrl = `${currentOrigin}/api/whatsapp/webhook`;
  const greenApiWebhookUrl = `${currentOrigin}/api/green-api/webhook`;

  const fetchStatusAndLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
          if (data.config.greenApiIdInstance) setGreenApiIdInstance(data.config.greenApiIdInstance);
          if (data.config.greenApiTokenInstance) setGreenApiTokenInstance(data.config.greenApiTokenInstance);
        }
        if (data.stats) setStats(data.stats);
        if (Array.isArray(data.recentLogs)) setLogs(data.recentLogs);
      }
    } catch (err) {
      console.warn('Could not fetch WhatsApp status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGreenApiCreds = async () => {
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          greenApiIdInstance,
          greenApiTokenInstance,
        }),
      });
      if (res.ok) {
        onNotify('Green-API credentials saved successfully!');
        handleCheckGreenApiStatus();
      }
    } catch (err: any) {
      onNotify('Failed to save Green-API settings: ' + err.message);
    }
  };

  const handleCheckGreenApiStatus = async () => {
    if (!greenApiIdInstance.trim() || !greenApiTokenInstance.trim()) {
      onNotify('Green-API Instance ID aur Token enter karein.');
      return;
    }
    setIsCheckingGreenApi(true);
    try {
      const res = await fetch(
        `/api/green-api/status?idInstance=${encodeURIComponent(greenApiIdInstance.trim())}&apiToken=${encodeURIComponent(greenApiTokenInstance.trim())}`
      );
      const data = await res.json();
      if (data.stateInstance) {
        setGreenApiState(data.stateInstance);
        if (data.stateInstance === 'authorized') {
          onNotify('🎉 WhatsApp Connected & Authorized! Ready to receive dealer listings.');
          setGreenApiQr(null);
        } else if (data.stateInstance === 'notAuthorized') {
          onNotify('Instance created but QR Code not scanned yet. Fetching QR code...');
          handleFetchQrCode();
        } else {
          onNotify(`Green-API Status: ${data.stateInstance}${data.error ? ' (' + data.error + ')' : ''}`);
        }
      }
    } catch (err: any) {
      setGreenApiState('error');
      onNotify('Status check failed: ' + err.message);
    } finally {
      setIsCheckingGreenApi(false);
    }
  };

  const handleFetchQrCode = async () => {
    if (!greenApiIdInstance.trim() || !greenApiTokenInstance.trim()) return;
    try {
      const res = await fetch(
        `/api/green-api/qr?idInstance=${encodeURIComponent(greenApiIdInstance.trim())}&apiToken=${encodeURIComponent(greenApiTokenInstance.trim())}`
      );
      const data = await res.json();
      if (data.message && data.type === 'qrCode') {
        const qrSrc = data.message.startsWith('data:') ? data.message : `data:image/png;base64,${data.message}`;
        setGreenApiQr(qrSrc);
      }
    } catch (err) {
      console.warn('QR fetch error:', err);
    }
  };

  const handleSyncGreenApi = async () => {
    if (!greenApiIdInstance.trim() || !greenApiTokenInstance.trim()) {
      onNotify('Green-API credentials required.');
      return;
    }
    setIsSyncingGreenApi(true);
    setGreenApiSyncSummary(null);
    try {
      const res = await fetch('/api/green-api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idInstance: greenApiIdInstance.trim(),
          apiToken: greenApiTokenInstance.trim(),
        }),
      });
      const data = await res.json();
      setGreenApiSyncSummary(data);

      if (data.success) {
        if (data.totalFetched > 0) {
          onNotify(`⚡ Success! Fetched ${data.totalFetched} messages. Added ${data.addedCount} new listings to Inventory!`);
          onRefreshInventory();
          fetchStatusAndLogs();
        } else {
          onNotify('Green-API queue is clear. No new pending WhatsApp messages found.');
        }
      } else {
        onNotify(`Green-API Sync: ${data.error || 'Failed to sync'}`);
      }
    } catch (err: any) {
      onNotify(`Sync error: ${err.message}`);
    } finally {
      setIsSyncingGreenApi(false);
    }
  };

  const fetchDirectStatus = async (silent = true) => {
    try {
      const res = await fetch('/api/whatsapp/direct/status');
      if (res.ok) {
        const data = await res.json();
        const nextStatus = data.status || 'disconnected';
        const nextCount = data.messagesReceivedCount || 0;
        const prev = prevDirectRef.current;

        const hasNewMessages = prev.messagesReceivedCount > 0 && nextCount > prev.messagesReceivedCount;
        const justConnected = prev.status !== 'connected' && nextStatus === 'connected';

        prevDirectRef.current = {
          status: nextStatus,
          messagesReceivedCount: nextCount,
        };

        setDirectState({
          status: nextStatus,
          qrDataUrl: data.qrDataUrl || null,
          pairingCode: data.pairingCode || null,
          pairingPhone: data.pairingPhone || null,
          connectedPhone: data.connectedPhone || null,
          connectedName: data.connectedName || null,
          lastError: data.lastError || null,
          listenMode: data.listenMode || 'groups_only',
          selectedGroupIds: Array.isArray(data.selectedGroupIds) ? data.selectedGroupIds : [],
          groups: Array.isArray(data.groups) ? data.groups : [],
          messagesReceivedCount: nextCount,
          hasSavedSession: Boolean(data.hasSavedSession),
        });

        if (hasNewMessages) {
          fetchStatusAndLogs();
          onRefreshInventory();
        }
        if (justConnected) {
          onNotify('🎉 WhatsApp Connected! Ab aapke groups ki tamam deals khud-ba-khud CRM aur Google Sheet mein save hongi.');
        }
      }
    } catch (err) {
      if (!silent) console.warn('Direct status error:', err);
    }
  };

  const handleConnectDirectWhatsApp = async (forceFresh = false) => {
    setIsConnectingDirect(true);
    try {
      const res = await fetch('/api/whatsapp/direct/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceFresh }),
      });
      const data = await res.json();
      setDirectState((prev) => ({
        ...prev,
        status: data.status || 'connecting',
        qrDataUrl: data.qrDataUrl || null,
        pairingCode: data.pairingCode || null,
        pairingPhone: data.pairingPhone || null,
        connectedPhone: data.connectedPhone || null,
        connectedName: data.connectedName || null,
        lastError: data.lastError || null,
        hasSavedSession: Boolean(data.hasSavedSession),
      }));
      onNotify(
        forceFresh
          ? 'Fresh QR Code tayyar ho raha hai...'
          : data.hasSavedSession
          ? 'Saved session reconnect ho raha hai... (QR scan ki zarurat nahi)'
          : 'WhatsApp connect ho raha hai...'
      );
    } catch (err: any) {
      onNotify('Connection error: ' + err.message);
    } finally {
      setIsConnectingDirect(false);
    }
  };

  const handleRequestPairingCode = async () => {
    if (!pairingPhoneInput.trim()) {
      onNotify('Apna WhatsApp phone number likhein (maslan 03001234567).');
      return;
    }
    setIsRequestingPairingCode(true);
    try {
      const res = await fetch('/api/whatsapp/direct/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: pairingPhoneInput.trim() }),
      });
      const data = await res.json();
      setDirectState((prev) => ({
        ...prev,
        status: data.status || prev.status,
        qrDataUrl: data.qrDataUrl || null,
        pairingCode: data.pairingCode || null,
        pairingPhone: data.pairingPhone || null,
        connectedPhone: data.connectedPhone || null,
        connectedName: data.connectedName || null,
        lastError: data.lastError || data.error || null,
        hasSavedSession: Boolean(data.hasSavedSession),
      }));
      if (data.pairingCode) {
        onNotify(`🔑 8-Digit Pairing PIN tayyar hai: ${data.pairingCode}`);
      } else if (data.lastError || data.error) {
        onNotify(data.lastError || data.error);
      } else {
        onNotify('Pairing PIN ban raha hai, intezar karein...');
      }
    } catch (err: any) {
      onNotify('Pairing code error: ' + err.message);
    } finally {
      setIsRequestingPairingCode(false);
    }
  };

  const handleDisconnectDirectWhatsApp = async () => {
    try {
      const res = await fetch('/api/whatsapp/direct/disconnect', { method: 'POST' });
      if (res.ok) {
        setDirectState((prev) => ({
          ...prev,
          status: 'disconnected',
          qrDataUrl: null,
          pairingCode: null,
          pairingPhone: null,
          connectedPhone: null,
          connectedName: null,
          groups: [],
        }));
        onNotify('WhatsApp disconnected.');
      }
    } catch (err: any) {
      onNotify('Disconnect error: ' + err.message);
    }
  };

  const handleRefreshDirectGroups = async () => {
    setIsRefreshingGroups(true);
    try {
      const res = await fetch('/api/whatsapp/direct/groups');
      const data = await res.json();
      if (data.success && Array.isArray(data.groups)) {
        setDirectState((prev) => ({ ...prev, groups: data.groups }));
        onNotify(`${data.groups.length} WhatsApp Groups load ho gaye!`);
      }
    } catch (err: any) {
      onNotify('Groups load nahi ho sakay: ' + err.message);
    } finally {
      setIsRefreshingGroups(false);
    }
  };

  const handleUpdateDirectSettings = async (updates: {
    listenMode?: 'groups_only' | 'all_chats';
    selectedGroupIds?: string[];
  }) => {
    try {
      const res = await fetch('/api/whatsapp/direct/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setDirectState((prev) => ({
          ...prev,
          listenMode: data.listenMode,
          selectedGroupIds: data.selectedGroupIds || [],
        }));
        onNotify('WhatsApp Group filter settings save ho gayin!');
      }
    } catch (err: any) {
      onNotify('Settings save error: ' + err.message);
    }
  };

  const fetchBufferStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/buffer');
      if (res.ok) {
        const data = await res.json();
        setBufferState({
          mode: data.mode === 'instant' ? 'instant' : 'hourly_txt',
          messageCount: data.messageCount || 0,
          byteSize: data.byteSize || 0,
          previewText: data.previewText || '',
          nextBatchRunAt: data.nextBatchRunAt || Date.now() + 3600000,
          lastBatchRunAt: data.lastBatchRunAt || null,
          lastBatchResult: data.lastBatchResult || null,
          isProcessing: Boolean(data.isProcessing),
        });
      }
    } catch {}
  };

  const handleProcessBufferNow = async () => {
    setIsTriggeringBuffer(true);
    try {
      const res = await fetch('/api/whatsapp/buffer/process', { method: 'POST' });
      const data = await res.json();
      if (data.buffer) {
        setBufferState((prev) => ({ ...prev, ...data.buffer }));
      }
      if (data.empty) {
        onNotify('Abhi .txt file mein koi naya message nahi hai.');
      } else if (data.success) {
        onNotify(
          `⚡ Gemini AI ne ${data.messageCount} messages parse kiye! +${data.addedCount} new plots Inventory & Google Sheet mein add ho gaye (${data.skippedDuplicatesCount} duplicates, ${data.rejectedNoContactCount} no-contact dropped).`
        );
        fetchStatusAndLogs();
        onRefreshInventory();
      } else {
        onNotify('Buffer process error: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      onNotify('Error: ' + err.message);
    } finally {
      setIsTriggeringBuffer(false);
    }
  };

  const handleToggleBatchMode = async (mode: 'hourly_txt' | 'instant') => {
    try {
      const res = await fetch('/api/whatsapp/buffer/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        setBufferState((prev) => ({ ...prev, mode }));
        onNotify(
          mode === 'hourly_txt'
            ? '⏰ Hourly .txt Batch Mode ON: Har 1 ghantay baad .txt file khud Gemini ke paas jayegi!'
            : '⚡ Instant Mode ON: Har message foran Gemini ke paas jayega!'
        );
      }
    } catch {}
  };

  // Group Export Handlers
  const fetchGroupExportSummary = async () => {
    setIsLoadingExportSummary(true);
    try {
      const res = await fetch('/api/whatsapp/groups/export/summary');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.groups)) {
          const mapped = data.groups.map((g: any) => ({
            id: g.groupId || g.id,
            name: g.groupName || g.name || 'Unnamed Group',
            count: Number(g.messageCount || g.count || 0),
            firstMessageAt: g.firstMessageTime || null,
            lastMessageAt: g.latestMessageTime || g.lastMessageAt || null,
          }));
          setExportGroups(mapped);
          setTotalStoredGroupMessages(Number(data.totalMessages || 0));
        }
      }
    } catch {} finally {
      setIsLoadingExportSummary(false);
    }
  };

  const handleCopyGroupExport = async (groupId?: string) => {
    try {
      const targetId = groupId === undefined ? selectedExportGroupId : groupId;
      const q = targetId && targetId !== 'all' ? `?groupId=${encodeURIComponent(targetId)}` : '';
      const res = await fetch(`/api/whatsapp/groups/export/preview${q}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.content) {
          copyToClipboard(data.content, 'export_text');
        } else {
          onNotify('Copy karne ke liye koi messages nahi mile.');
        }
      }
    } catch (err: any) {
      onNotify('Copy error: ' + err.message);
    }
  };

  const handleDownloadGroupExport = (groupId?: string) => {
    const targetId = groupId === undefined ? selectedExportGroupId : groupId;
    const q = targetId && targetId !== 'all' ? `?groupId=${encodeURIComponent(targetId)}` : '';
    const downloadUrl = `/api/whatsapp/groups/export/download${q}`;
    
    // Create temporary anchor to trigger browser download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify(`📥 .txt file download shuru ho gayi! (${targetId === 'all' ? 'All Groups' : 'Selected Group'})`);
  };

  const handlePhraseGroupExport = async (groupId?: string) => {
    const targetId = groupId === undefined ? selectedExportGroupId : groupId;
    setIsPhrasingExport(true);
    setExportPhrasingResult(null);
    try {
      const res = await fetch('/api/whatsapp/groups/export/phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: targetId === 'all' ? undefined : targetId,
          customText: customExportInput.trim() ? customExportInput.trim() : undefined,
        }),
      });
      const data = await res.json();
      setExportPhrasingResult(data);
      if (data.success) {
        const msg = `⚡ Gemini AI ne ${data.messageCount || 0} messages parse kiye! +${data.addedCount || 0} naye plots Inventory me aur +${data.addedRequirementsCount || 0} requirements Dealer Requirements me add ho gaye!`;
        onNotify(msg);
        onRefreshInventory();
        fetchStatusAndLogs();
        fetchGroupExportSummary();
      } else {
        onNotify('Gemini Phrasing: ' + (data.error || 'Koi plot ya requirement detect nahi hui'));
      }
    } catch (err: any) {
      onNotify('Phrasing Error: ' + err.message);
    } finally {
      setIsPhrasingExport(false);
    }
  };

  const handleClearGroupExport = async (groupId?: string) => {
    const targetId = groupId === undefined ? selectedExportGroupId : groupId;
    const isAll = !targetId || targetId === 'all';
    if (!window.confirm(isAll ? 'Kya aap tamam saved group messages clear karna chahte hain?' : 'Kya aap is group ke messages clear karna chahte hain?')) {
      return;
    }
    try {
      const res = await fetch('/api/whatsapp/groups/export/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: isAll ? undefined : targetId }),
      });
      const data = await res.json();
      if (data.success) {
        onNotify(`🗑️ Messages clear ho gaye! (${data.remainingCount} remaining)`);
        fetchGroupExportSummary();
      }
    } catch (err: any) {
      onNotify('Clear error: ' + err.message);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatusAndLogs();
      fetchDirectStatus(true);
      fetchBufferStatus();
      fetchGroupExportSummary();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'group_export') {
      fetchGroupExportSummary();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'direct') return;
    const isLinking =
      directState.status === 'connecting' ||
      directState.status === 'qr_ready' ||
      directState.status === 'pairing_code_ready';
    const pollDelay = isLinking ? 5000 : 20000;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchDirectStatus(true);
      if (!isLinking) {
        fetchBufferStatus();
      }
    }, pollDelay);
    return () => clearInterval(interval);
  }, [isOpen, activeTab, directState.status]);

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    onNotify('Copied to clipboard!');
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleSimulateMessage = async () => {
    if (!simMessage.trim()) {
      onNotify('Please enter a sample WhatsApp message.');
      return;
    }

    setIsSimulating(true);
    setSimResult(null);

    try {
      const res = await fetch('/api/whatsapp/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: simMessage,
          from: simSenderPhone,
          senderName: simSenderName,
        }),
      });

      const data = await res.json();
      setSimResult(data);

      if (data.addedCount > 0 && data.addedRequirementsCount > 0) {
        onNotify(`🎉 Automated! ${data.addedCount} plot(s) added to inventory & ${data.addedRequirementsCount} demand(s) added to Dealer Requirements!`);
        onRefreshInventory();
      } else if (data.addedCount > 0) {
        onNotify(`🎉 Successfully automated! ${data.addedCount} plot(s) added to inventory!`);
        onRefreshInventory();
      } else if (data.addedRequirementsCount > 0) {
        onNotify(`📋 Dealer Requirement detected! +${data.addedRequirementsCount} demand(s) saved to Dealer Requirements section!`);
      } else if (data.skippedDuplicatesCount > 0) {
        onNotify(`⏭️ Duplicate listing detected and safely skipped.`);
      } else if (data.rejectedNoContactCount > 0) {
        onNotify(`🚫 Discarded: Listing has no contact number.`);
      } else {
        onNotify('Message processed. No property listings or demands detected in text.');
      }

      // Refresh logs
      fetchStatusAndLogs();
    } catch (err: any) {
      onNotify(`Simulator Error: ${err.message || 'Failed to simulate'}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSyncSheetInbox = async () => {
    setIsSyncingSheetInbox(true);
    try {
      const res = await fetch('/api/whatsapp/sync-sheet-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        if (data.processed > 0) {
          onNotify(`🎉 Synced ${data.processed} messages! ${data.addedCount} new plot(s) added to inventory.`);
          onRefreshInventory();
          fetchStatusAndLogs();
        } else {
          onNotify('WhatsApp_Inbox is already up to date. No new messages found.');
        }
      } else {
        onNotify(`Sheet Sync: ${data.error || 'Failed to sync'}`);
      }
    } catch (err: any) {
      onNotify(`Sheet Sync Error: ${err.message || 'Network error'}`);
    } finally {
      setIsSyncingSheetInbox(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        onNotify('WhatsApp Automation settings saved!');
      }
    } catch (err) {
      onNotify('Failed to save settings');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#0d121f] border border-white/[0.1] shadow-2xl overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-gradient-to-r from-emerald-950/40 via-slate-900/40 to-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <MessageSquare className="w-5 h-5 fill-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                  WhatsApp Meta Cloud API Automation
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Webhook
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Dealer broadcast message aye to AI automatically phrase kar ke inventory me add kare
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatusAndLogs}
              disabled={isLoading}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Refresh logs & status"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Counters Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-900/60 border-b border-white/[0.06] text-xs">
          <div className="p-2.5 rounded-2xl bg-slate-900 border border-white/[0.06]">
            <p className="text-slate-400 text-[11px]">Messages Processed</p>
            <p className="text-lg font-extrabold text-white mt-0.5">{stats.totalProcessed}</p>
          </div>
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-emerald-300 text-[11px] font-medium">Auto-Added to CRM</p>
            <p className="text-lg font-extrabold text-emerald-400 mt-0.5">+{stats.totalAdded}</p>
          </div>
          <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-amber-300 text-[11px] font-medium">Duplicates Skipped</p>
            <p className="text-lg font-extrabold text-amber-400 mt-0.5">{stats.totalSkippedDuplicates}</p>
          </div>
          <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <p className="text-rose-300 text-[11px] font-medium">No Contact Discarded</p>
            <p className="text-lg font-extrabold text-rose-400 mt-0.5">{stats.totalRejectedNoContact}</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/[0.08] px-4 bg-slate-900/30 shrink-0 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('direct')}
            className={`py-3 px-4 border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'direct'
                ? 'border-emerald-400 text-emerald-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>1. Direct WhatsApp (QR Scan)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300 font-bold">100% Free</span>
          </button>

          <button
            onClick={() => setActiveTab('group_export')}
            className={`py-3 px-4 border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'group_export'
                ? 'border-indigo-400 text-indigo-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileDown className="w-4 h-4 text-indigo-400" />
            <span>2. Group Export & AI Phraser</span>
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-indigo-500/20 text-indigo-300 font-bold">
              {totalStoredGroupMessages > 0 ? `${totalStoredGroupMessages} msgs` : 'New'}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-4 border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-cyan-400 text-cyan-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>3. Incoming Logs ({logs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`py-3 px-4 border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'simulator'
                ? 'border-amber-400 text-amber-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>3. Test Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab('greenapi')}
            className={`py-3 px-4 border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'greenapi'
                ? 'border-slate-300 text-slate-200 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Green-API</span>
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`py-3 px-4 border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'webhook'
                ? 'border-slate-300 text-slate-200 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Meta Webhook</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-4 border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'settings'
                ? 'border-purple-400 text-purple-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-slate-200">

          {/* TAB 1: DIRECT BUILT-IN WHATSAPP WEB QR & GROUP AUTO-LISTENER */}
          {activeTab === 'direct' && (
            <div className="space-y-5">
              {/* Top Info Banner */}
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-white/[0.08] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Direct WhatsApp Automation</h3>
                    <p className="text-[11px] text-slate-400">
                      WhatsApp Groups se deals automatically read ho kar CRM aur Google Sheet mein add hoti hain.
                    </p>
                  </div>
                </div>

                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 border ${
                  directState.status === 'connected'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : directState.status === 'qr_ready' || directState.status === 'pairing_code_ready'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : directState.status === 'connecting'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                    : 'bg-slate-800 text-slate-400 border-white/5'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    directState.status === 'connected'
                      ? 'bg-emerald-400 animate-ping'
                      : directState.status === 'qr_ready' || directState.status === 'pairing_code_ready' || directState.status === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-slate-500'
                  }`} />
                  {directState.status === 'connected'
                    ? 'Connected'
                    : directState.status === 'pairing_code_ready'
                    ? 'Enter PIN'
                    : directState.status === 'qr_ready'
                    ? 'Scan QR'
                    : directState.status === 'connecting'
                    ? 'Connecting'
                    : 'Disconnected'}
                </span>
              </div>

              {/* Connection Card */}
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/[0.08] flex flex-col items-center text-center space-y-4">
                {directState.status === 'connected' ? (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Wifi className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">
                        🟢 Connected: {directState.connectedName || 'WhatsApp'}
                      </h3>
                      <p className="text-xs text-emerald-300 font-mono mt-0.5">
                        +{directState.connectedPhone} • {directState.messagesReceivedCount} Messages Captured
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        onClick={handleRefreshDirectGroups}
                        disabled={isRefreshingGroups}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-white/10 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingGroups ? 'animate-spin' : ''}`} />
                        <span>Refresh Groups ({directState.groups.length})</span>
                      </button>
                      <button
                        onClick={handleDisconnectDirectWhatsApp}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold border border-rose-500/30 transition cursor-pointer"
                      >
                        Disconnect
                      </button>
                    </div>
                  </>
                ) : directState.status === 'connecting' ? (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white">Connecting WhatsApp...</h3>
                      <p className="text-xs text-slate-400">Connecting session, please wait...</p>
                    </div>
                  </>
                ) : directState.status === 'pairing_code_ready' && directState.pairingCode ? (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Phone className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-white">
                        WhatsApp Link Code (+{directState.pairingPhone})
                      </h3>
                      <p className="text-xs text-slate-400">
                        WhatsApp &gt; Linked Devices &gt; Link a Device &gt; <strong className="text-slate-200">Link with phone number instead</strong>
                      </p>
                    </div>

                    <div className="px-6 py-4 rounded-2xl bg-slate-950 border border-amber-500/40 shadow-lg flex items-center gap-3">
                      <span className="text-2xl sm:text-3xl font-black tracking-[0.22em] font-mono text-amber-300 select-all">
                        {directState.pairingCode.length === 8
                          ? `${directState.pairingCode.slice(0, 4)}-${directState.pairingCode.slice(4)}`
                          : directState.pairingCode}
                      </span>
                      <button
                        onClick={() => copyToClipboard(directState.pairingCode || '', 'pairing_code')}
                        className="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 transition cursor-pointer"
                        title="Copy Code"
                      >
                        {copiedField === 'pairing_code' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        onClick={handleRequestPairingCode}
                        disabled={isRequestingPairingCode}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRequestingPairingCode ? 'animate-spin' : ''}`} />
                        <span>New PIN Code</span>
                      </button>
                      <button
                        onClick={() => {
                          setDirectLoginMethod('qr');
                          handleConnectDirectWhatsApp(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs flex items-center gap-1.5 cursor-pointer border border-emerald-500/20"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Use QR Code Instead</span>
                      </button>
                    </div>
                  </>
                ) : directState.status === 'qr_ready' && directState.qrDataUrl ? (
                  <>
                    <div className="p-3 rounded-2xl bg-white shadow-xl">
                      <img src={directState.qrDataUrl} alt="WhatsApp QR Code" className="w-52 h-52" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white">Scan QR Code from WhatsApp</h3>
                      <p className="text-xs text-slate-400">
                        WhatsApp &gt; Linked Devices &gt; Link a Device
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        onClick={() => handleConnectDirectWhatsApp(true)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Refresh QR</span>
                      </button>
                      <button
                        onClick={async () => {
                          await handleDisconnectDirectWhatsApp();
                          setDirectLoginMethod('phone');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Phone Number (PIN) se Login karein</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      {directLoginMethod === 'phone' ? <Phone className="w-6 h-6" /> : <QrCode className="w-6 h-6" />}
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white">
                        {directState.hasSavedSession
                          ? 'Saved WhatsApp Session'
                          : directLoginMethod === 'phone'
                          ? 'Phone Number se WhatsApp Link karein'
                          : 'Connect WhatsApp'}
                      </h3>
                      {directState.lastError && (
                        <p className="text-xs text-rose-400 pt-0.5">{directState.lastError}</p>
                      )}
                    </div>

                    {/* Login Method Switcher: QR vs Phone Number PIN */}
                    <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-white/10 text-xs">
                      <button
                        onClick={() => setDirectLoginMethod('qr')}
                        className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                          directLoginMethod === 'qr'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>QR Code</span>
                      </button>
                      <button
                        onClick={() => setDirectLoginMethod('phone')}
                        className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                          directLoginMethod === 'phone'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Phone Number (PIN)</span>
                      </button>
                    </div>

                    {directLoginMethod === 'phone' ? (
                      <div className="w-full max-w-sm space-y-2.5 pt-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="tel"
                            value={pairingPhoneInput}
                            onChange={(e) => setPairingPhoneInput(e.target.value)}
                            placeholder="03001234567 ya 923001234567"
                            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                          />
                          <button
                            onClick={handleRequestPairingCode}
                            disabled={isRequestingPairingCode || !pairingPhoneInput.trim()}
                            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{isRequestingPairingCode ? 'Getting PIN...' : 'Get PIN Code'}</span>
                          </button>
                        </div>
                        {directState.hasSavedSession && (
                          <button
                            onClick={() => handleConnectDirectWhatsApp(false)}
                            disabled={isConnectingDirect}
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                          >
                            Ya saved session dubara resume karein
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          onClick={() => handleConnectDirectWhatsApp(false)}
                          disabled={isConnectingDirect}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-60"
                        >
                          <QrCode className="w-4 h-4" />
                          <span>
                            {isConnectingDirect
                              ? 'Connecting...'
                              : directState.hasSavedSession
                              ? 'Resume Session'
                              : 'Scan QR Code'}
                          </span>
                        </button>

                        {directState.hasSavedSession && (
                          <button
                            onClick={() => handleConnectDirectWhatsApp(true)}
                            disabled={isConnectingDirect}
                            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-white/10 transition cursor-pointer"
                          >
                            Scan New QR
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Group Listen Mode & Optional Group Filter */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/[0.08] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">Kis Chat Se Inventory Uthani Hai?</h4>
                    <p className="text-[11px] text-slate-400">
                      By default tamam WhatsApp Groups se deals auto-extract hoti hain.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateDirectSettings({ listenMode: 'groups_only' })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        directState.listenMode === 'groups_only'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-950 border-white/10 text-slate-400'
                      }`}
                    >
                      Only WhatsApp Groups
                    </button>
                    <button
                      onClick={() => handleUpdateDirectSettings({ listenMode: 'all_chats' })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        directState.listenMode === 'all_chats'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-950 border-white/10 text-slate-400'
                      }`}
                    >
                      Groups + Personal Chats
                    </button>
                  </div>
                </div>

                {directState.status === 'connected' && directState.groups.length > 0 && (
                  <div className="pt-2 border-t border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300">
                        Specific Groups Filter ({directState.selectedGroupIds.length === 0 ? 'All Groups Active' : `${directState.selectedGroupIds.length} Selected`}):
                      </span>
                      {directState.selectedGroupIds.length > 0 && (
                        <button
                          onClick={() => handleUpdateDirectSettings({ selectedGroupIds: [] })}
                          className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                        >
                          Select All Groups
                        </button>
                      )}
                    </div>
                    <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                      {directState.groups.map((grp, gIdx) => {
                        const isSelected = directState.selectedGroupIds.includes(grp.id);
                        return (
                          <button
                            key={`${grp.id || 'grp'}_${gIdx}`}
                            onClick={() => {
                              const next = isSelected
                                ? directState.selectedGroupIds.filter((id) => id !== grp.id)
                                : [...directState.selectedGroupIds, grp.id];
                              handleUpdateDirectSettings({ selectedGroupIds: next });
                            }}
                            className={`p-2 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                                : 'bg-slate-950/60 border-white/5 text-slate-300 hover:border-white/15'
                            }`}
                          >
                            <span className="truncate font-medium">{grp.subject}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{grp.participantsCount}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Hourly .txt Document & Auto-Gemini Phraser Card */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-cyan-300">
                        📄 Hourly .txt Document &amp; Auto-Gemini Phraser (Every 1 Hour)
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        {bufferState.messageCount} msgs in .txt
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Messages <code className="text-cyan-300">whatsapp_buffer.txt</code> mein save hotay hain aur har 1 ghantay baad Gemini AI auto-parse karta hai.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggleBatchMode('hourly_txt')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                        bufferState.mode === 'hourly_txt'
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-slate-950 border-white/10 text-slate-400'
                      }`}
                    >
                      ⏰ 1-Hour .txt Batch
                    </button>
                    <button
                      onClick={() => handleToggleBatchMode('instant')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                        bufferState.mode === 'instant'
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-slate-950 border-white/10 text-slate-400'
                      }`}
                    >
                      ⚡ Instant
                    </button>
                  </div>
                </div>

                {/* Countdown & Manual Trigger */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-white/[0.06] text-xs">
                  <div className="flex items-center gap-3 text-[11px] text-slate-300">
                    <span>
                      ⏰ Next Auto-Run:{' '}
                      <strong className="text-cyan-300">
                        {Math.max(1, Math.ceil((bufferState.nextBatchRunAt - Date.now()) / 60000))} min
                      </strong>
                    </span>
                    {bufferState.lastBatchResult && (
                      <span className="text-emerald-400">
                        • Last Run: +{bufferState.lastBatchResult.addedCount} added ({bufferState.lastBatchResult.messageCount} msgs)
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleProcessBufferNow}
                    disabled={isTriggeringBuffer || bufferState.isProcessing || bufferState.messageCount === 0}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isTriggeringBuffer ? 'animate-spin' : ''}`} />
                    <span>
                      {isTriggeringBuffer || bufferState.isProcessing
                        ? 'Gemini Phrasing...'
                        : `⚡ Process .txt Now (${bufferState.messageCount})`}
                    </span>
                  </button>
                </div>

                {/* Live .txt Document Preview */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Live Document: whatsapp_buffer.txt ({(bufferState.byteSize / 1024).toFixed(1)} KB)</span>
                  </div>
                  <pre className="p-3 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-mono text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {bufferState.previewText
                      ? bufferState.previewText
                      : 'Abhi whatsapp_buffer.txt khali hai. Jaise hi aapke WhatsApp Groups mein koi message aayega, yahan khud-ba-khud likha jayega...'}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB: GROUP EXPORT & AI PHRASER */}
          {activeTab === 'group_export' && (
            <div className="space-y-4">
              {/* Header Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-purple-950/40 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0 shadow-lg shadow-indigo-500/10">
                    <FileDown className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">WhatsApp Groups Export &amp; Gemini AI Phraser</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {totalStoredGroupMessages} Messages Stored
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Tamam groups ke purane aur naye messages ki .txt file banayein ya har group ko alag se export aur phrase karein.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => fetchGroupExportSummary()}
                    disabled={isLoadingExportSummary}
                    className="p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title="Refresh group export data"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingExportSummary ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleDownloadGroupExport(selectedExportGroupId)}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-md shadow-indigo-600/20"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download .txt</span>
                  </button>
                  <button
                    onClick={() => handlePhraseGroupExport(selectedExportGroupId)}
                    disabled={isPhrasingExport}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50 shadow-md shadow-emerald-500/20"
                  >
                    <Sparkles className={`w-4 h-4 ${isPhrasingExport ? 'animate-spin' : ''}`} />
                    <span>{isPhrasingExport ? 'Gemini Phrasing...' : 'Phrase with Gemini AI'}</span>
                  </button>
                </div>
              </div>

              {/* Group Selector Controls */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/[0.08] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white">Select Export Target:</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedExportGroupId('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        selectedExportGroupId === 'all'
                          ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
                          : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      All Groups ({totalStoredGroupMessages})
                    </button>
                    {exportGroups.length > 0 && (
                      <button
                        onClick={() => handleClearGroupExport(selectedExportGroupId)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
                        title="Clear messages"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Groups Grid / Dropdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                  {/* All Groups Card */}
                  <div
                    onClick={() => setSelectedExportGroupId('all')}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      selectedExportGroupId === 'all'
                        ? 'bg-indigo-950/40 border-indigo-500/60 shadow-sm'
                        : 'bg-slate-950/60 border-white/5 hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-white truncate">All Groups Combined</p>
                        <p className="text-[10px] text-slate-400">Total buffer &amp; all groups</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 shrink-0">
                      {totalStoredGroupMessages} msgs
                    </span>
                  </div>

                  {/* Individual Group Cards */}
                  {exportGroups.map((g) => (
                    <div
                      key={g.id}
                      onClick={() => setSelectedExportGroupId(g.id)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                        selectedExportGroupId === g.id
                          ? 'bg-indigo-950/40 border-indigo-500/60 shadow-sm'
                          : 'bg-slate-950/60 border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 font-bold text-[10px]">
                          #
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-white truncate" title={g.name}>
                            {g.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {g.lastMessageAt ? new Date(g.lastMessageAt).toLocaleTimeString() : 'Recent'}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 shrink-0">
                        {g.count} msgs
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Toolbar for Selected Group */}
              <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Active Export:</span>
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold">
                    {selectedExportGroupId === 'all'
                      ? 'Tamam Groups (All Groups Combined)'
                      : exportGroups.find((g) => g.id === selectedExportGroupId)?.name || selectedExportGroupId}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyGroupExport(selectedExportGroupId)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    {copiedField === 'export_text' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'export_text' ? 'Copied!' : 'Copy Text'}</span>
                  </button>
                  <button
                    onClick={() => handleDownloadGroupExport(selectedExportGroupId)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .txt File</span>
                  </button>
                  <button
                    onClick={() => handlePhraseGroupExport(selectedExportGroupId)}
                    disabled={isPhrasingExport}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isPhrasingExport ? 'animate-spin' : ''}`} />
                    <span>Phrase with Gemini AI</span>
                  </button>
                </div>
              </div>

              {/* AI Phrasing Result Card */}
              {exportPhrasingResult && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-white">Gemini AI Phrasing Summary:</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-slate-900 border border-white/5">
                      <p className="text-[10px] text-slate-400">Total Parsed</p>
                      <p className="text-base font-bold text-white">{exportPhrasingResult.messageCount || 0}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] text-emerald-300">Plots Added</p>
                      <p className="text-base font-bold text-emerald-400">+{exportPhrasingResult.addedCount || 0}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                      <p className="text-[10px] text-indigo-300">Requirements Added</p>
                      <p className="text-base font-bold text-indigo-400">+{exportPhrasingResult.addedRequirementsCount || 0}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <p className="text-[10px] text-amber-300">Duplicates Skipped</p>
                      <p className="text-base font-bold text-amber-400">{exportPhrasingResult.skippedDuplicatesCount || 0}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Manual Export / Paste Box */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/[0.08] space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Manual WhatsApp Chat Export Paste karein (Agar aapne WhatsApp mobile app se .txt export kiya ho):
                </label>
                <textarea
                  value={customExportInput}
                  onChange={(e) => setCustomExportInput(e.target.value)}
                  placeholder="Yahan WhatsApp ka export shuda chat text paste karein aur 'Phrase with Gemini AI' dabayein..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => handlePhraseGroupExport('custom')}
                    disabled={isPhrasingExport || !customExportInput.trim()}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isPhrasingExport ? 'animate-spin' : ''}`} />
                    <span>Custom Text ko Phrase Karein</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GREEN-API (QR & GROUPS AUTOMATION) */}
          {activeTab === 'greenapi' && (
            <div className="space-y-5">
              
              {/* Highlight Banner */}
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-white/[0.08] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Zap className="w-4 h-4 fill-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Green-API Gateway</h3>
                    <p className="text-[11px] text-slate-400">
                      24/7 dedicated WhatsApp Groups aur Personal chats auto-listener.
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Active
                </span>
              </div>

              {/* Status & Sync Action Bar */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/[0.08] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                    greenApiState === 'authorized'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : greenApiState === 'notAuthorized'
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                      : 'bg-slate-800 border-white/10 text-slate-400'
                  }`}>
                    {greenApiState === 'authorized' ? (
                      <Wifi className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <QrCode className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">WhatsApp Status:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        greenApiState === 'authorized'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : greenApiState === 'notAuthorized'
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-slate-800 border-white/10 text-slate-400'
                      }`}>
                        {greenApiState === 'authorized'
                          ? '🟢 WhatsApp Connected & Authorized'
                          : greenApiState === 'notAuthorized'
                          ? '🟡 Disconnected / Needs QR Scan'
                          : '⚪ Not Verified / Click Check'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {greenApiState === 'authorized'
                        ? 'Groups aur chats se incoming listings automatically read ho rahi hain.'
                        : 'Apna Instance ID aur Token save karein aur Check Status dabayein.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleCheckGreenApiStatus}
                    disabled={isCheckingGreenApi}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-white/10 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingGreenApi ? 'animate-spin' : ''}`} />
                    <span>Check Status</span>
                  </button>

                  <button
                    onClick={handleFetchQrCode}
                    className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium border border-amber-500/30 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Show QR Code</span>
                  </button>

                  <button
                    onClick={handleSyncGreenApi}
                    disabled={isSyncingGreenApi}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                  >
                    <Zap className={`w-3.5 h-3.5 ${isSyncingGreenApi ? 'animate-spin' : 'fill-slate-950'}`} />
                    <span>{isSyncingGreenApi ? 'Syncing...' : '⚡ Sync Messages Now'}</span>
                  </button>
                </div>
              </div>

              {/* QR Code Display if requested or not authorized */}
              {greenApiQr && (
                <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/30 text-center space-y-3 animate-fadeIn">
                  <div className="inline-block p-3 rounded-2xl bg-white shadow-xl">
                    <img src={greenApiQr} alt="WhatsApp QR Code" className="w-48 h-48 mx-auto" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Scan this QR Code from WhatsApp</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Apne phone par WhatsApp kholen &gt; <strong>Linked Devices</strong> (تین ڈاٹس) &gt; <strong>Link a Device</strong> dabayein aur is QR code ko scan karein.
                    </p>
                  </div>
                </div>
              )}

              {/* Instant Sync Summary if available */}
              {greenApiSyncSummary && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-xs space-y-2">
                  <div className="flex items-center justify-between text-emerald-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Green-API Sync Completed
                    </span>
                    <span>Fetched: {greenApiSyncSummary.totalFetched} messages</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                      <strong>+{greenApiSyncSummary.addedCount}</strong> Added to CRM
                    </div>
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      <strong>{greenApiSyncSummary.skippedDuplicatesCount}</strong> Duplicates Skipped
                    </div>
                    <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                      <strong>{greenApiSyncSummary.rejectedNoContactCount}</strong> No Contact Dropped
                    </div>
                  </div>
                </div>
              )}

              {/* Credentials & Webhook Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Instance Settings */}
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/[0.08] space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                    <span>Green-API Instance Credentials</span>
                  </h4>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Green-API idInstance (10-Digit Number)</label>
                    <input
                      type="text"
                      value={greenApiIdInstance}
                      onChange={(e) => setGreenApiIdInstance(e.target.value)}
                      placeholder="e.g. 7103859123 ya umer_realtors_webhook_2026"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Green-API apiTokenInstance (Token / Secret Key)</label>
                    <input
                      type="text"
                      value={greenApiTokenInstance}
                      onChange={(e) => setGreenApiTokenInstance(e.target.value)}
                      placeholder="e.g. d75b34d60234479e96e7... ya umer_realtors_webhook_2026"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <a
                      href="https://console.green-api.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open console.green-api.com</span>
                    </a>

                    <button
                      onClick={handleSaveGreenApiCreds}
                      className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition cursor-pointer"
                    >
                      Save Credentials
                    </button>
                  </div>
                </div>

                {/* Instant Real-Time Webhook */}
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/[0.08] space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Real-Time Webhook URL (For Instant Auto-Push)</span>
                  </h4>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Green-API Console &gt; <strong>Instance Settings</strong> &gt; <strong>Webhook URL</strong> me yeh URL paste kar ke Save kar dein:
                  </p>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-emerald-400 truncate">
                      {greenApiWebhookUrl}
                    </span>
                    <button
                      onClick={() => copyToClipboard(greenApiWebhookUrl, 'greenApiUrl')}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'greenApiUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 text-[11px] text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-300">Green-API Notifications checklist:</p>
                    <p className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>incomingMessageReceived checkmark ON hona chahiye.</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>incomingGroupMessageReceived (Group deals ke liye) ON hona chahiye!</span>
                    </p>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: META WEBHOOK SETUP (OPTIONAL / OLD) */}
          {activeTab === 'webhook' && (
            <div className="space-y-5">

              {/* Method Switcher Tabs */}
              <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-2xl border border-white/[0.08]">
                <button
                  onClick={() => setWebhookSubMethod('script')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    webhookSubMethod === 'script'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Method 1: Google Apps Script (Recommended & Instant)</span>
                </button>
                <button
                  onClick={() => setWebhookSubMethod('direct')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    webhookSubMethod === 'direct'
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                  <span>Method 2: Direct Server / Cloudflare Tunnel</span>
                </button>
              </div>

              {/* METHOD 1: GOOGLE APPS SCRIPT RELAY (RECOMMENDED) */}
              {webhookSubMethod === 'script' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/[0.08] space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Code className="w-4 h-4 text-emerald-400" />
                        <span>Google Apps Script Webhook Code (1-Click Copy)</span>
                      </h4>
                      <button
                        onClick={() => copyToClipboard(
`// ============================================================================
// UMER REALTORS - META WHATSAPP WEBHOOK BRIDGE FOR GOOGLE APPS SCRIPT
// ============================================================================

// 1. Meta Webhook Handshake Verification (GET)
function doGet(e) {
  var mode = e && e.parameter ? e.parameter['hub.mode'] : '';
  var token = e && e.parameter ? e.parameter['hub.verify_token'] : '';
  var challenge = e && e.parameter ? e.parameter['hub.challenge'] : '';

  if (mode === 'subscribe' && token === 'umer_realtors_webhook_2026') {
    return ContentService.createTextOutput(challenge);
  }
  return ContentService.createTextOutput('Umer Realtors WhatsApp Webhook Active');
}

// 2. Incoming WhatsApp Message Receiver (POST)
function doPost(e) {
  try {
    var rawText = e && e.postData ? e.postData.contents : '';
    if (!rawText) return ContentService.createTextOutput('EMPTY');
    var payload = JSON.parse(rawText);

    if (payload.object === 'whatsapp_business_account' || (payload.entry && payload.entry[0] && payload.entry[0].changes)) {
      var entry = payload.entry && payload.entry[0];
      var change = entry && entry.changes && entry.changes[0];
      var val = change && change.value;
      var msg = val && val.messages && val.messages[0];
      if (msg && msg.type === 'text') {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var inbox = ss.getSheetByName('WhatsApp_Inbox') || ss.insertSheet('WhatsApp_Inbox');
        if (inbox.getLastRow() === 0) {
          inbox.appendRow(['Timestamp', 'Sender Name', 'Sender Phone', 'Message Text', 'Status']);
          inbox.getRange("A1:E1").setFontWeight("bold").setBackground("#10b981").setFontColor("#ffffff");
        }
        var cName = (val.contacts && val.contacts[0] && val.contacts[0].profile) ? val.contacts[0].profile.name : 'WhatsApp Dealer';
        inbox.appendRow([new Date(), cName, msg.from || '', msg.text.body || '', 'New']);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'EVENT_RECEIVED' })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {}
  return ContentService.createTextOutput(JSON.stringify({ status: 'OK' })).setMimeType(ContentService.MimeType.JSON);
}`, 'appscript')}
                        className="py-1.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                      >
                        {copiedField === 'appscript' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedField === 'appscript' ? 'Copied' : 'Copy Full Code'}</span>
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-emerald-400/90 max-h-48 overflow-y-auto border border-slate-800 leading-relaxed">
                      <p>// 1. Meta Webhook Handshake Verification (GET)</p>
                      <p>function doGet(e) &#123;</p>
                      <p>&nbsp;&nbsp;if (e.parameter[&apos;hub.mode&apos;] === &apos;subscribe&apos; &amp;&amp; e.parameter[&apos;hub.verify_token&apos;] === &apos;umer_realtors_webhook_2026&apos;) &#123;</p>
                      <p>&nbsp;&nbsp;&nbsp;&nbsp;return ContentService.createTextOutput(e.parameter[&apos;hub.challenge&apos;]);</p>
                      <p>&nbsp;&nbsp;&#125;</p>
                      <p>&#125;</p>
                      <p>// 2. Incoming WhatsApp Message Receiver (POST) -&gt; saves to WhatsApp_Inbox sheet tab</p>
                    </div>

                    {/* Step-by-step Setup */}
                    <div className="space-y-2 text-xs text-slate-300">
                      <h5 className="font-bold text-white flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-cyan-400" />
                        <span>Setup Steps (Sirf 2 Minutes):</span>
                      </h5>
                      <ol className="space-y-1.5 list-decimal list-inside pl-1 text-slate-300 leading-relaxed">
                        <li>Apni Google Sheet open karein aur <strong>Extensions &gt; Apps Script</strong> par click karein.</li>
                        <li>Upar diya gaya code paste karein aur Save (Ctrl+S) dabayein.</li>
                        <li><strong>Deploy &gt; Manage Deployments &gt; Edit (ya New deployment)</strong>:
                          <ul className="pl-6 list-disc text-slate-400 space-y-0.5 mt-0.5">
                            <li>Type: <strong>Web app</strong></li>
                            <li>Execute as: <strong>Me</strong></li>
                            <li>Who has access: <strong>Anyone</strong> (crucial for Meta!)</li>
                          </ul>
                        </li>
                        <li>Google Apps Script ka jo <strong>Web App URL</strong> ملے گا، usay Meta Developer Portal ke <strong>Callback URL</strong> me paste kar dein!</li>
                        <li>Verify Token: <code className="text-amber-300 font-mono font-bold">umer_realtors_webhook_2026</code> paste karein aur Verify and Save karein. <strong>Meta 100% Verify karega!</strong></li>
                      </ol>
                    </div>

                    {/* Instant Sync Button from Sheet Inbox */}
                    <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Sync Messages from Google Sheet (WhatsApp_Inbox)</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Meta se sheet me anay wale tamam naye messages ko AI se phrase kar ke inventory me add karein
                        </p>
                      </div>
                      <button
                        onClick={handleSyncSheetInbox}
                        disabled={isSyncingSheetInbox}
                        className="py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheetInbox ? 'animate-spin' : ''}`} />
                        <span>{isSyncingSheetInbox ? 'Processing AI...' : 'Sync Sheet Inbox Now'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* METHOD 2: DIRECT WEBHOOK / CLOUDFLARE TUNNEL */}
              {webhookSubMethod === 'direct' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/[0.08] space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Direct Callback URL (Bina Google Login Wall Ke)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={webhookUrl}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-cyan-400 font-mono text-xs select-all focus:outline-none"
                        />
                        <button
                          onClick={() => copyToClipboard(webhookUrl, 'url')}
                          className="py-2 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                        >
                          {copiedField === 'url' ? <Check className="w-4 h-4 text-cyan-400" /> : <Copy className="w-4 h-4" />}
                          <span>{copiedField === 'url' ? 'Copied' : 'Copy URL'}</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Verify Token
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={config.webhookVerifyToken}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-amber-400 font-mono text-xs select-all focus:outline-none"
                        />
                        <button
                          onClick={() => copyToClipboard(config.webhookVerifyToken, 'token')}
                          className="py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                        >
                          {copiedField === 'token' ? <Check className="w-4 h-4 text-amber-400" /> : <Copy className="w-4 h-4" />}
                          <span>{copiedField === 'token' ? 'Copied' : 'Copy Token'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <Terminal className="w-4 h-4 text-amber-400" />
                        <span>Agar Direct Dev Server Par Webhook Chalana Ho:</span>
                      </div>
                      <p className="text-slate-400 leading-relaxed text-[11px]">
                        Google AI Studio ki dev preview URL par cookie barrier hota hai. Isay bypass karne ke liye aap free Cloudflare Quick Tunnel chala saktay hain:
                      </p>
                      <div className="p-2 rounded bg-slate-900 font-mono text-amber-300 text-[11px]">
                        npx cloudflared tunnel --url http://localhost:3000
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Is se jo <code className="text-white">https://xxxx.trycloudflare.com</code> URL mile ga, uske agay <code className="text-emerald-400">/api/whatsapp/webhook</code> laga kar Meta me paste kar dein!
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: TEST SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-amber-400 font-bold text-xs">
                <Flame className="w-4 h-4" />
                <span>Test WhatsApp Message Simulator</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Sender WhatsApp Phone:</label>
                  <input
                    type="text"
                    value={simSenderPhone}
                    onChange={(e) => setSimSenderPhone(e.target.value)}
                    placeholder="e.g. 03001234567"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Sender / Dealer Name:</label>
                  <input
                    type="text"
                    value={simSenderName}
                    onChange={(e) => setSimSenderName(e.target.value)}
                    placeholder="e.g. Malik Asif (Apex Realtors)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  WhatsApp Broadcast Message Text:
                </label>
                <textarea
                  rows={4}
                  value={simMessage}
                  onChange={(e) => setSimMessage(e.target.value)}
                  placeholder="Paste WhatsApp real estate broadcast text here..."
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-900 border border-slate-700 text-white text-xs font-sans focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-[11px] text-slate-400">
                  Strict Rule: Missing phone numbers will be automatically discarded.
                </div>
                <button
                  onClick={handleSimulateMessage}
                  disabled={isSimulating}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                  <span>{isSimulating ? 'AI Phrasing Message...' : 'Simulate Incoming Message'}</span>
                </button>
              </div>

              {/* Simulation Result Box */}
              {simResult && (
                <div className="mt-4 p-4 rounded-2xl bg-slate-900/90 border border-white/[0.1] space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Phraser Output Result</span>
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      simResult.addedCount > 0 
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : simResult.skippedDuplicatesCount > 0
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}>
                      Status: {simResult.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-slate-950 border border-white/[0.05]">
                      <p className="text-slate-400 text-[10px]">Plots Added</p>
                      <p className="text-emerald-400 font-bold text-sm">+{simResult.addedCount}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-white/[0.05]">
                      <p className="text-slate-400 text-[10px]">Duplicates Skipped</p>
                      <p className="text-amber-400 font-bold text-sm">{simResult.skippedDuplicatesCount}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-white/[0.05]">
                      <p className="text-slate-400 text-[10px]">No Phone Omitted</p>
                      <p className="text-rose-400 font-bold text-sm">{simResult.rejectedNoContactCount}</p>
                    </div>
                  </div>

                  {simResult.addedListings && simResult.addedListings.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-slate-400 font-medium">Added Properties Preview:</p>
                      {simResult.addedListings.map((p: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-slate-950 border border-emerald-500/20 text-xs flex items-center justify-between">
                          <div>
                            <span className="font-bold text-white">{p.society}</span>
                            <span className="text-slate-400 text-[11px] ml-1.5">({p.block}) · Plot #{p.unitNumber}</span>
                            <div className="text-[11px] text-emerald-400 font-semibold">{p.sizeLabel} · {p.formattedPrice}</div>
                          </div>
                          <div className="text-right text-[11px]">
                            <p className="text-slate-300 font-medium">{p.dealerName}</p>
                            <p className="text-amber-400 font-mono">{p.contactNumber}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE MESSAGE LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Recent Incoming WhatsApp Messages ({logs.length})</span>
                <span>Auto-refreshed with real-time audit trail</span>
              </div>

              {logs.length === 0 ? (
                <div className="p-10 text-center rounded-2xl bg-slate-900/60 border border-white/[0.06] space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">No incoming WhatsApp messages recorded yet.</p>
                  <p className="text-[11px] text-slate-500">
                    Use the &ldquo;Test Simulator&rdquo; tab or send a live message to your WhatsApp Business number.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3.5 rounded-2xl bg-slate-900 border border-white/[0.06] text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{log.senderName}</span>
                          <span className="text-[11px] text-amber-400 font-mono">({log.senderNumber})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            log.status === 'added'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : log.status === 'duplicate_skipped'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : log.status === 'no_contact_discarded'
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {log.status === 'added' ? `+${log.addedListings?.length || 0} Added` : log.status}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2 rounded-xl line-clamp-2">
                        &ldquo;{log.rawText}&rdquo;
                      </p>

                      {log.addedListings && log.addedListings.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {log.addedListings.map((p: any, pIdx: number) => (
                            <span key={pIdx} className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px]">
                              {p.society} {p.block} #{p.unitNumber} ({p.sizeLabel} · {p.formattedPrice})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-4 max-w-xl">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Automation &amp; Sync Preferences
                </h4>

                <div className="p-4 rounded-2xl bg-slate-900 border border-white/[0.08] space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Custom Webhook Verification Token:
                    </label>
                    <input
                      type="text"
                      value={config.webhookVerifyToken}
                      onChange={(e) => setConfig({ ...config, webhookVerifyToken: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Must match the Verify Token entered in Meta Developer Portal.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                    <div>
                      <p className="font-semibold text-white">Auto-Sync to Google Sheets</p>
                      <p className="text-[11px] text-slate-400">
                        Automatically forward newly added plots to Google Sheets Master CRM.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.autoSyncToSheets}
                      onChange={(e) => setConfig({ ...config, autoSyncToSheets: e.target.checked })}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                    <div>
                      <p className="font-semibold text-white">WhatsApp Automation Active</p>
                      <p className="text-[11px] text-slate-400">
                        Turn on/off automatic processing of incoming WhatsApp webhooks.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveSettings}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer active:scale-95"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-white/[0.08] bg-slate-900/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Endpoint: <code className="text-slate-300 font-mono">POST /api/whatsapp/webhook</code></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
