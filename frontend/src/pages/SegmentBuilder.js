import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { auth } from '../firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { labelForCode as labelFromMap } from '../iabTaxonomy';
import SavedSegmentsDropdown from '../components/SavedSegmentsDropdown';
import { InlineAlert } from '../components/Alerts';
import { slog, serror } from '../utils/log';
import { getAuth } from 'firebase/auth';

const formatDate = (date) => date.toISOString().slice(0, 10);

const SegmentBuilder = () => {
  const { currentUser } = useAuth();
  const db = getFirestore();

  // Saved segments state
  const [segments, setSegments] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [savedSegmentsCache, setSavedSegmentsCache] = useState([]);

  // Builder state
  const [segmentName, setSegmentName] = useState('');
  const [segmentStart, setSegmentStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDate(d);
  });
  const [segmentEnd, setSegmentEnd] = useState(() => formatDate(new Date()));
  const [includeIab, setIncludeIab] = useState([]); // array of codes
  const [excludeIab, setExcludeIab] = useState([]); // array of codes
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
  const [iabOptions, setIabOptions] = useState([]); // union of category and subcategory codes available
  const [sourceRows, setSourceRows] = useState([]); // raw merged rows fetched for local preview
  const [isApplied, setIsApplied] = useState(false);

  const tokenHeader = () => ({ Authorization: `Bearer ${window.localStorage.getItem('fb_id_token') || ''}` });

  useEffect(() => {
    if (currentUser) {
      loadSegments();
      loadIabOptions();
      loadSourceRows();
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

  const loadIabOptions = async () => {
    try {
      // Fetch a sample of merged data to derive available codes
      const params = new URLSearchParams();
      params.set('fallback', '1');
      params.set('limit', '1000');
      const res = await axios.get(`${API_BASE_URL}/merged-data?${params.toString()}`, { headers: tokenHeader() });
      const rows = res.data?.results || [];
      const setCodes = new Set();
      rows.forEach(r => {
        const code = r?.classification_iab_code || r?.iab_code;
        const sub  = r?.classification_iab_subcode || r?.iab_subcode;
        if (code && typeof code === 'string' && code.startsWith('IAB')) setCodes.add(code);
        if (sub && typeof sub === 'string' && sub.startsWith('IAB')) setCodes.add(sub);
        if (Array.isArray(r?.iab_codes)) r.iab_codes.forEach(c => { if (typeof c === 'string' && c.startsWith('IAB')) setCodes.add(c); });
        if (Array.isArray(r?.iab_all_codes)) r.iab_all_codes.forEach(c => { if (typeof c === 'string' && c.startsWith('IAB')) setCodes.add(c); });
      });
      const entries = Array.from(setCodes).map((code) => {
        const label = resolveIabLabel(code, rows);
        const display = label ? `${code} (${label})` : code;
        return { code, label, display };
      });
      entries.sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code));
      setIabOptions(entries);
    } catch (e) {
      console.error('Error loading IAB options', e);
      setIabOptions([]);
    }
  };

  const deriveLabelFromRows = (code, rows) => {
    const maxSamples = 50;
    let seen = 0;
    for (const r of rows) {
      if (seen >= maxSamples) break;
      const topMatch = r?.iab_code === code || r?.classification_iab_code === code;
      const subMatch = r?.iab_subcode === code || r?.classification_iab_subcode === code;
      if (topMatch) {
        const cat = r?.iab_category || r?.classification_iab_category;
        if (typeof cat === 'string' && cat.trim()) {
          const m = cat.match(/\(([^)]+)\)/);
          if (m?.[1]) return m[1].trim();
          // If cat looks like "IAB9 (Sports)" we extracted above; else just use as-is
          if (!cat.startsWith('IAB')) return cat.trim();
        }
      }
      if (subMatch) {
        const sub = r?.iab_subcategory || r?.classification_iab_subcategory;
        if (typeof sub === 'string' && sub.trim()) {
          const m = sub.match(/\(([^)]+)\)/);
          if (m?.[1]) return m[1].trim();
          if (!sub.startsWith('IAB')) return sub.trim();
        }
      }
      seen++;
    }
    return '';
  };

  const resolveIabLabel = (code, rows) => {
    const fromMap = labelFromMap ? labelFromMap(code) : '';
    if (fromMap) return fromMap;
    const fromRows = deriveLabelFromRows(code, rows);
    if (fromRows) return fromRows;
    return '';
  };

  const loadSourceRows = async () => {
    try {
      const params = new URLSearchParams();
      params.set('fallback', '1');
      params.set('limit', '2000');
      const res = await axios.get(`${API_BASE_URL}/merged-data?${params.toString()}`, { headers: tokenHeader() });
      setSourceRows(res.data?.results || []);
    } catch (e) {
      console.error('Error loading source rows', e);
      setSourceRows([]);
    }
  };

  const buildSegmentRules = () => {
    const include_iab = includeIab;
    const exclude_iab = excludeIab;
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

  const rowMatchesIab = (row, codes) => {
    if (!codes?.length) return true;
    const cTop = row?.classification_iab_code || row?.iab_code;
    const cSub = row?.classification_iab_subcode || row?.iab_subcode;
    const arrays = [];
    const rowCodes = new Set([cTop, cSub, ...arrays].filter(Boolean));
    for (const code of codes) {
      if (rowCodes.has(code)) return true;
    }
    return false;
  };

  const rowExcludedByIab = (row, codes) => {
    if (!codes?.length) return false;
    const cTop = row?.classification_iab_code || row?.iab_code;
    const cSub = row?.classification_iab_subcode || row?.iab_subcode;
    const arrays = [];
    const rowCodes = new Set([cTop, cSub, ...arrays].filter(Boolean));
    for (const code of codes) {
      if (rowCodes.has(code)) return true;
    }
    return false;
  };

  const applyOtherFilters = (row) => {
    // Date range on upload_date/merged_at if provided
    const start = segmentStart ? new Date(segmentStart + 'T00:00:00Z') : null;
    const end = segmentEnd ? new Date(segmentEnd + 'T23:59:59Z') : null;
    const iso = row.merged_at || row.upload_date;
    if (iso && (start || end)) {
      const d = new Date(iso);
      if (start && d < start) return false;
      if (end && d > end) return false;
    }
    // KPI minimums
    const num = (v) => (v == null ? null : Number(v));
    const ctr = num(row.attribution_ctr);
    const view = num(row.attribution_viewability);
    const scroll = num(row.attribution_scroll_depth);
    const conv = num(row.attribution_conversions);
    const impr = num(row.attribution_impressions);
    const fill = num(row.attribution_fill_rate);
    if (kpiCtr && !(ctr >= parseFloat(kpiCtr))) return false;
    if (kpiViewability && !(view >= parseFloat(kpiViewability))) return false;
    if (kpiScrollDepth && !(scroll >= parseFloat(kpiScrollDepth))) return false;
    if (kpiConversions && !(conv >= parseFloat(kpiConversions))) return false;
    if (kpiImpressions && !(impr >= parseFloat(kpiImpressions))) return false;
    if (kpiFillRate && !(fill >= parseFloat(kpiFillRate))) return false;
    return true;
  };

  const onApply = () => {
    try {
      const filtered = sourceRows.filter((r) => {
        if (!rowMatchesIab(r, includeIab)) return false;
        if (rowExcludedByIab(r, excludeIab)) return false;
        if (!applyOtherFilters(r)) return false;
        return true;
      });
      setPreviewRows(filtered);
      setPreviewCount(filtered.length);
      setIsApplied(true);
    } catch (e) {
      console.error('Apply failed', e);
      setPreviewRows([]);
      setPreviewCount(0);
      setIsApplied(false);
    }
  };

  const onClear = () => {
    setPreviewRows([]);
    setPreviewCount(0);
    setIsApplied(false);
  };

  const onSaveClient = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        alert('Please sign in to save segments.');
        return;
      }
      if (!segmentName.trim()) {
        alert('Please enter a segment name.');
        return;
      }
      if (!isApplied) {
        alert('Click Apply to generate a preview before saving.');
        return;
      }
      const sampleUrls = previewRows.slice(0, 50).map(r => r.url).filter(Boolean);
      const payload = {
        name: segmentName.trim(),
        include_codes: includeIab,
        exclude_codes: excludeIab,
        filters: {
          date_range: [segmentStart, segmentEnd],
          kpi: {
            ctr: kpiCtr || null,
            viewability: kpiViewability || null,
            scroll_depth: kpiScrollDepth || null,
            conversions: kpiConversions || null,
            impressions: kpiImpressions || null,
            fill_rate: kpiFillRate || null,
          }
        },
        total_urls: previewRows.length,
        sample_urls: sampleUrls,
        created_at: new Date().toISOString(),
        server_timestamp: serverTimestamp(),
      };
      const colRef = collection(db, 'users', user.uid, 'segments');
      const docRef = await addDoc(colRef, payload);
      slog('Saved segment', { id: docRef.id, ...payload });
      alert('Segment saved.');
    } catch (e) {
      serror('Save to Firestore failed', e);
      alert('Failed to save segment.');
    }
  };

  const canExport = () => {
    return Boolean(selectedSegmentId) || (Array.isArray(previewRows) && previewRows.length > 0);
  };

  const onExportClick = async () => {
    try {
      if (!canExport()) return;
      const authInstance = getAuth();
      const token = await authInstance.currentUser?.getIdToken?.();
      const body = {
        segmentId: selectedSegmentId || null,
        include_codes: includeIab || [],
        exclude_codes: excludeIab || [],
        filters: {
          date_range: [segmentStart, segmentEnd],
          kpi: {
            ctr: kpiCtr || null,
            viewability: kpiViewability || null,
            scroll_depth: kpiScrollDepth || null,
            conversions: kpiConversions || null,
            impressions: kpiImpressions || null,
            fill_rate: kpiFillRate || null,
          }
        },
      };
      slog('[Export] request body', body);
      const res = await axios.post(`${API_BASE_URL}/export-segment`, body, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: 'text'
      });
      if (res.status !== 200) throw new Error(`Export failed (${res.status})`);
      const csvText = typeof res.data === 'string' ? res.data : (res.data?.csv || '');
      if (!csvText) throw new Error('Empty CSV returned');
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `segment_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      const status = e?.response?.status;
      const serverErr = e?.response?.data?.error || e?.response?.data || e?.message || String(e);
      serror('[Export] failed', { status, serverErr });
      alert(`Export failed${status ? ` (${status})` : ''}: ${serverErr}`);
      if (Array.isArray(previewRows) && previewRows.length > 0) {
        const headers = Object.keys(previewRows[0]);
        const csv = [headers.join(','), ...previewRows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `segment_preview_${Date.now()}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
    }
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
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Include IAB (multi-select)</label>
              <select
                multiple
                size={6}
                value={includeIab}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map(o => o.value);
                  setIncludeIab(values);
                }}
                style={{ width: '100%', padding: '0.25rem', border: '1px solid #ddd', borderRadius: 4 }}
              >
                {iabOptions.map(({ code, display }) => (
                  <option key={code} value={code}>{display}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Exclude IAB (multi-select)</label>
              <select
                multiple
                size={6}
                value={excludeIab}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map(o => o.value);
                  setExcludeIab(values);
                }}
                style={{ width: '100%', padding: '0.25rem', border: '1px solid #ddd', borderRadius: 4 }}
              >
                {iabOptions.map(({ code, display }) => (
                  <option key={code} value={code}>{display}</option>
                ))}
              </select>
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
              <button onClick={onApply} style={{ padding: '0.5rem 1rem', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Apply</button>
              <button onClick={onClear} style={{ padding: '0.5rem 1rem', backgroundColor: '#adb5bd', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Clear</button>
              <button onClick={onSaveClient} disabled={!segmentName.trim() || !isApplied} style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: 4, cursor: (!segmentName.trim() || !isApplied) ? 'not-allowed' : 'pointer' }}>Save</button>
              <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #ddd' }}>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
              <button onClick={handleSegmentExport} disabled={!selectedSegmentId} style={{ padding: '0.5rem 1rem', backgroundColor: '#20c997', color: 'white', border: 'none', borderRadius: 4, cursor: selectedSegmentId ? 'pointer' : 'not-allowed' }}>Export Saved Segment</button>
            </div>

            {error && (
              <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.75rem', borderRadius: 4, border: '1px solid #f5c6cb', marginTop: '1rem' }}>{error}</div>
            )}

            {isApplied && (
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
                      {previewRows.slice(0, 100).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                          <td style={{ padding: '8px' }}>{r.url}</td>
                          <td style={{ padding: '8px' }}>{r.iab_code || r.classification_iab_code}</td>
                          <td style={{ padding: '8px' }}>{r.iab_subcode || r.classification_iab_subcode}</td>
                          <td style={{ padding: '8px' }}>{r.iab_secondary_code || r.classification_iab_secondary_code}</td>
                          <td style={{ padding: '8px' }}>{r.iab_secondary_subcode || r.classification_iab_secondary_subcode}</td>
                          <td style={{ padding: '8px' }}>{r.tone || r.classification_tone}</td>
                          <td style={{ padding: '8px' }}>{r.intent || r.classification_intent}</td>
                          <td style={{ padding: '8px' }}>{r.attribution_conversions}</td>
                          <td style={{ padding: '8px' }}>{r.attribution_ctr}</td>
                          <td style={{ padding: '8px' }}>{r.attribution_viewability}</td>
                          <td style={{ padding: '8px' }}>{r.attribution_scroll_depth}</td>
                          <td style={{ padding: '8px' }}>{r.attribution_impressions}</td>
                          <td style={{ padding: '8px' }}>{r.attribution_fill_rate}</td>
                          <td style={{ padding: '8px' }}>{r.merged_at || r.upload_date}</td>
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
            <SavedSegmentsDropdown
              value={selectedSegmentId}
              onChange={(id) => {
                setSelectedSegmentId(id);
                const seg = savedSegmentsCache.find(s => s.id === id);
                if (seg) {
                  setIncludeIab(seg.include_codes || []);
                  setExcludeIab(seg.exclude_codes || []);
                }
              }}
              onLoaded={(rows) => setSavedSegmentsCache(rows)}
            />
            <button onClick={async () => { if (!selectedSegmentId) return; const res = await axios.get(`${API_BASE_URL}/segments/${selectedSegmentId}/preview?limit=100`, { headers: tokenHeader() }); setPreviewRows(res.data?.rows || []); setPreviewCount(res.data?.count || 0); }} style={{ padding: '0.5rem 1rem', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Preview</button>
            <button onClick={loadSegments} style={{ padding: '0.5rem 1rem', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>Refresh</button>
          </div>
          <div style={{ marginTop: 10 }}>
            {(() => {
              const disabled = !canExport();
              const hint = 'Select a saved segment or click Apply to build a non-empty preview before exporting.';
              return (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button type="button" disabled={disabled} title={disabled ? hint : ''} onClick={onExportClick}>Export</button>
                  {disabled && (
                    <InlineAlert>
                      <strong>Export unavailable:</strong> {hint}
                    </InlineAlert>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SegmentBuilder;