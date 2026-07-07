"""Make the repo root (for `import bridge.app` as a namespace package) and
this tests directory (for `import fixtures`) importable, regardless of how
pytest was invoked."""

import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TESTS_DIR.parents[1]

for path in (str(REPO_ROOT), str(TESTS_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)
