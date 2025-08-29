import React, { useState, useMemo } from 'react';

const IabCategorySelector = ({
  options = [],
  selectedCodes = [],
  onChange,
  label = "Select IAB Categories",
  placeholder = "Search categories...",
  maxHeight = "200px",
  showHierarchy = true,
  showDataIndicators = true,
  disabled = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    
    const term = searchTerm.toLowerCase();
    return options.filter(option => 
      option.code.toLowerCase().includes(term) ||
      option.label.toLowerCase().includes(term) ||
      option.display.toLowerCase().includes(term)
    );
  }, [options, searchTerm]);

  // Group options by top-level category for better organization
  const groupedOptions = useMemo(() => {
    const groups = new Map();
    
    filteredOptions.forEach(option => {
      const topLevel = option.code.split('-')[0]; // e.g., IAB1 from IAB1-2-3
      if (!groups.has(topLevel)) {
        groups.set(topLevel, []);
      }
      groups.get(topLevel).push(option);
    });
    
    // Sort groups by top-level code
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const numA = parseInt(a.replace('IAB', '')) || 0;
      const numB = parseInt(b.replace('IAB', '')) || 0;
      return numA - numB;
    });
  }, [filteredOptions]);

  const handleToggle = (code) => {
    const newSelected = selectedCodes.includes(code)
      ? selectedCodes.filter(c => c !== code)
      : [...selectedCodes, code];
    onChange(newSelected);
  };

  const handleSelectAll = (groupCodes) => {
    const allSelected = groupCodes.every(code => selectedCodes.includes(code));
    let newSelected;
    
    if (allSelected) {
      // Deselect all in group
      newSelected = selectedCodes.filter(code => !groupCodes.includes(code));
    } else {
      // Select all in group
      const toAdd = groupCodes.filter(code => !selectedCodes.includes(code));
      newSelected = [...selectedCodes, ...toAdd];
    }
    
    onChange(newSelected);
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>
            {selectedCodes.length} selected
          </span>
          {selectedCodes.length > 0 && (
            <button
              onClick={clearAll}
              style={{
                padding: '0.2rem 0.4rem',
                fontSize: '0.7rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Search input */}
      <input
        type="text"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.5rem',
          border: '1px solid #ddd',
          borderRadius: '4px',
          marginBottom: '0.5rem',
          fontSize: '0.9rem'
        }}
      />

      {/* Selection area */}
      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '4px',
          maxHeight,
          overflowY: 'auto',
          backgroundColor: disabled ? '#f8f9fa' : 'white'
        }}
      >
        {disabled ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#6c757d' }}>
            Categories loading...
          </div>
        ) : filteredOptions.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#6c757d' }}>
            {searchTerm ? 'No categories match your search' : 'No categories available'}
          </div>
        ) : (
          <div>
            {groupedOptions.map(([groupCode, groupOptions]) => {
              const groupSelected = groupOptions.filter(opt => selectedCodes.includes(opt.code)).length;
              const groupTotal = groupOptions.length;
              const allSelected = groupSelected === groupTotal;
              const someSelected = groupSelected > 0;
              
              // Find the top-level category info
              const topLevelOption = options.find(opt => opt.code === groupCode);
              const groupLabel = topLevelOption ? topLevelOption.label : groupCode;
              
              return (
                <div key={groupCode} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  {/* Group header */}
                  <div
                    style={{
                      padding: '0.5rem',
                      backgroundColor: '#f8f9fa',
                      borderBottom: '1px solid #e9ecef',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 500
                    }}
                  >
                    <span>
                      {groupCode} - {groupLabel}
                      {showDataIndicators && (
                        <span style={{ color: '#6c757d', fontWeight: 'normal' }}>
                          {' '}({groupOptions.filter(opt => opt.hasData).length} with data)
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: '#6c757d' }}>
                        {groupSelected}/{groupTotal}
                      </span>
                      <button
                        onClick={() => handleSelectAll(groupOptions.map(opt => opt.code))}
                        style={{
                          padding: '0.1rem 0.3rem',
                          fontSize: '0.7rem',
                          backgroundColor: allSelected ? '#dc3545' : '#007bff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        {allSelected ? 'None' : 'All'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Group options */}
                  {groupOptions.map(option => (
                    <div
                      key={option.code}
                      style={{
                        padding: '0.4rem 0.5rem',
                        borderBottom: '1px solid #f5f5f5',
                        cursor: 'pointer',
                        backgroundColor: selectedCodes.includes(option.code) ? '#e3f2fd' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                      onClick={() => handleToggle(option.code)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCodes.includes(option.code)}
                        onChange={() => {}} // Handled by div click
                        style={{ margin: 0 }}
                      />
                      <div style={{ flex: 1, fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: selectedCodes.includes(option.code) ? 500 : 'normal' }}>
                          {option.code}
                          {showDataIndicators && option.hasData && (
                            <span style={{ color: '#28a745', marginLeft: '0.3rem' }}>✓</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#6c757d', marginTop: '0.1rem' }}>
                          {option.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary */}
      {selectedCodes.length > 0 && (
        <div style={{ 
          marginTop: '0.5rem', 
          padding: '0.3rem 0.5rem', 
          backgroundColor: '#e8f5e8', 
          borderRadius: '4px',
          fontSize: '0.75rem',
          color: '#2d5a2d'
        }}>
          Selected: {selectedCodes.slice(0, 3).join(', ')}
          {selectedCodes.length > 3 && ` and ${selectedCodes.length - 3} more`}
        </div>
      )}
    </div>
  );
};

export default IabCategorySelector;