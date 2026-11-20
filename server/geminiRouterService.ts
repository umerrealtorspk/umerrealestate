import { GoogleGenAI, Type } from '@google/genai';
import { PropertyListing } from '../src/types/inventory';

// In-memory quota cooldown cache: modelName -> timestamp when it can be retried
const modelCooldownMap = new Map<string, number>();

// Free / Low-latency Tier Fallback Chain with Flagship Flash as Primary
export const GEMINI_ROUTER_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
];

/**
 * Validates whether a contact string contains a genuine reachable phone number.
 * Discards empty, "-", "N/A", "Unknown", or strings without at least 10 valid digits.
 */
export function isValidContactNumber(phone?: string | null): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim().toLowerCase();
  const blacklisted = [
    '', '-', '--', '---', 'n/a', 'na', 'none', 'null', 'undefined', 'unknown',
    'direct', 'direct deal', 'direct owner', 'owner', 'dealer', 'broadcast',
    'nil', 'call', 'contact'
  ];
  if (blacklisted.includes(trimmed)) return false;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 14) return false;

  return (
    digits.startsWith('03') ||
    digits.startsWith('923') ||
    digits.startsWith('3') ||
    digits.startsWith('042') ||
    digits.startsWith('051')
  );
}

/**
 * Standardizes a phone number into readable format: e.g. "0300 1234567"
 */
export function formatPakistaniPhoneNumber(phone?: string | null): string {
  if (!isValidContactNumber(phone)) return '';
  const digits = (phone || '').replace(/\D/g, '');
  let standard11 = digits;
  if (digits.startsWith('92') && digits.length === 12) {
    standard11 = '0' + digits.slice(2);
  } else if (digits.startsWith('0092') && digits.length === 14) {
    standard11 = '0' + digits.slice(4);
  } else if (digits.length === 10 && digits.startsWith('3')) {
    standard11 = '0' + digits;
  }
  if (standard11.length === 11 && standard11.startsWith('03')) {
    return `${standard11.slice(0, 4)} ${standard11.slice(4)}`;
  }
  return phone?.trim() || standard11;
}

interface RouterCallParams {
  contents: any;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
  temperature?: number;
}

export interface RouterCallResult {
  success: boolean;
  text?: string;
  modelUsed?: string;
  error?: string;
}

/**
 * Executes a Gemini request by routing through available free Gemini models sequentially.
 * If quota (429), model rate limit, or transient error hits, seamlessly cascades to next model.
 * If all models are in cooldown, instantly triggers deterministic local engine without network spam.
 */
export async function executeWithGeminiRouter(params: RouterCallParams): Promise<RouterCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: 'GEMINI_API_KEY is not configured on the server.',
    };
  }

  const now = Date.now();
  const availableModels = GEMINI_ROUTER_MODELS.filter(m => (modelCooldownMap.get(m) || 0) <= now);

  if (availableModels.length === 0) {
    // All models in cooldown - silently trigger local offline deterministic engine
    return {
      success: false,
      error: 'Daily free quota threshold reached on Gemini models. Local offline engine active.',
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const errors: string[] = [];

  for (let i = 0; i < availableModels.length; i++) {
    const model = availableModels[i];
    try {
      const config: any = {};
      if (params.systemInstruction) {
        config.systemInstruction = params.systemInstruction;
      }
      if (params.temperature !== undefined) {
        config.temperature = params.temperature;
      }
      if (params.responseMimeType) {
        config.responseMimeType = params.responseMimeType;
      }
      if (params.responseSchema) {
        config.responseSchema = params.responseSchema;
      }

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Model response timed out after 20s')), 20000)
      );

      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: Object.keys(config).length > 0 ? config : undefined,
        }),
        timeoutPromise,
      ]);

      const text = response.text;
      if (text !== undefined && text !== null) {
        return {
          success: true,
          text,
          modelUsed: model,
        };
      }
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      const is429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
      const is503 = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('overloaded');
      const is404 = errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('not supported');

      if (is429) {
        // Cooldown for 5 minutes
        modelCooldownMap.set(model, Date.now() + 5 * 60 * 1000);
        console.info(`[Gemini Router] Model ${model} daily free quota limit reached. Routing to next model.`);
      } else if (is503) {
        // Cooldown for 45 seconds
        modelCooldownMap.set(model, Date.now() + 45 * 1000);
        console.info(`[Gemini Router] Model ${model} high demand (503). Routing to next model.`);
      } else if (is404) {
        // Cooldown for 24 hours
        modelCooldownMap.set(model, Date.now() + 24 * 60 * 60 * 1000);
        console.info(`[Gemini Router] Model ${model} is not available. Routing to next model.`);
      } else {
        console.info(`[Gemini Router] Model ${model} transient issue. Routing to fallback.`);
      }
      errors.push(`${model}: ${is429 ? 'Quota 429' : (is503 ? 'Busy 503' : 'Unavailable')}`);
    }
  }

  return {
    success: false,
    error: `Gemini models unavailable: ${errors.join(', ')}`,
  };
}

