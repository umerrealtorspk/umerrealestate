import fs from 'fs';
import path from 'path';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { handleIncomingWhatsAppText } from './whatsappWebhookService';
import { loadAppConfig, saveAppConfig } from './inventoryStore';
import { recordGroupMessage } from './whatsappGroupExportService';

const DATA_DIR = path.join(process.cwd(), 'data');
const AUTH_DIR = path.join(DATA_DIR, 'baileys_auth');
const CREDS_BACKUP_PATH = path.join(DATA_DIR, 'baileys_creds_backup.json');

export interface BaileysGroupInfo {
  id: string;
  subject: string;
  participantsCount: number;
}

export interface BaileysStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'pairing_code_ready' | 'connected' | 'error';
  qrDataUrl: string | null;
  pairingCode: string | null;
  pairingPhone: string | null;
  connectedPhone: string | null;
  connectedName: string | null;
  lastError: string | null;
  listenMode: 'groups_only' | 'all_chats';
  selectedGroupIds: string[];
  groups: BaileysGroupInfo[];
  messagesReceivedCount: number;
  hasSavedSession: boolean;
}

let sock: WASocket | null = null;
let connectionStatus: BaileysStatus['status'] = 'disconnected';
let currentQrDataUrl: string | null = null;
let currentPairingCode: string | null = null;
let pendingPairingPhone: string | null = null;
let pairingCodeRequestedForSocket = false;
let connectedPhone: string | null = null;
let connectedName: string | null = null;
let lastError: string | null = null;
let cachedGroups: BaileysGroupInfo[] = [];
let messagesReceivedCount = 0;
let isStarting = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let consecutiveLoggedOutCount = 0;

/**
 * Normalizes phone number for WhatsApp Pairing Code (digits only with country code, e.g. 923001234567)
 */
export function normalizeWhatsAppPairingPhone(rawPhone: string): string {
  let digits = (rawPhone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '92' + digits.slice(1);
  } else if (digits.startsWith('3') && digits.length === 10) {
    digits = '92' + digits;
  }
  return digits;
}

// Silent logger for Baileys to keep console clean and fast
const silentLogger: any = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
};

/**
 * Destroys existing socket cleanly so no zombie connections conflict with WhatsApp
 */
function destroyCurrentSocket(): void {
  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.ev.removeAllListeners('messaging-history.set');
      sock.end(undefined);
    } catch {}
    sock = null;
  }
}

/**
 * Checks whether valid credentials exist in the primary auth folder or backup
 */
