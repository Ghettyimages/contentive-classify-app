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
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <img
          src="/logo2.png"
          alt="Contentive Media Logo"
          style={{ maxWidth: "210px", height: "auto", marginBottom: "-2.0rem" }}
        />
        <h1 style={{ margin: "0.2rem 0 0 0", fontSize: "1.8rem" }}>CONTENTIVE MEDIA</h1>
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
      {loading && <p>Loading...</p>}

      {result && (
        <div style={{ marginTop: "2rem" }}>
          <h3>Classification Results</h3>
                     <div style={{ 
             backgroundColor: "#f9f9f9", 
             padding: "1.5rem", 
             borderRadius: "8px",
             border: "1px solid #ddd"
           }}>
             <p><strong>IAB Category:</strong> {result.iab_category ? result.iab_category.replace(/^IAB\d+\s*\(/, '').replace(/\)$/, '') : "N/A"}</p>
             <p><strong>IAB Code:</strong> {result.iab_code || "N/A"}</p>
             <p><strong>IAB Subcategory:</strong> {result.iab_subcategory ? result.iab_subcategory.replace(/^IAB\d+-\d+\s*\(/, '').replace(/\)$/, '') : "N/A"}</p>
             <p><strong>IAB Subcode:</strong> {result.iab_subcode || "N/A"}</p>
             <p><strong>Secondary Category:</strong> {result.iab_secondary_category ? result.iab_secondary_category.replace(/^IAB\d+\s*\(/, '').replace(/\)$/, '') : "N/A"}</p>
             <p><strong>Secondary Code:</strong> {result.iab_secondary_code || "N/A"}</p>
             <p><strong>Secondary Subcategory:</strong> {result.iab_secondary_subcategory ? result.iab_secondary_subcategory.replace(/^IAB\d+-\d+\s*\(/, '').replace(/\)$/, '') : "N/A"}</p>
             <p><strong>Secondary Subcode:</strong> {result.iab_secondary_subcode || "N/A"}</p>
             <p><strong>Tone:</strong> {result.tone || "N/A"}</p>
             <p><strong>Intent:</strong> {result.intent || "N/A"}</p>
             <p><strong>Audience:</strong> {result.audience || "N/A"}</p>
             <p><strong>Keywords:</strong> {Array.isArray(result.keywords) ? result.keywords.join(", ") : result.keywords || "N/A"}</p>
             <p><strong>Buying Intent:</strong> {result.buying_intent || "N/A"}</p>
             <p><strong>Ad Suggestions:</strong> {result.ad_suggestions || "N/A"}</p>
           </div>
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
          <p style={{ 
            fontSize: "0.9rem", 
            color: "#666", 
            margin: "0.5rem 0", 
            fontStyle: "italic" 
          }}>
            Export for full intent data
          </p>

          <table
            style={{
              width: "100%",
              marginTop: "1rem",
              borderCollapse: "collapse",
              fontSize: "0.85rem",
              border: "1px solid #ddd",
              backgroundColor: "#fff",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
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
                   <th key={h} style={{ 
                     borderBottom: "2px solid #ddd",
                     backgroundColor: "#f8f9fa",
                     padding: "12px 8px",
                     textAlign: "left",
                     fontWeight: "600",
                     color: "#333",
                     fontSize: "0.8rem"
                   }}>
                     {h}
                   </th>
                 ))}
              </tr>
            </thead>
            <tbody>
                             {bulkResults.map((r, i) => (
                 <tr key={i} style={{ 
                   borderBottom: "1px solid #eee",
                   "&:hover": { backgroundColor: "#f9f9f9" }
                 }}>
                   <td style={{ 
                     padding: "10px 8px", 
                     borderRight: "1px solid #eee",
                     maxWidth: "200px",
                     overflow: "hidden",
                     textOverflow: "ellipsis",
                     whiteSpace: "nowrap"
                   }}>{r.url}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.iab_category ? r.iab_category.replace(/^IAB\d+\s*\(/, '').replace(/\)$/, '') : "N/A"}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.iab_code}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.iab_subcategory ? r.iab_subcategory.replace(/^IAB\d+-\d+\s*\(/, '').replace(/\)$/, '') : "N/A"}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.iab_subcode}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.iab_secondary_category ? r.iab_secondary_category.replace(/^IAB\d+\s*\(/, '').replace(/\)$/, '') : "N/A"}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.iab_secondary_code}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.iab_secondary_subcategory ? r.iab_secondary_subcategory.replace(/^IAB\d+-\d+\s*\(/, '').replace(/\)$/, '') : "N/A"}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.iab_secondary_subcode}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.tone}</td>
                   <td style={{ 
                     padding: "10px 8px", 
                     borderRight: "1px solid #eee",
                     maxWidth: "150px",
                     overflow: "hidden",
                     textOverflow: "ellipsis",
                     whiteSpace: "nowrap"
                   }}>{r.intent}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.audience}</td>
                   <td style={{ 
                     padding: "10px 8px", 
                     borderRight: "1px solid #eee",
                     maxWidth: "120px",
                     overflow: "hidden",
                     textOverflow: "ellipsis",
                     whiteSpace: "nowrap"
                   }}>{Array.isArray(r.keywords) ? r.keywords.join(", ") : r.keywords}</td>
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>{r.buying_intent}</td>
                   <td style={{ 
                     padding: "10px 8px",
                     maxWidth: "150px",
                     overflow: "hidden",
                     textOverflow: "ellipsis",
                     whiteSpace: "nowrap"
                   }}>{r.ad_suggestions}</td>
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
