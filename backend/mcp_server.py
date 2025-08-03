import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
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

@app.route("/")
def index():
    return "MCP Server is running."

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
        data = request.json.get('data', [])
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Validate and save each record
        firebase_service = get_firebase_service()
        saved_count = 0
        errors = []
        
        for i, record in enumerate(data):
            try:
                # Validate required fields
                url = record.get('url', '').strip()
                if not url:
                    errors.append(f"Row {i+1}: Missing required 'url' field")
                    continue
                
                # Prepare attribution data
                attribution_data = {
                    'url': url,
                    'user_id': user_id,
                    'uploaded_at': firebase_service._get_timestamp(),
                    'conversions': _parse_number(record.get('conversions')),
                    'revenue': _parse_number(record.get('revenue')),
                    'impressions': _parse_number(record.get('impressions')),
                    'clicks': _parse_number(record.get('clicks')),
                    'ctr': _parse_number(record.get('ctr')),
                    'scroll_depth': _parse_number(record.get('scroll_depth')),
                    'viewability': _parse_number(record.get('viewability')),
                    'time_on_page': _parse_number(record.get('time_on_page')),
                    'fill_rate': _parse_number(record.get('fill_rate'))
                }
                
                # Save to Firestore
                success = firebase_service.save_attribution_data(url, attribution_data)
                if success:
                    saved_count += 1
                else:
                    errors.append(f"Row {i+1}: Failed to save to database")
                    
            except Exception as e:
                errors.append(f"Row {i+1}: {str(e)}")
        
        response = {
            "message": f"Successfully uploaded {saved_count} attribution records",
            "saved_count": saved_count,
            "total_records": len(data)
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
    if not value or value == '':
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
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
        result = merge_attribution_data()
        
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
                firebase_service.save_classification(url, classification_result)
                print(f"Successfully saved classification to Firestore for: {url}")
            except Exception as e:
                print(f"Failed to save classification to Firestore: {e}")
        
        return classification_result
        
    except json.JSONDecodeError:
        raise ValueError("Failed to parse GPT response as valid JSON:\n" + content)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