export function hasSavedSession(): boolean {
  restoreCredsFromBackupIfNeeded();
  const credsPath = path.join(AUTH_DIR, 'creds.json');
  if (fs.existsSync(credsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      return Boolean(data?.me?.id || data?.registered || data?.account);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Restores creds.json from backup if primary auth was wiped or corrupted
 */
function restoreCredsFromBackupIfNeeded(): void {
  const credsPath = path.join(AUTH_DIR, 'creds.json');
  if (!fs.existsSync(credsPath) && fs.existsSync(CREDS_BACKUP_PATH)) {
    try {
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
      fs.copyFileSync(CREDS_BACKUP_PATH, credsPath);
      console.log('[WhatsApp Direct] Successfully restored creds.json from backup file.');
    } catch (err) {
      console.warn('[WhatsApp Direct] Could not restore backup creds:', err);
    }
  }
}

/**
 * Persists a safety backup copy of creds.json
 */
function backupCreds(): void {
  try {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) {
      const data = fs.readFileSync(credsPath, 'utf-8');
      fs.writeFileSync(CREDS_BACKUP_PATH, data, 'utf-8');
    }
  } catch (err) {
    console.warn('[WhatsApp Direct] Could not backup creds:', err);
  }
}

export function getBaileysSettings(): { listenMode: 'groups_only' | 'all_chats'; selectedGroupIds: string[] } {
  const cfg = loadAppConfig() || {};
  return {
    listenMode: cfg.baileysListenMode === 'all_chats' ? 'all_chats' : 'groups_only',
    selectedGroupIds: Array.isArray(cfg.baileysSelectedGroupIds) ? cfg.baileysSelectedGroupIds : [],
  };
}

export function updateBaileysSettings(updates: {
  listenMode?: 'groups_only' | 'all_chats';
  selectedGroupIds?: string[];
}) {
  const existing = loadAppConfig() || {};
  const merged = {
    ...existing,
    baileysListenMode: updates.listenMode ?? existing.baileysListenMode ?? 'groups_only',
    baileysSelectedGroupIds:
      updates.selectedGroupIds !== undefined ? updates.selectedGroupIds : existing.baileysSelectedGroupIds ?? [],
  };
  saveAppConfig(merged);
  return getBaileysSettings();
}

export function getBaileysStatus(): BaileysStatus {
  const settings = getBaileysSettings();
  return {
    status: connectionStatus,
    qrDataUrl: currentQrDataUrl,
    pairingCode: currentPairingCode,
    pairingPhone: pendingPairingPhone,
    connectedPhone,
    connectedName,
    lastError,
    listenMode: settings.listenMode,
    selectedGroupIds: settings.selectedGroupIds,
    groups: cachedGroups,
    messagesReceivedCount,
    hasSavedSession: hasSavedSession(),
  };
}

export async function refreshBaileysGroups(): Promise<BaileysGroupInfo[]> {
  if (!sock || connectionStatus !== 'connected') {
    return cachedGroups;
  }
  try {
    const groupsMap = await sock.groupFetchAllParticipating();
    const list: BaileysGroupInfo[] = Object.values(groupsMap || {}).map((g: any) => ({
      id: g.id,
      subject: g.subject || 'Unnamed Group',
      participantsCount: Array.isArray(g.participants) ? g.participants.length : 0,
    }));
    list.sort((a, b) => a.subject.localeCompare(b.subject));
    cachedGroups = list;
    return list;
  } catch (err: any) {
    console.warn('[WhatsApp Direct] Could not fetch groups:', err?.message);
    return cachedGroups;
  }
}

export async function startBaileysConnection(forceFresh = false, pairingPhoneNumber?: string): Promise<BaileysStatus> {
  if (isStarting) {
    return getBaileysStatus();
  }
  if (sock && connectionStatus === 'connected' && !forceFresh && !pairingPhoneNumber) {
    return getBaileysStatus();
  }

  isStarting = true;
  lastError = null;
  connectionStatus = 'connecting';
  currentQrDataUrl = null;

  if (pairingPhoneNumber) {
    const normalized = normalizeWhatsAppPairingPhone(pairingPhoneNumber);
    if (normalized.length < 10 || normalized.length > 15) {
      isStarting = false;
      connectionStatus = 'error';
      lastError = 'Sahi phone number likhein (maslan 03001234567 ya 923001234567).';
      return getBaileysStatus();
    }
    pendingPairingPhone = normalized;
    currentPairingCode = null;
    pairingCodeRequestedForSocket = false;
    forceFresh = true;
  } else if (forceFresh) {
    pendingPairingPhone = null;
    currentPairingCode = null;
    pairingCodeRequestedForSocket = false;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Destroy previous socket cleanly before creating a new one
  destroyCurrentSocket();

  try {
    if (forceFresh) {
      console.log('[WhatsApp Direct] Force fresh connection requested. Clearing existing credentials...');
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } catch {}
      try {
        if (fs.existsSync(CREDS_BACKUP_PATH)) {
          fs.unlinkSync(CREDS_BACKUP_PATH);
        }
      } catch {}
      consecutiveLoggedOutCount = 0;
    } else {
      restoreCredsFromBackupIfNeeded();
    }

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    
    let version: [number, number, number] = [2, 3000, 1043857760];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest?.version) version = latest.version;
    } catch {
      // Fallback version if offline
    }

    // Wrap state.keys with makeCacheableSignalKeyStore to prevent Signal protocol key desync during group activity
    const cacheableKeys = makeCacheableSignalKeyStore(state.keys, silentLogger);

    const wasAuthenticatedBefore = hasSavedSession();

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: cacheableKeys,
      },
      logger: silentLogger,
      // Ubuntu Chrome browser signature is stable and avoids WhatsApp Web bot flags
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      keepAliveIntervalMs: 25000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 5,
      generateHighQualityLinkPreview: false,
      getMessage: async (_key) => undefined,
    });

    // Save creds on every update and immediately maintain a safe backup
    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        backupCreds();
      } catch (saveErr) {
        console.warn('[WhatsApp Direct] Error in saveCreds:', saveErr);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (pendingPairingPhone && !state.creds.registered) {
          if (!pairingCodeRequestedForSocket && sock) {
            pairingCodeRequestedForSocket = true;
            try {
              console.log(`[WhatsApp Direct] Requesting 8-digit pairing code for +${pendingPairingPhone}...`);
              const code = await sock.requestPairingCode(pendingPairingPhone);
              currentPairingCode = code;
              currentQrDataUrl = null;
              connectionStatus = 'pairing_code_ready';
              lastError = null;
              consecutiveLoggedOutCount = 0;
              console.log(`[WhatsApp Direct] Pairing Code ready: ${code}`);
            } catch (pairErr: any) {
              console.error('[WhatsApp Direct] Pairing code generation error:', pairErr);
              lastError = pairErr?.message || 'Pairing code generate karne mein masla aaya. Dubara try karein.';
              connectionStatus = 'error';
              pendingPairingPhone = null;
              currentPairingCode = null;
            }
          }
        } else {
          try {
            currentQrDataUrl = await QRCode.toDataURL(qr, {
              width: 280,
              margin: 2,
              color: { dark: '#0f172a', light: '#ffffff' },
            });
            connectionStatus = 'qr_ready';
            lastError = null;
            consecutiveLoggedOutCount = 0;
            console.log('[WhatsApp Direct] QR Code ready for scanning.');
          } catch (qrErr: any) {
            console.error('[WhatsApp Direct] QR generation error:', qrErr);
          }
        }
      }

      if (connection === 'open') {
        consecutiveLoggedOutCount = 0;
        connectionStatus = 'connected';
        currentQrDataUrl = null;
        currentPairingCode = null;
        pendingPairingPhone = null;
        pairingCodeRequestedForSocket = false;
        lastError = null;
        const rawId = sock?.user?.id || '';
        connectedPhone = rawId.split(':')[0].split('@')[0] || null;
        connectedName = sock?.user?.name || 'WhatsApp Connected';
        console.log(`[WhatsApp Direct] WhatsApp connected successfully as ${connectedName} (${connectedPhone})`);
        
        // Save backup of creds on successful login
        backupCreds();

        // Fetch groups in background
        refreshBaileysGroups().catch(() => {});
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        console.log(`[WhatsApp Direct] Connection closed (code: ${statusCode || 'unknown'}).`);

        const isLoggedOut = statusCode === DisconnectReason.loggedOut; // 401
        const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced; // 440

        // Case 1: Duplicate socket conflict
        if (isConnectionReplaced) {
          console.warn('[WhatsApp Direct] Another connection replaced this session. Retrying in 5s...');
          destroyCurrentSocket();
          connectionStatus = 'connecting';
          reconnectTimer = setTimeout(() => {
            isStarting = false;
            startBaileysConnection().catch(() => {});
          }, 5000);
          return;
        }

        // Case 2a: Pairing Code timed out before user entered it on phone
        if (!wasAuthenticatedBefore && !connectedPhone && connectionStatus === 'pairing_code_ready') {
          console.log('[WhatsApp Direct] Pairing Code timed out before link.');
          destroyCurrentSocket();
          currentPairingCode = null;
          pendingPairingPhone = null;
          pairingCodeRequestedForSocket = false;
          connectionStatus = 'disconnected';
          lastError = 'Pairing code ka waqt khatam ho gaya. Dubara phone number likh kar naya code hasil karein.';
          return;
        }

        // Case 2b: QR Code Timed Out BEFORE user scanned it
        if (!wasAuthenticatedBefore && !connectedPhone && connectionStatus === 'qr_ready') {
          console.log('[WhatsApp Direct] QR Code expired before scan. Generating a fresh QR code...');
          destroyCurrentSocket();
          consecutiveLoggedOutCount++;
          if (consecutiveLoggedOutCount <= 3) {
            // Auto-refresh fresh QR code up to 3 times
            connectionStatus = 'connecting';
            reconnectTimer = setTimeout(() => {
              isStarting = false;
              startBaileysConnection(false).catch(() => {});
            }, 1500);
            return;
          } else {
            currentQrDataUrl = null;
            connectionStatus = 'disconnected';
            lastError = 'QR Code scan ka waqt (timeout) khatam ho gaya. Naya QR scan karne ke liye Connect WhatsApp dabayein.';
            return;
          }
        }

        // Case 3: 401 Unauthorized on an existing authenticated session
        if (isLoggedOut) {
          consecutiveLoggedOutCount++;
          console.warn(`[WhatsApp Direct] Received 401 Unauthorized (attempt ${consecutiveLoggedOutCount}/3).`);

          // Retry up to 2 times with exponential backoff before declaring unlinked
          if (consecutiveLoggedOutCount <= 2) {
            destroyCurrentSocket();
            connectionStatus = 'connecting';
            const retryDelay = consecutiveLoggedOutCount * 3000;
            console.log(`[WhatsApp Direct] Retrying session in ${retryDelay / 1000}s...`);
            reconnectTimer = setTimeout(() => {
              isStarting = false;
              startBaileysConnection().catch(() => {});
            }, retryDelay);
            return;
          }

          // If genuinely unlinked from the phone
          currentQrDataUrl = null;
          connectedPhone = null;
          connectedName = null;
          connectionStatus = 'disconnected';
          lastError = 'WhatsApp session phone se unlink ho gaya hai. Dobara QR scan karne ke liye Connect WhatsApp dabayein.';
          destroyCurrentSocket();
        } else {
          // Regular network drop or WhatsApp server reconnect (408, 428, 515 restartRequired, etc.)
          consecutiveLoggedOutCount = 0;
          connectionStatus = 'connecting';
          lastError = null;
          destroyCurrentSocket();

          const delay = statusCode === 515 ? 1000 : 3000;
          console.log(`[WhatsApp Direct] Auto-reconnecting in ${delay}ms...`);
          reconnectTimer = setTimeout(() => {
            isStarting = false;
            startBaileysConnection().catch(() => {});
          }, delay);
        }
      }
    });

    sock.ev.on('messaging-history.set', (history: any) => {
      try {
        const messages = history?.messages || [];
        for (const msg of messages) {
          if (!msg.message || msg.key?.fromMe) continue;
          const remoteJid = msg.key?.remoteJid || '';
          if (!remoteJid || !remoteJid.endsWith('@g.us')) continue;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            '';

          if (!text || !text.trim()) continue;

          const rawSender = msg.key.participant || remoteJid;
          const senderPhone = rawSender.split('@')[0].split(':')[0];
          const pushName = msg.pushName || 'WhatsApp Dealer';
          const found = cachedGroups.find((g) => g.id === remoteJid);
          const groupName = found ? found.subject : 'WhatsApp Group';
          const ts = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp * 1000 : Date.now();

          recordGroupMessage({
            groupId: remoteJid,
            groupName,
            senderPhone,
            senderName: pushName,
            timestamp: ts,
            formattedTime: new Date(ts).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }),
            text: text.trim(),
          });
        }
      } catch (histErr) {
        console.warn('[WhatsApp Direct] Error in messaging-history.set:', histErr);
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      const settings = getBaileysSettings();

      for (const msg of m.messages) {
        try {
          if (!msg.message || msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid || '';
          if (!remoteJid || remoteJid === 'status@broadcast') continue;

          const isGroup = remoteJid.endsWith('@g.us');
          if (settings.listenMode === 'groups_only' && !isGroup) {
            continue;
          }

          if (
            isGroup &&
            settings.selectedGroupIds.length > 0 &&
            !settings.selectedGroupIds.includes(remoteJid)
          ) {
            continue;
          }

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            msg.message.documentMessage?.caption ||
            '';

          if (!text || !text.trim()) continue;

          messagesReceivedCount++;

          const rawSender = msg.key.participant || remoteJid;
          const senderPhone = rawSender.split('@')[0].split(':')[0];
          const pushName = msg.pushName || 'WhatsApp Dealer';

          let groupName = '';
          if (isGroup) {
            const found = cachedGroups.find((g) => g.id === remoteJid);
            groupName = found ? `${found.subject} (${pushName})` : `Group (${pushName})`;
          } else {
            groupName = pushName;
          }

          console.log(`[WhatsApp Direct] Incoming from ${groupName}: "${text.slice(0, 50)}..."`);

          // Record message in group export store for individual group export & AI phrasing
          if (isGroup) {
            recordGroupMessage({
              groupId: remoteJid,
              groupName: groupName.split(' (')[0] || groupName,
              senderPhone,
              senderName: pushName,
              timestamp: Date.now(),
              formattedTime: new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }),
              text: text.trim(),
            });
          }

          await handleIncomingWhatsAppText(text.trim(), senderPhone, groupName);
        } catch (msgErr: any) {
          console.error('[WhatsApp Direct] Error processing message:', msgErr?.message);
        }
      }
    });
  } catch (err: any) {
    console.error('[WhatsApp Direct] Start error:', err);
    connectionStatus = 'error';
    lastError = err?.message || 'Failed to start WhatsApp Web client';
  } finally {
    isStarting = false;
  }

  return getBaileysStatus();
}

