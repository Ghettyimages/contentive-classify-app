# Enhanced IAB 3.1 Classification Integration
# Provides proper IAB taxonomy integration for OpenAI classification

import json
import random
from typing import Dict, List, Tuple, Optional
from iab_taxonomy import parse_iab_tsv, _env_path
import os

class IABClassificationHelper:
    """Helper class for enhanced IAB 3.1 classification integration"""
    
    def __init__(self):
        self.taxonomy = None
        self.category_examples = {}
        self.load_taxonomy()
    
    def load_taxonomy(self):
        """Load the IAB 3.1 taxonomy for classification use"""
        try:
            self.taxonomy = parse_iab_tsv(_env_path())
            self._build_category_examples()
            print(f"[IAB Classification] Loaded {len(self.taxonomy)} categories for classification")
        except Exception as e:
            print(f"[IAB Classification] Failed to load taxonomy: {e}")
            self.taxonomy = []
    
    def _build_category_examples(self):
        """Build a map of category examples for better OpenAI guidance"""
        if not self.taxonomy:
            return
            
        # Group by top-level categories for better examples
        top_level_map = {}
        for item in self.taxonomy:
            code = item['code']
            if '-' not in code:  # Top-level category
                top_level_map[code] = {
                    'label': item['label'],
                    'subcategories': []
                }
        
        # Add subcategories
        for item in self.taxonomy:
            code = item['code']
            if '-' in code:  # Subcategory
                parent = code.split('-')[0]
                if parent in top_level_map:
                    top_level_map[parent]['subcategories'].append({
                        'code': code,
                        'label': item['label']
                    })
        
        self.category_examples = top_level_map
    
    def get_classification_prompt_with_taxonomy(self) -> str:
        """Generate an enhanced classification prompt with actual IAB taxonomy"""
        if not self.taxonomy:
            return self._get_fallback_prompt()
        
        # Select representative examples from different categories
        examples = self._get_representative_examples()
        
        prompt = f"""You are a content classification engine that analyzes article text and returns structured metadata for ad targeting.

You must classify content using the IAB Tech Lab Content Taxonomy 3.1. Here are the available categories:

{examples}

Return only a valid JSON object with the following fields:

{{
  "iab_category": "IAB12 (News)",
  "iab_code": "IAB12",
  "iab_subcategory": "IAB12-1 (International News)",
  "iab_subcode": "IAB12-1",
  "iab_secondary_category": "IAB11 (Law, Government & Politics)",
  "iab_secondary_code": "IAB11",
  "iab_secondary_subcategory": "IAB11-3 (Legal Issues)",
  "iab_secondary_subcode": "IAB11-3",
  "tone": "Informative, Neutral",
  "intent": "To inform readers about current events and their implications.",
  "audience": "General public interested in news and current affairs.",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "buying_intent": "Low – informational content with minimal commercial intent.",
  "ad_suggestions": "News-related sponsorships, contextual display ads"
}}

CLASSIFICATION RULES:
1. Use ONLY the IAB codes and categories listed above
2. Primary category (iab_code) should be the main topic of the content
3. Subcategory (iab_subcode) should be a more specific classification within the primary category
4. Secondary category is optional - use only if content has a significant secondary theme
5. If no suitable subcategory exists, leave iab_subcode as null
6. If no secondary category fits, set all secondary fields to null
7. Ensure all codes follow the exact format shown (e.g., "IAB12-1", not "IAB12.1")
8. Return strict JSON only — no comments, markdown, or extra text

Choose the most appropriate categories based on the content's primary focus and themes."""

        return prompt
    
    def _get_representative_examples(self) -> str:
        """Get a representative sample of IAB categories for the prompt"""
        if not self.category_examples:
            return "IAB taxonomy not available"
        
        examples = []
        
        # Get a diverse set of top-level categories
        sample_categories = [
            'IAB1', 'IAB2', 'IAB3', 'IAB5', 'IAB6', 'IAB8', 'IAB9', 'IAB11', 'IAB12', 'IAB13',
            'IAB14', 'IAB15', 'IAB16', 'IAB17', 'IAB18', 'IAB19', 'IAB20', 'IAB22', 'IAB23'
        ]
        
        for cat_code in sample_categories:
            if cat_code in self.category_examples:
                cat_info = self.category_examples[cat_code]
                examples.append(f"• {cat_code} ({cat_info['label']})")
                
                # Add 2-3 subcategories as examples
                subcats = cat_info['subcategories'][:3]
                for subcat in subcats:
                    examples.append(f"  - {subcat['code']} ({subcat['label']})")
        
        return "\n".join(examples)
    
    def _get_fallback_prompt(self) -> str:
        """Fallback prompt if taxonomy loading fails"""
        return """You are a content classification engine that analyzes article text and returns structured metadata for ad targeting.

Return only a valid JSON object with the following fields:

{
  "iab_category": "IAB12 (News)",
  "iab_code": "IAB12",
  "iab_subcategory": "IAB12-1 (International News)",
  "iab_subcode": "IAB12-1",
  "iab_secondary_category": "IAB11 (Law, Government & Politics)",
  "iab_secondary_code": "IAB11",
  "iab_secondary_subcategory": "IAB11-3 (Legal Issues)",
  "iab_secondary_subcode": "IAB11-3",
  "tone": "Informative, Neutral",
  "intent": "To inform readers about current events and their implications.",
  "audience": "General public interested in news and current affairs.",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "buying_intent": "Low – informational content with minimal commercial intent.",
  "ad_suggestions": "News-related sponsorships, contextual display ads"
}

Rules:
- Use IAB Tech Lab Content Taxonomy 3.1
- If no secondary category fits, set the secondary fields to null
- Return strict JSON only — no comments, markdown, or extra text"""
    
    def validate_classification_result(self, result: Dict) -> Dict:
        """Validate and normalize classification results against IAB 3.1 taxonomy"""
        if not self.taxonomy:
            return result
        
        # Create lookup maps
        code_to_info = {item['code']: item for item in self.taxonomy}
        
        def validate_and_normalize_code(code: str, category_text: str) -> Tuple[Optional[str], Optional[str]]:
            """Validate a code and return normalized code and category text"""
            if not code:
                return None, None
            
            # Clean the code
            clean_code = code.strip()
            
            # Check if code exists in taxonomy
            if clean_code in code_to_info:
                item = code_to_info[clean_code]
                normalized_category = f"{clean_code} ({item['label']})"
                return clean_code, normalized_category
            
            # Try to find similar codes (common mistakes)
            for taxonomy_code, item in code_to_info.items():
                if taxonomy_code.replace('-', '.') == clean_code or \
                   taxonomy_code.replace('-', '_') == clean_code:
                    normalized_category = f"{taxonomy_code} ({item['label']})"
                    return taxonomy_code, normalized_category
            
            print(f"[IAB Validation] Unknown code: {clean_code}")
            return None, None
        
        # Validate primary classification
        primary_code, primary_category = validate_and_normalize_code(
            result.get('iab_code'), result.get('iab_category')
        )
        
        # Validate subcategory
        sub_code, sub_category = validate_and_normalize_code(
            result.get('iab_subcode'), result.get('iab_subcategory')
        )
        
        # Validate secondary classification
        secondary_code, secondary_category = validate_and_normalize_code(
            result.get('iab_secondary_code'), result.get('iab_secondary_category')
        )
        
        # Validate secondary subcategory
        secondary_sub_code, secondary_sub_category = validate_and_normalize_code(
            result.get('iab_secondary_subcode'), result.get('iab_secondary_subcategory')
        )
        
        # Update result with validated data
        result.update({
            'iab_code': primary_code,
            'iab_category': primary_category,
            'iab_subcode': sub_code,
            'iab_subcategory': sub_category,
            'iab_secondary_code': secondary_code,
            'iab_secondary_category': secondary_category,
            'iab_secondary_subcode': secondary_sub_code,
            'iab_secondary_subcategory': secondary_sub_category
        })
        
        return result
    
    def get_taxonomy_stats(self) -> Dict:
        """Get statistics about the loaded taxonomy"""
        if not self.taxonomy:
            return {'error': 'Taxonomy not loaded'}
        
        top_level = [item for item in self.taxonomy if '-' not in item['code']]
        subcategories = [item for item in self.taxonomy if '-' in item['code']]
        
        return {
            'total_categories': len(self.taxonomy),
            'top_level_categories': len(top_level),
            'subcategories': len(subcategories),
            'max_depth': max(item['level'] for item in self.taxonomy),
            'sample_categories': [f"{item['code']} ({item['label']})" for item in top_level[:10]]
        }

# Global instance
iab_classification_helper = IABClassificationHelper()