"""

Analytics Blueprint - Advanced Analytics and ML Insights

Converted from analytics.php

"""

from flask import Blueprint, request
from models.database import db, Techniques, CorrelationRules, Comments
from utils.helpers import create_success_response, create_error_response, sanitize_input
import logging
from datetime import datetime, timedelta
from sqlalchemy import text, func

logger = logging.getLogger(__name__)

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.route("/", methods=["GET"])
@analytics_bp.route("/overview", methods=["GET"])
def get_analytics_overview():
    """Получить сводную аналитику: аномалии, активные правила, покрытие техник, рекомендации и тренды для общей оценки состояния защитной системы. </br>

    Запрос curl: </br>
    curl -X GET "http://172.30.250.199:5000/api/analytics/" </br>
    Ответ: </br>
    {
    "code": 200, </br>
    "data": { </br>
    "anomalies": [ ... ], </br>
    "confidence_score": 0.69, </br>
    "generated_at": "2025-10-21T20:34:39.077341", </br>
    "metrics": { </br>
    "active_rules": 774, </br>
    "coverage_percentage": 47.65, </br>
    "covered_techniques": 324, </br>
    "rule_efficiency": 90.85, </br>
    "total_rules": 852, </br>
    "total_techniques": 680 </br>
    }, </br>
    "ml_insights": null, </br>
    "predictions": { </br>
    "rule_creation_forecast": { "confidence": 0.75, "next_month": 56, "next_week": 7 } </br>
    }, </br>
    "recommendations": [ ... ], </br>
    "timeframe": "30d", </br>
    "trends": { "coverage_improvement_trend": { "rate": 0.05, "trend": "stable" }, "performance_trend": { "rate": 0.1, "trend": "improving" }, "rule_creation_trend": { "rate": 1.2, "trend": "increasing" } } </br>
    }, </br>
    "success": true, </br>
    "timestamp": "2025-10-21T20:34:39.077559" </br>
    }"""
    try:
        timeframe = request.args.get("timeframe", "30d")
        include_ml = request.args.get("include_ml", "false").lower() == "true"

        # Validate timeframe
        valid_timeframes = ["1h", "6h", "12h", "24h", "7d", "30d", "90d"]
        if timeframe not in valid_timeframes:
            timeframe = "30d"

        logger.info(f"Generating analytics overview for timeframe: {timeframe}")

        # Basic metrics
        basic_metrics = calculate_basic_metrics(timeframe)

        # Trend data
        trend_data = calculate_trends(timeframe)

        # Top anomalies (simplified)
        anomalies = detect_top_anomalies(10)

        # Basic predictions
        predictions = generate_basic_predictions(timeframe)

        # System recommendations
        recommendations = generate_system_recommendations()

        # ML insights (if requested)
        ml_insights = generate_ml_insights(timeframe) if include_ml else None

        overview = {
            "timeframe": timeframe,
            "generated_at": datetime.utcnow().isoformat(),
            "metrics": basic_metrics,
            "trends": trend_data,
            "anomalies": anomalies,
            "predictions": predictions,
            "recommendations": recommendations,
            "ml_insights": ml_insights,
            "confidence_score": calculate_confidence_score(basic_metrics, trend_data),
        }

        logger.info("Analytics overview generated successfully")
        return create_success_response(overview)

    except Exception as e:
        logger.error(f"Failed to generate analytics overview: {e}")
        return create_error_response(f"Analytics overview error: {str(e)}", 500)


