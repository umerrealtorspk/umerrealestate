import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const INVENTORY_PATH = path.join(DATA_DIR, 'inventory.json');
const REQUIREMENTS_PATH = path.join(DATA_DIR, 'requirements.json');
const CONFIG_PATH = path.join(DATA_DIR, 'app_config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadRequirements(): any[] {
  try {
    if (fs.existsSync(REQUIREMENTS_PATH)) {
      const data = fs.readFileSync(REQUIREMENTS_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('[Requirements Store] Error loading requirements:', e);
  }
  return [];
}

export function saveRequirements(items: any[]): void {
  try {
    fs.writeFileSync(REQUIREMENTS_PATH, JSON.stringify(items, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Requirements Store] Error saving requirements:', e);
  }
}

export function loadInventoryItems(): any[] {
  try {
    if (fs.existsSync(INVENTORY_PATH)) {
      const data = fs.readFileSync(INVENTORY_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('[Inventory Store] Error loading inventory:', e);
  }
  return [];
}

export function saveInventoryItems(items: any[]): void {
  try {
    fs.writeFileSync(INVENTORY_PATH, JSON.stringify(items, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Inventory Store] Error saving inventory:', e);
  }
}

export function loadAppConfig(): any {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('[Config Store] Error loading config:', e);
  }
  return {};
}

export function saveAppConfig(cfg: any): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Config Store] Error saving config:', e);
  }
}
