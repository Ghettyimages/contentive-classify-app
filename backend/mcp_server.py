from flask import Flask, request, jsonify
from flask_cors import CORS  
from newspaper import Article
from bs4 import BeautifulSoup
import requests
import os
import openai
import json
from dotenv import load_dotenv
load_dotenv()

# Create OpenAI client using the new SDK
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = Flask(__name__)
CORS(app)
@app.route("/classify-text", methods=["POST"])
def classify_text():
    data = request.json
    url = data.get("url")
    article_text = ""
    article_title = ""

    try:
        # Primary method using newspaper3k
        article = Article(url)
        article.download()
        article.parse()
        article_text = article.text
        article_title = article.title

    except Exception:
        # Fallback to raw HTML parsing
        try:
            headers = {"User-Agent": "Mozilla/5.0"}
            response = requests.get(url, headers=headers, timeout=10)
            soup = BeautifulSoup(response.text, "html.parser")

            article_title = soup.title.string.strip() if soup.title else "Untitled"
            paragraphs = soup.find_all("p")
            article_text = " ".join(p.get_text() for p in paragraphs)[:3000]

        except Exception as e:
            print("❌ Fallback HTML parsing failed:", e)
            return jsonify({"error": "Failed to extract article content"}), 500

    print("📝 Article title:", article_title)
    print("📝 Article text being classified (first 3000 chars):")
    print(article_text[:3000])

    # GPT Classification and JSON parsing
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": f"""
You are a classification engine for digital media content. Based on the following article, classify it using the IAB 3.1 taxonomy.

Return the following JSON keys:
- type (e.g., article, video, page)
- title
- category (top-level IAB 3.1 category name)
- subcategory (sub-level IAB 3.1 category name)
- tone (e.g., informative, opinionated, promotional)
- user intent (e.g., seeking information, shopping, entertainment)
- audience age range (e.g., 18-34, 35-54)
- audience interests (e.g., sports, tech, health)
- context relevance tags (comma-separated, e.g., golf, LIV tour, athlete news)

ARTICLE TITLE:
{article_title}

ARTICLE TEXT:
{article_text[:3000]}
            """}],
            temperature=0.3,
        )

        reply = response.choices[0].message.content
        parsed = json.loads(reply)

        print("✅ Parsed reply sent to frontend:")
        print(parsed)
        
        return jsonify(parsed)

    except Exception as e:
        print("❌ GPT classification or JSON parsing failed:", e)
        return jsonify({"error": "Failed to classify or parse content"}), 500

if __name__ == "__main__":
    app.run(port=5001, debug=True)
