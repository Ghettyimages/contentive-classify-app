import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getIdToken } from '../firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import axios from 'axios';

// Firebase config (same as in auth.js)
const firebaseConfig = {
  apiKey: "AIzaSyBYT9LWeL_7bsxRz3QpdZJ-YZQRDHqj6DE",
  authDomain: "signal-sync-c3681.firebaseapp.com",
  databaseURL: "https://signal-sync-c3681-default-rtdb.firebaseio.com",
  projectId: "signal-sync-c3681",
  storageBucket: "signal-sync-c3681.firebasestorage.app",
  messagingSenderId: "492313662329",
  appId: "1:492313662329:web:439b6ea5e17b31ba7615a8",
  measurementId: "G-34XPB0HHYP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DataDashboard = () => {
  const { currentUser } = useAuth();
  const [mergedData, setMergedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterCategory, setFilterCategory] = useState('');
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

  const loadMergedData = async () => {
    setLoading(true);
    setError('');

    try {
      // Fetch merged data from Firestore
      const mergedCollection = collection(db, 'merged_content_signals');
      const querySnapshot = await getDocs(mergedCollection);
      
      const data = [];
      querySnapshot.forEach((doc) => {
        const docData = doc.data();
        data.push({
          id: doc.id,
          ...docData,
          // Determine data availability
          hasClassification: !!(docData.classification_iab_category || docData.classification_tone || docData.classification_intent),
          hasAttribution: !!(docData.attribution_conversions || docData.attribution_ctr || docData.attribution_viewability)
        });
      });

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
      setError('Error loading data from Firestore');
    } finally {
      setLoading(false);
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
      return { backgroundColor: '#ffebee' }; // Light red for no data
    } else if (!item.hasClassification) {
      return { backgroundColor: '#ffebee' }; // Light red for no classification
    } else if (!item.hasAttribution) {
      return { backgroundColor: '#fff3e0' }; // Light yellow for no attribution
    }
    return {}; // Normal for merged data
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortData = (data) => {
    if (!sortField) return data;

    return [...data].sort((a, b) => {
      let aValue = getFieldValue(a, 'attribution', sortField) || getFieldValue(a, 'classification', sortField);
      let bValue = getFieldValue(b, 'attribution', sortField) || getFieldValue(b, 'classification', sortField);

      // Convert to numbers for numeric fields
      if (['ctr', 'conversions', 'viewability', 'scroll_depth', 'impressions', 'fill_rate'].includes(sortField)) {
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

  const processedData = filterData(sortData(mergedData));

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
            
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8rem",
              border: "1px solid #ddd"
            }}>
              <thead>
                <tr>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>URL</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>IAB Category</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Tone</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Intent</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Audience</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left", cursor: "pointer" }}
                      onClick={() => handleSort('ctr')}>
                    CTR {sortField === 'ctr' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left", cursor: "pointer" }}
                      onClick={() => handleSort('conversions')}>
                    Conversions {sortField === 'conversions' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left", cursor: "pointer" }}
                      onClick={() => handleSort('viewability')}>
                    Viewability {sortField === 'viewability' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Scroll Depth</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Impressions</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Fill Rate</th>
                </tr>
              </thead>
              <tbody>
                {processedData.map((item, index) => (
                  <tr key={item.id || index} style={{ borderBottom: "1px solid #eee", ...getRowStyle(item) }}>
                    <td style={{ 
                      padding: "10px 8px", 
                      borderRight: "1px solid #eee",
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {item.url}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {getFieldValue(item, 'classification', 'iab_category')}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {getFieldValue(item, 'classification', 'tone')}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {getFieldValue(item, 'classification', 'intent')}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {getFieldValue(item, 'classification', 'audience')}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {formatPercentage(getFieldValue(item, 'attribution', 'ctr'))}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {formatNumber(getFieldValue(item, 'attribution', 'conversions'))}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {formatPercentage(getFieldValue(item, 'attribution', 'viewability'))}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {formatPercentage(getFieldValue(item, 'attribution', 'scroll_depth'))}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {formatNumber(getFieldValue(item, 'attribution', 'impressions'))}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {formatPercentage(getFieldValue(item, 'attribution', 'fill_rate'))}
                    </td>
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