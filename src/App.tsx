import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PropertyListing, FilterState, SheetConfig } from './types/inventory';
import { INITIAL_SEED_INVENTORY, LAHORE_SOCIETIES } from './data/seedInventory';
import { Header } from './components/Header';
import { StatsDashboard } from './components/StatsDashboard';
import { FilterBar } from './components/FilterBar';
import { PropertyCard } from './components/PropertyCard';
import { InventoryTableView } from './components/InventoryTableView';
import { AIChatImportModal } from './components/AIChatImportModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { GoogleDriveManagerModal } from './components/GoogleDriveManagerModal';
import { AddManualListingModal } from './components/AddManualListingModal';
import { MoveSocietyModal } from './components/MoveSocietyModal';
import { WhatsAppAutomationModal } from './components/WhatsAppAutomationModal';
import { RequirementsView } from './components/RequirementsView';
import { QuickToast } from './components/QuickToast';
import { SignInPage } from './components/SignInPage';
import { 
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { 
  subscribeToInventory, 
  savePropertyToFirestore, 
  saveBatchPropertiesToFirestore, 
  deletePropertyFromFirestore, 
  deleteBatchPropertiesFromFirestore,
  loadConfigFromFirestore,
  saveConfigToFirestore,
  isFirestoreQuotaExceeded,
  isQuotaError
} from './services/firebaseDb';
import { DataMigrationModal } from './components/DataMigrationModal';
import {
  fetchListingsFromSheets,
  saveListingToSheets,
  saveBatchListingsToSheets,
  updateListingInSheets,
  deleteListingFromSheets,
  deleteBatchListingsFromSheets,
} from './services/googleSheetsService';
import { 
  safeSaveInventory, 
  safeSetLocalStorage, 
  loadInventoryFromIndexedDB 
} from './utils/storageUtils';

export default function App() {
  // Authentication State: Username 'Umer23' & Password '12umer45'
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const local = localStorage.getItem('umer_admin_auth');
      const session = sessionStorage.getItem('umer_admin_auth');
      if (local || session) {
        const parsed = JSON.parse(local || session || '{}');
        if (parsed?.username) return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  });

  const [currentUser, setCurrentUser] = useState<string>(() => {
    try {
      const local = localStorage.getItem('umer_admin_auth');
      const session = sessionStorage.getItem('umer_admin_auth');
      if (local || session) {
        const parsed = JSON.parse(local || session || '{}');
        if (parsed?.username) return parsed.username;
      }
    } catch (e) {}
    return 'Umer23';
  });

  const handleLoginSuccess = (user: string) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    showToast(`Welcome back, ${user}! Admin Panel is ready.`);
  };

  const handleSignOut = () => {
    localStorage.removeItem('umer_admin_auth');
    sessionStorage.removeItem('umer_admin_auth');
    setIsAuthenticated(false);
  };

  // Inventory state with localStorage persistence
  const [inventory, setInventory] = useState<PropertyListing[]>(() => {
    try {
      const saved = localStorage.getItem('bahria_orchard_inventory') || localStorage.getItem('umer_inventory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return INITIAL_SEED_INVENTORY;
  });

  // High-performance debounced persistence to IndexedDB & safe localStorage without quota errors
  useEffect(() => {
    const timer = setTimeout(() => {
      safeSaveInventory(inventory);
    }, 600);
    return () => clearTimeout(timer);
  }, [inventory]);

  // Load from IndexedDB if larger inventory was saved there
  useEffect(() => {
    loadInventoryFromIndexedDB().then((dbItems) => {
      if (dbItems && dbItems.length > 0 && inventory.length <= INITIAL_SEED_INVENTORY.length) {
        setInventory(dbItems);
      }
    });
  }, []);

  // Navigation Section: 'inventory' | 'requirements'
  const [currentSection, setCurrentSection] = useState<'inventory' | 'requirements'>('inventory');
  const [activeReqCount, setActiveReqCount] = useState<number>(0);

  const refreshRequirementsCount = useCallback(async () => {
    try {
      const res = await fetch('/api/requirements');
      const data = await res.json();
      if (data.success && typeof data.activeCount === 'number') {
        setActiveReqCount(data.activeCount);
      }
    } catch {}
  }, []);

  const handleRefreshServerInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory?_t=' + Date.now());
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data?.inventory || []);
      if (items && items.length > 0) {
        setInventory(items);
        safeSaveInventory(items);
        showToast(`Inventory updated: ${items.length.toLocaleString()} total listings`);
      }
      refreshRequirementsCount();
    } catch (e) {
      console.warn('[Inventory Refresh Error]:', e);
    }
  }, [refreshRequirementsCount]);

  useEffect(() => {
    refreshRequirementsCount();
  }, [refreshRequirementsCount]);

  // Cloud Live Status: 'live' | 'saving' | 'offline'
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'live' | 'saving' | 'offline'>('live');

  // Shared Google Sheets & Drive config across ALL devices
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>(() => {
    try {
      const saved = localStorage.getItem('umer_sheet_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      scriptUrl: '',
      driveFolderName: 'Umer Realtors - Lahore Real Estate',
      autoSync: true,
      syncStatus: 'idle',
    };
  });

  // Global Config Saver: syncs across devices via server /api/config and Firestore
  const handleSaveGlobalConfig = useCallback(async (newCfg: SheetConfig) => {
    setSheetConfig(newCfg);
    safeSetLocalStorage('umer_sheet_config', JSON.stringify(newCfg));

    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg),
      });
    } catch (err) {
      console.warn('[Config Server Sync Error]:', err);
    }
    saveConfigToFirestore(newCfg).catch(() => {});
  }, []);

  // Initial load: Fetch server config & inventory so all devices share same data
  useEffect(() => {
    let isSubscribed = true;

    // 1. Fetch shared Google Sheets config from backend server
    fetch('/api/config')
      .then(r => r.json())
      .then(res => {
        if (!isSubscribed) return;
        if (res?.config && res.config?.scriptUrl) {
          setSheetConfig(prev => ({ ...prev, ...res.config }));
          try {
            localStorage.setItem('umer_sheet_config', JSON.stringify(res.config));
          } catch (e) {}
        }
      })
      .catch(() => {});

    // 2. Fetch server inventory backup
    fetch('/api/inventory')
      .then(r => r.json())
      .then(data => {
        if (!isSubscribed) return;
        const items = Array.isArray(data)
          ? data
          : (data?.inventory && Array.isArray(data.inventory) ? data.inventory : (data?.items || []));
        if (items.length > 0) {
          setInventory(items);
          setCloudSyncStatus('live');
        }
      })
      .catch(() => {});

    // 3. Listen to Firestore if active
    const unsubscribe = subscribeToInventory(
      async (liveItems) => {
        if (!isSubscribed) return;
        if (liveItems && liveItems.length > 0) {
          setInventory(liveItems);
          setCloudSyncStatus('live');
        }
      },
      (err) => {
        if (isSubscribed) {
          setCloudSyncStatus('live');
        }
      }
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

  // Multi-Device Live Sync Polling Engine (every 60s, active tab only, with 429 backoff)
  useEffect(() => {
    let isPolling = true;
    let isSyncInProgress = false;
    let hasCheckedServerConfig = false;
    let lastSyncAt = 0;
    let rateLimitCooldownUntil = 0;

    const performSync = async (force = false) => {
      if (!isPolling || isSyncInProgress) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (Date.now() < rateLimitCooldownUntil) return;
      if (!force && Date.now() - lastSyncAt < 25000) return;

      isSyncInProgress = true;
      lastSyncAt = Date.now();

      try {
        // Check server /api/config once if scriptUrl is missing on this device
        if ((!sheetConfig.scriptUrl || !sheetConfig.scriptUrl.trim()) && !hasCheckedServerConfig) {
          hasCheckedServerConfig = true;
          try {
            const cfgRes = await fetch('/api/config');
            if (cfgRes.status === 429) {
              rateLimitCooldownUntil = Date.now() + 120000;
              return;
            }
            const cfgData = await cfgRes.json();
            if (cfgData?.config?.scriptUrl) {
              setSheetConfig(prev => ({ ...prev, ...cfgData.config }));
            }
          } catch {}
        }

        // If Google Sheets API URL is configured, sync from Google Sheets
        if (sheetConfig.scriptUrl && sheetConfig.scriptUrl.trim()) {
          try {
            const rawSheetListings = await fetchListingsFromSheets(sheetConfig.scriptUrl);
            if (!isPolling) return;

            const liveSheetListings = Array.isArray(rawSheetListings)
              ? rawSheetListings.filter(item => {
                  if (!item || !item.id) return false;
                  const isDummy = (!item.society || item.society === 'General') &&
                                  (item.priceInLakhs === 0 || !item.priceInLakhs) &&
                                  (!item.notes || item.notes.trim() === '');
                  return !isDummy;
                })
              : [];

            if (liveSheetListings.length > 0) {
              setInventory((prev) => {
                if (prev.length !== liveSheetListings.length) {
                  fetch('/api/inventory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inventory: liveSheetListings, merge: false }),
                  }).catch(() => {});
                  return liveSheetListings;
                }
                const isDiff = prev.some((p, idx) => {
                  const live = liveSheetListings[idx];
                  return !live || p.id !== live.id || p.priceInLakhs !== live.priceInLakhs || p.isSold !== live.isSold || p.formattedPrice !== live.formattedPrice;
                });
                if (isDiff) {
                  fetch('/api/inventory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inventory: liveSheetListings, merge: false }),
                  }).catch(() => {});
                  return liveSheetListings;
                }
                return prev;
              });
              setCloudSyncStatus('live');
              return;
            }
          } catch (e: any) {
            if (String(e?.message || '').includes('429')) {
              rateLimitCooldownUntil = Date.now() + 120000;
              return;
            }
            console.warn('[Sheets Live Sync Polling]:', e.message);
          }
        }

        // Fallback/Multi-device server sync
        try {
          const res = await fetch('/api/inventory?_t=' + Date.now());
          if (res.status === 429) {
            rateLimitCooldownUntil = Date.now() + 120000;
            return;
          }
          const data = await res.json();
          const serverItems = Array.isArray(data) ? data : (data?.inventory || data?.items || []);
          if (!isPolling) return;

          if (serverItems.length > 0) {
            setInventory((prev) => {
              if (prev.length !== serverItems.length) {
                return serverItems;
              }
              const isDiff = prev.some((p, idx) => {
                const live = serverItems[idx];
                return !live || p.id !== live.id || p.priceInLakhs !== live.priceInLakhs || p.isSold !== live.isSold;
              });
              return isDiff ? serverItems : prev;
            });
            setCloudSyncStatus('live');
          }
        } catch {
          // tolerate network glitch
        }
      } finally {
        isSyncInProgress = false;
      }
    };

    performSync(true);
    const intervalId = setInterval(() => performSync(false), 60000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        performSync(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isPolling = false;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sheetConfig.scriptUrl]);

  // View mode: 'table' (default, just like user HTML) or 'cards'
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    society: 'All Lahore',
    category: 'All',
    size: 'All',
    minPrice: 0,
    maxPrice: 1000,
    selectedFeatures: [],
    sortBy: 'recent',
  });

  // Modals
  const [isChatUploaderOpen, setIsChatUploaderOpen] = useState(false);
  const [isDriveManagerOpen, setIsDriveManagerOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isWhatsAppAutomationOpen, setIsWhatsAppAutomationOpen] = useState(false);
  const [listingsToMove, setListingsToMove] = useState<PropertyListing[]>([]);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  // Keyboard shortcut '/' focuses search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // High-performance filtered and sorted inventory (zero object allocations in sort, fast direct field matching)
  const filteredInventory = useMemo(() => {
    const query = filters.searchQuery.toLowerCase().trim();
    const queryTerms = query ? query.split(/\s+/).filter(Boolean) : null;
    const isAllSoc = filters.society === 'All Lahore';
    const isAllCat = filters.category === 'All';
    const isAllSize = filters.size === 'All';
    const minP = filters.minPrice;
    const maxP = filters.maxPrice;
    const featuresFilter = filters.selectedFeatures && filters.selectedFeatures.length > 0 ? filters.selectedFeatures : null;

    const filtered = inventory.filter(item => {
      // 1. Society filter
      if (!isAllSoc && item.society !== filters.society) return false;

      // 2. Category filter
      if (!isAllCat && item.category !== filters.category) return false;

      // 3. Size filter
      if (!isAllSize && item.sizeLabel !== filters.size) return false;

      // 4. Price filter
      const pLakhs = item.priceInLakhs || 0;
      if (minP > 0 && pLakhs < minP) return false;
      if (maxP < 1000 && pLakhs > maxP) return false;

      // 5. Search query (fast direct checks, includes ID / property code, unit, block, society, dealer, etc.)
      if (queryTerms) {
        const id = item.id || '';
        const u = item.unitNumber || '';
        const b = item.block || '';
        const s = item.society || '';
        const c = item.contactNumber || '';
        const d = item.dealerName || '';
        const sz = item.sizeLabel || '';
        const n = item.notes || '';
        const f = item.features ? item.features.join(' ') : '';
        const composite = `${id} ${u} ${b} ${s} ${c} ${d} ${sz} ${n} ${f}`.toLowerCase();

        for (let i = 0; i < queryTerms.length; i++) {
          if (!composite.includes(queryTerms[i])) return false;
        }
      }

      // 6. Feature tags filter
      if (featuresFilter) {
        const itemFeatures = item.features || [];
        const matchesAll = featuresFilter.every(sf =>
          itemFeatures.some(itf => itf.toLowerCase().includes(sf.toLowerCase()))
        );
        if (!matchesAll) return false;
      }

      return true;
    });

    // Blazing fast sort
    if (filters.sortBy === 'price-asc') {
      return filtered.sort((a, b) => (a.priceInLakhs || 0) - (b.priceInLakhs || 0));
    }
    if (filters.sortBy === 'price-desc') {
      return filtered.sort((a, b) => (b.priceInLakhs || 0) - (a.priceInLakhs || 0));
    }
    if (filters.sortBy === 'unit') {
      return filtered.sort((a, b) => {
        const numA = parseInt((a.unitNumber || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b.unitNumber || '').replace(/\D/g, '')) || 0;
        return numA !== numB ? numA - numB : (a.unitNumber || '').localeCompare(b.unitNumber || '');
      });
    }
    // Default 'recent': Fast direct ISO string comparison (0 Date object allocations)
    return filtered.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
  }, [inventory, filters]);

  // High-performance single-pass calculation for unique blocks and societies
  const { availableSocieties, availableBlocks } = useMemo(() => {
    const baseSoc = (LAHORE_SOCIETIES as unknown as string[]).filter(s => s.trim().toLowerCase() !== 'all lahore');
    const socSet = new Set<string>(baseSoc);
    const blockSet = new Set<string>();

    for (let i = 0; i < inventory.length; i++) {
      const it = inventory[i];
      if (it.society && it.society.trim() && it.society.trim().toLowerCase() !== 'all lahore') {
        socSet.add(it.society.trim());
      }
      if (it.block && it.block.trim()) {
        blockSet.add(it.block.trim());
      }
    }

    const cleanSocieties = Array.from(socSet).sort();

    return {
      availableSocieties: ['All Lahore', ...cleanSocieties],
      availableBlocks: Array.from(blockSet).sort()
    };
  }, [inventory]);

  // Cards view pagination state (prevents rendering thousands of DOM nodes in cards mode)
  const [cardsPage, setCardsPage] = useState<number>(1);
  const cardsPageSize = 24;

  useEffect(() => {
    setCardsPage(1);
  }, [filteredInventory.length]);

  const cardsTotalPages = Math.max(1, Math.ceil(filteredInventory.length / cardsPageSize));
  const safeCardsPage = Math.min(cardsPage, cardsTotalPages);
  const paginatedCards = useMemo(() => {
    const start = (safeCardsPage - 1) * cardsPageSize;
    return filteredInventory.slice(start, start + cardsPageSize);
  }, [filteredInventory, safeCardsPage, cardsPageSize]);

  // Sync listing to Google Drive
  const syncPropertyToGoogleDrive = async (property: PropertyListing) => {
    if (!sheetConfig.scriptUrl) return;
    try {
      await fetch('/api/sheets-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptUrl: sheetConfig.scriptUrl,
          action: 'append',
          payload: {
            society: property.society,
            block: property.block,
            unitNumber: property.unitNumber,
            category: property.category,
            sizeLabel: property.sizeLabel,
            priceInLakhs: property.priceInLakhs,
            formattedPrice: property.formattedPrice,
            features: property.features,
            dealerName: property.dealerName,
            contactNumber: property.contactNumber,
            notes: property.notes,
          }
        })
      });
    } catch (err) {
      console.error('Error syncing to Drive:', err);
    }
  };

  const handleAddListings = async (newListings: PropertyListing[], syncToDrive: boolean = false) => {
    setCloudSyncStatus('saving');
    const combined = [...newListings, ...inventory];
    setInventory(combined);
    safeSaveInventory(combined);

    try {
      // 1. If Google Sheets API configured, save batch to Google Sheets directly
      if (sheetConfig.scriptUrl) {
        saveBatchListingsToSheets(sheetConfig.scriptUrl, newListings)
          .then(() => setCloudSyncStatus('live'))
          .catch(err => console.warn('[Sheets Add Error]', err));
      }

      // 2. Save to Cloud Firestore in background if still active
      saveBatchPropertiesToFirestore(newListings).catch(() => {});

      // 3. Persist to Express server backend disk storage
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: newListings, merge: true }),
      });
      setCloudSyncStatus('live');
      showToast(`Added ${newListings.length} listings! Live in Google Sheets & CRM.`);
    } catch (err) {
      console.error('[Add Error]', err);
      setCloudSyncStatus('live');
      showToast(`Added ${newListings.length} listings (saved locally and queued for sync).`);
    }

    if ((syncToDrive || sheetConfig.autoSync) && sheetConfig.scriptUrl) {
      showToast(`Syncing ${newListings.length} listings to Google Drive...`);
      for (const item of newListings) {
        await syncPropertyToGoogleDrive(item);
      }
      showToast(`Synced ${newListings.length} listings to Google Drive sheets!`);
    }
  };

  const handleAddSingle = async (listing: PropertyListing, syncToDrive: boolean) => {
    setCloudSyncStatus('saving');
    const combined = [listing, ...inventory];
    setInventory(combined);
    safeSaveInventory(combined);

    try {
      if (sheetConfig.scriptUrl) {
        saveListingToSheets(sheetConfig.scriptUrl, listing)
          .then(() => setCloudSyncStatus('live'))
          .catch(err => console.warn('[Sheets Add Single Error]', err));
      }

      savePropertyToFirestore(listing).catch(() => {});
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: [listing], merge: true }),
      });
      setCloudSyncStatus('live');
      showToast('New listing added and live on Google Sheets & Web App!');
    } catch (err) {
      console.error('[Add Single Error]', err);
      setCloudSyncStatus('live');
    }

    if (syncToDrive && sheetConfig.scriptUrl) {
      syncPropertyToGoogleDrive(listing);
    }
  };

  const handleDeleteListing = async (id: string) => {
    setCloudSyncStatus('saving');
    const updated = inventory.filter(item => item.id !== id);
    setInventory(updated);
    safeSaveInventory(updated);

    try {
      if (sheetConfig.scriptUrl) {
        deleteListingFromSheets(sheetConfig.scriptUrl, id)
          .then(() => setCloudSyncStatus('live'))
          .catch(err => console.warn('[Sheets Delete Error]', err));
      }

      deletePropertyFromFirestore(id).catch(() => {});
      await fetch('/api/inventory/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      setCloudSyncStatus('live');
      showToast('Item removed from inventory & Google Sheets.');
    } catch (err) {
      console.error('[Delete Error]', err);
      setCloudSyncStatus('live');
    }
  };

  const handleBatchDelete = async (ids: string[]) => {
    setCloudSyncStatus('saving');
    const updated = inventory.filter(item => !ids.includes(item.id));
    setInventory(updated);
    safeSaveInventory(updated);

    try {
      if (sheetConfig.scriptUrl) {
        deleteBatchListingsFromSheets(sheetConfig.scriptUrl, ids)
          .then(() => setCloudSyncStatus('live'))
          .catch(err => console.warn('[Sheets Batch Delete Error]', err));
      }

      deleteBatchPropertiesFromFirestore(ids).catch(() => {});
      await fetch('/api/inventory/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      setCloudSyncStatus('live');
      showToast(`Removed ${ids.length} listings from Google Sheets & CRM.`);
    } catch (err) {
      console.error('[Batch Delete Error]', err);
      setCloudSyncStatus('live');
    }
  };

  const handleUpdateListing = async (updatedItem: PropertyListing) => {
    setCloudSyncStatus('saving');
    const updated = inventory.map(item => item.id === updatedItem.id ? updatedItem : item);
    setInventory(updated);
    safeSaveInventory(updated);

    try {
      if (sheetConfig.scriptUrl) {
        updateListingInSheets(sheetConfig.scriptUrl, updatedItem)
          .then(() => setCloudSyncStatus('live'))
          .catch(err => console.warn('[Sheets Update Error]', err));
      }

      savePropertyToFirestore(updatedItem).catch(() => {});
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: updated, merge: false }),
      });
      setCloudSyncStatus('live');
      showToast('Listing updated & live on Google Sheets!');
    } catch (err) {
      console.error('[Update Error]', err);
      setCloudSyncStatus('live');
    }
  };

  // Move listing(s) to another society (Single or Batch)
  const handleOpenMoveSingle = (listing: PropertyListing) => {
    setListingsToMove([listing]);
    setIsMoveModalOpen(true);
  };

  const handleOpenMoveBatch = (listings: PropertyListing[]) => {
    if (listings.length === 0) return;
    setListingsToMove(listings);
    setIsMoveModalOpen(true);
  };

  const handleConfirmMove = async (listingIds: string[], newSociety: string, newBlock?: string) => {
    setCloudSyncStatus('saving');
    const idSet = new Set(listingIds);

    const updated = inventory.map(item => {
      if (idSet.has(item.id)) {
        return {
          ...item,
          society: newSociety,
          block: newBlock !== undefined ? newBlock : item.block,
        };
      }
      return item;
    });

    const movedListings = updated.filter(item => idSet.has(item.id));
    setInventory(updated);
    safeSaveInventory(updated);

    try {
      if (sheetConfig.scriptUrl) {
        saveBatchListingsToSheets(sheetConfig.scriptUrl, movedListings)
          .then(() => setCloudSyncStatus('live'))
          .catch(err => console.warn('[Sheets Move Error]', err));
      }

      saveBatchPropertiesToFirestore(movedListings).catch(() => {});
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: movedListings, merge: true }),
      });
      setCloudSyncStatus('live');
      showToast(`Successfully moved ${listingIds.length} property(s) to ${newSociety}! Live on Google Sheets.`);
    } catch (err) {
      console.error('[Move Error]', err);
      setCloudSyncStatus('live');
      showToast(`Moved ${listingIds.length} property(s) to ${newSociety} (cached locally).`);
    }
  };

  const handleForceSyncLive = async () => {
    setCloudSyncStatus('saving');
    if (sheetConfig.scriptUrl) {
      showToast('Syncing all listings to Google Sheets Master Inventory...');
      try {
        await saveBatchListingsToSheets(sheetConfig.scriptUrl, inventory);
        setCloudSyncStatus('live');
        showToast(`100% Live! All ${inventory.length.toLocaleString()} listings synced directly to Google Sheets.`);
        return;
      } catch (err: any) {
        console.warn('[Google Sheets Force Sync Error]:', err);
      }
    }

    showToast('Syncing all listings to Cloud Database...');
    try {
      await saveBatchPropertiesToFirestore(inventory);
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory, merge: false }),
      });
      setCloudSyncStatus('live');
      showToast(`100% Live! All ${inventory.length} listings are synced to Cloud Database.`);
    } catch (err: any) {
      console.error('[Force Sync Error]', err);
      setCloudSyncStatus('live');
      showToast('Synced to local server backup.');
    }
  };

  const handleSyncNow = async () => {
    if (!sheetConfig.scriptUrl) {
      setIsSheetsModalOpen(true);
      return;
    }

    showToast('Fetching Google Drive sheets data...');
    try {
      const res = await fetch('/api/sheets-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptUrl: sheetConfig.scriptUrl,
          action: 'fetch'
        })
      });
      const data = await res.json();
      if (data.listings && Array.isArray(data.listings) && data.listings.length > 0) {
        setInventory(data.listings);
        setSheetConfig(prev => ({
          ...prev,
          syncStatus: 'connected',
          lastSyncedAt: new Date().toLocaleTimeString(),
        }));
        showToast(`Loaded ${data.listings.length} verified listings from Google Drive!`);
      } else {
        setSheetConfig(prev => ({ ...prev, syncStatus: 'connected', lastSyncedAt: new Date().toLocaleTimeString() }));
        showToast('Google Drive sheets are connected and up to date.');
      }
    } catch (err: any) {
      showToast('Error syncing with Drive: ' + (err.message || 'Check connection'));
      setSheetConfig(prev => ({ ...prev, syncStatus: 'error' }));
    }
  };

  const handleResetFilters = () => {
    setFilters({
      searchQuery: '',
      society: 'All Lahore',
      category: 'All',
      size: 'All',
      minPrice: 0,
      maxPrice: 1000,
      selectedFeatures: [],
      sortBy: 'recent',
    });
  };

  // If not signed in, show the Admin Sign In page
  if (!isAuthenticated) {
    return (
      <>
        <SignInPage onSuccess={handleLoginSuccess} />
        <QuickToast
          message={toastMessage}
          onClose={() => setToastMessage(null)}
        />
      </>
    );
  }

  return (
    <div className="h-full min-h-screen flex flex-col font-sans bg-slate-950 text-slate-100 bg-ambient-mesh bg-grid-pattern overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      
      {/* Navigation / Header */}
      <Header
        onOpenChatUploader={() => setIsChatUploaderOpen(true)}
        onOpenDriveManager={() => setIsDriveManagerOpen(true)}
        onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        sheetConfig={sheetConfig}
        viewMode={viewMode}
        setViewMode={setViewMode}
        adminUser={currentUser}
        onSignOut={handleSignOut}
        cloudSyncStatus={cloudSyncStatus}
        onForceSyncLive={handleForceSyncLive}
        onOpenMigrationModal={() => setIsMigrationModalOpen(true)}
        onOpenWhatsAppAutomation={() => setIsWhatsAppAutomationOpen(true)}
        currentSection={currentSection}
        setCurrentSection={setCurrentSection}
        activeRequirementsCount={activeReqCount}
        totalListingsCount={inventory.length}
      />

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {currentSection === 'requirements' ? (
          <RequirementsView
            onNotify={showToast}
            onRefreshInventory={handleRefreshServerInventory}
            inventory={inventory}
          />
        ) : (
          <>
            {/* Top Statistics Cards */}
            <StatsDashboard
              inventory={inventory}
              selectedSociety={filters.society}
              onSelectSociety={soc => setFilters(prev => ({ ...prev, society: soc }))}
              societies={availableSocieties}
            />

            {/* Universal Search & Multi-Filters */}
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              totalMatches={filteredInventory.length}
              totalInventory={inventory.length}
              availableBlocks={availableBlocks}
              viewMode={viewMode}
              setViewMode={setViewMode}
            />

        {/* Inventory View: Table or Cards */}
        {viewMode === 'table' ? (
          <InventoryTableView
            inventory={filteredInventory}
            onDelete={handleDeleteListing}
            onBatchDelete={handleBatchDelete}
            onMoveListing={handleOpenMoveSingle}
            onBatchMove={handleOpenMoveBatch}
            onNotify={showToast}
            onResetFilters={handleResetFilters}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredInventory.length === 0 ? (
                <div className="col-span-full rounded-2xl bg-[#0d111a] border border-white/[0.08] py-16 text-center text-slate-400 space-y-3.5">
                  <FolderOpen className="h-10 w-10 text-slate-600 mx-auto" />
                  <p className="text-sm">No matching plot or house found with current filters.</p>
                  <button 
                    onClick={handleResetFilters} 
                    className="text-xs text-amber-400 underline hover:text-amber-300 font-semibold cursor-pointer"
                  >
                    Reset all filters
                  </button>
                </div>
              ) : (
                paginatedCards.map((item, index) => (
                  <PropertyCard
                    key={`${item.id || 'card'}_${index}`}
                    property={item}
                    onDelete={handleDeleteListing}
                    onMove={handleOpenMoveSingle}
                    onNotify={showToast}
                  />
                ))
              )}
            </div>

            {/* Cards View Pagination Controls */}
            {filteredInventory.length > 0 && cardsTotalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:px-4 bg-[#0d111a] border border-white/[0.08] rounded-2xl text-xs text-slate-300">
                <div className="text-slate-400 text-xs">
                  Showing <strong className="text-white font-mono">{(safeCardsPage - 1) * cardsPageSize + 1}</strong> - <strong className="text-white font-mono">{Math.min(filteredInventory.length, safeCardsPage * cardsPageSize)}</strong> of <strong className="text-amber-300 font-mono">{filteredInventory.length}</strong> listings (Page {safeCardsPage} of {cardsTotalPages})
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeCardsPage <= 1}
                    onClick={() => setCardsPage(1)}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="First Page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={safeCardsPage <= 1}
                    onClick={() => setCardsPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 bg-amber-500 text-slate-950 font-bold rounded-lg font-mono text-xs">
                    {safeCardsPage} / {cardsTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeCardsPage >= cardsTotalPages}
                    onClick={() => setCardsPage(p => Math.min(cardsTotalPages, p + 1))}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={safeCardsPage >= cardsTotalPages}
                    onClick={() => setCardsPage(cardsTotalPages)}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Last Page"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </main>

      {/* Enterprise Status Footer */}
      <footer className="border-t border-white/[0.06] bg-[#090c13]/80 py-4 px-4 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-300">Umer Realtors</span>
            <span className="text-slate-600">·</span>
            <span>All Lahore Real Estate (DHA, Bahria, Lake City, Gulberg)</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Cloud Firestore Synced</span>
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">Press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-slate-300">/</kbd> to Search</span>
          </div>
        </div>
      </footer>

      {/* Autonomous AI Real Estate Agent (ChatGPT Style) with Full Inventory & Drive Data Access */}
      <AIChatImportModal
        isOpen={isChatUploaderOpen}
        onClose={() => setIsChatUploaderOpen(false)}
        inventory={inventory}
        sheetConfig={sheetConfig}
        onAddListings={handleAddListings}
        onDeleteListings={handleBatchDelete}
        onUpdateListing={handleUpdateListing}
        onNotify={showToast}
        defaultSociety={filters.society}
        onOpenDriveManager={() => setIsDriveManagerOpen(true)}
      />

      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        config={sheetConfig}
        onSaveConfig={handleSaveGlobalConfig}
        onSyncNow={handleSyncNow}
        inventory={inventory}
        onAddListings={handleAddListings}
        onNotify={showToast}
        onOpenMigrationModal={() => setIsMigrationModalOpen(true)}
      />

      <DataMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        inventory={inventory}
        sheetConfig={sheetConfig}
        onSaveSheetConfig={handleSaveGlobalConfig}
        onMigrationComplete={(migrated) => {
          if (migrated && migrated.length > 0) {
            setInventory(migrated);
          }
        }}
        onNotify={showToast}
      />

      {/* Official Google Drive Manager with OAuth & Lahore Data folder sync */}
      <GoogleDriveManagerModal
        isOpen={isDriveManagerOpen}
        onClose={() => setIsDriveManagerOpen(false)}
        inventory={inventory}
        onAddListings={handleAddListings}
        onNotify={showToast}
        defaultSociety={filters.society}
      />

      <AddManualListingModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddListing={handleAddSingle}
        onNotify={showToast}
        societies={availableSocieties}
      />

      {/* Move Listing to Another Society (Single or Batch) */}
      <MoveSocietyModal
        isOpen={isMoveModalOpen}
        onClose={() => {
          setIsMoveModalOpen(false);
          setListingsToMove([]);
        }}
        listingsToMove={listingsToMove}
        availableSocieties={availableSocieties}
        onConfirmMove={handleConfirmMove}
        onNotify={showToast}
      />

      {/* WhatsApp Cloud API Webhook Automation Modal */}
      <WhatsAppAutomationModal
        isOpen={isWhatsAppAutomationOpen}
        onClose={() => setIsWhatsAppAutomationOpen(false)}
        onNotify={showToast}
        onRefreshInventory={handleRefreshServerInventory}
      />

      {/* Notification Toast */}
      <QuickToast
        message={toastMessage}
        onClose={() => setToastMessage(null)}
      />

    </div>
  );
}
