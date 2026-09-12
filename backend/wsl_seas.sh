export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /mnt/c/Users/lenovo/Desktop/CostAdvisor/backend
source venv/bin/activate
python -m pytest -q tests/test_seasonality.py 2>&1 | tail -5
