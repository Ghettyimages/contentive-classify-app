import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

const ClassificationInfo = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchClassificationStats();
  }, []);

  const fetchClassificationStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/taxonomy/classification-stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        setError('Failed to fetch classification stats');
      }
    } catch (err) {
      setError('Error loading classification information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#6c757d' }}>
        Loading classification information...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '1rem', 
        backgroundColor: '#f8d7da', 
        color: '#721c24', 
        border: '1px solid #f5c6cb', 
        borderRadius: '4px' 
      }}>
        {error}
      </div>
    );
  }

  const { classification_taxonomy, enhanced_classification, prompt_info } = stats || {};

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ 
        padding: '1rem', 
        backgroundColor: enhanced_classification ? '#d4edda' : '#fff3cd',
        color: enhanced_classification ? '#155724' : '#856404',
        border: `1px solid ${enhanced_classification ? '#c3e6cb' : '#ffeaa7'}`,
        borderRadius: '4px'
      }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
          🤖 AI Classification System Status
        </h4>
        
        {enhanced_classification ? (
          <div>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              ✅ <strong>Enhanced Classification Active</strong> - Using complete IAB 3.1 taxonomy
            </div>
            
            {classification_taxonomy && (
              <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                📊 <strong>Taxonomy Coverage:</strong>
                <ul style={{ margin: '0.3rem 0 0 1rem', padding: 0 }}>
                  <li>{classification_taxonomy.total_categories} total categories</li>
                  <li>{classification_taxonomy.top_level_categories} top-level categories</li>
                  <li>{classification_taxonomy.subcategories} subcategories</li>
                  <li>Max depth: {classification_taxonomy.max_depth} levels</li>
                </ul>
              </div>
            )}
            
            {prompt_info && (
              <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                🎯 <strong>AI Prompt:</strong> {prompt_info.prompt_length.toLocaleString()} characters, 
                includes full taxonomy, updated dynamically
              </div>
            )}
            
            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
              This means your content classification now uses the complete, official IAB 3.1 Content Taxonomy 
              with proper category names and hierarchical relationships.
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              ⚠️ <strong>Basic Classification</strong> - Limited taxonomy coverage
            </div>
            <div style={{ fontSize: '0.8rem' }}>
              Consider upgrading to enhanced classification for better accuracy and coverage.
            </div>
          </div>
        )}
      </div>

      {classification_taxonomy?.sample_categories && (
        <details style={{ marginTop: '0.5rem' }}>
          <summary style={{ 
            cursor: 'pointer', 
            fontSize: '0.8rem', 
            color: '#6c757d',
            padding: '0.3rem 0'
          }}>
            View Sample Categories
          </summary>
          <div style={{ 
            padding: '0.5rem', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '4px',
            fontSize: '0.7rem',
            marginTop: '0.3rem'
          }}>
            {classification_taxonomy.sample_categories.map((category, idx) => (
              <div key={idx}>{category}</div>
            ))}
            <div style={{ marginTop: '0.3rem', fontStyle: 'italic', opacity: 0.7 }}>
              ...and {classification_taxonomy.total_categories - 10} more categories
            </div>
          </div>
        </details>
      )}
    </div>
  );
};

export default ClassificationInfo;