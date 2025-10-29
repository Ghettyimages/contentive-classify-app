#!/usr/bin/env python3
"""
Script to clear cached classifications so they get reclassified with the new taxonomy and prompt.
"""

import os
import sys
sys.path.append('/workspace/backend')

from firebase_service import get_firebase_service

def clear_classification_cache():
    """Clear all cached classifications to force reclassification."""
    try:
        firebase_service = get_firebase_service()
        
        # Get all documents in the classified_urls collection
        docs = firebase_service.db.collection('classified_urls').stream()
        
        deleted_count = 0
        for doc in docs:
            doc.reference.delete()
            deleted_count += 1
            if deleted_count % 10 == 0:
                print(f"Deleted {deleted_count} cached classifications...")
        
        print(f"✅ Successfully cleared {deleted_count} cached classifications")
        print("All URLs will now be reclassified with the new taxonomy and improved prompt!")
        
        return True
        
    except Exception as e:
        print(f"❌ Error clearing cache: {e}")
        return False

if __name__ == '__main__':
    print("🧹 Clearing classification cache to force reclassification...")
    success = clear_classification_cache()
    sys.exit(0 if success else 1)