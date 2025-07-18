// src/pages/LoginSignup.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

export default function LoginSignup() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleAuth = async () => {
    setError("");
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      navigate("/signalsync/dashboard");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-6 p-8 bg-white rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold text-center text-gray-900">
          Welcome to SignalSync by Contentive Media
        </h1>
        <p className="text-center text-gray-600">
          Unlock performance-backed contextual insights.
          <br />
          {isLogin ? "Login to continue." : "Create an account to get started."}
        </p>

        <div className="flex flex-col space-y-4 pt-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-gray-300 rounded p-2"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-gray-300 rounded p-2"
          />
          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}
          <button
            onClick={handleAuth}
            className="w-full px-4 py-2 text-white bg-blue-600 rounded-xl hover:bg-blue-700"
          >
            {isLogin ? "Login" : "Sign Up"}
          </button>
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="w-full text-sm text-blue-600 hover:underline"
          >
            {isLogin
              ? "Don't have an account? Sign up"
              : "Already have an account? Login"}
          </button>
        </div>
        <p className="text-xs text-center text-gray-400 pt-4">
          Powered by Contentive Media
        </p>
      </div>
    </div>
  );
}
