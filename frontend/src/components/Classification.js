import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config";
import { useAuth } from "../context/AuthContext";
import iabTaxonomyService, { getIabLabel, getIabFullPath, getIabDisplayString } from "../utils/iabTaxonomyService";

function Classification() {
  const { currentUser } = useAuth();
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState(null);
  const [reclassifyingIndex, setReclassifyingIndex] = useState(null);

  // Helper to get auth headers
  const getAuthHeaders = () => {
    const token = window.localStorage.getItem('fb_id_token');
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Initialize IAB service
  useEffect(() => {
    iabTaxonomyService.initialize();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuIndex(null);
    };
    
    if (openMenuIndex !== null) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuIndex]);

  const handleClassify = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/classify`,
        { url },
        { 
          timeout: 60000, // 60 second timeout for classification
          headers: getAuthHeaders()
        }
      );
      setResult(response.data);
      
      // Show success message if user is authenticated (will be saved to dashboard)
      if (currentUser) {
        console.log("✅ Classification saved to your dashboard");
      }
    } catch (error) {
      console.error("Error classifying article:", error);
      console.error("Error details:", error.response?.data || error.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkClassify = async (forceReclassify = false) => {
    const urls = bulkUrls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    setBulkLoading(true);
    setBulkResults([]);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/classify-bulk`,
        { 
          urls,
          force_reclassify: forceReclassify
        },
        { 
          timeout: 120000, // 2 minute timeout for bulk classification
          headers: getAuthHeaders()
        }
      );
      setBulkResults(response.data.results || []);
      
      // Show success message if user is authenticated
      if (currentUser) {
        const successful = response.data.results?.filter(r => !r.error)?.length || 0;
        console.log(`✅ ${successful} classifications saved to your dashboard`);
      }
    } catch (error) {
      console.error("Bulk classification error:", error);
      console.error("Bulk error details:", error.response?.data || error.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleForceReclassify = async (urlToReclassify, index) => {
    setReclassifyingIndex(index);
    setOpenMenuIndex(null);
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/classify`,
        { 
          url: urlToReclassify,
          force_reclassify: true
        },
        { 
          timeout: 60000, // 60 second timeout for single classification
          headers: getAuthHeaders()
        }
      );
      
      // Update the specific result in the array
      const newResults = [...bulkResults];
      newResults[index] = { ...response.data, url: urlToReclassify };
      setBulkResults(newResults);
      
    } catch (error) {
      console.error("Force reclassify error:", error);
      console.error("Force reclassify details:", error.response?.data || error.message);
      
      // Update with error
      const newResults = [...bulkResults];
      newResults[index] = { 
        url: urlToReclassify, 
        error: error.response?.data?.error || error.message || "Reclassification failed"
      };
      setBulkResults(newResults);
    } finally {
      setReclassifyingIndex(null);
    }
  };

  const toggleMenu = (index) => {
    setOpenMenuIndex(openMenuIndex === index ? null : index);
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
      {currentUser && (
        <div style={{ 
          backgroundColor: "#e8f5e8", 
          padding: "0.8rem", 
          borderRadius: "6px", 
          marginBottom: "1rem",
          border: "1px solid #c3e6c3"
        }}>
          <p style={{ 
            fontSize: "0.9rem", 
            color: "#2d5a2d", 
            margin: "0", 
            fontWeight: "500"
          }}>
            ✅ You're logged in - all classifications will be saved to your Dashboard for analysis and export.
          </p>
        </div>
      )}
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
             <p><strong>Primary Category:</strong> {result.iab_code ? getIabDisplayString(result.iab_code, { format: 'standard', showPath: true }) : "N/A"}</p>
             <p><strong>Subcategory:</strong> {result.iab_subcode ? getIabDisplayString(result.iab_subcode, { format: 'standard', showPath: true }) : "N/A"}</p>
             <p><strong>Secondary Category:</strong> {result.iab_secondary_code ? getIabDisplayString(result.iab_secondary_code, { format: 'standard', showPath: true }) : "N/A"}</p>
             <p><strong>Secondary Subcategory:</strong> {result.iab_secondary_subcode ? getIabDisplayString(result.iab_secondary_subcode, { format: 'standard', showPath: true }) : "N/A"}</p>
             
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
      {currentUser && (
        <div style={{ 
          backgroundColor: "#e8f5e8", 
          padding: "0.8rem", 
          borderRadius: "6px", 
          marginBottom: "1rem",
          border: "1px solid #c3e6c3"
        }}>
          <p style={{ 
            fontSize: "0.9rem", 
            color: "#2d5a2d", 
            margin: "0", 
            fontWeight: "500"
          }}>
            💾 All bulk classifications will be automatically saved to your Dashboard and merged with any attribution data.
          </p>
        </div>
      )}
      <textarea
        value={bulkUrls}
        onChange={(e) => setBulkUrls(e.target.value)}
        placeholder="Paste multiple URLs here, one per line"
        rows={6}
        style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
      />
      <div style={{ marginTop: "1rem", display: "flex", gap: "1rem" }}>
        <button
          onClick={() => handleBulkClassify(false)}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            cursor: "pointer",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px"
          }}
        >
          Classify All
        </button>
        <button
          onClick={() => handleBulkClassify(true)}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            cursor: "pointer",
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "4px"
          }}
          title="Reclassify all URLs with the new improved taxonomy and prompt"
        >
          🔄 Force Reclassify All
        </button>
      </div>
      {bulkLoading && <p>Loading...</p>}

      {bulkResults.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <button onClick={exportCSV} style={{ marginRight: "1rem" }}>
              Export CSV
            </button>
            <button onClick={exportJSON}>Export JSON</button>
          </div>
          
          <div style={{ 
            backgroundColor: "#f8f9fa", 
            padding: "1rem", 
            borderRadius: "6px", 
            marginBottom: "1rem",
            border: "1px solid #dee2e6"
          }}>
            <p style={{ 
              fontSize: "0.9rem", 
              color: "#495057", 
              margin: "0 0 0.5rem 0", 
              fontWeight: "500"
            }}>
              💡 New: Force Reclassification Available
            </p>
            <p style={{ 
              fontSize: "0.85rem", 
              color: "#666", 
              margin: "0", 
              lineHeight: "1.4"
            }}>
              Click the <strong>⋯</strong> menu next to any URL to <strong>🔄 Force Reclassify</strong> with our improved taxonomy. 
              Use this to fix old classifications that used incorrect IAB mappings.
            </p>
          </div>

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
                  "Primary Category",
                  "Subcategory", 
                  "Secondary Category",
                  "Secondary Subcategory",
                  "Tone",
                  "Intent",
                  "Audience",
                  "Keywords",
                  "Buying Intent",
                  "Ad Suggestions",
                  "Actions"
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
                   <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                     {r.iab_code ? getIabDisplayString(r.iab_code, { format: 'standard', showPath: true }) : "N/A"}
                   </td>
                                       <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {r.iab_subcode ? getIabDisplayString(r.iab_subcode, { format: 'standard', showPath: true }) : "N/A"}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {r.iab_secondary_code ? getIabDisplayString(r.iab_secondary_code, { format: 'standard', showPath: true }) : "N/A"}
                    </td>
                    <td style={{ padding: "10px 8px", borderRight: "1px solid #eee" }}>
                      {r.iab_secondary_subcode ? getIabDisplayString(r.iab_secondary_subcode, { format: 'standard', showPath: true }) : "N/A"}
                    </td>
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
                     borderRight: "1px solid #eee",
                     maxWidth: "150px",
                     overflow: "hidden",
                     textOverflow: "ellipsis",
                     whiteSpace: "nowrap"
                   }}>{r.ad_suggestions}</td>
                   <td style={{ 
                     padding: "10px 8px",
                     position: "relative",
                     width: "60px",
                     textAlign: "center"
                   }}>
                     {reclassifyingIndex === i ? (
                       <div style={{ 
                         fontSize: "0.8rem", 
                         color: "#666",
                         fontStyle: "italic" 
                       }}>
                         Reclassifying...
                       </div>
                     ) : (
                       <div style={{ position: "relative" }}>
                         <button
                           onClick={() => toggleMenu(i)}
                           style={{
                             background: "none",
                             border: "none",
                             fontSize: "1.2rem",
                             cursor: "pointer",
                             padding: "4px 8px",
                             borderRadius: "4px",
                             color: "#666"
                           }}
                           onMouseEnter={(e) => e.target.style.backgroundColor = "#f0f0f0"}
                           onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                         >
                           ⋯
                         </button>
                         {openMenuIndex === i && (
                           <div style={{
                             position: "absolute",
                             top: "100%",
                             right: "0",
                             backgroundColor: "white",
                             border: "1px solid #ddd",
                             borderRadius: "4px",
                             boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                             zIndex: 1000,
                             minWidth: "160px"
                           }}>
                             <button
                               onClick={() => handleForceReclassify(r.url, i)}
                               style={{
                                 display: "block",
                                 width: "100%",
                                 padding: "8px 12px",
                                 border: "none",
                                 background: "none",
                                 textAlign: "left",
                                 cursor: "pointer",
                                 fontSize: "0.85rem",
                                 color: "#333"
                               }}
                               onMouseEnter={(e) => e.target.style.backgroundColor = "#f8f9fa"}
                               onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                             >
                               🔄 Force Reclassify
                             </button>
                             <button
                               onClick={() => navigator.clipboard.writeText(r.url)}
                               style={{
                                 display: "block",
                                 width: "100%",
                                 padding: "8px 12px",
                                 border: "none",
                                 background: "none",
                                 textAlign: "left",
                                 cursor: "pointer",
                                 fontSize: "0.85rem",
                                 color: "#333",
                                 borderTop: "1px solid #eee"
                               }}
                               onMouseEnter={(e) => e.target.style.backgroundColor = "#f8f9fa"}
                               onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                             >
                               📋 Copy URL
                             </button>
                           </div>
                         )}
                       </div>
                     )}
                   </td>
                 </tr>
               ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Classification;