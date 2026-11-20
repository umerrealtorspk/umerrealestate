import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  RefreshCw, 
  CheckCircle2, 
  FolderSync, 
  Download, 
  HardDrive,
  FileSpreadsheet,
  FolderOpen,
  Sparkles
} from 'lucide-react';
import { SheetConfig, PropertyListing } from '../types/inventory';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SheetConfig;
  onSaveConfig: (config: SheetConfig) => void;
  onSyncNow: () => Promise<void>;
  inventory: PropertyListing[];
  onAddListings: (listings: PropertyListing[]) => void;
  onNotify: (msg: string) => void;
  onOpenMigrationModal?: () => void;
}

const APPS_SCRIPT_AUTO_DRIVE_CODE = `/**
 * UMER REALTORS - LAHORE REAL ESTATE
 * Automated Google Drive Folder & Multi-Society Sheets Synchronization Script
 * 
 * Features:
 * 1. Master Spreadsheet sync.
 * 2. Automatic scanning of Google Drive folder "Lahore Data" for WhatsApp exported .zip files.
 * 3. Unzipping and reading chat exports, extracting area/block/society from filenames.
 */

var FOLDER_NAME = "Umer Realtors - Lahore Real Estate";
var SPREADSHEET_NAME = "Lahore Master Property Inventory";
var LAHORE_DATA_FOLDER_NAME = "Lahore Data";

function getOrCreateMasterSpreadsheet() {
  var folders = DriveApp.getFoldersByName(FOLDER_NAME);
  var targetFolder;
  if (folders.hasNext()) {
    targetFolder = folders.next();
  } else {
    targetFolder = DriveApp.createFolder(FOLDER_NAME);
  }

  var files = targetFolder.getFilesByName(SPREADSHEET_NAME);
  var ss;
  if (files.hasNext()) {
    var file = files.next();
    ss = SpreadsheetApp.open(file);
  } else {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    var newFile = DriveApp.getFileById(ss.getId());
    targetFolder.addFile(newFile);
    DriveApp.getRootFolder().removeFile(newFile);
  }
  return ss;
}

function getLahoreDataFolderFiles() {
  var folders = DriveApp.getFoldersByName(LAHORE_DATA_FOLDER_NAME);
  var results = [];
  
  if (!folders.hasNext()) {
    // Create Lahore Data folder automatically if not present
    var newFolder = DriveApp.createFolder(LAHORE_DATA_FOLDER_NAME);
    return { success: true, files: [], message: "Folder 'Lahore Data' was created automatically in your Google Drive. Please upload your WhatsApp export .zip files there!" };
  }
  
  var folder = folders.next();
  var files = folder.getFiles();
  
  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName();
    var mimeType = file.getMimeType();
    
    if (fileName.toLowerCase().endsWith('.zip') || mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') {
      try {
        var zipBlob = file.getBlob();
        var unzippedFiles = Utilities.unzip(zipBlob);
        var chatText = "";
        
        for (var j = 0; j < unzippedFiles.length; j++) {
          var unzipped = unzippedFiles[j];
          var unzippedName = unzipped.getName().toLowerCase();
          if (unzippedName.endsWith('.txt') || unzippedName.endsWith('.csv')) {
            chatText = unzipped.getDataAsString('UTF-8');
            break;
          }
        }
        
        results.push({
          fileName: fileName,
          chatText: chatText,
          size: file.getSize()
        });
      } catch (e) {
        results.push({
          fileName: fileName,
          error: e.toString()
        });
      }
    } else if (fileName.toLowerCase().endsWith('.txt') || fileName.toLowerCase().endsWith('.csv')) {
      try {
        results.push({
          fileName: fileName,
          chatText: file.getBlob().getDataAsString('UTF-8')
        });
      } catch (err) {}
    }
  }
  
  return { success: true, folder: LAHORE_DATA_FOLDER_NAME, files: results };
}

function doGet(e) {
  // 1. Meta WhatsApp Webhook Handshake Verification
  if (e && e.parameter && e.parameter['hub.mode'] === 'subscribe') {
    if (e.parameter['hub.verify_token'] === 'umer_realtors_webhook_2026') {
      return ContentService.createTextOutput(e.parameter['hub.challenge']);
    }
  }

  // 2. Fetch WhatsApp Inbox for CRM AI Processing
  if (e && e.parameter && e.parameter.action === 'get_whatsapp_inbox') {
    var ssInbox = getOrCreateMasterSpreadsheet();
    var sheetInbox = ssInbox.getSheetByName('WhatsApp_Inbox');
    if (!sheetInbox || sheetInbox.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, messages: [] })).setMimeType(ContentService.MimeType.JSON);
    }
    var inboxData = sheetInbox.getRange(2, 1, sheetInbox.getLastRow() - 1, 5).getValues();
    var msgs = [];
    for (var m = 0; m < inboxData.length; m++) {
      msgs.push({
        rowIndex: m + 2,
        timestamp: inboxData[m][0],
        senderName: inboxData[m][1],
        senderPhone: inboxData[m][2],
        text: inboxData[m][3],
        status: inboxData[m][4]
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, messages: msgs })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (e && e.parameter && e.parameter.action === 'sync-lahore-folder') {
      var resData = getLahoreDataFolderFiles();
      return ContentService.createTextOutput(JSON.stringify(resData)).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = getOrCreateMasterSpreadsheet();
    var sheets = ss.getSheets();
    var allListings = [];

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      if (sheet.getName() === 'WhatsApp_Inbox') continue;
      var societyName = sheet.getName();
      var data = sheet.getDataRange().getValues();
      if (data.length <= 1) continue;

      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        if (!row[0] || row[0].toString().trim() === '') continue;

        allListings.push({
          id: 'drive-' + societyName + '-' + r,
          society: societyName,
          block: row[0].toString(),
          unitNumber: row[1].toString(),
          category: row[2].toString(),
          marlaSize: parseInt(row[3]) || 5,
          sizeLabel: row[3].toString(),
          priceInLakhs: parseFloat(row[4]) || 0,
          formattedPrice: row[5].toString(),
          features: (row[6] || '').toString().split(',').map(function(s){ return s.trim(); }).filter(Boolean),
          dealerName: row[7].toString(),
          contactNumber: row[8].toString(),
          notes: (row[9] || '').toString(),
          source: 'sheets',
          syncedToSheets: true,
          dateAdded: row[10] ? row[10].toString() : new Date().toISOString().split('T')[0]
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      folder: FOLDER_NAME,
      count: allListings.length,
      listings: allListings
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var rawText = e && e.postData ? e.postData.contents : '';
    if (!rawText) return ContentService.createTextOutput(JSON.stringify({ status: 'EMPTY' })).setMimeType(ContentService.MimeType.JSON);

    var payload = JSON.parse(rawText);
    
    // Meta WhatsApp Cloud API Incoming Event Receiver
    if (payload.object === 'whatsapp_business_account' || (payload.entry && payload.entry[0] && payload.entry[0].changes)) {
      var entry = payload.entry && payload.entry[0];
      var change = entry && entry.changes && entry.changes[0];
      var val = change && change.value;
      var msg = val && val.messages && val.messages[0];
      if (msg && msg.type === 'text') {
        var ssMaster = getOrCreateMasterSpreadsheet();
        var inboxSheet = ssMaster.getSheetByName('WhatsApp_Inbox') || ssMaster.insertSheet('WhatsApp_Inbox');
        if (inboxSheet.getLastRow() === 0) {
          inboxSheet.appendRow(['Timestamp', 'Sender Name', 'Sender Phone', 'Message Text', 'Status']);
          inboxSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#10b981").setFontColor("#ffffff");
        }
        var cName = (val.contacts && val.contacts[0] && val.contacts[0].profile) ? val.contacts[0].profile.name : 'WhatsApp Dealer';
        inboxSheet.appendRow([new Date(), cName, msg.from || '', msg.text.body || '', 'New']);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'EVENT_RECEIVED' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'sync-lahore-folder') {
      var resData = getLahoreDataFolderFiles();
      return ContentService.createTextOutput(JSON.stringify(resData)).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = getOrCreateMasterSpreadsheet();
    var society = payload.society || 'DHA Lahore';
    var sheet = ss.getSheetByName(society);

    if (!sheet) {
      sheet = ss.insertSheet(society);
      sheet.appendRow([
        'Block / Phase', 'Unit #', 'Category', 'Size', 'Demand (Lakhs)', 'Formatted Price',
        'Features', 'Dealer Name', 'Contact Number', 'Notes', 'Date Added'
      ]);
      sheet.getRange("A1:K1").setFontWeight("bold").setBackground("#dbeafe").setFontColor("#1e40af");
    }

    sheet.appendRow([
      payload.block || 'General',
      payload.unitNumber || 'General',
      payload.category || 'Plot',
      payload.sizeLabel || '5 Marla',
      payload.priceInLakhs || 0,
      payload.formattedPrice || '',
      (payload.features || []).join(', '),
      payload.dealerName || 'Dealer',
      payload.contactNumber || '',
      payload.notes || '',
      new Date().toISOString().split('T')[0]
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Appended listing to ' + society
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onSyncNow,
  inventory,
  onAddListings,
  onNotify,
  onOpenMigrationModal,
}) => {
  const [scriptUrlInput, setScriptUrlInput] = useState(config.scriptUrl || '');
  const [copied, setCopied] = useState(false);
  const [isSyncingLahoreData, setIsSyncingLahoreData] = useState(false);

  React.useEffect(() => {
    if (config.scriptUrl) {
      setScriptUrlInput(config.scriptUrl);
    }
  }, [config.scriptUrl]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      ...config,
      scriptUrl: scriptUrlInput.trim(),
    });
    onNotify('Google Sheets & Drive settings saved!');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_AUTO_DRIVE_CODE);
    setCopied(true);
    onNotify('Apps Script code copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  // Sync "Lahore Data" folder from Google Drive
  const handleSyncLahoreDataFolder = async () => {
    if (!config.scriptUrl) {
      onNotify('Please enter and save your Google Apps Script Web App URL first.');
      return;
    }

    setIsSyncingLahoreData(true);
    onNotify('Scanning Google Drive "Lahore Data" folder for WhatsApp .zip files...');

    try {
      const res = await fetch('/api/sync-lahore-data-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptUrl: config.scriptUrl,
          existingInventory: inventory
        })
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.newListings)) {
        if (data.newListings.length > 0) {
          onAddListings(data.newListings);
          onNotify(`🎉 Successfully imported ${data.newListings.length} new listings from "Lahore Data" ZIP files!`);
        } else {
          onNotify(`Scanned ${data.filesProcessed || 0} files in "Lahore Data". All properties already exist in system!`);
        }
      } else {
        onNotify('Error syncing Lahore Data folder: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      onNotify('Sync error: ' + (err.message || 'Check Apps Script URL'));
    } finally {
      setIsSyncingLahoreData(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-md">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Google Drive &amp; "Lahore Data" Sync</h2>
              <p className="text-xs text-slate-400">Automated ZIP Chat Extraction &amp; Master Inventory Sync</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">

          {/* 6,470 Firebase to Google Sheets Database Migration Callout */}
          {onOpenMigrationModal && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wide">
                  <HardDrive className="w-4 h-4" />
                  <span>Firebase to Google Sheets Migration</span>
                </div>
                <p className="text-xs text-slate-400">
                  Migrate Firestore property listings into your Google Sheet Master Inventory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMigrationModal();
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 shadow-md shadow-amber-500/20 transition cursor-pointer"
              >
                Launch Migration Tool
              </button>
            </div>
          )}
          
          {/* Lahore Data Folder Auto-Sync Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <FolderOpen className="w-4 h-4 text-emerald-400" />
                <span>Google Drive "Lahore Data" Folder Sync</span>
              </div>
              <p className="text-xs text-slate-400">
                Sync WhatsApp .zip exports from Google Drive folder directly into inventory.
              </p>
            </div>
            <button
              type="button"
              disabled={isSyncingLahoreData}
              onClick={handleSyncLahoreDataFolder}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
            >
              {isSyncingLahoreData ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Scanning ZIPs...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Sync Lahore Data Folder Now</span>
                </>
              )}
            </button>
          </div>

          {/* Config Form */}
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Google Apps Script Web App URL
              </label>
              <input
                type="url"
                value={scriptUrlInput}
                onChange={e => setScriptUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Paste your deployed Google Apps Script Web App URL here to enable Drive sync &amp; folder scanning.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onSyncNow}
                className="bg-slate-800 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Sync Master Spreadsheet</span>
              </button>
              <button
                type="submit"
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs shadow-lg shadow-emerald-500/10 transition cursor-pointer"
              >
                Save Configuration
              </button>
            </div>
          </form>

          {/* Setup Instructions */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Google Apps Script Setup Guide
              </h3>
              <button
                type="button"
                onClick={handleCopyCode}
                className="bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Code!' : 'Copy Apps Script Code'}</span>
              </button>
            </div>

            <ol className="list-decimal list-inside text-xs text-slate-400 space-y-1.5 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <li>Create a folder named <strong className="text-white">Lahore Data</strong> in your Google Drive and upload your WhatsApp chat <code className="text-emerald-300">.zip</code> files there (e.g. <span className="italic">DHA Phase 6 Block C.zip</span>).</li>
              <li>Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline inline-flex items-center gap-1">script.google.com <ExternalLink className="w-3 h-3" /></a> and create a new project.</li>
              <li>Paste the copied code above into <code className="text-emerald-300">Code.gs</code>.</li>
              <li>Click <strong className="text-white">Deploy &gt; New Deployment</strong>, select type <strong className="text-white">Web App</strong>, set Execute as <strong className="text-white">Me</strong> and Who has access to <strong className="text-white">Anyone</strong>.</li>
              <li>Copy the Web App URL and paste it above!</li>
            </ol>
          </div>

        </div>

      </div>
    </div>
  );
};

function ExternalLink(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
  );
}
