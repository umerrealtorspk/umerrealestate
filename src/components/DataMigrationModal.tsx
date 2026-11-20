import React, { useState } from 'react';
import { 
  X, 
  ArrowRight, 
  Database, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Play, 
  Pause, 
  HardDrive,
  Copy,
  Check,
  Server,
  Layers,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { PropertyListing, SheetConfig } from '../types/inventory';
import { 
  executeFirestoreToSheetsMigration, 
  testSheetsConnection, 
  MigrationProgress 
} from '../services/googleSheetsService';

interface DataMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: PropertyListing[];
  sheetConfig: SheetConfig;
  onSaveSheetConfig: (config: SheetConfig) => void;
  onMigrationComplete: (migratedListings: PropertyListing[]) => void;
  onNotify: (msg: string) => void;
}

export function DataMigrationModal({
  isOpen,
  onClose,
  inventory,
  sheetConfig,
  onSaveSheetConfig,
  onMigrationComplete,
  onNotify,
}: DataMigrationModalProps) {
  const [scriptUrl, setScriptUrl] = useState(sheetConfig.scriptUrl || '');
  const [source, setSource] = useState<'firestore' | 'server_backup' | 'loaded_memory'>('firestore');
  const [chunkSize, setChunkSize] = useState<number>(500);
  const [clearSheetFirst, setClearSheetFirst] = useState(false);
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'migrate' | 'checklist' | 'script'>('migrate');

  React.useEffect(() => {
    if (sheetConfig.scriptUrl) {
      setScriptUrl(sheetConfig.scriptUrl);
    }
  }, [sheetConfig.scriptUrl]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!scriptUrl.trim()) {
      onNotify('Please enter a valid Google Apps Script Web App URL first.');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    const res = await testSheetsConnection(scriptUrl);
    setIsTesting(false);
    setTestResult(res);
    if (res.success) {
      onNotify('Connected to Google Sheets API successfully!');
      onSaveSheetConfig({ ...sheetConfig, scriptUrl, syncStatus: 'connected' });
    } else {
      onNotify(`Connection failed: ${res.message}`);
    }
  };

  const handleStartMigration = async () => {
    if (!scriptUrl.trim()) {
      onNotify('Please enter your Google Apps Script Web App URL.');
      return;
    }

    setIsMigrating(true);
    setProgress({
      currentBatch: 0,
      totalBatches: 0,
      migratedCount: 0,
      totalCount: inventory.length || 6470,
      percent: 0,
      statusText: 'Initializing migration...',
      isComplete: false,
    });

    const result = await executeFirestoreToSheetsMigration(scriptUrl, {
      source,
      fallbackInventory: inventory,
      chunkSize,
      clearSheetFirst,
      onProgress: (p) => setProgress(p),
    });

    setIsMigrating(false);

    if (result.success) {
      onNotify(`Migration Success! ${result.migratedCount.toLocaleString()} listings transferred to Google Sheets.`);
      onSaveSheetConfig({
        ...sheetConfig,
        scriptUrl,
        lastSyncedAt: new Date().toLocaleTimeString(),
        syncStatus: 'connected',
      });
      // Trigger callback with refreshed inventory
      if (inventory.length > 0) {
        onMigrationComplete(inventory);
      }
    } else {
      onNotify(`Migration halted: ${result.error || 'Unknown error'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Firebase ➔ Google Sheets Migration Engine
                </h3>
                <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/25">
                  6,470 Records Batch Mode
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Zero-loss migration utility with 500-record chunking and atomic setValues() streaming
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 pb-1 border-b border-slate-800 flex items-center gap-2 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('migrate')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'migrate'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Migration Wizard</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('script')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'script'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Apps Script Code (Code.gs)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checklist')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'checklist'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Firebase Retirement Checklist</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'migrate' && (
            <>
              {/* Step 1: Apps Script Web App URL */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">1</span>
                    Target Google Apps Script Web App URL:
                  </label>
                  {testResult && (
                    <span className={`text-[11px] font-medium flex items-center gap-1 ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      {testResult.success ? 'Verified Connected' : 'Connection Error'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={scriptUrl}
                    onChange={(e) => setScriptUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    className="flex-1 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !scriptUrl.trim()}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
                  </button>
                </div>

                {testResult && !testResult.success && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-2 animate-fadeIn">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-rose-300">Connection Failed / Access Blocked</p>
                        <p className="text-[11px] text-rose-200/90 mt-0.5">{testResult.message}</p>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-rose-500/20 text-[11px] text-slate-300 space-y-1">
                      <p className="font-bold text-amber-400">Asaan hal (Sirf 2 Clicks me theek karein):</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-300">
                        <li>Apni Google Sheet me <strong className="text-white">Extensions → Apps Script</strong> open karein.</li>
                        <li>Upar blue <strong className="text-white">Deploy</strong> button par click karein → <strong className="text-white">Manage deployments</strong> chunein.</li>
                        <li>Deployment ke sath bane <strong className="text-white">Edit (Pencil icon)</strong> par click karein.</li>
                        <li><strong className="text-amber-300 font-semibold">"Who has access"</strong> ko <em>Only myself</em> se badal kar <strong className="text-emerald-400 font-semibold">"Anyone"</strong> select karein.</li>
                        <li>Version me <strong className="text-white">"New version"</strong> select karein aur <strong className="text-white">Deploy</strong> daba kar URL dubara copy karein.</li>
                      </ol>
                    </div>
                  </div>
                )}

                {testResult && testResult.success && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Google Sheets API se kamyabi se rabta qaim ho chuka hai! Ab aap migration shuru kar saktay hain.</span>
                  </div>
                )}
              </div>

              {/* Step 2: Source & Batch Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Source Selection */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">2</span>
                    Migration Source:
                  </label>
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-300 p-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700">
                      <input
                        type="radio"
                        name="migration_source"
                        checked={source === 'firestore'}
                        onChange={() => setSource('firestore')}
                        className="text-amber-500 focus:ring-0"
                      />
                      <Database className="w-3.5 h-3.5 text-amber-400" />
                      <div>
                        <span className="font-semibold text-white">Firestore Live Database</span>
                        <p className="text-[10px] text-slate-400">Stream all 6,470 records directly from cloud</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-300 p-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700">
                      <input
                        type="radio"
                        name="migration_source"
                        checked={source === 'server_backup'}
                        onChange={() => setSource('server_backup')}
                        className="text-amber-500 focus:ring-0"
                      />
                      <Server className="w-3.5 h-3.5 text-emerald-400" />
                      <div>
                        <span className="font-semibold text-white">Server Storage Backup</span>
                        <p className="text-[10px] text-slate-400">Fast fallback if Firestore daily quota is reached</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Chunk Configuration */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">3</span>
                    Batch Chunk Size:
                  </label>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[250, 500, 1000].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setChunkSize(sz)}
                        className={`p-2 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                          chunkSize === sz
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {sz} / batch
                        {sz === 500 && <span className="block text-[9px] text-amber-400 font-normal">Optimal</span>}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={clearSheetFirst}
                      onChange={(e) => setClearSheetFirst(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span>Wipe Master Sheet before migrating (clean sync)</span>
                  </label>
                </div>
              </div>

              {/* Migration Execution Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-500/30 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Execute Full Migration</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                        ~{Math.ceil(6470 / chunkSize)} Batches
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Transfers all 6,470 properties to Google Sheets in streaming atomic chunks
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartMigration}
                    disabled={isMigrating || !scriptUrl.trim()}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    <Play className={`w-4 h-4 fill-current ${isMigrating ? 'animate-pulse' : ''}`} />
                    <span>{isMigrating ? 'Migrating Batches...' : 'Start 6,470 Records Migration'}</span>
                  </button>
                </div>

                {/* Progress Bar & Telemetry */}
                {progress && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 flex items-center gap-2">
                        {progress.isComplete ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                        )}
                        <span>{progress.statusText}</span>
                      </span>
                      <span className="font-mono font-bold text-amber-400">
                        {progress.percent}%
                      </span>
                    </div>

                    {/* Outer Bar */}
                    <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden p-0.5">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 transition-all duration-300 shadow-sm"
                        style={{ width: `${Math.max(3, progress.percent)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Migrated: {progress.migratedCount.toLocaleString()} / {progress.totalCount.toLocaleString()} listings</span>
                      <span>Batch: {progress.currentBatch} of {progress.totalBatches}</span>
                    </div>

                    {progress.error && (
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 mt-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{progress.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'script' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Google Apps Script API (Code.gs)</h4>
                  <p className="text-[11px] text-slate-400">
                    Copy and deploy as Web App (Execute as: Me, Access: Anyone).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const code = document.getElementById('code-gs-block')?.innerText || '';
                    navigator.clipboard.writeText(code);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code.gs'}</span>
                </button>
              </div>

              <pre 
                id="code-gs-block"
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-200/90 overflow-x-auto max-h-96 leading-relaxed select-all"
              >
{`/**
 * ORCHARDDESK - GOOGLE APPS SCRIPT DATABASE API
 * ========================================================
 * High-Performance REST API for Real Estate CRM & Migration
 * 
 * Supports:
 * - 6,470+ listings batch migration in 500-record chunks (<1s per chunk)
 * - Full CRUD: Fetch, Add, Batch Append, Update, Delete, Batch Delete
 * - Atomic setValues() operations to eliminate execution time limits
 * - Dynamic tab support + Unified 'Master Inventory' database sheet
 * - CORS-enabled for React Web App
 */

var SPREADSHEET_NAME = "OrchardDesk - Master Property Inventory";
var MASTER_SHEET_NAME = "Master Inventory";

var HEADERS = [
  "ID", "Society", "Block / Phase", "Unit #", "Category", "Marla Size",
  "Size Label", "Demand (Lakhs)", "Formatted Price", "Features", "Dealer Name",
  "Contact Number", "Notes", "Source", "Date Added", "Urgency", "Is Sold", "Updated At"
];

function getSpreadsheet() {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}
  var files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  }
  return ss;
}

function getOrCreateMasterSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  var sheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MASTER_SHEET_NAME, 0);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
         .setFontWeight("bold")
         .setBackground("#0f172a")
         .setFontColor("#f8fafc")
         .setFontSize(10);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function listingToRow(item) {
  var featuresStr = Array.isArray(item.features) ? item.features.join(", ") : (item.features || "");
  var nowIso = new Date().toISOString();
  return [
    item.id || ("prop-" + Utilities.getUuid()),
    item.society || "DHA Lahore",
    item.block || "General",
    item.unitNumber || "General",
    item.category || "Plot",
    typeof item.marlaSize === 'number' ? item.marlaSize : (parseInt(item.marlaSize) || 5),
    item.sizeLabel || "5 Marla",
    typeof item.priceInLakhs === 'number' ? item.priceInLakhs : (parseFloat(item.priceInLakhs) || 0),
    item.formattedPrice || "",
    featuresStr,
    item.dealerName || "Direct Owner",
    item.contactNumber || "",
    item.notes || "",
    item.source || "sheets",
    item.dateAdded || nowIso.split("T")[0],
    item.urgency || "standard",
    item.isSold ? "YES" : "NO",
    nowIso
  ];
}

function rowToListing(row) {
  var featuresRaw = (row[9] || "").toString();
  var features = featuresRaw ? featuresRaw.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [];
  return {
    id: (row[0] || "").toString(),
    society: (row[1] || "").toString(),
    block: (row[2] || "").toString(),
    unitNumber: (row[3] || "").toString(),
    category: (row[4] || "Plot").toString(),
    marlaSize: parseInt(row[5]) || 5,
    sizeLabel: (row[6] || "").toString(),
    priceInLakhs: parseFloat(row[7]) || 0,
    formattedPrice: (row[8] || "").toString(),
    features: features,
    dealerName: (row[10] || "").toString(),
    contactNumber: (row[11] || "").toString(),
    notes: (row[12] || "").toString(),
    source: (row[13] || "sheets").toString(),
    dateAdded: (row[14] || "").toString(),
    urgency: (row[15] || "standard").toString(),
    isSold: (row[16] || "").toString().toUpperCase() === "YES"
  };
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var sheet = getOrCreateMasterSheet(ss);
    var data = sheet.getDataRange().getValues();
    var listings = [];
    if (data.length > 1) {
      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        if (!row[0] || row[0].toString().trim() === "") continue;
        listings.push(rowToListing(row));
      }
    }
    return jsonResponse({
      success: true,
      count: listings.length,
      listings: listings,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl()
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || "add";
    var ss = getSpreadsheet();
    var sheet = getOrCreateMasterSheet(ss);

    if (action === "batch-append" || action === "migrate-batch") {
      var items = payload.listings || [];
      if (!Array.isArray(items) || items.length === 0) {
        return jsonResponse({ success: true, count: 0 });
      }
      var rows = items.map(function(item) { return listingToRow(item); });
      var nextRow = sheet.getLastRow() + 1;
      sheet.getRange(nextRow, 1, rows.length, HEADERS.length).setValues(rows);
      return jsonResponse({
        success: true,
        action: action,
        appendedCount: rows.length,
        totalListings: sheet.getLastRow() - 1
      });
    }

    if (action === "add") {
      var newRow = listingToRow(payload.listing || payload);
      sheet.appendRow(newRow);
      return jsonResponse({ success: true, action: "add", id: newRow[0] });
    }

    if (action === "update") {
      var target = payload.listing;
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toString() === target.id.toString()) {
          sheet.getRange(i + 1, 1, 1, HEADERS.length).setValues([listingToRow(target)]);
          return jsonResponse({ success: true, action: "update", id: target.id });
        }
      }
      sheet.appendRow(listingToRow(target));
      return jsonResponse({ success: true, action: "update_appended", id: target.id });
    }

    if (action === "delete") {
      var deleteId = payload.id;
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toString() === deleteId.toString()) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true, action: "delete", id: deleteId });
        }
      }
      return jsonResponse({ success: true, action: "delete_not_found" });
    }

    if (action === "clear-all") {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
      return jsonResponse({ success: true, action: "clear-all" });
    }

    return jsonResponse({ success: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
                       .setMimeType(ContentService.MimeType.JSON);
}`}
              </pre>
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                <p className="font-semibold text-white">Post-Migration Firebase Retirement Guide</p>
                <p className="mt-1">
                  Once your 6,470 records are confirmed in Google Sheets, follow these three steps to completely decommission Firebase:
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                  <div className="text-xs">
                    <p className="font-semibold text-white">Verify Row Count in Google Sheets</p>
                    <p className="text-slate-400 mt-0.5">
                      Open your Google Sheet and check that row count matches 6,471 (Header + 6,470 property listings).
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                  <div className="text-xs">
                    <p className="font-semibold text-white">Enable Google Sheets Pure Mode in Settings</p>
                    <p className="text-slate-400 mt-0.5">
                      Your app now uses <code className="text-amber-400 font-mono">googleSheetsService.ts</code> with 8-second background polling. All edits, deletions, and new listings save directly to Google Sheets.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                  <div className="text-xs">
                    <p className="font-semibold text-white">Remove Firebase Package &amp; Files</p>
                    <p className="text-slate-400 mt-0.5">
                      Run <code className="text-amber-400 font-mono">npm uninstall firebase</code> and delete <code className="text-amber-400 font-mono">firebaseDb.ts</code> and <code className="text-amber-400 font-mono">firestore.rules</code>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <span className="text-[11px] text-slate-500">
            Database Architecture: Google Drive / Google Sheets REST API
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
