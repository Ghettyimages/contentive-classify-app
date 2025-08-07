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


class AttributionClassificationMerger:
    """
    Handles merging of attribution data with classification data from Firestore.
    """
    
    def __init__(self):
        """Initialize the merger with Firebase service."""
        self.firebase_service = get_firebase_service()
        self.db = self.firebase_service.db
        
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
            # Get all attribution data
            attribution_data = self._get_all_attribution_data()
            self.stats['total_attribution_records'] = len(attribution_data)
            print(f"📈 Found {len(attribution_data)} attribution records")
            
            # Get all classification data
            classification_data = self._get_all_classification_data()
            self.stats['total_classification_records'] = len(classification_data)
            print(f"🏷️  Found {len(classification_data)} classification records")
            
            # Create lookup dictionaries for efficient matching
            attribution_lookup = {record['url']: record for record in attribution_data}
            classification_lookup = {record['url']: record for record in classification_data}
            
            # Get all unique URLs
            all_urls = set(attribution_lookup.keys()) | set(classification_lookup.keys())
            print(f"🔗 Processing {len(all_urls)} unique URLs")
            
            # Process each URL
            for url in all_urls:
                self._process_url_merge(url, attribution_lookup, classification_lookup)
            
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
            docs = self.db.collection(self.attribution_collection).stream()
            attribution_data = []
            
            for doc in docs:
                data = doc.to_dict()
                data['_id'] = doc.id
                attribution_data.append(data)
            
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
    
    def _process_url_merge(self, url: str, attribution_lookup: Dict, classification_lookup: Dict):
        """Process merge for a single URL."""
        try:
            attribution_record = attribution_lookup.get(url)
            classification_record = classification_lookup.get(url)
            
            # Create merged record
            merged_record = self._create_merged_record(url, attribution_record, classification_record)
            
            if merged_record:
                # Save to merged collection
                success = self._save_merged_record(url, merged_record)
                if success:
                    if attribution_record and classification_record:
                        self.stats['successful_merges'] += 1
                        print(f"✅ Merged: {url[:50]}...")
                    elif attribution_record:
                        self.stats['attribution_only'] += 1
                        print(f"📊 Attribution only: {url[:50]}...")
                    elif classification_record:
                        self.stats['classification_only'] += 1
                        print(f"🏷️  Classification only: {url[:50]}...")
                else:
                    self.stats['errors'] += 1
                    print(f"❌ Failed to save merged record for: {url[:50]}...")
            else:
                self.stats['skipped'] += 1
                print(f"⏭️  Skipped: {url[:50]}...")
                
        except Exception as e:
            self.stats['errors'] += 1
            print(f"❌ Error processing URL {url[:50]}...: {e}")
    
    def _create_merged_record(self, url: str, attribution_record: Optional[Dict], 
                            classification_record: Optional[Dict]) -> Optional[Dict]:
        """Create a merged record from attribution and classification data."""
        if not attribution_record and not classification_record:
            return None
        
        merged_record = {
            'url': url,
            'merged_at': datetime.utcnow(),
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
            
            # Handle CTR calculation if missing or invalid
            uploaded_ctr = attribution_record.get('ctr')
            clicks = attribution_record.get('clicks')
            impressions = attribution_record.get('impressions')
            
            # Check if CTR is missing, empty, or invalid
            ctr_is_valid = (uploaded_ctr is not None and 
                           uploaded_ctr != '' and 
                           isinstance(uploaded_ctr, (int, float)) and 
                           not (isinstance(uploaded_ctr, float) and uploaded_ctr.is_integer() and uploaded_ctr == 0))
            
            if not ctr_is_valid and clicks is not None and impressions is not None:
                try:
                    clicks_val = float(clicks)
                    impressions_val = float(impressions)
                    
                    if impressions_val > 0:
                        calculated_ctr = (clicks_val / impressions_val) * 100
                        merged_record['attribution_ctr'] = calculated_ctr
                        print(f"📊 Calculated CTR for {url[:50]}...: {calculated_ctr:.2f}% (clicks: {clicks_val}, impressions: {impressions_val})")
                except (ValueError, TypeError):
                    # If conversion fails, keep original value (will be None/empty)
                    pass
        
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
    
    def _save_merged_record(self, url: str, merged_record: Dict[str, Any]) -> bool:
        """Save merged record to Firestore."""
        try:
            # Create document ID from URL (same method as firebase_service)
            doc_id = self.firebase_service._create_doc_id(url)
            doc_ref = self.db.collection(self.merged_collection).document(doc_id)
            
            # Use set() for upsert behavior (no duplicates)
            doc_ref.set(merged_record)
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


def merge_attribution_data() -> Dict[str, Any]:
    """
    Convenience function to run the merge process.
    
    Returns:
        Dictionary with merge results and statistics
    """
    merger = AttributionClassificationMerger()
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