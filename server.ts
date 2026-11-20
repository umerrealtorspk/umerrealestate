import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import https from 'https';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import {
  loadInventoryItems,
  saveInventoryItems,
  loadRequirements,
  saveRequirements,
  loadAppConfig,
  saveAppConfig,
} from './server/inventoryStore';
import {
  processAiChatAssistant,
  parseRawChatToProperties,
  executeWithGeminiRouter,
  isValidContactNumber,
  formatPakistaniPhoneNumber,
} from './server/geminiRouterService';
import {
  getWhatsAppConfig,
  updateWhatsAppConfig,
  getWhatsAppLogs,
  extractMetaMessagePayload,
  processIncomingWhatsAppMessage,
  getGreenApiInstanceStatus,
  getGreenApiQrCode,
  syncGreenApiNotifications,
  getTxtBufferStatus,
  processTxtBufferWithGemini,
  setBatchProcessingMode,
  startHourlyTxtBatchScheduler,
} from './server/whatsappWebhookService';
import {
  startBaileysConnection,
  disconnectBaileys,
  getBaileysStatus,
  refreshBaileysGroups,
  updateBaileysSettings,
  autoResumeBaileysIfAuthenticated,
  requestWhatsAppPairingCode,
} from './server/whatsappBaileysService';
import {
  getGroupSummary,
  generateGroupExportTxt,
  parseGroupExportWithGemini,
  clearGroupMessages,
  loadGroupMessages,
} from './server/whatsappGroupExportService';

dotenv.config();

const app = express();

// Middleware
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static directory for generated posters or assets
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ---------------------------------------------------------
// 1. HEALTH CHECK & STATUS ROUTE
// ---------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'Umer Realtors Automation Backend is Active',
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------
// 2. CONFIG STORAGE API (Google Sheets & Drive sync settings)
// ---------------------------------------------------------
app.get('/api/config', (_req: Request, res: Response) => {
  const config = loadAppConfig();
  res.json({ success: true, config });
});

app.post('/api/config', (req: Request, res: Response) => {
  const existing = loadAppConfig() || {};
  const merged = { ...existing, ...req.body };
  saveAppConfig(merged);
  res.json({ success: true, config: merged });
});

// ---------------------------------------------------------
// 3. INVENTORY STORAGE API (High-Speed Local Server Backup)
// ---------------------------------------------------------
app.get('/api/inventory', (_req: Request, res: Response) => {
  try {
    const items = loadInventoryItems();
    res.json({
      inventory: items,
      items,
      count: items.length,
      success: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, inventory: [], items: [] });
  }
});

