#!/usr/bin/env python3
"""
Test script for enhanced IAB 3.1 classification system
Run this to verify the integration is working properly
"""

import requests
import json
import sys
import os

# Configuration
API_BASE = os.getenv('API_BASE_URL', 'http://localhost:5000')
TEST_URLS = [
    'https://techcrunch.com/2024/01/15/tesla-model-s-update/',  # Should be IAB2 (Automotive)
    'https://espn.com/nfl/story/_/id/123456/super-bowl-preview',  # Should be IAB17 (Sports)
    'https://cnn.com/2024/01/15/politics/election-news',  # Should be IAB11 (Law, Gov & Politics)
    'https://foodnetwork.com/recipes/chocolate-cake',  # Should be IAB8 (Food & Drink)
]

def test_classification_stats():
    """Test the classification stats endpoint"""
    print("🔍 Testing classification stats...")
    try:
        response = requests.get(f"{API_BASE}/api/taxonomy/classification-stats")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Enhanced classification: {data.get('enhanced_classification', False)}")
            
            taxonomy = data.get('classification_taxonomy', {})
            print(f"📊 Taxonomy stats:")
            print(f"   - Total categories: {taxonomy.get('total_categories', 0)}")
            print(f"   - Top-level: {taxonomy.get('top_level_categories', 0)}")
            print(f"   - Subcategories: {taxonomy.get('subcategories', 0)}")
            print(f"   - Max depth: {taxonomy.get('max_depth', 0)}")
            
            prompt_info = data.get('prompt_info', {})
            print(f"🎯 Prompt info:")
            print(f"   - Uses full taxonomy: {prompt_info.get('uses_full_taxonomy', False)}")
            print(f"   - Prompt length: {prompt_info.get('prompt_length', 0):,} chars")
            
            return True
        else:
            print(f"❌ Failed to get stats: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error testing stats: {e}")
        return False

def test_iab_api():
    """Test the IAB taxonomy API"""
    print("\n🔍 Testing IAB taxonomy API...")
    try:
        response = requests.get(f"{API_BASE}/api/iab31")
        if response.status_code == 200:
            data = response.json()
            codes = data.get('codes', [])
            print(f"✅ IAB API working: {len(codes)} codes loaded")
            print(f"   - Version: {data.get('version', 'unknown')}")
            print(f"   - Source: {data.get('source', 'unknown')}")
            
            # Check for some expected categories
            expected_codes = ['IAB1', 'IAB2', 'IAB8', 'IAB11', 'IAB17']
            found_codes = {item['code']: item['label'] for item in codes if item['code'] in expected_codes}
            
            print("🎯 Sample categories:")
            for code, label in found_codes.items():
                print(f"   - {code}: {label}")
            
            return len(codes) >= 200  # Should have at least 200 categories
        else:
            print(f"❌ Failed to get IAB data: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error testing IAB API: {e}")
        return False

def test_single_classification(url):
    """Test classification of a single URL"""
    print(f"\n🔍 Testing classification: {url}")
    try:
        response = requests.post(
            f"{API_BASE}/classify",
            json={"url": url},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            
            # Check if we got proper IAB classifications
            iab_code = result.get('iab_code')
            iab_category = result.get('iab_category')
            iab_subcode = result.get('iab_subcode')
            iab_subcategory = result.get('iab_subcategory')
            
            print(f"✅ Classification successful:")
            print(f"   - Primary: {iab_code} - {iab_category}")
            if iab_subcode:
                print(f"   - Sub: {iab_subcode} - {iab_subcategory}")
            
            secondary_code = result.get('iab_secondary_code')
            secondary_category = result.get('iab_secondary_category')
            if secondary_code:
                print(f"   - Secondary: {secondary_code} - {secondary_category}")
            
            # Check if categories have proper names (not "Unknown category")
            has_proper_names = (
                iab_category and 
                'Unknown category' not in iab_category and
                iab_code and iab_code in iab_category
            )
            
            if has_proper_names:
                print("✅ Categories have proper names")
            else:
                print("⚠️  Categories may not have proper names")
            
            return True
        else:
            print(f"❌ Classification failed: {response.status_code}")
            if response.text:
                print(f"   Error: {response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"❌ Error in classification: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 Testing Enhanced IAB 3.1 Classification System")
    print("=" * 50)
    
    # Test 1: Classification stats
    stats_ok = test_classification_stats()
    
    # Test 2: IAB API
    api_ok = test_iab_api()
    
    # Test 3: Sample classifications
    classification_results = []
    for url in TEST_URLS:
        result = test_single_classification(url)
        classification_results.append(result)
    
    # Summary
    print("\n" + "=" * 50)
    print("📋 TEST SUMMARY")
    print(f"✅ Classification stats: {'PASS' if stats_ok else 'FAIL'}")
    print(f"✅ IAB taxonomy API: {'PASS' if api_ok else 'FAIL'}")
    print(f"✅ Sample classifications: {sum(classification_results)}/{len(classification_results)} PASS")
    
    overall_success = stats_ok and api_ok and all(classification_results)
    
    if overall_success:
        print("\n🎉 ALL TESTS PASSED! Enhanced IAB 3.1 system is working correctly.")
        print("\nNext steps:")
        print("- Test with your own URLs")
        print("- Check the Segment Builder for enhanced category selection")
        print("- Review classification results for improved accuracy")
    else:
        print("\n⚠️  Some tests failed. Check the errors above.")
        print("- Ensure the server is running")
        print("- Check that IAB_TSV_PATH is set correctly")
        print("- Verify OpenAI API key is configured")
    
    return 0 if overall_success else 1

if __name__ == "__main__":
    sys.exit(main())