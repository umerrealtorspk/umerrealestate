import fs from 'fs';
import path from 'path';
import { processIncomingWhatsAppMessage } from './whatsappWebhookService';

const DATA_DIR = path.join(process.cwd(), 'data');
const GROUP_STORE_PATH = path.join(DATA_DIR, 'whatsapp_group_messages.json');
const BUFFER_TXT_PATH = path.join(DATA_DIR, 'whatsapp_buffer.txt');
const ARCHIVE_TXT_PATH = path.join(DATA_DIR, 'whatsapp_archive.txt');

export interface WhatsAppGroupMessageItem {
  id: string;
  groupId: string; // e.g. "120363420158874728@g.us" or "all_general"
  groupName: string; // e.g. "DHA Lahore Phase 6 Dealers"
  senderPhone: string;
  senderName: string;
  timestamp: number;
  formattedTime: string;
  text: string;
}

let inMemoryGroupMessages: WhatsAppGroupMessageItem[] | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadGroupMessages(): WhatsAppGroupMessageItem[] {
  if (inMemoryGroupMessages !== null) {
    return inMemoryGroupMessages;
  }
  ensureDataDir();
  try {
    if (fs.existsSync(GROUP_STORE_PATH)) {
      const data = fs.readFileSync(GROUP_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        inMemoryGroupMessages = parsed;
        return inMemoryGroupMessages;
      }
    }
  } catch (err) {
    console.warn('[Group Export Store] Could not read group store:', err);
  }

  inMemoryGroupMessages = [];
  // Auto-migrate from buffer and archive on first load if store is empty
  migrateExistingTxtBuffersIntoGroupStore();
  return inMemoryGroupMessages;
}

