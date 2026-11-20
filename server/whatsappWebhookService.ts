import fs from 'fs';
import path from 'path';
import https from 'https';
import axios from 'axios';
import { Type } from '@google/genai';
import {
  loadInventoryItems,
  saveInventoryItems,
  loadRequirements,
  saveRequirements,
  loadAppConfig,
  saveAppConfig,
} from './inventoryStore';
import {
  executeWithGeminiRouter,
  parseRawChatToProperties,
  parseRawChatToRequirements,
  isValidContactNumber,
  formatPakistaniPhoneNumber,
  formatPakistaniPrice,
} from './geminiRouterService';

const DATA_DIR = path.join(process.cwd(), 'data');
const WHATSAPP_LOGS_PATH = path.join(DATA_DIR, 'whatsapp_logs.json');

export interface WhatsAppMessageLog {
  id: string;
  timestamp: string;
  senderNumber: string;
  senderName: string;
  rawText: string;
  status:
    | 'added'
    | 'requirement_added'
    | 'both_added'
    | 'duplicate_skipped'
    | 'no_contact_discarded'
    | 'no_properties_found'
    | 'error';
  extractedCount: number;
  addedCount?: number;
  addedRequirementsCount?: number;
  addedListings: any[];
  addedRequirements?: any[];
  skippedDuplicatesCount: number;
  rejectedNoContactCount: number;
  error?: string;
}

export interface WhatsAppConfig {
  webhookVerifyToken: string;
  autoSyncToSheets: boolean;
  autoSyncToFirestore: boolean;
  phoneNumberId?: string;
  enabled: boolean;
  greenApiIdInstance?: string;
  greenApiTokenInstance?: string;
}

const DEFAULT_VERIFY_TOKEN = 'umer_realtors_webhook_2026';

export function getWhatsAppConfig(): WhatsAppConfig {
  const cfg = loadAppConfig() || {};
  return {
    webhookVerifyToken: cfg.whatsappWebhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN,
    autoSyncToSheets: cfg.whatsappAutoSyncToSheets ?? true,
    autoSyncToFirestore: cfg.whatsappAutoSyncToFirestore ?? true,
    phoneNumberId: cfg.whatsappPhoneNumberId || '',
    enabled: cfg.whatsappAutomationEnabled ?? true,
    greenApiIdInstance: cfg.greenApiIdInstance || process.env.GREEN_API_ID_INSTANCE || '',
    greenApiTokenInstance: cfg.greenApiTokenInstance || process.env.GREEN_API_TOKEN_INSTANCE || '',
  };
}

export function updateWhatsAppConfig(updates: Partial<WhatsAppConfig>): WhatsAppConfig {
  const existing = loadAppConfig() || {};
  const merged = {
    ...existing,
    whatsappWebhookVerifyToken: updates.webhookVerifyToken ?? existing.whatsappWebhookVerifyToken ?? DEFAULT_VERIFY_TOKEN,
    whatsappAutoSyncToSheets: updates.autoSyncToSheets ?? existing.whatsappAutoSyncToSheets ?? true,
    whatsappAutoSyncToFirestore: updates.autoSyncToFirestore ?? existing.whatsappAutoSyncToFirestore ?? true,
    whatsappPhoneNumberId: updates.phoneNumberId ?? existing.whatsappPhoneNumberId ?? '',
    whatsappAutomationEnabled: updates.enabled ?? existing.whatsappAutomationEnabled ?? true,
    greenApiIdInstance: updates.greenApiIdInstance !== undefined ? updates.greenApiIdInstance : existing.greenApiIdInstance,
    greenApiTokenInstance: updates.greenApiTokenInstance !== undefined ? updates.greenApiTokenInstance : existing.greenApiTokenInstance,
  };
  saveAppConfig(merged);
  return getWhatsAppConfig();
}

