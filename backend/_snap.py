import sys, json
from sqlalchemy import create_engine, text
url = sys.argv[1]
e = create_engine(url)
tables = ["formula_templates","formula_region_coverage","formula_template_components",
          "type_codes","commodity_indexes","index_monthly_values","dimension_assertions",
          "volatility_calibrations","users","teams","audit_logs","market_signals",
          "dimension_terms","producers","editorial_blocks","negotiation_windows"]
out = {}
with e.connect() as c:
    for t in tables:
        try: out[t] = c.execute(text(f"SELECT count(*) FROM {t}")).scalar()
        except Exception: out[t] = None
    out["_active_calibration"] = c.execute(text(
        "SELECT n_rungs FROM volatility_calibrations WHERE is_active")).scalar()
print(json.dumps(out))
