// Enhanced IAB filtering utilities with hierarchical matching support

/**
 * Extract all IAB codes from a data row
 * @param {Object} row - Data row
 * @param {Function} getFieldValue - Function to extract field values
 * @returns {Set<string>} Set of IAB codes found in the row
 */
export function extractIabCodes(row, getFieldValue) {
  const codes = [
    getFieldValue(row, 'classification', 'iab_code'),
    getFieldValue(row, 'classification', 'iab_subcode'),
    getFieldValue(row, 'classification', 'iab_secondary_code'),
    getFieldValue(row, 'classification', 'iab_secondary_subcode')
  ];
  
  return new Set(codes.filter(code => 
    code && 
    code !== 'N/A' && 
    typeof code === 'string' && 
    code.trim()
  ).map(code => code.trim()));
}

/**
 * Check if a code matches another code hierarchically
 * IAB1 matches IAB1-1, IAB1-2, etc.
 * IAB1-1 matches IAB1-1-1, IAB1-1-2, etc.
 * @param {string} filterCode - The code to filter by
 * @param {string} dataCode - The code in the data
 * @returns {boolean} True if there's a hierarchical match
 */
export function isHierarchicalMatch(filterCode, dataCode) {
  if (!filterCode || !dataCode) return false;
  
  // Exact match
  if (filterCode === dataCode) return true;
  
  // Hierarchical match: filterCode is a parent of dataCode
  // e.g., IAB1 matches IAB1-1, IAB1-2, etc.
  if (dataCode.startsWith(filterCode + '-')) return true;
  
  return false;
}

/**
 * Check if a row matches any of the include codes (with hierarchical support)
 * @param {Object} row - Data row
 * @param {Array<string>} includeCodes - Codes to include
 * @param {Function} getFieldValue - Function to extract field values
 * @param {boolean} hierarchical - Whether to use hierarchical matching
 * @returns {boolean} True if row matches any include code
 */
export function rowMatchesIncludeCodes(row, includeCodes, getFieldValue, hierarchical = true) {
  if (!includeCodes?.length) return true;
  
  const rowCodes = extractIabCodes(row, getFieldValue);
  
  for (const filterCode of includeCodes) {
    for (const rowCode of rowCodes) {
      if (hierarchical) {
        if (isHierarchicalMatch(filterCode, rowCode)) return true;
      } else {
        if (filterCode === rowCode) return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if a row should be excluded by any of the exclude codes (with hierarchical support)
 * @param {Object} row - Data row
 * @param {Array<string>} excludeCodes - Codes to exclude
 * @param {Function} getFieldValue - Function to extract field values
 * @param {boolean} hierarchical - Whether to use hierarchical matching
 * @returns {boolean} True if row should be excluded
 */
export function rowExcludedByExcludeCodes(row, excludeCodes, getFieldValue, hierarchical = true) {
  if (!excludeCodes?.length) return false;
  
  const rowCodes = extractIabCodes(row, getFieldValue);
  
  for (const filterCode of excludeCodes) {
    for (const rowCode of rowCodes) {
      if (hierarchical) {
        if (isHierarchicalMatch(filterCode, rowCode)) return true;
      } else {
        if (filterCode === rowCode) return true;
      }
    }
  }
  
  return false;
}

/**
 * Get statistics about IAB code usage in a dataset
 * @param {Array<Object>} rows - Array of data rows
 * @param {Function} getFieldValue - Function to extract field values
 * @returns {Object} Statistics object
 */
export function getIabUsageStats(rows, getFieldValue) {
  const codeFrequency = new Map();
  const hierarchyMap = new Map(); // parent -> children
  
  rows.forEach(row => {
    const codes = extractIabCodes(row, getFieldValue);
    codes.forEach(code => {
      // Count frequency
      codeFrequency.set(code, (codeFrequency.get(code) || 0) + 1);
      
      // Build hierarchy map
      const parts = code.split('-');
      if (parts.length > 1) {
        const parent = parts[0];
        if (!hierarchyMap.has(parent)) {
          hierarchyMap.set(parent, new Set());
        }
        hierarchyMap.get(parent).add(code);
      }
    });
  });
  
  return {
    totalRows: rows.length,
    uniqueCodes: codeFrequency.size,
    codeFrequency: Object.fromEntries(codeFrequency),
    hierarchy: Object.fromEntries(
      Array.from(hierarchyMap.entries()).map(([parent, children]) => [
        parent, 
        Array.from(children).sort()
      ])
    ),
    topCodes: Array.from(codeFrequency.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([code, count]) => ({ code, count, percentage: (count / rows.length * 100).toFixed(1) }))
  };
}

/**
 * Validate IAB codes against the taxonomy service
 * @param {Array<string>} codes - Codes to validate
 * @param {Object} taxonomyService - IAB taxonomy service instance
 * @returns {Object} Validation results
 */
export function validateIabCodes(codes, taxonomyService) {
  const results = {
    valid: [],
    invalid: [],
    warnings: []
  };
  
  codes.forEach(code => {
    if (!code || typeof code !== 'string') {
      results.invalid.push({ code, reason: 'Invalid format' });
      return;
    }
    
    const trimmed = code.trim();
    if (!trimmed) {
      results.invalid.push({ code, reason: 'Empty code' });
      return;
    }
    
    if (taxonomyService.hasCode(trimmed)) {
      results.valid.push({
        code: trimmed,
        label: taxonomyService.getLabel(trimmed),
        path: taxonomyService.getFullPath(trimmed)
      });
    } else {
      results.invalid.push({ code: trimmed, reason: 'Not found in taxonomy' });
    }
  });
  
  return results;
}