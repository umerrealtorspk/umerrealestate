import React, { useState } from 'react';
import { PropertyListing } from '../types/inventory';
import { LAHORE_SOCIETIES } from '../data/seedInventory';
import { formatLakhs, generateWhatsAppLink, cleanPakistaniPhone } from '../utils/pakistanCurrency';
import { 
  Building2, 
  MapPin, 
  MessageCircle, 
  Phone, 
  Download, 
  Sheet
} from 'lucide-react';

interface SideBySideTableViewProps {
  inventory: PropertyListing[];
  onOpenChatUploader: () => void;
  onOpenSheetsModal: () => void;
  onNotify?: (msg: string) => void;
}

export const SideBySideTableView: React.FC<SideBySideTableViewProps> = ({
  inventory,
  onOpenChatUploader,
  onOpenSheetsModal,
  onNotify,
}) => {
  const [activeSocietyTab, setActiveSocietyTab] = useState<string>('All Lahore');

  const filteredListings = activeSocietyTab === 'All Lahore'
    ? inventory
    : inventory.filter(p => p.society === activeSocietyTab);

  const exportCSV = () => {
    const headers = ['Society', 'Block_Phase', 'Unit_No', 'Type', 'Size', 'Demand_Lakhs', 'Dealer_Name', 'Contact', 'Features'];
    const rows = filteredListings.map(p => [
      `"${p.society}"`,
      `"${p.block}"`,
      `"${p.unitNumber}"`,
      p.category,
      p.sizeLabel,
      p.priceInLakhs,
      `"${p.dealerName || ''}"`,
      `"${p.contactNumber || ''}"`,
      `"${(p.features || []).join(', ')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Umer_Realtors_${activeSocietyTab.replace(/\s+/g, '_')}_Inventory.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (onNotify) onNotify(`Exported ${activeSocietyTab} sheet to CSV!`);
  };

  return (
    <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-blue-100 dark:border-slate-800 shadow-xs overflow-hidden mb-8">
      
      {/* Top Header & Society Tab Strip */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                <Sheet className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Multi-Society Google Drive Sheets View
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live spreadsheet data organized by Lahore housing societies
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold shadow-xs transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-blue-600" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onOpenSheetsModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
            >
              <Sheet className="h-3.5 w-3.5" />
              <span>Sync Drive</span>
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1">
          {LAHORE_SOCIETIES.map(soc => {
            const count = soc === 'All Lahore'
              ? inventory.length
              : inventory.filter(p => p.society === soc).length;

            return (
              <button
                key={soc}
                onClick={() => setActiveSocietyTab(soc)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all border ${
                  activeSocietyTab === soc
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                }`}
              >
                <span>{soc}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeSocietyTab === soc ? 'bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/90 dark:bg-slate-800 text-slate-600 dark:text-slate-400 sticky top-0 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="py-3 px-3.5 font-bold">Society</th>
              <th className="py-3 px-3 font-bold">Block / Phase</th>
              <th className="py-3 px-2 font-bold">Unit #</th>
              <th className="py-3 px-2 font-bold">Type</th>
              <th className="py-3 px-2 font-bold">Size</th>
              <th className="py-3 px-3 font-bold">Demand (PKR)</th>
              <th className="py-3 px-3 font-bold">Dealer</th>
              <th className="py-3 px-3 font-bold">Tags</th>
              <th className="py-3 px-3 text-right font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredListings.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  No properties currently listed in {activeSocietyTab}.
                </td>
              </tr>
            ) : (
              filteredListings.map((item, idx) => (
                <tr key={`${item.id || 'sb'}_${idx}`} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/60 transition-colors">
                  <td className="py-2.5 px-3.5 font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {item.society}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {item.block}
                  </td>
                  <td className="py-2.5 px-2 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    #{item.unitNumber}
                  </td>
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      item.category === 'Plot'
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                        : item.category === 'Commercial'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                    }`}>
                      {item.category}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {item.sizeLabel}
                  </td>
                  <td className="py-2.5 px-3 font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {formatLakhs(item.priceInLakhs)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                      {item.dealerName}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {item.contactNumber}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-1 max-w-[140px]">
                      {item.features.slice(0, 2).map((f, i) => (
                        <span key={i} className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={generateWhatsAppLink(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                        title="WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                      {item.contactNumber && (
                        <a
                          href={`tel:+${cleanPakistaniPhone(item.contactNumber)}`}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                          title="Call"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