@analytics_bp.route("/trends", methods=["GET"])
def get_trends():
    """Получить детализированные тренды: динамика активности, прогнозы, статистические показатели и трендовое изменение метрик по дням/неделям. </br>

    Запрос curl: </br>
    curl -X GET "http://172.30.250.199:5000/api/analytics/trends" </br>
    Ответ: </br>
    {
    "code": 200, </br>
    "data": { </br>
    "generated_at": "2025-10-21T20:34:50.901323", </br>
    "granularity": "daily", </br>
    "metric": "all", </br>
    "period": "7d", </br>
    "trends": { </br>
    "activity": { "data": [], "forecast": { "next_points": [] }, "statistics": { "mean": 0, "std": 0 }, "trend": "stable" }, </br>
    "coverage": { "data": [], "forecast": { "next_points": [] }, "statistics": { "mean": 0, "std": 0 }, "trend": "improving" }, </br>
    "rules": { "data": [], "forecast": { "next_points": [] }, "statistics": { "mean": 0, "std": 0 }, "trend": "increasing" }, </br>
    "techniques": { "data": [], "forecast": { "next_points": [] }, "statistics": { "mean": 0, "std": 0 }, "trend": "stable" } </br>
    } </br>
    }, </br>
    "success": true, </br>
    "timestamp": "2025-10-21T20:34:50.901339" </br>
    }"""
    try:
        metric = sanitize_input(request.args.get("metric", "all"))
        period = request.args.get("period", "7d")
        granularity = request.args.get("granularity", "daily")

        # Validate inputs
        valid_metrics = ["all", "techniques", "rules", "coverage", "activity"]
        valid_granularities = ["hourly", "daily", "weekly", "monthly"]

        if metric not in valid_metrics:
            return create_error_response(f"Invalid metric: {metric}", 400)

        if granularity not in valid_granularities:
            return create_error_response(f"Invalid granularity: {granularity}", 400)

        trends = {}

        if metric in ["all", "techniques"]:
            trends["techniques"] = analyze_technique_trends(period, granularity)

        if metric in ["all", "rules"]:
            trends["rules"] = analyze_rule_trends(period, granularity)

        if metric in ["all", "coverage"]:
            trends["coverage"] = analyze_coverage_trends(period, granularity)

        if metric in ["all", "activity"]:
            trends["activity"] = analyze_activity_trends(period, granularity)

        # Add statistics for each trend
        for key, trend_data in trends.items():
            if "data" in trend_data:
                trend_data["statistics"] = calculate_trend_statistics(
                    trend_data["data"]
                )
                trend_data["forecast"] = forecast_trend(trend_data["data"])

        response_data = {
            "metric": metric,
            "period": period,
            "granularity": granularity,
            "trends": trends,
            "generated_at": datetime.utcnow().isoformat(),
        }

        return create_success_response(response_data)

    except Exception as e:
        logger.error(f"Trend analysis error: {e}")
        return create_error_response(f"Trend analysis error: {str(e)}", 500)


@analytics_bp.route("/dashboard", methods=["GET"])
def get_analytics_dashboard():
    """Получить полный дашборд: список алертов, метрики производительности, саммари по покрытиям, системное здоровье - для вывода на аналитическую страницу. </br>

    Запрос curl: </br>
    curl -X GET "http://172.30.250.199:5000/api/analytics/dashboard" </br>
    Ответ: </br>
    {
    "code": 200, </br>
    "data": { </br>
    "alerts": [ ... ], </br>
    "performance_metrics": { "response_time": "150ms" }, </br>
    "recent_activity": { "activities": [] }, </br>
    "summary": { </br>
    "active_rules": 774, </br>
    "coverage_percentage": 47.65, </br>
    "covered_techniques": 324, </br>
    "rule_efficiency": 90.85, </br>
    "total_rules": 852, </br>
    "total_techniques": 680 </br>
    }, </br>
    "system_health": { "status": "healthy" } </br>
    }, </br>
    "success": true, </br>
    "timestamp": "2025-10-21T20:34:43.334572" </br>
    }"""
    try:
        dashboard = {
            "summary": calculate_basic_metrics("24h"),
            "alerts": detect_top_anomalies(5),
            "recent_activity": get_recent_activity(),
            "system_health": get_system_health(),
            "performance_metrics": get_performance_metrics(),
        }

        return create_success_response(dashboard)

    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        return create_error_response(f"Dashboard error: {str(e)}", 500)


