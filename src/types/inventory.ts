export type PropertyCategory = 'Plot' | 'House' | 'Commercial';

export interface PropertyListing {
  id: string;
  society: string; // e.g. 'DHA Lahore', 'Bahria Town', 'Bahria Orchard', 'Lake City', 'Johar Town', 'Gulberg', etc.
  block: string;   // e.g. 'Phase 6 - Block C', 'Sector C', 'G5', 'Block H-3', 'M7 Sector'
  unitNumber: string;
  category: PropertyCategory;
  marlaSize: number;
  sizeLabel: string;
  priceInLakhs: number;
  formattedPrice: string;
  features: string[];
  dealerName: string;
  contactNumber: string;
  notes?: string;
  source: 'whatsapp_chat_export' | 'sheets' | 'manual' | 'seed';
  syncedToSheets?: boolean;
  dateAdded: string;
  urgency?: 'hot' | 'urgent' | 'standard';
  isSold?: boolean;
}

export interface SheetConfig {
  scriptUrl: string;
  driveFolderId?: string;
  driveFolderName?: string;
  sheetId?: string;
  autoSync: boolean;
  lastSyncedAt?: string;
  syncStatus: 'idle' | 'syncing' | 'connected' | 'error';
  errorMessage?: string;
}

export interface DealerRequirement {
  id: string;
  society: string;          // e.g. 'DHA Lahore', 'Bahria Town', 'Lake City'
  block: string;            // e.g. 'Phase 6 - Block C', 'Sector C', 'Any'
  category: PropertyCategory;
  marlaSize: number;        // e.g. 5, 10, 20
  sizeLabel: string;        // e.g. '1 Kanal', '10 Marla'
  budgetInLakhs: number;    // e.g. 420 (0 if on call)
  formattedBudget: string;  // e.g. '4.20 Crore' or 'Budget on Call'
  clientType?: string;      // e.g. 'Cash Buyer', 'Direct Client', 'Investor', 'Urgent'
  features: string[];       // e.g. ['Corner', 'Park Facing', 'Pair', 'Main Boulevard']
  dealerName: string;       // e.g. 'Ch. Kamran'
  contactNumber: string;    // e.g. '0300 8455667'
  notes?: string;           // specific notes, e.g. 'Urgent cash deal, ready to transfer'
  rawText?: string;         // original message text
  source: string;           // 'whatsapp_live' | 'whatsapp_buffer' | 'chat_export' | 'manual'
  dateAdded: string;        // YYYY-MM-DD
  status: 'active' | 'fulfilled' | 'closed';
}

export interface FilterState {
  searchQuery: string;
  society: string; // 'All', 'DHA Lahore', 'Bahria Town', etc.
  category: 'All' | 'Plot' | 'House' | 'Commercial';
  size: string;
  minPrice: number;
  maxPrice: number;
  selectedFeatures: string[];
  sortBy: 'price-asc' | 'price-desc' | 'unit' | 'recent';
}
