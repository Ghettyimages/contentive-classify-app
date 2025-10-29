import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import Classification from "./components/Classification";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import UploadAttribution from "./pages/UploadAttribution";
import DataDashboard from "./pages/DataDashboard";
import SegmentBuilder from "./pages/SegmentBuilder";

function App() {
  return (
    <AuthProvider>
      <Router>
        <div style={{ fontFamily: "Arial, sans-serif" }}>
          <Navbar />
          <Routes>
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Classification />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/signalsync/upload-attribution" 
              element={
                <ProtectedRoute>
                  <UploadAttribution />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/signalsync/dashboard" 
              element={
                <ProtectedRoute>
                  <DataDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/signalsync/segments" 
              element={
                <ProtectedRoute>
                  <SegmentBuilder />
                </ProtectedRoute>
              } 
            />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
