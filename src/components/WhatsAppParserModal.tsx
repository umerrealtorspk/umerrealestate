import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Check, 
  AlertCircle, 
  Building2, 
  Trash2, 
  Sheet, 
  Copy, 
  RefreshCw,
  Plus
} from 'lucide-react';
import { PropertyListing } from '../types/inventory';
import { formatLakhs } from '../utils/pakistanCurrency';

interface WhatsAppParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddListings: (listings: PropertyListing[], syncToSheets: boolean) => void;
  onNotify: (msg: string) => void;
  sheetsConnected: boolean;
}

const SAMPLE_MESSAGES = [
  {
    title: 'Single 10M Plot (G5)',
    text: `A-O-A, Hot Urgent Deal in Bahria Orchard Phase 2
Block: G5
Plot No: 524
Size: 10 Marla solid level ground
Features: Corner + MB Paid + Possession Paid + Near Masjid
Demand: 86 Lac (Slightly negotiable for direct cash party)
Contact: Mian Tariq 0321-4567890 (Royal Associates)`
  },
  {
    title: 'Brand New 5M House (F1)',
    text: `Bahria Orchard Lahore F1 Block
Brand new 5 Marla designer house for sale!
- 3 Master bedrooms with attached baths
- Spanish tiles, Grohe fittings, double kitchen
- Double storey, solid A+ structure
Demand: 1.68 Crore
Direct dealing, keys in office.
Call Ch. Nadeem 0300-9876543 (Al-Rehman Estate)`
  },
  {
    title: 'Bulk WhatsApp Broadcast (4 Plots)',
    text: `*FRESH INVENTORY BAHRIA ORCHARD LAHORE* 📢
1) G1 Plot 215 5 Marla general solid demand 43.5 Lac
2) G1 Plot 88 5 Marla Corner park face demand 49 Lac
3) Eastern Block Plot 320 8 Marla MB paid demand 72 Lac
4) OLC Block B Plot 140 5 Marla open form transfer demand 37 Lac
Direct from owner. All documents verified.
Malik Bilal 0333-4123890 Prime Properties`
  },
  {
    title: 'Urdu / Roman Broadcast',
    text: `Salam bhai, Bahria Orchard Phase 2 G5 block plot no 630, 10 marla solid plot park facing, all dues cleared, demand 82 lac final. Party direct hai.
Contact Rana Sohail 0300-7654321`
  }
];