export function getWhatsAppLogs(): WhatsAppMessageLog[] {
  try {
    if (fs.existsSync(WHATSAPP_LOGS_PATH)) {
      const data = fs.readFileSync(WHATSAPP_LOGS_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[WhatsApp Store] Could not read logs:', e);
  }
  return [];
}

export function appendWhatsAppLog(logEntry: WhatsAppMessageLog): void {
  try {
    const logs = getWhatsAppLogs();
    logs.unshift(logEntry);
    // Keep the latest 150 incoming logs
    const trimmed = logs.slice(0, 150);
    fs.writeFileSync(WHATSAPP_LOGS_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[WhatsApp Store] Could not write log:', e);
  }
}

/**
 * Normalizes phone numbers from WhatsApp/Meta/Green-API (e.g. 923001234567 -> 0300 1234567)
 */
export function normalizeIncomingPhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const cleaned = rawPhone.replace(/\D/g, '');
  if (cleaned.startsWith('923') && cleaned.length === 12) {
    return `0${cleaned.slice(2, 5)} ${cleaned.slice(5)}`;
  }
  if (cleaned.startsWith('03') && cleaned.length === 11) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`;
  }
  return formatPakistaniPhoneNumber(rawPhone) || rawPhone;
}

/**
 * Extracts raw message text, sender number, and sender name from Green-API, Meta Cloud API, UltraMsg, or direct webhook payloads
 */
export function extractMetaMessagePayload(body: any): { text: string; from: string; senderName: string; messageId: string } | null {
  if (!body) return null;

  // 1. Green-API format (supports 1-to-1 chats and WhatsApp Groups!)
  if (body.typeWebhook === 'incomingMessageReceived' || (body.messageData && body.senderData)) {
    let text = '';
    const mData = body.messageData || {};
    if (mData.textMessageData?.textMessage) {
      text = mData.textMessageData.textMessage;
    } else if (mData.extendedTextMessageData?.text) {
      text = mData.extendedTextMessageData.text;
    } else if (mData.caption) {
      text = mData.caption;
    }

    const senderData = body.senderData || {};
    const chatId = String(senderData.chatId || '');
    const sender = String(senderData.sender || chatId).replace(/@(c|g)\.us$/, '');
    const isGroup = chatId.endsWith('@g.us');
    
    let senderName = senderData.senderName || senderData.senderContactName || 'WhatsApp Contact';
    if (isGroup && senderData.chatName) {
      senderName = `${senderData.chatName} [${senderName}]`;
    }

    if (text && text.trim()) {
      return {
        text: text.trim(),
        from: sender,
        senderName,
        messageId: body.idMessage || `green_${Date.now()}`,
      };
    }
  }

  // 2. Meta WhatsApp Cloud API format:
  // body.entry[0].changes[0].value.messages[0]
  if (body.entry && Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      if (entry.changes && Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const val = change.value;
          if (val && val.messages && Array.isArray(val.messages) && val.messages.length > 0) {
            const msg = val.messages[0];
            const senderNumber = msg.from || '';
            let text = '';
            if (msg.type === 'text' && msg.text && msg.text.body) {
              text = msg.text.body;
            } else if (msg.type === 'caption' && msg.caption) {
              text = msg.caption;
            } else if (msg.caption) {
              text = msg.caption;
            }

            let senderName = 'WhatsApp Dealer';
            if (val.contacts && Array.isArray(val.contacts) && val.contacts[0]?.profile?.name) {
              senderName = val.contacts[0].profile.name;
            }

            if (text && text.trim()) {
              return {
                text: text.trim(),
                from: senderNumber,
                senderName,
                messageId: msg.id || `meta_${Date.now()}`,
              };
            }
          }
        }
      }
    }
  }

  // 3. UltraMsg format
  if (body.event_type === 'message_received' && body.data) {
    const d = body.data;
    const text = d.body || '';
    const from = String(d.from || '').replace(/@(c|g)\.us$/, '');
    const senderName = d.pushname || 'WhatsApp Contact';
    if (text && text.trim()) {
      return {
        text: text.trim(),
        from,
        senderName,
        messageId: d.id || `ultramsg_${Date.now()}`,
      };
    }
  }

  // 4. Simplified/Direct webhook payload (for Make.com, Zapier, direct curl, or simulator):
  if (body.message || body.text || body.Body) {
    const text = body.message || body.text || body.Body;
    const from = body.from || body.From || body.sender || body.senderNumber || '';
    const senderName = body.senderName || body.name || body.ProfileName || 'WhatsApp Contact';
    return {
      text: String(text).trim(),
      from: String(from).trim(),
      senderName: String(senderName).trim(),
      messageId: body.messageId || body.id || `direct_${Date.now()}`,
    };
  }

  return null;
}

/**
 * Core Automation: Processes an incoming WhatsApp real estate message,
 * runs the AI Phraser, checks contact numbers, prevents duplicates,
 * and saves new properties automatically to inventory.
 */
export async function processIncomingWhatsAppMessage(
  rawText: string,
  rawSender: string,
  rawSenderName: string
): Promise<{
  success: boolean;
  status: WhatsAppMessageLog['status'];
  addedCount: number;
  addedRequirementsCount: number;
  skippedDuplicatesCount: number;
  rejectedNoContactCount: number;
  addedListings: any[];
  addedRequirements: any[];
  modelUsed?: string;
  error?: string;
}> {
  const normalizedSenderPhone = normalizeIncomingPhone(rawSender);
  const senderContactValid = isValidContactNumber(normalizedSenderPhone);
  const logId = `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  try {
    let rawListings: any[] = [];
    let rawRequirements: any[] = [];
    let modelUsed: string | undefined = undefined;

    // 1. Run AI Phraser via Gemini Router
    const systemInstruction = `You are an expert Pakistani Real Estate (Lahore) AI Data Extraction & Phrasing Engine.
Your job is to read raw WhatsApp dealer messages (single messages, multi-line property posts, or hourly .txt batch logs) and extract:
1) Genuine property LISTINGS available FOR SALE into "listings".
2) Buyer or dealer DEMANDS / REQUIREMENTS / WANTED / CHAHIYE into "requirements".

CRITICAL CATEGORIZATION RULE:
- "listings" (FOR SALE / AVAILABLE): e.g. "Ph 6 C-318 1K 4.35 direct deal", "Bahria Orchard 5 Marla house for sale 1.20 crore", "Available 10 Marla plot".
- "requirements" (BUYER WANTED / CHAHIYE / DEMAND): e.g. "Required 1 Kanal DHA Phase 6 Block C budget 4.20 crore", "Chahiye: 5 Marla house Bahria Orchard cash buyer", "Need 10M Lake City urgent client", "Looking for commercial plaza".
DO NOT put buyer requirements into "listings"! Always separate them cleanly into "requirements".

HOW TO READ THE INPUT:
1. Input may contain multiple message blocks separated by "----". Each block often starts with a header like:
   "[05/11/2026, 6:10:00 pm] Group Name (0300 8455667):"
   IMPORTANT: If a property or requirement inside that block does NOT have its own phone number on the line, USE the phone number from that block's header (e.g. "0300 8455667")${normalizedSenderPhone ? ` or fallback sender phone "${normalizedSenderPhone}"` : ''}!
2. ONLY discard an item if NEITHER the item text NOR the message block header NOR the sender has a valid Pakistani phone number (03xx / +923xx).
3. Ignore casual greetings/chat ("Salam", "Ok", "Thanks", "Voice note", "Photo") that do not describe a property or requirement.

PAKISTANI REAL ESTATE SHORTHAND & NORMALIZATION:
- Society: "DHA" / "Defence" -> "DHA Lahore", "Bahria" / "BT" -> "Bahria Town", "Orchard" / "BO" -> "Bahria Orchard", "Lake City" -> "Lake City", "Park View" -> "Park View City", "Johar" / "JT" -> "Johar Town", "State Life" -> "State Life", "LDA" -> "LDA City", "Wapda" -> "Wapda Town", "Valencia" -> "Valencia Town".
- Block: Clean format like "Phase 6 - Block C", "Phase 8 - Prism Z", "Sector C", "Sector E", "Block J".
- Category: "Plot", "House", or "Commercial".
- Size:
  "1K" / "1 Kanal" / "20M" -> marlaSize: 20, sizeLabel: "1 Kanal"
  "2K" / "2 Kanal" / "40M" -> marlaSize: 40, sizeLabel: "2 Kanal"
  "10M" / "10 Marla" -> marlaSize: 10, sizeLabel: "10 Marla"
  "8M" / "8 Marla" -> marlaSize: 8, sizeLabel: "8 Marla"
  "5M" / "5 Marla" -> marlaSize: 5, sizeLabel: "5 Marla"
  "3M" / "3 Marla" -> marlaSize: 3, sizeLabel: "3 Marla"
- Price / Budget:
  "4.35 Cr" -> 435 Lakhs, "85 Lac" -> 85 Lakhs. If missing, set 0.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        listings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              unitNumber: { type: Type.STRING },
              society: { type: Type.STRING },
              block: { type: Type.STRING },
              category: { type: Type.STRING, enum: ['Plot', 'House', 'Commercial'] },
              marlaSize: { type: Type.NUMBER },
              sizeLabel: { type: Type.STRING },
              priceInLakhs: { type: Type.NUMBER },
              formattedPrice: { type: Type.STRING },
              features: { type: Type.ARRAY, items: { type: Type.STRING } },
              dealerName: { type: Type.STRING },
              contactNumber: { type: Type.STRING },
            },
            required: ['unitNumber', 'society', 'block', 'category', 'marlaSize', 'sizeLabel', 'priceInLakhs', 'formattedPrice', 'contactNumber'],
          },
        },
        requirements: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              society: { type: Type.STRING },
              block: { type: Type.STRING },
              category: { type: Type.STRING, enum: ['Plot', 'House', 'Commercial'] },
              marlaSize: { type: Type.NUMBER },
              sizeLabel: { type: Type.STRING },
              budgetInLakhs: { type: Type.NUMBER },
              formattedBudget: { type: Type.STRING },
              clientType: { type: Type.STRING },
              features: { type: Type.ARRAY, items: { type: Type.STRING } },
              dealerName: { type: Type.STRING },
              contactNumber: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
            required: ['society', 'block', 'category', 'marlaSize', 'sizeLabel', 'contactNumber'],
          },
        },
      },
      required: ['listings', 'requirements'],
    };

    const routerResult = await executeWithGeminiRouter({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Extract and phrase all Pakistani real estate listings and dealer buyer requirements from this WhatsApp text:\nDefault Sender: ${rawSenderName} (${normalizedSenderPhone})\n\n${rawText}`,
            },
          ],
        },
      ],
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.1,
    });

    if (routerResult.success && routerResult.text) {
      try {
        const cleanJson = routerResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed.listings) && parsed.listings.length > 0) {
          rawListings = parsed.listings;
        }
        if (Array.isArray(parsed.requirements) && parsed.requirements.length > 0) {
          rawRequirements = parsed.requirements;
        }
        if (rawListings.length > 0 || rawRequirements.length > 0) {
          modelUsed = routerResult.modelUsed;
        }
      } catch (e) {
        console.warn('[WhatsApp Webhook] Gemini JSON parse fallback');
      }
    }

    // 2. Deterministic Regex Fallbacks
    if (rawListings.length === 0) {
      const fallbackList = parseRawChatToProperties(rawText, 'All Lahore', normalizedSenderPhone || '-');
      if (fallbackList.length > 0) {
        rawListings = fallbackList;
        if (!modelUsed) modelUsed = 'deterministic_regex_engine';
      }
    }

    if (rawRequirements.length === 0) {
      const fallbackReqs = parseRawChatToRequirements(rawText, 'All Lahore', normalizedSenderPhone || '-');
      if (fallbackReqs.length > 0) {
        rawRequirements = fallbackReqs;
        if (!modelUsed) modelUsed = 'deterministic_regex_engine';
      }
    }

    if (rawListings.length === 0 && rawRequirements.length === 0) {
      const logEntry: WhatsAppMessageLog = {
        id: logId,
        timestamp: nowIso,
        senderNumber: normalizedSenderPhone || 'Unknown',
        senderName: rawSenderName,
        rawText,
        status: 'no_properties_found',
        extractedCount: 0,
        addedListings: [],
        addedRequirements: [],
        skippedDuplicatesCount: 0,
        rejectedNoContactCount: 0,
      };
      appendWhatsAppLog(logEntry);
      return {
        success: true,
        status: 'no_properties_found',
        addedCount: 0,
        addedRequirementsCount: 0,
        skippedDuplicatesCount: 0,
        rejectedNoContactCount: 0,
        addedListings: [],
        addedRequirements: [],
      };
    }

    // 3. Strict Filter: Contact Number Verification for Listings
    let rejectedNoContactCount = 0;
    const candidatesWithContact: any[] = [];

    for (const item of rawListings) {
      let contact = item.contactNumber;
      if (!isValidContactNumber(contact)) {
        if (senderContactValid) {
          contact = normalizedSenderPhone;
        }
      }

      if (isValidContactNumber(contact)) {
        candidatesWithContact.push({
          ...item,
          contactNumber: formatPakistaniPhoneNumber(contact),
          dealerName: item.dealerName && item.dealerName !== '-' ? item.dealerName : (rawSenderName || 'WhatsApp Dealer'),
        });
      } else {
        rejectedNoContactCount++;
      }
    }

    // Strict Filter: Contact Number Verification for Requirements
    const reqCandidatesWithContact: any[] = [];
    for (const req of rawRequirements) {
      let contact = req.contactNumber;
      if (!isValidContactNumber(contact)) {
        if (senderContactValid) {
          contact = normalizedSenderPhone;
        }
      }

      if (isValidContactNumber(contact)) {
        reqCandidatesWithContact.push({
          ...req,
          contactNumber: formatPakistaniPhoneNumber(contact),
          dealerName: req.dealerName && req.dealerName !== '-' ? req.dealerName : (rawSenderName || 'WhatsApp Dealer'),
        });
      } else {
        rejectedNoContactCount++;
      }
    }

    if (candidatesWithContact.length === 0 && reqCandidatesWithContact.length === 0) {
      const logEntry: WhatsAppMessageLog = {
        id: logId,
        timestamp: nowIso,
        senderNumber: normalizedSenderPhone || 'Unknown',
        senderName: rawSenderName,
        rawText,
        status: 'no_contact_discarded',
        extractedCount: rawListings.length + rawRequirements.length,
        addedListings: [],
        addedRequirements: [],
        skippedDuplicatesCount: 0,
        rejectedNoContactCount,
      };
      appendWhatsAppLog(logEntry);
      return {
        success: true,
        status: 'no_contact_discarded',
        addedCount: 0,
        addedRequirementsCount: 0,
        skippedDuplicatesCount: 0,
        rejectedNoContactCount,
        addedListings: [],
        addedRequirements: [],
      };
    }

    // 4. Deduplication & Saving for Listings
    const currentInventory = loadInventoryItems();
    const existingKeys = new Set(
      currentInventory.map(item =>
        `${(item.society || '').toLowerCase().trim()}_${(item.block || '').toLowerCase().trim()}_${(item.unitNumber || '').toLowerCase().trim()}`
      )
    );

    const newListingsToAdd: any[] = [];
    let skippedDuplicatesCount = 0;

    for (let i = 0; i < candidatesWithContact.length; i++) {
      const item = candidatesWithContact[i];
      const soc = item.society && item.society !== 'All Lahore' ? String(item.society).trim() : 'Lahore General';
      const blk = item.block && item.block !== '-' ? String(item.block).trim() : 'General';
      const unit = item.unitNumber && String(item.unitNumber).trim() !== '' ? String(item.unitNumber).trim() : 'General';

      let marlaSize = Number(item.marlaSize) || 0;
      let sizeLabel = String(item.sizeLabel || '').trim();
      if (!marlaSize && sizeLabel) {
        if (/2\s*kanal/i.test(sizeLabel)) marlaSize = 40;
        else if (/1\s*kanal/i.test(sizeLabel)) marlaSize = 20;
        else {
          const m = sizeLabel.match(/(\d+(?:\.\d+)?)/);
          if (m) marlaSize = parseFloat(m[1]);
        }
      }
      if (!marlaSize) marlaSize = 10;
      if (!sizeLabel) {
        sizeLabel = marlaSize >= 20 ? `${marlaSize / 20} Kanal` : `${marlaSize} Marla`;
      }

      let priceInLakhs = Number(item.priceInLakhs) || 0;
      let formattedPrice = String(item.formattedPrice || '').trim();
      if (!priceInLakhs && formattedPrice) {
        const crM = formattedPrice.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore)/i);
        const lacM = formattedPrice.match(/(\d+(?:\.\d+)?)\s*(?:lac|lakh)/i);
        if (crM) priceInLakhs = parseFloat(crM[1]) * 100;
        else if (lacM) priceInLakhs = parseFloat(lacM[1]);
      }
      if (!formattedPrice || formattedPrice === '0') {
        if (priceInLakhs >= 100) {
          formattedPrice = `${(priceInLakhs / 100).toFixed(2).replace(/\.00$/, '')} Crore`;
        } else if (priceInLakhs > 0) {
          formattedPrice = `${priceInLakhs} Lakh`;
        } else {
          formattedPrice = 'Demand on Call';
        }
      }

      const key = `${soc.toLowerCase().trim()}_${blk.toLowerCase().trim()}_${unit.toLowerCase().trim()}`;

      if (unit !== '-' && unit !== 'General' && existingKeys.has(key)) {
        skippedDuplicatesCount++;
      } else {
        existingKeys.add(key);
        newListingsToAdd.push({
          id: `wa_auto_${Date.now()}_${i}`,
          society: soc,
          block: blk,
          unitNumber: unit,
          category: item.category === 'House' || item.category === 'Commercial' ? item.category : 'Plot',
          marlaSize,
          sizeLabel,
          priceInLakhs,
          formattedPrice,
          features: Array.isArray(item.features) ? item.features : [],
          dealerName: item.dealerName || rawSenderName || 'WhatsApp Dealer',
          contactNumber: item.contactNumber,
          notes: item.notes || `Auto-imported from WhatsApp: ${rawText.slice(0, 100)}`,
          source: `WhatsApp Live: ${normalizedSenderPhone || rawSenderName}`,
          dateAdded: nowIso.split('T')[0],
        });
      }
    }

    if (newListingsToAdd.length > 0) {
      const updatedInventory = [...newListingsToAdd, ...currentInventory];
      saveInventoryItems(updatedInventory);

      // Auto-sync to Google Sheets (Master Inventory)
      const appCfg = loadAppConfig() || {};
      const targetScriptUrl =
        (appCfg.scriptUrl && appCfg.scriptUrl.trim()) ||
        'https://script.google.com/macros/s/AKfycbxT3nabu9VaYjlCY1A4ziNWyuZqXrduYTseyuMmlmFjwTY8bCgh3v04KsHz-NF8c0AO/exec';
      if (targetScriptUrl) {
        try {
          axios
            .post(
              targetScriptUrl,
              {
                action: 'batch-append',
                listings: newListingsToAdd,
              },
              {
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                timeout: 45000,
                maxRedirects: 10,
                httpsAgent: new https.Agent({ keepAlive: false, family: 4 }),
              }
            )
            .then(() => {
              console.log(`[WhatsApp Auto-Sync] Synced ${newListingsToAdd.length} listing(s) to Google Sheets!`);
            })
            .catch((err) => {
              console.warn('[WhatsApp Auto-Sync to Sheets warning]:', err.message);
            });
        } catch {}
      }
    }

    // 5. Deduplication & Saving for Dealer Requirements
    const currentRequirements = loadRequirements();
    const existingReqKeys = new Set(
      currentRequirements.map(req =>
        `${(req.contactNumber || '').replace(/\D/g, '')}_${(req.society || '').toLowerCase().trim()}_${req.marlaSize || 0}`
      )
    );

    const newRequirementsToAdd: any[] = [];
    for (let j = 0; j < reqCandidatesWithContact.length; j++) {
      const req = reqCandidatesWithContact[j];
      const soc = req.society && req.society !== 'All Lahore' ? String(req.society).trim() : 'DHA Lahore';
      const blk = req.block && req.block !== '-' ? String(req.block).trim() : 'Any Block';

      let marlaSize = Number(req.marlaSize) || 0;
      let sizeLabel = String(req.sizeLabel || '').trim();
      if (!marlaSize && sizeLabel) {
        if (/2\s*kanal/i.test(sizeLabel)) marlaSize = 40;
        else if (/1\s*kanal/i.test(sizeLabel)) marlaSize = 20;
        else {
          const m = sizeLabel.match(/(\d+(?:\.\d+)?)/);
          if (m) marlaSize = parseFloat(m[1]);
        }
      }
      if (!marlaSize) marlaSize = 10;
      if (!sizeLabel) {
        sizeLabel = marlaSize >= 20 ? `${marlaSize / 20} Kanal` : `${marlaSize} Marla`;
      }

      let budgetInLakhs = Number(req.budgetInLakhs) || 0;
      let formattedBudget = String(req.formattedBudget || '').trim();
      if (!budgetInLakhs && formattedBudget) {
        const crM = formattedBudget.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore)/i);
        const lacM = formattedBudget.match(/(\d+(?:\.\d+)?)\s*(?:lac|lakh)/i);
        if (crM) budgetInLakhs = parseFloat(crM[1]) * 100;
        else if (lacM) budgetInLakhs = parseFloat(lacM[1]);
      }
      if (!formattedBudget || formattedBudget === '0') {
        formattedBudget = budgetInLakhs > 0 ? formatPakistaniPrice(budgetInLakhs) : 'Budget on Call';
      }

      const reqKey = `${(req.contactNumber || '').replace(/\D/g, '')}_${soc.toLowerCase().trim()}_${marlaSize}`;
      if (existingReqKeys.has(reqKey)) {
        skippedDuplicatesCount++;
      } else {
        existingReqKeys.add(reqKey);
        newRequirementsToAdd.push({
          id: `req_auto_${Date.now()}_${j}`,
          society: soc,
          block: blk,
          category: req.category === 'House' || req.category === 'Commercial' ? req.category : 'Plot',
          marlaSize,
          sizeLabel,
          budgetInLakhs,
          formattedBudget,
          clientType: req.clientType || 'Cash Buyer',
          features: Array.isArray(req.features) ? req.features : [],
          dealerName: req.dealerName || rawSenderName || 'WhatsApp Dealer',
          contactNumber: req.contactNumber,
          notes: req.notes || `WhatsApp Requirement: ${rawText.slice(0, 150)}`,
          rawText: rawText.slice(0, 300),
          source: `WhatsApp Live: ${normalizedSenderPhone || rawSenderName}`,
          dateAdded: nowIso.split('T')[0],
          status: 'active',
        });
      }
    }

    if (newRequirementsToAdd.length > 0) {
      const updatedRequirements = [...newRequirementsToAdd, ...currentRequirements];
      saveRequirements(updatedRequirements);
      console.log(`[WhatsApp Webhook] Saved ${newRequirementsToAdd.length} new dealer requirement(s) to requirements.json!`);
    }

    let status: WhatsAppMessageLog['status'] = 'no_properties_found';
    if (newListingsToAdd.length > 0 && newRequirementsToAdd.length > 0) {
      status = 'both_added';
    } else if (newListingsToAdd.length > 0) {
      status = 'added';
    } else if (newRequirementsToAdd.length > 0) {
      status = 'requirement_added';
    } else if (skippedDuplicatesCount > 0) {
      status = 'duplicate_skipped';
    }

    const logEntry: WhatsAppMessageLog = {
      id: logId,
      timestamp: nowIso,
      senderNumber: normalizedSenderPhone || 'Unknown',
      senderName: rawSenderName,
      rawText,
      status,
      extractedCount: rawListings.length + rawRequirements.length,
      addedCount: newListingsToAdd.length,
      addedRequirementsCount: newRequirementsToAdd.length,
      addedListings: newListingsToAdd,
      addedRequirements: newRequirementsToAdd,
      skippedDuplicatesCount,
      rejectedNoContactCount,
    };
    appendWhatsAppLog(logEntry);

    return {
      success: true,
      status,
      addedCount: newListingsToAdd.length,
      addedRequirementsCount: newRequirementsToAdd.length,
      skippedDuplicatesCount,
      rejectedNoContactCount,
      addedListings: newListingsToAdd,
      addedRequirements: newRequirementsToAdd,
      modelUsed,
    };
  } catch (err: any) {
    console.error('[WhatsApp Message Processing Error]:', err);
    const logEntry: WhatsAppMessageLog = {
      id: logId,
      timestamp: nowIso,
      senderNumber: normalizedSenderPhone || 'Unknown',
      senderName: rawSenderName,
      rawText,
      status: 'error',
      extractedCount: 0,
      addedListings: [],
      skippedDuplicatesCount: 0,
      rejectedNoContactCount: 0,
      error: err.message,
    };
    appendWhatsAppLog(logEntry);

    return {
      success: false,
      status: 'error',
      addedCount: 0,
      addedRequirementsCount: 0,
      skippedDuplicatesCount: 0,
      rejectedNoContactCount: 0,
      addedListings: [],
      addedRequirements: [],
      error: err.message,
    };
  }
}

