"""add fixed_value to team_index_sources

Allows a team to configure a commodity+region with source_type='fixed',
where a single constant value applies across all periods (no scraping,
no per-quarter overrides).

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-04-20 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'j0k1l2m3n4o5'
down_revision: Union[str, None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'team_index_sources',
        sa.Column('fixed_value', sa.Numeric(14, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('team_index_sources', 'fixed_value')
