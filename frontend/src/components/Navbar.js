import React from 'react';
import { useAuth } from '../context/AuthContext';
import { signOutUser } from '../firebase/auth';
import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOutUser();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <nav style={{
      backgroundColor: '#f8f9fa',
      padding: '1rem 2rem',
      borderBottom: '1px solid #dee2e6',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img
          src="/logo2.png"
          alt="Contentive Media Logo"
          style={{ maxWidth: "150px", height: "auto", marginRight: "1rem" }}
        />
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#333" }}>
          Contentive Media
        </h1>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {currentUser ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                onClick={() => navigate('/')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Classify
              </button>
              <button
                onClick={() => navigate('/signalsync/upload-attribution')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Upload Attribution
              </button>
              <button
                onClick={() => navigate('/signalsync/dashboard')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6f42c1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/signalsync/segments')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#343a40',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Segments
              </button>
            </div>
            <span style={{ color: '#666' }}>
              Welcome, {currentUser.displayName || currentUser.email}
            </span>
            <button
              onClick={handleLogout}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <button
            onClick={handleLogin}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Login
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;