/**
 * Checks the connection state of a Green-API WhatsApp instance
 */
export async function getGreenApiInstanceStatus(idInstance: string, apiToken: string): Promise<{
  stateInstance: 'authorized' | 'notAuthorized' | 'blocked' | 'sleepMode' | 'starting' | 'error';
  raw?: any;
  error?: string;
}> {
  if (!idInstance || !apiToken) {
    return { stateInstance: 'notAuthorized', error: 'Missing idInstance or apiToken' };
  }

  try {
    const url = `https://api.green-api.com/waInstance${idInstance.trim()}/getStateInstance/${apiToken.trim()}`;
    const res = await axios.get(url, { timeout: 8000 });
    return {
      stateInstance: res.data?.stateInstance || 'notAuthorized',
      raw: res.data,
    };
  } catch (err: any) {
    return {
      stateInstance: 'error',
      error: err.response?.data?.message || err.message,
    };
  }
}

/**
 * Fetches QR code from Green-API instance for easy scanning in CRM UI
 */
export async function getGreenApiQrCode(idInstance: string, apiToken: string): Promise<{
  type: string;
  message: string;
  error?: string;
}> {
  try {
    const url = `https://api.green-api.com/waInstance${idInstance.trim()}/qr/${apiToken.trim()}`;
    const res = await axios.get(url, { timeout: 8000 });
    return {
      type: res.data?.type || 'qrCode',
      message: res.data?.message || '',
    };
  } catch (err: any) {
    return {
      type: 'error',
      message: '',
      error: err.response?.data?.message || err.message,
    };
  }
}

