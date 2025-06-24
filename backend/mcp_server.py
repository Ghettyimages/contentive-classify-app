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
        # Fallback to BeautifulSoup
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
        prompt = f"""
Classify the following article using IAB 3.1 taxonomy.
Return:
- IAB category and subcategory with code
- Audience intent
- Tone
- Summary
- Keywords

Article:
\"\"\"{article_text}\"\"\"
"""
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
        )
        return jsonify({"result": response.choices[0].message.content.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
