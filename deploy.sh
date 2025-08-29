#!/bin/bash

# IAB Category Matching Improvements Deployment Script
# This script will commit and push all changes to trigger Render deployment

echo "🚀 Preparing to deploy IAB category matching improvements..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository. Please run this from your project root."
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Found uncommitted changes. Adding all files..."
    git add .
    
    echo "📝 Committing changes..."
    git commit -m "feat: Enhanced IAB category matching in segment builder

- Fixed /api/iab31 endpoint with multiple fallback strategies
- Added hybrid approach showing all IAB categories with data indicators  
- Enhanced UI with searchable, hierarchical category selection
- Added real-time validation and impact estimation
- Improved filtering logic with hierarchical matching support
- Added comprehensive error handling and recovery

Key improvements:
- Shows all 600+ IAB 3.1 categories instead of just those in data
- Visual indicators (✓) for categories with data
- Searchable interface with hierarchical grouping
- Real-time validation and conflict detection
- Impact estimation showing expected result counts
- Hierarchical matching (IAB1 includes IAB1-1, IAB1-2, etc.)
- Multiple fallback strategies for reliable taxonomy loading"

    if [ $? -eq 0 ]; then
        echo "✅ Changes committed successfully!"
    else
        echo "❌ Error committing changes. Please check git status."
        exit 1
    fi
else
    echo "ℹ️  No uncommitted changes found."
fi

# Push to main branch
echo "🚀 Pushing to main branch to trigger deployment..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to main branch!"
    echo ""
    echo "🎯 Deployment Status:"
    echo "   • GitHub Actions will automatically deploy to Render"
    echo "   • Monitor deployment at: https://dashboard.render.com"
    echo "   • Check build logs for any issues"
    echo ""
    echo "🧪 After deployment, verify:"
    echo "   • Segment Builder loads without errors"
    echo "   • IAB categories show proper names (not just codes)"
    echo "   • Search and filtering work correctly"
    echo "   • Data indicators (✓) appear for categories with data"
    echo "   • Validation messages appear for conflicts"
    echo ""
    echo "📋 See DEPLOYMENT_SUMMARY.md for detailed testing checklist"
    echo ""
    echo "🚀 Deployment initiated successfully!"
else
    echo "❌ Error pushing to main branch. Please check your git configuration and network connection."
    exit 1
fi