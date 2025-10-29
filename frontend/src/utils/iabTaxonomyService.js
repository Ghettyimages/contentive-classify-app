import { API_BASE_URL } from '../config';

// Centralized IAB Taxonomy Service
// Provides consistent IAB 3.1 code-to-label mapping across all components

class IABTaxonomyService {
  constructor() {
    this.codeToLabelMap = new Map();
    this.initialized = false;
    this.version = '3.1';
    this.source = '';
    this.totalCodes = 0;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Try to load from backend API first
      const response = await fetch(`${API_BASE_URL}/api/iab31`);
      if (response.ok) {
        const data = await response.json();
        if (data.codes && Array.isArray(data.codes)) {
          this.buildCodeMap(data.codes);
          this.version = data.version || this.version;
          this.source = data.source || 'api:iab31';
          this.initialized = true;
          console.log('[IAB Service] Initialized from backend with', this.codeToLabelMap.size, 'codes');
          return;
        }
      }
    } catch (err) {
      console.warn('[IAB Service] Backend load failed, using fallback:', err.message);
    }

    try {
      // Fallback to local JSON
      const { default: bundled } = await import('../data/iab_content_taxonomy_3_1.v1.json');
      if (bundled && bundled.codes && Array.isArray(bundled.codes)) {
        this.buildCodeMap(bundled.codes);
        this.version = bundled.version || this.version;
        this.source = bundled.source || 'local:iab_content_taxonomy_3_1.v1.json';
        this.initialized = true;
        console.log('[IAB Service] Initialized from fallback with', this.codeToLabelMap.size, 'codes');
      }
    } catch (err) {
      console.error('[IAB Service] Failed to initialize:', err);
    }
  }

  buildCodeMap(codes) {
    this.codeToLabelMap.clear();
    for (const item of codes) {
      if (!item || !item.code) continue;

      const code = item.code.trim();
      const label = item.label || item.name || '';
      const path = Array.isArray(item.path) ? item.path : [];

      // Store both the simple label and the full path
      this.codeToLabelMap.set(code, {
        label: label,
        path: path,
        fullPath: path.length > 0 ? path.join(' > ') : label,
        level: item.level || 1,
        parent: item.parent || null
      });
    }
    this.totalCodes = this.codeToLabelMap.size;
  }

  // Get label for a code
  getLabel(code) {
    if (!code || typeof code !== 'string') return '';
    const info = this.codeToLabelMap.get(code.trim());
    return info ? info.label : '';
  }

  // Get full hierarchical path for a code
  getFullPath(code) {
    if (!code || typeof code !== 'string') return '';
    const info = this.codeToLabelMap.get(code.trim());
    return info ? info.fullPath : '';
  }

  // Get formatted display string (code + label)
  getDisplayString(code, options = {}) {
    if (!code || typeof code !== 'string') return '';
    
    const cleanCode = code.trim();
    const info = this.codeToLabelMap.get(cleanCode);
    
    if (!info) return cleanCode; // Return just the code if no label found
    
    const { showCode = true, showPath = false, format = 'standard' } = options;
    
    switch (format) {
      case 'codeOnly':
        return cleanCode;
      case 'labelOnly':
        return info.label;
      case 'pathOnly':
        return info.fullPath;
      case 'standard':
      default:
        if (showPath) {
          return showCode ? `${cleanCode} (${info.fullPath})` : info.fullPath;
        } else {
          return showCode ? `${cleanCode} (${info.label})` : info.label;
        }
    }
  }

  // Get all codes that match a label (for reverse lookup)
  getCodesForLabel(label) {
    const codes = [];
    for (const [code, info] of this.codeToLabelMap.entries()) {
      if (info.label.toLowerCase().includes(label.toLowerCase())) {
        codes.push(code);
      }
    }
    return codes;
  }

  // Check if a code exists
  hasCode(code) {
    return this.codeToLabelMap.has(code?.trim());
  }

  // Get all codes as options for dropdowns
  getAllOptions(includeHierarchy = true) {
    return this.buildOptions(Array.from(this.codeToLabelMap.keys()), { includeHierarchy, includeUnknown: false });
  }

  // Compare IAB codes for sorting (IAB1 < IAB1-1 < IAB1-2 < IAB2)
  compareIabCodes(a, b) {
    const parseCode = (code) => {
      const parts = code.replace('IAB', '').split('-').map(p => parseInt(p) || 0);
      return parts;
    };

    const partsA = parseCode(a);
    const partsB = parseCode(b);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;
      if (partA !== partB) return partA - partB;
    }
    return a.localeCompare(b);
  }

  // Get filtered options based on codes that exist in data
  getFilteredOptions(usedCodes, includeHierarchy = true) {
    if (!usedCodes || usedCodes.length === 0) {
      return [];
    }

    return this.buildOptions(usedCodes, { includeHierarchy, includeUnknown: true });
  }

  buildOptions(codes, { includeHierarchy = true, includeUnknown = false } = {}) {
    if (!Array.isArray(codes)) return [];

    const options = [];
    const seen = new Set();

    for (const raw of codes) {
      if (typeof raw !== 'string') continue;
      const clean = raw.trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);

      const info = this.codeToLabelMap.get(clean);
      if (info) {
        options.push({
          value: clean,
          label: includeHierarchy ? info.fullPath : info.label,
          code: clean,
          path: info.path,
          display: includeHierarchy ? `${clean} (${info.fullPath})` : `${clean} (${info.label})`
        });
        continue;
      }

      if (includeUnknown) {
        options.push({
          value: clean,
          label: clean,
          code: clean,
          path: [],
          display: `${clean} (Unknown category)`
        });
      }
    }

    return options.sort((a, b) => this.compareIabCodes(a.code, b.code));
  }

  getMetadata() {
    return {
      initialized: this.initialized,
      version: this.version,
      source: this.source,
      count: this.codeToLabelMap.size,
    };
  }
}

// Create singleton instance
const iabTaxonomyService = new IABTaxonomyService();

// Export the service and convenience functions
export default iabTaxonomyService;

export const getIabLabel = (code) => iabTaxonomyService.getLabel(code);
export const getIabFullPath = (code) => iabTaxonomyService.getFullPath(code);
export const getIabDisplayString = (code, options) => iabTaxonomyService.getDisplayString(code, options);
export const hasIabCode = (code) => iabTaxonomyService.hasCode(code);
export const getIabMetadata = () => iabTaxonomyService.getMetadata();

// Initialize the service when module is imported
iabTaxonomyService.initialize().catch(err =>
  console.error('[IAB Service] Initialization failed:', err)
);