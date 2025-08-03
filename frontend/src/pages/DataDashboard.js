import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getIdToken } from '../firebase/auth';
import axios from 'axios';

const DataDashboard = () => {
  const { currentUser } = useAuth();
  const [mergedData, setMergedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    merged: 0,
    attributionOnly: 0,
    classificationOnly: 0
  });

  useEffect(() => {
    loadMergedData();
  }, []);

  const loadMergedData = async () => {
    setLoading(true);
    setError('');

    try {
      const token = await getIdToken();
      const response = await axios.get(
        'https://contentive-classify-app.onrender.com/merged-data',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      setMergedData(response.data.results || []);
      
      // Calculate stats
      const data = response.data.results || [];
      setStats({
        total: data.length,
        merged: data.filter(item => item.has_attribution_data && item.has_classification_data).length,
        attributionOnly: data.filter(item => item.has_attribution_data && !item.has_classification_data).length,
        classificationOnly: data.filter(item => !item.has_attribution_data && item.has_classification_data).length
      });

    } catch (err) {
      console.error('Error loading merged data:', err);
      setError(err.response?.data?.error || 'Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const getFieldValue = (item, prefix, field) => {
    const key = `${prefix}_${field}`;
    const value = item[key];
    if (value === null || value === undefined) return 'N/A';
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
          alignItems: "center"
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
          
          <span style={{ color: "#666", fontSize: "0.9rem" }}>
            Last updated: {new Date().toLocaleString()}
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
        {mergedData.length > 0 ? (
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
              fontSize: "0.85rem",
              border: "1px solid #ddd"
            }}>
              <thead>
                <tr>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>URL</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Type</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Conversions</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Revenue</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>CTR</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>IAB Category</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Tone</th>
                  <th style={{ padding: "12px 8px", borderBottom: "2px solid #ddd", backgroundColor: "#f8f9fa", textAlign: "left" }}>Intent</th>
                </tr>
              </thead>
              <tbody>
                {mergedData.map((item, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
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
                      {item.has_attribution_data && item.has_classification_data ? 
                        <span style={{ color: "#2e7d32", fontWeight: "bold" }}>Merged</span> :
                        item.has_attribution_data ? 
                        <span style={{ color: "#f57c00" }}>Attribution</span> :
                        <span style={{ color: "#c2185b" }}>Classification</span>
                      }
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {formatNumber(getFieldValue(item, 'attribution', 'conversions'))}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {formatNumber(getFieldValue(item, 'attribution', 'revenue'))}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {formatPercentage(getFieldValue(item, 'attribution', 'ctr'))}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {getFieldValue(item, 'classification', 'iab_category')}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {getFieldValue(item, 'classification', 'tone')}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {getFieldValue(item, 'classification', 'intent')}
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
            {loading ? "Loading data..." : "No merged data found. Try uploading attribution data and running the merge process."}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataDashboard;