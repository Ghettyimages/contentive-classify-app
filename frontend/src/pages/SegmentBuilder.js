import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const formatDate = (date) => date.toISOString().slice(0, 10);

const SegmentBuilder = () => {
  const { currentUser } = useAuth();

  // Saved segments state
  const [segments, setSegments] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState('');

  // Builder state
  const [segmentName, setSegmentName] = useState('');
  const [segmentStart, setSegmentStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDate(d);
  });
  const [segmentEnd, setSegmentEnd] = useState(() => formatDate(new Date()));
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
  const [exportFormat, setExportFormat] = useState('csv');
  const [error, setError] = useState('');

  const tokenHeader = () => ({ Authorization: `Bearer ${window.localStorage.getItem('fb_id_token') || ''}` });

  useEffect(() => {
    if (currentUser) {
      loadSegments();
    }
  }, [currentUser]);

  const loadSegments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/segments`, { headers: tokenHeader() });
      setSegments(res.data?.segments || []);
    } catch (e) {
      console.error('Error loading segments', e);
    }
  };

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
      setError('');
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
      setError('Preview failed');
      setPreviewRows([]);
      setPreviewCount(0);
    }
  };

  const handleSegmentSave = async () => {
    try {
      setError('');
      const rules = buildSegmentRules();
      const payload = { name: segmentName || `Segment ${new Date().toISOString()}`, rules };
      await axios.post(`${API_BASE_URL}/segments`, payload, { headers: { ...tokenHeader(), 'Content-Type': 'application/json' } });
      await loadSegments();
      setSegmentName('');
    } catch (e) {
      console.error('Save segment failed', e);
      setError('Save segment failed');
    }
  };

  const handleSegmentExport = async () => {
    try {
      setError('');
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

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img src="/logo2.png" alt="Contentive Media Logo" style={{ maxWidth: '210px', height: 'auto', marginBottom: '-2.0rem' }} />
        <h1 style={{ margin: '0.2rem 0 0 0', fontSize: '1.8rem' }}>CONTENTIVE MEDIA</h1>
        <p style={{ fontSize: '1rem', color: '#444', margin: '0.5rem' }}>Segments</p>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Builder */}
        <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: 8, border: '1px solid #dee2e6', marginBottom: '2rem' }}>
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
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #ddd' }}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            <button onClick={handleSegmentExport} disabled={!selectedSegmentId} style={{ padding: '0.5rem 1rem', backgroundColor: '#20c997', color: 'white', border: 'none', borderRadius: 4, cursor: selectedSegmentId ? 'pointer' : 'not-allowed' }}>Export Saved Segment</button>
          </div>

          {error && (
            <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.75rem', borderRadius: 4, border: '1px solid #f5c6cb', marginTop: '1rem' }}>{error}</div>
          )}

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

        {/* Saved segments */}
        <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: 8, border: '1px solid #dee2e6' }}>
          <h3 style={{ marginTop: 0 }}>Saved Segments</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={selectedSegmentId} onChange={(e) => setSelectedSegmentId(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}>
              <option value="">Select Saved Segment...</option>
              {segments.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button onClick={async () => { if (!selectedSegmentId) return; const res = await axios.get(`${API_BASE_URL}/segments/${selectedSegmentId}/preview?limit=100`, { headers: tokenHeader() }); setPreviewRows(res.data?.rows || []); setPreviewCount(res.data?.count || 0); }} style={{ padding: '0.5rem 1rem', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Preview</button>
            <button onClick={loadSegments} style={{ padding: '0.5rem 1rem', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Refresh</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SegmentBuilder;