/**
 * Format numeric price in Lakhs to Pakistani currency label (e.g. 1.45 Crore or 85 Lakh)
 */
export function formatPakistaniPrice(priceInLakhs: number): string {
  if (!priceInLakhs || priceInLakhs <= 0) return 'Demand on Call';
  if (priceInLakhs >= 100) {
    const cr = (priceInLakhs / 100).toFixed(2).replace(/\.00$/, '');
    return `${cr} Crore`;
  }
  return `${priceInLakhs} Lakh`;
}

/**
 * Full-system AI Assistant Handler with intelligent routing and inventory management
 */
export async function processAiChatAssistant(payload: {
  message?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  fileText?: string;
  fileMeta?: { name: string; type: string } | null;
  inlineData?: { mimeType: string; data: string } | null;
  defaultSociety?: string;
  inventoryContext?: any[];
  sheetConfig?: any;
}): Promise<any> {
  const userMessage = (payload.message || '').trim();
  const fileText = (payload.fileText || '').trim();
  const defaultSociety = payload.defaultSociety || 'All Lahore';
  const inventory: PropertyListing[] = Array.isArray(payload.inventoryContext) ? payload.inventoryContext : [];

  // Prepare concise inventory summary
  const totalCount = inventory.length;
  const societyCounts: Record<string, number> = {};
  for (const item of inventory) {
    if (item.society) {
      societyCounts[item.society] = (societyCounts[item.society] || 0) + 1;
    }
  }

  const inventorySample = inventory.slice(0, 75).map(p => ({
    id: p.id,
    society: p.society,
    block: p.block,
    unit: p.unitNumber,
    cat: p.category,
    size: p.sizeLabel,
    price: p.formattedPrice,
    dealer: p.dealerName,
    phone: p.contactNumber,
  }));

  const systemInstruction = `You are the Autonomous Chief AI Real Estate Assistant and System Controller for "Umer Realtors" in Lahore, Pakistan.
You have direct, full control over the CRM inventory system and Google Drive synced listings.

Your capabilities:
1. INVENTORY SEARCH & QUERY: Answer questions about plots, houses, commercial units, prices, blocks, and dealers across Lahore societies (DHA Lahore, Bahria Town, Bahria Orchard, Lake City, Johar Town, Gulberg, Model Town, Park View City, State Life, etc.).
2. ADD LISTINGS: If the user or attached file provides property details, extract clean PropertyListing objects to add to inventory.
3. DELETE LISTINGS: If the user asks to delete a plot, delete by society, block, or criteria (e.g., "delete plot 318", "delete all Bahria Orchard listings", "Phase 6 block C ke plots delete karo"), find their exact IDs from the inventory and return them in "listingIdsToDelete".
4. UPDATE LISTINGS: If the user wants to update price or details of a plot, return "listingToUpdate".
5. STATS & MARKET ADVICE: Provide live counts, average rates per marla, hot areas, and professional advice.

Current Inventory Stats:
- Total Listings: ${totalCount}
- Societies: ${JSON.stringify(societyCounts)}
- Active Inventory Sample (IDs & details):
${JSON.stringify(inventorySample)}

Response Format (CRITICAL):
You MUST respond with a valid JSON object matching this structure:
{
  "reply": "Clear, courteous, and highly professional message in Urdu / Roman Urdu / English answering the user's request and explaining what actions were performed.",
  "action": "query" | "add" | "delete" | "update" | "chat",
  "listingIdsToDelete": ["id1", "id2"], // IDs to delete if user requested deletion
  "listingsToAdd": [ // Array of new PropertyListing objects if user provided plot(s) to add
    {
      "id": "new_timestamp",
      "society": "DHA Lahore",
      "block": "Phase 6 - Block C",
      "unitNumber": "123",
      "category": "Plot" | "House" | "Commercial",
      "marlaSize": 10,
      "sizeLabel": "10 Marla",
      "priceInLakhs": 145.0,
      "formattedPrice": "1.45 Crore",
      "features": ["Corner", "Near Park"],
      "dealerName": "Dealer Name",
      "contactNumber": "03001234567",
      "notes": "Verified plot",
      "source": "whatsapp_chat_export",
      "dateAdded": "YYYY-MM-DD"
    }
  ],
  "listingToUpdate": { // If updating an existing listing
    "id": "item_id",
    "priceInLakhs": 150.0,
    "formattedPrice": "1.50 Crore",
    "notes": "Updated demand"
  },
  "matchedListings": [ // Subset of matching PropertyListing objects if user queried or searched
  ]
}`;

  let contents: any[] = [];

  // Include conversation history if available
  if (Array.isArray(payload.conversationHistory) && payload.conversationHistory.length > 0) {
    for (const h of payload.conversationHistory) {
      contents.push({
        role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.content }],
      });
    }
  }

  let currentPrompt = `User Prompt: ${userMessage || '(File processing requested)'}\nDefault Society Context: ${defaultSociety}`;
  if (fileText) {
    currentPrompt += `\n\nAttached File Content:\n${fileText.slice(0, 40000)}`;
  }

  const parts: any[] = [{ text: currentPrompt }];
  if (payload.inlineData?.data && payload.inlineData?.mimeType) {
    parts.unshift({
      inlineData: {
        mimeType: payload.inlineData.mimeType,
        data: payload.inlineData.data,
      },
    });
  }

  contents.push({
    role: 'user',
    parts,
  });

  // Call through the multi-model router
  const routerResult = await executeWithGeminiRouter({
    contents,
    systemInstruction,
    responseMimeType: 'application/json',
    temperature: 0.2,
  });

  if (routerResult.success && routerResult.text) {
    try {
      const cleanJson = routerResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        ...parsed,
        _modelUsed: routerResult.modelUsed,
      };
    } catch (parseErr) {
      console.info('[Gemini Router] JSON parsing fallback:', parseErr);
    }
  }

  // Robust Local Fallback Engine if all models hit quota or fail
  console.log('[Gemini Router] Utilizing built-in local deterministic assistant engine...');
  return executeDeterministicAssistant(userMessage, fileText, defaultSociety, inventory);
}

/**
 * Built-in local fallback engine to ensure the chatbot NEVER fails even if offline or 100% quota exhausted
 */
function executeDeterministicAssistant(
  userMsg: string,
  fileContent: string,
  defaultSociety: string,
  inventory: PropertyListing[]
): any {
  const lower = userMsg.toLowerCase().trim();

  // 1. DELETE ACTION CHECK
  if (lower.includes('delete') || lower.includes('remove') || lower.includes('khatam') || lower.includes('hata do')) {
    const unitMatch = lower.match(/(?:plot|house|unit|#)?\s*(\d+[a-z]?)/i);
    const unitTarget = unitMatch ? unitMatch[1] : null;

    let toDelete: PropertyListing[] = [];
    if (unitTarget) {
      toDelete = inventory.filter(i => (i.unitNumber || '').toLowerCase() === unitTarget.toLowerCase());
    } else {
      // Check for society deletion
      for (const item of inventory) {
        if (item.society && lower.includes(item.society.toLowerCase())) {
          toDelete.push(item);
        }
      }
    }

    if (toDelete.length > 0) {
      const ids = toDelete.map(i => i.id);
      return {
        reply: `Ji Umer Bhai, aapke kehne par system se ${toDelete.length} listing(s) kamyabi se delete kar di gayi hain:\n` +
          toDelete.map(d => `• ${d.society} (${d.block}) Unit #${d.unitNumber} - ${d.formattedPrice}`).join('\n'),
        action: 'delete',
        listingIdsToDelete: ids,
      };
    }
  }

  // 2. SEARCH / QUERY CHECK
  const matching = inventory.filter(item => {
    const composite = `${item.society} ${item.block} ${item.unitNumber} ${item.sizeLabel} ${item.dealerName} ${item.features.join(' ')}`.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 2 && !['hai', 'kya', 'aur', 'the', 'for', 'plots', 'plots', 'show', 'dikhao', 'batao'].includes(w));
    if (words.length === 0) return true;
    return words.some(w => composite.includes(w));
  });

  if (matching.length > 0 && (lower.includes('dikhao') || lower.includes('show') || lower.includes('list') || lower.includes('plot') || lower.includes('rate') || lower.includes('price'))) {
    const sample = matching.slice(0, 10);
    return {
      reply: `Ji Umer Bhai, aapki search ke mutabiq total **${matching.length} properties** mili hain:\n\n` +
        sample.map((m, idx) => `${idx + 1}. **${m.society}** (${m.block}) - Unit #${m.unitNumber} | ${m.sizeLabel} | Demand: **${m.formattedPrice}** (Dealer: ${m.dealerName})`).join('\n') +
        (matching.length > 10 ? `\n\n...aur mazeed ${matching.length - 10} listings mojood hain.` : ''),
      action: 'query',
      matchedListings: sample,
    };
  }

  // 3. STATS CHECK
  if (lower.includes('total') || lower.includes('count') || lower.includes('kitne') || lower.includes('summary')) {
    const socMap: Record<string, number> = {};
    for (const it of inventory) {
      if (it.society) socMap[it.society] = (socMap[it.society] || 0) + 1;
    }
    const lines = Object.entries(socMap).map(([soc, cnt]) => `• **${soc}:** ${cnt} properties`).join('\n');
    return {
      reply: `Salam Umer Bhai! System me is waqt kul **${inventory.length} active listings** mojood hain:\n\n${lines}\n\nAap kisi bhi society ke plots filter karwa saktay hain ya naya data add/delete kar saktay hain.`,
      action: 'chat',
    };
  }

  // 4. FILE / CHAT PARSING CHECK
  if (fileContent && fileContent.trim()) {
    const extracted = parseRawChatToProperties(fileContent, defaultSociety);
    if (extracted.length > 0) {
      return {
        reply: `Subhan Allah! File/Chat se **${extracted.length} verified listings** extract kar ke system inventory me shamil kar di gayi hain.`,
        action: 'add',
        listingsToAdd: extracted,
      };
    }
  }

  // Default friendly assistant greeting
  return {
    reply: `Salam Umer Bhai! Main aapka 24/7 Real Estate AI Assistant hoon.\n\nMujh se Lahore ke kisi bhi plot ki details poochein, WhatsApp chat ya file send karein, ya koi bhi listing delete ya update karwayein. System 100% live aur ready hai!`,
    action: 'chat',
  };
}

/**
 * Deterministic parser for WhatsApp dealer broadcasts & chats
 * Tracks sender headers and STRICTLY filters out any listing without a valid contact number.
 */
export function parseRawChatToProperties(
  chatText: string,
  defaultSociety: string = 'All Lahore',
  defaultContact: string = '-'
): PropertyListing[] {
  const lines = chatText.split('\n');
  const results: PropertyListing[] = [];
  const nowStr = new Date().toISOString().split('T')[0];

  let currentSenderContact = isValidContactNumber(defaultContact) ? defaultContact : '';
  let currentSenderName = 'Dealer Broadcast';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line || line.length < 5) continue;

    if (/^-{10,}$/.test(line)) {
      currentSenderContact = defaultContact || '';
      currentSenderName = 'Dealer Broadcast';
      continue;
    }

    // Check for WhatsApp message timestamp / sender header
    // e.g., "12/05/24, 2:15 PM - +92 300 1234567: ..." or "[12/05/24, 2:15:20 PM] Malik Asif (0300 8455667):"
    const isHeaderLine = /^(?:\[?\d{1,2}\/\d{1,2}\/\d{2,4}[^\]\-]*[\]\-])\s*([^:]+):/i.test(line);
    if (isHeaderLine) {
      const headerMatch = line.match(/^(?:\[?\d{1,2}\/\d{1,2}\/\d{2,4}[^\]\-]*[\]\-])\s*([^:]+):/i);
      if (headerMatch) {
        const senderPart = headerMatch[1].trim();
        const headerPhone = senderPart.match(/(?:\+92|0092|92)?\s*0?3\d{2}[-\s]?\d{7}/);
        if (headerPhone && isValidContactNumber(headerPhone[0])) {
          currentSenderContact = headerPhone[0];
          currentSenderName = senderPart.replace(headerPhone[0], '').replace(/[()]/g, '').trim() || 'WhatsApp Dealer';
        } else if (senderPart.length > 2 && !senderPart.includes('Messages to this')) {
          currentSenderName = senderPart;
        }
      }
      continue;
    }

    // Skip if line is clearly a BUYER REQUIREMENT (handled separately by parseRawChatToRequirements)
    const isRequirement = /(?:required|require|req\b|chahiye|need|looking\s*for|demand\s*for|buyer\s*available|direct\s*buyer|cash\s*buyer|talaash|darkar)\b/i.test(line);
    if (isRequirement) continue;

    // Check if line contains a phone number in footer/sign-off: "Contact: 0300...", "Call 0321..."
    const inlinePhoneMatch = line.match(/(?:\+92|0092|92)?\s*0?3\d{2}[-\s]?\d{7}/);
    if (inlinePhoneMatch && isValidContactNumber(inlinePhoneMatch[0])) {
      currentSenderContact = inlinePhoneMatch[0];
    }

    // Check for plot unit number
    const unitMatch = line.match(/(?:plot|p|unit|#)\s*[:.-]?\s*(\d+[a-z]?)/i) || 
                      line.match(/^[➡️•\*\-]?\s*(\d{1,4}[a-z]?)\b/) ||
                      line.match(/\b(\d{2,5}[a-z]?)\b/);
    if (!unitMatch) continue;
    const unitNumber = unitMatch[1];

    // Check for price
    let priceInLakhs = 0;
    const croreMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|karor)\b/i);
    const lacMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:lac|lakh|lacs)\b/i);

    if (croreMatch) {
      priceInLakhs = parseFloat(croreMatch[1]) * 100;
    } else if (lacMatch) {
      priceInLakhs = parseFloat(lacMatch[1]);
    }

    if (priceInLakhs <= 0) continue;

    // Contact Number Resolution
    // 1. Line specific phone number
    // 2. Current message block sender contact
    // 3. Valid default contact
    let candidateContact = '';
    if (inlinePhoneMatch && isValidContactNumber(inlinePhoneMatch[0])) {
      candidateContact = inlinePhoneMatch[0];
    } else if (currentSenderContact && isValidContactNumber(currentSenderContact)) {
      candidateContact = currentSenderContact;
    } else if (isValidContactNumber(defaultContact)) {
      candidateContact = defaultContact;
    }

    // STRICT USER REQUIREMENT:
    // If this listing has NO verified contact number, DO NOT ADD IT TO INVENTORY!
    if (!isValidContactNumber(candidateContact)) {
      continue;
    }

    const formattedContact = formatPakistaniPhoneNumber(candidateContact);

    // Size detection
    let marlaSize = 10;
    let sizeLabel = '10 Marla';
    if (/5\s*marla|5m\b/i.test(line)) {
      marlaSize = 5;
      sizeLabel = '5 Marla';
    } else if (/8\s*marla|8m\b/i.test(line)) {
      marlaSize = 8;
      sizeLabel = '8 Marla';
    } else if (/1\s*kanal|20\s*marla|1k\b/i.test(line)) {
      marlaSize = 20;
      sizeLabel = '1 Kanal';
    } else if (/2\s*kanal|2k\b/i.test(line)) {
      marlaSize = 40;
      sizeLabel = '2 Kanal';
    } else if (/3\s*marla|3m\b/i.test(line)) {
      marlaSize = 3;
      sizeLabel = '3 Marla';
    } else if (/4\s*marla|4m\b/i.test(line)) {
      marlaSize = 4;
      sizeLabel = '4 Marla';
    }

    // Society & Block detection
    let society = defaultSociety !== 'All Lahore' ? defaultSociety : 'Bahria Town';
    let block = '-';

    if (/dha/i.test(line)) society = 'DHA Lahore';
    else if (/orchard/i.test(line)) society = 'Bahria Orchard';
    else if (/bahria/i.test(line)) society = 'Bahria Town';
    else if (/lake\s*city/i.test(line)) society = 'Lake City';
    else if (/johar/i.test(line)) society = 'Johar Town';
    else if (/gulberg/i.test(line)) society = 'Gulberg';
    else if (/park\s*view/i.test(line)) society = 'Park View City';
    else if (/state\s*life/i.test(line)) society = 'State Life';

    const blockMatch = line.match(/(?:block|sector|phase)\s*([a-z0-9-]+)/i);
    if (blockMatch) {
      block = blockMatch[0];
    }

    // Category
    let category: 'Plot' | 'House' | 'Commercial' = 'Plot';
    if (/house|villa|kothi|bangla|portion/i.test(line)) category = 'House';
    else if (/comm|commercial|plaza|shop|office/i.test(line)) category = 'Commercial';

    // Features
    const features: string[] = [];
    if (/corner/i.test(line)) features.push('Corner');
    if (/park/i.test(line)) features.push('Park Facing');
    if (/mb|main\s*b|boulevard/i.test(line)) features.push('Main Boulevard');
    if (/direct/i.test(line)) features.push('Direct Deal');
    if (/possession/i.test(line)) features.push('Possession Paid');
    if (/urgent|hot/i.test(line)) features.push('Urgent Sale');

    // Dealer Name
    let dealerName = currentSenderName;
    const dealerNameMatch = line.match(/(?:dealer|contact|call|meet)[:\s]+([A-Za-z\s]+?)(?=\s+(?:\d|03|\+92|$))/i);
    if (dealerNameMatch && dealerNameMatch[1].trim().length > 2) {
      dealerName = dealerNameMatch[1].trim();
    }

    results.push({
      id: `ai_ext_${Date.now()}_${i}`,
      society,
      block,
      unitNumber,
      category,
      marlaSize,
      sizeLabel,
      priceInLakhs,
      formattedPrice: formatPakistaniPrice(priceInLakhs),
      features,
      dealerName: dealerName || 'Dealer Broadcast',
      contactNumber: formattedContact,
      notes: line.slice(0, 200),
      source: 'whatsapp_chat_export',
      dateAdded: nowStr,
    });
  }

  return results;
}