export async function disconnectBaileys(clearSession = true): Promise<BaileysStatus> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  consecutiveLoggedOutCount = 0;

  if (sock) {
    try {
      if (clearSession) {
        await sock.logout().catch(() => {});
      }
    } catch {}
    destroyCurrentSocket();
  }

  if (clearSession) {
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch {}
    try {
      if (fs.existsSync(CREDS_BACKUP_PATH)) {
        fs.unlinkSync(CREDS_BACKUP_PATH);
      }
    } catch {}
  }

  connectionStatus = 'disconnected';
  currentQrDataUrl = null;
  currentPairingCode = null;
  pendingPairingPhone = null;
  pairingCodeRequestedForSocket = false;
  connectedPhone = null;
  connectedName = null;
  lastError = null;
  cachedGroups = [];

  return getBaileysStatus();
}

export async function requestWhatsAppPairingCode(phoneNumber: string): Promise<BaileysStatus> {
  const normalized = normalizeWhatsAppPairingPhone(phoneNumber);
  if (normalized.length < 10 || normalized.length > 15) {
    lastError = 'Sahi phone number likhein (maslan 03001234567 ya 923001234567).';
    return {
      ...getBaileysStatus(),
      status: 'error',
      lastError,
    };
  }

  // Ensure any in-progress startup clears so we can immediately start pairing
  isStarting = false;
  await startBaileysConnection(true, normalized);

  // Wait up to 10 seconds for the 8-digit pairing code to arrive from WhatsApp servers
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (currentPairingCode || connectionStatus === 'connected' || connectionStatus === 'error') {
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return getBaileysStatus();
}

export function autoResumeBaileysIfAuthenticated(): void {
  if (hasSavedSession()) {
    console.log('[WhatsApp Direct] Saved authenticated session detected, auto-connecting...');
    startBaileysConnection(false).catch((err) => {
      console.warn('[WhatsApp Direct] Auto-resume connection error:', err?.message);
    });
  } else {
    console.log('[WhatsApp Direct] No saved session found. Ready for QR scan.');
  }
}
