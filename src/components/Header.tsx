import React, { useState } from 'react';
import { 
  Building2, 
  Sparkles, 
  Plus, 
  LayoutGrid,
  List,
  LogOut,
  UserCheck,
  Bot,
  HardDrive,
  RefreshCw,
  SlidersHorizontal,
  CloudCheck,
  ChevronDown,
  FileSpreadsheet,
  Database,
  MessageSquare,
  ClipboardList
} from 'lucide-react';
import { SheetConfig } from '../types/inventory';
import { getPersistedUser } from '../services/googleDriveAuth';

interface HeaderProps {
  onOpenChatUploader: () => void;
  onOpenSheetsModal: () => void;
  onOpenAddModal: () => void;
  sheetConfig: SheetConfig;
  viewMode: 'table' | 'cards';
  setViewMode: (mode: 'table' | 'cards') => void;
  onOpenDriveManager?: () => void;
  onOpenMigrationModal?: () => void;
  onOpenWhatsAppAutomation?: () => void;
  adminUser?: string;
  onSignOut?: () => void;
  cloudSyncStatus?: 'live' | 'saving' | 'offline';
  onForceSyncLive?: () => void;
  totalListingsCount?: number;
  currentSection?: 'inventory' | 'requirements';
  setCurrentSection?: (section: 'inventory' | 'requirements') => void;
  activeRequirementsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenChatUploader,
  onOpenSheetsModal,
  onOpenAddModal,
  sheetConfig,
  viewMode,
  setViewMode,
  onOpenDriveManager,
  onOpenMigrationModal,
  onOpenWhatsAppAutomation,
  adminUser = 'Umer23',
  onSignOut,
  cloudSyncStatus = 'live',
  onForceSyncLive,
  totalListingsCount,
  currentSection = 'inventory',
  setCurrentSection,
  activeRequirementsCount = 0,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const driveUser = getPersistedUser();

