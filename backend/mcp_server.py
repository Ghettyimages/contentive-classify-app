import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from newspaper import Article
from bs4 import BeautifulSoup

load_dotenv()
app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@app.route("/classify", methods=["POST"])
def classify():
    data = request.get_json()
    url = data.get("url")
    if not url:
        return jsonify({"error": "Missing URL"}), 400

    # Try newspaper3k first
    try:
        article = Article(url)
        article.download()
        article.parse()
        article_text = article.text.strip()
        if not article_text:
            raise ValueError("Empty article text")
    except:
        try:
            resp = requests.get(url, timeout=10)
            soup = BeautifulSoup(resp.content, "html.parser")
            paragraphs = soup.find_all("p")
            article_text = " ".join(p.get_text() for p in paragraphs).strip()
            if not article_text:
                raise ValueError("Fallback also returned empty content")
        except Exception:
            return jsonify({"error": "Failed to extract content from article"}), 500

    try:
        prompt = f"""Classify the following article using IAB 3.1 taxonomy.
Return all results using this exact format:

- IAB Category: [label with code]
- IAB Subcategory: [label with code]
- Tone: [brief tone summary]
- User Intent: [what the user is trying to achieve]
- Audience: [target audience type or profile]
- Keywords: [comma-separated list]
- Buying Intent Score: [1% to 100%] (include reasoning)
- Suggested Ad Campaign Types: [brief comma-separated list or description]

Article:
{article_text}
"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = response.choices[0].message.content.strip()

        result = {
            "iab_category": "N/A",
            "iab_code": "N/A",
            "iab_subcategory": "N/A",
            "iab_subcode": "N/A",
            "tone": "N/A",
            "intent": "N/A",
            "audience": "N/A",
            "keywords": [],
            "buying_intent": "N/A",
            "ad_suggestions": "N/A"
        }

        for line in response_text.split("\n"):
            line = line.strip()
            if not line or ":" not in line:
                continue

            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()

            if "iab category" in key:
                result["iab_category"] = value
            elif "iab subcategory" in key:
                result["iab_subcategory"] = value
            elif "tone" in key:
                result["tone"] = value
            elif "user intent" in key:
                result["intent"] = value
            elif key.startswith("audience"):
                result["audience"] = value
            elif "keywords" in key:
                result["keywords"] = [kw.strip() for kw in value.split(",") if kw.strip()]
            elif "buying intent" in key:
                result["buying_intent"] = value
            elif "ad campaign" in key:
                result["ad_suggestions"] = value

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

