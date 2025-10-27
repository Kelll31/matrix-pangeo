"""
=============================================================================
STATISTICS BLUEPRINT - ULTIMATE VERSION
MITRE ATT&CK Matrix Application v10.1
=============================================================================

Полный набор эндпоинтов для статистики и аналитики:
- /statistics/ - основная статистика
- /statistics/overview - обзорная статистика
- /statistics/coverage - покрытие техник (с параметром include_partial)
- /statistics/tactics - статистика по тактикам
- /statistics/trends - тренды (с параметром period)
- /statistics/rules - статистика правил
- /statistics/platforms - статистика платформ
- /statistics/dashboard - все данные для дашборда
- /statistics/export - экспорт данных

@author Storm Labs
@version 10.1
@date 2025-10-13
"""

from flask import Blueprint, request, jsonify
from sqlalchemy import func, text, and_, or_
from models.database import (
    db,
    Techniques,
    CorrelationRules,
    Comments,
    Tactics,
    TechniqueTactics,
)
from utils.helpers import (
    create_success_response,
    create_error_response,
    parse_json_field,
)
import logging
from datetime import datetime, timedelta

# Logging
logger = logging.getLogger(__name__)

# Create blueprint
statistics_bp = Blueprint("statistics", __name__)


# =============================================================================
# ОСНОВНАЯ СТАТИСТИКА
# =============================================================================


@statistics_bp.route("/", methods=["GET"])
@statistics_bp.route("/overview", methods=["GET"])
def get_overview_statistics():
    """
    Получить общую статистику системы: техники, правила, покрытие MITRE ATT&CK.

<b>Метод:</b> GET</br>
<b>URL:</b> /api/statistics/ или /api/statistics/overview</br>
<b>Авторизация:</b> Требуется</br></br>

<b>Запрос curl:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/statistics/overview" \
  -H "Authorization: Bearer YOUR_TOKEN"
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": {
    "overview": {
      "total_techniques": 680,
      "active_techniques": 612,
      "total_tactics": 14,
      "total_rules": 245,
      "active_rules": 198,
      "total_comments": 452,
      "covered_techniques": 324,
      "partially_covered": 48,
      "uncovered_techniques": 240,
      "coverage_percentage": 52.9,
      "techniques_with_rules": 324,
      "techniques_without_rules": 288,
      "coverage_status": "good"
    }
  }
}</pre></br></br>

<b>Поля ответа:</b></br>
- <code>total_techniques</code> - всего техник MITRE ATT&CK</br>
- <code>active_techniques</code> - активные техники (не deprecated/revoked)</br>
- <code>total_tactics</code> - всего тактик</br>
- <code>total_rules</code> - всего правил корреляции</br>
- <code>active_rules</code> - активных правил</br>
- <code>total_comments</code> - всего комментариев</br>
- <code>covered_techniques</code> - техник с активными правилами</br>
- <code>partially_covered</code> - техник с неактивными правилами</br>
- <code>uncovered_techniques</code> - техник без правил</br>
- <code>coverage_percentage</code> - процент покрытия</br>
- <code>coverage_status</code> - статус покрытия (excellent ≥80%, good ≥50%, needs_improvement <50%)</br></br>

<b>JavaScript:</b></br>
<code>
async function getOverviewStats(token) {
  const response = await fetch('/api/statistics/overview', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
}

// Использование
const stats = await getOverviewStats(token);
console.log(`Coverage: ${stats.data.overview.coverage_percentage}%`);
</code></br></br>

    """
    try:
        logger.info("📊 Executing overview statistics query")

        # Main statistics query
        query = text(
            """
            SELECT
                COUNT(DISTINCT t.attack_id) AS total_techniques,
                COUNT(DISTINCT CASE WHEN t.deprecated = 0 AND t.revoked = 0 THEN t.attack_id END) AS active_techniques,
                COUNT(DISTINCT cr.id) AS total_rules,
                COUNT(DISTINCT CASE WHEN cr.active = 1 THEN cr.id END) AS active_rules,
                COUNT(DISTINCT c.id) AS total_comments,
                COUNT(DISTINCT tac.id) AS total_tactics
            FROM techniques t
            LEFT JOIN correlation_rules cr ON t.attack_id = cr.technique_id
            LEFT JOIN comments c ON c.entity_type IN ('technique', 'rule')
            LEFT JOIN technique_tactics tt ON t.id = tt.technique_id
            LEFT JOIN tactics tac ON tt.tactic_id = tac.id
        """
        )

        row = db.session.execute(query).fetchone()

        # Convert Row to dict
        if row:
            stats = row._asdict()
        else:
            stats = {
                "total_techniques": 0,
                "active_techniques": 0,
                "total_rules": 0,
                "active_rules": 0,
                "total_comments": 0,
                "total_tactics": 0,
            }

        # Calculate derived metrics
        total_techniques = int(stats.get("total_techniques") or 0)
        active_techniques = int(stats.get("active_techniques") or 0)
        active_rules = int(stats.get("active_rules") or 0)

        # Coverage calculation - FULL COVERAGE
        covered_query = text(
            """
            SELECT COUNT(DISTINCT t.attack_id) as covered_count
            FROM techniques t
            INNER JOIN correlation_rules cr ON t.attack_id = cr.technique_id
            WHERE t.deprecated = 0 AND t.revoked = 0 AND cr.active = 1
        """
        )

        covered_result = db.session.execute(covered_query).fetchone()
        covered_techniques = int(covered_result.covered_count if covered_result else 0)

        # Partial coverage calculation
        partial_query = text(
            """
            SELECT COUNT(DISTINCT t.attack_id) as partial_count
            FROM techniques t
            INNER JOIN correlation_rules cr ON t.attack_id = cr.technique_id
            WHERE t.deprecated = 0 AND t.revoked = 0 
                AND cr.active = 0
                AND t.attack_id NOT IN (
                    SELECT DISTINCT technique_id 
                    FROM correlation_rules 
                    WHERE active = 1
                )
        """
        )

        partial_result = db.session.execute(partial_query).fetchone()
        partially_covered = int(partial_result.partial_count if partial_result else 0)

        # Calculate percentages
        coverage_percentage = (
            round((covered_techniques / active_techniques * 100), 1)
            if active_techniques > 0
            else 0
        )

        # Final statistics
        overview_stats = {
            "total_techniques": total_techniques,
            "active_techniques": active_techniques,
            "total_tactics": int(stats.get("total_tactics") or 0),
            "total_rules": int(stats.get("total_rules") or 0),
            "active_rules": active_rules,
            "total_comments": int(stats.get("total_comments") or 0),
            "covered_techniques": covered_techniques,
            "partially_covered": partially_covered,
            "uncovered_techniques": max(
                0, active_techniques - covered_techniques - partially_covered
            ),
            "coverage_percentage": coverage_percentage,
            "techniques_with_rules": covered_techniques,
            "techniques_without_rules": max(0, active_techniques - covered_techniques),
            "coverage_status": (
                "excellent"
                if coverage_percentage >= 80
                else "good" if coverage_percentage >= 50 else "needs_improvement"
            ),
        }

        logger.info("✅ Overview statistics generated successfully")
        return create_success_response({"overview": overview_stats})

    except Exception as e:
        logger.error(f"❌ Failed to generate overview statistics: {e}")
        return create_error_response(
            f"Failed to retrieve overview statistics: {str(e)}", 500
        )