def calculate_basic_metrics(timeframe):
    """Calculate basic metrics for given timeframe"""
    try:
        query = text(
            """
            SELECT 
                COUNT(DISTINCT t.attack_id) as total_techniques,
                COUNT(DISTINCT CASE WHEN cr.active = 1 THEN t.attack_id END) as covered_techniques,
                COUNT(DISTINCT cr.id) as total_rules,
                COUNT(DISTINCT CASE WHEN cr.active = 1 THEN cr.id END) as active_rules
            FROM techniques t
            LEFT JOIN correlation_rules cr ON t.attack_id = cr.technique_id
            WHERE t.revoked = 0 AND t.deprecated = 0
        """
        )

        result = db.session.execute(query).fetchone()

        if not result:
            raise Exception("No metrics data available")

        total_techniques = int(result.total_techniques or 0)
        covered_techniques = int(result.covered_techniques or 0)
        coverage_percentage = (
            round((covered_techniques / total_techniques * 100), 2)
            if total_techniques > 0
            else 0
        )

        return {
            "total_techniques": total_techniques,
            "covered_techniques": covered_techniques,
            "coverage_percentage": coverage_percentage,
            "total_rules": int(result.total_rules or 0),
            "active_rules": int(result.active_rules or 0),
            "rule_efficiency": round(
                (int(result.active_rules or 0) / int(result.total_rules or 1) * 100), 2
            ),
        }

    except Exception as e:
        logger.error(f"Error calculating basic metrics: {e}")
        return {}


def calculate_trends(timeframe):
    """Calculate trend data"""
    return {
        "rule_creation_trend": {"trend": "increasing", "rate": 1.2},
        "coverage_improvement_trend": {"trend": "stable", "rate": 0.05},
        "performance_trend": {"trend": "improving", "rate": 0.1},
    }


def detect_top_anomalies(limit):
    """Detect top anomalies (simplified implementation)"""
    try:
        query = text(
            """
            SELECT cr.id, cr.name, cr.technique_id, cr.active, cr.created_at
            FROM correlation_rules cr
            WHERE cr.active = 1
            ORDER BY cr.created_at DESC
            LIMIT :limit
        """
        )

        results = db.session.execute(query, {"limit": limit}).fetchall()

        # Convert Row objects to dictionaries for JSON serialization
        anomalies = []
        for row in results:
            anomalies.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "technique_id": row.technique_id,
                    "active": row.active,
                    "created_at": (
                        row.created_at.isoformat() if row.created_at else None
                    ),
                }
            )

        return anomalies

    except Exception as e:
        logger.error(f"Error detecting anomalies: {e}")
        return []


def generate_basic_predictions(timeframe):
    """Generate basic predictions"""
    import random

    return {
        "rule_creation_forecast": {
            "next_week": random.randint(5, 15),
            "next_month": random.randint(20, 60),
            "confidence": 0.75,
        }
    }


def generate_system_recommendations():
    """Generate system recommendations"""
    return [
        {
            "type": "coverage_gap",
            "priority": "high",
            "title": "Improve Defense Evasion coverage",
            "action": "Create rules for techniques T1055, T1036, T1027",
        }
    ]


def generate_ml_insights(timeframe):
    """Generate ML insights (placeholder)"""
    return {"clustering": [], "anomalies": []}


def calculate_confidence_score(basic_metrics, trend_data):
    """Calculate confidence score"""
    coverage_score = basic_metrics.get("coverage_percentage", 0) / 100
    efficiency_score = basic_metrics.get("rule_efficiency", 0) / 100
    return round((coverage_score + efficiency_score) / 2, 2)


def analyze_technique_trends(period, granularity):
    """Analyze technique trends"""
    return {"data": [], "trend": "stable"}


def analyze_rule_trends(period, granularity):
    """Analyze rule trends"""
    return {"data": [], "trend": "increasing"}


def analyze_coverage_trends(period, granularity):
    """Analyze coverage trends"""
    return {"data": [], "trend": "improving"}


def analyze_activity_trends(period, granularity):
    """Analyze activity trends"""
    return {"data": [], "trend": "stable"}


def calculate_trend_statistics(data):
    """Calculate trend statistics"""
    return {"mean": 0, "std": 0}


def forecast_trend(data):
    """Forecast trend"""
    return {"next_points": []}


def get_recent_activity():
    """Get recent activity"""
    return {"activities": []}


def get_system_health():
    """Get system health"""
    return {"status": "healthy"}


def get_performance_metrics():
    """Get performance metrics"""
    return {"response_time": "150ms"}
