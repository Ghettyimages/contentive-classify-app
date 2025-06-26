import React, { useState } from "react";
import axios from "axios";

function App() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
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
    </div>
  );
}

export default App;
