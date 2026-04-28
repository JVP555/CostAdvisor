"""landed cost adjustments + freight lane defaults

Adds the JSONB shape used by the Incoterm normalizer:
- formula_versions.landed_cost_adjustments
- actual_prices.landed_cost_adjustments
- cost_models.destination_region (so lane lookups are explicit)
- freight_lanes table, seeded with broad-region pairs (Europe/NA/Asia/Latam)

Adjustment object shape per bucket:
    {"type": "flat" | "pct", "value": <float>}
Buckets: export_clear, main_freight, insurance, import_clear, duty, last_mile

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-04-28 14:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'n4o5p6q7r8s9'
down_revision: Union[str, None] = 'm3n4o5p6q7r8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


REGIONS = ("Europe", "NA", "Asia", "Latam")


# Seed values are typical $/MT-equivalent broad estimates used as defaults
# when a price-level adjustment is missing. Users can override per lane.
# Sea mode default; airfreight + road can be added later.
LANE_SEEDS = {
    ("NA", "Europe"): {
        "main_freight": ("flat", 80),  "insurance": ("pct", 0.3),
        "export_clear": ("flat", 15), "import_clear": ("flat", 25),
        "duty": ("pct", 6.5),         "last_mile": ("flat", 30),
    },
    ("Europe", "NA"): {
        "main_freight": ("flat", 90),  "insurance": ("pct", 0.3),
        "export_clear": ("flat", 20), "import_clear": ("flat", 30),
        "duty": ("pct", 3.5),         "last_mile": ("flat", 35),
    },
    ("NA", "Asia"): {
        "main_freight": ("flat", 140), "insurance": ("pct", 0.4),
        "export_clear": ("flat", 15), "import_clear": ("flat", 35),
        "duty": ("pct", 8.0),         "last_mile": ("flat", 40),
    },
    ("Asia", "NA"): {
        "main_freight": ("flat", 130), "insurance": ("pct", 0.4),
        "export_clear": ("flat", 18), "import_clear": ("flat", 30),
        "duty": ("pct", 3.5),         "last_mile": ("flat", 35),
    },
    ("Europe", "Asia"): {
        "main_freight": ("flat", 110), "insurance": ("pct", 0.4),
        "export_clear": ("flat", 20), "import_clear": ("flat", 35),
        "duty": ("pct", 8.0),         "last_mile": ("flat", 40),
    },
    ("Asia", "Europe"): {
        "main_freight": ("flat", 100), "insurance": ("pct", 0.4),
        "export_clear": ("flat", 18), "import_clear": ("flat", 30),
        "duty": ("pct", 6.5),         "last_mile": ("flat", 35),
    },
    ("NA", "Latam"): {
        "main_freight": ("flat", 60),  "insurance": ("pct", 0.4),
        "export_clear": ("flat", 15), "import_clear": ("flat", 40),
        "duty": ("pct", 12.0),        "last_mile": ("flat", 45),
    },
    ("Latam", "NA"): {
        "main_freight": ("flat", 60),  "insurance": ("pct", 0.4),
        "export_clear": ("flat", 25), "import_clear": ("flat", 30),
        "duty": ("pct", 3.5),         "last_mile": ("flat", 35),
    },
    ("Europe", "Latam"): {
        "main_freight": ("flat", 110), "insurance": ("pct", 0.4),
        "export_clear": ("flat", 20), "import_clear": ("flat", 40),
        "duty": ("pct", 12.0),        "last_mile": ("flat", 45),
    },
    ("Latam", "Europe"): {
        "main_freight": ("flat", 100), "insurance": ("pct", 0.4),
        "export_clear": ("flat", 25), "import_clear": ("flat", 30),
        "duty": ("pct", 6.5),         "last_mile": ("flat", 35),
    },
    ("Asia", "Latam"): {
        "main_freight": ("flat", 150), "insurance": ("pct", 0.5),
        "export_clear": ("flat", 18), "import_clear": ("flat", 40),
        "duty": ("pct", 12.0),        "last_mile": ("flat", 45),
    },
    ("Latam", "Asia"): {
        "main_freight": ("flat", 150), "insurance": ("pct", 0.5),
        "export_clear": ("flat", 25), "import_clear": ("flat", 35),
        "duty": ("pct", 8.0),         "last_mile": ("flat", 40),
    },
    # Intra-region "lanes" — usually overland, much cheaper, no duty.
    ("Europe", "Europe"): {
        "main_freight": ("flat", 30), "insurance": ("pct", 0.2),
        "export_clear": ("flat", 0), "import_clear": ("flat", 0),
        "duty": ("pct", 0),          "last_mile": ("flat", 20),
    },
    ("NA", "NA"): {
        "main_freight": ("flat", 35), "insurance": ("pct", 0.2),
        "export_clear": ("flat", 0), "import_clear": ("flat", 0),
        "duty": ("pct", 0),          "last_mile": ("flat", 20),
    },
    ("Asia", "Asia"): {
        "main_freight": ("flat", 40), "insurance": ("pct", 0.3),
        "export_clear": ("flat", 10), "import_clear": ("flat", 20),
        "duty": ("pct", 5.0),         "last_mile": ("flat", 25),
    },
    ("Latam", "Latam"): {
        "main_freight": ("flat", 45), "insurance": ("pct", 0.3),
        "export_clear": ("flat", 15), "import_clear": ("flat", 25),
        "duty": ("pct", 8.0),         "last_mile": ("flat", 30),
    },
}


def _seed_payload(buckets: dict) -> dict:
    return {k: {"type": t, "value": v} for k, (t, v) in buckets.items()}


def upgrade() -> None:
    op.add_column(
        'formula_versions',
        sa.Column('landed_cost_adjustments', JSONB, nullable=True),
    )
    op.add_column(
        'actual_prices',
        sa.Column('landed_cost_adjustments', JSONB, nullable=True),
    )
    op.add_column(
        'cost_models',
        sa.Column('destination_region', sa.String(20), nullable=True),
    )

    op.create_table(
        'freight_lanes',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('origin_region', sa.String(20), nullable=False),
        sa.Column('destination_region', sa.String(20), nullable=False),
        sa.Column('mode', sa.String(10), nullable=False, server_default='sea'),
        sa.Column('adjustments', JSONB, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('origin_region', 'destination_region', 'mode',
                            name='uq_freight_lanes_route'),
    )

    # Seed: emit one INSERT per pair so the migration is rerunnable on a clean
    # DB. Use raw SQL to embed the JSONB literals.
    import json
    conn = op.get_bind()
    for (origin, dest), buckets in LANE_SEEDS.items():
        payload = _seed_payload(buckets)
        conn.execute(
            sa.text(
                "INSERT INTO freight_lanes (origin_region, destination_region, mode, adjustments) "
                "VALUES (:o, :d, 'sea', :adj)"
            ),
            {"o": origin, "d": dest, "adj": json.dumps(payload)},
        )


def downgrade() -> None:
    op.drop_table('freight_lanes')
    op.drop_column('cost_models', 'destination_region')
    op.drop_column('actual_prices', 'landed_cost_adjustments')
    op.drop_column('formula_versions', 'landed_cost_adjustments')
