// Centralized IAB Taxonomy Service
// Provides consistent IAB 3.1 code-to-label mapping across all components

class IABTaxonomyService {
  constructor() {
    this.codeToLabelMap = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    const API_URL = process.env.REACT_APP_API_URL || window.location.origin;
    let loadedSource = 'none';
    
    try {
      // Try to load from backend API first with timeout
      console.log('[IAB Service] Attempting to load from backend API...');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
      
      const response = await fetch(`${API_URL}/api/iab31`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        if (data.codes && Array.isArray(data.codes) && data.codes.length >= 200) {
          this.buildCodeMap(data.codes);
          this.initialized = true;
          loadedSource = data.source || 'backend';
          console.log(`[IAB Service] Initialized from ${loadedSource} with`, this.codeToLabelMap.size, 'codes');
          return;
        } else {
          console.warn('[IAB Service] Backend returned insufficient codes:', data.codes?.length || 0);
        }
      } else {
        console.warn('[IAB Service] Backend API returned error:', response.status, response.statusText);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('[IAB Service] Backend API timeout after 8s, using fallback');
      } else {
        console.warn('[IAB Service] Backend load failed, using fallback:', err.message);
      }
    }

    try {
      // Fallback to local JSON
      console.log('[IAB Service] Loading from local fallback...');
      const { default: bundled } = await import('../data/iab_content_taxonomy_3_1.v1.json');
      if (bundled && bundled.codes && Array.isArray(bundled.codes) && bundled.codes.length >= 200) {
        this.buildCodeMap(bundled.codes);
        this.initialized = true;
        loadedSource = bundled.source || 'fallback';
        console.log(`[IAB Service] Initialized from ${loadedSource} with`, this.codeToLabelMap.size, 'codes');
      } else {
        console.error('[IAB Service] Local fallback has insufficient codes:', bundled?.codes?.length || 0);
      }
    } catch (err) {
      console.error('[IAB Service] Failed to initialize from fallback:', err);
    }

    if (!this.initialized) {
      console.error('[IAB Service] All initialization methods failed');
      // Initialize with empty map to prevent repeated failures
      this.codeToLabelMap = new Map();
      this.initialized = true;
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
    const options = [];
    for (const [code, info] of this.codeToLabelMap.entries()) {
      options.push({
        value: code,
        label: includeHierarchy ? info.fullPath : info.label,
        code: code,
        display: includeHierarchy ? `${code} (${info.fullPath})` : `${code} (${info.label})`
      });
    }
    return options.sort((a, b) => this.compareIabCodes(a.code, b.code));
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
    return 0;
  }

  // Get filtered options based on codes that exist in data
  getFilteredOptions(usedCodes, includeHierarchy = true) {
    if (!usedCodes || usedCodes.length === 0) {
      return this.getAllOptions(includeHierarchy);
    }
    
    const usedSet = new Set(usedCodes);
    const options = [];
    
    for (const [code, info] of this.codeToLabelMap.entries()) {
      if (usedSet.has(code)) {
        options.push({
          value: code,
          label: includeHierarchy ? info.fullPath : info.label,
          code: code,
          display: includeHierarchy ? `${code} (${info.fullPath})` : `${code} (${info.label})`
        });
      }
    }
    
    return options.sort((a, b) => this.compareIabCodes(a.code, b.code));
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

// Initialize the service when module is imported
iabTaxonomyService.initialize().catch(err => 
  console.error('[IAB Service] Initialization failed:', err)
);