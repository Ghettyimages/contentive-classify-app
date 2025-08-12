import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../config';

// Helper to format date YYYY-MM-DD
const formatDate = (date) => date.toISOString().slice(0, 10);

const DataDashboard = () => {
  const { currentUser } = useAuth();
  const [mergedData, setMergedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterCategory, setFilterCategory] = useState('');
  const [showExpanded, setShowExpanded] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDate(d);
  });
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));
  const [stats, setStats] = useState({
    total: 0,
    merged: 0,
    attributionOnly: 0,
    classificationOnly: 0
  });

  useEffect(() => {
    if (currentUser) {
      loadMergedData();
    }
  }, [currentUser]);

  const loadMergedData = async (opts = {}) => {
    setLoading(true);
    setError('');

    try {
      // Build query string
      const params = new URLSearchParams();
      const start = opts.startDate ?? startDate;
      const end = opts.endDate ?? endDate;
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      if (sortField) params.set('sort', mapSortKey(sortField));
      if (sortDirection) params.set('order', sortDirection);

      const response = await axios.get(`${API_BASE_URL}/merged-data?${params.toString()}`, {
        headers: { Authorization: `Bearer ${window.localStorage.getItem('fb_id_token') || ''}` }
      });

      const results = response.data?.results || [];

      const data = results.map((docData) => ({
        ...docData,
        hasClassification: !!(docData.classification_iab_category || docData.classification_tone || docData.classification_intent),
        hasAttribution: !!(docData.attribution_conversions || docData.attribution_ctr || docData.attribution_viewability)
      }));

      setMergedData(data);
      
      // Calculate stats
      setStats({
        total: data.length,
        merged: data.filter(item => item.hasClassification && item.hasAttribution).length,
        attributionOnly: data.filter(item => item.hasAttribution && !item.hasClassification).length,
        classificationOnly: data.filter(item => item.hasClassification && !item.hasAttribution).length
      });

    } catch (err) {
      console.error('Error loading merged data:', err);
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const mapSortKey = (field) => {
    // Map UI fields to backend sort param
    const map = {
      ctr: 'click_through_rate',
      conversions: 'conversions',
      viewability: 'viewability',
      scroll_depth: 'scroll_depth',
      impressions: 'impressions',
      fill_rate: 'fill_rate',
    };
    return map[field] || 'conversions';
  };

  const getFieldValue = (item, prefix, field) => {
    const key = `${prefix}_${field}`;
    const value = item[key];
    
    // Debug CTR values specifically
    if (field === 'ctr' && prefix === 'attribution') {
      console.log(`CTR value for ${item.url}:`, value, typeof value);
      console.log(`CTR key: ${key}, exists: ${key in item}`);
      console.log(`All attribution fields:`, Object.keys(item).filter(k => k.startsWith('attribution_')));
    }
    
    if (value === null || value === undefined || value === '') return 'N/A';
    if (Array.isArray(value)) return value.join(', ');
    return value;
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === 'N/A') return 'N/A';
    const num = parseFloat(value);
    return isNaN(num) ? value : num.toLocaleString();
  };

  const formatPercentage = (value) => {
    if (value === null || value === undefined || value === 'N/A') return 'N/A';
    const num = parseFloat(value);
    return isNaN(num) ? value : `${num.toFixed(2)}%`;
  };

  const getRowStyle = (item) => {
    if (!item.hasClassification && !item.hasAttribution) {
      return { backgroundColor: '#ffebee' }; // Light red for no data
    } else if (!item.hasClassification) {
      return { backgroundColor: '#ffebee' }; // Light red for no classification
    } else if (!item.hasAttribution) {
      return { backgroundColor: '#fff3e0' }; // Light yellow for no attribution
    }
    return {}; // Normal for merged data
  };

  const handleSort = async (field) => {
    let nextDirection = 'asc';
    if (sortField === field) {
      nextDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(nextDirection);
    } else {
      setSortField(field);
      nextDirection = 'asc';
      setSortDirection(nextDirection);
    }
    await loadMergedData({});
  };

  const sortData = (data) => {
    if (!sortField) return data;

    return [...data].sort((a, b) => {
      let aValue = getFieldValue(a, 'attribution', sortField) || getFieldValue(a, 'classification', sortField);
      let bValue = getFieldValue(b, 'attribution', sortField) || getFieldValue(b, 'classification', sortField);

      // Convert to numbers for numeric fields
      if (['ctr', 'conversions', 'viewability', 'scroll_depth', 'impressions', 'fill_rate', 'revenue', 'clicks', 'time_on_page'].includes(sortField)) {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const filterData = (data) => {
    if (!filterCategory) return data;
    return data.filter(item => {
      const category = getFieldValue(item, 'classification', 'iab_category');
      return category && category.toLowerCase().includes(filterCategory.toLowerCase());
    });
  };

  const getUniqueCategories = () => {
    const categories = new Set();
    mergedData.forEach(item => {
      const category = getFieldValue(item, 'classification', 'iab_category');
      if (category && category !== 'N/A') {
        categories.add(category);
      }
    });
    return Array.from(categories).sort();
  };

  const exportToCSV = () => {
    const headers = [
      'URL',
      'IAB Category',
      'IAB Subcategory',
      'Secondary IAB Category',
      'Secondary IAB Subcategory',
      'IAB Code',
      'IAB Subcode',
      'Secondary IAB Code',
      'Secondary IAB Subcode',
      'Tone',
      'Intent',
      'Audience',
      'Keywords',
      'Conversions',
      'Revenue',
      'CTR (%)',
      'Viewability (%)',
      'Scroll Depth (%)',
      'Impressions',
      'Fill Rate (%)',
      'Clicks',
      'Time on Page',
      'Data Status'
    ];

    const csvData = mergedData.map(item => [
      item.url || 'N/A',
      getFieldValue(item, 'classification', 'iab_category'),
      getFieldValue(item, 'classification', 'iab_subcategory'),
      getFieldValue(item, 'classification', 'iab_secondary_category'),
      getFieldValue(item, 'classification', 'iab_secondary_subcategory'),
      getFieldValue(item, 'classification', 'iab_code'),
      getFieldValue(item, 'classification', 'iab_subcode'),
      getFieldValue(item, 'classification', 'iab_secondary_code'),
      getFieldValue(item, 'classification', 'iab_secondary_subcode'),
      getFieldValue(item, 'classification', 'tone'),
      getFieldValue(item, 'classification', 'intent'),
      getFieldValue(item, 'classification', 'audience'),
      getFieldValue(item, 'classification', 'keywords'),
      formatNumber(getFieldValue(item, 'attribution', 'conversions')),
      formatNumber(getFieldValue(item, 'attribution', 'revenue')),
      formatPercentage(getFieldValue(item, 'attribution', 'ctr')),
      formatPercentage(getFieldValue(item, 'attribution', 'viewability')),
      formatPercentage(getFieldValue(item, 'attribution', 'scroll_depth')),
      formatNumber(getFieldValue(item, 'attribution', 'impressions')),
      formatPercentage(getFieldValue(item, 'attribution', 'fill_rate')),
      formatNumber(getFieldValue(item, 'attribution', 'clicks')),
      formatNumber(getFieldValue(item, 'attribution', 'time_on_page')),
      item.hasClassification && item.hasAttribution ? 'Complete' : 
      item.hasClassification ? 'Classification Only' : 
      item.hasAttribution ? 'Attribution Only' : 'No Data'
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `merged_content_data_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processedData = filterData(mergedData);

  // Base columns that are always shown (collapsed view)
  const baseColumns = [
    { key: 'url', label: 'URL', sortable: false, isDirectField: true },
    { key: 'iab_category', label: 'IAB Category', sortable: true, prefix: 'classification' },
    { key: 'tone', label: 'Tone', sortable: true, prefix: 'classification' },
    { key: 'intent', label: 'Intent', sortable: true, prefix: 'classification' },
    { key: 'audience', label: 'Audience', sortable: true, prefix: 'classification' },
    { key: 'ctr', label: 'CTR', sortable: true, prefix: 'attribution', formatter: formatPercentage },
    { key: 'conversions', label: 'Conversions', sortable: true, prefix: 'attribution', formatter: formatNumber },
    { key: 'viewability', label: 'Viewability', sortable: true, prefix: 'attribution', formatter: formatPercentage },
    { key: 'scroll_depth', label: 'Scroll Depth', sortable: true, prefix: 'attribution', formatter: formatPercentage },
    { key: 'impressions', label: 'Impressions', sortable: true, prefix: 'attribution', formatter: formatNumber },
    { key: 'fill_rate', label: 'Fill Rate', sortable: true, prefix: 'attribution', formatter: formatPercentage }
  ];

  // Additional columns shown in expanded view
  const expandedColumns = [
    { key: 'iab_subcategory', label: 'IAB Subcategory', sortable: true, prefix: 'classification' },
    { key: 'iab_secondary_category', label: 'Secondary IAB Category', sortable: true, prefix: 'classification' },
    { key: 'iab_secondary_subcategory', label: 'Secondary IAB Subcategory', sortable: true, prefix: 'classification' },
    { key: 'iab_code', label: 'IAB Code', sortable: true, prefix: 'classification' },
    { key: 'iab_subcode', label: 'IAB Subcode', sortable: true, prefix: 'classification' },
    { key: 'iab_secondary_code', label: 'Secondary IAB Code', sortable: true, prefix: 'classification' },
    { key: 'iab_secondary_subcode', label: 'Secondary IAB Subcode', sortable: true, prefix: 'classification' }
  ];

  // Combine columns based on expanded state
  const columns = showExpanded ? [...baseColumns, ...expandedColumns] : baseColumns;

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <img
          src="/logo2.png"
          alt="Contentive Media Logo"
          style={{ maxWidth: "210px", height: "auto", marginBottom: "-2.0rem" }}
        />
        <h1 style={{ margin: "0.2rem 0 0 0", fontSize: "1.8rem" }}>CONTENTIVE MEDIA</h1>
        <p style={{ fontSize: "1rem", color: "#444", margin: "0.5rem" }}>
          Data Dashboard - Merged Attribution & Classification
        </p>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        {/* Statistics Cards */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
          gap: "1rem", 
          marginBottom: "2rem" 
        }}>
          <div style={{ 
            backgroundColor: "#e3f2fd", 
            padding: "1.5rem", 
            borderRadius: "8px", 
            textAlign: "center" 
          }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#1976d2" }}>Total Records</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#1976d2" }}>
              {stats.total}
            </p>
          </div>
          
          <div style={{ 
            backgroundColor: "#e8f5e8", 
            padding: "1.5rem", 
            borderRadius: "8px", 
            textAlign: "center" 
          }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#2e7d32" }}>Merged Records</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#2e7d32" }}>
              {stats.merged}
            </p>
          </div>
          
          <div style={{ 
            backgroundColor: "#fff3e0", 
            padding: "1.5rem", 
            borderRadius: "8px", 
            textAlign: "center" 
          }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#f57c00" }}>Attribution Only</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#f57c00" }}>
              {stats.attributionOnly}
            </p>
          </div>
          
          <div style={{ 
            backgroundColor: "#fce4ec", 
            padding: "1.5rem", 
            borderRadius: "8px", 
            textAlign: "center" 
          }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#c2185b" }}>Classification Only</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#c2185b" }}>
              {stats.classificationOnly}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div style={{ 
          backgroundColor: "#f8f9fa", 
          padding: "1rem", 
          borderRadius: "8px", 
          marginBottom: "2rem",
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap"
        }}>
          <button
            onClick={loadMergedData}
            disabled={loading}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "0.9rem"
            }}
          >
            {loading ? "Loading..." : "Refresh Data"}
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span>to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <button
              onClick={() => loadMergedData({ startDate, endDate })}
              disabled={loading}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "0.9rem"
              }}
            >
              Apply
            </button>
          </div>
          
          <button
            onClick={exportToCSV}
            disabled={loading || mergedData.length === 0}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: (loading || mergedData.length === 0) ? "not-allowed" : "pointer",
              fontSize: "0.9rem"
            }}
          >
            Export to CSV
          </button>
          
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{
              padding: "0.5rem",
              borderRadius: "4px",
              border: "1px solid #ddd",
              fontSize: "0.9rem"
            }}
          >
            <option value="">All Categories</option>
            {getUniqueCategories().map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          
          <span style={{ color: "#666", fontSize: "0.9rem" }}>
            Showing {processedData.length} of {mergedData.length} records
          </span>
        </div>

        {error && (
          <div style={{
            backgroundColor: "#f8d7da",
            color: "#721c24",
            padding: "0.75rem",
            borderRadius: "4px",
            marginBottom: "1rem",
            border: "1px solid #f5c6cb"
          }}>
            {error}
          </div>
        )}

        {/* Data Table */}
        {loading ? (
          <div style={{ 
            backgroundColor: "#fff", 
            padding: "2rem", 
            borderRadius: "8px",
            border: "1px solid #dee2e6",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "1.2rem", color: "#666" }}>Loading data...</div>
          </div>
        ) : processedData.length > 0 ? (
          <div style={{ 
            backgroundColor: "#fff", 
            padding: "2rem", 
            borderRadius: "8px",
            border: "1px solid #dee2e6",
            overflowX: "auto"
          }}>
            <h3 style={{ marginTop: 0, color: "#333" }}>Merged Data Records</h3>
            
            {/* Helper text and expand toggle */}
            <div style={{ 
              marginBottom: "1rem", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem"
            }}>
              <p style={{ 
                color: "#666", 
                fontSize: "0.9rem", 
                margin: 0,
                fontStyle: "italic"
              }}>
                Only primary IAB category shown. Export for full classification metadata.
              </p>
              
              <button
                onClick={() => setShowExpanded(!showExpanded)}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: showExpanded ? "#dc3545" : "#17a2b8",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
              >
                {showExpanded ? "Collapse View" : "Expand View"}
              </button>
            </div>
            
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8rem",
              border: "1px solid #ddd"
            }}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th 
                      key={column.key}
                      style={{ 
                        padding: "12px 8px", 
                        borderBottom: "2px solid #ddd", 
                        backgroundColor: "#f8f9fa", 
                        textAlign: "left",
                        cursor: column.sortable ? "pointer" : "default",
                        userSelect: "none"
                      }}
                      onClick={() => column.sortable && handleSort(column.key)}
                    >
                      {column.label} 
                      {column.sortable && sortField === column.key && (
                        <span style={{ marginLeft: "4px" }}>
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {processedData.map((item, index) => (
                  <tr key={item.id || index} style={{ borderBottom: "1px solid #eee", ...getRowStyle(item) }}>
                    {columns.map((column) => (
                      <td 
                        key={column.key}
                        style={{ 
                          padding: "10px 8px", 
                          borderRight: column.key === columns[columns.length - 1].key ? "none" : "1px solid #eee",
                          maxWidth: column.key === 'url' ? "200px" : "auto",
                          overflow: column.key === 'url' ? "hidden" : "visible",
                          textOverflow: column.key === 'url' ? "ellipsis" : "clip",
                          whiteSpace: column.key === 'url' ? "nowrap" : "normal"
                        }}
                      >
                        {column.isDirectField ? 
                          (item[column.key] || 'N/A') :
                          column.formatter ? 
                            column.formatter(getFieldValue(item, column.prefix, column.key)) :
                            getFieldValue(item, column.prefix, column.key)
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ 
            backgroundColor: "#fff", 
            padding: "2rem", 
            borderRadius: "8px",
            border: "1px solid #dee2e6",
            textAlign: "center",
            color: "#666"
          }}>
            {mergedData.length === 0 ? 
              "No merged data found. Try uploading attribution data and running the merge process." :
              "No records match the current filter."
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default DataDashboard;