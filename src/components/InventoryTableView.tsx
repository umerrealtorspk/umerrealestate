import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PropertyListing } from '../types/inventory';
import { formatLakhs, generateWhatsAppLink, cleanPakistaniPhone, generateClientShareText } from '../utils/pakistanCurrency';
import { 
  MessageCircle, 
  Phone, 
  Trash2, 
  Copy, 
  Check, 
  FolderOpen, 
  CheckSquare, 
  Square, 
  FileSpreadsheet, 
  Share2, 
  ExternalLink, 
  MapPin, 
  Building2, 
  FolderInput,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface InventoryTableViewProps {
  inventory: PropertyListing[];
  onDelete?: (id: string) => void;
  onBatchDelete?: (ids: string[]) => void;
  onMoveListing?: (listing: PropertyListing) => void;
  onBatchMove?: (listings: PropertyListing[]) => void;
  onNotify?: (msg: string) => void;
  onResetFilters?: () => void;
}

// Helper to generate compact page pills with ellipsis
function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export const InventoryTableView: React.FC<InventoryTableViewProps> = ({
  inventory,
  onDelete,
  onBatchDelete,
  onMoveListing,
  onBatchMove,
  onNotify,
  onResetFilters,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Jump to page 1 whenever total listings count changes
  useEffect(() => {
    setCurrentPage(1);
  }, [inventory.length]);

  const totalPages = Math.max(1, Math.ceil(inventory.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // Paginated chunk to avoid rendering thousands of DOM rows at once
  const paginatedListings = useMemo(() => {
    if (pageSize >= 100000) return inventory;
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return inventory.slice(startIndex, startIndex + pageSize);
  }, [inventory, safeCurrentPage, pageSize]);

  const handlePageChange = (newPage: number) => {
    const target = Math.max(1, Math.min(newPage, totalPages));
    setCurrentPage(target);
    tableContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Check selection states
  const currentPageIds = paginatedListings.map(p => p.id);
  const allOnPageSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.includes(id));
  const someSelected = selectedIds.length > 0;
  const allInventorySelected = selectedIds.length === inventory.length && inventory.length > 0;

  // Toggle selection on current page
  const handleToggleSelectAll = () => {
    if (allOnPageSelected) {
      // Unselect all on current page
      setSelectedIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      // Select all on current page
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  // Select all matching listings across entire inventory
  const handleSelectAllEverywhere = () => {
    setSelectedIds(inventory.map(p => p.id));
    if (onNotify) onNotify(`Selected all ${inventory.length} properties across all pages!`);
  };

  // Toggle individual item
  const handleToggleSelectItem = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Copy listing formatted for client
  const handleCopyClient = async (property: PropertyListing) => {
    const text = generateClientShareText(property, 'Umer Realtors Lahore');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(property.id);
      if (onNotify) onNotify(`Copied Plot #${property.unitNumber} listing for client!`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      if (onNotify) onNotify('Failed to copy');
    }
  };

  // Batch Copy for Client
  const handleBatchCopyClient = async () => {
    const selectedProps = inventory.filter(p => selectedIds.includes(p.id));
    if (selectedProps.length === 0) return;

    const fullText = selectedProps
      .map(p => generateClientShareText(p, 'Umer Realtors Lahore'))
      .join('\n\n-----------------------------\n\n');

    try {
      await navigator.clipboard.writeText(fullText);
      if (onNotify) onNotify(`Copied ${selectedProps.length} listings for client!`);
    } catch {
      if (onNotify) onNotify('Failed to copy listings');
    }
  };

  // Batch Export to Excel (.xlsx)
  const handleExportSelected = () => {
    const selectedProps = inventory.filter(p => selectedIds.includes(p.id));
    const dataToExport = selectedProps.length > 0 ? selectedProps : inventory;

    const rows = dataToExport.map(p => ({
      Society: p.society,
      Block: p.block,
      'Plot / House #': p.unitNumber,
      Category: p.category,
      Size: p.sizeLabel,
      'Demand (Lakhs)': p.priceInLakhs,
      'Formatted Price': p.formattedPrice || (p.priceInLakhs ? formatLakhs(p.priceInLakhs) : 'On Call'),
      'Features / Details': (p.features || []).join(', ') || p.notes || '',
      Dealer: p.dealerName || '-',
      Contact: p.contactNumber || '-',
      'Date Added': p.dateAdded || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lahore Properties');
    XLSX.writeFile(workbook, `Umer_Realtors_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);

    if (onNotify) onNotify(`Exported ${dataToExport.length} listings to Excel!`);
  };

  // Handle batch deletion
  const handleExecuteBatchDelete = () => {
    if (!onBatchDelete || selectedIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} selected listings? This action cannot be undone.`)) {
      onBatchDelete(selectedIds);
      setSelectedIds([]);
    }
  };

  if (inventory.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0d111a] border border-white/[0.08] p-12 text-center text-slate-400 space-y-3.5 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto text-slate-500">
          <FolderOpen className="h-6 w-6 stroke-[1.8]" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-200">No matching properties found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search criteria, society hotlist, or demand filters.
          </p>
        </div>
        {onResetFilters && (
          <button 
            type="button"
            onClick={onResetFilters} 
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 cursor-pointer shadow-sm transition active:scale-95"
          >
            <span>Reset All Filters</span>
          </button>
        )}
      </div>
    );
  }

  const startRecord = (safeCurrentPage - 1) * pageSize + 1;
  const endRecord = Math.min(inventory.length, safeCurrentPage * pageSize);

  return (
    <div ref={tableContainerRef} className="space-y-3">
      
      {/* Multi-page selection banner when items on page are selected */}
      {allOnPageSelected && inventory.length > pageSize && !allInventorySelected && (
        <div className="p-2.5 px-4 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-3 animate-fadeIn">
          <span>
            All <strong>{paginatedListings.length}</strong> properties on page {safeCurrentPage} are selected.
          </span>
          <button
            type="button"
            onClick={handleSelectAllEverywhere}
            className="font-bold underline hover:text-white cursor-pointer ml-auto"
          >
            Select all {inventory.length} properties across all pages
          </button>
        </div>
      )}

      {/* Main Inventory Listings Container */}
      <div className="rounded-2xl bg-[#0d111a] border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/40">
        
        {/* Mobile Header Quick Bar (Select all on page) */}
        <div className="md:hidden px-3.5 py-2.5 bg-[#090c13] border-b border-white/[0.08] flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="text-slate-400 hover:text-white transition cursor-pointer p-0.5"
              title={allOnPageSelected ? 'Deselect page' : 'Select page'}
            >
              {allOnPageSelected ? (
                <CheckSquare className="w-4 h-4 text-amber-400" />
              ) : someSelected ? (
                <Square className="w-4 h-4 text-amber-400/80 fill-amber-400/20" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
            <span className="font-semibold text-slate-300 text-xs">
              {allOnPageSelected ? 'All Selected' : 'Select All on Page'}
            </span>
          </div>
          <span className="text-[11px] text-amber-400/90 font-mono">
            {paginatedListings.length} items
          </span>
        </div>

        {/* Desktop View: Full 9-Column Data Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            
            {/* Header */}
            <thead className="bg-[#090c13] text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-white/[0.08]">
              <tr>
                <th className="py-3 px-3.5 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="text-slate-400 hover:text-white transition cursor-pointer"
                    title={allOnPageSelected ? 'Deselect page' : 'Select page'}
                  >
                    {allOnPageSelected ? (
                      <CheckSquare className="w-4 h-4 text-amber-400" />
                    ) : someSelected ? (
                      <Square className="w-4 h-4 text-amber-400/80 fill-amber-400/20" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Plot / House #</th>
                <th className="py-3 px-4 font-semibold">Society &amp; Block</th>
                <th className="py-3 px-4 font-semibold">Size</th>
                <th className="py-3 px-4 font-semibold">Demand / Price</th>
                <th className="py-3 px-4 font-semibold">Features / Details</th>
                <th className="py-3 px-4 font-semibold">Dealer Info</th>
                <th className="py-3 px-4 font-semibold text-right">Quick Contact</th>
              </tr>
            </thead>

            {/* Body (Paginated - Renders smoothly with zero browser lag) */}
            <tbody className="divide-y divide-white/[0.05] text-slate-200">
              {paginatedListings.map((item, index) => {
                const isSelected = selectedIds.includes(item.id);
                const priceFormatted = item.formattedPrice || (item.priceInLakhs ? formatLakhs(item.priceInLakhs) : 'Demand on Call');
                const isHouse = item.category === 'House';
                const cleanPhone = cleanPakistaniPhone(item.contactNumber);
                const isCopied = copiedId === item.id;

                return (
                  <tr 
                    key={`${item.id || 'row'}_${index}`} 
                    className={`transition-colors duration-150 ${
                      isSelected 
                        ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.09]' 
                        : 'hover:bg-white/[0.025]'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleSelectItem(item.id)}
                        className="text-slate-500 hover:text-white transition cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Category Type */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        isHouse
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25'
                          : item.category === 'Commercial'
                          ? 'bg-purple-500/10 text-purple-300 border border-purple-500/25'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
                      }`}>
                        {item.category}
                      </span>
                    </td>

                    {/* Unit # */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-extrabold text-white text-base font-mono tracking-tight">
                        #{item.unitNumber}
                      </span>
                    </td>

                    {/* Society & Block */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                        <span>{item.society}</span>
                      </div>
                      <div className="text-xs text-slate-400 pl-5">{item.block}</div>
                    </td>

                    {/* Size */}
                    <td className="py-3 px-4 text-slate-300 whitespace-nowrap font-medium text-xs">
                      {item.sizeLabel || 'Standard'}
                    </td>

                    {/* Demand Price */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-bold text-amber-300 font-mono text-sm tracking-tight">
                        {priceFormatted}
                      </span>
                    </td>

                    {/* Features / Details */}
                    <td className="py-3 px-4 max-w-xs truncate text-xs text-slate-300">
                      {item.features && item.features.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.features.slice(0, 3).map((f, fIdx) => (
                            <span 
                              key={fIdx} 
                              className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-slate-300 font-mono"
                            >
                              {f}
                            </span>
                          ))}
                          {item.features.length > 3 && (
                            <span className="text-[10px] text-slate-500">+{item.features.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">
                          {item.notes || 'Prime Location'}
                        </span>
                      )}
                    </td>

                    {/* Dealer Info */}
                    <td className="py-3 px-4 whitespace-nowrap text-xs">
                      <div className="font-medium text-slate-200">
                        {item.dealerName && item.dealerName.trim() && item.dealerName !== '-' && item.dealerName.toLowerCase() !== 'dealer'
                          ? item.dealerName
                          : 'Direct Dealer'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.contactNumber && item.contactNumber.trim() && item.contactNumber !== '-' && cleanPhone
                          ? item.contactNumber
                          : '-'}
                      </div>
                    </td>

                    {/* Quick Contact & Action Buttons */}
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        
                        {/* WhatsApp Action */}
                        {cleanPhone ? (
                          <a
                            href={generateWhatsAppLink(item)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 flex items-center justify-center transition-all duration-150 border border-emerald-500/20 shadow-xs cursor-pointer active:scale-95"
                            title="WhatsApp Chat"
                          >
                            <MessageCircle className="h-4 w-4 fill-current" />
                          </a>
                        ) : (
                          <span className="w-8 h-8 flex items-center justify-center text-slate-600 text-xs">-</span>
                        )}

                        {/* Phone Call Action */}
                        {cleanPhone && (
                          <a
                            href={`tel:${cleanPhone}`}
                            className="w-8 h-8 rounded-lg bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white flex items-center justify-center transition-all duration-150 border border-white/[0.08] shadow-xs active:scale-95"
                            title="Direct Phone Call"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        )}

                        {/* 1-Click Client Copy */}
                        <button
                          type="button"
                          onClick={() => handleCopyClient(item)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 border shadow-xs cursor-pointer active:scale-95 ${
                            isCopied 
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold' 
                              : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white border-white/[0.08]'
                          }`}
                          title="Copy listing for client"
                        >
                          {isCopied ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>

                        {/* Move to Society */}
                        {onMoveListing && (
                          <button
                            type="button"
                            onClick={() => onMoveListing(item)}
                            className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center transition-all duration-150 border border-amber-500/20 shadow-xs cursor-pointer active:scale-95"
                            title="Move to another Society"
                          >
                            <FolderInput className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Delete Single Entry */}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete Plot #${item.unitNumber} (${item.society})?`)) {
                                onDelete(item.id);
                              }
                            }}
                            className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all duration-150 border border-rose-500/20 shadow-xs cursor-pointer active:scale-95"
                            title="Delete Listing"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View: High-Performance Touch-Optimized Cards */}
        <div className="md:hidden divide-y divide-white/[0.06]">
          {paginatedListings.map((item, index) => {
            const isSelected = selectedIds.includes(item.id);
            const priceFormatted = item.formattedPrice || (item.priceInLakhs ? formatLakhs(item.priceInLakhs) : 'Demand on Call');
            const isHouse = item.category === 'House';
            const cleanPhone = cleanPakistaniPhone(item.contactNumber);
            const isCopied = copiedId === item.id;

            return (
              <div 
                key={`${item.id || 'mob'}_${index}`}
                className={`p-3.5 transition-colors ${
                  isSelected ? 'bg-amber-500/[0.07]' : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* Top Row: Checkbox + Category + Size + Price */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleSelectItem(item.id)}
                      className="text-slate-400 hover:text-white transition cursor-pointer p-0.5"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                    </button>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      isHouse
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25'
                        : item.category === 'Commercial'
                        ? 'bg-purple-500/10 text-purple-300 border border-purple-500/25'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
                    }`}>
                      {item.category}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium truncate">
                      {item.sizeLabel || 'Standard'}
                    </span>
                  </div>

                  <span className="font-extrabold text-amber-300 font-mono text-sm tracking-tight shrink-0">
                    {priceFormatted}
                  </span>
                </div>

                {/* Plot #, Society & Block */}
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-extrabold text-white font-mono tracking-tight">
                      #{item.unitNumber}
                    </span>
                    <div className="text-xs text-slate-300 font-medium flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
                      <span className="text-white font-semibold">{item.society}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400">{item.block}</span>
                    </div>
                  </div>
                </div>

                {/* Features / Details */}
                {(item.features?.length || item.notes) && (
                  <div className="mt-2 text-xs text-slate-300 bg-white/[0.02] p-2 rounded-xl border border-white/[0.04]">
                    {item.features && item.features.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.features.slice(0, 4).map((f, fIdx) => (
                          <span key={fIdx} className="px-1.5 py-0.5 rounded bg-white/[0.05] text-[10px] text-slate-300 font-mono">
                            {f}
                          </span>
                        ))}
                        {item.features.length > 4 && (
                          <span className="text-[10px] text-slate-500">+{item.features.length - 4}</span>
                        )}
                      </div>
                    ) : (
                      <span className="italic text-slate-400">{item.notes}</span>
                    )}
                  </div>
                )}

                {/* Bottom Row: Dealer info + 1-Tap Quick Touch Actions */}
                <div className="mt-3 pt-2.5 border-t border-white/[0.05] flex items-center justify-between gap-2">
                  <div className="truncate text-xs pr-1">
                    <p className="font-semibold text-slate-200 truncate">
                      {item.dealerName && item.dealerName !== '-' && item.dealerName.toLowerCase() !== 'dealer'
                        ? item.dealerName
                        : 'Direct Dealer'}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {item.contactNumber && item.contactNumber !== '-' ? item.contactNumber : ''}
                    </p>
                  </div>

                  {/* 1-Tap Touch Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {cleanPhone && (
                      <a
                        href={generateWhatsAppLink(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 flex items-center justify-center transition border border-emerald-500/30 active:scale-95"
                        title="WhatsApp Chat"
                      >
                        <MessageCircle className="h-4 w-4 fill-current" />
                      </a>
                    )}
                    {cleanPhone && (
                      <a
                        href={`tel:${cleanPhone}`}
                        className="w-8 h-8 rounded-lg bg-white/[0.04] text-slate-300 hover:text-white flex items-center justify-center transition border border-white/[0.08] active:scale-95"
                        title="Phone Call"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopyClient(item)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition border active:scale-95 ${
                        isCopied 
                          ? 'bg-amber-500 text-slate-950 font-bold border-amber-400' 
                          : 'bg-white/[0.04] text-slate-300 hover:text-white border-white/[0.08]'
                      }`}
                      title="Copy for Client"
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    {onMoveListing && (
                      <button
                        type="button"
                        onClick={() => onMoveListing(item)}
                        className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center transition border border-amber-500/20 active:scale-95"
                        title="Move to another Society"
                      >
                        <FolderInput className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete Plot #${item.unitNumber}?`)) onDelete(item.id);
                        }}
                        className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition border border-rose-500/20 active:scale-95"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* Enterprise High-Performance Pagination Bar */}
      {inventory.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:px-4 bg-[#0d111a] border border-white/[0.08] rounded-2xl text-xs text-slate-300">
          
          {/* Left: Range and total count */}
          <div className="flex items-center gap-2 text-slate-400">
            <span>
              Showing <strong className="text-white font-mono">{startRecord}</strong> - <strong className="text-white font-mono">{endRecord}</strong> of <strong className="text-amber-300 font-mono">{inventory.length}</strong> listings
            </span>
            {inventory.length > pageSize && (
              <span className="hidden md:inline text-slate-600">&bull;</span>
            )}
            {inventory.length > pageSize && (
              <span className="hidden md:inline text-slate-500">
                Page {safeCurrentPage} of {totalPages}
              </span>
            )}
          </div>

          {/* Right: Controls & Page numbers */}
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-1 sm:mr-2">
              <span className="hidden sm:inline">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-[#080b12] border border-white/[0.09] text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-500/60 cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={100000}>All ({inventory.length})</option>
              </select>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="inline-flex items-center gap-1">
                {/* First Page */}
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => handlePageChange(1)}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  title="First Page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>

                {/* Previous Page */}
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => handlePageChange(safeCurrentPage - 1)}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Numbered Pills */}
                <div className="flex items-center gap-1">
                  {getPageNumbers(safeCurrentPage, totalPages).map((pNum, idx) => {
                    if (pNum === '...') {
                      return <span key={`dots_${idx}`} className="px-1 text-slate-600 font-mono">...</span>;
                    }
                    const isCurrent = pNum === safeCurrentPage;
                    return (
                      <button
                        key={`page_${pNum}`}
                        type="button"
                        onClick={() => handlePageChange(pNum as number)}
                        className={`min-w-[28px] h-7 px-2 rounded-lg font-mono text-xs font-semibold transition cursor-pointer ${
                          isCurrent
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white'
                        }`}
                      >
                        {pNum}
                      </button>
                    );
                  })}
                </div>

                {/* Next Page */}
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => handlePageChange(safeCurrentPage + 1)}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Last Page */}
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => handlePageChange(totalPages)}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  title="Last Page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            )}

          </div>

        </div>
      )}

      {/* Floating Batch Actions Bar when 1 or more items are selected */}
      {someSelected && (
        <div className="fixed bottom-4 sm:bottom-6 inset-x-0 z-40 flex justify-center px-2 sm:px-4 animate-slide-down">
          <div className="bg-[#111624]/95 border border-amber-500/35 rounded-2xl p-2 sm:p-2.5 px-3 sm:px-4 shadow-2xl shadow-black/90 flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-start gap-1.5 sm:gap-3 backdrop-blur-xl max-w-xl w-full sm:w-auto">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <strong className="text-amber-300 font-mono">{selectedIds.length}</strong>
              <span className="hidden sm:inline">selected</span>
            </span>

            <div className="hidden sm:block h-4 w-px bg-white/[0.1]" />

            {/* Batch Move to Society */}
            {onBatchMove && (
              <button
                type="button"
                onClick={() => {
                  const selectedProps = inventory.filter(p => selectedIds.includes(p.id));
                  onBatchMove(selectedProps);
                }}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition cursor-pointer active:scale-95"
                title="Move selected listings to another Society"
              >
                <FolderInput className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Move Society</span>
                <span className="sm:hidden">Move</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleBatchCopyClient}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 hover:text-white transition cursor-pointer active:scale-95"
            >
              <Copy className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Copy for Client</span>
              <span className="sm:hidden">Copy</span>
            </button>

            <button
              type="button"
              onClick={handleExportSelected}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExecuteBatchDelete}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition cursor-pointer active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            <div className="hidden sm:block h-4 w-px bg-white/[0.1]" />

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer ml-auto sm:ml-0"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
