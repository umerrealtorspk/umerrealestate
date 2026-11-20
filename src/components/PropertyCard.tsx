import React, { useState } from 'react';
import { 
  Phone, 
  MessageCircle, 
  Copy, 
  Check, 
  Trash2,
  Ruler,
  MapPin,
  Building2,
  CheckCircle2,
  FolderInput
} from 'lucide-react';
import { PropertyListing } from '../types/inventory';
import { 
  formatLakhs, 
  generateWhatsAppLink, 
  generateClientShareText, 
  cleanPakistaniPhone 
} from '../utils/pakistanCurrency';

interface PropertyCardProps {
  property: PropertyListing;
  onDelete?: (id: string) => void;
  onMove?: (property: PropertyListing) => void;
  onNotify?: (msg: string) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  onDelete,
  onMove,
  onNotify,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyClientText = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareText = generateClientShareText(property, 'Umer Realtors Lahore');
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      if (onNotify) onNotify(`Copied Plot #${property.unitNumber} details for client!`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (onNotify) onNotify('Failed to copy');
    }
  };

  const cleanPhone = cleanPakistaniPhone(property.contactNumber);
  const isHouse = property.category === 'House';
  const priceFormatted = property.formattedPrice || (property.priceInLakhs ? formatLakhs(property.priceInLakhs) : 'Demand on Call');

  return (
    <div className="rounded-2xl bg-[#0d111a] border border-white/[0.08] hover:border-amber-500/35 p-4.5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 group relative overflow-hidden">
      
      {/* Top subtle golden shimmer line on hover */}
      <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400/0 group-hover:via-amber-400/70 to-transparent transition-all duration-300" />

      <div>
        {/* Category Badge & Society/Block */}
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
            isHouse 
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25' 
              : property.category === 'Commercial'
              ? 'bg-purple-500/10 text-purple-300 border border-purple-500/25'
              : 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
          }`}>
            {property.category}
          </span>
          <span className="text-xs text-slate-400 font-medium truncate flex items-center gap-1">
            <MapPin className="w-3 h-3 text-amber-400/80 shrink-0" />
            <span>{property.society}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-300">{property.block}</span>
          </span>
        </div>

        {/* Plot Number & Demand Price */}
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-white tracking-tight font-mono">
              #{property.unitNumber}
            </span>
          </div>
          <span className="text-lg font-bold text-amber-300 font-mono tracking-tight">
            {priceFormatted}
          </span>
        </div>

        {/* Size & Dimension */}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
          <Ruler className="h-3.5 w-3.5 text-slate-500" />
          <span className="font-medium">{property.sizeLabel || 'Standard Size'}</span>
        </div>

        {/* Features / Details */}
        <div className="mt-3">
          <div className="bg-[#080b12] text-slate-300 text-xs px-2.5 py-1.5 rounded-xl border border-white/[0.05] line-clamp-2">
            {property.features?.join(', ') || property.notes || 'Direct Owner / Prime Location'}
          </div>
        </div>
      </div>

      {/* Footer: Dealer Info & Quick Contact Buttons */}
      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <div className="truncate pr-1">
          <p className="text-xs font-semibold text-slate-200 truncate">
            {property.dealerName && property.dealerName.trim() && property.dealerName !== '-' && property.dealerName.toLowerCase() !== 'dealer'
              ? property.dealerName
              : 'Direct Dealer'}
          </p>
          <p className="text-[11px] text-slate-400 font-mono">
            {property.contactNumber && property.contactNumber.trim() && property.contactNumber !== '-' && cleanPhone
              ? property.contactNumber
              : '-'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* WhatsApp Button */}
          {cleanPhone ? (
            <a
              href={generateWhatsAppLink(property)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all duration-150 shadow-sm active:scale-95"
              title="Chat on WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5 fill-current" />
              <span>Chat</span>
            </a>
          ) : (
            <span className="px-2 py-1 rounded-lg bg-white/[0.03] text-slate-600 text-xs">-</span>
          )}

          {/* Copy for Client */}
          <button
            type="button"
            onClick={handleCopyClientText}
            className={`p-2 rounded-xl border transition-all duration-150 cursor-pointer active:scale-95 ${
              copied
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-white/[0.05] text-slate-300 hover:text-white hover:bg-white/[0.08] border-white/[0.08]'
            }`}
            title="Copy for Client"
          >
            {copied ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          {/* Move to another Society */}
          {onMove && (
            <button
              type="button"
              onClick={() => onMove(property)}
              className="p-2 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-slate-950 transition-all duration-150 border border-amber-500/20 cursor-pointer active:scale-95"
              title="Move to another Society"
            >
              <FolderInput className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Delete Single Card */}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete listing Plot #${property.unitNumber}?`)) {
                  onDelete(property.id);
                }
              }}
              className="p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white transition-all duration-150 border border-rose-500/20 cursor-pointer active:scale-95"
              title="Delete Listing"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

    </div>
  );
};
