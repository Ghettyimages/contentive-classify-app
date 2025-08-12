import os
import json
from datetime import datetime, timedelta
from urllib.parse import urlparse
from flask import Flask, request, jsonify, Response
from flask_cors import CORS, cross_origin
from newspaper import Article
from bs4 import BeautifulSoup
import requests
from openai import OpenAI
from firebase_service import get_firebase_service
import firebase_admin
from firebase_admin import auth
from merge_attribution_with_classification import merge_attribution_data

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize Firebase Admin SDK on startup
print("🚀 Initializing Firebase Admin SDK on app startup...")
try:
    from firebase_service import get_firebase_service
    # Initialize Firebase service
    firebase_service = get_firebase_service()
    print("✅ Firebase Admin SDK initialized successfully on startup")
except Exception as e:
    print(f"❌ Error initializing Firebase on startup: {e}")
    import traceback
    print(f"📋 Full traceback: {traceback.format_exc()}")

# Set up OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MAX_TOKENS = 3500

# Prompt used to instruct GPT
SYSTEM_PROMPT = """
You are a content classification engine that analyzes article text and returns structured metadata for ad targeting.

Return only a valid JSON object with the following fields:

{
  "iab_category": "IAB9 (Sports)",
  "iab_code": "IAB9",
  "iab_subcategory": "IAB9-5 (Football)",
  "iab_subcode": "IAB9-5",
  "iab_secondary_category": "IAB1 (Arts & Entertainment)",
  "iab_secondary_code": "IAB1",
  "iab_secondary_subcategory": "IAB1-6 (Celebrity Fan/Gossip)",
  "iab_secondary_subcode": "IAB1-6",
  "tone": "Descriptive, Positive",
  "intent": "To provide an in-depth breakdown of the topic for readers researching the subject.",
  "audience": "Fans of the topic, general readers interested in the category.",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "buying_intent": "Medium – the article includes contextually relevant mentions of commercial categories, but is not explicitly promotional.",
  "ad_suggestions": "Brand sponsorship, contextual display ads, affiliate commerce"
}

Rules:
- Use IAB Tech Lab Content Taxonomy 3.1
- If no secondary category fits, set the secondary fields to null
- Return strict JSON only — no comments, markdown, or extra text
"""

def normalize_url(url: str) -> str:
    """Normalize URLs for consistent matching: lowercase, strip query/hash, drop trailing slash (except root)."""
    try:
        parsed = urlparse(url.strip())
        scheme = (parsed.scheme or 'http').lower()
        netloc = (parsed.netloc or '').lower()
        path = (parsed.path or '')
        # Drop query and fragment
        path = path.split('#')[0]
        # Remove trailing slash except if path is just '/'
        if path.endswith('/') and path != '/':
            path = path[:-1]
        normalized = f"{scheme}://{netloc}{path}"
        return normalized
    except Exception:
        return (url or '').strip().lower()

def _verify_and_get_user_id() -> str:
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        raise PermissionError('Missing or invalid authorization header')
    token = auth_header.split('Bearer ')[1]
    decoded_token = auth.verify_id_token(token)
    return decoded_token['uid']

def _map_sort_param(sort_param: str) -> str:
    sort_map = {
        'click_through_rate': 'attribution_ctr',
        'ctr': 'attribution_ctr',
        'conversions': 'attribution_conversions',
        'viewability': 'attribution_viewability',
        'scroll_depth': 'attribution_scroll_depth',
        'impressions': 'attribution_impressions',
        'fill_rate': 'attribution_fill_rate',
    }
    return sort_map.get((sort_param or '').lower(), 'attribution_conversions')

def _extract_numeric(value, reverse: bool):
    try:
        return float(value)
    except Exception:
        return float('-inf') if reverse else float('inf')

