#!/bin/bash

echo "🚀 Setting up ContentiveMedia Classify App Development Environment"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found. Please install Python3 first."
    exit 1
fi

echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "🐍 Setting up Python virtual environment..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

echo "✅ Development environment setup complete!"
echo ""
echo "🔧 To start development:"
echo "  Frontend: cd frontend && npm start"
echo "  Backend:  cd backend && source venv/bin/activate && python mcp_server.py"
echo ""
echo "💡 Or use './dev-start.sh' to start both simultaneously"