app.post('/api/inventory', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    let items = loadInventoryItems();

    if (Array.isArray(body)) {
      items = body;
    } else if (body.inventory && Array.isArray(body.inventory)) {
      if (body.merge === false) {
        items = body.inventory;
      } else {
        const incoming = body.inventory;
        const incomingIds = new Set(incoming.map((i: any) => i.id));
        const keptExisting = items.filter((i: any) => !incomingIds.has(i.id));
        items = [...incoming, ...keptExisting];
      }
    } else if (body && typeof body === 'object' && body.id) {
      const idx = items.findIndex((i: any) => i.id === body.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...body };
      } else {
        items.unshift(body);
      }
    }

    saveInventoryItems(items);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory/batch-delete', (req: Request, res: Response) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json({ success: true, count: 0 });
    }
    const idSet = new Set(ids);
    const items = loadInventoryItems();
    const remaining = items.filter((item: any) => !idSet.has(item.id));
    saveInventoryItems(remaining);
    res.json({ success: true, count: remaining.length, deletedCount: items.length - remaining.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// 3a. DEALER REQUIREMENTS STORAGE & INVENTORY MATCHING API
// ---------------------------------------------------------
app.get('/api/requirements', (_req: Request, res: Response) => {
  try {
    const items = loadRequirements();
    const activeCount = items.filter((r: any) => r.status === 'active' || !r.status).length;
    res.json({
      requirements: items,
      items,
      count: items.length,
      activeCount,
      success: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, requirements: [], count: 0 });
  }
});

app.post('/api/requirements', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    let items = loadRequirements();

    if (Array.isArray(body)) {
      items = body;
    } else if (body.requirements && Array.isArray(body.requirements)) {
      if (body.merge === false) {
        items = body.requirements;
      } else {
        const incoming = body.requirements;
        const incomingIds = new Set(incoming.map((i: any) => i.id));
        const keptExisting = items.filter((i: any) => !incomingIds.has(i.id));
        items = [...incoming, ...keptExisting];
      }
    } else if (body && typeof body === 'object') {
      const candidate = {
        id: body.id || `req_manual_${Date.now()}`,
        society: body.society || 'DHA Lahore',
        block: body.block || 'Any Block',
        category: body.category || 'Plot',
        marlaSize: Number(body.marlaSize) || 10,
        sizeLabel: body.sizeLabel || (Number(body.marlaSize) >= 20 ? `${Number(body.marlaSize) / 20} Kanal` : `${Number(body.marlaSize) || 10} Marla`),
        budgetInLakhs: Number(body.budgetInLakhs) || 0,
        formattedBudget: body.formattedBudget || (Number(body.budgetInLakhs) > 0 ? `${Number(body.budgetInLakhs)} Lakh` : 'Budget on Call'),
        clientType: body.clientType || 'Cash Buyer',
        features: Array.isArray(body.features) ? body.features : [],
        dealerName: body.dealerName || 'Dealer Broadcast',
        contactNumber: formatPakistaniPhoneNumber(body.contactNumber) || body.contactNumber || '',
        notes: body.notes || '',
        rawText: body.rawText || '',
        source: body.source || 'manual',
        dateAdded: body.dateAdded || new Date().toISOString().split('T')[0],
        status: body.status || 'active',
      };

      const idx = items.findIndex((i: any) => i.id === candidate.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...candidate };
      } else {
        items.unshift(candidate);
      }
    }

    saveRequirements(items);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/requirements/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const items = loadRequirements();
    const filtered = items.filter((i: any) => i.id !== id);
    saveRequirements(filtered);
    res.json({ success: true, count: filtered.length, deleted: items.length - filtered.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/requirements/:id/status', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const status = req.body?.status; // 'active' | 'fulfilled' | 'closed'
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    const items = loadRequirements();
    const idx = items.findIndex((i: any) => i.id === id);
    if (idx >= 0) {
      items[idx].status = status;
      saveRequirements(items);
      return res.json({ success: true, item: items[idx] });
    }
    res.status(404).json({ error: 'Requirement not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Match a Requirement with current Inventory plots
app.post('/api/requirements/match', (req: Request, res: Response) => {
  try {
    const { requirement, requirementId } = req.body || {};
    let targetReq = requirement;

    if (!targetReq && requirementId) {
      const items = loadRequirements();
      targetReq = items.find((i: any) => i.id === requirementId);
    }

    if (!targetReq) {
      return res.status(400).json({ error: 'Requirement not found or provided' });
    }

    const inventory = loadInventoryItems();
    const reqSoc = (targetReq.society || '').toLowerCase().trim();
    const reqBlock = (targetReq.block || '').toLowerCase().trim();
    const reqSize = Number(targetReq.marlaSize) || 0;
    const reqCategory = (targetReq.category || 'Plot').toLowerCase();
    const reqBudget = Number(targetReq.budgetInLakhs) || 0;

    const matches = inventory
      .map((plot: any) => {
        let score = 0;
        const reasons: string[] = [];

        // Category match
        const plotCat = (plot.category || 'Plot').toLowerCase();
        if (plotCat === reqCategory) {
          score += 30;
          reasons.push(`Category match (${plot.category})`);
        } else {
          return null; // Skip mismatched category
        }

        // Society match
        const plotSoc = (plot.society || '').toLowerCase();
        if (reqSoc && (plotSoc.includes(reqSoc) || reqSoc.includes(plotSoc))) {
          score += 35;
          reasons.push(`Society match (${plot.society})`);
        } else if (reqSoc.includes('dha') && plotSoc.includes('dha')) {
          score += 35;
          reasons.push(`DHA Phase match`);
        } else if (reqSoc.includes('bahria') && plotSoc.includes('bahria')) {
          score += 35;
          reasons.push(`Bahria match`);
        } else {
          return null; // Skip wrong society
        }

        // Size match
        const plotSize = Number(plot.marlaSize) || 0;
        if (plotSize === reqSize) {
          score += 25;
          reasons.push(`Exact size (${plot.sizeLabel || plotSize + ' Marla'})`);
        } else if (Math.abs(plotSize - reqSize) <= 2 && reqSize <= 10) {
          score += 10;
          reasons.push(`Close size (${plot.sizeLabel})`);
        }

        // Block match (bonus)
        const plotBlock = (plot.block || '').toLowerCase();
        if (reqBlock && reqBlock !== 'any' && reqBlock !== 'any block' && plotBlock && plotBlock.includes(reqBlock)) {
          score += 10;
          reasons.push(`Exact block (${plot.block})`);
        }

        // Price check
        const plotPrice = Number(plot.priceInLakhs) || 0;
        if (reqBudget > 0 && plotPrice > 0) {
          if (plotPrice <= reqBudget) {
            score += 15;
            reasons.push(`Within budget (${plot.formattedPrice})`);
          } else if (plotPrice <= reqBudget * 1.1) {
            score += 8;
            reasons.push(`Close to budget (+10% margin)`);
          }
        }

        return {
          plot,
          score,
          reasons,
        };
      })
      .filter((m): m is { plot: any; score: number; reasons: string[] } => m !== null && m.score >= 50)
      .sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      requirement: targetReq,
      matchCount: matches.length,
      matches,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// Dedicated IPv4-first agent with keepAlive disabled to avoid Google Apps Script
// redirect/undici HeadersTimeoutError issues in containerized environments
const googleScriptHttpsAgent = new https.Agent({
  keepAlive: false,
  family: 4,
});

async function callGoogleAppsScript(
  method: 'GET' | 'POST',
  url: string,
  data?: any,
  retries = 1
): Promise<{ status: number; ok: boolean; text: string }> {
  const headers: Record<string, string> =
    method === 'POST'
      ? {
          'Content-Type': 'text/plain;charset=utf-8',
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 OrchardDesk-Server/1.0',
        }
      : {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 OrchardDesk-Server/1.0',
        };

  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.request<string>({
        url,
        method,
        headers,
        data: method === 'POST' ? JSON.stringify(data) : undefined,
        timeout: 60000,
        maxRedirects: 10,
        httpsAgent: googleScriptHttpsAgent,
        responseType: 'text',
        transformResponse: [(raw) => (typeof raw === 'string' ? raw : String(raw ?? ''))],
        validateStatus: () => true,
      });

      return {
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
        text: typeof response.data === 'string' ? response.data : String(response.data ?? ''),
      };
    } catch (err: any) {
      lastErr = err;
      const code = err?.code || err?.cause?.code || '';
      const isTransient =
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNABORTED' ||
        code === 'EAI_AGAIN' ||
        code === 'UND_ERR_HEADERS_TIMEOUT' ||
        (err?.message || '').toLowerCase().includes('timeout');
      if (attempt < retries && isTransient) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------
app.get('/api/sheets-proxy', async (req: Request, res: Response) => {
  try {
    const scriptUrl = req.query.scriptUrl as string;
    if (!scriptUrl || !scriptUrl.trim()) {
      return res.status(400).json({ success: false, message: 'Missing scriptUrl parameter' });
    }

    const targetUrl = new URL(scriptUrl.trim());
    if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') {
      return res.status(400).json({ success: false, message: 'Invalid scriptUrl protocol' });
    }
    Object.keys(req.query).forEach((key) => {
      if (key !== 'scriptUrl') {
        targetUrl.searchParams.set(key, req.query[key] as string);
      }
    });

    const googleRes = await callGoogleAppsScript('GET', targetUrl.toString());
    const responseText = googleRes.text;

    // Check for Google login redirect (caused by "Who has access: Only myself")
    if (
      responseText.includes('accounts.google.com') ||
      responseText.includes('ServiceLogin') ||
      responseText.includes('<title>Google Accounts</title>') ||
      responseText.includes('Sign in - Google Accounts')
    ) {
      return res.status(403).json({
        success: false,
        isAuthError: true,
        message: "Google Apps Script permission error: Web App is set to 'Only myself'. In Google Sheets -> Extensions -> Apps Script -> Deploy -> Manage deployments -> Edit -> change 'Who has access' to 'Anyone', then click Deploy.",
      });
    }

    // Check for missing doGet
    if (
      responseText.includes('Script function not found: doGet') ||
      (responseText.includes('doGet') && (responseText.includes('not found') || responseText.includes('見つかりません')))
    ) {
      return res.status(400).json({
        success: false,
        isScriptError: true,
        message: "Google Apps Script Error: 'doGet' function not found. In your Google Apps Script editor, make sure you pasted the complete Code.gs script, saved it (Ctrl+S), and under 'Deploy' -> 'Manage deployments' selected Edit and created a New Version with 'Who has access: Anyone'.",
      });
    }

    try {
      const json = JSON.parse(responseText);
      return res.json(json);
    } catch {
      return res.json({ success: googleRes.ok, raw: responseText });
    }
  } catch (err: any) {
    console.warn('[Sheets Proxy GET Warning]:', err?.code || err?.message || err);
    const isTimeout =
      err?.code === 'ECONNABORTED' ||
      err?.code === 'ETIMEDOUT' ||
      (err?.message || '').toLowerCase().includes('timeout');
    res.status(isTimeout ? 504 : 502).json({
      success: false,
      isTimeout,
      message: isTimeout
        ? 'Google Apps Script took too long to respond. Please try again.'
        : err?.message || 'Failed to reach Google Apps Script',
    });
  }
});

app.post('/api/sheets-proxy', async (req: Request, res: Response) => {
  try {
    const { scriptUrl, ...payload } = req.body || {};
    if (!scriptUrl || !scriptUrl.trim()) {
      return res.status(400).json({ success: false, message: 'Missing scriptUrl in body' });
    }

    const cleanUrl = scriptUrl.trim();
    const parsedUrl = new URL(cleanUrl);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return res.status(400).json({ success: false, message: 'Invalid scriptUrl protocol' });
    }

    const googleRes = await callGoogleAppsScript('POST', cleanUrl, payload);
    const responseText = googleRes.text;

    if (
      responseText.includes('accounts.google.com') ||
      responseText.includes('ServiceLogin') ||
      responseText.includes('<title>Google Accounts</title>') ||
      responseText.includes('Sign in - Google Accounts')
    ) {
      return res.status(403).json({
        success: false,
        isAuthError: true,
        message: "Google Apps Script permission error: Web App is set to 'Only myself'. In Apps Script -> Deploy -> Manage deployments -> Edit -> set 'Who has access' to 'Anyone'.",
      });
    }

    // Check for missing doPost
    if (
      responseText.includes('Script function not found: doPost') ||
      (responseText.includes('doPost') && (responseText.includes('not found') || responseText.includes('見つかりません')))
    ) {
      return res.status(400).json({
        success: false,
        isScriptError: true,
        message: "Google Apps Script Error: 'doPost' function not found. In your Google Apps Script editor, make sure you pasted the full Code.gs script, saved it (Ctrl+S), and under 'Deploy' -> 'Manage deployments' selected Edit and created a New Version.",
      });
    }

    try {
      const json = JSON.parse(responseText);
      return res.json(json);
    } catch {
      return res.json({ success: googleRes.ok, raw: responseText });
    }
  } catch (err: any) {
    console.warn('[Sheets Proxy POST Warning]:', err?.code || err?.message || err);
    const isTimeout =
      err?.code === 'ECONNABORTED' ||
      err?.code === 'ETIMEDOUT' ||
      (err?.message || '').toLowerCase().includes('timeout');
    res.status(isTimeout ? 504 : 502).json({
      success: false,
      isTimeout,
      message: isTimeout
        ? 'Google Apps Script took too long to respond. Please try again.'
        : err?.message || 'Failed to reach Google Apps Script',
    });
  }
});

// ---------------------------------------------------------
// 4. MULTI-MODEL AI ROUTER CHAT ASSISTANT & CHAT PARSER
// ---------------------------------------------------------

// AI Assistant Chat Controller with Multi-Model Fallback Router
app.post('/api/ai-chat-assistant', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    if (!payload.inventoryContext || !Array.isArray(payload.inventoryContext) || payload.inventoryContext.length === 0) {
      payload.inventoryContext = loadInventoryItems();
    }
    const result = await processAiChatAssistant(payload);
    res.json(result);
  } catch (err: any) {
    console.error('[AI Assistant API Error]:', err);
    res.status(500).json({
      reply: 'Maazrat, request process karne me takleef hui. Baraye meharbani dubara try karein.',
      action: 'chat',
      error: err.message,
    });
  }
});

// WhatsApp / Broadcast Chat Parser with High-Precision Multi-Model Router
const handleParseChatRequest = async (req: Request, res: Response) => {
  try {
    const { chatText, defaultSociety, fileName, defaultContact } = req.body || {};
    if (!chatText || !chatText.trim()) {
      return res.json({ success: true, listings: [], count: 0, filteredWithoutContact: 0 });
    }

    const systemInstruction = `You are an elite, high-precision Pakistani Real Estate Data Extraction Engine specializing in Lahore property broadcasts, WhatsApp chat exports (.zip / .txt), and dealer rate lists.

MANDATORY CONTACT NUMBER FILTER RULE (STRICTEST REQUIREMENT):
1. ONLY extract and output listings that have a VALID, genuine phone / contact number (Pakistani mobile format: e.g. 03001234567, +92 300 1234567, 0321-4567890).
2. If a plot/property in the chat text has NO identifiable contact number (neither in the listing line, nor in the WhatsApp sender header, nor in the dealer's sign-off), YOU MUST DISCARD AND OMIT THAT LISTING ENTIRELY.
3. NEVER generate or output any listing with an empty, "-", "N/A", "Unknown", or fake/missing contactNumber.
4. Extract the contact number from:
   - The WhatsApp sender header (e.g. "[10/24, 11:30 AM] +92 300 1234567: ...")
   - The listing text line (e.g. "Call: 0321-4567890", "Contact Malik 03001122334")
   - The message footer or dealer signature.

ACCURACY GUIDELINES:
- Society: Extract exact Lahore society: DHA Lahore (Phase 1 to 9, Prism), Bahria Town (Sector A to F), Bahria Orchard (Phase 1 to 4), Lake City, Johar Town, Gulberg, Park View City, State Life, etc. Default context: "${defaultSociety || 'All Lahore'}".
- Block: e.g. "Phase 6 - Block C", "Sector C", "Block J", "Phase 8 Prism Z".
- Unit Number: Exact plot or house number (e.g. "120", "318", "45A").
- Category: "Plot" | "House" | "Commercial".
- Marla Size: Numeric marla size (5, 8, 10, 20 for 1 Kanal, 40 for 2 Kanal).
- Size Label: e.g. "10 Marla", "1 Kanal", "5 Marla", "2 Kanal".
- Demand: Parse "1.45 Cr" / "1.45 Crore" -> priceInLakhs: 145, formattedPrice: "1.45 Crore". "85 Lac" / "85 Lakh" -> priceInLakhs: 85, formattedPrice: "85 Lakh".
- Features: Array of features found: ["Corner", "Park Facing", "Main Boulevard", "Direct Deal", "Possession Paid", "Urgent Sale"].
- Dealer Name: Dealer or sender name if available.
- Contact Number: Clean Pakistani mobile number.`;

    // Try Gemini Router (Primary Flagship Flash) for highest precision parsing
    const routerResult = await executeWithGeminiRouter({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Extract structured real estate property listings in Lahore with verified contact numbers from this chat:\n${chatText.slice(0, 40000)}\n\nFile Name: ${fileName || ''}`,
            },
          ],
        },
      ],
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: 0.1,
    });

    if (routerResult.success && routerResult.text) {
      try {
        const cleanJson = routerResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        const rawList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.listings) ? parsed.listings : []);
        
        // Strict server-side filter: Discard any listing without a valid contact number
        const validListings = rawList
          .filter((item: any) => isValidContactNumber(item.contactNumber))
          .map((item: any) => ({
            ...item,
            contactNumber: formatPakistaniPhoneNumber(item.contactNumber),
          }));

        const filteredOut = rawList.length - validListings.length;

        if (validListings.length > 0) {
          return res.json({
            success: true,
            listings: validListings,
            count: validListings.length,
            filteredWithoutContact: filteredOut,
            _modelUsed: routerResult.modelUsed,
          });
        }
      } catch (e) {
        console.info('[Parse Chat] Fallback to deterministic regex extractor');
      }
    }

    // High-performance deterministic regex extractor fallback with strict contact number filtering
    const fallbackListings = parseRawChatToProperties(chatText, defaultSociety, defaultContact);
    const verifiedFallback = fallbackListings.filter(item => isValidContactNumber(item.contactNumber));

    return res.json({
      success: true,
      listings: verifiedFallback,
      count: verifiedFallback.length,
      filteredWithoutContact: fallbackListings.length - verifiedFallback.length,
      _fallback: true,
    });
  } catch (err: any) {
    console.error('[Parse Chat API Error]:', err);
    res.status(500).json({ error: err.message, listings: [], count: 0 });
  }
};

app.post('/api/parse-chat', handleParseChatRequest);
app.post('/api/parse-chat-export', handleParseChatRequest);

// ---------------------------------------------------------
// 4.5. META WHATSAPP BUSINESS CLOUD WEBHOOK API
// ---------------------------------------------------------

// Meta Webhook Verification Handshake (GET /api/whatsapp/webhook)
app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '').trim();
  const token = String(req.query['hub.verify_token'] || '').trim();
  const challenge = req.query['hub.challenge'];

  const config = getWhatsAppConfig();
  const configuredToken = (config.webhookVerifyToken || 'umer_realtors_webhook_2026').trim();

  if (mode === 'subscribe' && (token === configuredToken || token === 'umer_realtors_webhook_2026')) {
    console.log('[Meta Webhook] Successfully verified webhook challenge with token:', token);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(challenge !== undefined ? String(challenge) : '');
  }

  console.warn(`[Meta Webhook] Verification failed. Received token: "${token}", Expected: "${configuredToken}", Mode: "${mode}"`);
  return res.status(403).send('Forbidden: Token mismatch or invalid mode');
});

// Meta Webhook Incoming Event Receiver (POST /api/whatsapp/webhook)
app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
  try {
    const extracted = extractMetaMessagePayload(req.body);
    if (!extracted || !extracted.text) {
      // Always return 200 OK to Meta so they don't retry non-message events
      return res.status(200).json({ status: 'IGNORED_NON_TEXT_MESSAGE' });
    }

    console.log(`[Meta Webhook] Incoming message from ${extracted.from} (${extracted.senderName}): "${extracted.text.slice(0, 50)}..."`);

    // Process message in background/async so Meta receives 200 OK immediately
    processIncomingWhatsAppMessage(extracted.text, extracted.from, extracted.senderName)
      .then(result => {
        console.log(`[Meta Webhook] Auto-Processed: ${result.addedCount} added, ${result.skippedDuplicatesCount} duplicates skipped, ${result.rejectedNoContactCount} discarded without contact.`);
      })
      .catch(err => {
        console.error('[Meta Webhook Error]:', err);
      });

    return res.status(200).json({ status: 'EVENT_RECEIVED' });
  } catch (err: any) {
    console.error('[Meta Webhook Handler Error]:', err);
    return res.status(200).json({ status: 'ERROR_HANDLED' });
  }
});

// ---------------------------------------------------------
// 4.6. GREEN-API (WHATSAPP WEB QR GATEWAY - 100% GROUPS & PERSONAL SUPPORT)
// ---------------------------------------------------------

// Green-API Webhook Endpoint
app.post(['/api/green-api/webhook', '/api/green-api'], async (req: Request, res: Response) => {
  try {
    const extracted = extractMetaMessagePayload(req.body);
    if (!extracted || !extracted.text) {
      return res.status(200).json({ status: 'IGNORED_NON_TEXT' });
    }

    console.log(`[Green-API Webhook] Incoming listing from ${extracted.senderName} (${extracted.from}): "${extracted.text.slice(0, 50)}..."`);

    processIncomingWhatsAppMessage(extracted.text, extracted.from, extracted.senderName)
      .then(result => {
        console.log(`[Green-API Webhook] Result: ${result.addedCount} added, ${result.skippedDuplicatesCount} skipped, ${result.rejectedNoContactCount} discarded.`);
      })
      .catch(err => {
        console.error('[Green-API Webhook Error]:', err);
      });

    return res.status(200).json({ status: 'SUCCESS' });
  } catch (err: any) {
    console.error('[Green-API Webhook Error]:', err);
    return res.status(200).json({ status: 'ERROR_HANDLED' });
  }
});

// Green-API Connection Status Check
app.get('/api/green-api/status', async (req: Request, res: Response) => {
  try {
    const config = getWhatsAppConfig();
    const idInstance = String(req.query.idInstance || config.greenApiIdInstance || '').trim();
    const apiToken = String(req.query.apiToken || config.greenApiTokenInstance || '').trim();

    if (!idInstance || !apiToken) {
      return res.json({
        configured: false,
        stateInstance: 'notConfigured',
        message: 'Green-API Instance ID aur API Token configure nahi hain.',
      });
    }

    const result = await getGreenApiInstanceStatus(idInstance, apiToken);
    return res.json({
      configured: true,
      idInstance,
      stateInstance: result.stateInstance,
      error: result.error,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Green-API QR Code Fetcher (for scanning right in the UI)
app.get('/api/green-api/qr', async (req: Request, res: Response) => {
  try {
    const config = getWhatsAppConfig();
    const idInstance = String(req.query.idInstance || config.greenApiIdInstance || '').trim();
    const apiToken = String(req.query.apiToken || config.greenApiTokenInstance || '').trim();

    if (!idInstance || !apiToken) {
      return res.status(400).json({ error: 'Instance ID aur Token darkar hain.' });
    }

    const qrResult = await getGreenApiQrCode(idInstance, apiToken);
    return res.json(qrResult);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Green-API Instant Sync / Poller (Fetches pending messages from Green-API queue)
app.post('/api/green-api/sync', async (req: Request, res: Response) => {
  try {
    const config = getWhatsAppConfig();
    const idInstance = String(req.body.idInstance || config.greenApiIdInstance || '').trim();
    const apiToken = String(req.body.apiToken || config.greenApiTokenInstance || '').trim();

    if (!idInstance || !apiToken) {
      return res.status(400).json({
        success: false,
        message: 'Green-API Instance ID aur API Token provide karein.',
      });
    }

    const syncResult = await syncGreenApiNotifications(idInstance, apiToken, 20);
    return res.json(syncResult);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// WhatsApp Integration Status & Webhook Info
app.get('/api/whatsapp/status', (_req: Request, res: Response) => {
  const config = getWhatsAppConfig();
  const logs = getWhatsAppLogs();

  let totalProcessed = logs.length;
  let totalAdded = 0;
  let totalSkippedDuplicates = 0;
  let totalRejectedNoContact = 0;

  for (const log of logs) {
    totalAdded += (log.addedListings ? log.addedListings.length : 0);
    totalSkippedDuplicates += log.skippedDuplicatesCount || 0;
    totalRejectedNoContact += log.rejectedNoContactCount || 0;
  }

  res.json({
    success: true,
    config,
    stats: {
      totalProcessed,
      totalAdded,
      totalSkippedDuplicates,
      totalRejectedNoContact,
    },
    recentLogs: logs.slice(0, 30),
  });
});

// WhatsApp Logs List
app.get('/api/whatsapp/logs', (_req: Request, res: Response) => {
  res.json({
    success: true,
    logs: getWhatsAppLogs(),
  });
});

// Update WhatsApp Configuration
app.post('/api/whatsapp/config', (req: Request, res: Response) => {
  try {
    const updated = updateWhatsAppConfig(req.body || {});
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Interactive Webhook Simulator for Testing
app.post('/api/whatsapp/simulate', async (req: Request, res: Response) => {
  try {
    const { message, from, senderName } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const senderPhone = typeof from === 'string' ? from.trim() : (from ? String(from) : '');
    const sender = senderName ? String(senderName).trim() : (senderPhone ? 'Simulated Dealer' : 'Unknown Sender');

    const result = await processIncomingWhatsAppMessage(
      message.trim(),
      senderPhone,
      sender
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Sync and Process WhatsApp Messages stored in Google Sheet's WhatsApp_Inbox tab
app.post('/api/whatsapp/sync-sheet-inbox', async (req: Request, res: Response) => {
  try {
    const appCfg = loadAppConfig() || {};
    const scriptUrl = (req.body?.scriptUrl || appCfg.scriptUrl || '').trim();

    if (!scriptUrl) {
      return res.status(400).json({ error: 'Google Apps Script Web App URL is not configured' });
    }

    const fetchUrl = `${scriptUrl}?action=get_whatsapp_inbox&_t=${Date.now()}`;
    const sheetsRes = await callGoogleAppsScript('GET', fetchUrl);
    let sheetData: any = {};
    try {
      sheetData = JSON.parse(sheetsRes.text);
    } catch {
      sheetData = {};
    }

    const messages = sheetData?.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.json({
        success: true,
        message: 'No new WhatsApp messages found in Google Sheet WhatsApp_Inbox tab',
        processed: 0,
        addedCount: 0,
      });
    }

    let totalAdded = 0;
    let totalSkippedDuplicates = 0;
    let totalRejectedNoContact = 0;

    for (const msg of messages) {
      if (msg.text && typeof msg.text === 'string' && msg.text.trim()) {
        const proc = await processIncomingWhatsAppMessage(
          msg.text.trim(),
          msg.senderPhone || '',
          msg.senderName || 'WhatsApp Dealer'
        );
        totalAdded += proc.addedCount || 0;
        totalSkippedDuplicates += proc.skippedDuplicatesCount || 0;
        totalRejectedNoContact += proc.rejectedNoContactCount || 0;
      }
    }

    res.json({
      success: true,
      message: `Processed ${messages.length} WhatsApp messages from Google Sheets`,
      processed: messages.length,
      addedCount: totalAdded,
      skippedDuplicates: totalSkippedDuplicates,
      rejectedNoContact: totalRejectedNoContact,
    });
  } catch (err: any) {
    console.error('[WhatsApp Sheet Inbox Sync Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// 4.7. DIRECT WHATSAPP WEB QR & LIVE GROUP LISTENER (BAILEYS)
// ---------------------------------------------------------
app.get('/api/whatsapp/direct/status', (_req: Request, res: Response) => {
  res.json({ success: true, ...getBaileysStatus() });
});

app.post('/api/whatsapp/direct/connect', async (req: Request, res: Response) => {
  try {
    const forceFresh = req.body?.forceFresh === true;
    const status = await startBaileysConnection(forceFresh);
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/direct/pairing-code', async (req: Request, res: Response) => {
  try {
    const phoneNumber = req.body?.phoneNumber as string;
    if (!phoneNumber || !phoneNumber.trim()) {
      return res.status(400).json({ success: false, error: 'Phone number likhna zaroori hai.' });
    }
    const status = await requestWhatsAppPairingCode(phoneNumber.trim());
    res.json({ success: status.status !== 'error', ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/direct/disconnect', async (_req: Request, res: Response) => {
  try {
    const status = await disconnectBaileys(true);
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/whatsapp/direct/groups', async (_req: Request, res: Response) => {
  try {
    const groups = await refreshBaileysGroups();
    res.json({ success: true, groups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/direct/settings', (req: Request, res: Response) => {
  try {
    const updated = updateBaileysSettings(req.body || {});
    res.json({ success: true, ...updated, ...getBaileysStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hourly .txt Buffer Status & Live Document Preview
app.get('/api/whatsapp/buffer', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, ...getTxtBufferStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manually Trigger Gemini Phraser on .txt Buffer Immediately
app.post('/api/whatsapp/buffer/process', async (_req: Request, res: Response) => {
  try {
    const result = await processTxtBufferWithGemini();
    res.json({ ...result, buffer: getTxtBufferStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle Hourly .txt Batch Mode vs Instant Mode
app.post('/api/whatsapp/buffer/mode', (req: Request, res: Response) => {
  try {
    const mode = req.body?.mode === 'instant' ? 'instant' : 'hourly_txt';
    setBatchProcessingMode(mode);
    res.json({ success: true, ...getTxtBufferStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------
// WHATSAPP GROUP EXPORT & GEMINI PHRASER ROUTES
// ---------------------------------------------------------
// Group summary list & statistics
app.get('/api/whatsapp/groups/export/summary', (_req: Request, res: Response) => {
  try {
    const groups = getGroupSummary();
    const total = loadGroupMessages().length;
    res.json({ success: true, groups, totalMessages: total });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download .txt export file (all groups or single group)
app.get('/api/whatsapp/groups/export/download', (req: Request, res: Response) => {
  try {
    const groupId = req.query.groupId as string | undefined;
    const { content, filename } = generateGroupExportTxt(groupId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Preview .txt export content in JSON
app.get('/api/whatsapp/groups/export/preview', (req: Request, res: Response) => {
  try {
    const groupId = req.query.groupId as string | undefined;
    const exportData = generateGroupExportTxt(groupId);
    res.json({ success: true, ...exportData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Phrase group messages with Gemini AI
app.post('/api/whatsapp/groups/export/phrase', async (req: Request, res: Response) => {
  try {
    const { groupId, customText } = req.body || {};
    const result = await parseGroupExportWithGemini(groupId, customText);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear group messages
app.post('/api/whatsapp/groups/export/clear', (req: Request, res: Response) => {
  try {
    const groupId = req.body?.groupId as string | undefined;
    const result = clearGroupMessages(groupId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------
// 5. PRODUCTION STATIC ASSETS / DEV VITE MIDDLEWARE
// ---------------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.join(process.cwd(), 'dist');

  if (isProduction && fs.existsSync(path.join(distPath, 'index.html'))) {
    console.log('[Production Mode] Serving static files from dist...');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('[Dev Mode] Initializing Vite middleware for SPA...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        if (!fs.existsSync(indexPath)) {
          return next();
        }
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        if (vite.ssrFixStacktrace) vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  }

  const portArgIdx = process.argv.indexOf('--port');
  const portFromArg = portArgIdx !== -1 ? Number(process.argv[portArgIdx + 1]) : undefined;
  const PORT = portFromArg || Number(process.env.PORT) || 3000;
  const HOST = '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Umer Realtors Server running on http://${HOST}:${PORT}`);
    autoResumeBaileysIfAuthenticated();
    startHourlyTxtBatchScheduler();
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Initialization Error:', err);
  process.exit(1);
});
