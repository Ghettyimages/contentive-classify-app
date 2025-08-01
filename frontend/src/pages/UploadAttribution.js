import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getIdToken } from '../firebase/auth';
import axios from 'axios';

const UploadAttribution = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setError('Please select a valid CSV file');
      return;
    }

    setFile(selectedFile);
    setError('');
    setSuccess('');
    parseCSV(selectedFile);
  };

  const parseCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target.result;
        const lines = csv.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        const data = lines.slice(1, 6) // First 5 rows for preview
          .filter(line => line.trim())
          .map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            return row;
          });

        setPreviewData(data);
      } catch (err) {
        setError('Error parsing CSV file. Please check the format.');
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a CSV file first');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Read the entire file
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const csv = e.target.result;
          const lines = csv.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          
          const data = lines.slice(1) // All rows except header
            .filter(line => line.trim())
            .map(line => {
              const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
              const row = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              return row;
            });

          // Send to backend
          const token = await getIdToken();
          const response = await axios.post(
            'https://contentive-classify-app.onrender.com/upload-attribution',
            { data },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            }
          );

          setSuccess(`Successfully uploaded ${data.length} attribution records!`);
          setFile(null);
          setPreviewData([]);
        } catch (err) {
          console.error('Upload error:', err);
          setError(err.response?.data?.error || 'Error uploading attribution data');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      setError('Error processing file');
      setLoading(false);
    }
  };

  const handleMergeData = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = await getIdToken();
      const response = await axios.post(
        'https://contentive-classify-app.onrender.com/merge-attribution',
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const { statistics } = response.data;
      setSuccess(
        `Merge completed! Processed ${statistics.successful_merges} merged records, ` +
        `${statistics.attribution_only} attribution-only, ` +
        `${statistics.classification_only} classification-only records.`
      );
    } catch (err) {
      console.error('Merge error:', err);
      setError(err.response?.data?.error || 'Error merging attribution data');
    } finally {
      setLoading(false);
    }
  };

  const getFieldValue = (row, field) => {
    return row[field] || row[field.toLowerCase()] || 'N/A';
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
          Upload Attribution Data
        </p>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ 
          backgroundColor: "#f8f9fa", 
          padding: "2rem", 
          borderRadius: "8px",
          border: "1px solid #dee2e6",
          marginBottom: "2rem"
        }}>
          <h2 style={{ marginTop: 0, color: "#333" }}>Upload Attribution CSV</h2>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            Upload a CSV file containing attribution data. The file should include a header row with columns for URL and optional metrics.
          </p>

          <div style={{ marginBottom: "1.5rem" }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{
                padding: "0.5rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
                width: "100%",
                maxWidth: "400px"
              }}
            />
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

          {success && (
            <div style={{
              backgroundColor: "#d4edda",
              color: "#155724",
              padding: "0.75rem",
              borderRadius: "4px",
              marginBottom: "1rem",
              border: "1px solid #c3e6cb"
            }}>
              {success}
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: file ? "#007bff" : "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: file && !loading ? "pointer" : "not-allowed",
                fontSize: "1rem",
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? "Uploading..." : "Upload Attribution Data"}
            </button>
            
            <button
              onClick={handleMergeData}
              disabled={loading}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: !loading ? "pointer" : "not-allowed",
                fontSize: "1rem",
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? "Processing..." : "Merge with Classifications"}
            </button>
          </div>
        </div>

        {previewData.length > 0 && (
          <div style={{ 
            backgroundColor: "#fff", 
            padding: "2rem", 
            borderRadius: "8px",
            border: "1px solid #dee2e6"
          }}>
            <h3 style={{ marginTop: 0, color: "#333" }}>Preview (First 5 Rows)</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
                border: "1px solid #ddd"
              }}>
                <thead>
                  <tr>
                    {Object.keys(previewData[0] || {}).map(header => (
                      <th key={header} style={{
                        borderBottom: "2px solid #ddd",
                        backgroundColor: "#f8f9fa",
                        padding: "12px 8px",
                        textAlign: "left",
                        fontWeight: "600",
                        color: "#333"
                      }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, index) => (
                    <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                      {Object.keys(row).map(key => (
                        <td key={key} style={{
                          padding: "10px 8px",
                          borderRight: "1px solid #eee",
                          maxWidth: "200px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>
                          {row[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ 
          backgroundColor: "#e7f3ff", 
          padding: "1.5rem", 
          borderRadius: "8px",
          border: "1px solid #b3d9ff",
          marginTop: "2rem"
        }}>
          <h4 style={{ marginTop: 0, color: "#0056b3" }}>Expected CSV Format</h4>
          <p style={{ color: "#0056b3", marginBottom: "1rem" }}>
            Your CSV should include these columns (URL is required, others are optional):
          </p>
          <ul style={{ color: "#0056b3", margin: 0 }}>
            <li><strong>url</strong> - The webpage URL (required)</li>
            <li><strong>conversions</strong> - Number of conversions</li>
            <li><strong>revenue</strong> - Revenue amount</li>
            <li><strong>impressions</strong> - Number of impressions</li>
            <li><strong>clicks</strong> - Number of clicks</li>
            <li><strong>ctr</strong> - Click-through rate</li>
            <li><strong>scroll_depth</strong> - Average scroll depth percentage</li>
            <li><strong>viewability</strong> - Viewability percentage</li>
            <li><strong>time_on_page</strong> - Average time on page (seconds)</li>
            <li><strong>fill_rate</strong> - Ad fill rate percentage</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UploadAttribution;