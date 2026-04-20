"""add incoterm to cost_models

Incoterm (EXW, FCA, FOB, CFR, CIF, CPT, CIP, DPU, DAP, DDP, FAS) is a
first-class attribute of the reference price on a cost model. It
materially changes the landed cost so it must be stored alongside the
price, not inferred.

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-04-20 12:01:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'cost_models',
        sa.Column('incoterm', sa.String(8), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('cost_models', 'incoterm')
