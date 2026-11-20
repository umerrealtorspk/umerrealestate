import React, { useState } from 'react';
import { 
  X, 
  FolderInput, 
  Check, 
  Building2, 
  Plus, 
  MapPin, 
  ArrowRight,
  Layers
} from 'lucide-react';
import { PropertyListing } from '../types/inventory';

interface MoveSocietyModalProps {
  isOpen: boolean;
  onClose: () => void;
  listingsToMove: PropertyListing[];
  availableSocieties: string[];
  onConfirmMove: (listingIds: string[], newSociety: string, newBlock?: string) => void;
  onNotify?: (msg: string) => void;
}

export const MoveSocietyModal: React.FC<MoveSocietyModalProps> = ({
  isOpen,
  onClose,
  listingsToMove,
  availableSocieties,
  onConfirmMove,
  onNotify,
}) => {
  // Filter out 'All Lahore' from target options
  const baseSocieties = availableSocieties.filter(s => s !== 'All Lahore');

  const defaultTarget = listingsToMove.length > 0 && listingsToMove[0].society
    ? listingsToMove[0].society
    : baseSocieties[0] || 'DHA Lahore';

  const [selectedSociety, setSelectedSociety] = useState<string>(defaultTarget);
  const [isCustomSociety, setIsCustomSociety] = useState<boolean>(false);
  const [customSocietyName, setCustomSocietyName] = useState<string>('');
  const [targetBlock, setTargetBlock] = useState<string>('');
  const [keepBlock, setKeepBlock] = useState<boolean>(true);

  if (!isOpen || listingsToMove.length === 0) return null;

  const currentSocieties = Array.from(new Set(listingsToMove.map(p => p.society)));
  const isMultiple = listingsToMove.length > 1;

  const handleExecuteMove = (e: React.FormEvent) => {
    e.preventDefault();

    const finalSociety = isCustomSociety
      ? customSocietyName.trim()
      : selectedSociety.trim();

    if (!finalSociety) {
      if (onNotify) onNotify('Please select or enter a valid society name');
      return;
    }

    const finalBlock = keepBlock ? undefined : targetBlock.trim() || undefined;

    const ids = listingsToMove.map(p => p.id);
    onConfirmMove(ids, finalSociety, finalBlock);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#0e121b] border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#090c13]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center">
              <FolderInput className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{isMultiple ? `Move ${listingsToMove.length} Properties` : 'Move Property Society'}</span>
              </h3>
              <p className="text-xs text-slate-400">
                {isMultiple
                  ? `Relocate ${listingsToMove.length} listings to another housing society`
                  : `Change society for Plot #${listingsToMove[0].unitNumber}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleExecuteMove} className="p-5 space-y-4 text-xs">
          
          {/* Current Location Info */}
          <div className="p-3.5 rounded-2xl bg-[#080b12] border border-white/[0.06] space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Currently Located In:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {currentSocieties.map(soc => (
                <span 
                  key={soc}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-200 text-xs font-medium"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400/80" />
                  <span>{soc}</span>
                </span>
              ))}
            </div>

            {!isMultiple && (
              <p className="text-[11px] text-slate-400 pt-1">
                Plot #{listingsToMove[0].unitNumber} &bull; {listingsToMove[0].block} &bull; {listingsToMove[0].category} ({listingsToMove[0].sizeLabel})
              </p>
            )}
          </div>

          {/* Destination Society Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Destination Society:</span>
              </label>

              <button
                type="button"
                onClick={() => setIsCustomSociety(!isCustomSociety)}
                className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition flex items-center gap-1 cursor-pointer"
              >
                {isCustomSociety ? (
                  <span>Choose Existing Society</span>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <span>+ Add New Society</span>
                  </>
                )}
              </button>
            </div>

            {isCustomSociety ? (
              <div className="space-y-1.5">
                <input
                  type="text"
                  required
                  value={customSocietyName}
                  onChange={e => setCustomSocietyName(e.target.value)}
                  placeholder="Enter new society name (e.g. Lahore Smart City, Valencia Town...)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-amber-500/40 bg-[#080b12] text-white placeholder-slate-500 font-medium focus:border-amber-500 focus:outline-none"
                  autoFocus
                />
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>This new society will automatically appear in your society hotlist tabs!</span>
                </p>
              </div>
            ) : (
              <select
                value={selectedSociety}
                onChange={e => setSelectedSociety(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-white/[0.08] bg-[#080b12] text-slate-100 font-medium focus:border-amber-500/60 focus:outline-none cursor-pointer"
              >
                {baseSocieties.map(soc => (
                  <option key={soc} value={soc} className="bg-slate-900 text-slate-100">
                    {soc}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Block / Phase Options */}
          <div className="p-3.5 rounded-2xl bg-[#080b12] border border-white/[0.06] space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepBlock}
                onChange={e => setKeepBlock(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
              />
              <span className="font-medium text-slate-300">
                Keep existing block / phase names
              </span>
            </label>

            {!keepBlock && (
              <div className="pt-1 space-y-1">
                <label className="text-[11px] text-slate-400 block">
                  New Block / Phase Name (optional):
                </label>
                <input
                  type="text"
                  value={targetBlock}
                  onChange={e => setTargetBlock(e.target.value)}
                  placeholder="e.g. Phase 6 - Block C or Sector A"
                  className="w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-[#0e121b] text-slate-100 text-xs focus:border-amber-500/60 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Action Buttons */}
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/25 transition-all duration-150 active:scale-95 cursor-pointer"
            >
              <FolderInput className="w-4 h-4 stroke-[2.5]" />
              <span>
                Move {isMultiple ? `${listingsToMove.length} Listings` : 'Listing'} Now
              </span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