/**
 * Polls Green-API for incoming notifications, processes them via Gemini AI,
 * saves new properties, and deletes receipts from queue.
 */
export async function syncGreenApiNotifications(
  idInstance: string,
  apiToken: string,
  maxFetch = 15
): Promise<{
  success: boolean;
  totalFetched: number;
  addedCount: number;
  skippedDuplicatesCount: number;
  rejectedNoContactCount: number;
  details: any[];
  error?: string;
}> {
  if (!idInstance || !apiToken) {
    return {
      success: false,
      totalFetched: 0,
      addedCount: 0,
      skippedDuplicatesCount: 0,
      rejectedNoContactCount: 0,
      details: [],
      error: 'Green-API Instance ID aur API Token required hain.',
    };
  }

  const cleanId = idInstance.trim();
  const cleanToken = apiToken.trim();

  let totalFetched = 0;
  let totalAdded = 0;
  let totalDuplicates = 0;
  let totalNoContact = 0;
  const details: any[] = [];

  try {
    for (let i = 0; i < maxFetch; i++) {
      const receiveUrl = `https://api.green-api.com/waInstance${cleanId}/receiveNotification/${cleanToken}`;
      const res = await axios.get(receiveUrl, { timeout: 6000 });
      const notif = res.data;

      // When queue is empty, Green-API returns null or empty object
      if (!notif || !notif.receiptId) {
        break;
      }

      totalFetched++;
      const receiptId = notif.receiptId;
      const body = notif.body;

      if (body) {
        const extracted = extractMetaMessagePayload(body);
        if (extracted && extracted.text) {
          const processResult = await processIncomingWhatsAppMessage(
            extracted.text,
            extracted.from,
            extracted.senderName
          );

          totalAdded += processResult.addedCount;
          totalDuplicates += processResult.skippedDuplicatesCount;
          totalNoContact += processResult.rejectedNoContactCount;

          details.push({
            receiptId,
            sender: extracted.from,
            senderName: extracted.senderName,
            status: processResult.status,
            addedCount: processResult.addedCount,
            textSnippet: extracted.text.slice(0, 80),
          });
        }
      }

      // Delete notification from Green-API queue so it won't be reprocessed
      try {
        const deleteUrl = `https://api.green-api.com/waInstance${cleanId}/deleteNotification/${cleanToken}/${receiptId}`;
        await axios.delete(deleteUrl, { timeout: 5000 });
      } catch (delErr) {
        console.warn(`[Green-API] Could not delete receipt ${receiptId}:`, delErr);
      }
    }

    return {
      success: true,
      totalFetched,
      addedCount: totalAdded,
      skippedDuplicatesCount: totalDuplicates,
      rejectedNoContactCount: totalNoContact,
      details,
    };
  } catch (err: any) {
    console.error('[Green-API Sync Error]:', err);
    return {
      success: false,
      totalFetched,
      addedCount: totalAdded,
      skippedDuplicatesCount: totalDuplicates,
      rejectedNoContactCount: totalNoContact,
      details,
      error: err.response?.data?.message || err.message,
    };
  }
}

