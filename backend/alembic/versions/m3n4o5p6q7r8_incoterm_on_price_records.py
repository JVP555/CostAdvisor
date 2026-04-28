"""move incoterm onto price-bearing records

Adds incoterm + named_place columns to formula_versions, actual_prices, and
commodity_indexes. The cost_models.incoterm column is retained as the default
fallback used when a formula version doesn't specify its own basis.

Existing formula_versions are backfilled with the parent cost_model's
incoterm so nothing regresses.

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-04-28 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'm3n4o5p6q7r8'
down_revision: Union[str, None] = 'l2m3n4o5p6q7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'formula_versions',
        sa.Column('incoterm', sa.String(8), nullable=True),
    )
    op.add_column(
        'formula_versions',
        sa.Column('named_place', sa.String(128), nullable=True),
    )
    op.add_column(
        'actual_prices',
        sa.Column('incoterm', sa.String(8), nullable=True),
    )
    op.add_column(
        'actual_prices',
        sa.Column('named_place', sa.String(128), nullable=True),
    )
    op.add_column(
        'commodity_indexes',
        sa.Column('quoted_incoterm', sa.String(8), nullable=True),
    )
    op.add_column(
        'commodity_indexes',
        sa.Column('quoted_named_place', sa.String(128), nullable=True),
    )

    # Backfill formula_versions.incoterm from the parent cost_model so existing
    # versions inherit the basis they were created under.
    op.execute("""
        UPDATE formula_versions fv
        SET incoterm = cm.incoterm
        FROM cost_models cm
        WHERE fv.cost_model_id = cm.id
          AND cm.incoterm IS NOT NULL
          AND fv.incoterm IS NULL
    """)


def downgrade() -> None:
    op.drop_column('commodity_indexes', 'quoted_named_place')
    op.drop_column('commodity_indexes', 'quoted_incoterm')
    op.drop_column('actual_prices', 'named_place')
    op.drop_column('actual_prices', 'incoterm')
    op.drop_column('formula_versions', 'named_place')
    op.drop_column('formula_versions', 'incoterm')
