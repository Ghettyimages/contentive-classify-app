import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { auth } from '../firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
// IAB options now powered by backend /api/iab31 with local fallback
import SavedSegmentsDropdown from '../components/SavedSegmentsDropdown';
import { InlineAlert } from '../components/Alerts';
import { slog, serror } from '../utils/log';
import { getAuth } from 'firebase/auth';
import '../styles/segmentBuilder.css';
import { sortByIabCode } from '../utils/iabSort';
import ExportFormatModal from '../components/ExportFormatModal.jsx';
import { normalizeIabCodes } from '../utils/iabNormalize';

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
  const [iabOptions, setIabOptions] = useState([]);
  const [taxonomySource, setTaxonomySource] = useState(''); // 'backend' | 'fallback' | ''
  const [taxonomyCount, setTaxonomyCount] = useState(0);
  const [sourceRows, setSourceRows] = useState([]); // raw merged rows fetched for local preview
  const [isApplied, setIsApplied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [previewQuery, setPreviewQuery] = useState(null);
  const [showOnlyUsedIab, setShowOnlyUsedIab] = useState(true);

  const taxonomyReady = iabOptions.length > 0;
  const uiDisabled = (() => {
    const reasons = {
      view: selectedSegmentId ? null : 'Select a saved segment to view',
      apply: taxonomyReady ? null : 'IAB taxonomy not loaded',
      save: (includeIab?.length || excludeIab?.length) ? null : 'Add at least one filter to save',
      export: (Array.isArray(previewRows) && previewRows.length > 0) ? null : 'No preview results to export. Click Apply first.',
    };
    return {
      view: !!reasons.view, viewReason: reasons.view || '',
      apply: !!reasons.apply, applyReason: reasons.apply || '',
      save: !!reasons.save, saveReason: reasons.save || '',
      export: !!reasons.export, exportReason: reasons.export || '',
    };
  })();

  const handleViewSaved = async () => {
    try {
      if (!selectedSegmentId) return;
      const res = await axios.get(`${API_BASE_URL}/segments/${selectedSegmentId}/preview?limit=100`, { headers: tokenHeader() });
      const rows = res.data?.rows || [];
      setPreviewRows(rows);
      setPreviewCount(res.data?.count || rows.length || 0);
      const seg = savedSegmentsCache.find(s => s.id === selectedSegmentId) || segments.find(s => s.id === selectedSegmentId);
      if (seg) {
        setIncludeIab(seg.include_codes || seg.rules?.include_iab || []);
        setExcludeIab(seg.exclude_codes || seg.rules?.exclude_iab || []);
        setPreviewQuery({ mode: 'segment', segment_id: selectedSegmentId });
      }
    } catch (e) {
      console.error('View saved segment failed', e);
      alert(e?.response?.data?.error || e?.message || 'Failed to view segment');
    }
  };

  const handleApply = () => {
    const rules = buildSegmentRules();
    setPreviewQuery({ mode: 'preview', query: rules });
    onApply();
  };

  const handleSave = () => onSaveClient();

  const handleExport = async (format) => {
    try {
      const token = window.localStorage.getItem('fb_id_token') || '';
      let body = {};
      if (Array.isArray(previewRows) && previewRows.length > 0 && previewQuery) {
        body = { mode: 'preview', format, query: previewQuery?.query || {}, rows: previewRows };
      } else if (selectedSegmentId) {
        body = { mode: 'segment', format, segment_id: selectedSegmentId };
      } else {
        throw new Error('Nothing to export: run Apply or select a saved segment');
      }
      const response = await axios.post(`${API_BASE_URL}/export`, body, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
      if (response.status !== 200) throw new Error('Export failed');
      const blob = new Blob([response.data], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contentive_export.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Export failed';
      console.error('[Export] failed', e);
      alert(msg);
    }
  };

  const tokenHeader = () => ({ Authorization: `Bearer ${window.localStorage.getItem('fb_id_token') || ''}` });

  useEffect(() => {
    if (currentUser) {
      loadSegments();
      loadSourceRows();
    }
  }, [currentUser]);

  // Load IAB options after source rows are loaded, and when filter toggle changes
  useEffect(() => {
    if (currentUser) {
      loadIabOptions();
    }
  }, [currentUser, sourceRows, showOnlyUsedIab]);

  const loadSegments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/segments`, { headers: tokenHeader() });
      setSegments(res.data?.segments || []);
    } catch (e) {
      console.error('Error loading segments', e);
    }
  };

  const MIN_IAB_COUNT = 200;
  const loadIabOptions = async () => {
    console.info('[IAB] initializing…');
    
    let allIabCodes = [];
    let taxonomySource = '';
    let totalCount = 0;
    
    // First, load all available IAB codes
    try {
      console.log('[DEBUG] Loading all IAB codes from:', `${API_BASE_URL}/api/iab31`);
      const res = await axios.get(`${API_BASE_URL}/api/iab31`, { 
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      const data = res.data;
      if (data && data.codes && Array.isArray(data.codes)) {
        allIabCodes = data.codes;
        taxonomySource = 'backend';
        totalCount = data.codes.length;
        console.log('[DEBUG] Loaded all IAB codes from backend:', totalCount);
      } else {
        throw new Error('Invalid backend response');
      }
      
    } catch (err) {
      console.warn('[IAB] Backend load failed, using local fallback. Error:', err?.message || err);
      try {
        const bundled = (await import('../data/iab_content_taxonomy_3_1.v1.json')).default;
        if (bundled && bundled.codes && Array.isArray(bundled.codes)) {
          allIabCodes = bundled.codes;
          taxonomySource = 'fallback';
          totalCount = bundled.codes.length;
          console.log('[DEBUG] Loaded all IAB codes from fallback:', totalCount);
        }
      } catch (e2) {
        console.error('[IAB] Failed to load fallback JSON', e2);
        setIabOptions([]);
        setTaxonomySource('error');
        setTaxonomyCount(0);
        return;
      }
    }
    
    // Filter to only used codes if requested
    if (showOnlyUsedIab && sourceRows.length > 0) {
      console.log('[DEBUG] Filtering IAB codes based on sourceRows data...');
      
      // Extract IAB codes from the source data that's already loaded
      const codesInUse = new Set();
      
      for (const row of sourceRows) {
        // Check all possible IAB code fields
        const codes = [
          row.classification_iab_code,
          row.classification_iab_subcode, 
          row.classification_iab_secondary_code,
          row.classification_iab_secondary_subcode,
          row.iab_code,
          row.iab_subcode,
          row.iab_secondary_code,
          row.iab_secondary_subcode
        ];
        
        for (const code of codes) {
          if (code && typeof code === 'string' && code.trim()) {
            codesInUse.add(code.trim());
          }
        }
      }
      
      console.log('[DEBUG] Found', codesInUse.size, 'unique IAB codes in source data');
      console.log('[DEBUG] Sample codes in use:', Array.from(codesInUse).slice(0, 10));
      
      if (codesInUse.size === 0) {
        console.warn('[IAB] No codes found in source data, showing all available codes');
        const items = buildOptions(allIabCodes);
        setIabOptions(items);
        setTaxonomySource(taxonomySource + ' (all - no data)');
        setTaxonomyCount(totalCount);
        return;
      }
      
      // Filter all IAB codes to only those in use
      const filteredCodes = allIabCodes.filter(code => {
        const codeValue = code.code || code.iab_code || code.uid || '';
        return codesInUse.has(codeValue);
      });
      
      console.log('[DEBUG] Filtered to', filteredCodes.length, 'codes out of', allIabCodes.length, 'total');
      
      const items = buildOptions(filteredCodes);
      setIabOptions(items);
      setTaxonomySource(taxonomySource + ' (filtered)');
      setTaxonomyCount(filteredCodes.length);
      console.info(`[IAB] Showing filtered codes: ${filteredCodes.length} used out of ${totalCount} total, ${items.length} options`);
      
    } else {
      // Show all available codes
      console.log('[DEBUG] Showing all IAB codes (filter disabled or no source data)');
      const items = buildOptions(allIabCodes);
      setIabOptions(items);
      setTaxonomySource(taxonomySource + ' (all)');
      setTaxonomyCount(totalCount);
      console.info(`[IAB] Showing all codes: ${totalCount} total, ${items.length} options`);
    }
  };

  const buildOptions = (codes) => {
    console.log('[DEBUG] buildOptions called with codes:', codes && codes.length ? codes.length : 0, 'items');
    if (!codes || !Array.isArray(codes)) {
      console.log('[DEBUG] Invalid codes input:', codes);
      return [];
    }
    const map = new Map();
    for (const c of codes) {
      if (!c) continue;
      const k = (c.code || c.iab_code || c.uid || '').toString().trim().toUpperCase();
      if (!k) {
        console.log('[DEBUG] Skipping item with no code:', c);
        continue;
      }
      const display = Array.isArray(c.path) && c.path.length > 0 
        ? c.path.join(' > ') 
        : (c.label || c.name || k);
      if (!map.has(k)) {
        map.set(k, { code: k, display });
      }
    }
    const result = Array.from(map.values()).sort((a, b) => a.display.toLowerCase().localeCompare(b.display.toLowerCase()));
    console.log('[DEBUG] buildOptions result:', result.length, 'options');
    if (result.length > 0) {
      console.log('[DEBUG] Sample options:', result.slice(0, 3));
    }
    return result;
  };

  // Removed legacy label derivation; taxonomy is the source of truth now

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

  const banner = (() => {
    if (!taxonomySource) return 'IAB 3.1 • Loading...';
    const enabled = iabOptions.length >= 10 ? 'enabled' : 'disabled';
    const filterStatus = showOnlyUsedIab ? 'Filtered' : 'All';
    return `IAB 3.1 • ${taxonomySource} • ${filterStatus}: ${taxonomyCount} codes • Options: ${iabOptions.length} • ${enabled}`;
  })();

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img src="/logo2.png" alt="Contentive Media Logo" style={{ maxWidth: '210px', height: 'auto', marginBottom: '-2.0rem' }} />
        <h1 style={{ margin: '0.2rem 0 0 0', fontSize: '1.8rem' }}>CONTENTIVE MEDIA</h1>
        <p style={{ fontSize: '1rem', color: '#444', margin: '0.5rem' }}>Segments</p>
        {banner && (
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{banner}</div>
        )}
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Builder */}
        <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: 8, border: '1px solid #dee2e6', marginBottom: '2rem' }}>
          <h3 style={{ marginTop: 0 }}>Create Segment</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Name</label>
              <input type="text" value={segmentName} onChange={(e) => setSegmentName(e.target.value)} placeholder="e.g., High CTR Sports" style={{ width: '100%', padding: '0.5rem', border: "1px solid #ddd", borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Start Date</label>
              <input type="date" value={segmentStart} onChange={(e) => setSegmentStart(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: "1px solid #ddd", borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>End Date</label>
              <input type="date" value={segmentEnd} onChange={(e) => setSegmentEnd(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: "1px solid #ddd", borderRadius: 4 }} />
            </div>
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8f9fa', borderRadius: 6, border: '1px solid #e9ecef' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={showOnlyUsedIab} 
                  onChange={(e) => setShowOnlyUsedIab(e.target.checked)}
                  style={{ margin: 0 }}
                />
                Show only IAB categories with classified content
              </label>
              <div style={{ fontSize: '0.8rem', color: '#6c757d', marginTop: '0.25rem' }}>
                {showOnlyUsedIab 
                  ? 'Displaying only categories that have been used in your classified content' 
                  : 'Displaying all available IAB 3.1 categories'}
              </div>
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
                disabled={!iabOptions.length}
              >
                {iabOptions.map(({ code, display }) => (
                  <option key={code} value={code}>{display}</option>
                ))}
              </select>
              {!iabOptions.length && (
                <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 6 }}>IAB taxonomy unavailable; filters disabled.</div>
              )}
              {iabOptions.length > 0 && iabOptions.length < 50 && (
                <div style={{ fontSize: '0.75rem', background: '#fff7ed', color: '#9a3412', padding: '2px 6px', borderRadius: 6, display: 'inline-block', marginTop: 6 }}>
                  Only {iabOptions.length} IAB codes loaded. Check taxonomy source/filters.
                </div>
              )}
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
                disabled={!iabOptions.length}
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

          <div className="segment-toolbar">
            <div className="segment-toolbar__left">
              <div className="segment-toolbar__label">Saved Segments</div>
              <SavedSegmentsDropdown
                value={selectedSegmentId}
                onChange={(id) => setSelectedSegmentId(id)}
                onLoaded={(rows) => setSavedSegmentsCache(rows)}
              />
            </div>
            <div className="segment-toolbar__right">
              <button type="button" className="btn" onClick={handleViewSaved} disabled={uiDisabled.view} title={uiDisabled.viewReason}>View</button>
              <button type="button" className="btn" onClick={handleApply} disabled={uiDisabled.apply} title={uiDisabled.applyReason}>Apply</button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={uiDisabled.save} title={uiDisabled.saveReason}>Save</button>
              <button type="button" className="btn" onClick={() => setExportOpen(true)} disabled={uiDisabled.export} title={uiDisabled.exportReason}>Export</button>
            </div>
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

        {/* Table and export modal below toolbar */}
        <ExportFormatModal open={exportOpen} onClose={() => setExportOpen(false)} onConfirm={(fmt) => handleExport(fmt)} />
      </div>
    </div>
  );
};

export default SegmentBuilder;