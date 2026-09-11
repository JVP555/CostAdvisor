#!/bin/bash
cd /mnt/c/Users/lenovo/Desktop/CostAdvisor/backend
source venv/bin/activate
echo "collected:"; python -m pytest --collect-only -q 2>/dev/null | tail -2
echo "parametrized tests (counts vary with data):"
grep -rln "parametrize" tests/ | head