// ---------------------------------------------------------
// HOURLY .TXT BUFFER & AUTO-GEMINI PHRASER SCHEDULER
// ---------------------------------------------------------
const BUFFER_TXT_PATH = path.join(DATA_DIR, 'whatsapp_buffer.txt');
const ARCHIVE_TXT_PATH = path.join(DATA_DIR, 'whatsapp_archive.txt');
const ONE_HOUR_MS = 60 * 60 * 1000;

let nextBatchRunAt: number = Date.now() + ONE_HOUR_MS;
let lastBatchRunAt: number | null = null;
let lastBatchResult: any = null;
let isProcessingTxtBuffer = false;
let hourlySchedulerStarted = false;

export function getBatchProcessingMode(): 'hourly_txt' | 'instant' {
  const cfg = loadAppConfig() || {};
  return cfg.whatsappBatchMode === 'instant' ? 'instant' : 'hourly_txt';
}

export function setBatchProcessingMode(mode: 'hourly_txt' | 'instant'): 'hourly_txt' | 'instant' {
  const existing = loadAppConfig() || {};
  saveAppConfig({
    ...existing,
    whatsappBatchMode: mode,
  });
  return mode;
}

export function appendMessageToTxtBuffer(
  rawText: string,
  rawSender: string,
  rawSenderName: string
): { messageCount: number; byteSize: number } {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const phone = normalizeIncomingPhone(rawSender) || rawSender || 'Unknown';
  const timestamp = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  const entry = `[${timestamp}] ${rawSenderName} (${phone}):\n${rawText.trim()}\n--------------------------------------------------\n`;

  fs.appendFileSync(BUFFER_TXT_PATH, entry, 'utf-8');
  const content = fs.readFileSync(BUFFER_TXT_PATH, 'utf-8');
  const messageCount = (content.match(/--------------------------------------------------/g) || []).length;
  return {
    messageCount,
    byteSize: Buffer.byteLength(content, 'utf-8'),
  };
}

