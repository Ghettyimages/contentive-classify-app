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
import iabTaxonomyService, { getIabLabel, getIabFullPath, getIabDisplayString } from '../utils/iabTaxonomyService';
import { rowMatchesIncludeCodes, rowExcludedByExcludeCodes, getIabUsageStats } from '../utils/iabFiltering';
import IabCategorySelector from '../components/IabCategorySelector';
import { validateSegmentIabCodes, estimateIabSelectionImpact } from '../utils/iabValidation';

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
  const [taxonomySource, setTaxonomySource] = useState(''); // 'database' | ''
  const [taxonomyCount, setTaxonomyCount] = useState(0);
  const [sourceRows, setSourceRows] = useState([]); // raw merged rows fetched for local preview
  const [isApplied, setIsApplied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [previewQuery, setPreviewQuery] = useState(null);
  const [showOnlyUsedIab, setShowOnlyUsedIab] = useState(true);
  const [validationResults, setValidationResults] = useState(null);
  const [impactEstimate, setImpactEstimate] = useState(null);

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

  // Use same field access pattern as Dashboard for consistency
  const getFieldValue = (item, prefix, field) => {
    const key = `${prefix}_${field}`;
    const value = item[key];
    if (value === null || value === undefined || value === '') return null;
    return value;
  };

  const loadSegments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/segments`, { headers: tokenHeader() });
      setSegments(res.data?.segments || []);
    } catch (e) {
      console.error('Error loading segments', e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadSegments();
      loadSourceRows();
    }
  }, [currentUser]);

  // Initialize IAB taxonomy service and load options
  useEffect(() => {
    if (currentUser) {
      // Initialize the IAB taxonomy service as soon as user is available
      iabTaxonomyService.initialize().then(() => {
        console.log('[Segment Builder] IAB taxonomy service initialized, loading options...');
        loadIabOptions();
      }).catch(err => {
        console.error('[Segment Builder] Failed to initialize IAB taxonomy service:', err);
        setTaxonomySource('error');
      });
    }
  }, [currentUser]);

  // Reload options when source rows change (to update data availability indicators)
  useEffect(() => {
    if (currentUser && iabTaxonomyService.initialized) {
      console.log('[Segment Builder] Source rows updated, reloading IAB options...');
      loadIabOptions();
    }
  }, [sourceRows, showOnlyUsedIab]);

  // Validate IAB selections and estimate impact
  useEffect(() => {
    if (iabTaxonomyService.initialized && iabOptions.length > 0) {
      // Validate selections
      const validation = validateSegmentIabCodes({
        includeCodes: includeIab,
        excludeCodes: excludeIab,
        taxonomyService: iabTaxonomyService,
        availableOptions: iabOptions
      });
      setValidationResults(validation);

      // Estimate impact if we have source data
      if (sourceRows.length > 0) {
        const impact = estimateIabSelectionImpact({
          includeCodes: includeIab,
          excludeCodes: excludeIab,
          sourceData: sourceRows,
          getFieldValue
        });
        setImpactEstimate(impact);
      }
    }
  }, [includeIab, excludeIab, iabOptions, sourceRows]);

  // HYBRID APPROACH: Show all IAB categories with indicators for which ones have data
const loadIabOptions = async () => {
  console.log('[IAB] Loading IAB categories with data availability indicators...');
  
  if (!iabTaxonomyService.initialized) {
    console.log('[IAB] Taxonomy service not yet initialized');
    setIabOptions([]);
    setTaxonomySource('loading');
    setTaxonomyCount(0);
    return;
  }
  
  // Get all available IAB categories from the taxonomy service
  const allOptions = iabTaxonomyService.getAllOptions(true); // true = include hierarchy
  
  if (allOptions.length === 0) {
    console.warn('[IAB] No categories available from taxonomy service');
    setIabOptions([]);
    setTaxonomySource('error');
    setTaxonomyCount(0);
    return;
  }
  
  // Extract IAB codes that exist in our classified data
  const codesInData = new Set();
  if (sourceRows.length > 0) {
    sourceRows.forEach(row => {
      const codes = [
        getFieldValue(row, 'classification', 'iab_code'),
        getFieldValue(row, 'classification', 'iab_subcode'),
        getFieldValue(row, 'classification', 'iab_secondary_code'),
        getFieldValue(row, 'classification', 'iab_secondary_subcode')
      ];
      
      codes.forEach(code => {
        if (code && code !== 'N/A' && typeof code === 'string') {
          codesInData.add(code.trim());
        }
      });
    });
  }
  
  console.log('[IAB] Found', codesInData.size, 'codes in classified data out of', allOptions.length, 'total categories');
  
  // Create enhanced options with data availability indicators
  const enhancedOptions = allOptions.map(opt => {
    const hasData = codesInData.has(opt.code);
    const displaySuffix = hasData ? ' ✓' : '';
    
    return {
      code: opt.code,
      label: opt.label,
      path: opt.label, // Use the full path from getAllOptions
      display: `${opt.code} (${opt.label})${displaySuffix}`,
      hasData,
      originalDisplay: opt.display
    };
  });
  
  // Filter options based on showOnlyUsedIab setting
  const filteredOptions = showOnlyUsedIab 
    ? enhancedOptions.filter(opt => opt.hasData)
    : enhancedOptions;
  
  setIabOptions(filteredOptions);
  setTaxonomySource('full-taxonomy');
  setTaxonomyCount(filteredOptions.length);
  
  console.log('[IAB] Loaded', filteredOptions.length, 'categories (showing', 
    showOnlyUsedIab ? 'only used' : 'all', 'categories)');
  console.log('[IAB] Categories with data:', enhancedOptions.filter(opt => opt.hasData).length);
  
  // Debug logging for specific codes
  const testCodes = ['IAB1', 'IAB9', 'IAB18'];
  testCodes.forEach(code => {
    const option = filteredOptions.find(opt => opt.code === code);
    if (option) {
      console.log(`[IAB Debug] ${code}:`, option);
    }
  });
};

  const loadSourceRows = async () => {
    try {
      const params = new URLSearchParams();
      params.set('fallback', '1');
      params.set('limit', '2000'); // Higher limit for segment building
      // Use same query structure as Dashboard for consistency
      const res = await axios.get(`${API_BASE_URL}/merged-data?${params.toString()}`, { headers: tokenHeader() });
      const results = res.data?.results || [];
      console.log('[DEBUG] Loaded source rows:', results.length, 'records');
      if (results.length > 0) {
        console.log('[DEBUG] Sample source row IAB fields:', {
          classification_iab_code: results[0].classification_iab_code,
          classification_iab_subcode: results[0].classification_iab_subcode,
          iab_code: results[0].iab_code,
          iab_subcode: results[0].iab_subcode
        });
        
        // Debug: Show all unique IAB codes in the dataset
        const allCodes = new Set();
        results.forEach(row => {
          [
            getFieldValue(row, 'classification', 'iab_code'),
            getFieldValue(row, 'classification', 'iab_subcode'),
            getFieldValue(row, 'classification', 'iab_secondary_code'),
            getFieldValue(row, 'classification', 'iab_secondary_subcode')
          ].forEach(code => {
            if (code && code !== 'N/A') allCodes.add(code);
          });
        });
        console.log('[DEBUG] All IAB codes in dataset:', Array.from(allCodes).sort());
        console.log('[DEBUG] Looking for IAB18:', Array.from(allCodes).filter(code => code.startsWith('IAB18')));
      }
      setSourceRows(results);
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
    return rowMatchesIncludeCodes(row, codes, getFieldValue, true); // true = hierarchical matching
  };

  const rowExcludedByIab = (row, codes) => {
    return rowExcludedByExcludeCodes(row, codes, getFieldValue, true); // true = hierarchical matching
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
    const enabled = iabOptions.length >= 1 ? 'enabled' : 'disabled';
    const dataInfo = sourceRows.length > 0 ? `${sourceRows.length} records loaded` : 'No data loaded';
    return `IAB 3.1 • ${taxonomySource} • Categories: ${taxonomyCount} • Options: ${iabOptions.length} • ${enabled} • ${dataInfo}`;
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
              <div style={{ fontWeight: 500, marginBottom: '0.5rem' }}>IAB 3.1 Category Selection</div>
              <div style={{ fontSize: '0.8rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                {showOnlyUsedIab 
                  ? 'Showing only IAB categories that exist in your classified content (✓ = has data)'
                  : 'Showing all IAB 3.1 categories (✓ = has data in your content)'
                }
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={showOnlyUsedIab}
                    onChange={(e) => {
                      setShowOnlyUsedIab(e.target.checked);
                      // Reload options with new filter
                      if (iabTaxonomyService.initialized) {
                        loadIabOptions();
                      }
                    }}
                  />
                  Show only categories with data
                </label>
                
                <button 
                  onClick={loadSourceRows} 
                  style={{ 
                    padding: '0.3rem 0.6rem', 
                    backgroundColor: '#28a745', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer', 
                    fontSize: '0.75rem'
                  }}
                >
                  🔄 Refresh ({sourceRows.length} records)
                </button>
              </div>
              
              <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                <strong>IAB Taxonomy:</strong> Using official IAB 3.1 Content Taxonomy with {iabOptions.length} categories available
              </div>
            </div>
            <IabCategorySelector
              options={iabOptions}
              selectedCodes={includeIab}
              onChange={setIncludeIab}
              label="Include IAB Categories"
              placeholder="Search categories to include..."
              maxHeight="250px"
              showDataIndicators={true}
              disabled={!iabOptions.length}
            />
            
            <IabCategorySelector
              options={iabOptions}
              selectedCodes={excludeIab}
              onChange={setExcludeIab}
              label="Exclude IAB Categories"
              placeholder="Search categories to exclude..."
              maxHeight="200px"
              showDataIndicators={true}
              disabled={!iabOptions.length}
            />
            
            {/* Validation and Impact Display */}
            {validationResults && (
              <div style={{ marginBottom: '1rem' }}>
                {/* Validation Errors */}
                {validationResults.errors.length > 0 && (
                  <div style={{ 
                    padding: '0.5rem', 
                    backgroundColor: '#f8d7da', 
                    color: '#721c24', 
                    border: '1px solid #f5c6cb', 
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    fontSize: '0.8rem'
                  }}>
                    <strong>⚠️ Validation Errors:</strong>
                    <ul style={{ margin: '0.3rem 0 0 1rem', padding: 0 }}>
                      {validationResults.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Validation Warnings */}
                {validationResults.warnings.length > 0 && (
                  <div style={{ 
                    padding: '0.5rem', 
                    backgroundColor: '#fff3cd', 
                    color: '#856404', 
                    border: '1px solid #ffeaa7', 
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    fontSize: '0.8rem'
                  }}>
                    <strong>💡 Suggestions:</strong>
                    <ul style={{ margin: '0.3rem 0 0 1rem', padding: 0 }}>
                      {validationResults.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Impact Estimate */}
                {impactEstimate && (includeIab.length > 0 || excludeIab.length > 0) && (
                  <div style={{ 
                    padding: '0.5rem', 
                    backgroundColor: '#d1ecf1', 
                    color: '#0c5460', 
                    border: '1px solid #bee5eb', 
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    fontSize: '0.8rem'
                  }}>
                    <strong>📈 Estimated Impact:</strong> ~{impactEstimate.estimatedRows.toLocaleString()} rows 
                    ({impactEstimate.percentageOfTotal}% of total data)
                    <div style={{ fontSize: '0.7rem', marginTop: '0.2rem', opacity: 0.8 }}>
                      Confidence: {impactEstimate.confidence} • {impactEstimate.note}
                    </div>
                  </div>
                )}
              </div>
            )}

            {iabOptions.length > 0 && (
              <div style={{ fontSize: '0.75rem', background: '#e8f5e8', color: '#2d5a2d', padding: '4px 8px', borderRadius: 6, marginBottom: '1rem' }}>
                📊 {iabOptions.length} categories available • {iabOptions.filter(opt => opt.hasData).length} with data
                {showOnlyUsedIab ? ' (filtered view)' : ' (complete taxonomy)'}
              </div>
            )}
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
                        {['url','primary_category','subcategory','secondary_category','secondary_subcategory','tone','intent','conversions','ctr','viewability','scroll_depth','impressions','fill_rate','last_updated'].map(h => (
                          <th key={h} style={{ padding: '8px', background: '#f8f9fa', borderBottom: '1px solid #eee', textAlign: 'left' }}>{h.replace(/_/g, ' ')}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 100).map((r, i) => {
                        // Use same field access pattern as Dashboard for consistency
                        const primaryCode = getFieldValue(r, 'classification', 'iab_code');
                        const subCode = getFieldValue(r, 'classification', 'iab_subcode');
                        const secondaryCode = getFieldValue(r, 'classification', 'iab_secondary_code');
                        const secondarySubCode = getFieldValue(r, 'classification', 'iab_secondary_subcode');
                        
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                            <td style={{ padding: '8px' }}>{r.url}</td>
                            <td style={{ padding: '8px' }}>{primaryCode || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{subCode || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{secondaryCode || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{secondarySubCode || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{getFieldValue(r, 'classification', 'tone') || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{getFieldValue(r, 'classification', 'intent') || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{getFieldValue(r, 'attribution', 'conversions') || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{getFieldValue(r, 'attribution', 'ctr') || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{getFieldValue(r, 'attribution', 'viewability') || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{getFieldValue(r, 'attribution', 'scroll_depth') || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{getFieldValue(r, 'attribution', 'impressions') || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{getFieldValue(r, 'attribution', 'fill_rate') || 'N/A'}</td>
                            <td style={{ padding: '8px' }}>{r.merged_at || r.upload_date || 'N/A'}</td>
                          </tr>
                        );
                      })}
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