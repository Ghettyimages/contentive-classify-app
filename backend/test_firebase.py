#!/usr/bin/env python3
"""
Test script for Firebase Firestore integration.
Run this to verify that Firebase is properly configured and working.
"""

import os
import json
from dotenv import load_dotenv
from firebase_service import get_firebase_service

def test_firebase_connection():
    """Test basic Firebase connection and operations."""
    print("🧪 Testing Firebase Firestore Integration...")
    
    # Load environment variables
    load_dotenv()
    
    try:
        # Test Firebase service initialization
        print("1. Initializing Firebase service...")
        firebase_service = get_firebase_service()
        print("✅ Firebase service initialized successfully")
        
        # Test writing to Firestore
        print("2. Testing write operation...")
        test_data = {
            "iab_category": "IAB1 (Arts & Entertainment)",
            "iab_code": "IAB1",
            "iab_subcategory": "IAB1-1 (Books & Literature)",
            "iab_subcode": "IAB1-1",
            "tone": "Informative",
            "intent": "To provide information about literature",
            "audience": "Book lovers and literature enthusiasts",
            "keywords": ["books", "literature", "reading"],
            "buying_intent": "Low",
            "ad_suggestions": "Book-related ads, literary events"
        }
        
        test_url = "https://example.com/test-article"
        success = firebase_service.save_classification(test_url, test_data)
        
        if success:
            print("✅ Write operation successful")
        else:
            print("❌ Write operation failed")
            return False
        
        # Test reading from Firestore
        print("3. Testing read operation...")
        retrieved_data = firebase_service.get_classification_by_url(test_url)
        
        if retrieved_data:
            print("✅ Read operation successful")
            print(f"   Retrieved data: {json.dumps(retrieved_data, indent=2)}")
        else:
            print("❌ Read operation failed")
            return False
        
        # Test recent classifications
        print("4. Testing recent classifications query...")
        recent = firebase_service.get_recent_classifications(limit=5)
        print(f"✅ Retrieved {len(recent)} recent classifications")
        
        print("\n🎉 All Firebase tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Firebase test failed: {e}")
        return False

def check_environment():
    """Check if required environment variables are set."""
    print("🔍 Checking environment configuration...")
    
    required_vars = ["OPENAI_API_KEY"]
    optional_vars = ["FIREBASE_SERVICE_ACCOUNT"]
    
    missing_required = []
    for var in required_vars:
        if not os.getenv(var):
            missing_required.append(var)
    
    if missing_required:
        print(f"❌ Missing required environment variables: {missing_required}")
        return False
    
    print("✅ Required environment variables are set")
    
    # Check Firebase configuration
    firebase_config = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if firebase_config:
        try:
            json.loads(firebase_config)
            print("✅ Firebase service account JSON is valid")
        except json.JSONDecodeError:
            print("❌ Firebase service account JSON is invalid")
            return False
    else:
        print("⚠️  No Firebase service account configured - will use default credentials")
    
    return True

if __name__ == "__main__":
    print("🚀 ContentiveMedia Firebase Integration Test")
    print("=" * 50)
    
    if check_environment():
        test_firebase_connection()
    else:
        print("\n❌ Environment check failed. Please configure your .env file.")
        print("See .env.example for required variables.")