export function saveGroupMessages(msgs: WhatsAppGroupMessageItem[]): void {
  ensureDataDir();
  inMemoryGroupMessages = msgs;
  try {
    fs.writeFileSync(GROUP_STORE_PATH, JSON.stringify(msgs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Group Export Store] Error writing group store:', err);
  }
}

export function recordGroupMessage(entry: Omit<WhatsAppGroupMessageItem, 'id'>): void {
  const current = loadGroupMessages();
  const cleanText = entry.text.trim();
  if (!cleanText) return;

  // Prevent immediate identical duplicates within same group and sender in last 10 seconds
  const isDuplicate = current.some(
    (m) =>
      m.groupId === entry.groupId &&
      m.senderPhone === entry.senderPhone &&
      m.text === cleanText &&
      Math.abs(m.timestamp - entry.timestamp) < 10000
  );

  if (isDuplicate) return;

  const newItem: WhatsAppGroupMessageItem = {
    id: `gmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    groupId: entry.groupId || 'general_group',
    groupName: entry.groupName || 'WhatsApp Group',
    senderPhone: entry.senderPhone || '',
    senderName: entry.senderName || 'Dealer',
    timestamp: entry.timestamp || Date.now(),
    formattedTime:
      entry.formattedTime ||
      new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }),
    text: cleanText,
  };

  current.push(newItem);
  // Cap at 10,000 messages to prevent excessive file size while keeping extensive history
  if (current.length > 10000) {
    current.splice(0, current.length - 10000);
  }
  saveGroupMessages(current);
}

/**
 * Parses existing whatsapp_buffer.txt and whatsapp_archive.txt into structured group messages
 */
export function migrateExistingTxtBuffersIntoGroupStore(): void {
  const msgs = inMemoryGroupMessages || [];
  const existingTexts = new Set(msgs.map((m) => m.text));

  const parseFileContent = (filePath: string) => {
    if (!fs.existsSync(filePath)) return;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const blocks = raw.split(/--------------------------------------------------/);
      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        // Pattern: [07/11/2026, 8:37:55 pm] GroupName (Sender) (Phone):
        const headerMatch = trimmed.match(
          /^\[(.*?)\]\s+(.*?)(?:\s+\((.*?)\))?(?:\s+\((.*?)\))?:\s*\n([\s\S]*)$/
        );

        let timeStr = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
        let groupName = 'WhatsApp Group';
        let senderName = 'WhatsApp Dealer';
        let senderPhone = '';
        let bodyText = trimmed;

        if (headerMatch) {
          timeStr = headerMatch[1] || timeStr;
          const candidate1 = (headerMatch[2] || '').trim();
          const candidate2 = (headerMatch[3] || '').trim();
          const candidate3 = (headerMatch[4] || '').trim();
          bodyText = (headerMatch[5] || '').trim();

          if (candidate1.toLowerCase().includes('group') || candidate1.toLowerCase().includes('dha') || candidate1.toLowerCase().includes('bahria')) {
            groupName = candidate1;
            senderName = candidate2 || 'WhatsApp Dealer';
            senderPhone = candidate3 || '';
          } else {
            groupName = candidate1 || 'WhatsApp Group';
            senderName = candidate2 || candidate1;
            senderPhone = candidate3 || '';
          }
        }

        if (bodyText && !existingTexts.has(bodyText)) {
          existingTexts.add(bodyText);
          const syntheticGroupId = `grp_${groupName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          msgs.push({
            id: `gmsg_migrated_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            groupId: syntheticGroupId,
            groupName: groupName,
            senderPhone: senderPhone,
            senderName: senderName,
            timestamp: Date.now() - 3600000,
            formattedTime: timeStr,
            text: bodyText,
          });
        }
      }
    } catch (e) {
      console.warn('[Group Export] Error parsing buffer file:', e);
    }
  };

  parseFileContent(BUFFER_TXT_PATH);
  parseFileContent(ARCHIVE_TXT_PATH);

  if (msgs.length > 0) {
    saveGroupMessages(msgs);
    console.log(`[Group Export] Migrated ${msgs.length} historical group messages into store.`);
  }
}

export function getGroupSummary(): {
  groupId: string;
  groupName: string;
  messageCount: number;
  latestMessageTime: string;
  latestTimestamp: number;
}[] {
  const all = loadGroupMessages();
  const map = new Map<
    string,
    {
      groupId: string;
      groupName: string;
      messageCount: number;
      latestMessageTime: string;
      latestTimestamp: number;
    }
  >();

  for (const m of all) {
    const existing = map.get(m.groupId);
    if (!existing) {
      map.set(m.groupId, {
        groupId: m.groupId,
        groupName: m.groupName,
        messageCount: 1,
        latestMessageTime: m.formattedTime,
        latestTimestamp: m.timestamp,
      });
    } else {
      existing.messageCount++;
      if (m.timestamp > existing.latestTimestamp) {
        existing.latestTimestamp = m.timestamp;
        existing.latestMessageTime = m.formattedTime;
      }
      if (m.groupName && m.groupName !== 'WhatsApp Group') {
        existing.groupName = m.groupName;
      }
    }
  }

  const list = Array.from(map.values());
  list.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  return list;
}

/**
 * Generates formatted WhatsApp export text for either all groups or a specific group
 */
export function generateGroupExportTxt(groupId?: string): {
  content: string;
  filename: string;
  count: number;
  groupName: string;
} {
  const all = loadGroupMessages();
  const isAll = !groupId || groupId === 'all';
  const filtered = isAll ? all : all.filter((m) => m.groupId === groupId);

  const groupTitle = isAll
    ? 'All WhatsApp Groups'
    : filtered[0]?.groupName || groupId || 'WhatsApp Group';

  const dateStr = new Date().toISOString().split('T')[0];
  const safeTitle = groupTitle.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const filename = `WhatsApp_Export_${safeTitle}_${dateStr}.txt`;

  const header = `================================================================================\n` +
    `UMER REALTORS LAHORE - WHATSAPP CHAT EXPORT\n` +
    `Group: ${groupTitle}\n` +
    `Total Messages: ${filtered.length}\n` +
    `Export Date: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}\n` +
    `================================================================================\n\n`;

  const body = filtered
    .map((m) => {
      const timeHeader = `[${m.formattedTime}] ${m.senderName}${m.senderPhone ? ` (${m.senderPhone})` : ''} - [${m.groupName}]:`;
      return `${timeHeader}\n${m.text}\n--------------------------------------------------\n`;
    })
    .join('\n');

  return {
    content: header + body,
    filename,
    count: filtered.length,
    groupName: groupTitle,
  };
}

/**
 * Triggers Gemini AI parsing on the chosen group's exported text
 */
export async function parseGroupExportWithGemini(
  groupId?: string,
  customText?: string
): Promise<{
  success: boolean;
  addedCount: number;
  addedRequirementsCount: number;
  skippedDuplicatesCount: number;
  rejectedNoContactCount: number;
  messageCount: number;
  groupName: string;
  error?: string;
}> {
  let textToParse = customText || '';
  let count = 0;
  let groupTitle = 'Custom WhatsApp Chat';

  if (!textToParse) {
    const exportData = generateGroupExportTxt(groupId);
    textToParse = exportData.content;
    count = exportData.count;
    groupTitle = exportData.groupName;
  } else {
    count = (textToParse.match(/--------------------------------------------------/g) || []).length || 1;
  }

  if (!textToParse.trim()) {
    return {
      success: false,
      addedCount: 0,
      addedRequirementsCount: 0,
      skippedDuplicatesCount: 0,
      rejectedNoContactCount: 0,
      messageCount: 0,
      groupName: groupTitle,
      error: 'Is group me export karne ke liye koi message mojud nahi hai.',
    };
  }

  console.log(`[Group Export AI] Phrasing ${count} messages from "${groupTitle}" with Gemini AI...`);

  try {
    const result = await processIncomingWhatsAppMessage(
      textToParse,
      '',
      `Group Export: ${groupTitle}`
    );

    return {
      success: true,
      addedCount: result.addedCount || 0,
      addedRequirementsCount: result.addedRequirementsCount || 0,
      skippedDuplicatesCount: result.skippedDuplicatesCount || 0,
      rejectedNoContactCount: result.rejectedNoContactCount || 0,
      messageCount: count,
      groupName: groupTitle,
    };
  } catch (err: any) {
    console.error('[Group Export AI] Parsing error:', err);
    return {
      success: false,
      addedCount: 0,
      addedRequirementsCount: 0,
      skippedDuplicatesCount: 0,
      rejectedNoContactCount: 0,
      messageCount: count,
      groupName: groupTitle,
      error: err.message || 'Gemini phrasing failed',
    };
  }
}

export function clearGroupMessages(groupId?: string): { success: boolean; count: number } {
  const all = loadGroupMessages();
  if (!groupId || groupId === 'all') {
    const count = all.length;
    saveGroupMessages([]);
    return { success: true, count };
  } else {
    const remaining = all.filter((m) => m.groupId !== groupId);
    const deletedCount = all.length - remaining.length;
    saveGroupMessages(remaining);
    return { success: true, count: deletedCount };
  }
}
