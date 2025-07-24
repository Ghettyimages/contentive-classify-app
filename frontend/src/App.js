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
      <h1>Contentive Media Classifier</h1>

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
      {loading && <p>Loading...</p>}

      {result && (
        <div style={{ marginTop: "2rem" }}>
          <h3>Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
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
      {bulkLoading && <p>Loading...</p>}

      {bulkResults.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <button onClick={exportCSV} style={{ marginRight: "1rem" }}>
            Export CSV
          </button>
          <button onClick={exportJSON}>Export JSON</button>

          <table
            style={{
              width: "100%",
              marginTop: "1rem",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                {[
                  "URL",
                  "IAB Category",
                  "IAB Code",
                  "IAB Subcategory",
                  "IAB Subcode",
                  "Secondary Category",
                  "Secondary Code",
                  "Secondary Subcategory",
                  "Secondary Subcode",
                  "Tone",
                  "Intent",
                  "Audience",
                  "Keywords",
                  "Buying Intent",
                  "Ad Suggestions",
                ].map((h) => (
                  <th key={h} style={{ borderBottom: "1px solid #ccc" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bulkResults.map((r, i) => (
                <tr key={i}>
                  <td>{r.url}</td>
                  <td>{r.iab_category}</td>
                  <td>{r.iab_code}</td>
                  <td>{r.iab_subcategory}</td>
                  <td>{r.iab_subcode}</td>
                  <td>{r.iab_secondary_category}</td>
                  <td>{r.iab_secondary_code}</td>
                  <td>{r.iab_secondary_subcategory}</td>
                  <td>{r.iab_secondary_subcode}</td>
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
