"""
Blueprints package initialization
"""

from .techniques import techniques_bp
from .rules import rules_bp
from .statistics import statistics_bp
from .comments import comments_bp
from .users import users_bp
from .analytics import analytics_bp
from .audit import audit_bp

__all__ = [
    "techniques_bp",
    "rules_bp",
    "statistics_bp",
    "comments_bp",
    "users_bp",
    "analytics_bp",
    "audit_bp",
]
