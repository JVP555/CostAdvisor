#!/bin/bash
cd /mnt/c/Users/lenovo/Desktop/CostAdvisor/backend
source venv/bin/activate
python -m pytest tests/test_intelligence.py -q 2>&1 | tail -6
