import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from newspaper import Article
from bs4 import BeautifulSoup
import requests
from openai import OpenAI
from firebase_service import get_firebase_service

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

def classify_url(url):
    # Initialize Firebase service
    try:
        firebase_service = get_firebase_service()
    except Exception as e:
        print(f"Firebase service initialization failed: {e}")
        firebase_service = None
    
    # Check if URL has already been classified and stored in Firestore
    if firebase_service:
        cached_result = firebase_service.get_classification_by_url(url)
        if cached_result:
            print(f"Returning cached classification for: {url}")
            return cached_result
    
    # If not cached, proceed with classification
    print(f"Classifying URL (not cached): {url}")
    
    # Step 1: Try newspaper3k
    try:
        article = Article(url)
        article.download()
        article.parse()
        article_text = article.text.strip()
        if not article_text:
            raise ValueError("Empty article text")
    except:
        # Step 2: Fallback with BeautifulSoup
        resp = requests.get(url, timeout=10)
        soup = BeautifulSoup(resp.content, "html.parser")
        paragraphs = soup.find_all("p")
        article_text = " ".join(p.get_text() for p in paragraphs).strip()
        if not article_text:
            raise ValueError("Fallback also returned empty content")

    if len(article_text) > MAX_TOKENS * 4:
        article_text = article_text[:MAX_TOKENS * 4]

    user_prompt = f"""Here is the article text:

\"\"\"{article_text}\"\"\""""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.4,
    )

    content = response.choices[0].message.content.strip()

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