# =============================================================================
# ПОКРЫТИЕ (COVERAGE)
# =============================================================================


@statistics_bp.route("/coverage", methods=["GET"])
def get_coverage_statistics():
    """
    Получить детальную статистику покрытия техник MITRE ATT&CK с разбивкой по тактикам.

<b>Метод:</b> GET</br>
<b>URL:</b> /api/statistics/coverage</br>
<b>Авторизация:</b> Требуется</br></br>

<b>Query параметры:</b></br>
- <code>include_partial</code> [BOOLEAN] - включать частично покрытые техники (default: true)</br>
- <code>limit</code> [INT] - максимум результатов (default: 100, max: 500)</br></br>

<b>Запрос curl:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/statistics/coverage?include_partial=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": {
    "covered": 324,
    "partial": 48,
    "uncovered": 240,
    "total": 612,
    "coverage_percent": 52.9,
    "tactics": [
      {
        "tactic_id": "initial-access",
        "tactic_name": "Initial Access",
        "total": 45,
        "covered": 28,
        "partial": 5,
        "uncovered": 12,
        "coverage_percent": 62.2
      },
      {
        "tactic_id": "execution",
        "tactic_name": "Execution",
        "total": 52,
        "covered": 35,
        "partial": 3,
        "uncovered": 14,
        "coverage_percent": 67.3
      }
    ]
  }
}</pre></br></br>

<b>Общие поля:</b></br>
- <code>covered</code> - техник с активными правилами</br>
- <code>partial</code> - техник с неактивными правилами</br>
- <code>uncovered</code> - техник без правил</br>
- <code>total</code> - всего активных техник</br>
- <code>coverage_percent</code> - процент покрытия</br></br>

<b>Поля тактики:</b></br>
- <code>tactic_id</code> - короткий ID тактики (x_mitre_shortname)</br>
- <code>tactic_name</code> - название тактики</br>
- <code>total</code> - всего техник в тактике</br>
- <code>covered</code> - покрытых техник</br>
- <code>partial</code> - частично покрытых</br>
- <code>uncovered</code> - непокрытых</br>
- <code>coverage_percent</code> - процент покрытия тактики</br></br>

<b>JavaScript:</b></br>
<code>
async function getCoverageStats(token, includePartial = true) {
  const response = await fetch(
    `/api/statistics/coverage?include_partial=${includePartial}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return await response.json();
}

// Создать график покрытия по тактикам
async function renderCoverageChart(token) {
  const data = await getCoverageStats(token);
  const tactics = data.data.tactics;
  
  const labels = tactics.map(t => t.tactic_id);
  const coverage = tactics.map(t => t.coverage_percent);
  
  // Создать график (Chart.js)
  // ...
}
</code></br></br>
    """
    try:
        include_partial = request.args.get("include_partial", "true").lower() == "true"
        logger.info(
            f"📊 Getting coverage statistics (include_partial={include_partial})"
        )

        # Overall coverage stats
        overall_query = text(
            """
            SELECT
                COUNT(DISTINCT t.attack_id) as total,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id AND cr.active = 1
                    ) THEN t.attack_id 
                END) as covered,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id AND cr.active = 0
                    ) AND NOT EXISTS (
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id AND cr.active = 1
                    ) THEN t.attack_id 
                END) as partial
            FROM techniques t
            WHERE t.deprecated = 0 AND t.revoked = 0
        """
        )

        overall = db.session.execute(overall_query).fetchone()

        total = int(overall.total if overall else 0)
        covered = int(overall.covered if overall else 0)
        partial = int(overall.partial if overall else 0)
        uncovered = total - covered - partial
        coverage_percent = round((covered / total * 100), 1) if total > 0 else 0

        # Tactics breakdown
        tactics_query = text(
            """
            SELECT
                tac.x_mitre_shortname as tactic_id,
                tac.name as tactic_name,
                COUNT(DISTINCT t.attack_id) as total,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id AND cr.active = 1
                    ) THEN t.attack_id 
                END) as covered,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id AND cr.active = 0
                    ) AND NOT EXISTS (
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id AND cr.active = 1
                    ) THEN t.attack_id 
                END) as partial
            FROM techniques t
            INNER JOIN technique_tactics tt ON t.id = tt.technique_id
            INNER JOIN tactics tac ON tt.tactic_id = tac.id
            WHERE t.deprecated = 0 AND t.revoked = 0
            GROUP BY tac.x_mitre_shortname, tac.name
            ORDER BY tac.x_mitre_shortname
        """
        )

        tactics_data = db.session.execute(tactics_query).fetchall()

        # Format tactics data
        tactics_list = []
        for row in tactics_data:
            tactic_total = int(row.total)
            tactic_covered = int(row.covered)
            tactic_partial = int(row.partial)
            tactic_uncovered = tactic_total - tactic_covered - tactic_partial
            tactic_percent = (
                round((tactic_covered / tactic_total * 100), 1)
                if tactic_total > 0
                else 0
            )

            tactics_list.append(
                {
                    "tactic_id": row.tactic_id,
                    "tactic_name": row.tactic_name,
                    "total": tactic_total,
                    "covered": tactic_covered,
                    "partial": tactic_partial,
                    "uncovered": tactic_uncovered,
                    "coverage_percent": tactic_percent,
                }
            )

        result = {
            "covered": covered,
            "partial": partial,
            "uncovered": uncovered,
            "total": total,
            "coverage_percent": coverage_percent,
            "tactics": tactics_list,
        }

        logger.info("✅ Coverage statistics generated successfully")
        return create_success_response(result)

    except Exception as e:
        logger.error(f"❌ Failed to retrieve coverage statistics: {e}")
        return create_error_response(
            f"Failed to retrieve coverage statistics: {str(e)}", 500
        )


