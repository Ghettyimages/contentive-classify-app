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
You are a content classification engine for digital advertising. Your job is to analyze article content and return structured metadata used in programmatic targeting.

Classify the following article using the IAB 3.1 taxonomy and extract relevant metadata.

Follow this strict format exactly:

- IAB Category: [Name] ([Code])
- Subcategory: [Name] ([Code])
- Tone: [Informative | Emotional | Persuasive | Neutral | Critical | Other]
- Audience Intent: [Brief sentence summarizing why someone would seek out this article]
- Audience: [e.g., Sports fans, Tech-savvy adults, Political analysts]
- Keywords: [comma-separated list of 5–10 keywords]
- Buying Intent Score: [A number from 1% to 100% followed by a brief explanation in parentheses — e.g., "35% (Mentions specific products and compares features)"]
- Suggested Ad Campaign Types: [Describe 1–2 campaign types or verticals (e.g., political ads, travel insurance, military recruitment), and why they would be contextually relevant to this article]

Only return the structured fields above. Do not include extra commentary or explanations.

Article:
\"\"\"{article_text}\"\"\"
"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = response.choices[0].message.content.strip()

        # Initialize default structure
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
            "campaign_suggestions": "N/A"
        }

        # Line-by-line parsing
        for line in response_text.split("\n"):
            line = line.strip()
            if line.lower().startswith("iab category"):
                parts = line.split(":")[1].strip()
                result["iab_category"] = parts
            elif line.lower().startswith("subcategory"):
                parts = line.split(":")[1].strip()
                result["iab_subcategory"] = parts
            elif line.lower().startswith("tone"):
                result["tone"] = line.split(":")[1].strip()
            elif "audience intent" in line.lower():
                result["intent"] = line.split(":", 1)[-1].strip()
            elif line.lower().startswith("audience:"):
                result["audience"] = line.split(":", 1)[-1].strip()
            elif line.lower().startswith("keywords"):
                kw_text = line.split(":", 1)[-1].strip()
                result["keywords"] = [kw.strip() for kw in kw_text.split(",") if kw.strip()]
            elif "buying intent" in line.lower():
                result["buying_intent"] = line.split(":", 1)[-1].strip()
            elif "suggested ad campaign" in line.lower():
                result["campaign_suggestions"] = line.split(":", 1)[-1].strip()

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
