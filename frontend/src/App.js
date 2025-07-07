import React, { useState } from "react";
import axios from "axios";

function App() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [bulkInput, setBulkInput] = useState("");
  const [bulkResults, setBulkResults] = useState([]);

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

    try {
      const response = await axios.post(
        "https://contentive-classify-app.onrender.com/classify-bulk",
        { urls }
      );
      setBulkResults(response.data.results || []);
    } catch (error) {
      console.error("Error during bulk classification:", error);
      setBulkResults([]);
    }
  };

  const exportBulkAsJSON = () => {
    const blob = new Blob([JSON.stringify(bulkResults, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bulk_results.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportBulkAsCSV = () => {
    if (!bulkResults.length) return;

    const headers = Object.keys(bulkResults[0]);
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

      {/* 🧠 Classify Form */}
      <h1>Classify Article by URL</h1>
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

      {loading && <p style={{ marginTop: "2rem" }}>Loading...</p>}

      {result && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Classification Results</h2>
          <p><strong>IAB Category:</strong> {result.iab_category || "N/A"}</p>
          <p><strong>IAB Subcategory:</strong> {result.iab_subcategory || "N/A"}</p>
          <p><strong>Tone:</strong> {result.tone || "N/A"}</p>
          <p><strong>User Intent:</strong> {result.intent || "N/A"}</p>
          <p><strong>Audience:</strong> {result.audience || "N/A"}</p>
          <p>
            <strong>Keywords:</strong>{" "}
            {Array.isArray(result.keywords) && result.keywords.length > 0
              ? result.keywords.join(", ")
              : "No keywords found"}
          </p>
          <p><strong>Buying Intent Score:</strong> {result.buying_intent || "N/A"}</p>
          <p><strong>Suggested Ad Campaign Types:</strong> {result.ad_suggestions || "N/A"}</p>
        </div>
      )}

      {/* 🧩 Bulk Classification Section */}
      <hr style={{ margin: "3rem 0" }} />
      <h2>Bulk URL Classification</h2>

      <textarea
        rows={8}
        placeholder="Paste one URL per line"
        value={bulkInput}
        onChange={(e) => setBulkInput(e.target.value)}
        style={{ width: "100%", padding: "1rem", fontSize: "1rem", marginBottom: "1rem" }}
      />

      <button onClick={handleBulkClassify} style={{ marginRight: "1rem" }}>
        Classify All
      </button>

      {bulkResults.length > 0 && (
        <>
          <div style={{ marginTop: "2rem" }}>
            <button onClick={exportBulkAsCSV} style={{ marginRight: "1rem" }}>
              Export CSV
            </button>
            <button onClick={exportBulkAsJSON}>Export JSON</button>
          </div>

          <table style={{ marginTop: "1rem", width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>URL</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th>Tone</th>
                <th>Intent</th>
              </tr>
            </thead>
            <tbody>
              {bulkResults.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.url}</td>
                  <td>{r.iab_category}</td>
                  <td>{r.iab_subcategory}</td>
                  <td>{r.tone}</td>
                  <td>{r.intent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default App;
