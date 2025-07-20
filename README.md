# ContentiveMedia Classify App

A full-stack web application for classifying web content using AI-powered analysis.

🤖 **Now with automated deployment!** Every push to main automatically deploys to production.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- Python 3.9+
- OpenAI API key

### 1. Clone and Setup
```bash
git clone <your-repo-url>
cd contentive-classify-app
chmod +x dev-setup.sh dev-start.sh
./dev-setup.sh
```

### 2. Configure Environment
```bash
cd backend
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

### 3. Start Development
```bash
./dev-start.sh
```

This will start:
- Frontend at http://localhost:3000
- Backend API at http://localhost:5000

## 🏗️ Architecture

- **Frontend**: React app with modern UI
- **Backend**: Flask API with OpenAI integration
- **Deployment**: Automated via GitHub Actions to Render

## 📱 Features

- URL-based content classification
- IAB category classification
- Content tone and intent analysis
- Keyword extraction
- Ad campaign suggestions

## 🔧 Development

### Manual Start
```bash
# Backend
cd backend
source venv/bin/activate
python mcp_server.py

# Frontend (new terminal)
cd frontend
npm start
```

### Build for Production
```bash
cd frontend
npm run build

cd ../backend
pip install -r requirements.txt
gunicorn mcp_server:app
```

## 🚀 Deployment

Automatic deployment to Render via GitHub Actions on push to `main` branch.

## 🤖 AI Assistant Integration

This project is optimized for development with AI coding assistants that can:
- Directly edit code files
- Run development commands
- Debug issues in real-time
- Set up automated workflows
