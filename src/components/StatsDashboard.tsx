import React, { useMemo, useState, useRef } from 'react';
import { PropertyListing } from '../types/inventory';
import { 
  Building2, 
  MapPin, 
  Home, 
  TrendingUp,
  Coins,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Layers,
  ListFilter,
  Search
} from 'lucide-react';
import { LAHORE_SOCIETIES } from '../data/seedInventory';

interface StatsDashboardProps {
  inventory: PropertyListing[];
  selectedSociety: string;
  onSelectSociety: (society: string) => void;
  societies?: string[];
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({
  inventory,
  selectedSociety,
  onSelectSociety,
  societies,
}) => {
  const societiesToRender = societies && societies.length > 0 ? societies : LAHORE_SOCIETIES;
  const [isExpandedList, setIsExpandedList] = useState(false);
  const [societySearch, setSocietySearch] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // High-performance single-pass calculation across entire inventory
  const { totalPlots, totalHouses, totalCommercial, avgFormatted, activeCount, societyCounts } = useMemo(() => {
    let plots = 0;
    let houses = 0;
    let comm = 0;
    let totalPrice = 0;
    let validPriceCount = 0;
    let active = 0;
    const socMap: Record<string, number> = {};

    for (let i = 0; i < inventory.length; i++) {
      const p = inventory[i];
      if (p.isSold) continue;
      active++;

      if (p.category === 'Plot') plots++;
      else if (p.category === 'House') houses++;
      else if (p.category === 'Commercial') comm++;

      if (p.priceInLakhs && p.priceInLakhs > 0) {
        totalPrice += p.priceInLakhs;
        validPriceCount++;
      }

      if (p.society) {
        socMap[p.society] = (socMap[p.society] || 0) + 1;
      }
    }

    const avg = validPriceCount > 0 ? Math.round(totalPrice / validPriceCount) : 0;
    let formatted = `${avg} Lac`;
    if (avg >= 100) {
      formatted = `${(avg / 100).toFixed(2)} Cr`;
    }

    return {
      totalPlots: plots,
      totalHouses: houses,
      totalCommercial: comm,
      avgFormatted: formatted,
      activeCount: active,
      societyCounts: socMap
    };
  }, [inventory]);

  const filteredSocieties = useMemo(() => {
    if (!societySearch.trim()) return societiesToRender;
    const term = societySearch.toLowerCase().trim();
    return societiesToRender.filter(s => s.toLowerCase().includes(term));
  }, [societiesToRender, societySearch]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const offset = direction === 'left' ? -240 : 240;
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-4">
      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        
        {/* Total Active Properties */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#111622] to-[#0c1018] border border-white/[0.08] p-3.5 sm:p-4.5 transition-all duration-200 hover:border-amber-500/30 hover:shadow-lg hover:shadow-black/40 group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-slate-400">Total Listings</span>
            <div className="w-7 sm:w-8 h-7 sm:h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
              <Layers className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
              {activeCount}
            </span>
            <span className="text-[10px] sm:text-xs text-emerald-400 font-medium flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> Live
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.05] text-[10px] sm:text-[11px] text-slate-400 flex items-center justify-between">
            <span>All Lahore</span>
            <span className="text-slate-500 font-mono">Synced</span>
          </div>
        </div>

        {/* Plots for Sale */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#111622] to-[#0c1018] border border-white/[0.08] p-3.5 sm:p-4.5 transition-all duration-200 hover:border-amber-500/30 hover:shadow-lg hover:shadow-black/40 group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-slate-400">Plots For Sale</span>
            <div className="w-7 sm:w-8 h-7 sm:h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
              <MapPin className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-300 tracking-tight font-mono">
              {totalPlots}
            </span>
            <span className="text-xs text-slate-400">plots</span>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.05] text-[10px] sm:text-[11px] text-slate-400 flex items-center justify-between">
            <span>5M, 8M, 10M, 1K</span>
            <span className="text-amber-400/80 font-mono">
              {totalCommercial > 0 ? `+${totalCommercial} Comm.` : 'Residential'}
            </span>
          </div>
        </div>

        {/* Ready Houses & Villas */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#111622] to-[#0c1018] border border-white/[0.08] p-3.5 sm:p-4.5 transition-all duration-200 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-black/40 group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-slate-400">Houses &amp; Villas</span>
            <div className="w-7 sm:w-8 h-7 sm:h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <Home className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-300 tracking-tight font-mono">
              {totalHouses}
            </span>
            <span className="text-xs text-slate-400">units</span>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.05] text-[10px] sm:text-[11px] text-slate-400 flex items-center justify-between">
            <span>Ready houses</span>
            <span className="text-emerald-400/80 font-mono">Verified</span>
          </div>
        </div>

        {/* Average Demand */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#111622] to-[#0c1018] border border-white/[0.08] p-3.5 sm:p-4.5 transition-all duration-200 hover:border-sky-500/30 hover:shadow-lg hover:shadow-black/40 group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-slate-400">Average Demand</span>
            <div className="w-7 sm:w-8 h-7 sm:h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
              <Coins className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            </div>
          </div>
          <div className="mt-2.5 sm:mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-sky-300 tracking-tight font-mono">
              {avgFormatted}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.05] text-[10px] sm:text-[11px] text-slate-400 flex items-center justify-between">
            <span>Market Benchmark</span>
            <span className="text-sky-400/80 font-mono">PKR</span>
          </div>
        </div>

      </div>

      {/* Lahore Societies Segmented List & Hotlist Bar */}
      <div className="rounded-2xl bg-[#0d111a] border border-white/[0.08] p-2.5 sm:p-3 shadow-lg shadow-black/20 space-y-2.5">
        
        {/* Societies Bar Header: List Bar Controls & Direct Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          
          {/* Left: Direct Society List Bar Dropdown */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-300 bg-white/[0.04] border border-white/[0.06] rounded-xl shrink-0">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Societies List Bar:</span>
            </div>

            {/* Direct List Bar Selector */}
            <div className="relative shrink-0">
              <select
                value={selectedSociety}
                onChange={(e) => onSelectSociety(e.target.value)}
                className="appearance-none bg-[#080b12] text-amber-300 font-semibold text-xs pl-3 pr-8 py-1.5 rounded-xl border border-amber-500/30 hover:border-amber-500/60 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500/50 cursor-pointer shadow-inner transition"
                title="Direct society selection list"
              >
                {societiesToRender.map(soc => {
                  const count = soc === 'All Lahore' ? activeCount : (societyCounts[soc] || 0);
                  return (
                    <option key={soc} value={soc} className="bg-slate-900 text-slate-100 py-1">
                      {soc} ({count} {count === 1 ? 'property' : 'properties'})
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-amber-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Current Active Society Badge */}
            <span className="hidden sm:inline-flex text-[11px] text-slate-400 items-center gap-1.5 bg-white/[0.02] px-2 py-0.5 rounded-lg border border-white/[0.04]">
              <span>Active:</span>
              <strong className="text-white font-medium">{selectedSociety}</strong>
              <span className="text-amber-400 font-mono">
                ({selectedSociety === 'All Lahore' ? activeCount : (societyCounts[selectedSociety] || 0)})
              </span>
            </span>
          </div>

          {/* Right: Quick Search + Expand All List Bar + Scroll buttons */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Quick search input */}
            {societiesToRender.length > 5 && (
              <div className="relative">
                <input
                  type="text"
                  value={societySearch}
                  onChange={(e) => setSocietySearch(e.target.value)}
                  placeholder="Filter societies..."
                  className="bg-[#080b12] text-[11px] text-slate-200 placeholder-slate-500 pl-6 pr-5 py-1 rounded-lg border border-white/[0.08] focus:border-amber-500/50 focus:outline-none w-28 sm:w-36 transition"
                />
                <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                {societySearch && (
                  <button 
                    type="button"
                    onClick={() => setSocietySearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* Scroll navigation buttons for horizontal bar mode */}
            {!isExpandedList && (
              <div className="hidden sm:flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => handleScroll('left')}
                  className="p-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition cursor-pointer"
                  title="Scroll left"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleScroll('right')}
                  className="p-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition cursor-pointer"
                  title="Scroll right"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Expand / Collapse All Societies List Bar */}
            <button
              type="button"
              onClick={() => setIsExpandedList(prev => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium transition cursor-pointer border ${
                isExpandedList
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-xs'
                  : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] border-white/[0.06]'
              }`}
              title={isExpandedList ? "Switch to single-line scroll bar" : "Expand all societies boxes into full list view"}
            >
              <ListFilter className="w-3 h-3 text-amber-400" />
              <span>{isExpandedList ? 'Single Line' : `All Societies (${societiesToRender.length})`}</span>
            </button>
          </div>

        </div>

        {/* Societies Boxes List Container */}
        <div
          ref={scrollContainerRef}
          className={`${
            isExpandedList
              ? 'flex flex-wrap gap-1.5 pt-1 max-h-56 overflow-y-auto pr-1'
              : 'flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth'
          }`}
        >
          {filteredSocieties.length === 0 ? (
            <div className="text-xs text-slate-500 py-1 px-2 italic">
              No society found matching &quot;{societySearch}&quot;
            </div>
          ) : (
            filteredSocieties.map(soc => {
              const isSelected = selectedSociety === soc;
              const count = soc === 'All Lahore'
                ? activeCount
                : (societyCounts[soc] || 0);
              const hasListings = count > 0;

              return (
                <button
                  key={soc}
                  type="button"
                  onClick={() => onSelectSociety(soc)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all duration-150 cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/25 ring-1 ring-amber-400'
                      : hasListings
                        ? 'bg-white/[0.04] text-slate-200 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
                        : 'bg-white/[0.02] text-slate-400 hover:text-slate-300 hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  <span>{soc}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono transition-colors ${
                    isSelected 
                      ? 'bg-slate-950/20 text-slate-950 font-bold' 
                      : hasListings 
                        ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/20' 
                        : 'bg-white/[0.06] text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
