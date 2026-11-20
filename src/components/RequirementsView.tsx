import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  RefreshCw,
  Phone,
  MessageCircle,
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  ExternalLink,
  Tag,
  Building2,
  AlertCircle,
  X,
  Send,
  Zap,
  Flame,
  Check,
  ChevronDown
} from 'lucide-react';
import { DealerRequirement, PropertyListing } from '../types/inventory';
import { cleanPakistaniPhone, formatLakhs } from '../utils/pakistanCurrency';

interface RequirementsViewProps {
  onNotify?: (msg: string) => void;
  onRefreshInventory?: () => void;
  inventory?: PropertyListing[];
}

export const RequirementsView: React.FC<RequirementsViewProps> = ({
  onNotify,
  onRefreshInventory,
  inventory = [],
}) => {
  const [requirements, setRequirements] = useState<DealerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSociety, setSelectedSociety] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Plot' | 'House' | 'Commercial'>('All');
  const [selectedSize, setSelectedSize] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState<'All' | 'active' | 'fulfilled' | 'closed'>('active');

  // Match Modal State
  const [matchingReq, setMatchingReq] = useState<DealerRequirement | null>(null);
  const [matchResults, setMatchResults] = useState<{ plot: PropertyListing; score: number; reasons: string[] }[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);

  // Add Requirement Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newReq, setNewReq] = useState({
    society: 'DHA Lahore',
    block: '',
    category: 'Plot' as 'Plot' | 'House' | 'Commercial',
    marlaSize: 10,
    sizeLabel: '10 Marla',
    budgetCrores: '',
    budgetLacs: '',
    clientType: 'Cash Buyer',
    dealerName: '',
    contactNumber: '',
    notes: '',
    features: [] as string[],
  });

  const fetchRequirements = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/requirements');
      const data = await res.json();
      if (data.success && Array.isArray(data.requirements)) {
        setRequirements(data.requirements);
      }
    } catch (err: any) {
      console.error('Failed to load requirements:', err);
      if (onNotify) onNotify('Failed to fetch requirements from server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequirements();
  }, []);

  const handleStatusChange = async (id: string, newStatus: 'active' | 'fulfilled' | 'closed') => {
    try {
      const res = await fetch(`/api/requirements/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setRequirements((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
        );
        if (onNotify) onNotify(`Requirement status updated to ${newStatus}`);
      }
    } catch {
      if (onNotify) onNotify('Failed to update requirement status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this dealer requirement?')) return;
    try {
      const res = await fetch(`/api/requirements/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setRequirements((prev) => prev.filter((r) => r.id !== id));
        if (onNotify) onNotify('Requirement deleted');
      }
    } catch {
      if (onNotify) onNotify('Failed to delete requirement');
    }
  };

  const handleOpenMatchModal = async (req: DealerRequirement) => {
    setMatchingReq(req);
    setMatchingLoading(true);
    try {
      const res = await fetch('/api/requirements/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirementId: req.id }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.matches)) {
        setMatchResults(data.matches);
      } else {
        setMatchResults([]);
      }
    } catch (err) {
      console.error('Matching error:', err);
      setMatchResults([]);
    } finally {
      setMatchingLoading(false);
    }
  };

  const handleCreateManualRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReq.contactNumber || !newReq.contactNumber.trim()) {
      if (onNotify) onNotify('Dealer Contact Number is mandatory (03xx)');
      return;
    }

    let budgetInLakhs = 0;
    const cr = parseFloat(newReq.budgetCrores);
    const lac = parseFloat(newReq.budgetLacs);
    if (!isNaN(cr) && cr > 0) budgetInLakhs += cr * 100;
    if (!isNaN(lac) && lac > 0) budgetInLakhs += lac;

    const payload = {
      society: newReq.society,
      block: newReq.block.trim() || 'Any Block',
      category: newReq.category,
      marlaSize: Number(newReq.marlaSize),
      sizeLabel: Number(newReq.marlaSize) >= 20 ? `${Number(newReq.marlaSize) / 20} Kanal` : `${newReq.marlaSize} Marla`,
      budgetInLakhs,
      formattedBudget: budgetInLakhs > 0 ? formatLakhs(budgetInLakhs) : 'Budget on Call',
      clientType: newReq.clientType,
      dealerName: newReq.dealerName.trim() || 'Dealer Broadcast',
      contactNumber: newReq.contactNumber.trim(),
      notes: newReq.notes.trim(),
      features: newReq.features,
      status: 'active' as const,
      source: 'manual',
      dateAdded: new Date().toISOString().split('T')[0],
    };

    try {
      const res = await fetch('/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (onNotify) onNotify('New dealer requirement saved successfully!');
        setShowAddModal(false);
        fetchRequirements();
        setNewReq({
          society: 'DHA Lahore',
          block: '',
          category: 'Plot',
          marlaSize: 10,
          sizeLabel: '10 Marla',
          budgetCrores: '',
          budgetLacs: '',
          clientType: 'Cash Buyer',
          dealerName: '',
          contactNumber: '',
          notes: '',
          features: [],
        });
      }
    } catch {
      if (onNotify) onNotify('Failed to save requirement');
    }
  };

  // Filtered Requirements
  const filteredRequirements = useMemo(() => {
    return requirements.filter((item) => {
      // Status filter
      if (selectedStatus !== 'All' && item.status !== selectedStatus) {
        return false;
      }
      // Society filter
      if (selectedSociety !== 'All' && item.society !== selectedSociety) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false;
      }
      // Size filter
      if (selectedSize !== 'All') {
        const marla = Number(item.marlaSize) || 0;
        if (selectedSize === '3 Marla' && marla !== 3) return false;
        if (selectedSize === '5 Marla' && marla !== 5) return false;
        if (selectedSize === '8 Marla' && marla !== 8) return false;
        if (selectedSize === '10 Marla' && marla !== 10) return false;
        if (selectedSize === '1 Kanal' && marla !== 20) return false;
        if (selectedSize === '2 Kanal' && marla !== 40) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSociety = (item.society || '').toLowerCase().includes(q);
        const matchesBlock = (item.block || '').toLowerCase().includes(q);
        const matchesDealer = (item.dealerName || '').toLowerCase().includes(q);
        const matchesPhone = (item.contactNumber || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        const matchesNotes = (item.notes || '').toLowerCase().includes(q);
        const matchesRaw = (item.rawText || '').toLowerCase().includes(q);
        const matchesBudget = (item.formattedBudget || '').toLowerCase().includes(q);
        return matchesSociety || matchesBlock || matchesDealer || matchesPhone || matchesNotes || matchesRaw || matchesBudget;
      }
      return true;
    });
  }, [requirements, selectedStatus, selectedSociety, selectedCategory, selectedSize, searchQuery]);

  const activeCount = requirements.filter((r) => r.status === 'active' || !r.status).length;
  const fulfilledCount = requirements.filter((r) => r.status === 'fulfilled').length;

  // Extract unique societies from requirements
  const societiesList = useMemo(() => {
    const set = new Set<string>();
    requirements.forEach((r) => {
      if (r.society) set.add(r.society);
    });
    return Array.from(set).sort();
  }, [requirements]);

  const sendMatchViaWhatsApp = (dealerPhone: string, dealerName: string, req: DealerRequirement, plot: PropertyListing) => {
    const cleanPhone = cleanPakistaniPhone(dealerPhone);
    const message = encodeURIComponent(
      `Salam ${dealerName || 'Bhai'},\n\nAapki WhatsApp requirement ke mutabiq hamare paas yeh option direct available hai:\n\n` +
      `📍 *Society:* ${plot.society}\n` +
      `🏷️ *Block & Plot:* ${plot.block} - Plot #${plot.unitNumber}\n` +
      `📐 *Size:* ${plot.sizeLabel || plot.marlaSize + ' Marla'}\n` +
      `💰 *Demand:* ${plot.formattedPrice || formatLakhs(plot.priceInLakhs)}\n` +
      `${plot.features && plot.features.length > 0 ? `✨ *Features:* ${plot.features.join(', ')}\n` : ''}` +
      `\nReady for immediate token/deal. Check karke batayein agar buyer serious hai.\n\n_Umer Realtors Lahore_`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const sendGeneralWhatsApp = (req: DealerRequirement) => {
    const cleanPhone = cleanPakistaniPhone(req.contactNumber);
    const message = encodeURIComponent(
      `Salam ${req.dealerName || 'Bhai'},\n\nAapki requirement dekhi thi WhatsApp group me:\n` +
      `*${req.society}* ${req.block ? `(${req.block})` : ''} - *${req.sizeLabel || req.marlaSize + ' Marla'}* ${req.category}\n` +
      `Budget: ${req.formattedBudget}\n\n` +
      `Kya yeh demand abhi bhi active hai? Hamare paas options available hain.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-950/70 via-[#0e1320] to-[#0b0f19] border border-violet-500/25 p-6 shadow-2xl backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="p-2.5 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-violet-300 border border-violet-500/30 shadow-lg shadow-violet-500/10">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </span>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  Dealer Requirements Hub
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    Buyers Demands
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Buyer and dealer property demands captured from WhatsApp broadcasts.
                </p>
              </div>
            </div>

            {/* Quick Stat Badges */}
            <div className="flex flex-wrap items-center gap-3 mt-4 text-xs font-medium">
              <div className="px-3.5 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                <span>Active Demands: <strong className="text-white font-bold">{activeCount}</strong></span>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Fulfilled / Closed: <strong className="text-white font-bold">{fulfilledCount}</strong></span>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Total Received: <strong className="text-white font-bold">{requirements.length}</strong></span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={fetchRequirements}
              disabled={loading}
              className="px-3.5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-300 hover:text-white transition flex items-center gap-2 text-sm font-medium"
              title="Refresh requirements"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-violet-400' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-violet-600/30 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Demand</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl bg-[#0d111a] border border-white/[0.08] p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by society, block, dealer name, phone (03xx), or notes..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/60 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 self-start md:self-auto">
            {(['active', 'fulfilled', 'closed', 'All'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  selectedStatus === st
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {st === 'All' ? 'All Status' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdown Filters Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06] text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 mr-1">
            <Filter className="w-3.5 h-3.5 text-violet-400" />
            <span>Filters:</span>
          </div>

          {/* Society Dropdown */}
          <select
            value={selectedSociety}
            onChange={(e) => setSelectedSociety(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-violet-500"
          >
            <option value="All">All Societies ({societiesList.length})</option>
            {societiesList.map((soc) => (
              <option key={soc} value={soc}>{soc}</option>
            ))}
          </select>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-violet-500"
          >
            <option value="All">All Categories</option>
            <option value="Plot">Plot</option>
            <option value="House">House</option>
            <option value="Commercial">Commercial</option>
          </select>

          {/* Size Dropdown */}
          <select
            value={selectedSize}
            onChange={(e) => setSelectedSize(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-violet-500"
          >
            <option value="All">All Sizes</option>
            <option value="3 Marla">3 Marla</option>
            <option value="5 Marla">5 Marla</option>
            <option value="8 Marla">8 Marla</option>
            <option value="10 Marla">10 Marla</option>
            <option value="1 Kanal">1 Kanal (20 Marla)</option>
            <option value="2 Kanal">2 Kanal (40 Marla)</option>
          </select>

          {(selectedSociety !== 'All' || selectedCategory !== 'All' || selectedSize !== 'All' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedSociety('All');
                setSelectedCategory('All');
                setSelectedSize('All');
                setSearchQuery('');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs transition ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Requirements List Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading dealer requirements...</p>
        </div>
      ) : filteredRequirements.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-[#0d111a] border border-white/[0.08] p-8 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No Dealer Requirements Found</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-1">
              {searchQuery || selectedSociety !== 'All' || selectedCategory !== 'All'
                ? 'Try adjusting your search query or reset your filters.'
                : 'Jab bhi WhatsApp group me kisi dealer ki requirement aayegi (e.g. "Required 1 Kanal DHA Phase 6 cash buyer"), AI use automatic detect karke yahan add kar dega.'}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Manual Requirement</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
          {filteredRequirements.map((req, idx) => {
            const cleanPhone = cleanPakistaniPhone(req.contactNumber);
            const isFulfilled = req.status === 'fulfilled';
            const isClosed = req.status === 'closed';

            return (
              <div
                key={`${req.id || 'req'}_${idx}`}
                className={`rounded-2xl bg-[#0d111a] border p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 relative overflow-hidden group ${
                  isFulfilled
                    ? 'border-emerald-500/30 opacity-80'
                    : isClosed
                    ? 'border-slate-800 opacity-60'
                    : 'border-white/[0.09] hover:border-violet-500/40'
                }`}
              >
                {/* Subtle top indicator */}
                <div
                  className={`absolute top-0 inset-x-0 h-1 ${
                    isFulfilled
                      ? 'bg-emerald-500'
                      : isClosed
                      ? 'bg-slate-700'
                      : 'bg-gradient-to-r from-violet-500 to-purple-500'
                  }`}
                />

                <div>
                  {/* Header Row: Category, Society, and Status Dropdown */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        {req.category || 'Plot'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                        {req.sizeLabel || req.marlaSize + ' Marla'}
                      </span>
                      {req.clientType && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                          {req.clientType}
                        </span>
                      )}
                    </div>

                    {/* Status Pill / Toggle */}
                    <select
                      value={req.status || 'active'}
                      onChange={(e) => handleStatusChange(req.id, e.target.value as any)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-md border appearance-none cursor-pointer focus:outline-none transition ${
                        req.status === 'fulfilled'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : req.status === 'closed'
                          ? 'bg-slate-800 text-slate-400 border-slate-700'
                          : 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                      }`}
                    >
                      <option value="active">Active Demand</option>
                      <option value="fulfilled">Fulfilled (Done)</option>
                      <option value="closed">Closed / Expired</option>
                    </select>
                  </div>

                  {/* Society & Block */}
                  <h3 className="text-lg font-bold text-white group-hover:text-violet-300 transition flex items-center gap-1.5">
                    <span>{req.society}</span>
                    {req.block && req.block !== 'Any Block' && req.block !== '-' && (
                      <span className="text-sm font-normal text-slate-400">({req.block})</span>
                    )}
                  </h3>

                  {/* Budget Highlight */}
                  <div className="mt-3 p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Client Budget</span>
                      <div className="text-base font-extrabold text-amber-400">
                        {req.formattedBudget || (req.budgetInLakhs ? formatLakhs(req.budgetInLakhs) : 'Budget on Call')}
                      </div>
                    </div>
                    {req.dateAdded && (
                      <div className="text-right text-[11px] text-slate-500">
                        <span>Date: </span>
                        <span className="text-slate-400">{req.dateAdded}</span>
                      </div>
                    )}
                  </div>

                  {/* Tags / Features */}
                  {req.features && req.features.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {req.features.map((feat, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-[10px] bg-white/[0.04] text-slate-300 border border-white/[0.08]"
                        >
                          #{feat}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes / Raw snippet */}
                  {req.notes && (
                    <div className="mt-3 text-xs text-slate-400 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04] line-clamp-2 italic">
                      "{req.notes}"
                    </div>
                  )}

                  {/* Dealer Info */}
                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">{req.dealerName || 'WhatsApp Dealer'}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{req.contactNumber}</div>
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                      {req.source ? req.source.replace('whatsapp_live:', 'WA Live') : 'WhatsApp'}
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons Footer */}
                <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-2">
                  {/* Match Button */}
                  <button
                    onClick={() => handleOpenMatchModal(req)}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-violet-500/20 hover:from-amber-500/30 hover:to-violet-500/30 border border-amber-500/30 text-amber-200 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Match with Inventory Plots</span>
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => sendGeneralWhatsApp(req)}
                      className="py-1.5 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition flex items-center justify-center gap-1"
                      title="Send WhatsApp message to dealer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>WhatsApp</span>
                    </button>

                    <a
                      href={`tel:${cleanPhone}`}
                      className="py-1.5 px-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition flex items-center justify-center gap-1"
                      title="Call dealer directly"
                    >
                      <Phone className="w-3.5 h-3.5 text-blue-400" />
                      <span>Call</span>
                    </a>

                    <button
                      onClick={() => handleDelete(req.id)}
                      className="py-1.5 px-2 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/20 text-xs font-medium transition flex items-center justify-center gap-1"
                      title="Delete requirement"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* INVENTORY MATCH MODAL */}
      {/* ======================================================== */}
      {matchingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-3xl rounded-3xl bg-[#0e1320] border border-violet-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-violet-950/80 via-black to-[#0e1320] border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Instant Inventory Match
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                      {matchResults.length} Matches Found
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Requirement: <strong className="text-white">{matchingReq.society}</strong> ({matchingReq.block}) •{' '}
                    <strong className="text-white">{matchingReq.sizeLabel || matchingReq.marlaSize + ' Marla'}</strong> • Budget:{' '}
                    <strong className="text-amber-400">{matchingReq.formattedBudget}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMatchingReq(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {matchingLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-sm text-slate-400">Searching master inventory for matching plots...</p>
                </div>
              ) : matchResults.length === 0 ? (
                <div className="py-12 text-center rounded-2xl bg-black/40 border border-white/10 p-6 space-y-3">
                  <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
                  <h3 className="text-base font-bold text-white">No Direct Plot Matches Right Now</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Aapke master inventory me filhal is size aur society ka plot available nahi hai, ya demand budget se bohot ziada hai.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {matchResults.map(({ plot, score, reasons }, idx) => {
                    const priceDiff = matchingReq.budgetInLakhs && plot.priceInLakhs
                      ? plot.priceInLakhs - matchingReq.budgetInLakhs
                      : 0;

                    return (
                      <div
                        key={`${plot.id || 'match'}_${idx}`}
                        className="rounded-2xl bg-black/50 border border-white/10 hover:border-violet-500/40 p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-violet-600 text-white">
                              {score}% MATCH
                            </span>
                            <span className="text-sm font-bold text-white">
                              {plot.society} — {plot.block}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300">
                              Plot #{plot.unitNumber}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                            <span>Size: <strong className="text-white">{plot.sizeLabel || plot.marlaSize + ' Marla'}</strong></span>
                            <span>•</span>
                            <span>Price: <strong className="text-amber-400 font-bold">{plot.formattedPrice || formatLakhs(plot.priceInLakhs)}</strong></span>
                            {priceDiff !== 0 && (
                              <span className={`text-[11px] font-semibold ${priceDiff < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ({priceDiff < 0 ? `${Math.abs(priceDiff)} Lakh Under Budget` : `+${priceDiff} Lakh Over`})
                              </span>
                            )}
                          </div>

                          {/* Match Reasons */}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {reasons.map((r, rIdx) => (
                              <span
                                key={rIdx}
                                className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              >
                                ✓ {r}
                              </span>
                            ))}
                          </div>

                          <div className="text-[11px] text-slate-400 pt-1">
                            Inventory Dealer: <strong className="text-slate-200">{plot.dealerName}</strong> ({plot.contactNumber})
                          </div>
                        </div>

                        {/* Direct Action: Send to Buyer Dealer */}
                        <div className="flex flex-col sm:flex-row gap-2 self-stretch md:self-center">
                          <button
                            onClick={() => sendMatchViaWhatsApp(matchingReq.contactNumber, matchingReq.dealerName, matchingReq, plot)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                            title="Send this plot option directly to the dealer who asked for it"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Share with Buyer Dealer</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-black/40 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
              <span>Matching algorithm checks Society, Size (Marla), Category, and Budget tolerance.</span>
              <button
                onClick={() => setMatchingReq(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white transition font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MANUAL ADD REQUIREMENT MODAL */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl rounded-3xl bg-[#0e1320] border border-violet-500/30 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 bg-gradient-to-r from-violet-950/80 to-[#0e1320] border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-violet-500/20 text-violet-300">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-white">Add Dealer Requirement</h2>
                  <p className="text-xs text-slate-400">Record a buyer demand manually</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualRequirement} className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Society *</label>
                  <input
                    type="text"
                    required
                    value={newReq.society}
                    onChange={(e) => setNewReq({ ...newReq, society: e.target.value })}
                    placeholder="e.g. DHA Lahore, Bahria Town, Lake City"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Block / Phase</label>
                  <input
                    type="text"
                    value={newReq.block}
                    onChange={(e) => setNewReq({ ...newReq, block: e.target.value })}
                    placeholder="e.g. Phase 6 - Block C, Sector C"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={newReq.category}
                    onChange={(e) => setNewReq({ ...newReq, category: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                  >
                    <option value="Plot">Plot</option>
                    <option value="House">House</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Size (Marla)</label>
                  <select
                    value={newReq.marlaSize}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setNewReq({
                        ...newReq,
                        marlaSize: m,
                        sizeLabel: m >= 20 ? `${m / 20} Kanal` : `${m} Marla`,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                  >
                    <option value={3}>3 Marla</option>
                    <option value={5}>5 Marla</option>
                    <option value={8}>8 Marla</option>
                    <option value={10}>10 Marla</option>
                    <option value={20}>1 Kanal (20 Marla)</option>
                    <option value={40}>2 Kanal (40 Marla)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Client Type</label>
                  <select
                    value={newReq.clientType}
                    onChange={(e) => setNewReq({ ...newReq, clientType: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                  >
                    <option value="Cash Buyer">Cash Buyer</option>
                    <option value="Direct Client">Direct Client</option>
                    <option value="Investor">Investor</option>
                    <option value="Urgent">Urgent Deal</option>
                  </select>
                </div>
              </div>

              {/* Budget input in Crores & Lacs */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Budget (PKR)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={newReq.budgetCrores}
                      onChange={(e) => setNewReq({ ...newReq, budgetCrores: e.target.value })}
                      placeholder="e.g. 4.25"
                      className="w-full px-3 py-2 pr-14 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Crore</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={newReq.budgetLacs}
                      onChange={(e) => setNewReq({ ...newReq, budgetLacs: e.target.value })}
                      placeholder="e.g. 50"
                      className="w-full px-3 py-2 pr-14 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">Lacs</span>
                  </div>
                </div>
              </div>

              {/* Dealer Contact info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Dealer / Source Name</label>
                  <input
                    type="text"
                    value={newReq.dealerName}
                    onChange={(e) => setNewReq({ ...newReq, dealerName: e.target.value })}
                    placeholder="e.g. Ch. Kamran"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Contact Number (03xx) *</label>
                  <input
                    type="text"
                    required
                    value={newReq.contactNumber}
                    onChange={(e) => setNewReq({ ...newReq, contactNumber: e.target.value })}
                    placeholder="e.g. 0300 1234567"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes / Specific Requirements</label>
                <textarea
                  rows={2}
                  value={newReq.notes}
                  onChange={(e) => setNewReq({ ...newReq, notes: e.target.value })}
                  placeholder="e.g. Direct cash deal, ready to transfer, needs 60ft road or park facing"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-lg shadow-violet-600/30"
                >
                  Save Demand
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
