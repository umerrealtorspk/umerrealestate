import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  FileSpreadsheet,
  FileCode,
  FileText, 
  FileArchive,
  FolderArchive,
  Zap, 
  Lightbulb, 
  RefreshCw, 
  Check, 
  AlertCircle,
  Trash2
} from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { PropertyListing, PropertyCategory } from '../types/inventory';
import { formatLakhs } from '../utils/pakistanCurrency';
import { LAHORE_SOCIETIES } from '../data/seedInventory';
import { isValidContactNumber, formatPakistaniPhoneNumber } from '../utils/phoneUtils';

interface ChatFileUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddListings: (listings: PropertyListing[], syncToSheets: boolean) => void;
  onNotify: (msg: string) => void;
  driveConnected: boolean;
}

interface ZipDetails {
  name: string;
  totalFiles: number;
  extractedTextFiles: string[];
  extractedExcelFiles: string[];
  extractedHtmlFiles: string[];
  mediaFilesCount: number;
}

export const ChatFileUploaderModal: React.FC<ChatFileUploaderModalProps> = ({
  isOpen,
  onClose,
  onAddListings,
  onNotify,
  driveConnected,
}) => {
  const [rawText, setRawText] = useState('');
  const [defaultSociety, setDefaultSociety] = useState('All Lahore');
  const [defaultContact, setDefaultContact] = useState('-');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncToDrive, setSyncToDrive] = useState(true);
  const [detectedFormat, setDetectedFormat] = useState<'excel' | 'html' | 'txt' | 'zip' | null>(null);
  const [loadedFileName, setLoadedFileName] = useState('');
  const [excelExtractedListings, setExcelExtractedListings] = useState<PropertyListing[]>([]);
  const [zipDetails, setZipDetails] = useState<ZipDetails | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // --- SHEETJS BUFFER EXTRACTOR ---
  const extractPropertiesFromExcelBuffer = (buffer: ArrayBuffer, sourceName: string): PropertyListing[] => {
    const wb = XLSX.read(buffer, { type: 'array' });
    const listings: PropertyListing[] = [];

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;

      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (!rawRows || rawRows.length <= 1) continue;

      // Convert sparse rows into regular dense arrays
      const rows = rawRows.map(r => (r ? Array.from(r).map(c => (c != null ? String(c).trim() : '')) : []));

      // Determine Society from sheet name or default
      let detectedSociety = defaultSociety;
      for (const soc of LAHORE_SOCIETIES) {
        if (soc !== 'All Lahore' && sheetName.toLowerCase().includes(soc.toLowerCase())) {
          detectedSociety = soc;
          break;
        }
      }

      // Find header row (check first 5 rows)
      let headerRowIdx = 0;
      for (let r = 0; r < Math.min(5, rows.length); r++) {
        const rowStr = (rows[r] || []).join(' ').toLowerCase();
        if (rowStr.includes('plot') || rowStr.includes('unit') || rowStr.includes('demand') || rowStr.includes('price') || rowStr.includes('size')) {
          headerRowIdx = r;
          break;
        }
      }

      const header = Array.from(rows[headerRowIdx] || []).map(h => (h != null ? String(h).trim().toLowerCase() : ''));

      // Check if sheet has side-by-side layout (e.g. Plots on cols A-F, Houses on cols H-M)
      const plotNoIdx = header.findIndex(h => typeof h === 'string' && h.includes('plot'));
      const houseNoIdx = header.findIndex((h, idx) => idx > plotNoIdx && typeof h === 'string' && (h.includes('house') || h.includes('villa')));

      if (plotNoIdx !== -1 && houseNoIdx !== -1) {
        // Side-by-side layout
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          // Plot side
          const pNo = row[plotNoIdx];
          if (pNo !== undefined && String(pNo).trim() !== '') {
            const sizeVal = row[plotNoIdx + 1] || '5 Marla';
            const demandVal = parseFloat(row[plotNoIdx + 2]) || 0;
            const dealerVal = row[plotNoIdx + 3] && String(row[plotNoIdx + 3]).trim() ? String(row[plotNoIdx + 3]).trim() : '-';
            const contactVal = row[plotNoIdx + 4] && String(row[plotNoIdx + 4]).trim() ? String(row[plotNoIdx + 4]).trim() : defaultContact;
            const featVal = row[plotNoIdx + 5] ? String(row[plotNoIdx + 5]).split(',').map(s => s.trim()) : ['Solid Land'];

            listings.push({
              id: `xl-p-${sheetName}-${r}-${Math.random().toString(36).substring(2, 6)}`,
              society: detectedSociety,
              block: sheetName,
              unitNumber: String(pNo),
              category: 'Plot',
              marlaSize: parseInt(String(sizeVal)) || 5,
              sizeLabel: String(sizeVal).includes('Marla') || String(sizeVal).includes('Kanal') ? String(sizeVal) : `${sizeVal} Marla`,
              priceInLakhs: demandVal,
              formattedPrice: demandVal >= 100 ? `${(demandVal / 100).toFixed(2)} Crore` : `${demandVal} Lakh`,
              features: featVal,
              dealerName: dealerVal,
              contactNumber: contactVal,
              source: 'sheets',
              syncedToSheets: true,
              dateAdded: new Date().toISOString().split('T')[0],
            });
          }

          // House side
          const hNo = row[houseNoIdx];
          if (hNo !== undefined && String(hNo).trim() !== '') {
            const sizeVal = row[houseNoIdx + 1] || '5 Marla';
            const demandVal = parseFloat(row[houseNoIdx + 2]) || 0;
            const dealerVal = row[houseNoIdx + 3] && String(row[houseNoIdx + 3]).trim() ? String(row[houseNoIdx + 3]).trim() : '-';
            const contactVal = row[houseNoIdx + 4] && String(row[houseNoIdx + 4]).trim() ? String(row[houseNoIdx + 4]).trim() : defaultContact;
            const featVal = row[houseNoIdx + 5] ? String(row[houseNoIdx + 5]).split(',').map(s => s.trim()) : ['Brand New'];

            listings.push({
              id: `xl-h-${sheetName}-${r}-${Math.random().toString(36).substring(2, 6)}`,
              society: detectedSociety,
              block: sheetName,
              unitNumber: String(hNo),
              category: 'House',
              marlaSize: parseInt(String(sizeVal)) || 5,
              sizeLabel: String(sizeVal).includes('Marla') || String(sizeVal).includes('Kanal') ? String(sizeVal) : `${sizeVal} Marla`,
              priceInLakhs: demandVal,
              formattedPrice: demandVal >= 100 ? `${(demandVal / 100).toFixed(2)} Crore` : `${demandVal} Lakh`,
              features: featVal,
              dealerName: dealerVal,
              contactNumber: contactVal,
              source: 'sheets',
              syncedToSheets: true,
              dateAdded: new Date().toISOString().split('T')[0],
            });
          }
        }
      } else {
        // Standard table format
        const unitIdx = header.findIndex(h => typeof h === 'string' && (h.includes('unit') || h.includes('plot') || h.includes('house') || h.includes('no') || h.includes('#')));
        const blockIdx = header.findIndex(h => typeof h === 'string' && (h.includes('block') || h.includes('phase') || h.includes('sector')));
        const societyIdx = header.findIndex(h => typeof h === 'string' && (h.includes('society') || h.includes('location')));
        const sizeIdx = header.findIndex(h => typeof h === 'string' && (h.includes('size') || h.includes('marla') || h.includes('area')));
        const priceIdx = header.findIndex(h => typeof h === 'string' && (h.includes('demand') || h.includes('price') || h.includes('rate') || h.includes('lakh')));
        const typeIdx = header.findIndex(h => typeof h === 'string' && (h.includes('type') || h.includes('cat')));
        const dealerIdx = header.findIndex(h => typeof h === 'string' && (h.includes('dealer') || h.includes('owner') || h.includes('name')));
        const contactIdx = header.findIndex(h => typeof h === 'string' && (h.includes('contact') || h.includes('phone') || h.includes('mobile')));
        const featureIdx = header.findIndex(h => typeof h === 'string' && (h.includes('feature') || h.includes('tag') || h.includes('detail') || h.includes('status')));

        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          const unitVal = unitIdx !== -1 ? row[unitIdx] : row[0];
          if (unitVal === undefined || String(unitVal).trim() === '') continue;

          const blockVal = blockIdx !== -1 && row[blockIdx] ? String(row[blockIdx]) : sheetName;
          const socVal = societyIdx !== -1 && row[societyIdx] ? String(row[societyIdx]) : detectedSociety;
          const sizeVal = sizeIdx !== -1 && row[sizeIdx] ? String(row[sizeIdx]) : '5 Marla';
          const rawPrice = priceIdx !== -1 && row[priceIdx] ? parseFloat(row[priceIdx]) : 0;
          const typeRaw = typeIdx !== -1 && row[typeIdx] ? String(row[typeIdx]).toLowerCase() : '';
          const cat: PropertyCategory = typeRaw.includes('house') || typeRaw.includes('villa') ? 'House' : typeRaw.includes('comm') ? 'Commercial' : 'Plot';
          const dealerVal = dealerIdx !== -1 && row[dealerIdx] && String(row[dealerIdx]).trim() ? String(row[dealerIdx]).trim() : '-';
          const contactVal = contactIdx !== -1 && row[contactIdx] && String(row[contactIdx]).trim() ? String(row[contactIdx]).trim() : defaultContact;
          const featVal = featureIdx !== -1 && row[featureIdx] ? String(row[featureIdx]).split(',').map(s => s.trim()) : ['Solid Land'];

          const priceInLakhs = rawPrice < 2000 ? rawPrice : Math.round(rawPrice / 100000);

          listings.push({
            id: `xl-row-${sheetName}-${r}-${Math.random().toString(36).substring(2, 6)}`,
            society: socVal || detectedSociety || 'All Lahore',
            block: blockVal || 'General Block',
            unitNumber: String(unitVal),
            category: cat,
            marlaSize: parseInt(sizeVal) || (sizeVal.includes('1 Kanal') ? 20 : 5),
            sizeLabel: String(sizeVal).includes('Marla') || String(sizeVal).includes('Kanal') ? String(sizeVal) : `${sizeVal} Marla`,
            priceInLakhs: priceInLakhs || 60,
            formattedPrice: priceInLakhs >= 100 ? `${(priceInLakhs / 100).toFixed(2)} Crore` : `${priceInLakhs} Lakh`,
            features: featVal,
            dealerName: dealerVal,
            contactNumber: contactVal,
            source: 'sheets',
            syncedToSheets: true,
            dateAdded: new Date().toISOString().split('T')[0],
          });
        }
      }
    }

    return listings;
  };

  // --- SHEETJS EXCEL PARSER ---
  const parseExcelFile = (buffer: ArrayBuffer, fileName: string) => {
    try {
      const listings = extractPropertiesFromExcelBuffer(buffer, fileName);
      setExcelExtractedListings(listings);
      setDetectedFormat('excel');
      setLoadedFileName(fileName);
      setZipDetails(null);
      onNotify(`SheetJS successfully read ${listings.length} properties from ${fileName}!`);
    } catch (err: any) {
      console.error('SheetJS parse error:', err);
      setError(`Failed to read Excel file: ${err.message}`);
    }
  };

  // --- HTML TEXT EXTRACTOR ---
  const extractTextFromHtml = (htmlText: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    // 1. Look for tables in HTML
    const tables = doc.querySelectorAll('table');
    if (tables.length > 0) {
      const extractedLines: string[] = [];
      tables.forEach(table => {
        const trs = table.querySelectorAll('tr');
        trs.forEach(tr => {
          const cells = Array.from(tr.querySelectorAll('th, td')).map(td => td.textContent?.trim() || '');
          if (cells.some(c => c.length > 0)) {
            extractedLines.push(cells.join(' | '));
          }
        });
      });
      return extractedLines.join('\n');
    }

    // 2. Look for chat export messages in HTML
    const messageNodes = doc.querySelectorAll('.message, .msg, .chat-message, [class*="message"], p');
    if (messageNodes.length > 2) {
      const lines: string[] = [];
      messageNodes.forEach(node => {
        const text = node.textContent?.trim();
        if (text && text.length > 5 && !lines.includes(text)) {
          lines.push(text);
        }
      });
      return lines.join('\n');
    }

    // 3. Fallback to innerText
    return doc.body.innerText || doc.body.textContent || '';
  };

  // --- HTML PARSER ---
  const parseHtmlContent = (htmlText: string, fileName: string) => {
    try {
      const combined = extractTextFromHtml(htmlText);
      setRawText(combined);
      setDetectedFormat('html');
      setLoadedFileName(fileName);
      setZipDetails(null);
      onNotify(`Extracted content from HTML file (${fileName})`);
    } catch (err: any) {
      setError(`Failed to parse HTML file: ${err.message}`);
    }
  };

  // --- ZIP ARCHIVE PARSER ---
  const parseZipFile = async (buffer: ArrayBuffer, fileName: string) => {
    setLoading(true);
    setError(null);
    try {
      const zip = await JSZip.loadAsync(buffer);
      const allFiles = Object.keys(zip.files).filter(
        path => !zip.files[path].dir && !path.startsWith('__MACOSX/') && !path.includes('/.') && !path.startsWith('.')
      );

      if (allFiles.length === 0) {
        throw new Error('The selected ZIP archive is empty or contains only folders.');
      }

      // Classify files inside zip
      const txtFiles = allFiles.filter(p => p.toLowerCase().endsWith('.txt'));
      const excelFiles = allFiles.filter(p => {
        const lower = p.toLowerCase();
        return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv');
      });
      const htmlFiles = allFiles.filter(p => {
        const lower = p.toLowerCase();
        return lower.endsWith('.html') || lower.endsWith('.htm');
      });
      const mediaFiles = allFiles.filter(p => {
        return /\.(jpe?g|png|gif|webp|opus|m4a|aac|mp3|ogg|wav|mp4|mov|vcf|pdf)$/i.test(p);
      });

      let combinedChatText = '';
      const allExtractedExcelListings: PropertyListing[] = [];

      // Sort text files so that WhatsApp chat files (_chat.txt, chat.txt) come first
      txtFiles.sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        if (aLower.includes('_chat') || aLower.includes('chat')) return -1;
        if (bLower.includes('_chat') || bLower.includes('chat')) return 1;
        return 0;
      });

      // Extract all text files
      for (const txtPath of txtFiles) {
        const fileEntry = zip.file(txtPath);
        if (fileEntry) {
          const text = await fileEntry.async('string');
          if (text.trim()) {
            combinedChatText += (combinedChatText ? '\n\n' : '') + text;
          }
        }
      }

      // Extract any Excel files
      for (const xlPath of excelFiles) {
        const fileEntry = zip.file(xlPath);
        if (fileEntry) {
          const xlBuffer = await fileEntry.async('arraybuffer');
          const xlProps = extractPropertiesFromExcelBuffer(xlBuffer, xlPath);
          allExtractedExcelListings.push(...xlProps);
        }
      }

      // Extract any HTML files
      for (const hPath of htmlFiles) {
        const fileEntry = zip.file(hPath);
        if (fileEntry) {
          const hText = await fileEntry.async('string');
          const extracted = extractTextFromHtml(hText);
          if (extracted.trim()) {
            combinedChatText += (combinedChatText ? '\n\n' : '') + extracted;
          }
        }
      }

      if (!combinedChatText.trim() && allExtractedExcelListings.length === 0) {
        throw new Error(
          `No readable chat (.txt), Excel (.xlsx/.xls/.csv), or HTML files found in ${fileName}. (Found ${mediaFiles.length} media files).`
        );
      }

      if (combinedChatText.trim()) {
        setRawText(combinedChatText);
      }
      if (allExtractedExcelListings.length > 0) {
        setExcelExtractedListings(allExtractedExcelListings);
      }

      setZipDetails({
        name: fileName,
        totalFiles: allFiles.length,
        extractedTextFiles: txtFiles,
        extractedExcelFiles: excelFiles,
        extractedHtmlFiles: htmlFiles,
        mediaFilesCount: mediaFiles.length,
      });

      setDetectedFormat('zip');
      setLoadedFileName(fileName);

      const parts: string[] = [];
      if (txtFiles.length > 0) parts.push(`${txtFiles.length} chat file(s)`);
      if (allExtractedExcelListings.length > 0) parts.push(`${allExtractedExcelListings.length} Excel properties`);
      if (mediaFiles.length > 0) parts.push(`${mediaFiles.length} media files ignored`);

      onNotify(`ZIP Unpacked (${fileName}): ${parts.join(', ')}`);
    } catch (err: any) {
      console.error('ZIP parse error:', err);
      setError(`Failed to read ZIP file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- PROCESS GENERIC FILE ---
  const processUploadedFile = (file: File) => {
    setError(null);
    setExcelExtractedListings([]);
    setZipDetails(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    // ZIP Archive (.zip)
    if (ext === 'zip' || file.type.includes('zip')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (buffer) {
          parseZipFile(buffer, file.name);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // Excel files (.xlsx, .xls, .csv)
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (buffer) {
          parseExcelFile(buffer, file.name);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // HTML files (.html, .htm)
    if (ext === 'html' || ext === 'htm') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          parseHtmlContent(text, file.name);
        }
      };
      reader.readAsText(file);
      return;
    }

    // TXT chat exports (.txt) or any plain text
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        setDetectedFormat('txt');
        setLoadedFileName(file.name);
        onNotify(`Loaded ${file.name} (${content.split('\n').length} lines)`);
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
    e.target.value = '';
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  // --- SAMPLES ---
  const handleSampleClick = async (type: 'zip' | 'excel' | 'html' | 'txt') => {
    setError(null);
    setExcelExtractedListings([]);
    setZipDetails(null);

    // SAMPLE 1: WhatsApp ZIP (.zip)
    if (type === 'zip') {
      try {
        const zip = new JSZip();
        const sampleChatText = `[14/10/2026, 10:15:20 AM] Malik Real Estate Network Lahore:
➡️*DHA Phase 6 Block C 1 Kanal plot 340 corner demand 4.35 Crore
➡️*Bahria Town Sector C plot 210, 10 marla MB paid demand 1.45 Cr
➡️*Lake City Sector M7 plot 180, 5 marla brand new house demand 1.85 Crore
➡️*Bahria Orchard Phase 2 G5 block plot 412 10 marla demand 85 Lac
➡️*Al-Kabir Town Phase 2 Block B 5 Marla Plot 55 demand 38 Lakh
*Contact: Ch. Kamran Signature Estate 03008455667*`;

        zip.file('_chat.txt', sampleChatText);
        // Include dummy media to demonstrate skipping media files like real WhatsApp exports
        zip.file('IMG-20261014-WA0001.jpg', 'fake-image-bytes');
        zip.file('PTT-20261014-WA0002.opus', 'fake-voice-bytes');

        const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
        await parseZipFile(zipBuffer, 'WhatsApp Chat - Lahore Property Dealers.zip');
      } catch (err: any) {
        setError(`Failed to create sample ZIP: ${err.message}`);
      }
      return;
    }

    // SAMPLE 2: Excel (.xlsx)
    if (type === 'excel') {
      const sampleExcelListings: PropertyListing[] = [
        {
          id: 'sample-xl-1',
          society: 'DHA Lahore',
          block: 'Phase 6 - Block C',
          unitNumber: '318',
          category: 'Plot',
          marlaSize: 20,
          sizeLabel: '1 Kanal',
          priceInLakhs: 435,
          formattedPrice: '4.35 Crore',
          features: ['Corner', 'Facing Park', 'Direct Deal'],
          dealerName: 'Ch. Kamran (Signature Estate)',
          contactNumber: '03008455667',
          source: 'sheets',
          syncedToSheets: true,
          dateAdded: new Date().toISOString().split('T')[0]
        },
        {
          id: 'sample-xl-2',
          society: 'DHA Lahore',
          block: 'Phase 8 - Prism Z',
          unitNumber: '512',
          category: 'Plot',
          marlaSize: 10,
          sizeLabel: '10 Marla',
          priceInLakhs: 185,
          formattedPrice: '1.85 Crore',
          features: ['Possession Paid', 'Near Ring Road'],
          dealerName: 'Malik Tariq (Prism Associates)',
          contactNumber: '03214567890',
          source: 'sheets',
          syncedToSheets: true,
          dateAdded: new Date().toISOString().split('T')[0]
        },
        {
          id: 'sample-xl-3',
          society: 'Bahria Town',
          block: 'Sector C - Gulbahar',
          unitNumber: '210',
          category: 'Plot',
          marlaSize: 10,
          sizeLabel: '10 Marla',
          priceInLakhs: 145,
          formattedPrice: '1.45 Crore',
          features: ['MB Paid', 'Near Grand Jamia Masjid'],
          dealerName: 'Rao Hammad (Bahria Hub)',
          contactNumber: '03017778901',
          source: 'sheets',
          syncedToSheets: true,
          dateAdded: new Date().toISOString().split('T')[0]
        },
        {
          id: 'sample-xl-4',
          society: 'Lake City',
          block: 'Sector M7',
          unitNumber: '180',
          category: 'House',
          marlaSize: 5,
          sizeLabel: '5 Marla',
          priceInLakhs: 185,
          formattedPrice: '1.85 Crore',
          features: ['Brand New', 'Double Storey'],
          dealerName: 'Naveed Akhtar (Lake City Advisors)',
          contactNumber: '03456677889',
          source: 'sheets',
          syncedToSheets: true,
          dateAdded: new Date().toISOString().split('T')[0]
        }
      ];
      setExcelExtractedListings(sampleExcelListings);
      setDetectedFormat('excel');
      setLoadedFileName('Sample_Lahore_Master_Inventory.xlsx');
      onNotify('Loaded sample Excel inventory sheet (4 properties)');
      return;
    }

    // SAMPLE 3: HTML (.html)
    if (type === 'html') {
      const sampleHtml = `<table>
  <tr><th>Plot No</th><th>Block</th><th>Society</th><th>Size</th><th>Demand</th><th>Features</th><th>Dealer</th><th>Phone</th></tr>
  <tr><td>340</td><td>Phase 6 - Block C</td><td>DHA Lahore</td><td>1 Kanal</td><td>4.35 Crore</td><td>Corner, Facing Park</td><td>Ch. Kamran</td><td>03008455667</td></tr>
  <tr><td>210</td><td>Sector C</td><td>Bahria Town</td><td>10 Marla</td><td>1.45 Crore</td><td>MB Paid</td><td>Rao Hammad</td><td>03017778901</td></tr>
  <tr><td>180</td><td>Sector M7</td><td>Lake City</td><td>5 Marla</td><td>62 Lac</td><td>Ring Road Access</td><td>Naveed Akhtar</td><td>03456677889</td></tr>
</table>`;
      parseHtmlContent(sampleHtml, 'Sample_Inventory_Table.html');
      return;
    }

    // SAMPLE 4: TXT (.txt)
    const sampleTxt = `*Alhamdulillah*
Confirm plots for sale in Lahore:
➡️*1798 D ext ppup corner 9 Marla paid demand 95Lac
➡️*252 Eastern Block House For Sale Biana=185 used*
➡️*395 H = Ppup mb paid 70Lac*
➡️*DHA Phase 6 Block C 1 Kanal plot 340 corner demand 4.35 Crore
➡️*Bahria Town Sector C plot 210, 10 marla demand 1.45 Cr
➡️*Lake City Sector M7 plot 180, 5 marla demand 62 Lac
*MUSHARAF SARWAR*
*ZS PROPERTIES*
03004000123`;
    setRawText(sampleTxt);
    setDetectedFormat('txt');
    setLoadedFileName('Sample_WhatsApp_Group_Chat.txt');
    onNotify('Loaded sample WhatsApp chat export');
  };

  // --- SAVE ACTION ---
  const handleSave = async () => {
    // If Excel items were parsed
    if (excelExtractedListings.length > 0) {
      onAddListings(excelExtractedListings, syncToDrive);
      onNotify(`Added ${excelExtractedListings.length} Excel properties to inventory!`);
      onClose();
      return;
    }

    // If Text / HTML / ZIP chat text needs Gemini AI or regex parser
    if (!rawText.trim()) {
      setError('Please select a file or paste text first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let rawListings: any[] = [];
      let sourceTag = 'gemini';

      try {
        const response = await fetch('/api/parse-chat-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatText: rawText,
            defaultSociety: defaultSociety || 'All Lahore',
            defaultContact: defaultContact && defaultContact !== '-' ? defaultContact : '-',
            fileName: loadedFileName || 'upload_file.txt'
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.listings) && data.listings.length > 0) {
            rawListings = data.listings.filter((item: any) => isValidContactNumber(item.contactNumber));
            sourceTag = data.source || 'gemini';
          }
        }
      } catch (fetchErr) {
        console.warn('Backend chat parse failed, attempting local extraction:', fetchErr);
      }

      // If backend returned no listings or failed, do local client extraction
      if (rawListings.length === 0) {
        const lines = rawText.split(/\n+/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const lower = line.toLowerCase();
          const isRE = /(?:plot|house|villa|marla|kanal|\b\d+m\b|\b\d+k\b|demand|lac|lakh|crore|\bcr\b|biana|commercial|plaza|shop)/i.test(line);
          if (!isRE) continue;

          // Check for contact number first - MUST have a valid phone number!
          const phoneMatch = line.match(/(?:(\+92|0092|92|0)?\s*3\d{2}[-\s]?\d{7})/);
          const ph = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, '') : (defaultContact && defaultContact !== '-' ? defaultContact : '');
          if (!isValidContactNumber(ph)) {
            // User requirement: Do NOT add properties without a contact number
            continue;
          }

          let soc = defaultSociety || 'All Lahore';
          if (lower.includes('bahria town') || (lower.includes('sector') && !lower.includes('lake city') && !lower.includes('orchard'))) soc = 'Bahria Town';
          else if (lower.includes('bahria orchard') || lower.includes('orchard')) soc = 'Bahria Orchard';
          else if (lower.includes('lake city')) soc = 'Lake City';
          else if (lower.includes('johar town')) soc = 'Johar Town';
          else if (lower.includes('gulberg')) soc = 'Gulberg';
          else if (lower.includes('park view')) soc = 'Park View City';
          else if (lower.includes('dha') || lower.includes('phase')) soc = 'DHA Lahore';

          const blockMatch = line.match(/(?:block|phase|sector)\s*([a-zA-Z0-9\s\-]+?)(?=\s+(?:plot|house|demand|size|1\s*kanal|\d+\s*marla|corner)|$)/i);
          let blk = blockMatch ? blockMatch[0].trim() : 'General Block';
          const letterMatch = line.match(/\b([A-Z]{1,2})\s*[-–]?\s*block\b/i) || line.match(/\bblock\s*([A-Z]{1,2})\b/i);
          if (letterMatch && blk === 'General Block') blk = `Block ${letterMatch[1].toUpperCase()}`;

          const numMatch = line.match(/(?:plot|house|unit|no|#)[:\s]*([0-9]+[a-z\-]*)/i) || 
                           line.match(/^[➡️•\*\-]?\s*([0-9]{1,4}[a-z]?)\b/) || 
                           line.match(/\b([0-9]{2,4}[a-z]?)\b/);
          const unit = numMatch ? numMatch[1] : '-';

          let marla = 5;
          if (lower.includes('1 kanal') || lower.includes('1k') || lower.includes('20 marla') || lower.includes('20m')) marla = 20;
          else if (lower.includes('2 kanal') || lower.includes('40 marla')) marla = 40;
          else if (lower.includes('10 marla') || lower.includes('10m')) marla = 10;
          else if (lower.includes('8 marla') || lower.includes('8m')) marla = 8;
          else {
            const m = line.match(/(\d+)\s*(?:marla|m\b)/i);
            if (m) marla = parseInt(m[1], 10);
          }

          let priceInLakhs = 0;
          const crMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore)/i);
          const lcMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:lac|lakh)/i);
          if (crMatch) priceInLakhs = parseFloat(crMatch[1]) * 100;
          else if (lcMatch) priceInLakhs = parseFloat(lcMatch[1]);

          let dlr = 'Dealer Broadcast';
          const dealerMatch = line.match(/(?:contact|call|broker|dealer|estate|realtor)[:\s]*([a-zA-Z\s\.]+?)(?:\s+\d|\n|$)/i);
          if (dealerMatch && dealerMatch[1].trim().length > 2) {
            dlr = dealerMatch[1].trim();
          }

          const isH = lower.includes('house') || lower.includes('villa');
          const isC = lower.includes('commercial') || lower.includes('plaza') || lower.includes('shop');

          rawListings.push({
            society: soc,
            block: blk,
            unitNumber: unit,
            category: isC ? 'Commercial' : isH ? 'House' : 'Plot',
            marlaSize: marla,
            sizeLabel: marla === 20 ? '1 Kanal' : marla === 40 ? '2 Kanal' : `${marla} Marla`,
            priceInLakhs,
            formattedPrice: priceInLakhs > 0 ? formatLakhs(priceInLakhs) : 'Demand on Call',
            features: lower.includes('corner') ? ['Corner'] : lower.includes('park') ? ['Facing Park'] : ['Solid Land'],
            dealerName: dlr,
            contactNumber: ph,
            notes: line.slice(0, 100)
          });
        }
      }

      if (rawListings.length === 0) {
        throw new Error('Could not find property listings in the provided text. Make sure it contains plot/house details or prices.');
      }

      const formatted: PropertyListing[] = rawListings.map((item: any, idx: number) => {
        const dealer = (item.dealerName && item.dealerName.trim() && item.dealerName !== '-' && item.dealerName.toLowerCase() !== 'dealer' && item.dealerName !== 'Dealer (WhatsApp Group)' && item.dealerName !== 'Direct Dealer')
          ? item.dealerName.trim()
          : '-';
        const contact = (item.contactNumber && item.contactNumber.trim() && item.contactNumber !== '-' && item.contactNumber !== '03001234567' && item.contactNumber !== '03004000123')
          ? item.contactNumber.trim()
          : (defaultContact && defaultContact !== '-' ? defaultContact : '-');

        const price = Number(item.priceInLakhs) || 0;

        return {
          id: `file-${Date.now()}-${idx}`,
          society: item.society || defaultSociety || 'All Lahore',
          block: item.block || 'General Block',
          unitNumber: String(item.unitNumber || '-'),
          category: item.category === 'House' ? 'House' : item.category === 'Commercial' ? 'Commercial' : 'Plot',
          marlaSize: Number(item.marlaSize) || 5,
          sizeLabel: item.sizeLabel || `${item.marlaSize || 5} Marla`,
          priceInLakhs: price,
          formattedPrice: item.formattedPrice || (price > 0 ? formatLakhs(price) : 'Demand on Call'),
          features: Array.isArray(item.features) && item.features.length > 0 ? item.features : ['Solid Land'],
          dealerName: dealer,
          contactNumber: contact,
          notes: item.notes || '',
          source: 'whatsapp_chat_export',
          syncedToSheets: false,
          dateAdded: new Date().toISOString().split('T')[0],
        };
      });

      onAddListings(formatted, syncToDrive);
      onNotify(`Successfully extracted & added ${formatted.length} properties!`);
      setRawText('');
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error processing file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl transform transition-all flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Import Property Inventory</h3>
              <p className="text-xs text-slate-400">
                WhatsApp ZIP (.zip), Excel (.xlsx, .xls, .csv), HTML (.html) &amp; Chat (.txt)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">
          
          {/* Format Badges Support Strip */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400">Supported Formats:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <FileArchive className="h-3.5 w-3.5" />
              WhatsApp ZIP (.zip)
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel (.xlsx, .xls, .csv)
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FileCode className="h-3.5 w-3.5" />
              HTML (.html, .htm)
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <FileText className="h-3.5 w-3.5" />
              Chat Export (.txt)
            </span>
          </div>

          {/* Drag & Drop / Click Upload Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all group ${
              isDragging
                ? 'border-purple-500 bg-purple-500/10 scale-[1.01]'
                : 'border-slate-700/80 hover:border-amber-500/80 bg-slate-950/60 hover:bg-slate-950'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.xlsx,.xls,.csv,.txt,.html,.htm,application/zip,application/x-zip-compressed"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2 border transition-all ${
              detectedFormat === 'zip'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                : detectedFormat === 'excel'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : detectedFormat === 'html'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-slate-900 group-hover:bg-amber-500/10 text-amber-400 border-slate-800 group-hover:border-amber-500/30'
            }`}>
              {detectedFormat === 'zip' ? (
                <FileArchive className="h-6 w-6 text-purple-400" />
              ) : detectedFormat === 'excel' ? (
                <FileSpreadsheet className="h-6 w-6 text-emerald-400" />
              ) : detectedFormat === 'html' ? (
                <FileCode className="h-6 w-6 text-amber-400" />
              ) : (
                <UploadCloud className="h-6 w-6" />
              )}
            </div>
            <p className="font-bold text-white text-xs sm:text-sm">
              {loadedFileName ? loadedFileName : 'Click or Drag & Drop File to Import'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Select WhatsApp Export (.zip), Excel (.xlsx, .xls, .csv), HTML table (.html), or Chat (.txt)
            </p>
            {loadedFileName && (
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLoadedFileName('');
                    setRawText('');
                    setExcelExtractedListings([]);
                    setZipDetails(null);
                    setDetectedFormat(null);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700"
                >
                  <X className="h-3 w-3" />
                  <span>Clear / Select Another File</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick 1-Click Test Samples */}
          <div className="flex flex-wrap items-center justify-between text-xs pt-1 gap-y-1">
            <span className="text-slate-400 font-medium">Quick 1-Click Samples:</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSampleClick('zip')}
                className="text-purple-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <FileArchive className="h-3.5 w-3.5" />
                Sample ZIP (.zip)
              </button>
              <span className="text-slate-700 hidden sm:inline">|</span>
              <button
                type="button"
                onClick={() => handleSampleClick('excel')}
                className="text-emerald-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Sample Excel (.xlsx)
              </button>
              <span className="text-slate-700 hidden sm:inline">|</span>
              <button
                type="button"
                onClick={() => handleSampleClick('html')}
                className="text-amber-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <FileCode className="h-3.5 w-3.5" />
                Sample HTML (.html)
              </button>
              <span className="text-slate-700 hidden sm:inline">|</span>
              <button
                type="button"
                onClick={() => handleSampleClick('txt')}
                className="text-sky-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                Sample TXT (.txt)
              </button>
            </div>
          </div>

          {/* ZIP ARCHIVE UNPACKED CARD */}
          {zipDetails && (
            <div className="border border-purple-500/30 bg-purple-500/5 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                  <FolderArchive className="h-4 w-4" />
                  ZIP Archive Unpacked: {zipDetails.name}
                </span>
                <span className="text-[11px] text-slate-400">
                  {zipDetails.totalFiles} file(s) total
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {zipDetails.extractedTextFiles.map((txt, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {txt} (Extracted)
                  </span>
                ))}
                {zipDetails.extractedExcelFiles.map((xl, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono flex items-center gap-1">
                    <FileSpreadsheet className="h-3 w-3" /> {xl} (Extracted)
                  </span>
                ))}
                {zipDetails.mediaFilesCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {zipDetails.mediaFilesCount} media file(s) ignored (audio/photos)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* PREVIEW: Excel SheetJS Parsed Listings */}
          {excelExtractedListings.length > 0 && (
            <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Check className="h-4 w-4" />
                  SheetJS Parsed {excelExtractedListings.length} Multi-Column Properties:
                </span>
                <span className="text-[11px] text-slate-400">Ready to save to inventory</span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {excelExtractedListings.map((item, idx) => (
                  <div
                    key={`${item.id || 'excel'}_${idx}`}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="px-1.5 py-0.2 rounded font-bold text-[10px] bg-slate-800 text-amber-400">
                        {item.category}
                      </span>
                      <span className="font-bold text-white">#{item.unitNumber}</span>
                      <span className="text-slate-400">{item.society} • {item.block}</span>
                      <span className="text-slate-500">({item.sizeLabel})</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-amber-400">{formatLakhs(item.priceInLakhs)}</span>
                      <button
                        onClick={() => setExcelExtractedListings(prev => prev.filter(p => p.id !== item.id))}
                        className="text-slate-500 hover:text-red-400 p-1"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Text / Extracted Content Textarea (when not Excel or for manual paste) */}
          {excelExtractedListings.length === 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Extracted Text / WhatsApp Chat Content:
              </label>
              <textarea
                rows={7}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={`Paste WhatsApp dealer broadcast or exported chat text here... e.g:
➡️*DHA Phase 6 Block C 1 Kanal plot 340 corner demand 4.35 Crore
➡️*Bahria Town Sector C plot 210, 10 marla demand 1.45 Cr
➡️*Lake City Sector M7 plot 180, 5 marla demand 62 Lac
Contact Ch. Kamran 03004000123`}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs sm:text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Society & Contact Defaults */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Society</label>
              <select
                value={defaultSociety}
                onChange={e => setDefaultSociety(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                {LAHORE_SOCIETIES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Default Dealer Contact</label>
              <input
                type="text"
                value={defaultContact}
                onChange={e => setDefaultContact(e.target.value)}
                placeholder="- (or custom phone)"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Tip Banner */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
            <Lightbulb className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" />
            <span>
              <strong>ZIP files (.zip)</strong> from WhatsApp chat exports automatically unpack <code className="font-mono bg-amber-500/20 px-1 rounded">_chat.txt</code> and skip audio/photos. Excel files (.xlsx, .xls, .csv) are parsed locally via <strong>SheetJS</strong> with multi-column support.
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 px-5 py-3.5 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="syncCheck"
              checked={syncToDrive}
              onChange={e => setSyncToDrive(e.target.checked)}
              className="h-4 w-4 rounded accent-amber-500"
            />
            <label htmlFor="syncCheck" className="text-xs text-slate-400 cursor-pointer">
              Auto-sync to Google Drive
            </label>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading || (excelExtractedListings.length === 0 && !rawText.trim())}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : excelExtractedListings.length > 0 ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save {excelExtractedListings.length} Excel Properties</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  <span>Parse &amp; Save Inventories</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
