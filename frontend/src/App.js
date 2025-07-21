// src/App.js

import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleClassify = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        "https://contentive-classify-app.onrender.com/classify",
        { url }
      );
      setResult(response.data);
    } catch (error) {
      console.error("Error classifying article:", error);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkClassify = async () => {
    const urls = bulkUrls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    setBulkLoading(true);
    setBulkResults([]);

    try {
      console.log("Sending bulk request with URLs:", urls);
      const response = await axios.post(
        "https://contentive-classify-app.onrender.com/classify-bulk",
        { urls }
      );
      console.log("Bulk response:", response.data);
      console.log("Results array:", response.data.results);
      const results = response.data.results || [];
      console.log("About to set bulk results:", results);
      setBulkResults(results);
    } catch (error) {
      console.error("Bulk classification error:", error);
      console.error("Error details:", error.response?.data);
    } finally {
      setBulkLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = [
      "url",
      "iab_category",
      "iab_subcategory",
      "iab_secondary_category",
      "iab_secondary_subcategory",
      "tone",
      "intent",
      "audience",
      "keywords",
      "buying_intent",
      "ad_suggestions",
    ];
    const csvContent = [
      headers.join(","),
      ...bulkResults.map((r) =>
        headers
          .map((h) =>
            Array.isArray(r[h])
              ? `"${r[h].join("; ").replace(/"/g, '""')}"`
              : `"${(r[h] || "").toString().replace(/"/g, '""')}"`
          )
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "classification_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(bulkResults, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "classification_results.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <img
          src="/logo2.png"
          alt="Contentive Media Logo"
          style={{ maxWidth: "210px", height: "auto", marginBottom: "-2.0rem" }}
        />
        <h1 style={{ margin: "0.2rem 0 0 0", fontSize: "1.8rem" }}>
          CONTENTIVE MEDIA
        </h1>
        <p style={{ fontSize: "1rem", color: "#444", margin: "0.5rem" }}>
          connecting content with intent
        </p>
      </div>

      {/* 🧠 Single URL Classification */}
      <h2>Classify Article by URL</h2>
      <input
        type="text"
        placeholder="Enter article URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={{ width: "60%", padding: "0.5rem", fontSize: "1rem" }}
      />
      <button
        onClick={handleClassify}
        style={{
          marginLeft: "1rem",
          padding: "0.5rem 1rem",
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Classify
      </button>
      {loading && <p style={{ marginTop: "1rem" }}>Loading...</p>}

      {result && (
        <div style={{ marginTop: "2rem" }}>
          <h3>Classification Results</h3>
          <p><strong>IAB Category:</strong> {result.iab_category || "N/A"}</p>
          <p><strong>IAB Subcategory:</strong> {result.iab_subcategory || "N/A"}</p>
          <p><strong>Secondary IAB Category:</strong> {result.iab_secondary_category || "N/A"}</p>
          <p><strong>Secondary IAB Subcategory:</strong> {result.iab_secondary_subcategory || "N/A"}</p>
          <p><strong>Tone:</strong> {result.tone || "N/A"}</p>
          <p><strong>User Intent:</strong> {result.intent || "N/A"}</p>
          <p><strong>Audience:</strong> {result.audience || "N/A"}</p>
          <p><strong>Keywords:</strong> {Array.isArray(result.keywords) ? result.keywords.join(", ") : "N/A"}</p>
          <p><strong>Buying Intent Score:</strong> {result.buying_intent || "N/A"}</p>
          <p><strong>Suggested Ad Campaign Types:</strong> {result.ad_suggestions || "N/A"}</p>
        </div>
      )}

      {/* 🔁 Bulk URL Classification */}
      <hr style={{ margin: "3rem 0" }} />
      <h2>Bulk URL Classification</h2>
      <textarea
        value={bulkUrls}
        onChange={(e) => setBulkUrls(e.target.value)}
        placeholder="Paste multiple URLs here, one per line"
        rows={6}
        style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
      />
      <button
        onClick={handleBulkClassify}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Classify All
      </button>
      {bulkLoading && (
        <div className="results-container">
          <div className="loading-state">
            <p>🔄 Processing {bulkUrls.split('\n').filter(Boolean).length} URLs...</p>
            <p>This may take a few moments</p>
          </div>
        </div>
      )}

      {/* Debug: Show bulk results state */}
      {console.log("Current bulkResults state:", bulkResults)}
      {console.log("bulkResults.length:", bulkResults.length)}
      
      {bulkResults.length > 0 && (
        <div className="results-container">
          <div className="results-header">
            <h3 className="results-title">
              Classification Results ({bulkResults.length} items)
            </h3>
            <div>
              <div className="export-buttons">
                <button onClick={exportCSV} className="export-btn">
                  📊 Export CSV
                </button>
                <button onClick={exportJSON} className="export-btn secondary">
                  📄 Export JSON
                </button>
              </div>
              <p className="export-instructions">
                Export to see all intent data
              </p>
            </div>
          </div>
          
          <div className="table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Primary Category</th>
                  <th>Primary Subcategory</th>
                  <th>Tone</th>
                  <th>Intent</th>
                  <th>Keywords</th>
                </tr>
              </thead>
              <tbody>
                {bulkResults.map((r, i) => (
                  <tr key={i}>
                    <td className="url-cell" title={r.url}>
                      {r.url}
                    </td>
                    <td className="category-cell" title={r.iab_category}>
                      {r.iab_category || "—"}
                    </td>
                    <td className="subcategory-cell" title={r.iab_subcategory}>
                      {r.iab_subcategory || "—"}
                    </td>
                    <td className="tone-cell" title={r.tone}>
                      {r.tone || "—"}
                    </td>
                    <td className="intent-cell" title={r.intent}>
                      {r.intent || "—"}
                    </td>
                    <td className="keywords-cell" title={Array.isArray(r.keywords) ? r.keywords.join(", ") : r.keywords}>
                      {Array.isArray(r.keywords) ? r.keywords.join(", ") : r.keywords || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
