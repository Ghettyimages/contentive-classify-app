# ContentiveMedia Classify App

A full-stack web application for classifying web content using AI-powered analysis.

🤖 **Now with automated deployment!** Every push to main automatically deploys to production.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- Python 3.9+
- OpenAI API key
- Firebase project (for Firestore database)

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
# Edit .env and add your OPENAI_API_KEY and Firebase configuration
```

#### Firebase Setup
1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore Database
3. Go to Project Settings > Service Accounts
4. Generate a new private key (JSON file)
5. Copy the JSON content and set it as `FIREBASE_SERVICE_ACCOUNT` in your `.env` file

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
- **Database**: Firebase Firestore for caching and persistence
- **Deployment**: Automated via GitHub Actions to Render

## 🔌 API Endpoints

- `POST /classify` - Classify a single URL
- `POST /classify-bulk` - Classify multiple URLs
- `GET /recent-classifications` - Get recent classifications from Firestore
- `POST /upload-attribution` - Upload attribution CSV data (requires Firebase ID token)
- `POST /merge-attribution` - Trigger merge of attribution and classification data (requires Firebase ID token)
- `GET /merged-data` - Fetch merged attribution + classification records (requires Firebase ID token)
- `GET /api/iab31` - IAB 3.1 codes for Segment Builder as `{ version, source, codes }`

## 📱 Features

- URL-based content classification
- IAB category classification
- Content tone and intent analysis
- Keyword extraction
- Ad campaign suggestions
- **Firestore caching** - Avoid re-classifying previously analyzed URLs
- **Bulk processing** - Classify multiple URLs simultaneously
- **Data persistence** - Store all classification results with timestamps

## 🔧 Development

### Testing Firebase Integration
```bash
cd backend
python test_firebase.py
```

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

## IAB Content Taxonomy 3.1

- Backend provides a deterministic IAB 3.1 API at `GET /api/iab31` returning `{ version: '3.1', source: 'backend', codes: [...] }`.
- Fallback: a versioned JSON (`frontend/src/data/iab_content_taxonomy_3_1.v1.json`) is generated from the TSV at build time.

Build integration
- Render build runs: `node scripts/build_iab_fallback_from_tsv.mjs` to produce the fallback JSON
- Frontend build script runs the same fallback step before `react-scripts build`

Runtime behavior
- Segment Builder loads `/api/iab31` with an 8s timeout; if unavailable or too small (<200), it falls back to the bundled JSON.
- UI enables filters when at least 200 codes are available.

Configuration
- Set `IAB_TSV_PATH` (default `backend/data/IAB_Content_Taxonomy_3_1.tsv`)
- Ensure the TSV is committed or available in the Render build environment.
