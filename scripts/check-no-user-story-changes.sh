#!/bin/bash
# Check that no user story files have been modified
# Usage: ./scripts/check-no-user-story-changes.sh
# Exit code: 0 if no changes, 1 if changes detected

set -e

USER_STORIES_DIR="user-stories"
CHANGES_DETECTED=0

# Check for uncommitted changes in user-stories/
if git diff --quiet "$USER_STORIES_DIR/" 2>/dev/null; then
  echo "✓ No uncommitted changes in user-stories/"
else
  echo "✗ Uncommitted changes detected in user-stories/:"
  git diff --name-only "$USER_STORIES_DIR/"
  CHANGES_DETECTED=1
fi

# Check for staged changes in user-stories/
if git diff --cached --quiet "$USER_STORIES_DIR/" 2>/dev/null; then
  echo "✓ No staged changes in user-stories/"
else
  echo "✗ Staged changes detected in user-stories/:"
  git diff --cached --name-only "$USER_STORIES_DIR/"
  CHANGES_DETECTED=1
fi

# Check for untracked files in user-stories/
UNTRACKED=$(git ls-files --others --exclude-standard "$USER_STORIES_DIR/" 2>/dev/null || echo "")
if [ -z "$UNTRACKED" ]; then
  echo "✓ No untracked files in user-stories/"
else
  echo "✗ Untracked files detected in user-stories/:"
  echo "$UNTRACKED"
  CHANGES_DETECTED=1
fi

if [ $CHANGES_DETECTED -eq 0 ]; then
  echo ""
  echo "✓ All checks passed: user stories are unchanged"
  exit 0
else
  echo ""
  echo "✗ User story changes detected"
  exit 1
fi
