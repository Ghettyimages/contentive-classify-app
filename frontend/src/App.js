// src/App.js

import React, { useState } from "react";
import axios from "axios";

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
      const response = await axios.post(
        "https://contentive-classify-app.onrender.com/classify-bulk",
        { urls }
      );
      setBulkResults(response.data.results || []);
    } catch (error) {
      console.error("Bulk classification error:", error);
    } finally {
      setBulkLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = [
      "url",
      "iab_category",
      "iab_code",
      "iab_subcategory",
      "iab_subcode",
      "iab_secondary_category",
      "iab_secondary_code",
      "iab_secondary_subcategory",
      "iab_secondary_subcode",
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
    const exportUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = exportUrl;
    a.download = "classification_results.csv";
    a.click();
    URL.revokeObjectURL(exportUrl);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(bulkResults, null, 2)], {
      type: "application/json",
    });
    const exportUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = exportUrl;
    a.download = "classification_results.json";
    a.click();
    URL.revokeObjectURL(exportUrl);
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <img
          src="/logo2.png"
          alt="Contentive Media Logo"
          style={{ maxWidth: "210px", height: "auto", marginBottom: "-2rem" }}
        />
        <h1 style={{ margin: "0.2rem 0 0 0", fontSize: "1.8rem" }}>
          CONTENTIVE MEDIA
        </h1>
        <p style={{ fontSize: "1rem", color: "#444", margin: "0.5rem" }}>
          connecting content with intent
        </p>
      </div>

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
          <p><strong>IAB Category:</strong> {result.iab_category} ({result.iab_code})</p>
          <p><strong>IAB Subcategory:</strong> {result.iab_subcategory} ({result.iab_subcode})</p>
          <p><strong>Secondary IAB Category:</strong> {result.iab_secondary_category} ({result.iab_secondary_code})</p>
          <p><strong>Secondary IAB Subcategory:</strong> {result.iab_secondary_subcategory} ({result.iab_secondary_subcode})</p>
          <p><strong>Tone:</strong> {result.tone}</p>
          <p><strong>User Intent:</strong> {result.intent}</p>
          <p><strong>Audience:</strong> {result.audience}</p>
          <p><strong>Keywords:</strong> {Array.isArray(result.keywords) ? result.keywords.join(", ") : result.keywords}</p>
          <p><strong>Buying Intent:</strong> {result.buying_intent}</p>
          <p><strong>Ad Suggestions:</strong> {result.ad_suggestions}</p>
        </div>
      )}

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
      {bulkLoading && <p style={{ marginTop: "1rem" }}>Loading...</p>}

      {bulkResults.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <button onClick={exportCSV} style={{ marginRight: "1rem" }}>
            Export CSV
          </button>
          <button onClick={exportJSON}>Export JSON</button>
          <p style={{ marginTop: "0.5rem", color: "#444" }}>
            export for all intent data
          </p>

          <table style={{ width: "100%", marginTop: "1rem", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>URL</th>
                <th>IAB Category</th>
                <th>IAB Subcategory</th>
                <th>Secondary IAB Category</th>
                <th>Secondary IAB Subcategory</th>
                <th>Tone</th>
                <th>Intent</th>
                <th>Audience</th>
                <th>Keywords</th>
                <th>Buying Intent</th>
                <th>Ad Suggestions</th>
              </tr>
            </thead>
            <tbody>
              {bulkResults.map((r, i) => (
                <tr key={i}>
                  <td
                    style={{
                      maxWidth: "250px",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis"
                    }}
                    title={r.url}
                  >
                    {r.url}
                  </td>
                  <td>{r.iab_category} ({r.iab_code})</td>
                  <td>{r.iab_subcategory} ({r.iab_subcode})</td>
                  <td>{r.iab_secondary_category} ({r.iab_secondary_code})</td>
                  <td>{r.iab_secondary_subcategory} ({r.iab_secondary_subcode})</td>
                  <td>{r.tone}</td>
                  <td>{r.intent}</td>
                  <td>{r.audience}</td>
                  <td>{Array.isArray(r.keywords) ? r.keywords.join(", ") : r.keywords}</td>
                  <td>{r.buying_intent}</td>
                  <td>{r.ad_suggestions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
