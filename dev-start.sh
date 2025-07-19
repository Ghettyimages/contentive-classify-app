#!/bin/bash

echo "🚀 Starting ContentiveMedia Classify App Development Servers"

# Function to kill background processes on exit
cleanup() {
    echo "🛑 Stopping development servers..."
    kill $(jobs -p) 2>/dev/null
    exit
}

# Set up cleanup on script exit
trap cleanup EXIT INT TERM

# Start backend server in background
echo "🐍 Starting backend server..."
cd backend
if [ -d "venv" ]; then
    source venv/bin/activate
fi
python mcp_server.py &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Start frontend server in background
echo "⚛️  Starting frontend server..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "🎉 Both servers are starting!"
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend:  http://localhost:5000"
echo ""
echo "💡 Press Ctrl+C to stop both servers"

# Wait for background processes
wait