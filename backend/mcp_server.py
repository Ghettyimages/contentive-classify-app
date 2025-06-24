import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from newspaper import Article

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

    try:
        article = Article(url)
        article.download()
        article.parse()
        article_text = article.text
    except:
        return jsonify({"error": "Failed to parse article"}), 500

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

if __name__ == "__main__":
    app.run(debug=True)
