#!/usr/bin/env python3
"""
Script to reclassify the specific URLs with incorrect classifications.
Uses the new improved taxonomy and GPT prompt.
"""

import requests
import json
import time

# Your problematic URLs that need reclassification
URLS_TO_RECLASSIFY = [
    "https://www.menshealth.com/style/g25779431/best-t-shirts-men/",
    "https://www.fashionbeans.com/article/best-summer-shirts-for-men/",
    "https://www.espn.com/golf/story/_/id/45891311/mimi-rhodes-gets-bank-shot-hole-one-open-championship",
    "https://www.wellandgood.com/shopping/best-mini-and-maxi-dresses",
    "https://www.menshealth.com/entertainment/g63422468/best-movies-2025/",
    "https://www.wsbtv.com/sponsored/local-steals-and-deals/local-steals-deals-charge-up-slim-down-with-statik-counto/QKKBJXOLI5CXPLVLRWOGIZ42MI/",
    "https://www.wsbtv.com/sponsored/local-steals-and-deals/local-steals-deals-dirt-doesnt-stand-chance-with-zippi-sweeper-max/KS4HSVGZBVC4BHLUEPLV3TTLDQ/",
    "https://www.wsbtv.com/destinationsdiscovered/alpharetta/",
    "https://www.menshealth.com/style/a61534994/best-summer-shorts-2024/",
    "https://www.menshealth.com/fitness/g23064646/best-exercise-bikes/",
    "https://www.menshealth.com/fitness/g39796972/best-workout-shirts/",
    "https://techcrunch.com/2025/07/29/get-inside-disrupt-volunteer-at-techcrunch-disrupt-2025/"
]

API_BASE_URL = "https://contentive-classify-app.onrender.com"

def reclassify_urls():
    """Reclassify all URLs with force_reclassify=True."""
    print(f"🔄 Reclassifying {len(URLS_TO_RECLASSIFY)} URLs with new taxonomy and prompt...")
    
    # Use bulk classify endpoint with force_reclassify
    payload = {
        "urls": URLS_TO_RECLASSIFY,
        "force_reclassify": True
    }
    
    try:
        print("📡 Sending bulk reclassification request...")
        response = requests.post(
            f"{API_BASE_URL}/classify-bulk",
            json=payload,
            timeout=300  # 5 minute timeout for bulk operation
        )
        
        if response.status_code == 200:
            results = response.json().get("results", [])
            
            print(f"\n✅ Reclassification Results:")
            print("=" * 80)
            
            successful = 0
            failed = 0
            
            for result in results:
                url = result.get("url", "Unknown")
                if "error" in result:
                    print(f"❌ FAILED: {url}")
                    print(f"   Error: {result['error']}")
                    failed += 1
                else:
                    print(f"✅ SUCCESS: {url}")
                    print(f"   Primary: {result.get('iab_code')} ({result.get('iab_category', '').replace(result.get('iab_code', '') + ' ', '')})")
                    if result.get('iab_subcode'):
                        print(f"   Sub: {result.get('iab_subcode')} ({result.get('iab_subcategory', '').replace(result.get('iab_subcode', '') + ' ', '')})")
                    successful += 1
                print()
            
            print("=" * 80)
            print(f"📊 Summary: {successful} successful, {failed} failed out of {len(URLS_TO_RECLASSIFY)} total")
            
            if successful > 0:
                print("🎉 URLs have been reclassified with the new taxonomy and improved prompt!")
                print("💡 You should now see much more accurate classifications.")
            
            return successful == len(URLS_TO_RECLASSIFY)
            
        else:
            print(f"❌ API request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("⏰ Request timed out - this is normal for large bulk operations")
        print("🔄 Classifications may still be processing in the background")
        return False
    except Exception as e:
        print(f"❌ Error during reclassification: {e}")
        return False

def test_single_reclassification():
    """Test reclassifying a single URL first."""
    test_url = "https://www.menshealth.com/style/g25779431/best-t-shirts-men/"
    
    print(f"🧪 Testing single reclassification: {test_url}")
    
    payload = {
        "url": test_url,
        "force_reclassify": True
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/classify",
            json=payload,
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Test successful!")
            print(f"   Primary: {result.get('iab_code')} - {result.get('iab_category')}")
            print(f"   Sub: {result.get('iab_subcode')} - {result.get('iab_subcategory')}")
            return True
        else:
            print(f"❌ Test failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Test error: {e}")
        return False

if __name__ == '__main__':
    print("🚀 URL Reclassification Tool")
    print("=" * 50)
    
    # First test a single URL
    if test_single_reclassification():
        print("\n" + "="*50)
        # If test works, proceed with bulk
        time.sleep(2)  # Brief pause
        reclassify_urls()
    else:
        print("❌ Single test failed - check if the API is deployed and working")