export function getTxtBufferStatus() {
  let content = '';
  try {
    if (fs.existsSync(BUFFER_TXT_PATH)) {
      content = fs.readFileSync(BUFFER_TXT_PATH, 'utf-8');
    }
  } catch {}

  const messageCount = (content.match(/--------------------------------------------------/g) || []).length;
  const byteSize = Buffer.byteLength(content, 'utf-8');

  return {
    mode: getBatchProcessingMode(),
    messageCount,
    byteSize,
    previewText: content.slice(-15000), // Latest 15KB preview
    fullText: content,
    nextBatchRunAt,
    lastBatchRunAt,
    lastBatchResult,
    isProcessing: isProcessingTxtBuffer,
  };
}

export async function processTxtBufferWithGemini(): Promise<{
  success: boolean;
  empty?: boolean;
  addedCount: number;
  addedRequirementsCount?: number;
  skippedDuplicatesCount: number;
  rejectedNoContactCount: number;
  messageCount: number;
  error?: string;
}> {
  if (isProcessingTxtBuffer) {
    return {
      success: false,
      addedCount: 0,
      skippedDuplicatesCount: 0,
      rejectedNoContactCount: 0,
      messageCount: 0,
      error: 'Batch processing already in progress.',
    };
  }

  isProcessingTxtBuffer = true;
  try {
    if (!fs.existsSync(BUFFER_TXT_PATH)) {
      lastBatchRunAt = Date.now();
      nextBatchRunAt = Date.now() + ONE_HOUR_MS;
      return {
        success: true,
        empty: true,
        addedCount: 0,
        skippedDuplicatesCount: 0,
        rejectedNoContactCount: 0,
        messageCount: 0,
      };
    }

    const content = fs.readFileSync(BUFFER_TXT_PATH, 'utf-8').trim();
    if (!content) {
      lastBatchRunAt = Date.now();
      nextBatchRunAt = Date.now() + ONE_HOUR_MS;
      return {
        success: true,
        empty: true,
        addedCount: 0,
        skippedDuplicatesCount: 0,
        rejectedNoContactCount: 0,
        messageCount: 0,
      };
    }

    const messageCount = (content.match(/--------------------------------------------------/g) || []).length || 1;
    console.log(`[Hourly .txt Batch] Sending ${messageCount} buffered WhatsApp messages (${content.length} chars) to Gemini AI...`);

    const result = await processIncomingWhatsAppMessage(
      content,
      '',
      `Hourly .txt Batch (${messageCount} msgs)`
    );

    // Archive processed .txt content and clear buffer
    const archiveHeader = `\n=== PROCESSED AT ${new Date().toISOString()} (Added Listings: ${result.addedCount}, Added Reqs: ${result.addedRequirementsCount}, Duplicates: ${result.skippedDuplicatesCount}, NoContact: ${result.rejectedNoContactCount}) ===\n`;
    fs.appendFileSync(ARCHIVE_TXT_PATH, archiveHeader + content + '\n', 'utf-8');
    fs.writeFileSync(BUFFER_TXT_PATH, '', 'utf-8');

    lastBatchRunAt = Date.now();
    nextBatchRunAt = Date.now() + ONE_HOUR_MS;
    lastBatchResult = {
      timestamp: new Date().toISOString(),
      messageCount,
      addedCount: result.addedCount,
      addedRequirementsCount: result.addedRequirementsCount,
      skippedDuplicatesCount: result.skippedDuplicatesCount,
      rejectedNoContactCount: result.rejectedNoContactCount,
      modelUsed: result.modelUsed,
    };

    console.log(`[Hourly .txt Batch] Completed! Listings Added: ${result.addedCount}, Requirements Added: ${result.addedRequirementsCount}, Skipped Duplicates: ${result.skippedDuplicatesCount}, No Contact Dropped: ${result.rejectedNoContactCount}`);

    return {
      success: true,
      addedCount: result.addedCount,
      addedRequirementsCount: result.addedRequirementsCount,
      skippedDuplicatesCount: result.skippedDuplicatesCount,
      rejectedNoContactCount: result.rejectedNoContactCount,
      messageCount,
    };
  } catch (err: any) {
    console.error('[Hourly .txt Batch Error]:', err);
    return {
      success: false,
      addedCount: 0,
      skippedDuplicatesCount: 0,
      rejectedNoContactCount: 0,
      messageCount: 0,
      error: err.message,
    };
  } finally {
    isProcessingTxtBuffer = false;
  }
}

export async function handleIncomingWhatsAppText(
  rawText: string,
  rawSender: string,
  rawSenderName: string
) {
  const mode = getBatchProcessingMode();
  if (mode === 'hourly_txt') {
    const buf = appendMessageToTxtBuffer(rawText, rawSender, rawSenderName);
    console.log(`[WhatsApp .txt Buffer] Saved message #${buf.messageCount} from ${rawSenderName} to whatsapp_buffer.txt`);
    return { buffered: true, ...buf };
  }
  return processIncomingWhatsAppMessage(rawText, rawSender, rawSenderName);
}

export function startHourlyTxtBatchScheduler(): void {
  if (hourlySchedulerStarted) return;
  hourlySchedulerStarted = true;
  nextBatchRunAt = Date.now() + ONE_HOUR_MS;
  console.log('⏰ [WhatsApp Hourly .txt Scheduler] Active — will auto-process whatsapp_buffer.txt with Gemini AI every 1 hour.');

  setInterval(() => {
    processTxtBufferWithGemini().catch((err) => {
      console.error('[WhatsApp Hourly .txt Scheduler] Error:', err);
    });
  }, ONE_HOUR_MS);
}

