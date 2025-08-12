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
  const [exportFormat, setExportFormat] = useState('csv');
  const [stats, setStats] = useState({
    total: 0,
    merged: 0,
    attributionOnly: 0,
    classificationOnly: 0
  });

  // Segment Builder state
  const [segments, setSegments] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [segmentPanelOpen, setSegmentPanelOpen] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [segmentStart, setSegmentStart] = useState(() => startDate);
  const [segmentEnd, setSegmentEnd] = useState(() => endDate);
  const [includeIabInput, setIncludeIabInput] = useState('');
  const [excludeIabInput, setExcludeIabInput] = useState('');
  const [kpiCtr, setKpiCtr] = useState('');
  const [kpiViewability, setKpiViewability] = useState('');
  const [kpiScrollDepth, setKpiScrollDepth] = useState('');
  const [kpiConversions, setKpiConversions] = useState('');
  const [kpiImpressions, setKpiImpressions] = useState('');
  const [kpiFillRate, setKpiFillRate] = useState('');
  const [segmentSortBy, setSegmentSortBy] = useState('ctr');
  const [segmentOrder, setSegmentOrder] = useState('desc');
  const [previewRows, setPreviewRows] = useState([]);
  const [previewCount, setPreviewCount] = useState(0);

  useEffect(() => {
    if (currentUser) {
      loadMergedData();
      loadSegments();
    }
  }, [currentUser]);

  const tokenHeader = () => ({ Authorization: `Bearer ${window.localStorage.getItem('fb_id_token') || ''}` });

  const loadSegments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/segments`, { headers: tokenHeader() });
      setSegments(res.data?.segments || []);
    } catch (e) {
      console.error('Error loading segments', e);
    }
  };

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
        headers: tokenHeader()
      });

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

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('start', startDate);
    if (endDate) params.set('end', endDate);
    if (sortField) params.set('sort_by', mapSortKey(sortField));
    if (sortDirection) params.set('order', sortDirection);
    return params;
  };

  const handleExportActivation = async () => {
    const params = buildQueryParams();
    params.set('format', exportFormat);
    params.set('limit', '20000');
    const token = window.localStorage.getItem('fb_id_token') || '';
    const url = `${API_BASE_URL}/export-activation?${params.toString()}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
    if (!item.hasClassification && !item.hasAttribution) {
      return { backgroundColor: '#ffebee' };
    } else if (!item.hasClassification) {
      return { backgroundColor: '#ffebee' };
    } else if (!item.hasAttribution) {
      return { backgroundColor: '#fff3e0' };
    }
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
    await loadMergedData({});
  };

  const exportToCSV = () => {
    const headers = [
      'URL','IAB Category','IAB Subcategory','Secondary IAB Category','Secondary IAB Subcategory','IAB Code','IAB Subcode','Secondary IAB Code','Secondary IAB Subcode','Tone','Intent','Audience','Keywords','Conversions','Revenue','CTR (%)','Viewability (%)','Scroll Depth (%)','Impressions','Fill Rate (%)','Clicks','Time on Page','Data Status'
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
      item.hasClassification && item.hasAttribution ? 'Complete' : item.hasClassification ? 'Classification Only' : item.hasAttribution ? 'Attribution Only' : 'No Data'
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

  const processedData = mergedData;

  // Build segment rules payload
  const buildSegmentRules = () => {
    const include_iab = includeIabInput.split(',').map(s => s.trim()).filter(Boolean);
    const exclude_iab = excludeIabInput.split(',').map(s => s.trim()).filter(Boolean);
    const kpi_filters = {};
    if (kpiCtr !== '') kpi_filters.ctr = { gte: parseFloat(kpiCtr) };
    if (kpiViewability !== '') kpi_filters.viewability = { gte: parseFloat(kpiViewability) };
    if (kpiScrollDepth !== '') kpi_filters.scroll_depth = { gte: parseFloat(kpiScrollDepth) };
    if (kpiConversions !== '') kpi_filters.conversions = { gte: parseFloat(kpiConversions) };
    if (kpiImpressions !== '') kpi_filters.impressions = { gte: parseFloat(kpiImpressions) };
    if (kpiFillRate !== '') kpi_filters.fill_rate = { gte: parseFloat(kpiFillRate) };
    return {
      date_range: [segmentStart, segmentEnd],
      include_iab,
      exclude_iab,
      kpi_filters,
      sort_by: segmentSortBy,
      order: segmentOrder
    };
  };

  const handleSegmentPreview = async () => {
    try {
      // Use export-activation with rules to preview (JSON)
      const rules = buildSegmentRules();
      const params = new URLSearchParams();
      if (rules.date_range?.[0]) params.set('start', rules.date_range[0]);
      if (rules.date_range?.[1]) params.set('end', rules.date_range[1]);
      if (rules.include_iab?.length) params.set('include_iab', rules.include_iab.join(','));
      if (rules.exclude_iab?.length) params.set('exclude_iab', rules.exclude_iab.join(','));
      if (rules.sort_by) params.set('sort_by', rules.sort_by);
      if (rules.order) params.set('order', rules.order);
      params.set('format', 'json');
      params.set('limit', '100');
      const res = await axios.get(`${API_BASE_URL}/export-activation?${params.toString()}`, { headers: tokenHeader() });
      const rows = res.data?.rows || [];
      setPreviewRows(rows);
      setPreviewCount(rows.length);
    } catch (e) {
      console.error('Preview failed', e);
      setPreviewRows([]);
      setPreviewCount(0);
    }
  };

  const handleSegmentSave = async () => {
    try {
      const rules = buildSegmentRules();
      const payload = { name: segmentName || `Segment ${new Date().toISOString()}`, rules };
      await axios.post(`${API_BASE_URL}/segments`, payload, { headers: { ...tokenHeader(), 'Content-Type': 'application/json' } });
      await loadSegments();
      setSegmentPanelOpen(false);
      setSegmentName('');
    } catch (e) {
      console.error('Save segment failed', e);
    }
  };

  const handleSegmentExport = async () => {
    try {
      if (!selectedSegmentId) return;
      const fmt = exportFormat === 'json' ? 'json' : 'csv';
      const token = window.localStorage.getItem('fb_id_token') || '';
      const url = `${API_BASE_URL}/segments/${selectedSegmentId}/export?format=${fmt}&limit=20000`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const dlUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = dlUrl;
      link.download = `segment_${selectedSegmentId}_${new Date().toISOString().slice(0,10)}.${fmt}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (e) {
      console.error('Export segment failed', e);
      setError('Export segment failed');
    }
  };

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
        <img src="/logo2.png" alt="Contentive Media Logo" style={{ maxWidth: "210px", height: "auto", marginBottom: "-2.0rem" }} />
        <h1 style={{ margin: "0.2rem 0 0 0", fontSize: "1.8rem" }}>CONTENTIVE MEDIA</h1>
        <p style={{ fontSize: "1rem", color: "#444", margin: "0.5rem" }}>Data Dashboard - Merged Attribution & Classification</p>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        {/* Statistics Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          <div style={{ backgroundColor: "#e3f2fd", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#1976d2" }}>Total Records</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#1976d2" }}>{stats.total}</p>
          </div>
          <div style={{ backgroundColor: "#e8f5e8", padding: "1.5rem", borderRadius: "8px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#2e7d32" }}>Merged Records</h3>
            <p style={{ fontSize: "2rem", margin: 0, fontWeight: "bold", color: "#2e7d32" }}>{stats.merged}</p>
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

        {/* Controls */}
        <div style={{ backgroundColor: "#f8f9fa", padding: "1rem", borderRadius: "8px", marginBottom: "2rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={loadMergedData} disabled={loading} style={{ padding: "0.5rem 1rem", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>{loading ? "Loading..." : "Refresh Data"}</button>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span>to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <button onClick={() => loadMergedData({ startDate, endDate })} disabled={loading} style={{ padding: "0.5rem 1rem", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>Apply</button>
          </div>

          <button onClick={exportToCSV} disabled={loading || mergedData.length === 0} style={{ padding: "0.5rem 1rem", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: (loading || mergedData.length === 0) ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>Export to CSV</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            <button onClick={handleExportActivation} disabled={loading} style={{ padding: '0.5rem 1rem', backgroundColor: '#343a40', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}>Export for Activation</button>
            <span style={{ color: '#666', fontSize: '0.85rem', fontStyle: 'italic' }}>Exports rows using your current filters & sort.</span>
          </div>

          {/* Segment controls */}
          <button onClick={() => setSegmentPanelOpen(!segmentPanelOpen)} style={{ padding: '0.5rem 1rem', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>{segmentPanelOpen ? 'Close Segment Builder' : 'Create Segment'}</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select value={selectedSegmentId} onChange={(e) => setSelectedSegmentId(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}>
              <option value="">Select Saved Segment...</option>
              {segments.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button onClick={async () => { if (!selectedSegmentId) return; const res = await axios.get(`${API_BASE_URL}/segments/${selectedSegmentId}/preview?limit=100`, { headers: tokenHeader() }); setPreviewRows(res.data?.rows || []); setPreviewCount(res.data?.count || 0); }} style={{ padding: '0.5rem 1rem', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Preview</button>
            <button onClick={handleSegmentExport} style={{ padding: '0.5rem 1rem', backgroundColor: '#20c997', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Export Segment</button>
            <button onClick={loadSegments} style={{ padding: '0.5rem 1rem', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Refresh Segments</button>
          </div>
        </div>

        {segmentPanelOpen && (
          <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #dee2e6', marginBottom: '2rem' }}>
            <h3 style={{ marginTop: 0 }}>Create Segment</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Name</label>
                <input type="text" value={segmentName} onChange={(e) => setSegmentName(e.target.value)} placeholder="e.g., High CTR Sports" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Start Date</label>
                <input type="date" value={segmentStart} onChange={(e) => setSegmentStart(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>End Date</label>
                <input type="date" value={segmentEnd} onChange={(e) => setSegmentEnd(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Include IAB (comma-separated codes)</label>
                <input type="text" value={includeIabInput} onChange={(e) => setIncludeIabInput(e.target.value)} placeholder="e.g., IAB9,IAB18" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Exclude IAB (comma-separated codes)</label>
                <input type="text" value={excludeIabInput} onChange={(e) => setExcludeIabInput(e.target.value)} placeholder="e.g., IAB25" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Sort By</label>
                <select value={segmentSortBy} onChange={(e) => setSegmentSortBy(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }}>
                  <option value="ctr">CTR</option>
                  <option value="conversions">Conversions</option>
                  <option value="viewability">Viewability</option>
                  <option value="scroll_depth">Scroll Depth</option>
                  <option value="impressions">Impressions</option>
                  <option value="fill_rate">Fill Rate</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Order</label>
                <select value={segmentOrder} onChange={(e) => setSegmentOrder(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }}>
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>

            <h4 style={{ marginTop: '1rem' }}>KPI Thresholds (min values)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>CTR</label>
                <input type="number" step="0.0001" value={kpiCtr} onChange={(e) => setKpiCtr(e.target.value)} placeholder="0.01" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Viewability</label>
                <input type="number" step="0.01" value={kpiViewability} onChange={(e) => setKpiViewability(e.target.value)} placeholder="0.6" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Scroll Depth</label>
                <input type="number" step="0.01" value={kpiScrollDepth} onChange={(e) => setKpiScrollDepth(e.target.value)} placeholder="0.5" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Conversions</label>
                <input type="number" step="1" value={kpiConversions} onChange={(e) => setKpiConversions(e.target.value)} placeholder="1" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Impressions</label>
                <input type="number" step="1" value={kpiImpressions} onChange={(e) => setKpiImpressions(e.target.value)} placeholder="500" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Fill Rate</label>
                <input type="number" step="0.01" value={kpiFillRate} onChange={(e) => setKpiFillRate(e.target.value)} placeholder="0.5" style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button onClick={handleSegmentPreview} style={{ padding: '0.5rem 1rem', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Preview</button>
              <button onClick={handleSegmentSave} style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Save Segment</button>
              <button onClick={async () => { await handleSegmentPreview(); const blob = new Blob([JSON.stringify(previewRows, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `segment_preview_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }} style={{ padding: '0.5rem 1rem', backgroundColor: '#20c997', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Export Segment (Unsaved)</button>
            </div>

            {previewRows.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <strong>Preview ({previewCount} rows)</strong>
                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #eee' }}>
                    <thead>
                      <tr>
                        {['url','iab_code','iab_subcode','iab_secondary_code','iab_secondary_subcode','tone','intent','conversions','ctr','viewability','scroll_depth','impressions','fill_rate','last_updated'].map(h => (
                          <th key={h} style={{ padding: '8px', background: '#f8f9fa', borderBottom: '1px solid #eee', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 20).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                          <td style={{ padding: '8px' }}>{r.url}</td>
                          <td style={{ padding: '8px' }}>{r.iab_code}</td>
                          <td style={{ padding: '8px' }}>{r.iab_subcode}</td>
                          <td style={{ padding: '8px' }}>{r.iab_secondary_code}</td>
                          <td style={{ padding: '8px' }}>{r.iab_secondary_subcode}</td>
                          <td style={{ padding: '8px' }}>{r.tone}</td>
                          <td style={{ padding: '8px' }}>{r.intent}</td>
                          <td style={{ padding: '8px' }}>{r.conversions}</td>
                          <td style={{ padding: '8px' }}>{r.ctr}</td>
                          <td style={{ padding: '8px' }}>{r.viewability}</td>
                          <td style={{ padding: '8px' }}>{r.scroll_depth}</td>
                          <td style={{ padding: '8px' }}>{r.impressions}</td>
                          <td style={{ padding: '8px' }}>{r.fill_rate}</td>
                          <td style={{ padding: '8px' }}>{r.last_updated}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: "#f8d7da", color: "#721c24", padding: "0.75rem", borderRadius: "4px", marginBottom: "1rem", border: "1px solid #f5c6cb" }}>{error}</div>
        )}

        {/* Data Table */}
        {loading ? (
          <div style={{ backgroundColor: "#fff", padding: "2rem", borderRadius: "8px", border: "1px solid #dee2e6", textAlign: "center" }}>
            <div style={{ fontSize: "1.2rem", color: "#666" }}>Loading data...</div>
          </div>
        ) : processedData.length > 0 ? (
          <div style={{ backgroundColor: "#fff", padding: "2rem", borderRadius: "8px", border: "1px solid #dee2e6", overflowX: "auto" }}>
            <h3 style={{ marginTop: 0, color: "#333" }}>Merged Data Records</h3>

            {/* Helper text and expand toggle */}
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
                      {column.sortable && sortField === column.key && (
                        <span style={{ marginLeft: "4px" }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {processedData.map((item, index) => (
                  <tr key={item.id || index} style={{ borderBottom: "1px solid #eee", ...getRowStyle(item) }}>
                    {columns.map((column) => (
                      <td key={column.key} style={{ padding: "10px 8px", borderRight: column.key === columns[columns.length - 1].key ? "none" : "1px solid #eee", maxWidth: column.key === 'url' ? "200px" : "auto", overflow: column.key === 'url' ? "hidden" : "visible", textOverflow: column.key === 'url' ? "ellipsis" : "clip", whiteSpace: column.key === 'url' ? "nowrap" : "normal" }}>
                        {column.isDirectField ? (item[column.key] || 'N/A') : column.formatter ? column.formatter(getFieldValue(item, column.prefix, column.key)) : getFieldValue(item, column.prefix, column.key)}
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