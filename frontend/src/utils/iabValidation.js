// IAB validation utilities for segment builder

/**
 * Validate IAB category selections for segment building
 * @param {Object} params - Validation parameters
 * @param {Array} params.includeCodes - Include codes to validate
 * @param {Array} params.excludeCodes - Exclude codes to validate
 * @param {Object} params.taxonomyService - IAB taxonomy service instance
 * @param {Array} params.availableOptions - Available IAB options
 * @returns {Object} Validation results
 */
export function validateSegmentIabCodes({
  includeCodes = [],
  excludeCodes = [],
  taxonomyService,
  availableOptions = []
}) {
  const results = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: []
  };

  // Basic validation
  if (!taxonomyService || !taxonomyService.initialized) {
    results.isValid = false;
    results.errors.push('IAB taxonomy service not initialized');
    return results;
  }

  // Check for empty selections
  if (includeCodes.length === 0 && excludeCodes.length === 0) {
    results.warnings.push('No IAB categories selected. Segment will include all content.');
  }

  // Check for conflicts between include and exclude
  const conflicts = includeCodes.filter(code => excludeCodes.includes(code));
  if (conflicts.length > 0) {
    results.isValid = false;
    results.errors.push(`Conflicting codes in both include and exclude: ${conflicts.join(', ')}`);
  }

  // Validate individual codes
  const allCodes = [...new Set([...includeCodes, ...excludeCodes])];
  const invalidCodes = [];
  const validCodes = [];

  allCodes.forEach(code => {
    if (!taxonomyService.hasCode(code)) {
      invalidCodes.push(code);
    } else {
      validCodes.push(code);
    }
  });

  if (invalidCodes.length > 0) {
    results.isValid = false;
    results.errors.push(`Invalid IAB codes: ${invalidCodes.join(', ')}`);
  }

  // Check for hierarchical redundancies
  const hierarchicalIssues = findHierarchicalRedundancies(includeCodes);
  hierarchicalIssues.forEach(issue => {
    results.warnings.push(`Redundant selection: ${issue.child} is already included by ${issue.parent}`);
    results.suggestions.push(`Consider removing ${issue.child} as it's covered by ${issue.parent}`);
  });

  // Check for overly broad selections
  const broadSelections = includeCodes.filter(code => !code.includes('-')); // Top-level codes
  if (broadSelections.length > 0) {
    results.warnings.push(`Broad category selections: ${broadSelections.join(', ')} will include many subcategories`);
  }

  // Performance warnings
  if (includeCodes.length > 20) {
    results.warnings.push('Large number of include categories may impact performance');
  }

  if (excludeCodes.length > 10) {
    results.warnings.push('Large number of exclude categories may impact performance');
  }

  return results;
}

/**
 * Find hierarchical redundancies in code selections
 * @param {Array<string>} codes - Array of IAB codes
 * @returns {Array<Object>} Array of redundancy objects
 */
function findHierarchicalRedundancies(codes) {
  const redundancies = [];
  
  codes.forEach(code => {
    codes.forEach(otherCode => {
      if (code !== otherCode && otherCode.startsWith(code + '-')) {
        redundancies.push({
          parent: code,
          child: otherCode
        });
      }
    });
  });
  
  return redundancies;
}

/**
 * Get suggestions for improving IAB selections
 * @param {Object} params - Parameters for suggestions
 * @param {Array} params.includeCodes - Current include codes
 * @param {Array} params.excludeCodes - Current exclude codes
 * @param {Array} params.availableOptions - Available options with data indicators
 * @param {Object} params.taxonomyService - IAB taxonomy service
 * @returns {Array<string>} Array of suggestion strings
 */
export function getIabSelectionSuggestions({
  includeCodes = [],
  excludeCodes = [],
  availableOptions = [],
  taxonomyService
}) {
  const suggestions = [];
  
  if (!taxonomyService || !taxonomyService.initialized) {
    return ['Initialize IAB taxonomy service first'];
  }

  // Suggest using categories with data
  const includeCodesWithoutData = includeCodes.filter(code => {
    const option = availableOptions.find(opt => opt.code === code);
    return option && !option.hasData;
  });

  if (includeCodesWithoutData.length > 0) {
    suggestions.push(
      `Consider reviewing: ${includeCodesWithoutData.join(', ')} - these categories have no data in your content`
    );
  }

  // Suggest consolidating selections
  const consolidationOpportunities = findConsolidationOpportunities(includeCodes, taxonomyService);
  consolidationOpportunities.forEach(opportunity => {
    suggestions.push(
      `Consider using ${opportunity.parent} instead of ${opportunity.children.join(', ')} to simplify selection`
    );
  });

  // Suggest popular categories if none selected
  if (includeCodes.length === 0) {
    const popularCategories = availableOptions
      .filter(opt => opt.hasData)
      .slice(0, 5)
      .map(opt => opt.code);
    
    if (popularCategories.length > 0) {
      suggestions.push(`Consider starting with these categories that have data: ${popularCategories.join(', ')}`);
    }
  }

  return suggestions;
}

/**
 * Find opportunities to consolidate child categories into parent categories
 * @param {Array<string>} codes - Array of IAB codes
 * @param {Object} taxonomyService - IAB taxonomy service
 * @returns {Array<Object>} Array of consolidation opportunities
 */
function findConsolidationOpportunities(codes, taxonomyService) {
  const opportunities = [];
  const parentChildMap = new Map();
  
  // Group codes by parent
  codes.forEach(code => {
    const parts = code.split('-');
    if (parts.length > 1) {
      const parent = parts[0];
      if (!parentChildMap.has(parent)) {
        parentChildMap.set(parent, []);
      }
      parentChildMap.get(parent).push(code);
    }
  });
  
  // Find parents with multiple children
  parentChildMap.forEach((children, parent) => {
    if (children.length >= 3) { // Suggest consolidation if 3+ children
      opportunities.push({
        parent,
        children
      });
    }
  });
  
  return opportunities;
}

/**
 * Estimate the impact of IAB selections on data volume
 * @param {Object} params - Parameters for estimation
 * @param {Array} params.includeCodes - Include codes
 * @param {Array} params.excludeCodes - Exclude codes
 * @param {Array} params.sourceData - Source data rows
 * @param {Function} params.getFieldValue - Function to extract field values
 * @returns {Object} Impact estimation
 */
export function estimateIabSelectionImpact({
  includeCodes = [],
  excludeCodes = [],
  sourceData = [],
  getFieldValue
}) {
  if (!sourceData.length) {
    return {
      estimatedRows: 0,
      percentageOfTotal: 0,
      confidence: 'low',
      note: 'No source data available for estimation'
    };
  }

  // Sample a subset for estimation if dataset is large
  const sampleSize = Math.min(1000, sourceData.length);
  const sample = sourceData.slice(0, sampleSize);
  
  let matchingRows = 0;
  
  sample.forEach(row => {
    const rowCodes = new Set([
      getFieldValue(row, 'classification', 'iab_code'),
      getFieldValue(row, 'classification', 'iab_subcode'),
      getFieldValue(row, 'classification', 'iab_secondary_code'),
      getFieldValue(row, 'classification', 'iab_secondary_subcode')
    ].filter(Boolean));
    
    // Check include criteria
    let matches = includeCodes.length === 0; // If no includes, include all
    if (includeCodes.length > 0) {
      matches = includeCodes.some(includeCode => 
        Array.from(rowCodes).some(rowCode => 
          rowCode === includeCode || rowCode.startsWith(includeCode + '-')
        )
      );
    }
    
    // Check exclude criteria
    if (matches && excludeCodes.length > 0) {
      const excluded = excludeCodes.some(excludeCode => 
        Array.from(rowCodes).some(rowCode => 
          rowCode === excludeCode || rowCode.startsWith(excludeCode + '-')
        )
      );
      matches = !excluded;
    }
    
    if (matches) matchingRows++;
  });
  
  const estimatedTotal = Math.round((matchingRows / sampleSize) * sourceData.length);
  const percentage = ((matchingRows / sampleSize) * 100).toFixed(1);
  
  return {
    estimatedRows: estimatedTotal,
    percentageOfTotal: parseFloat(percentage),
    confidence: sampleSize >= 500 ? 'high' : sampleSize >= 100 ? 'medium' : 'low',
    sampleSize,
    note: sampleSize < sourceData.length ? `Estimated from ${sampleSize} sample rows` : 'Based on complete dataset'
  };
}