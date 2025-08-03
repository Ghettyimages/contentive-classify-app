import os
import json
from datetime import datetime
from typing import Optional, Dict, Any
import firebase_admin
from firebase_admin import credentials, firestore
from firebase_admin.exceptions import FirebaseError

class FirebaseService:
    def __init__(self):
        """Initialize Firebase Admin SDK and Firestore client."""
        try:
            print("🔧 Initializing Firebase service...")
            
            # Check if Firebase app is already initialized
            if not firebase_admin._apps:
                print("📋 No existing Firebase apps found, initializing...")
                
                # Initialize with service account key from environment
                service_account_info = os.getenv("FIREBASE_SERVICE_ACCOUNT")
                print(f"🔑 Environment variable found: {'Yes' if service_account_info else 'No'}")
                
                if service_account_info:
                    print("📄 Parsing service account JSON...")
                    try:
                        # Parse the JSON service account info
                        cred_dict = json.loads(service_account_info)
                        print(f"✅ JSON parsed successfully. Project ID: {cred_dict.get('project_id', 'Unknown')}")
                        cred = credentials.Certificate(cred_dict)
                        print("🔐 Certificate created successfully")
                    except json.JSONDecodeError as e:
                        print(f"❌ JSON parsing error: {e}")
                        raise
                    except Exception as e:
                        print(f"❌ Certificate creation error: {e}")
                        raise
                else:
                    print("⚠️  No service account found, using default credentials")
                    # Fallback to default credentials (for local development)
                    cred = credentials.ApplicationDefault()
                
                print("🚀 Initializing Firebase Admin SDK...")
                firebase_admin.initialize_app(cred)
                print("✅ Firebase Admin SDK initialized successfully")
            else:
                print("✅ Firebase app already initialized")
            
            print("🗄️  Initializing Firestore client...")
            self.db = firestore.client()
            self.collection_name = "classified_urls"
            print("✅ Firebase service initialization complete")
            
        except Exception as e:
            print(f"❌ Firebase initialization error: {e}")
            import traceback
            print(f"📋 Full traceback: {traceback.format_exc()}")
            raise
    
    def get_classification_by_url(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve classification data for a given URL from Firestore.
        
        Args:
            url: The URL to look up
            
        Returns:
            Classification data if found, None otherwise
        """
        try:
            # Create a document ID from the URL (hash or sanitized)
            doc_id = self._create_doc_id(url)
            doc_ref = self.db.collection(self.collection_name).document(doc_id)
            doc = doc_ref.get()
            
            if doc.exists:
                data = doc.to_dict()
                # Remove Firestore metadata fields
                data.pop('timestamp', None)
                return data
            return None
            
        except FirebaseError as e:
            print(f"Firestore read error: {e}")
            return None
        except Exception as e:
            print(f"Unexpected error reading from Firestore: {e}")
            return None
    
    def save_classification(self, url: str, classification_data: Dict[str, Any]) -> bool:
        """
        Save classification data to Firestore.
        
        Args:
            url: The URL that was classified
            classification_data: The classification results
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Add URL and timestamp to the data
            data_to_save = classification_data.copy()
            data_to_save['url'] = url
            data_to_save['timestamp'] = datetime.utcnow()
            
            # Create document ID from URL
            doc_id = self._create_doc_id(url)
            doc_ref = self.db.collection(self.collection_name).document(doc_id)
            
            # Save to Firestore
            doc_ref.set(data_to_save)
            return True
            
        except FirebaseError as e:
            print(f"Firestore write error: {e}")
            return False
        except Exception as e:
            print(f"Unexpected error writing to Firestore: {e}")
            return False
    
    def _create_doc_id(self, url: str) -> str:
        """
        Create a Firestore document ID from a URL.
        Uses a simple hash to ensure consistent document IDs.
        
        Args:
            url: The URL to create an ID for
            
        Returns:
            A string suitable for use as a Firestore document ID
        """
        import hashlib
        # Create a hash of the URL to use as document ID
        url_hash = hashlib.md5(url.encode()).hexdigest()
        return f"url_{url_hash}"
    
    def get_recent_classifications(self, limit: int = 10) -> list:
        """
        Get recent classifications from Firestore.
        
        Args:
            limit: Maximum number of records to return
            
        Returns:
            List of recent classification records
        """
        try:
            docs = (self.db.collection(self.collection_name)
                   .order_by('timestamp', direction=firestore.Query.DESCENDING)
                   .limit(limit)
                   .stream())
            
            results = []
            for doc in docs:
                data = doc.to_dict()
                results.append(data)
            
            return results
            
        except FirebaseError as e:
            print(f"Firestore query error: {e}")
            return []
        except Exception as e:
            print(f"Unexpected error querying Firestore: {e}")
            return []

    def save_attribution_data(self, url: str, attribution_data: Dict[str, Any]) -> bool:
        """
        Save attribution data to Firestore.
        
        Args:
            url: The URL for the attribution data
            attribution_data: The attribution data to save
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Create document ID from URL
            doc_id = self._create_doc_id(url)
            doc_ref = self.db.collection('attribution_data').document(doc_id)
            
            # Save to Firestore
            doc_ref.set(attribution_data)
            print(f"Successfully saved attribution data for: {url}")
            return True
            
        except FirebaseError as e:
            print(f"Firestore write error for attribution data: {e}")
            return False
        except Exception as e:
            print(f"Unexpected error writing attribution data to Firestore: {e}")
            return False

    def get_attribution_data_by_url(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Get attribution data for a specific URL.
        
        Args:
            url: The URL to get attribution data for
            
        Returns:
            Attribution data dictionary or None if not found
        """
        try:
            doc_id = self._create_doc_id(url)
            doc_ref = self.db.collection('attribution_data').document(doc_id)
            doc = doc_ref.get()
            
            if doc.exists:
                data = doc.to_dict()
                return data
            return None
            
        except FirebaseError as e:
            print(f"Firestore read error for attribution data: {e}")
            return None
        except Exception as e:
            print(f"Unexpected error reading attribution data from Firestore: {e}")
            return None

    def _get_timestamp(self):
        """Get current timestamp for Firestore."""
        return datetime.utcnow()

# Global Firebase service instance
firebase_service = None

def get_firebase_service() -> FirebaseService:
    """Get or create the global Firebase service instance."""
    global firebase_service
    if firebase_service is None:
        firebase_service = FirebaseService()
    return firebase_service