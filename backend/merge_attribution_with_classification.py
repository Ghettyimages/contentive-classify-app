#!/usr/bin/env python3
"""
Merge Attribution Data with Classification Data

This script merges attribution CSV data with existing classification data from Firestore
by matching on the 'url' field. It creates a new collection with combined data for
analytics and targeting purposes.

Usage:
    - Run as standalone script: python merge_attribution_with_classification.py
    - Import and call merge_attribution_data() function
    - Trigger via Flask route: POST /merge-attribution
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, Optional, List
from firebase_service import get_firebase_service
import firebase_admin
from firebase_admin import firestore
from urllib.parse import urlparse


def normalize_url(url: str) -> str:
    """Normalize URLs for consistent matching: lowercase, strip query/hash, drop trailing slash (except root)."""
    try:
        parsed = urlparse((url or '').strip())
        scheme = (parsed.scheme or 'http').lower()
        netloc = (parsed.netloc or '').lower()
        path = (parsed.path or '')
        path = path.split('#')[0]
        if path.endswith('/') and path != '/':
            path = path[:-1]
        return f"{scheme}://{netloc}{path}"
    except Exception:
        return (url or '').strip().lower()


class AttributionClassificationMerger:
    """
    Handles merging of attribution data with classification data from Firestore.
    """
    
    def __init__(self, user_id: Optional[str] = None):
        """Initialize the merger with Firebase service.

        Args:
            user_id: If provided, restrict merging to attribution records for this user (uid).
        """
        self.firebase_service = get_firebase_service()
        self.db = self.firebase_service.db
        self.user_id = user_id
        
        # Collection names
        self.attribution_collection = 'attribution_data'
        self.classification_collection = 'classified_urls'  # From existing firebase_service
        self.merged_collection = 'merged_content_signals'
        
        # Statistics tracking
        self.stats = {
            'total_attribution_records': 0,
            'total_classification_records': 0,
            'successful_merges': 0,
            'attribution_only': 0,
            'classification_only': 0,
            'errors': 0,
            'skipped': 0
        }
    
    def merge_attribution_data(self) -> Dict[str, Any]:
        """
        Main function to merge attribution data with classification data.
        
        Returns:
            Dictionary with merge statistics and results
        """
        print("🚀 Starting attribution-classification merge process...")
        print(f"📊 Collections: {self.attribution_collection} + {self.classification_collection} → {self.merged_collection}")
        
        try:
            # Get all attribution data (optionally user-scoped)
            attribution_data = self._get_all_attribution_data()
            self.stats['total_attribution_records'] = len(attribution_data)
            print(f"📈 Found {len(attribution_data)} attribution records")
            
            # Get all classification data
            classification_data = self._get_all_classification_data()
            self.stats['total_classification_records'] = len(classification_data)
            print(f"🏷️  Found {len(classification_data)} classification records")
            
            # Create classification lookup by normalized URL
            classification_lookup = {}
            for record in classification_data:
                url_norm = record.get('url_normalized') or normalize_url(record.get('url', ''))
                if url_norm:
                    classification_lookup[url_norm] = record

            print(f"🔗 Processing {len(attribution_data)} attribution versions (per upload)")

            # Process each attribution document as its own version
            for attribution_record in attribution_data:
                try:
                    url = attribution_record.get('url', '')
                    url_norm = attribution_record.get('url_normalized') or normalize_url(url)
                    classification_record = classification_lookup.get(url_norm)
                    merged_record = self._create_merged_record(url, url_norm, attribution_record, classification_record)
                    if merged_record:
                        success = self._save_merged_record(merged_record)
                        if success:
                            if classification_record:
                                self.stats['successful_merges'] += 1
                                print(f"✅ Merged: {url[:50]}... ({attribution_record.get('upload_date', 'no-date')})")
                            else:
                                self.stats['attribution_only'] += 1
                                print(f"📊 Attribution only: {url[:50]}... ({attribution_record.get('upload_date', 'no-date')})")
                        else:
                            self.stats['errors'] += 1
                            print(f"❌ Failed to save merged record for: {url[:50]}...")
                    else:
                        self.stats['skipped'] += 1
                        print(f"⏭️  Skipped: {url[:50]}...")
                except Exception as e:
                    self.stats['errors'] += 1
                    print(f"❌ Error processing attribution doc: {e}")
            
            # Print final statistics
            self._print_merge_statistics()
            
            return {
                'success': True,
                'message': 'Merge completed successfully',
                'statistics': self.stats.copy(),
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            error_msg = f"Error during merge process: {str(e)}"
            print(f"❌ {error_msg}")
            self.stats['errors'] += 1
            
            return {
                'success': False,
                'error': error_msg,
                'statistics': self.stats.copy(),
                'timestamp': datetime.utcnow().isoformat()
            }
    
    def _get_all_attribution_data(self) -> List[Dict[str, Any]]:
        """Get all attribution data from Firestore."""
        try:
            coll = self.db.collection(self.attribution_collection)
            if self.user_id:
                query = coll.where('uid', '==', self.user_id)
            else:
                query = coll
            docs = query.stream()
            attribution_data = []
            
            for doc in docs:
                data = doc.to_dict()
                data['_id'] = doc.id
                
            print(f"✅ Retrieved {len(attribution_data)} attribution records")
            return attribution_data
            
        except Exception as e:
            print(f"❌ Error retrieving attribution data: {e}")
            return []
    
    def _get_all_classification_data(self) -> List[Dict[str, Any]]:
        """Get all classification data from Firestore."""
        try:
            docs = self.db.collection(self.classification_collection).stream()
            classification_data = []
            
            for doc in docs:
                data = doc.to_dict()
                data['_id'] = doc.id
                classification_data.append(data)
            
            print(f"✅ Retrieved {len(classification_data)} classification records")
            return classification_data
            
        except Exception as e:
            print(f"❌ Error retrieving classification data: {e}")
            return []
    
    def _create_merged_record(self, url: str, url_normalized: str, attribution_record: Optional[Dict], 
                              classification_record: Optional[Dict]) -> Optional[Dict]:
        """Create a merged record from attribution and classification data."""
        if not attribution_record and not classification_record:
            return None
        
        merged_record = {
            'uid': attribution_record.get('uid') if attribution_record else None,
            'url': url,
            'url_normalized': url_normalized,
            'upload_date': attribution_record.get('upload_date') if attribution_record else None,
            'merged_at': datetime.utcnow().isoformat() + 'Z',
            'has_attribution_data': bool(attribution_record),
            'has_classification_data': bool(classification_record)
        }
        
        # Add attribution fields
        if attribution_record:
            attribution_fields = [
                'conversions', 'revenue', 'impressions', 'clicks', 'ctr',
                'scroll_depth', 'viewability', 'time_on_page', 'fill_rate',
                'user_id', 'uploaded_at'
            ]
            
            for field in attribution_fields:
                if field in attribution_record:
                    merged_record[f'attribution_{field}'] = attribution_record[field]
                    # Debug logging for CTR field
                    if field == 'ctr':
                        print(f"🔍 Merge Debug - URL: {url[:50]}... CTR value: {attribution_record[field]} ({type(attribution_record[field])})")
            # Removed CTR calculation logic; only raw CSV value is used
        
        # Add classification fields
        if classification_record:
            classification_fields = [
                'iab_category', 'iab_code', 'iab_subcategory', 'iab_subcode',
                'iab_secondary_category', 'iab_secondary_code', 
                'iab_secondary_subcategory', 'iab_secondary_subcode',
                'tone', 'intent', 'audience', 'keywords', 'buying_intent', 
                'ad_suggestions', 'timestamp'
            ]
            
            for field in classification_fields:
                if field in classification_record:
                    merged_record[f'classification_{field}'] = classification_record[field]
        
        return merged_record
    
    def _save_merged_record(self, merged_record: Dict[str, Any]) -> bool:
        """Save merged record to Firestore with auto-generated document ID (versioned history)."""
        try:
            self.db.collection(self.merged_collection).add(merged_record)
            return True
            
        except Exception as e:
            print(f"Error saving merged record: {e}")
            return False
    
    def _print_merge_statistics(self):
        """Print detailed merge statistics."""
        print("\n" + "="*60)
        print("📊 MERGE STATISTICS")
        print("="*60)
        print(f"📈 Total Attribution Records: {self.stats['total_attribution_records']}")
        print(f"🏷️  Total Classification Records: {self.stats['total_classification_records']}")
        print(f"✅ Successful Merges: {self.stats['successful_merges']}")
        print(f"📊 Attribution Only: {self.stats['attribution_only']}")
        print(f"🏷️  Classification Only: {self.stats['classification_only']}")
        print(f"⏭️  Skipped: {self.stats['skipped']}")
        print(f"❌ Errors: {self.stats['errors']}")
        print("="*60)
        
        total_processed = (self.stats['successful_merges'] + 
                         self.stats['attribution_only'] + 
                         self.stats['classification_only'])
        
        print(f"🎯 Total Records Processed: {total_processed}")
        print(f"📊 Success Rate: {(total_processed / max(1, total_processed + self.stats['errors'])) * 100:.1f}%")
        print("="*60)


def merge_attribution_data(user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Convenience function to run the merge process.
    
    Returns:
        Dictionary with merge results and statistics
    """
    merger = AttributionClassificationMerger(user_id=user_id)
    return merger.merge_attribution_data()


if __name__ == "__main__":
    """Run the merge process when script is executed directly."""
    print("🔄 Attribution-Classification Merge Script")
    print("="*50)
    
    result = merge_attribution_data()
    
    if result['success']:
        print("🎉 Merge process completed successfully!")
    else:
        print(f"❌ Merge process failed: {result.get('error', 'Unknown error')}")
    
    print("="*50)