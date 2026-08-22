from app.tasks import celery_app
from app.database import SessionLocal, bypass_rls_var
from app.models.index_data import IndexValue
from app.services.index_projection import run_projection, DEFAULT_HORIZON_QUARTERS


@celery_app.task(name="app.tasks.project_indexes.project_all")
def project_all(horizon_quarters: int = DEFAULT_HORIZON_QUARTERS):
    """Refresh the projection vintage for every (commodity, region) pair that
    has at least one IndexValue row. Scheduled after the weekly scrape jobs
    so each fit uses that week's freshest actuals."""
    bypass_rls_var.set(True)  # System task — no user context
    db = SessionLocal()
    try:
        pairs = (
            db.query(IndexValue.commodity_id, IndexValue.region)
            .distinct()
            .all()
        )

        results = {}
        for commodity_id, region in pairs:
            run = run_projection(db, commodity_id, region, horizon_quarters=horizon_quarters)
            results[f"{commodity_id}:{region}"] = run.status

        return results
    finally:
        db.close()
