import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginSignup from "./pages/LoginSignup";
import Dashboard from "./pages/signalsync/Dashboard";
import HomePage from "./HomePage"; // this will contain your current UI

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginSignup />} />
        <Route path="/signalsync/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