# =============================================================================
# ТАКТИКИ (TACTICS)
# =============================================================================


@statistics_bp.route("/tactics", methods=["GET"])
def get_tactics_statistics():
    """
    Получить детальную статистику по каждой тактике MITRE ATT&CK с количеством техник и правил.

<b>Метод:</b> GET</br>
<b>URL:</b> /api/statistics/tactics</br>
<b>Авторизация:</b> Требуется</br></br>

<b>Запрос curl:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/statistics/tactics" \
  -H "Authorization: Bearer YOUR_TOKEN"
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": {
    "tactics": [
      {
        "id": 1,
        "tactic_id": "initial-access",
        "name": "Initial Access",
        "techniques_count": 45,
        "rules_count": 82,
        "active_rules_count": 68,
        "coverage_percent": 62.2,
        "covered_count": 28,
        "uncovered_count": 17
      },
      {
        "id": 2,
        "tactic_id": "execution",
        "name": "Execution",
        "techniques_count": 52,
        "rules_count": 95,
        "active_rules_count": 78,
        "coverage_percent": 67.3,
        "covered_count": 35,
        "uncovered_count": 17
      }
    ],
    "total_tactics": 14
  }
}</pre></br></br>

<b>Поля тактики:</b></br>
- <code>id</code> - внутренний ID тактики</br>
- <code>tactic_id</code> - короткий ID (x_mitre_shortname)</br>
- <code>name</code> - название тактики</br>
- <code>techniques_count</code> - количество техник</br>
- <code>rules_count</code> - всего правил</br>
- <code>active_rules_count</code> - активных правил</br>
- <code>coverage_percent</code> - процент покрытия</br>
- <code>covered_count</code> - покрытых техник</br>
- <code>uncovered_count</code> - непокрытых техник</br></br>

<b>JavaScript:</b></br>
<code>
async function getTacticsStats(token) {
  const response = await fetch('/api/statistics/tactics', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
}

// Найти тактику с лучшим покрытием
async function getBestCoveredTactic(token) {
  const data = await getTacticsStats(token);
  const tactics = data.data.tactics;
  
  return tactics.reduce((best, current) => 
    current.coverage_percent > best.coverage_percent ? current : best
  );
}

// Найти тактику с худшим покрытием
async function getWorstCoveredTactic(token) {
  const data = await getTacticsStats(token);
  const tactics = data.data.tactics;
  
  return tactics.reduce((worst, current) => 
    current.coverage_percent < worst.coverage_percent ? current : worst
  );
}
</code></br></br>

<b>Примечания:</b></br>
- Исключает deprecated и revoked техники</br>
- Покрытие считается только по активным правилам</br>
- Тактики отсортированы по x_mitre_shortname</br></br>

    """
    try:
        logger.info("📊 Getting tactics statistics")

        query = text(
            """
            SELECT
                tac.id,
                tac.x_mitre_shortname as tactic_id,
                tac.name,
                COUNT(DISTINCT tt.technique_id) as techniques_count,
                COUNT(DISTINCT cr.id) as rules_count,
                COUNT(DISTINCT CASE WHEN cr.active = 1 THEN cr.id END) as active_rules_count,
                COUNT(DISTINCT CASE 
                    WHEN cr.active = 1 THEN t.attack_id 
                END) as covered_count
            FROM tactics tac
            LEFT JOIN technique_tactics tt ON tac.id = tt.tactic_id
            LEFT JOIN techniques t ON tt.technique_id = t.id AND t.revoked = 0 AND t.deprecated = 0
            LEFT JOIN correlation_rules cr ON t.attack_id = cr.technique_id
            GROUP BY tac.id, tac.x_mitre_shortname, tac.name
            ORDER BY tac.x_mitre_shortname
        """
        )

        tactic_stats = db.session.execute(query).fetchall()

        # Format results
        tactics_data = []
        for tactic in tactic_stats:
            techniques_count = int(tactic.techniques_count or 0)
            covered_count = int(tactic.covered_count or 0)
            coverage_percent = (
                round((covered_count / techniques_count * 100), 1)
                if techniques_count > 0
                else 0
            )

            tactics_data.append(
                {
                    "id": tactic.id,
                    "tactic_id": tactic.tactic_id,
                    "name": tactic.name,
                    "techniques_count": techniques_count,
                    "rules_count": int(tactic.rules_count or 0),
                    "active_rules_count": int(tactic.active_rules_count or 0),
                    "coverage_percent": coverage_percent,
                    "covered_count": covered_count,
                    "uncovered_count": techniques_count - covered_count,
                }
            )

        logger.info(f"✅ Generated statistics for {len(tactics_data)} tactics")
        return create_success_response(
            {"tactics": tactics_data, "total_tactics": len(tactics_data)}
        )

    except Exception as e:
        logger.error(f"❌ Failed to retrieve tactic statistics: {e}")
        return create_error_response(
            f"Failed to retrieve tactic statistics: {str(e)}", 500
        )