def _activation_fields(record: dict) -> dict:
    return {
        'url': record.get('url'),
        'iab_code': record.get('classification_iab_code'),
        'iab_subcode': record.get('classification_iab_subcode'),
        'iab_secondary_code': record.get('classification_iab_secondary_code'),
        'iab_secondary_subcode': record.get('classification_iab_secondary_subcode'),
        'tone': record.get('classification_tone'),
        'intent': record.get('classification_intent'),
        'conversions': record.get('attribution_conversions'),
        'ctr': record.get('attribution_ctr'),
        'viewability': record.get('attribution_viewability'),
        'scroll_depth': record.get('attribution_scroll_depth'),
        'impressions': record.get('attribution_impressions'),
        'fill_rate': record.get('attribution_fill_rate'),
        'last_updated': record.get('merged_at') or record.get('classification_timestamp') or record.get('uploaded_at'),
    }

def _fetch_merged_with_filters(start_str: str, end_str: str, include_iab: list, exclude_iab: list, sort_param: str, order: str, limit: int) -> list:
    firebase_service = get_firebase_service()
    coll = firebase_service.db.collection('merged_content_signals')

    # Date range defaults
    now = datetime.utcnow()
    if not start_str and not end_str:
        start_str = (now - timedelta(days=30)).strftime('%Y-%m-%d')
        end_str = now.strftime('%Y-%m-%d')

    def to_iso_bounds(date_str: str, is_start: bool) -> str:
        return f"{date_str}T00:00:00Z" if is_start else f"{date_str}T23:59:59Z"

    start_iso = to_iso_bounds(start_str, True) if start_str else None
    end_iso = to_iso_bounds(end_str, False) if end_str else None

    query = coll
    if start_iso:
        query = query.where('upload_date', '>=', start_iso)
    if end_iso:
        query = query.where('upload_date', '<=', end_iso)

    docs = query.stream()
    records = [doc.to_dict() for doc in docs]

    # IAB include/exclude in-memory filtering
    def matches_iab(rec: dict) -> bool:
        primary = (rec.get('classification_iab_code') or '')
        secondary = (rec.get('classification_iab_secondary_code') or '')
        if include_iab:
            if not (primary in include_iab or secondary in include_iab):
                return False
        if exclude_iab:
            if primary in exclude_iab or secondary in exclude_iab:
                return False
        return True

    if include_iab or exclude_iab:
        records = [r for r in records if matches_iab(r)]

    # Sort
    field = _map_sort_param(sort_param)
    reverse = (order or 'desc').lower() != 'asc'
    records.sort(key=lambda r: _extract_numeric(r.get(field), reverse), reverse=reverse)
    return records[:limit]

@app.route("/")
def index():
    return "MCP Server is running."

