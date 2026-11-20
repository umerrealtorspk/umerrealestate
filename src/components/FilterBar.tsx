import React from 'react';
import { Search, X, RotateCcw, SlidersHorizontal, ArrowUpDown, Tag } from 'lucide-react';
import { FilterState } from '../types/inventory';
import { formatLakhs } from '../utils/pakistanCurrency';

interface FilterBarProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  totalMatches: number;
  totalInventory: number;
  availableBlocks: string[];
  viewMode: 'table' | 'cards';
  setViewMode: (mode: 'table' | 'cards') => void;
}

const CATEGORIES = [
  { id: 'All', label: 'All Types' },
  { id: 'Plot', label: 'Plots' },
  { id: 'House', label: 'Houses' },
  { id: 'Commercial', label: 'Commercial' },
] as const;

const POPULAR_SIZES = ['All', '5 Marla', '8 Marla', '10 Marla', '1 Kanal', '2 Kanal'];

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  setFilters,
  totalMatches,
  totalInventory,
  availableBlocks,
  viewMode,
  setViewMode,
}) => {
  const isFiltered =
    filters.searchQuery !== '' ||
    filters.category !== 'All' ||
    filters.size !== 'All' ||
    filters.maxPrice < 1000 ||
    (filters.selectedFeatures && filters.selectedFeatures.length > 0);

  const handleReset = () => {
    setFilters({
      searchQuery: '',
      society: filters.society, // preserve current society
      category: 'All',
      size: 'All',
      minPrice: 0,
      maxPrice: 1000,
      selectedFeatures: [],
      sortBy: 'recent',
    });
  };

  const getPriceLabel = () => {
    if (filters.maxPrice >= 1000) return 'No Limit';
    if (filters.maxPrice >= 100) {
      return `Up to ${(filters.maxPrice / 100).toFixed(1)} Crore`;
    }
    return `Up to ${filters.maxPrice} Lac`;
  };

  return (
    <div className="space-y-3.5">
      {/* Main Command & Filter Box */}
      <div className="rounded-2xl bg-[#0d111a] border border-white/[0.08] p-4 sm:p-5 shadow-xl shadow-black/30 space-y-4">
        
        {/* Top Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="h-4.5 w-4.5 text-amber-400/80" />
          </div>
          <input
            type="text"
            value={filters.searchQuery}
            onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
            placeholder="Search plot # (e.g. 1798), block, dealer name, phone or features (e.g. Corner, MB Paid)..."
            className="w-full pl-11 pr-24 py-3 bg-[#080b12] border border-white/[0.08] focus:border-amber-500/60 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none transition-all shadow-inner"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5">
            {filters.searchQuery ? (
              <button
                type="button"
                onClick={() => setFilters(prev => ({ ...prev, searchQuery: '' }))}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 cursor-pointer transition"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono text-slate-500 bg-white/[0.05] border border-white/[0.08] rounded-md">
                <span>Press</span>
                <span className="font-bold text-slate-400">/</span>
              </kbd>
            )}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-1 items-end">
          
          {/* 1. Category Segmented Buttons (4 cols) */}
          <div className="md:col-span-4 space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>Property Category</span>
            </label>
            <div className="grid grid-cols-4 p-1 rounded-xl bg-[#080b12] border border-white/[0.08]">
              {CATEGORIES.map(cat => {
                const isActive = filters.category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFilters(prev => ({ ...prev, category: cat.id as any }))}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Size Selector (3 cols) */}
          <div className="md:col-span-3 space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Size / Marla</label>
            <select
              value={filters.size}
              onChange={e => setFilters(prev => ({ ...prev, size: e.target.value }))}
              className="w-full bg-[#080b12] border border-white/[0.08] focus:border-amber-500/60 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none transition cursor-pointer"
            >
              {POPULAR_SIZES.map(s => (
                <option key={s} value={s} className="bg-slate-900 text-slate-200">
                  {s === 'All' ? 'All Sizes (Any Marla)' : s}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Demand Price Slider (3 cols) */}
          <div className="md:col-span-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-400">Demand Budget</label>
              <span className="text-xs font-mono font-bold text-amber-300">
                {getPriceLabel()}
              </span>
            </div>
            <div className="px-1 py-1">
              <input
                type="range"
                min="10"
                max="1000"
                step="10"
                value={filters.maxPrice}
                onChange={e => setFilters(prev => ({ ...prev, maxPrice: Number(e.target.value) }))}
                className="w-full accent-amber-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
            </div>
          </div>

          {/* 4. Sort Selector (2 cols) */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Sort By</label>
            <select
              value={filters.sortBy}
              onChange={e => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
              className="w-full bg-[#080b12] border border-white/[0.08] focus:border-amber-500/60 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-200 focus:outline-none transition cursor-pointer"
            >
              <option value="recent" className="bg-slate-900">Newest First</option>
              <option value="price-asc" className="bg-slate-900">Price: Low to High</option>
              <option value="price-desc" className="bg-slate-900">Price: High to Low</option>
              <option value="unit" className="bg-slate-900">Plot # (Ascending)</option>
            </select>
          </div>

        </div>

      </div>

      {/* Results Bar & Active Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">
            Showing <strong className="text-white font-mono">{totalMatches}</strong> of <span className="font-mono">{totalInventory}</span> properties
          </span>

          {isFiltered && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer ml-2 transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset filters</span>
            </button>
          )}
        </div>

        {/* View Mode Toggle for Small/Mid screens */}
        <div className="flex lg:hidden items-center p-0.5 rounded-lg bg-slate-900 border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
              viewMode === 'table' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
            }`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
              viewMode === 'cards' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
            }`}
          >
            Cards
          </button>
        </div>
      </div>
    </div>
  );
};