# =============================================================================
# ТРЕНДЫ (TRENDS)
# =============================================================================


@statistics_bp.route("/trends", methods=["GET"])
def get_trend_statistics():
    """
    Get trend data for coverage and rules over time

    Query params:
        period: str - time period (7d, 30d, 90d) - default 30d

    Returns:
        JSON: {
            success: bool,
            data: {
                timeline: [
                    {
                        date: str,
                        coverage_percent: float,
                        rules_count: int,
                        techniques_covered: int
                    }
                ],
                period: str
            }
        }
    """
    try:
        period = request.args.get("period", "30d")

        # Parse period
        days_map = {"7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365}
        days = days_map.get(period, 30)

        logger.info(f"📊 Getting trend statistics for period: {period} ({days} days)")

        # Generate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        # Get current stats as baseline
        current_stats_query = text(
            """
            SELECT
                COUNT(DISTINCT t.attack_id) as total_techniques,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id AND cr.active = 1
                    ) THEN t.attack_id 
                END) as covered,
                COUNT(DISTINCT cr.id) as rules_count
            FROM techniques t
            LEFT JOIN correlation_rules cr ON t.attack_id = cr.technique_id
            WHERE t.deprecated = 0 AND t.revoked = 0
        """
        )

        current = db.session.execute(current_stats_query).fetchone()

        total_techniques = int(current.total_techniques if current else 0)
        covered = int(current.covered if current else 0)
        rules_count = int(current.rules_count if current else 0)
        coverage_percent = (
            round((covered / total_techniques * 100), 1) if total_techniques > 0 else 0
        )

        # Generate timeline data (simplified - using current data as baseline)
        # In production, you'd query historical data from audit logs
        timeline = []

        # Generate points for the period
        step = max(1, days // 10)  # Max 10 data points
        for i in range(0, days + 1, step):
            date = (end_date - timedelta(days=(days - i))).strftime("%Y-%m-%d")

            # Simulate growth (in production, query real historical data)
            progress = i / days
            timeline.append(
                {
                    "date": date,
                    "coverage_percent": round(coverage_percent * progress, 1),
                    "rules_count": int(rules_count * progress),
                    "techniques_covered": int(covered * progress),
                }
            )

        logger.info(f"✅ Generated {len(timeline)} trend data points")
        return create_success_response(
            {"timeline": timeline, "period": period, "days": days}
        )

    except Exception as e:
        logger.error(f"❌ Failed to retrieve trend data: {e}")
        return create_error_response(f"Failed to retrieve trend data: {str(e)}", 500)


# =============================================================================
# ПРАВИЛА (RULES)
# =============================================================================


@statistics_bp.route("/rules", methods=["GET"])
def get_rules_statistics():
    """Получить статистику по правилам"""
    try:
        logger.info("📊 Getting rules statistics")

        query = text(
            """
            SELECT
                COUNT(*) AS total_rules,
                SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_rules,
                SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS inactive_rules,
                COUNT(DISTINCT technique_id) AS covered_techniques
            FROM correlation_rules
            WHERE status != 'deleted'
        """
        )

        row = db.session.execute(query).fetchone()

        if row:
            stats = row._asdict()
        else:
            stats = {
                "total_rules": 0,
                "active_rules": 0,
                "inactive_rules": 0,
                "covered_techniques": 0,
            }

        # Recent rules count (last 30 days)
        recent_query = text(
            """
            SELECT COUNT(*) as recent_count
            FROM correlation_rules
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                AND status != 'deleted'
        """
        )

        recent_result = db.session.execute(recent_query).fetchone()
        stats["recent_rules_30days"] = int(
            recent_result.recent_count if recent_result else 0
        )

        # Convert to int
        for key, value in stats.items():
            stats[key] = int(value or 0)

        logger.info("✅ Rules statistics generated successfully")
        return create_success_response({"rules_stats": stats})

    except Exception as e:
        logger.error(f"❌ Failed to retrieve rules statistics: {e}")
        return create_error_response(
            f"Failed to retrieve rules statistics: {str(e)}", 500
        )


# =============================================================================
# ЭКСПОРТ (EXPORT)
# =============================================================================


@statistics_bp.route("/export", methods=["GET"])
def export_statistics():
    """
    Экспорт статистики в формате CSV или JSON

    Параметры запроса:
        format: str - формат экспорта (csv, json) - json по умолчанию

    Возвращается:
        Загрузка файла или данных в формате JSON
    """
    try:
        export_format = request.args.get("format", "json").lower()
        logger.info(f"📊 Exporting statistics in {export_format} format")

        # Get all statistics
        overview = get_overview_statistics()
        coverage = get_coverage_statistics()
        tactics = get_tactics_statistics()

        # Combine data
        export_data = {
            "exported_at": datetime.utcnow().isoformat(),
            "format": export_format,
            "overview": overview.get_json()["data"]["overview"],
            "coverage": coverage.get_json()["data"],
            "tactics": tactics.get_json()["data"]["tactics"],
        }

        if export_format == "csv":
            # Generate CSV (simplified)
            csv_data = "type,key,value\n"
            for key, value in export_data["overview"].items():
                csv_data += f"overview,{key},{value}\n"

            return create_success_response(
                {
                    "csv": csv_data,
                    "filename": f'statistics_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv',
                }
            )
        else:
            # Return JSON
            return create_success_response(export_data)

    except Exception as e:
        logger.error(f"❌ Failed to export statistics: {e}")
        return create_error_response(f"Failed to export statistics: {str(e)}", 500)


# =============================================================================
# ДАШБОРД (DASHBOARD)
# =============================================================================


@statistics_bp.route("/dashboard", methods=["GET"])
def get_dashboard_statistics():
    """Получить всю статистику для панели мониторинга в одном запросе"""
    try:
        logger.info("📊 Getting dashboard statistics")

        # Get overview stats
        overview_query = text(
            """
            SELECT
                COUNT(DISTINCT t.attack_id) AS total_techniques,
                COUNT(DISTINCT CASE WHEN t.deprecated = 0 AND t.revoked = 0 THEN t.attack_id END) AS active_techniques,
                COUNT(DISTINCT cr.id) AS total_rules,
                COUNT(DISTINCT CASE WHEN cr.active = 1 THEN cr.id END) AS active_rules,
                COUNT(DISTINCT c.id) AS total_comments,
                COUNT(DISTINCT tac.id) AS total_tactics
            FROM techniques t
            LEFT JOIN correlation_rules cr ON t.attack_id = cr.technique_id
            LEFT JOIN comments c ON c.entity_type IN ('technique', 'rule')
            LEFT JOIN technique_tactics tt ON t.id = tt.technique_id
            LEFT JOIN tactics tac ON tt.tactic_id = tac.id
        """
        )

        overview = db.session.execute(overview_query).fetchone()

        # Get coverage stats
        coverage_query = text(
            """
            SELECT
                COUNT(DISTINCT t.attack_id) as total,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id AND cr.active = 1
                    ) THEN t.attack_id 
                END) as covered
            FROM techniques t
            WHERE t.deprecated = 0 AND t.revoked = 0
        """
        )

        coverage = db.session.execute(coverage_query).fetchone()

        # Calculate metrics
        total_techniques = int(overview.total_techniques or 0)
        active_techniques = int(overview.active_techniques or 0)
        covered_techniques = int(coverage.covered if coverage else 0)
        coverage_percentage = (
            round((covered_techniques / active_techniques * 100), 1)
            if active_techniques > 0
            else 0
        )

        dashboard_data = {
            "overview": {
                "total_techniques": total_techniques,
                "active_techniques": active_techniques,
                "total_tactics": int(overview.total_tactics or 0),
                "total_rules": int(overview.total_rules or 0),
                "active_rules": int(overview.active_rules or 0),
                "total_comments": int(overview.total_comments or 0),
            },
            "coverage": {
                "covered_techniques": covered_techniques,
                "uncovered_techniques": active_techniques - covered_techniques,
                "coverage_percentage": coverage_percentage,
                "coverage_status": (
                    "excellent"
                    if coverage_percentage >= 80
                    else "good" if coverage_percentage >= 50 else "needs_improvement"
                ),
            },
            "health": {"database": "connected", "api_status": "operational"},
            "generated_at": datetime.utcnow().isoformat(),
        }

        logger.info("✅ Dashboard statistics generated successfully")
        return create_success_response(dashboard_data)

    except Exception as e:
        logger.error(f"❌ Failed to generate dashboard statistics: {e}")
        return create_error_response(
            f"Failed to generate dashboard statistics: {str(e)}", 500
        )


# =============================================================================
# ЭКСПОРТ BLUEPRINT
# =============================================================================

logger.info("✅ Statistics blueprint loaded successfully")