/**
 * High-performance deterministic regex fallback for extracting BUYER REQUIREMENTS
 * from chat logs (e.g. "Required 1 Kanal DHA Phase 6 Block C budget 4.20 Cr")
 */
export function parseRawChatToRequirements(
  chatText: string,
  defaultSociety: string = 'All Lahore',
  defaultContact: string = ''
): any[] {
  if (!chatText || !chatText.trim()) return [];
  const lines = chatText.split(/\r?\n/);
  const results: any[] = [];
  const nowStr = new Date().toISOString().split('T')[0];

  let currentSenderContact = isValidContactNumber(defaultContact) ? defaultContact : '';
  let currentSenderName = 'Dealer Broadcast';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line || line.length < 5) continue;

    if (/^-{10,}$/.test(line)) {
      currentSenderContact = defaultContact || '';
      currentSenderName = 'Dealer Broadcast';
      continue;
    }

    const isHeaderLine = /^(?:\[?\d{1,2}\/\d{1,2}\/\d{2,4}[^\]\-]*[\]\-])\s*([^:]+):/i.test(line);
    if (isHeaderLine) {
      const headerMatch = line.match(/^(?:\[?\d{1,2}\/\d{1,2}\/\d{2,4}[^\]\-]*[\]\-])\s*([^:]+):/i);
      if (headerMatch) {
        const senderPart = headerMatch[1].trim();
        const headerPhone = senderPart.match(/(?:\+92|0092|92)?\s*0?3\d{2}[-\s]?\d{7}/);
        if (headerPhone && isValidContactNumber(headerPhone[0])) {
          currentSenderContact = headerPhone[0];
          currentSenderName = senderPart.replace(headerPhone[0], '').replace(/[()]/g, '').trim() || 'WhatsApp Dealer';
        } else if (senderPart.length > 2 && !senderPart.includes('Messages to this')) {
          currentSenderName = senderPart;
        }
      }
      continue;
    }

    // Check if line indicates a BUYER REQUIREMENT
    const isRequirement = /(?:required|require|req\b|chahiye|need|looking\s*for|demand\s*for|buyer\s*available|direct\s*buyer|cash\s*buyer|talaash|darkar)\b/i.test(line);
    if (!isRequirement) continue;

    // Contact resolution
    const inlinePhoneMatch = line.match(/(?:\+92|0092|92)?\s*0?3\d{2}[-\s]?\d{7}/);
    let candidateContact = '';
    if (inlinePhoneMatch && isValidContactNumber(inlinePhoneMatch[0])) {
      candidateContact = inlinePhoneMatch[0];
    } else if (currentSenderContact && isValidContactNumber(currentSenderContact)) {
      candidateContact = currentSenderContact;
    } else if (isValidContactNumber(defaultContact)) {
      candidateContact = defaultContact;
    }

    if (!isValidContactNumber(candidateContact)) continue;
    const formattedContact = formatPakistaniPhoneNumber(candidateContact);

    // Size detection
    let marlaSize = 10;
    let sizeLabel = '10 Marla';
    if (/5\s*marla|5m\b/i.test(line)) {
      marlaSize = 5;
      sizeLabel = '5 Marla';
    } else if (/8\s*marla|8m\b/i.test(line)) {
      marlaSize = 8;
      sizeLabel = '8 Marla';
    } else if (/1\s*kanal|20\s*marla|1k\b/i.test(line)) {
      marlaSize = 20;
      sizeLabel = '1 Kanal';
    } else if (/2\s*kanal|2k\b/i.test(line)) {
      marlaSize = 40;
      sizeLabel = '2 Kanal';
    } else if (/3\s*marla|3m\b/i.test(line)) {
      marlaSize = 3;
      sizeLabel = '3 Marla';
    }

    // Budget detection
    let budgetInLakhs = 0;
    const croreMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|karor)\b/i);
    const lacMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:lac|lakh|lacs)\b/i);
    if (croreMatch) {
      budgetInLakhs = parseFloat(croreMatch[1]) * 100;
    } else if (lacMatch) {
      budgetInLakhs = parseFloat(lacMatch[1]);
    }

    // Society & Block detection
    let society = defaultSociety !== 'All Lahore' ? defaultSociety : 'DHA Lahore';
    let block = 'Any Block';

    if (/dha/i.test(line)) society = 'DHA Lahore';
    else if (/orchard/i.test(line)) society = 'Bahria Orchard';
    else if (/bahria/i.test(line)) society = 'Bahria Town';
    else if (/lake\s*city/i.test(line)) society = 'Lake City';
    else if (/johar/i.test(line)) society = 'Johar Town';
    else if (/gulberg/i.test(line)) society = 'Gulberg';
    else if (/park\s*view/i.test(line)) society = 'Park View City';
    else if (/state\s*life/i.test(line)) society = 'State Life';

    const blockMatch = line.match(/(?:block|sector|phase)\s*([a-z0-9-]+)/i);
    if (blockMatch) {
      block = blockMatch[0];
    }

    let category: 'Plot' | 'House' | 'Commercial' = 'Plot';
    if (/house|villa|kothi|bangla|portion/i.test(line)) category = 'House';
    else if (/comm|commercial|plaza|shop|office/i.test(line)) category = 'Commercial';

    const features: string[] = [];
    if (/corner/i.test(line)) features.push('Corner');
    if (/park/i.test(line)) features.push('Park Facing');
    if (/mb|main\s*b/i.test(line)) features.push('Main Boulevard');
    if (/pair/i.test(line)) features.push('Pair');
    if (/cash\s*buyer/i.test(line)) features.push('Cash Buyer');
    if (/direct/i.test(line)) features.push('Direct Client');

    let dealerName = currentSenderName;
    const dealerNameMatch = line.match(/(?:dealer|contact|call|meet)[:\s]+([A-Za-z\s]+?)(?=\s+(?:\d|03|\+92|$))/i);
    if (dealerNameMatch && dealerNameMatch[1].trim().length > 2) {
      dealerName = dealerNameMatch[1].trim();
    }

    results.push({
      id: `req_ext_${Date.now()}_${i}`,
      society,
      block,
      category,
      marlaSize,
      sizeLabel,
      budgetInLakhs,
      formattedBudget: budgetInLakhs > 0 ? formatPakistaniPrice(budgetInLakhs) : 'Budget on Call',
      clientType: /cash/i.test(line) ? 'Cash Buyer' : 'Direct Client',
      features,
      dealerName: dealerName || 'Dealer Broadcast',
      contactNumber: formattedContact,
      notes: line.slice(0, 250),
      rawText: line,
      source: 'whatsapp_chat_export',
      dateAdded: nowStr,
      status: 'active',
    });
  }

  return results;
}
