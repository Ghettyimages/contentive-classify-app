import os
import re
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from newspaper import Article
from bs4 import BeautifulSoup

load_dotenv()
app = Flask(__name__)
CORS(app, 
     origins=["*"],
     methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
     supports_credentials=False)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MAX_TOKENS = 6000  # Safe limit for input truncation

def extract_label_and_code(text):
    match = re.search(r"^(.*?)\s*\((IAB[\d\-]+)\)", text.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return text.strip(), "N/A"

@app.route("/classify", methods=["POST"])
def classify():
    data = request.get_json()
    url = data.get("url")
    if not url:
        return jsonify({"error": "Missing URL"}), 400

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

    if len(article_text) > MAX_TOKENS * 4:
        article_text = article_text[:MAX_TOKENS * 4]

    try:
        prompt = f"""You are a content classification engine. Analyze the following article and return structured results using the IAB 3.1 taxonomy and advertising metadata.

Return your results in this exact format:

- IAB Category: [Primary topical category label with code, e.g., Sports (IAB15)]
- IAB Subcategory: [Primary subcategory label with code, e.g., Golf (IAB15-5)]
- Secondary IAB Category: [If applicable, a second relevant category label with code, e.g., Society (IAB14); otherwise leave blank]
- Secondary IAB Subcategory: [If applicable, a second subcategory label with code, e.g., Shopping (IAB14-6); otherwise leave blank]
- Tone: [Summarize the overall tone or style of the article, e.g., informative, persuasive, humorous]
- User Intent: [What the user is likely trying to achieve by reading this article — e.g., learn, shop, compare, explore]
- Audience: [Briefly describe the intended or most relevant audience, e.g., golf enthusiasts, tech-savvy parents, casual readers]
- Keywords: [Comma-separated list of relevant keywords, ideally 5–10, that reflect the core content]
- Buying Intent Score: [Low, Medium, or High — followed by a brief explanation of why this level was chosen]
- Suggested Ad Campaign Types: [Comma-separated list of advertiser types or verticals that would be a good fit for this content]

Buying Intent Scoring Rubric:
- High: Strong commercial or purchase-related content (e.g., product lists, buying guides, affiliate reviews, direct links to retailers)
- Medium: Informational or educational content that includes some product or service references, lightly suggests purchase intent
- Low: Purely editorial, educational, news, or commentary content with no commercial or purchase-driven elements

Instructions:
- Use the IAB Category fields to classify the topic of the article.
- Use the Secondary IAB Category fields only if the article has clear relevance to another IAB category.
- Use the Buying Intent Score rubric above to determine the level.
- If no secondary category is clearly relevant, leave the secondary fields blank.
- Make sure all outputs follow the requested format exactly.

Article:
{article_text}
"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = response.choices[0].message.content.strip()
        print("DEBUG GPT RESPONSE:\n", response_text)

        return jsonify(parse_response(response_text))

    except Exception as e:
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

def classify_url(url):
    try:
        article = Article(url)
        article.download()
        article.parse()
        article_text = article.text.strip()
        if not article_text:
            raise ValueError("Empty article text")
    except:
        resp = requests.get(url, timeout=10)
        soup = BeautifulSoup(resp.content, "html.parser")
        paragraphs = soup.find_all("p")
        article_text = " ".join(p.get_text() for p in paragraphs).strip()
        if not article_text:
            raise ValueError("Fallback also returned empty content")

    if len(article_text) > MAX_TOKENS * 4:
        article_text = article_text[:MAX_TOKENS * 4]

    prompt = f"""You are a content classification engine. Analyze the following article and return structured results using the IAB 3.1 taxonomy and advertising metadata.

Return your results in this exact format:

- IAB Category: [Primary topical category label with code, e.g., Sports (IAB15)]
- IAB Subcategory: [Primary subcategory label with code, e.g., Golf (IAB15-5)]
- Secondary IAB Category: [If applicable, a second relevant category label with code, e.g., Society (IAB14); otherwise leave blank]
- Secondary IAB Subcategory: [If applicable, a second subcategory label with code, e.g., Shopping (IAB14-6); otherwise leave blank]
- Tone: [Summarize the overall tone or style of the article, e.g., informative, persuasive, humorous]
- User Intent: [What the user is likely trying to achieve by reading this article — e.g., learn, shop, compare, explore]
- Audience: [Briefly describe the intended or most relevant audience, e.g., golf enthusiasts, tech-savvy parents, casual readers]
- Keywords: [Comma-separated list of relevant keywords, ideally 5–10, that reflect the core content]
- Buying Intent Score: [Low, Medium, or High — followed by a brief explanation of why this level was chosen]
- Suggested Ad Campaign Types: [Comma-separated list of advertiser types or verticals that would be a good fit for this content]

Buying Intent Scoring Rubric:
- High: Strong commercial or purchase-related content (e.g., product lists, buying guides, affiliate reviews, direct links to retailers)
- Medium: Informational or educational content that includes some product or service references, lightly suggests purchase intent
- Low: Purely editorial, educational, news, or commentary content with no commercial or purchase-driven elements

Instructions:
- Use the IAB Category fields to classify the topic of the article.
- Use the Secondary IAB Category fields only if the article has clear relevance to another IAB category.
- Use the Buying Intent Score rubric above to determine the level.
- If no secondary category is clearly relevant, leave the secondary fields blank.
- Make sure all outputs follow the requested format exactly.

Article:
{article_text}
"""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
    )
    response_text = response.choices[0].message.content.strip()
    return parse_response(response_text)

def parse_response(response_text):
    result = {
        "iab_category": "N/A",
        "iab_subcategory": "N/A",
        "iab_secondary_category": "N/A",
        "iab_secondary_subcategory": "N/A",
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

        if line.startswith("- "):
            line = line[2:]

        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip()

        if key == "iab category":
            label, code = extract_label_and_code(value)
            result["iab_category"] = f"{label} ({code})"
        elif key == "iab subcategory":
            label, code = extract_label_and_code(value)
            result["iab_subcategory"] = f"{label} ({code})"
        elif key == "secondary iab category":
            label, code = extract_label_and_code(value)
            result["iab_secondary_category"] = f"{label} ({code})"
        elif key == "secondary iab subcategory":
            label, code = extract_label_and_code(value)
            result["iab_secondary_subcategory"] = f"{label} ({code})"
        elif key == "tone":
            result["tone"] = value
        elif key == "user intent":
            result["intent"] = value
        elif key == "audience":
            result["audience"] = value
        elif key == "keywords":
            result["keywords"] = [kw.strip() for kw in value.split(",") if kw.strip()]
        elif key.startswith("buying intent"):
            result["buying_intent"] = value
        elif "ad campaign" in key:
            result["ad_suggestions"] = value

    return result

if __name__ == "__main__":
    # Run the Flask app in development mode
    app.run(debug=True, host="0.0.0.0", port=5000)
