from flask import Flask, request, jsonify
from flask_cors import CORS
from newspaper import Article
from bs4 import BeautifulSoup
import requests
import os
from openai import OpenAI

app = Flask(__name__)
CORS(app, origins=["https://contentivemedia.com"])  # Adjust for production
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MAX_TOKENS = 3000

def extract_label_and_code(value):
    if "(" in value and ")" in value:
        label = value.split("(")[0].strip()
        code = value.split("(")[1].replace(")", "").strip()
    else:
        label = value.strip()
        code = "N/A"
    return label, code

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

    prompt = f"""
You are a contextual advertising analyst. Classify the article below using the IAB 3.1 taxonomy and extract key metadata.

Return all results in this exact format (with label and code in parentheses):

- IAB Category: [label (code)]
- IAB Subcategory: [label (code)]
- Secondary IAB Category: [label (code)] (optional)
- Secondary IAB Subcategory: [label (code)] (optional)
- Tone: [brief tone summary]
- User Intent: [what the reader is trying to achieve]
- Audience: [target audience type or profile]
- Keywords: [comma-separated list of key concepts and entities]
- Buying Intent Score: [Low / Medium / High] – [brief reasoning]
- Suggested Ad Campaign Types: [brief list or examples]

Article:
\"\"\"
{article_text}
\"\"\"
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
        "iab_secondary_category": "N/A",
        "iab_secondary_code": "N/A",
        "iab_secondary_subcategory": "N/A",
        "iab_secondary_subcode": "N/A",
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

        if "iab category" == key:
            label, code = extract_label_and_code(value)
            result["iab_category"] = label
            result["iab_code"] = code
        elif "iab subcategory" == key:
            label, code = extract_label_and_code(value)
            result["iab_subcategory"] = label
            result["iab_subcode"] = code
        elif "secondary iab category" == key:
            label, code = extract_label_and_code(value)
            result["iab_secondary_category"] = label
            result["iab_secondary_code"] = code
        elif "secondary iab subcategory" == key:
            label, code = extract_label_and_code(value)
            result["iab_secondary_subcategory"] = label
            result["iab_secondary_subcode"] = code
        elif "tone" in key:
            result["tone"] = value
        elif "user intent" in key:
            result["intent"] = value
        elif "audience" in key:
            result["audience"] = value
        elif "keywords" in key:
            result["keywords"] = [kw.strip() for kw in value.split(",") if kw.strip()]
        elif "buying intent" in key:
            result["buying_intent"] = value
        elif "ad campaign" in key:
            result["ad_suggestions"] = value

    return result

@app.route("/classify", methods=["POST"])
def classify():
    try:
        data = request.json
        url = data.get("url")
        result = classify_url(url)
        return jsonify(result)
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

if __name__ == "__main__":
    app.run(debug=True)