@app.route("/debug-env", methods=["GET"])
def debug_env():
    """Debug endpoint to check environment variables."""
    try:
        service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        openai_key = os.getenv("OPENAI_API_KEY")
        
        # Check Firebase initialization
        firebase_initialized = len(firebase_admin._apps) > 0 if hasattr(firebase_admin, '_apps') else False
        
        return jsonify({
            "firebase_service_account_set": bool(service_account),
            "firebase_service_account_length": len(service_account) if service_account else 0,
            "openai_key_set": bool(openai_key),
            "firebase_apps_initialized": len(firebase_admin._apps) if hasattr(firebase_admin, '_apps') else 0,
            "firebase_initialized": firebase_initialized
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/merged-data", methods=["GET"])
def get_merged_data():
    """Get merged attribution and classification data with optional date range and KPI sorting."""
    try:
        # Verify Firebase token
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Missing or invalid authorization header"}), 401

        token = auth_header.split('Bearer ')[1]
        try:
            decoded_token = auth.verify_id_token(token)
            user_id = decoded_token['uid']
        except Exception as e:
            print(f"Token verification failed: {e}")
            return jsonify({"error": "Invalid authentication token"}), 401

        # Parse query params
        start_str = request.args.get('start')  # YYYY-MM-DD
        end_str = request.args.get('end')      # YYYY-MM-DD
        sort_param = request.args.get('sort')
        order = request.args.get('order', 'desc').lower()

        now = datetime.utcnow()
        if not start_str and not end_str:
            # Default: last 30 days
            default_start = (now - timedelta(days=30)).strftime('%Y-%m-%d')
            default_end = now.strftime('%Y-%m-%d')
            start_str, end_str = default_start, default_end

        def to_iso_bounds(date_str: str, is_start: bool) -> str:
            return f"{date_str}T00:00:00Z" if is_start else f"{date_str}T23:59:59Z"

        start_iso = to_iso_bounds(start_str, True) if start_str else None
        end_iso = to_iso_bounds(end_str, False) if end_str else None

        # Fetch from Firestore with basic date filtering when possible
        firebase_service = get_firebase_service()
        coll = firebase_service.db.collection('merged_content_signals')
        query = coll
        if start_iso:
            query = query.where('upload_date', '>=', start_iso)
        if end_iso:
            query = query.where('upload_date', '<=', end_iso)

        try:
            docs = query.stream()
            results = []
            for doc in docs:
                data = doc.to_dict()
                results.append(data)

            # Server-side sorting
            sort_map = {
                'click_through_rate': 'attribution_ctr',
                'conversions': 'attribution_conversions',
                'viewability': 'attribution_viewability',
                'scroll_depth': 'attribution_scroll_depth',
                'impressions': 'attribution_impressions',
                'fill_rate': 'attribution_fill_rate',
            }
            sort_field = sort_map.get(sort_param or 'conversions', 'attribution_conversions')
            reverse = (order != 'asc')

            def extract_numeric(v):
                try:
                    return float(v)
                except Exception:
                    return float('-inf') if reverse else float('inf')

            results.sort(key=lambda r: extract_numeric(r.get(sort_field)), reverse=reverse)

            print(f"/merged-data: returned {len(results)} records, date filter: start={start_str}, end={end_str}")
            return jsonify({
                "results": results,
                "total_count": len(results)
            })
        except Exception as e:
            print(f"Error fetching merged data: {e}")
            return jsonify({"error": f"Error fetching data: {str(e)}"}), 500

    except Exception as e:
        print(f"Error in merged-data endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/export-activation", methods=["GET"])
@cross_origin(origins=["https://contentivemedia.com"])  # Allow this explicit origin
def export_activation():
    try:
        # Auth
        user_id = _verify_and_get_user_id()

        # Params
        start_str = request.args.get('start')
        end_str = request.args.get('end')
        sort_by = request.args.get('sort_by') or request.args.get('sort') or 'conversions'
        order = request.args.get('order', 'desc')
        limit = min(int(request.args.get('limit', 5000)), 20000)
        fmt = (request.args.get('format') or 'csv').lower()
        include_iab = [s.strip() for s in (request.args.get('include_iab') or '').split(',') if s.strip()]
        exclude_iab = [s.strip() for s in (request.args.get('exclude_iab') or '').split(',') if s.strip()]

        records = _fetch_merged_with_filters(start_str, end_str, include_iab, exclude_iab, sort_by, order, limit)
        rows = [_activation_fields(r) for r in records]
        print(f"/export-activation -> rows={len(rows)} format={fmt}")

        if fmt == 'json':
            return jsonify({
                'rows': rows,
                'count': len(rows)
            })
        # CSV
        headers = [
            'url', 'iab_code', 'iab_subcode', 'iab_secondary_code', 'iab_secondary_subcode',
            'tone', 'intent', 'conversions', 'ctr', 'viewability', 'scroll_depth', 'impressions', 'fill_rate', 'last_updated'
        ]
        def to_csv_line(values):
            def esc(v):
                s = '' if v is None else str(v)
                s = s.replace('"', '""')
                return f'"{s}"'
            return ','.join(esc(v) for v in values)

        csv_lines = [','.join(headers)]
        for row in rows:
            csv_lines.append(to_csv_line([row.get(h) for h in headers]))
        csv_data = '\n'.join(csv_lines)
        return Response(csv_data, mimetype='text/csv', headers={
            'Content-Disposition': f'attachment; filename=activation_export_{datetime.utcnow().date().isoformat()}.csv'
        })
    except PermissionError as pe:
        return jsonify({'error': str(pe)}), 401
    except Exception as e:
        print(f"Error in export-activation: {e}")
        return jsonify({'error': str(e)}), 500

# --------------- Segments Endpoints ---------------

def _rules_to_params(rules: dict):
    start, end = None, None
    if rules.get('date_range') and isinstance(rules['date_range'], (list, tuple)) and len(rules['date_range']) == 2:
        start, end = rules['date_range']
    include_iab = rules.get('include_iab') or []
    exclude_iab = rules.get('exclude_iab') or []
    sort_by = rules.get('sort_by') or 'conversions'
    order = rules.get('order') or 'desc'
    # KPI thresholds
    kpi_filters = rules.get('kpi_filters') or {}
    return start, end, include_iab, exclude_iab, sort_by, order, kpi_filters

def _apply_kpi_filters(records: list, kpi_filters: dict) -> list:
    field_map = {
        'ctr': 'attribution_ctr',
        'viewability': 'attribution_viewability',
        'scroll_depth': 'attribution_scroll_depth',
        'conversions': 'attribution_conversions',
        'impressions': 'attribution_impressions',
        'fill_rate': 'attribution_fill_rate',
    }
    def pass_filters(r: dict) -> bool:
        for k, cond in kpi_filters.items():
            field = field_map.get(k)
            if not field:
                continue
            val = r.get(field)
            try:
                valf = float(val) if val is not None else None
            except Exception:
                valf = None
            if valf is None:
                return False
            if 'gte' in cond and not (valf >= float(cond['gte'])):
                return False
            if 'lte' in cond and not (valf <= float(cond['lte'])):
                return False
        return True
    return [r for r in records if pass_filters(r)]

@app.route('/segments', methods=['POST'])
@cross_origin(origins=["https://contentivemedia.com"])  # Allow explicit origin
def create_segment():
    try:
        user_id = _verify_and_get_user_id()
        payload = request.get_json(force=True) or {}
        name = (payload.get('name') or '').strip()
        rules = payload.get('rules') or {}
        if not name:
            return jsonify({'error': 'name is required'}), 400
        now = datetime.utcnow()
        doc = {
            'name': name,
            'owner_uid': user_id,
            'created_at': now,
            'updated_at': now,
            'rules': rules
        }
        db = get_firebase_service().db
        ref = db.collection('segments').add(doc)
        seg_id = ref[1].id if isinstance(ref, tuple) else ref.id
        return jsonify({'id': seg_id, **doc}), 201
    except PermissionError as pe:
        return jsonify({'error': str(pe)}), 401
    except Exception as e:
        print(f"Error creating segment: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/segments', methods=['GET'])
def list_segments():
    try:
        user_id = _verify_and_get_user_id()
        db = get_firebase_service().db
        docs = db.collection('segments').where('owner_uid', '==', user_id).stream()
        segments = []
        for d in docs:
            data = d.to_dict()
            data['id'] = d.id
            segments.append(data)
        return jsonify({'segments': segments, 'count': len(segments)})
    except PermissionError as pe:
        return jsonify({'error': str(pe)}), 401
    except Exception as e:
        print(f"Error listing segments: {e}")
        return jsonify({'error': str(e)}), 500

def _get_segment_owned(seg_id: str, owner_uid: str) -> dict:
    db = get_firebase_service().db
    doc = db.collection('segments').document(seg_id).get()
    if not doc.exists:
        raise ValueError('segment not found')
    data = doc.to_dict()
    if data.get('owner_uid') != owner_uid:
        raise PermissionError('forbidden')
    return data

def _fetch_records_for_segment(rules: dict, limit: int) -> list:
    start, end, include_iab, exclude_iab, sort_by, order, kpi_filters = _rules_to_params(rules)
    records = _fetch_merged_with_filters(start, end, include_iab, exclude_iab, sort_by, order, limit)
    if kpi_filters:
        records = _apply_kpi_filters(records, kpi_filters)
    return records[:limit]

@app.route('/segments/<seg_id>/preview', methods=['GET'])
def preview_segment(seg_id):
    try:
        user_id = _verify_and_get_user_id()
        limit = min(int(request.args.get('limit', 100)), 20000)
        seg = _get_segment_owned(seg_id, user_id)
        records = _fetch_records_for_segment(seg.get('rules') or {}, limit)
        rows = [_activation_fields(r) for r in records]
        return jsonify({'rows': rows, 'count': len(rows)})
    except PermissionError as pe:
        return jsonify({'error': str(pe)}), 401
    except Exception as e:
        print(f"Error previewing segment: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/segments/<seg_id>/export', methods=['GET'])
@cross_origin(origins=["https://contentivemedia.com"])  # Allow explicit origin
def export_segment(seg_id):
    try:
        user_id = _verify_and_get_user_id()
        limit = min(int(request.args.get('limit', 20000)), 20000)
        fmt = (request.args.get('format') or 'csv').lower()
        seg = _get_segment_owned(seg_id, user_id)
        records = _fetch_records_for_segment(seg.get('rules') or {}, limit)
        rows = [_activation_fields(r) for r in records]
        print(f"/segments/{seg_id}/export -> rows={len(rows)} format={fmt}")
        if fmt == 'json':
            return jsonify({'rows': rows, 'count': len(rows)})
        headers = [
            'url', 'iab_code', 'iab_subcode', 'iab_secondary_code', 'iab_secondary_subcode',
            'tone', 'intent', 'conversions', 'ctr', 'viewability', 'scroll_depth', 'impressions', 'fill_rate', 'last_updated'
        ]
        def to_csv_line(values):
            def esc(v):
                s = '' if v is None else str(v)
                s = s.replace('"', '""')
                return f'"{s}"'
            return ','.join(esc(v) for v in values)
        csv_lines = [','.join(headers)]
        for row in rows:
            csv_lines.append(to_csv_line([row.get(h) for h in headers]))
        csv_data = '\n'.join(csv_lines)
        return Response(csv_data, mimetype='text/csv', headers={
            'Content-Disposition': f'attachment; filename=segment_{seg_id}_export_{datetime.utcnow().date().isoformat()}.csv'
        })
    except PermissionError as pe:
        return jsonify({'error': str(pe)}), 401
    except Exception as e:
        print(f"Error exporting segment: {e}")
        return jsonify({'error': str(e)}), 500

@app.route("/test-auth", methods=["POST"])
def test_auth():
    """Test endpoint to verify Firebase authentication."""
    try:
        # Verify Firebase token
        auth_header = request.headers.get('Authorization')
        print(f"Test - Auth header received: {auth_header[:50] if auth_header else 'None'}...")
        
        if not auth_header or not auth_header.startswith('Bearer '):
            print("Test - Missing or invalid authorization header format")
            return jsonify({"error": "Missing or invalid authorization header"}), 401
        
        token = auth_header.split('Bearer ')[1]
        print(f"Test - Token extracted: {token[:20]}...")
        
        try:
            decoded_token = auth.verify_id_token(token)
            user_id = decoded_token['uid']
            email = decoded_token.get('email', 'No email')
            print(f"Test - Token verified successfully for user: {user_id} ({email})")
            return jsonify({
                "success": True,
                "user_id": user_id,
                "email": email,
                "message": "Authentication successful"
            })
        except Exception as e:
            print(f"Test - Token verification failed: {e}")
            return jsonify({"error": f"Invalid authentication token: {str(e)}"}), 401
            
    except Exception as e:
        print(f"Test - Error in test-auth endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/classify", methods=["POST"])
def classify():
    data = request.json
    url = data.get("url")
    if not url:
        return jsonify({"error": "Missing URL"}), 400

    try:
        print(f"Starting classification for URL: {url}")
        result = classify_url(url)
        print(f"Classification completed successfully for: {url}")
        return jsonify(result)
    except Exception as e:
        print(f"Error in classify endpoint: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route("/classify-bulk", methods=["POST"])
def classify_bulk():
    data = request.json
    urls = data.get("urls", [])
    results = []

    for url in urls:
        try:
            result = classify_url(url)
            result["url"] = url
            results.append(result)
        except Exception as e:
            results.append({
                "url": url,
                "error": str(e)
            })

    return jsonify({"results": results})

@app.route("/recent-classifications", methods=["GET"])
def get_recent_classifications():
    """Get recent classifications from Firestore."""
    try:
        limit = request.args.get("limit", 10, type=int)
        if limit > 100:  # Prevent excessive queries
            limit = 100
            
        firebase_service = get_firebase_service()
        results = firebase_service.get_recent_classifications(limit)
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/upload-attribution", methods=["POST"])
def upload_attribution():
    """Upload attribution data from CSV."""
    try:
        # Verify Firebase token
        auth_header = request.headers.get('Authorization')
        print(f"Auth header received: {auth_header[:50] if auth_header else 'None'}...")
        
        if not auth_header or not auth_header.startswith('Bearer '):
            print("Missing or invalid authorization header format")
            return jsonify({"error": "Missing or invalid authorization header"}), 401
        
        token = auth_header.split('Bearer ')[1]
        print(f"Token extracted: {token[:20]}...")
        
        try:
            decoded_token = auth.verify_id_token(token)
            user_id = decoded_token['uid']
            print(f"Token verified successfully for user: {user_id}")
        except Exception as e:
            print(f"Token verification failed: {e}")
            return jsonify({"error": "Invalid authentication token"}), 401
        
        # Get data from request
        print(f"🔍 Raw request data: {request.get_data()}")
        print(f"🔍 Request content type: {request.content_type}")
        print(f"🔍 Request headers: {dict(request.headers)}")
        
        data = request.json.get('data', [])
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        print(f"📊 Received {len(data)} records from CSV upload")
        if data:
            print(f"📊 Sample record structure: {list(data[0].keys())}")
            print(f"📊 Sample CTR value: '{data[0].get('ctr', 'NOT_FOUND')}' ({type(data[0].get('ctr'))})")
            print(f"📊 Full first record for debugging: {data[0]}")
        
        # Validate and save each record
        firebase_service = get_firebase_service()
        saved_count = 0
        classified_count = 0
        errors = []
        
        for i, record in enumerate(data):
            try:
                # Validate required fields
                url = record.get('url', '').strip()
                if not url:
                    errors.append(f"Row {i+1}: Missing required 'url' field")
                    continue
                
                # Check if classification exists for this URL and user
                existing_classification = firebase_service.get_classification_by_url(url)
                
                # If no classification exists, classify the URL
                if not existing_classification:
                    try:
                        print(f"Auto-classifying URL: {url}")
                        classification_result = classify_url(url)
                        
                        if classification_result and 'error' not in classification_result:
                            # Save classification with user_id
                            classification_data = {
                                **classification_result,
                                'user_id': user_id,
                                'url_normalized': normalize_url(url),
                                'timestamp': firebase_service._get_timestamp()
                            }
                            
                            if firebase_service.save_classification(url, classification_data):
                                classified_count += 1
                                print(f"Successfully auto-classified: {url}")
                            else:
                                errors.append(f"Row {i+1}: Failed to save classification for: {url}")
                        else:
                            errors.append(f"Row {i+1}: Classification failed for: {url}")
                    except Exception as e:
                        errors.append(f"Row {i+1}: Error classifying URL {url}: {str(e)}")
                
                # Prepare attribution data
                # Debug CTR parsing
                raw_ctr = record.get('ctr')
                parsed_ctr = _parse_number(raw_ctr)
                print(f"🔍 CTR Debug - URL: {url[:50]}... Raw CTR: '{raw_ctr}' ({type(raw_ctr)}), Parsed CTR: {parsed_ctr} ({type(parsed_ctr)})")
                print(f"🔍 Full record for debugging: {record}")
                
                # Build versioned attribution record
                upload_date_iso = datetime.utcnow().isoformat() + 'Z'
                attribution_data = {
                    'url': url,
                    'url_normalized': normalize_url(url),
                    'user_id': user_id,
                    'uid': user_id,
                    'upload_date': upload_date_iso,
                    'uploaded_at': firebase_service._get_timestamp(),
                    'conversions': _parse_number(record.get('conversions')),
                    'revenue': _parse_number(record.get('revenue')),
                    'impressions': _parse_number(record.get('impressions')),
                    'clicks': _parse_number(record.get('clicks')),
                    'ctr': parsed_ctr,
                    'scroll_depth': _parse_number(record.get('scroll_depth')),
                    'viewability': _parse_number(record.get('viewability')),
                    'time_on_page': _parse_number(record.get('time_on_page')),
                    'fill_rate': _parse_number(record.get('fill_rate'))
                }
                
                # Save to Firestore as a NEW document (versioned)
                try:
                    firebase_service.db.collection('attribution_data').add(attribution_data)
                    saved_count += 1
                except Exception as e:
                    errors.append(f"Row {i+1}: Failed to save to database: {e}")
                    
            except Exception as e:
                errors.append(f"Row {i+1}: {str(e)}")
        
        # Auto-trigger merge process after successful upload
        merge_result = None
        try:
            print("🔄 Auto-triggering merge process after upload...")
            merge_result = merge_attribution_data(user_id=user_id)
            print(f"✅ Auto-merge completed: {merge_result.get('success', False)}")
        except Exception as e:
            print(f"❌ Auto-merge failed: {e}")
            # Don't fail the upload if merge fails
        
        response = {
            "message": f"Successfully uploaded {saved_count} attribution records and classified {classified_count} new URLs. Auto-merge completed.",
            "saved_count": saved_count,
            "classified_count": classified_count,
            "total_records": len(data),
            "auto_merge": merge_result is not None and merge_result.get('success', False)
        }
        
        if errors:
            response["errors"] = errors
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Error in upload_attribution endpoint: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

def _parse_number(value):
    """Parse a string value to number, return None if invalid."""
    print(f"🔍 _parse_number called with: '{value}' ({type(value)})")
    
    if value == '' or value is None:
        print(f"  → Returning None (empty or None)")
        return None
    
    # Handle string "None" or "null" that might come from CSV
    if isinstance(value, str) and value.lower() in ['none', 'null', 'nan']:
        print(f"  → Returning None (string '{value}')")
        return None
    
    try:
        result = float(value)
        print(f"  → Successfully parsed to: {result} ({type(result)})")
        return result
    except (ValueError, TypeError) as e:
        print(f"  → Parse failed with error: {e}")
        return None

@app.route("/merge-attribution", methods=["POST"])
def trigger_merge():
    """Trigger the attribution-classification merge process."""
    try:
        # Verify Firebase token for admin access
        auth_header = request.headers.get('Authorization')
        print(f"Merge - Auth header received: {auth_header[:50] if auth_header else 'None'}...")
        
        if not auth_header or not auth_header.startswith('Bearer '):
            print("Merge - Missing or invalid authorization header format")
            return jsonify({"error": "Missing or invalid authorization header"}), 401
        
        token = auth_header.split('Bearer ')[1]
        print(f"Merge - Token extracted: {token[:20]}...")
        
        try:
            decoded_token = auth.verify_id_token(token)
            user_id = decoded_token['uid']
            print(f"Merge - Token verified successfully for user: {user_id}")
        except Exception as e:
            print(f"Merge - Token verification failed: {e}")
            return jsonify({"error": "Invalid authentication token"}), 401
        
        # Run the merge process
        print("Starting attribution-classification merge process...")
        result = merge_attribution_data(user_id=user_id)
        
        if result['success']:
            return jsonify({
                "success": True,
                "message": "Merge process completed successfully",
                "statistics": result['statistics'],
                "timestamp": result['timestamp']
            })
        else:
            return jsonify({
                "success": False,
                "error": result.get('error', 'Unknown error during merge'),
                "statistics": result.get('statistics', {}),
                "timestamp": result.get('timestamp')
            }), 500
            
    except Exception as e:
        print(f"Error in merge-attribution endpoint: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

def classify_url(url):
    print(f"Starting classify_url function for: {url}")
    
    # Check OpenAI API key
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    print("OpenAI API key is configured")
    
    # Initialize Firebase service
    try:
        firebase_service = get_firebase_service()
        print("Firebase service initialized successfully")
    except Exception as e:
        print(f"Firebase service initialization failed: {e}")
        firebase_service = None
    
    # Check if URL has already been classified and stored in Firestore
    if firebase_service:
        try:
            cached_result = firebase_service.get_classification_by_url(url)
            if cached_result:
                print(f"Returning cached classification for: {url}")
                return cached_result
        except Exception as e:
            print(f"Error checking cache: {e}")
    
    # If not cached, proceed with classification
    print(f"Classifying URL (not cached): {url}")
    
    # Step 1: Try newspaper3k
    try:
        print("Attempting to extract content with newspaper3k...")
        article = Article(url)
        article.download()
        article.parse()
        article_text = article.text.strip()
        if not article_text:
            raise ValueError("Empty article text from newspaper3k")
        print(f"Successfully extracted {len(article_text)} characters with newspaper3k")
    except Exception as e:
        print(f"newspaper3k failed: {e}")
        # Step 2: Fallback with BeautifulSoup
        try:
            print("Attempting fallback with BeautifulSoup...")
            resp = requests.get(url, timeout=10)
            soup = BeautifulSoup(resp.content, "html.parser")
            paragraphs = soup.find_all("p")
            article_text = " ".join(p.get_text() for p in paragraphs).strip()
            if not article_text:
                raise ValueError("Fallback also returned empty content")
            print(f"Successfully extracted {len(article_text)} characters with BeautifulSoup")
        except Exception as e2:
            print(f"BeautifulSoup fallback also failed: {e2}")
            raise ValueError(f"Failed to extract content from URL: {e2}")

    if len(article_text) > MAX_TOKENS * 4:
        article_text = article_text[:MAX_TOKENS * 4]

    user_prompt = f"""Here is the article text:

\"\"\"{article_text}\"\"\""""

    print("Sending request to OpenAI API...")
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.4,
        )
        print("OpenAI API request successful")
        content = response.choices[0].message.content.strip()
        print(f"Received response from OpenAI: {len(content)} characters")
    except Exception as e:
        print(f"OpenAI API request failed: {e}")
        raise ValueError(f"OpenAI API error: {e}")

    # Parse JSON safely
    try:
        classification_result = json.loads(content)
        
        # Store the result in Firestore if service is available
        if firebase_service:
            try:
                classification_result_with_meta = {
                    **classification_result,
                    'url_normalized': normalize_url(url)
                }
                firebase_service.save_classification(url, classification_result_with_meta)
                print(f"Successfully saved classification to Firestore for: {url}")
            except Exception as e:
                print(f"Failed to save classification to Firestore: {e}")
        
        return classification_result
        
    except json.JSONDecodeError:
        raise ValueError("Failed to parse GPT response as valid JSON:\n" + content)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
