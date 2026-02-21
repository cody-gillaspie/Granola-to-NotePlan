#!/bin/bash
set -e

# Extract version from plugin.json
VERSION=$(grep '"plugin.version"' plugin.json | sed 's/.*: "\(.*\)".*/\1/')
TAG="granola.sync-v${VERSION}"

echo "Releasing ${TAG}..."

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: You have uncommitted changes. Commit them first."
  exit 1
fi

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag ${TAG} already exists."
  exit 1
fi

# Create annotated tag
git tag -a "$TAG" -m "Release v${VERSION}"
git push origin "$TAG"

# Extract changelog for this version (between first two ## headers)
NOTES=$(awk '/^## \['"${VERSION}"'\]/{found=1; next} found && /^## \[/{exit} found{print}' CHANGELOG.md)

# Create GitHub release with assets
gh release create "$TAG" \
  --title "Granola Sync v${VERSION}" \
  --notes "$NOTES" \
  plugin.json script.js README.md

echo ""
echo "Done! https://github.com/dannymcc/Granola-to-NotePlan/releases/tag/${TAG}"