export const WhatsAppParserModal: React.FC<WhatsAppParserModalProps> = ({
  isOpen,
  onClose,
  onAddListings,
  onNotify,
  sheetsConnected,
}) => {
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedListings, setExtractedListings] = useState<PropertyListing[]>([]);
  const [syncToSheets, setSyncToSheets] = useState(true);

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!rawText.trim()) {
      setError('Please paste raw WhatsApp text from a dealer message or group.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/parse-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract inventory with Gemini AI.');
      }

      // Map response to full PropertyListing format
      const formatted: PropertyListing[] = (data.listings || []).map((item: any, idx: number) => ({
        id: `wa-${Date.now()}-${idx}`,
        category: item.category === 'House' ? 'House' : 'Plot',
        block: item.block || 'G1',
        unitNumber: String(item.unitNumber || 'General'),
        marlaSize: Number(item.marlaSize) || 5,
        sizeLabel: item.sizeLabel || `${item.marlaSize || 5} Marla`,
        priceInLakhs: Number(item.priceInLakhs) || 50,
        formattedPrice: item.formattedPrice || formatLakhs(item.priceInLakhs || 50),
        features: Array.isArray(item.features) ? item.features : ['Solid Land'],
        dealerName: item.dealerName || 'Dealer (WhatsApp Group)',
        contactNumber: item.contactNumber || '03001234567',
        notes: item.notes || '',
        source: 'whatsapp_ai',
        syncedToSheets: false,
        dateAdded: new Date().toISOString().split('T')[0],
        urgency: item.priceInLakhs && item.features.some((f: string) => f.toLowerCase().includes('urgent')) ? 'urgent' : 'hot',
      }));

      setExtractedListings(formatted);
      onNotify(`Extracted ${formatted.length} property listing(s) using Gemini AI!`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error parsing message');
    } finally {
      setLoading(false);
    }
  };

  const handleApplySample = (sample: string) => {
    setRawText(sample);
    setError(null);
  };

  const handleRemoveExtracted = (id: string) => {
    setExtractedListings(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateField = (id: string, field: keyof PropertyListing, value: any) => {
    setExtractedListings(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleConfirmAdd = () => {
    if (extractedListings.length === 0) return;
    onAddListings(extractedListings, syncToSheets);
    onNotify(`Added ${extractedListings.length} listing(s) to inventory!`);
    setRawText('');
    setExtractedListings([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-50 via-teal-50 to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30">
              <Sparkles className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  WhatsApp Raw Inventory AI Parser
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Gemini Flash
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paste raw unstructured WhatsApp dealer broadcasts to automatically extract plots & houses
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Quick Sample Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Quick Test Samples (from 1500+ Lahore Dealer Groups):
              </span>
              <span className="text-[11px] text-slate-400">Click any sample to test</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SAMPLE_MESSAGES.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => handleApplySample(sample.text)}
                  className="px-2.5 py-2 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all text-left"
                >
                  <p className="font-bold truncate">{sample.title}</p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">Bahria Orchard</p>
                </button>
              ))}
            </div>
          </div>

          {/* Raw Text Input Area */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Paste Raw WhatsApp Dealer Text:
            </label>
            <textarea
              rows={5}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Paste raw messages here... e.g. 'A-O-A, Urgent Sale in Bahria Orchard Phase 2 G5 block plot no 412, 10 marla solid land, MB paid, possession paid, demand 85 lac. Contact Mian Tariq 0321-4567890'"
              className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="syncSheetsCheck"
                checked={syncToSheets}
                onChange={e => setSyncToSheets(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600"
              />
              <label htmlFor="syncSheetsCheck" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer flex items-center gap-1.5">
                <Sheet className="h-3.5 w-3.5 text-emerald-600" />
                <span>Auto-append parsed listings to Google Sheets Block Tab</span>
              </label>
            </div>

            <button
              onClick={handleParse}
              disabled={loading || !rawText.trim()}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-md shadow-emerald-600/30 transition-all"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Extracting with Gemini AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <span>Parse & Extract Inventory</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Extracted Listings Review Grid */}
          {extractedListings.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Extracted {extractedListings.length} Property Listing(s):
                </h4>
                <span className="text-[11px] text-slate-400">
                  Review & edit details before saving
                </span>
              </div>

              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {extractedListings.map((item, index) => (
                  <div
                    key={`${item.id || 'wa'}_${index}`}
                    className="p-3 sm:p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/20 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={item.category}
                          onChange={e => handleUpdateField(item.id, 'category', e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                        >
                          <option value="Plot">Plot</option>
                          <option value="House">House</option>
                        </select>

                        <input
                          type="text"
                          value={item.block}
                          onChange={e => handleUpdateField(item.id, 'block', e.target.value)}
                          placeholder="Block"
                          className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                        />

                        <input
                          type="text"
                          value={item.unitNumber}
                          onChange={e => handleUpdateField(item.id, 'unitNumber', e.target.value)}
                          placeholder="Unit #"
                          className="w-24 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-400">Demand:</span>
                          <input
                            type="number"
                            value={item.priceInLakhs}
                            onChange={e => handleUpdateField(item.id, 'priceInLakhs', Number(e.target.value))}
                            className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-emerald-600"
                          />
                          <span className="text-xs font-semibold text-emerald-600">Lakh</span>
                        </div>

                        <button
                          onClick={() => handleRemoveExtracted(item.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Secondary details */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Size (Marla):</span>
                        <input
                          type="text"
                          value={item.sizeLabel}
                          onChange={e => handleUpdateField(item.id, 'sizeLabel', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Dealer / Owner:</span>
                        <input
                          type="text"
                          value={item.dealerName}
                          onChange={e => handleUpdateField(item.id, 'dealerName', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Contact Number:</span>
                        <input
                          type="text"
                          value={item.contactNumber}
                          onChange={e => handleUpdateField(item.id, 'contactNumber', e.target.value)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] text-slate-400">Tags:</span>
                      {item.features.map((feat, fIdx) => (
                        <span key={fIdx} className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirmAdd}
            disabled={extractedListings.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-md shadow-emerald-600/30 transition-all"
          >
            <Check className="h-4 w-4" />
            <span>Save {extractedListings.length} to Inventory</span>
          </button>
        </div>

      </div>
    </div>
  );
};