  return (
    <header className="sticky top-0 z-30 bg-[#0a0d15]/95 backdrop-blur-xl border-b border-white/[0.08] transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-1.5 sm:gap-3">
        
        {/* Left: Brand Identity & Product Name */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20 ring-1 ring-amber-400/40 shrink-0">
            <Building2 className="h-4 sm:h-5 w-4 sm:w-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-sm sm:text-base md:text-lg tracking-tight text-white flex items-center">
                Umer Realtors
              </span>
              <span className="hidden sm:inline-flex items-center text-[10px] font-semibold text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                CRM
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden md:flex items-center gap-1.5 leading-none mt-0.5">
              <span>Lahore Real Estate</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">Inventory &amp; Demands</span>
            </p>
          </div>
        </div>

        {/* Center: Primary Section Navigation (Inventory vs Dealer Requirements) */}
        <div className="hidden md:flex items-center gap-3">
          {setCurrentSection && (
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-900/90 border border-white/[0.09] shadow-inner">
              <button
                type="button"
                onClick={() => setCurrentSection('inventory')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentSection === 'inventory'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>Inventory</span>
                {totalListingsCount !== undefined && totalListingsCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold ${
                    currentSection === 'inventory' ? 'bg-slate-950/20 text-slate-950' : 'bg-white/10 text-slate-300'
                  }`}>
                    {totalListingsCount.toLocaleString()}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCurrentSection('requirements')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentSection === 'requirements'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                <span>Dealer Requirements</span>
                {activeRequirementsCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold ${
                    currentSection === 'requirements' ? 'bg-white/20 text-white' : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  }`}>
                    {activeRequirementsCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* View Segmented Toggle (Table vs Cards) - shown when in inventory view */}
          {currentSection === 'inventory' && (
            <div className="inline-flex items-center p-1 rounded-lg bg-slate-900/90 border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Cards</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions Group & Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          
          {/* 6.4k Firebase to Google Sheets Migration Button */}
          {onOpenMigrationModal && (
            <button
              type="button"
              onClick={onOpenMigrationModal}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-all duration-150 cursor-pointer shadow-xs active:scale-95"
              title="Open Firebase to Google Sheets Database Migration Engine (6,470 records)"
            >
              <Database className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Migrate 6.4k</span>
            </button>
          )}

          {/* Google Drive Manager Button */}
          {onOpenDriveManager && (
            <button
              type="button"
              onClick={onOpenDriveManager}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-white/[0.08] hover:border-amber-500/30 transition-all duration-150 cursor-pointer shadow-xs active:scale-95"
              title="Google Drive Lahore Data Folder"
            >
              <HardDrive className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Google Drive</span>
              {driveUser && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Connected" />
              )}
            </button>
          )}

          {/* WhatsApp Meta Automation Hub Button */}
          {onOpenWhatsAppAutomation && (
            <button
              type="button"
              onClick={onOpenWhatsAppAutomation}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all duration-150 cursor-pointer shadow-xs active:scale-95"
              title="Meta WhatsApp Business Cloud Webhook & Live AI Auto-Import"
            >
              <MessageSquare className="h-3.5 w-3.5 text-emerald-400 fill-emerald-400/20" />
              <span className="hidden sm:inline">WhatsApp Auto</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </button>
          )}



          {/* Add Listing Button */}
          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-white/[0.08] hover:border-slate-700 transition-all duration-150 cursor-pointer active:scale-95"
            title="Add Manual Property Listing"
          >
            <Plus className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Add Plot</span>
          </button>

          {/* AI Chat Import - Primary Highlight Button */}
          <button
            type="button"
            onClick={onOpenChatUploader}
            className="relative group inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 transition-all duration-150 shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
          >
            <Bot className="h-4 w-4 fill-slate-950" />
            <span className="whitespace-nowrap">AI Assistant</span>
            <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-950/15 text-slate-950 font-bold border border-slate-950/20">
              Live
            </span>
          </button>

          {/* User Account / Profile Menu */}
          <div className="relative pl-1 border-l border-white/[0.08] ml-0.5 sm:ml-1">
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent hover:border-white/[0.08] transition-all cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-xs">
                {adminUser.charAt(0).toUpperCase()}
              </div>
              <span className="hidden md:inline font-medium text-slate-200">{adminUser}</span>
              <ChevronDown className="hidden md:block w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsUserMenuOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-[#0f1420] border border-white/[0.1] shadow-2xl py-2 z-50 animate-slide-down">
                  <div className="px-4 py-2.5 border-b border-white/[0.06]">
                    <p className="text-[11px] text-slate-400 font-medium">Logged in Administrator</p>
                    <p className="text-sm font-semibold text-white">{adminUser}</p>
                    <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Session Active &amp; Verified
                    </p>
                  </div>

                  {/* Mobile Section Switcher */}
                  {setCurrentSection && (
                    <div className="px-4 py-2 border-b border-white/[0.06] md:hidden space-y-1.5">
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">CRM Section</p>
                      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900 border border-white/[0.06]">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentSection('inventory');
                            setIsUserMenuOpen(false);
                          }}
                          className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition ${
                            currentSection === 'inventory' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>Inventory</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentSection('requirements');
                            setIsUserMenuOpen(false);
                          }}
                          className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition ${
                            currentSection === 'requirements' ? 'bg-violet-600 text-white font-bold' : 'text-slate-400'
                          }`}
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          <span>Demands</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mobile View Switcher */}
                  <div className="px-4 py-2 border-b border-white/[0.06] lg:hidden space-y-1.5">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Display Mode</p>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900 border border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode('table');
                          setIsUserMenuOpen(false);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition ${
                          viewMode === 'table' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>Table</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode('cards');
                          setIsUserMenuOpen(false);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition ${
                          viewMode === 'cards' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Cards</span>
                      </button>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenSheetsModal();
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                      <span>Google Sheets Setup</span>
                    </button>

                    {onOpenWhatsAppAutomation && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenWhatsAppAutomation();
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                          <span>WhatsApp Automation</span>
                        </div>
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-semibold">
                          Meta API
                        </span>
                      </button>
                    )}

                    {onForceSyncLive && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onForceSyncLive();
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Force Sync to Live Link</span>
                      </button>
                    )}
                  </div>

                  {onSignOut && (
                    <div className="pt-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onSignOut();
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer transition"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out from Admin</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
