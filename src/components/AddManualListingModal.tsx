import React, { useState } from 'react';
import { X, PlusCircle, Check, Building2, MapPin, Tag } from 'lucide-react';
import { PropertyListing, PropertyCategory } from '../types/inventory';
import { LAHORE_SOCIETIES, POPULAR_FEATURES } from '../data/seedInventory';
import { formatLakhs } from '../utils/pakistanCurrency';

interface AddManualListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddListing: (listing: PropertyListing, syncToSheets: boolean) => void;
  onNotify: (msg: string) => void;
  societies?: string[];
}

export const AddManualListingModal: React.FC<AddManualListingModalProps> = ({
  isOpen,
  onClose,
  onAddListing,
  onNotify,
  societies,
}) => {
  const societiesList = (societies && societies.length > 0 ? societies : LAHORE_SOCIETIES)
    .filter(s => s !== 'All Lahore');

  const [society, setSociety] = useState<string>('DHA Lahore');
  const [isNewSociety, setIsNewSociety] = useState(false);
  const [newSocietyName, setNewSocietyName] = useState('');
  const [block, setBlock] = useState<string>('Phase 6 - Block C');
  const [category, setCategory] = useState<PropertyCategory>('Plot');
  const [unitNumber, setUnitNumber] = useState('');
  const [marlaSize, setMarlaSize] = useState<number>(10);
  const [priceInLakhs, setPriceInLakhs] = useState<number>(185);
  const [dealerName, setDealerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['Solid Land']);
  const [syncToDrive, setSyncToDrive] = useState(true);

  if (!isOpen) return null;

  const toggleFeature = (feat: string) => {
    setSelectedFeatures(prev =>
      prev.includes(feat) ? prev.filter(f => f !== feat) : [...prev, feat]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitNumber.trim()) {
      onNotify('Please enter a Plot or House Number');
      return;
    }

    const finalSociety = isNewSociety ? newSocietyName.trim() : society;
    if (!finalSociety) {
      onNotify('Please select or enter a housing society name');
      return;
    }

    const newListing: PropertyListing = {
      id: `manual-${Date.now()}`,
      society: finalSociety,
      block: block.trim() || 'General Block',
      category,
      unitNumber: unitNumber.trim(),
      marlaSize,
      sizeLabel: marlaSize === 20 ? '1 Kanal' : marlaSize === 40 ? '2 Kanal' : `${marlaSize} Marla`,
      priceInLakhs,
      formattedPrice: formatLakhs(priceInLakhs),
      features: selectedFeatures.length > 0 ? selectedFeatures : ['Direct Deal'],
      dealerName: dealerName.trim() || '-',
      contactNumber: contactNumber.trim() || '-',
      notes: notes.trim(),
      source: 'manual',
      syncedToSheets: false,
      dateAdded: new Date().toISOString().split('T')[0],
      urgency: 'standard',
    };

    onAddListing(newListing, syncToDrive);
    onNotify(`Added ${category} #${unitNumber} in ${finalSociety} to inventory!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div className="relative w-full max-w-xl bg-[#0e121b] rounded-3xl shadow-2xl border border-white/[0.09] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#090c13]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Add New Property Listing
              </h3>
              <p className="text-xs text-slate-400">
                Umer Realtors • Verified Lahore Real Estate Inventory
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-xs">
          
          {/* Society & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-slate-300">
                  Housing Society:
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewSociety(!isNewSociety)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  {isNewSociety ? 'Choose Existing' : '+ New Society'}
                </button>
              </div>

              {isNewSociety ? (
                <input
                  type="text"
                  required
                  value={newSocietyName}
                  onChange={e => setNewSocietyName(e.target.value)}
                  placeholder="Enter new society name"
                  className="w-full px-3 py-2 rounded-xl border border-amber-500/50 bg-[#080b12] text-white focus:outline-none"
                />
              ) : (
                <select
                  value={society}
                  onChange={e => setSociety(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-[#080b12] text-slate-100 font-medium focus:border-amber-500/60 focus:outline-none"
                >
                  {societiesList.map(s => (
                    <option key={s} value={s} className="bg-slate-900">{s}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Property Category:
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#080b12] border border-white/[0.08] rounded-xl">
                {(['Plot', 'House', 'Commercial'] as const).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                      category === cat
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Block/Phase & Unit # */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Block / Phase / Sector:
              </label>
              <input
                type="text"
                required
                value={block}
                onChange={e => setBlock(e.target.value)}
                placeholder="e.g. Phase 6 - Block C"
                className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-[#080b12] text-slate-100 focus:border-amber-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Plot / House #:
              </label>
              <input
                type="text"
                required
                value={unitNumber}
                onChange={e => setUnitNumber(e.target.value)}
                placeholder="e.g. 318 or 45-B"
                className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-[#080b12] text-white font-mono font-bold focus:border-amber-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Size & Demand */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Size (Marla / Kanal):
              </label>
              <select
                value={marlaSize}
                onChange={e => setMarlaSize(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-[#080b12] text-slate-100 focus:border-amber-500/60 focus:outline-none cursor-pointer"
              >
                <option value={3} className="bg-slate-900">3 Marla</option>
                <option value={5} className="bg-slate-900">5 Marla</option>
                <option value={8} className="bg-slate-900">8 Marla</option>
                <option value={10} className="bg-slate-900">10 Marla</option>
                <option value={20} className="bg-slate-900">1 Kanal (20 Marla)</option>
                <option value={40} className="bg-slate-900">2 Kanal (40 Marla)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Demand (in Lakhs PKR):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={priceInLakhs}
                  onChange={e => setPriceInLakhs(Number(e.target.value))}
                  className="w-24 px-3 py-2 rounded-xl border border-white/[0.08] bg-[#080b12] text-amber-300 font-mono font-bold focus:border-amber-500/60 focus:outline-none"
                />
                <span className="font-bold text-amber-300 bg-amber-500/10 px-2.5 py-2 rounded-xl border border-amber-500/20 text-xs font-mono truncate">
                  {formatLakhs(priceInLakhs)}
                </span>
              </div>
            </div>
          </div>

          {/* Dealer Name & Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Dealer Name:
              </label>
              <input
                type="text"
                value={dealerName}
                onChange={e => setDealerName(e.target.value)}
                placeholder="e.g. Ch. Kamran"
                className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-[#080b12] text-slate-100 focus:border-amber-500/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Contact Phone:
              </label>
              <input
                type="text"
                value={contactNumber}
                onChange={e => setContactNumber(e.target.value)}
                placeholder="03001234567"
                className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-[#080b12] font-mono text-slate-100 focus:border-amber-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Features */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1.5">
              Features / Highlights:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_FEATURES.map(feat => {
                const isSelected = selectedFeatures.includes(feat);
                return (
                  <button
                    key={feat}
                    type="button"
                    onClick={() => toggleFeature(feat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-xs'
                        : 'bg-[#080b12] border-white/[0.08] text-slate-400 hover:text-white hover:border-white/[0.15]'
                    }`}
                  >
                    {feat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-between border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-medium text-slate-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20 transition active:scale-95 cursor-pointer"
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              <span>Save &amp; Sync Listing</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
