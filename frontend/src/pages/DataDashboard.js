import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import iabTaxonomyService, { getIabLabel, getIabFullPath, getIabDisplayString } from '../utils/iabTaxonomyService';

// Helper to format date YYYY-MM-DD
const formatDate = (date) => date.toISOString().slice(0, 10);

const DataDashboard = () => {
  const { currentUser } = useAuth();
  const [mergedData, setMergedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showExpanded, setShowExpanded] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [stats, setStats] = useState({ total: 0, merged: 0, attributionOnly: 0, classificationOnly: 0 });
  const [counts, setCounts] = useState({ attribution_count: 0, classified_count: 0, merged_count: 0 });
  const [selectedIabCode, setSelectedIabCode] = useState('');
  const [selectedIabSubcode, setSelectedIabSubcode] = useState('');

  useEffect(() => {
    if (currentUser) {
      // Initialize IAB service first
      iabTaxonomyService.initialize().then(() => {
        loadMergedData();
        loadCounts();
      });
    }
  }, [currentUser]);

  const tokenHeader = () => ({ Authorization: `Bearer ${window.localStorage.getItem('fb_id_token') || ''}` });

  const loadCounts = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/counts`, { headers: tokenHeader() });
      setCounts(res.data || { attribution_count: 0, classified_count: 0, merged_count: 0 });
    } catch (e) {
      console.error('Counts error', e);
    }
  };

  const loadMergedData = async () => {
    setLoading(true);
    setError('');

    try {
      // Build query string without date filters, enable fallback
      const params = new URLSearchParams();
      if (sortField) params.set('sort', mapSortKey(sortField));
      if (sortDirection) params.set('order', sortDirection);
      params.set('fallback', '1');
      params.set('limit', '200');

      const response = await axios.get(`${API_BASE_URL}/merged-data?${params.toString()}`, { headers: tokenHeader() });
      const results = response.data?.results || [];
      const data = results.map((docData) => ({
        ...docData,
        hasClassification: !!(docData.classification_iab_category || docData.classification_tone || docData.classification_intent),
        hasAttribution: !!(docData.attribution_conversions || docData.attribution_ctr || docData.attribution_viewability)
      }));

      setMergedData(data);
      setStats({
        total: data.length,
        merged: data.filter(item => item.hasClassification && item.hasAttribution).length,
        attributionOnly: data.filter(item => item.hasAttribution && !item.hasClassification).length,
        classificationOnly: data.filter(item => item.hasClassification && !item.hasAttribution).length
      });
      loadCounts();

    } catch (err) {
      console.error('Error loading merged data:', err);
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const mapSortKey = (field) => {
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

  const handleExportActivation = async () => {
    // Build export query without date filters
    const params = new URLSearchParams();
    if (sortField) params.set('sort_by', mapSortKey(sortField));
    if (sortDirection) params.set('order', sortDirection);
    params.set('format', exportFormat);
    params.set('limit', '20000');

    const token = window.localStorage.getItem('fb_id_token') || '';
    const url = `${API_BASE_URL}/export-activation?${params.toString()}`;
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);
      const blob = await response.blob();
      const dlUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = dlUrl;
      const ext = exportFormat === 'json' ? 'json' : 'csv';
      link.download = `activation_export_${new Date().toISOString().slice(0,10)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (e) {
      console.error('Export error', e);
      setError('Export failed');
    }
  };

  const getFieldValue = (item, prefix, field) => {
    const key = `${prefix}_${field}`;
    const value = item[key];
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
    if (!item.hasClassification && !item.hasAttribution) return { backgroundColor: '#ffebee' };
    if (!item.hasClassification) return { backgroundColor: '#ffebee' };
    if (!item.hasAttribution) return { backgroundColor: '#fff3e0' };
    return {};
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
    await loadMergedData();
  };

  const exportToCSV = () => {
    const headers = ['URL','IAB Category','IAB Subcategory','Secondary IAB Category','Secondary IAB Subcategory','IAB Code','IAB Subcode','Secondary IAB Code','Secondary IAB Subcode','Tone','Intent','Audience','Keywords','Conversions','Revenue','CTR (%)','Viewability (%)','Scroll Depth (%)','Impressions','Fill Rate (%)','Clicks','Time on Page','Data Status','upload_date','merged_at'];
    const csvData = mergedData.map(item => {
      const primaryCode = getFieldValue(item, 'classification', 'iab_code');
      const subCode = getFieldValue(item, 'classification', 'iab_subcode');
      const secondaryCode = getFieldValue(item, 'classification', 'iab_secondary_code');
      const secondarySubCode = getFieldValue(item, 'classification', 'iab_secondary_subcode');
      
      return [
        item.url || 'N/A',
        primaryCode ? getIabDisplayString(primaryCode, { format: 'pathOnly' }) : 'N/A',
        subCode ? getIabDisplayString(subCode, { format: 'pathOnly' }) : 'N/A',
        secondaryCode ? getIabDisplayString(secondaryCode, { format: 'pathOnly' }) : 'N/A',
        secondarySubCode ? getIabDisplayString(secondarySubCode, { format: 'pathOnly' }) : 'N/A',
        primaryCode || 'N/A',
        subCode || 'N/A',
        secondaryCode || 'N/A',
        secondarySubCode || 'N/A',
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
        item.hasClassification && item.hasAttribution ? 'Complete' : item.hasClassification ? 'Classification Only' : item.hasAttribution ? 'Attribution Only' : 'No Data',
        item.upload_date || '',
        item.merged_at || ''
      ];
    });
    const csvContent = [headers, ...csvData].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
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

  const runMergeNow = async () => {
    try {
      await axios.post(`${API_BASE_URL}/merge-attribution`, {}, { headers: tokenHeader() });
      await loadCounts();
      await loadMergedData();
    } catch (e) {
      console.error('Merge now failed', e);
      setError('Merge failed');
    }
  };

  const processedData = mergedData;

  // Available IAB codes and subcodes from current data
  const availableIabCodes = useMemo(() => {
    const set = new Set();
    for (const r of processedData) {
      const code = r?.classification_iab_code || r?.iab_code;
      if (code && typeof code === 'string' && !code.includes('-')) set.add(code);
    }
    return Array.from(set).sort();
  }, [processedData]);

  const availableIabSubcodes = useMemo(() => {
    const set = new Set();
    for (const r of processedData) {
      const sub = r?.classification_iab_subcode || r?.iab_subcode;
      if (!sub || typeof sub !== 'string') continue;
      if (selectedIabCode) {
        if (sub.startsWith(`${selectedIabCode}-`)) set.add(sub);
      } else {
        set.add(sub);
      }
    }
    return Array.from(set).sort();
  }, [processedData, selectedIabCode]);

  // Filter rows by IAB selections
  const filteredRows = useMemo(() => {
    return processedData.filter((r) => {
      const code = r?.classification_iab_code || r?.iab_code || '';
      const sub = r?.classification_iab_subcode || r?.iab_subcode || '';
      if (selectedIabCode && code !== selectedIabCode) return false;
      if (selectedIabSubcode && sub !== selectedIabSubcode) return false;
      return true;
    });
  }, [processedData, selectedIabCode, selectedIabSubcode]);

  const baseColumns = [
    { key: 'url', label: 'URL', sortable: false, isDirectField: true },
    { key: 'date_added', label: 'Date Added', sortable: true, isDirectField: false, formatter: (v) => {
      if (!v || v === 'N/A') return 'N/A';
      const d = new Date(v);
      return isNaN(d.getTime()) ? v : d.toLocaleString();
    } },
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

  const expandedColumns = [
    { key: 'iab_subcategory', label: 'IAB Subcategory', sortable: true, prefix: 'classification' },
    { key: 'iab_secondary_category', label: 'Secondary IAB Category', sortable: true, prefix: 'classification' },
    { key: 'iab_secondary_subcategory', label: 'Secondary IAB Subcategory', sortable: true, prefix: 'classification' },
    { key: 'iab_code', label: 'IAB Code', sortable: true, prefix: 'classification' },
    { key: 'iab_subcode', label: 'IAB Subcode', sortable: true, prefix: 'classification' },
    { key: 'iab_secondary_code', label: 'Secondary IAB Code', sortable: true, prefix: 'classification' },
    { key: 'iab_secondary_subcode', label: 'Secondary IAB Subcode', sortable: true, prefix: 'classification' }
  ];

  const columns = showExpanded ? [...baseColumns, ...expandedColumns] : baseColumns;

  const getDisplayValue = (item, column) => {
    if (column.isDirectField) return item[column.key] || 'N/A';
    if (column.key === 'date_added') {
      const iso = item.merged_at || item.upload_date || 'N/A';
      return column.formatter ? column.formatter(iso) : iso;
    }
    return column.formatter ? column.formatter(getFieldValue(item, column.prefix, column.key)) : getFieldValue(item, column.prefix, column.key);
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <img src="/logo2.png" alt="Contentive Media Logo" style={{ maxWidth: "210px", height: "auto", marginBottom: "-2.0rem" }} />
        <h1 style={{ margin: "0.2rem 0 0 0", fontSize: "1.8rem" }}>CONTENTIVE MEDIA</h1>
        <p style={{ fontSize: "1rem", color: "#444", margin: "0.5rem" }}>Data Dashboard - Merged Attribution & Classification</p>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          <div style={{ backgroundColor: "#e3f2fd", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#1976d2" }}>Total Records</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#1976d2" }}>{stats.total}</p>
          </div>
          <div style={{ backgroundColor: "#e8f5e8", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#2e7d32" }}>Merged Records</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#2e7d32" }}>{stats.merged}</p>
          </div>
          <div style={{ backgroundColor: "#eef7ff", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
            <h3 style={{ margin: 0, color: "#0d6efd" }}>Counts (90d)</h3>
            <p style={{ margin: '0.25rem 0', color: '#0d6efd' }}>Attribution: {counts.attribution_count}</p>
            <p style={{ margin: '0.25rem 0', color: '#0d6efd' }}>Merged: {counts.merged_count}</p>
          </div>
          <div style={{ backgroundColor: "#fff3e0", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#f57c00" }}>Attribution Only</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#f57c00" }}>{stats.attributionOnly}</p>
          </div>
          <div style={{ backgroundColor: "#fce4ec", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#c2185b" }}>Classification Only</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#c2185b" }}>{stats.classificationOnly}</p>
          </div>
        </div>

        <div style={{ backgroundColor: "#f8f9fa", padding: "1rem", borderRadius: "8px", marginBottom: "2rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={loadMergedData} disabled={loading} style={{ padding: "0.5rem 1rem", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>{loading ? "Loading..." : "Refresh Data"}</button>

          {/* IAB Filters */}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>IAB Category</span>
            <select
              value={selectedIabCode}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedIabCode(next);
                if (next && selectedIabSubcode && !selectedIabSubcode.startsWith(`${next}-`)) {
                  setSelectedIabSubcode('');
                }
              }}
            >
              <option value="">All</option>
              {availableIabCodes.map((code) => (
                <option key={code} value={code}>{code /* or labelForCode(code) */}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>IAB Subcategory</span>
            <select
              value={selectedIabSubcode}
              onChange={(e) => setSelectedIabSubcode(e.target.value)}
              disabled={availableIabSubcodes.length === 0}
            >
              <option value="">All</option>
              {availableIabSubcodes.map((sub) => (
                <option key={sub} value={sub}>{sub /* or labelForCode(sub) */}</option>
              ))}
            </select>
          </label>

          <button onClick={exportToCSV} disabled={loading || mergedData.length === 0} style={{ padding: "0.5rem 1rem", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: (loading || mergedData.length === 0) ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>Export to CSV</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            <button onClick={handleExportActivation} disabled={loading} style={{ padding: '0.5rem 1rem', backgroundColor: '#343a40', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}>Export for Activation</button>
            <span style={{ color: '#666', fontSize: '0.85rem', fontStyle: 'italic' }}>Exports rows using your current filters & sort.</span>
          </div>

          {(counts.merged_count === 0 && counts.attribution_count > 0) && (
            <button onClick={runMergeNow} style={{ padding: '0.5rem 1rem', backgroundColor: '#ff5722', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem' }}>
              Run Merge Now
            </button>
          )}
        </div>

        {error && (
          <div style={{ backgroundColor: "#f8d7da", color: "#721c24", padding: "0.75rem", borderRadius: "4px", marginBottom: "1rem", border: "1px solid #f5c6cb" }}>{error}</div>
        )}

        {loading ? (
          <div style={{ backgroundColor: "#fff", padding: "2rem", borderRadius: "8px", border: "1px solid #dee2e6", textAlign: "center" }}>
            <div style={{ fontSize: "1.2rem", color: "#666" }}>Loading data...</div>
          </div>
        ) : filteredRows.length > 0 ? (
          <div style={{ backgroundColor: "#fff", padding: "2rem", borderRadius: "8px", border: "1px solid #dee2e6", overflowX: "auto" }}>
            <h3 style={{ marginTop: 0, color: "#333" }}>Merged Data Records</h3>
            <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <p style={{ color: "#666", fontSize: "0.9rem", margin: 0, fontStyle: "italic" }}>Only primary IAB category shown. Export for full classification metadata.</p>
              <button onClick={() => setShowExpanded(!showExpanded)} style={{ padding: "0.5rem 1rem", backgroundColor: showExpanded ? "#dc3545" : "#17a2b8", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.9rem" }}>{showExpanded ? "Collapse View" : "Expand View"}</button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", border: "1px solid #ddd" }}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left", cursor: column.sortable ? "pointer" : "default", userSelect: "none" }} onClick={() => column.sortable && handleSort(column.key)}>
                      {column.label}
                      {column.sortable && sortField === column.key && (<span style={{ marginLeft: "4px" }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((item, index) => (
                  <tr key={item.id || index} style={{ borderBottom: "1px solid #eee", ...getRowStyle(item) }}>
                    {columns.map((column) => (
                      <td key={column.key} style={{ padding: "10px 8px", borderRight: column.key === columns[columns.length - 1].key ? "none" : "1px solid #eee", maxWidth: column.key === 'url' ? "200px" : "auto", overflow: column.key === 'url' ? "hidden" : "visible", textOverflow: column.key === 'url' ? "ellipsis" : "clip", whiteSpace: column.key === 'url' ? "nowrap" : "normal" }}>
                        {getDisplayValue(item, column)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ backgroundColor: "#fff", padding: "2rem", borderRadius: "8px", border: "1px solid #dee2e6", textAlign: "center", color: "#666" }}>
            {mergedData.length === 0 ? "No merged data found. Try uploading attribution data and running the merge process." : "No records match the current filter."}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataDashboard;