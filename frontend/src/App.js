import React, { useState } from "react";
import axios from "axios";

function App() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [bulkInput, setBulkInput] = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [loadingBulk, setLoadingBulk] = useState(false);

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
    const urls = bulkInput.split("\n").map((url) => url.trim()).filter(Boolean);
    if (urls.length === 0) return;

    setLoadingBulk(true);
    try {
      const response = await axios.post(
        "https://contentive-classify-app.onrender.com/classify-bulk",
        { urls }
      );
      setBulkResults(response.data.results || []);
    } catch (error) {
      console.error("Error during bulk classification:", error);
      setBulkResults([]);
    } finally {
      setLoadingBulk(false);
    }
  };

  const exportBulkAsCSV = () => {
    if (!bulkResults.length) return;

    const headers = [
      "url",
      "iab_category",
      "iab_code",
      "iab_subcategory",
      "iab_subcode",
      "tone",
      "intent",
      "audience",
      "keywords",
      "buying_intent",
      "ad_suggestions"
    ];

    const rows = bulkResults.map(row =>
      headers.map(field => `"${(row[field] || "").toString().replace(/"/g, '""')}"`).join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bulk_results.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportBulkAsJSON = () => {
    const json = JSON.stringify(bulkResults, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bulk_results.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      {/* ✅ Logo and Tagline Block */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img
          src="/logo2.png"
          alt="Contentive Media Logo"
          style={{ maxWidth: '210px', height: 'auto', marginBottom: '-2.0rem' }}
        />
        <h1 style={{ margin: '0.2rem 0 0 0', fontSize: '1.8rem' }}>CONTENTIVE MEDIA</h1>
        <p style={{ fontSize: '1rem', color: '#444', margin: '0.5rem' }}>connecting content with intent</p>
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
          cursor: "pointer"
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
          <p><strong>Tone:</strong> {result.tone || "N/A"}</p>
          <p><strong>User Intent:</strong> {result.intent || "N/A"}</p>
          <p><strong>Audience:</strong> {result.audience || "N/A"}</p>
          <p><strong>Keywords:</strong> {Array.isArray(result.keywords) ? result.keywords.join(", ") : "N/A"}</p>
          <p><strong>Buying Intent Score:</strong> {result.buying_intent || "N/A"}</p>
          <p><strong>Suggested Ad Campaign Types:</strong> {result.ad_suggestions || "N/A"}</p>
        </div>
      )}

      {/* 📦 Bulk Classification Section */}
      <div style={{ marginTop: "4rem" }}>
        <h2>Bulk URL Classification</h2>
        <textarea
          rows={8}
          placeholder="Paste one URL per line"
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          style={{ width: "100%", padding: "1rem", fontSize: "1rem", marginBottom: "1rem" }}
        />
        <button
          onClick={handleBulkClassify}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            cursor: "pointer",
            marginBottom: "1rem"
          }}
        >
          Classify All
        </button>
        {loadingBulk && <p style={{ marginTop: "1rem" }}>Loading bulk classification...</p>}

        {bulkResults.length > 0 && (
          <div style={{ marginTop: "2rem" }}>
            <button onClick={exportBulkAsCSV} style={{ marginRight: "1rem" }}>
              Export CSV
            </button>
            <button onClick={exportBulkAsJSON}>
              Export JSON
            </button>
            <p style={{ marginTop: "0.5rem", fontStyle: "italic", color: "#666" }}>
              Export for all intent data
            </p>

            <table style={{ marginTop: "1rem", width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>IAB Category</th>
                  <th>IAB Code</th>
                  <th>Subcategory</th>
                  <th>Subcode</th>
                  <th>Tone</th>
                  <th>Intent</th>
                  <th>Audience</th>
                  <th>Keywords</th>
                  <th>Buying Intent</th>
                  <th>Ad Suggestions</th>
                </tr>
              </thead>
              <tbody>
                {bulkResults.map((r, index) => (
                  <tr key={index}>
                    <td style={{ wordBreak: "break-word", maxWidth: "200px" }}>{r.url}</td>
                    <td>{r.iab_category || "N/A"}</td>
                    <td>{r.iab_code || "N/A"}</td>
                    <td>{r.iab_subcategory || "N/A"}</td>
                    <td>{r.iab_subcode || "N/A"}</td>
                    <td>{r.tone || "N/A"}</td>
                    <td>{r.intent || "N/A"}</td>
                    <td>{r.audience || "N/A"}</td>
                    <td>{Array.isArray(r.keywords) ? r.keywords.join(", ") : "N/A"}</td>
                    <td>{r.buying_intent || "N/A"}</td>
                    <td>{r.ad_suggestions || "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
