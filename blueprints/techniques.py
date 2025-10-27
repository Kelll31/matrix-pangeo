"""
=============================================================================
MITRE ATT&CK Techniques Blueprint v11.0 - PRODUCTION READY
=============================================================================

Полный API для работы с техниками MITRE ATT&CK

Таблица techniques:
- id (VARCHAR(50)) - ID техники (attack-pattern--uuid)
- attack_id (VARCHAR(20)) - MITRE ATT&CK ID (T1001, T1059.001)
- name (VARCHAR(500)) - Название техники
- name_ru (VARCHAR(500)) - Название на русском
- description (TEXT) - Описание
- description_ru (TEXT) - Описание на русском
- platforms (JSON) - Платформы
- data_sources (JSON) - Источники данных
- permissions_required (JSON) - Требуемые привилегии
- version (DECIMAL(5,2)) - Версия
- deprecated (TINYINT(1)) - Устаревшая
- revoked (TINYINT(1)) - Отозванная
- created_at (TIMESTAMP) - Дата создания
- updated_at (TIMESTAMP) - Дата обновления

Связанные таблицы:
- technique_tactics - Связь техник с тактиками
- correlation_rules - Правила корреляции
- technique_metadata - Метаданные техник
- technique_comments - Комментарии к техникам

@author Storm Labs
@version 11.0.0-PRODUCTION
@date 2025-10-13
"""

from flask import Blueprint, request, jsonify, g
from sqlalchemy import func, text, and_, or_, desc, case
import traceback
from models.database import db, Techniques, CorrelationRules, Tactics, TechniqueTactics
from utils.helpers import (
    create_success_response,
    create_error_response,
    sanitize_input,
    parse_json_field,
    paginate_query,
    validate_required_fields,
)
from utils.auth import authenticate_request
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

# =============================================================================
# BLUEPRINT
# =============================================================================

techniques_bp = Blueprint("techniques", __name__)

# =============================================================================
# GET ENDPOINTS
# =============================================================================


@techniques_bp.route("/", methods=["GET"])
@techniques_bp.route("/list", methods=["GET"])
def list_techniques():
    """
    Список всех техник с пагинацией и фильтрацией
    """
    try:
        logger.info(f"📋 GET /techniques/ - list_techniques() called")

        # Параметры пагинации
        page = max(1, int(request.args.get("page", 1)))
        limit = min(1000, max(10, int(request.args.get("limit", 20))))

        query = db.session.query(
            Techniques,
            func.count(CorrelationRules.id).label("rules_count"),
            func.sum(func.IF(CorrelationRules.active == True, 1, 0)).label(
                "active_rules_count"
            ),
        ).outerjoin(
            CorrelationRules,
            and_(
                Techniques.attack_id == CorrelationRules.technique_id,
                CorrelationRules.status != "deleted",
            ),
        )

        # ФИЛЬТРЫ

        # 1. По умолчанию скрываем отозванные
        show_revoked = request.args.get("revoked", "false").lower() == "true"
        if not show_revoked:
            query = query.filter(Techniques.revoked == False)

        # 2. Устаревшие техники
        if request.args.get("deprecated") is not None:
            deprecated = request.args.get("deprecated").lower() == "true"
            query = query.filter(Techniques.deprecated == deprecated)

        # 3. Платформа
        if request.args.get("platform"):
            platform = sanitize_input(request.args.get("platform"))
            query = query.filter(
                text("JSON_CONTAINS(techniques.platforms, :platform)")
            ).params(platform=f'"{platform}"')

        # 4. Покрытие правилами
        coverage = request.args.get("coverage")
        if coverage == "covered":
            query = query.having(text("active_rules_count > 0"))
        elif coverage == "uncovered":
            query = query.having(text("active_rules_count = 0"))

        # 5. Тактика
        if request.args.get("tactic"):
            tactic_shortname = sanitize_input(request.args.get("tactic"))
            query = query.join(
                TechniqueTactics, Techniques.id == TechniqueTactics.technique_id
            ).join(
                Tactics,
                and_(
                    TechniqueTactics.tactic_id == Tactics.id,
                    Tactics.x_mitre_shortname == tactic_shortname,
                ),
            )

        # 6. Поиск
        if request.args.get("search"):
            search_term = sanitize_input(request.args.get("search"))
            query = query.filter(
                or_(
                    Techniques.attack_id.like(f"%{search_term}%"),
                    Techniques.name.like(f"%{search_term}%"),
                    Techniques.name_ru.like(f"%{search_term}%"),
                    Techniques.description.like(f"%{search_term}%"),
                )
            )

        # Group by
        query = query.group_by(Techniques.id)

        # СОРТИРОВКА
        sort_field = request.args.get("sort", "attack_id")
        sort_order = request.args.get("order", "asc")

        if sort_field == "rules_count":
            if sort_order == "desc":
                query = query.order_by(desc(text("rules_count")))
            else:
                query = query.order_by(text("rules_count"))
        elif sort_field == "name":
            if sort_order == "desc":
                query = query.order_by(desc(Techniques.name))
            else:
                query = query.order_by(Techniques.name)
        else:  # attack_id
            if sort_order == "desc":
                query = query.order_by(desc(Techniques.attack_id))
            else:
                query = query.order_by(Techniques.attack_id)

        # ПАГИНАЦИЯ
        total = query.count()
        offset = (page - 1) * limit
        results = query.limit(limit).offset(offset).all()

        # ФОРМАТИРОВАНИЕ
        techniques = []
        for technique, rules_count, active_rules_count in results:
            technique_data = {
                "id": technique.id,
                "technique_id": technique.attack_id,
                "attack_id": technique.attack_id,
                "name": technique.name,
                "name_ru": technique.name_ru,
                "description": (
                    technique.description[:200] + "..."
                    if technique.description and len(technique.description) > 200
                    else technique.description
                ),
                "description_ru": (
                    technique.description_ru[:200] + "..."
                    if technique.description_ru and len(technique.description_ru) > 200
                    else technique.description_ru
                ),
                "platforms": parse_json_field(technique.platforms, []),
                "data_sources": parse_json_field(technique.data_sources, []),
                "permissions_required": parse_json_field(
                    technique.permissions_required, []
                ),
                "version": float(technique.version) if technique.version else 1.0,
                "deprecated": bool(technique.deprecated),
                "revoked": bool(technique.revoked),
                "rules_count": int(rules_count) if rules_count else 0,
                "active_rules_count": (
                    int(active_rules_count) if active_rules_count else 0
                ),
                "has_coverage": (
                    int(active_rules_count) > 0 if active_rules_count else False
                ),
                "created_at": (
                    technique.created_at.isoformat() if technique.created_at else None
                ),
                "updated_at": (
                    technique.updated_at.isoformat() if technique.updated_at else None
                ),
            }
            techniques.append(technique_data)

        # PAGINATION INFO
        pagination = {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit,
            "has_next": page < (total + limit - 1) // limit,
            "has_prev": page > 1,
        }

        response_data = {"techniques": techniques, "pagination": pagination}

        logger.info(
            f"✅ Returned {len(techniques)} techniques (page {page}/{pagination['pages']})"
        )
        return create_success_response(response_data)

    except Exception as e:
        logger.error(f"❌ Failed to retrieve techniques list: {e}")
        return create_error_response(
            f"Failed to retrieve techniques list: {str(e)}", 500
        )


@techniques_bp.route("/<technique_id>", methods=["GET"])
def get_technique(technique_id):
    """
    Получить конкретную технику по ID

    URL Parameters:
        technique_id (str): ID техники (T1001 или UUID)

    Query Parameters:
        include_rules (bool): Включить правила (default: true)
        include_tactics (bool): Включить тактики (default: true)
        include_comments (bool): Включить комментарии (default: false)

    Returns:
        JSON: Детали техники со всеми связанными данными
    """
    try:
        logger.info(f"🎯 GET /techniques/{technique_id}")

        technique_id = sanitize_input(technique_id)

        # Запрос техники с подсчетом правил
        technique_query = (
            db.session.query(
                Techniques,
                func.count(CorrelationRules.id).label("rules_count"),
                func.sum(case((CorrelationRules.active == True, 1), else_=0)).label(
                    "active_rules_count"
                ),
            )
            .outerjoin(
                CorrelationRules,
                and_(
                    Techniques.attack_id == CorrelationRules.technique_id,
                    CorrelationRules.status != "deleted",
                ),
            )
            .filter(
                or_(Techniques.attack_id == technique_id, Techniques.id == technique_id)
            )
            .group_by(Techniques.id)
            .first()
        )

        if not technique_query:
            logger.warning(f"⚠️ Technique not found: {technique_id}")
            return create_error_response("Technique not found", 404)

        technique, rules_count, active_rules_count = technique_query

        # БАЗОВЫЕ ДАННЫЕ ТЕХНИКИ (ВСЕ ПОЛЯ ИЗ БД)
        technique_data = {
            "id": technique.id,
            "attack_id": technique.attack_id,
            "technique_id": technique.attack_id,  # Alias для совместимости
            "name": technique.name,
            "name_ru": technique.name_ru,
            "description": technique.description,
            "description_ru": technique.description_ru,
            "platforms": parse_json_field(technique.platforms, []),
            "data_sources": parse_json_field(technique.data_sources, []),
            "permissions_required": parse_json_field(
                technique.permissions_required, []
            ),
            "version": float(technique.version) if technique.version else 1.0,
            "deprecated": bool(technique.deprecated),
            "revoked": bool(technique.revoked),
            "created_at": (
                technique.created_at.isoformat() if technique.created_at else None
            ),
            "updated_at": (
                technique.updated_at.isoformat() if technique.updated_at else None
            ),
            # Статистика
            "rules_count": int(rules_count) if rules_count else 0,
            "active_rules_count": int(active_rules_count) if active_rules_count else 0,
            "has_coverage": (
                int(active_rules_count) > 0 if active_rules_count else False
            ),
        }

        # ТАКТИКИ
        include_tactics = request.args.get("include_tactics", "true").lower() == "true"
        if include_tactics:
            tactics_query = (
                db.session.query(Tactics)
                .join(TechniqueTactics, Tactics.id == TechniqueTactics.tactic_id)
                .filter(TechniqueTactics.technique_id == technique.id)
                .order_by(
                    case(
                        (Tactics.x_mitre_shortname == "initial-access", 1),
                        (Tactics.x_mitre_shortname == "execution", 2),
                        (Tactics.x_mitre_shortname == "persistence", 3),
                        (Tactics.x_mitre_shortname == "privilege-escalation", 4),
                        (Tactics.x_mitre_shortname == "defense-evasion", 5),
                        (Tactics.x_mitre_shortname == "credential-access", 6),
                        (Tactics.x_mitre_shortname == "discovery", 7),
                        (Tactics.x_mitre_shortname == "lateral-movement", 8),
                        (Tactics.x_mitre_shortname == "collection", 9),
                        (Tactics.x_mitre_shortname == "exfiltration", 10),
                        (Tactics.x_mitre_shortname == "command-and-control", 11),
                        (Tactics.x_mitre_shortname == "impact", 12),
                        else_=99,
                    )
                )
                .all()
            )

            technique_data["tactics"] = [
                {
                    "id": tactic.id,
                    "name": tactic.name,
                    "name_ru": tactic.name_ru,
                    "x_mitre_shortname": tactic.x_mitre_shortname,
                    "description": tactic.description,
                }
                for tactic in tactics_query
            ]

            # Kill chain phases для совместимости с MITRE ATT&CK
            technique_data["kill_chain_phases"] = [
                {
                    "phase_name": tactic.x_mitre_shortname,
                    "kill_chain_name": "mitre-attack",
                }
                for tactic in tactics_query
            ]

        # ПРАВИЛА КОРРЕЛЯЦИИ (ЯВНО УКАЗЫВАЕМ КОЛОНКИ!)
        include_rules = request.args.get("include_rules", "true").lower() == "true"
        if include_rules:
            # ⚠️ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: выбираем только существующие поля
            rules_query = (
                db.session.query(
                    CorrelationRules.id,
                    CorrelationRules.name,
                    CorrelationRules.name_ru,
                    CorrelationRules.description,
                    CorrelationRules.severity,
                    CorrelationRules.active,
                    CorrelationRules.status,
                    CorrelationRules.logic_type,
                    CorrelationRules.confidence,
                    CorrelationRules.author,
                    CorrelationRules.created_at,
                )
                .filter(
                    and_(
                        CorrelationRules.technique_id == technique.attack_id,
                        CorrelationRules.status != "deleted",
                    )
                )
                .order_by(
                    CorrelationRules.active.desc(),
                    CorrelationRules.severity.desc(),
                    CorrelationRules.created_at.desc(),
                )
                .all()
            )

            technique_data["rules"] = [
                {
                    "id": rule.id,
                    "rule_id": rule.id,
                    "name": rule.name,
                    "name_ru": rule.name_ru,
                    "description": rule.description,
                    "severity": rule.severity,
                    "active": bool(rule.active),
                    "status": rule.status,
                    "logic_type": rule.logic_type,
                    "confidence": rule.confidence,
                    "author": rule.author,
                    "created_at": (
                        rule.created_at.isoformat() if rule.created_at else None
                    ),
                }
                for rule in rules_query
            ]

        # КОММЕНТАРИИ
        include_comments = (
            request.args.get("include_comments", "false").lower() == "true"
        )
        if include_comments:
            try:
                from models.database import Comments

                comments_query = (
                    db.session.query(Comments)
                    .filter(
                        Comments.entity_type == "technique",
                        Comments.entity_id == technique.attack_id,
                        Comments.status != "deleted",
                    )
                    .order_by(Comments.created_at.desc())
                    .all()
                )

                technique_data["comments"] = [
                    {
                        "id": comment.id,
                        "text": comment.text,
                        "comment_type": comment.comment_type,
                        "author": comment.author_name,
                        "created_at": (
                            comment.created_at.isoformat()
                            if comment.created_at
                            else None
                        ),
                    }
                    for comment in comments_query
                ]
                technique_data["comments_count"] = len(comments_query)
            except Exception as e:
                logger.warning(f"⚠️ Could not load comments: {e}")
                technique_data["comments"] = []
                technique_data["comments_count"] = 0

        logger.info(f"✅ Technique {technique_id} retrieved successfully")
        return create_success_response({"technique": technique_data})

    except Exception as e:
        logger.error(
            f"❌ Failed to retrieve technique {technique_id}: {e}", exc_info=True
        )
        return create_error_response(f"Failed to retrieve technique: {str(e)}", 500)


@techniques_bp.route("/matrix", methods=["GET"])
def get_matrix_data():
    """
    (Устарело) Получить данные MITRE ATT&CK матрицы для визуализации 

    Query Parameters:
        include_deprecated (bool): Включить устаревшие (default: false)
        platform (str): Фильтр по платформе

    Returns:
        JSON:
            success (bool)
            data (object):
                tactics (array): Список тактик
                techniques (array): Список техник с привязкой к тактикам
                statistics (object): Статистика матрицы
    """
    try:
        logger.info("🎯 GET /techniques/matrix - Generating matrix data...")

        # Получаем параметры
        include_deprecated = (
            request.args.get("include_deprecated", "false").lower() == "true"
        )
        platform_filter = request.args.get("platform")

        # =====================================================================
        # 1. ЗАГРУЗКА ТАКТИК
        # =====================================================================

        # Формируем фильтр для deprecated техник
        deprecated_condition = "" if include_deprecated else "AND t.deprecated = 0"

        tactics_query = text(
            f"""
            SELECT 
                tac.id, 
                tac.name, 
                tac.name_ru, 
                tac.x_mitre_shortname,
                tac.description, 
                tac.description_ru,
                COUNT(DISTINCT t.attack_id) as techniques_count
            FROM tactics tac
            LEFT JOIN technique_tactics tt ON tac.id = tt.tactic_id
            LEFT JOIN techniques t ON tt.technique_id = t.id 
                AND t.revoked = 0
                {deprecated_condition}
            GROUP BY 
                tac.id, 
                tac.name, 
                tac.name_ru, 
                tac.x_mitre_shortname, 
                tac.description, 
                tac.description_ru
            ORDER BY
                CASE tac.x_mitre_shortname
                    WHEN 'initial-access' THEN 1
                    WHEN 'execution' THEN 2
                    WHEN 'persistence' THEN 3
                    WHEN 'privilege-escalation' THEN 4
                    WHEN 'defense-evasion' THEN 5
                    WHEN 'credential-access' THEN 6
                    WHEN 'discovery' THEN 7
                    WHEN 'lateral-movement' THEN 8
                    WHEN 'collection' THEN 9
                    WHEN 'exfiltration' THEN 10
                    WHEN 'command-and-control' THEN 11
                    WHEN 'impact' THEN 12
                    ELSE 99
                END
        """
        )

        tactics_data = db.session.execute(tactics_query).fetchall()

        # =====================================================================
        # 2. ЗАГРУЗКА ТЕХНИК
        # =====================================================================

        # Формируем WHERE условия
        where_conditions = ["t.revoked = 0"]

        if not include_deprecated:
            where_conditions.append("t.deprecated = 0")

        if platform_filter:
            where_conditions.append(
                f"JSON_CONTAINS(t.platforms, '\"{platform_filter}\"')"
            )

        where_clause = " AND ".join(where_conditions)

        techniques_query = text(
            f"""
            SELECT 
                t.id, 
                t.attack_id, 
                t.name, 
                t.name_ru, 
                t.description, 
                t.description_ru,
                t.platforms, 
                t.data_sources, 
                t.permissions_required,
                t.version, 
                t.deprecated, 
                t.revoked,
                COUNT(DISTINCT cr.id) as rules_count,
                COUNT(DISTINCT CASE WHEN cr.active = 1 THEN cr.id END) as active_rules_count,
                GROUP_CONCAT(DISTINCT tac.id ORDER BY tac.id) as tactics_list
            FROM techniques t
            LEFT JOIN correlation_rules cr 
                ON t.attack_id = cr.technique_id 
                AND cr.status != 'deleted'
            LEFT JOIN technique_tactics tt ON t.id = tt.technique_id
            LEFT JOIN tactics tac ON tt.tactic_id = tac.id
            WHERE {where_clause}
            GROUP BY 
                t.id, 
                t.attack_id, 
                t.name, 
                t.name_ru, 
                t.description, 
                t.description_ru,
                t.platforms, 
                t.data_sources, 
                t.permissions_required,
                t.version, 
                t.deprecated, 
                t.revoked
            ORDER BY t.attack_id
        """
        )

        techniques_raw = db.session.execute(techniques_query).fetchall()

        # =====================================================================
        # 3. ФОРМАТИРОВАНИЕ ТАКТИК
        # =====================================================================
        tactics = []
        for tactic in tactics_data:
            tactics.append(
                {
                    "id": tactic.id,
                    "name": tactic.name,
                    "name_ru": tactic.name_ru or tactic.name,
                    "x_mitre_shortname": tactic.x_mitre_shortname,
                    "description": tactic.description,
                    "description_ru": tactic.description_ru,
                    "techniques_count": (
                        int(tactic.techniques_count) if tactic.techniques_count else 0
                    ),
                }
            )

        # =====================================================================
        # 4. ФОРМАТИРОВАНИЕ ТЕХНИК
        # =====================================================================
        techniques = []
        for tech in techniques_raw:
            # Парсим список тактик
            tactics_list = []
            if tech.tactics_list:
                tactics_list = [t.strip() for t in tech.tactics_list.split(",")]

            # Парсим JSON поля
            platforms = parse_json_field(tech.platforms, [])
            data_sources = parse_json_field(tech.data_sources, [])
            permissions = parse_json_field(tech.permissions_required, [])

            # Подсчёт правил
            rules_count = int(tech.rules_count) if tech.rules_count else 0
            active_rules_count = (
                int(tech.active_rules_count) if tech.active_rules_count else 0
            )

            techniques.append(
                {
                    "id": tech.id,
                    "techniqueid": tech.attack_id,
                    "attack_id": tech.attack_id,
                    "name": tech.name,
                    "name_ru": tech.name_ru or tech.name,
                    "description": (
                        tech.description[:300] + "..."
                        if tech.description and len(tech.description) > 300
                        else tech.description
                    ),
                    "description_ru": (
                        tech.description_ru[:300] + "..."
                        if tech.description_ru and len(tech.description_ru) > 300
                        else tech.description_ru
                    ),
                    "platforms": platforms,
                    "data_sources": data_sources,
                    "permissions_required": permissions,
                    "version": float(tech.version) if tech.version else 1.0,
                    "deprecated": bool(tech.deprecated),
                    "revoked": bool(tech.revoked),
                    "tactics": tactics_list,
                    "rulescount": rules_count,
                    "activerulescount": active_rules_count,
                    "hascoverage": active_rules_count > 0,
                }
            )

        # =====================================================================
        # 5. СТАТИСТИКА
        # =====================================================================
        stats_query = text(
            """
            SELECT 
                COUNT(DISTINCT t.attack_id) as total_techniques,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS(
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id 
                        AND cr.active = 1 
                        AND cr.status != 'deleted'
                    ) THEN t.attack_id 
                END) as covered_techniques,
                COUNT(DISTINCT cr.id) as total_rules,
                COUNT(DISTINCT CASE WHEN cr.active = 1 THEN cr.id END) as active_rules,
                COUNT(DISTINCT CASE WHEN t.deprecated = 1 THEN t.attack_id END) as deprecated_techniques
            FROM techniques t
            LEFT JOIN correlation_rules cr 
                ON t.attack_id = cr.technique_id 
                AND cr.status != 'deleted'
            WHERE t.revoked = 0
        """
        )

        stats = db.session.execute(stats_query).fetchone()

        total_techniques = int(stats.total_techniques) if stats.total_techniques else 0
        covered_techniques = (
            int(stats.covered_techniques) if stats.covered_techniques else 0
        )

        statistics = {
            "totaltechniques": total_techniques,
            "coveredtechniques": covered_techniques,
            "uncoveredtechniques": total_techniques - covered_techniques,
            "totalrules": int(stats.total_rules) if stats.total_rules else 0,
            "activerules": int(stats.active_rules) if stats.active_rules else 0,
            "deprecatedtechniques": (
                int(stats.deprecated_techniques) if stats.deprecated_techniques else 0
            ),
            "coveragepercentage": (
                round((covered_techniques / total_techniques * 100), 2)
                if total_techniques > 0
                else 0
            ),
        }

        # =====================================================================
        # 6. ФОРМИРОВАНИЕ ОТВЕТА
        # =====================================================================
        matrix_data = {
            "tactics": tactics,
            "techniques": techniques,
            "statistics": statistics,
            "generated_at": datetime.utcnow().isoformat(),
            "version": "15.1",
        }

        logger.info(
            f"✅ Matrix generated: {len(tactics)} tactics, {len(techniques)} techniques"
        )
        return create_success_response(matrix_data)

    except Exception as e:
        logger.error(f"❌ Failed to generate matrix: {e}")
        logger.error(traceback.format_exc())
        return create_error_response(f"Matrix generation failed: {str(e)}", 500)


# =============================================================================
# ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ПАРСИНГА JSON
# =============================================================================
def parse_json_field(field_value, default=None):
    """
    Безопасный парсинг JSON поля из БД

    Args:
        field_value: Значение поля (строка или None)
        default: Значение по умолчанию

    Returns:
        Распарсенное значение или default
    """
    if default is None:
        default = []

    if not field_value:
        return default

    try:
        # Если уже list/dict - возвращаем как есть
        if isinstance(field_value, (list, dict)):
            return field_value

        # Парсим JSON строку
        import json

        return json.loads(field_value)
    except (json.JSONDecodeError, TypeError):
        return default


@techniques_bp.route("/search", methods=["GET"])
def search_techniques():
    """
    Поиск техник по различным критериям

    Query Parameters:
        q (str): Поисковый запрос
        limit (int): Максимальное количество результатов (default: 50)

    Returns:
        JSON:
            success (bool)
            data (object):
                query (str): Поисковый запрос
                techniques (array): Найденные техники
                count (int): Количество результатов
    """
    try:
        query_str = sanitize_input(request.args.get("q", ""))

        if not query_str:
            return create_error_response("Search query is required", 400)

        if len(query_str) < 2:
            return create_error_response(
                "Search query must be at least 2 characters", 400
            )

        limit = min(50, max(5, int(request.args.get("limit", 50))))

        logger.info(f"🔍 Searching for: {query_str}")

        # Поисковый запрос
        search_query = (
            db.session.query(
                Techniques,
                func.count(CorrelationRules.id).label("rules_count"),
                func.count(func.case([(CorrelationRules.active == True, 1)])).label(
                    "active_rules_count"
                ),
            )
            .outerjoin(
                CorrelationRules,
                and_(
                    Techniques.attack_id == CorrelationRules.technique_id,
                    CorrelationRules.active == True,
                ),
            )
            .filter(
                and_(
                    Techniques.revoked == False,
                    or_(
                        Techniques.attack_id.like(f"%{query_str}%"),
                        Techniques.name.like(f"%{query_str}%"),
                        Techniques.name_ru.like(f"%{query_str}%"),
                        Techniques.description.like(f"%{query_str}%"),
                        Techniques.description_ru.like(f"%{query_str}%"),
                    ),
                )
            )
            .group_by(Techniques.id)
            .order_by(
                # Сортировка по релевантности
                func.case(
                    [
                        (Techniques.attack_id == query_str.upper(), 1),
                        (Techniques.name.like(f"{query_str}%"), 2),
                        (Techniques.name_ru.like(f"{query_str}%"), 3),
                    ],
                    else_=4,
                ),
                Techniques.attack_id,
            )
            .limit(limit)
        )

        results = search_query.all()

        # Форматирование результатов
        techniques = []
        for technique, rules_count, active_rules_count in results:
            technique_data = {
                "technique_id": technique.attack_id,
                "attack_id": technique.attack_id,
                "name": technique.name,
                "name_ru": technique.name_ru,
                "description": (
                    technique.description[:200] + "..."
                    if technique.description and len(technique.description) > 200
                    else technique.description
                ),
                "platforms": parse_json_field(technique.platforms, []),
                "deprecated": bool(technique.deprecated),
                "rules_count": int(rules_count) if rules_count else 0,
                "active_rules_count": (
                    int(active_rules_count) if active_rules_count else 0
                ),
                "has_coverage": (
                    int(active_rules_count) > 0 if active_rules_count else False
                ),
            }
            techniques.append(technique_data)

        response_data = {
            "query": query_str,
            "techniques": techniques,
            "count": len(techniques),
        }

        logger.info(f"✅ Found {len(techniques)} techniques")
        return create_success_response(response_data)

    except Exception as e:
        logger.error(f"❌ Search failed: {e}")
        return create_error_response(f"Search failed: {str(e)}", 500)


@techniques_bp.route("/coverage", methods=["GET"])
def get_coverage_statistics():
    """
    Получить статистику покрытия техник правилами

    Returns:
        JSON:
            success (bool)
            data (object):
                coverage (array): Детальная статистика по каждой технике
                summary (object): Общая статистика
    """
    try:
        logger.info("📊 GET /techniques/coverage")

        coverage_query = text(
            """
            SELECT t.attack_id, t.name, t.name_ru,
                   COUNT(DISTINCT cr.id) as total_rules,
                   COUNT(DISTINCT CASE WHEN cr.active = 1 THEN cr.id END) as active_rules,
                   CASE
                       WHEN COUNT(DISTINCT CASE WHEN cr.active = 1 THEN cr.id END) > 0
                       THEN 'covered'
                       WHEN COUNT(DISTINCT cr.id) > 0
                       THEN 'partially_covered'
                       ELSE 'not_covered'
                   END as coverage_status
            FROM techniques t
            LEFT JOIN correlation_rules cr ON t.attack_id = cr.technique_id AND cr.status != 'deleted'
            WHERE t.revoked = 0
            GROUP BY t.attack_id, t.name, t.name_ru
            ORDER BY active_rules DESC, t.attack_id
        """
        )

        coverage_data = db.session.execute(coverage_query).fetchall()

        # Форматирование
        coverage = []
        covered = 0
        partially_covered = 0
        not_covered = 0

        for item in coverage_data:
            coverage.append(
                {
                    "technique_id": item.attack_id,
                    "name": item.name,
                    "name_ru": item.name_ru,
                    "total_rules": int(item.total_rules) if item.total_rules else 0,
                    "active_rules": int(item.active_rules) if item.active_rules else 0,
                    "coverage_status": item.coverage_status,
                }
            )

            if item.coverage_status == "covered":
                covered += 1
            elif item.coverage_status == "partially_covered":
                partially_covered += 1
            else:
                not_covered += 1

        total = len(coverage_data)
        coverage_percentage = round((covered / total * 100), 2) if total > 0 else 0

        summary = {
            "total_techniques": total,
            "covered_techniques": covered,
            "partially_covered_techniques": partially_covered,
            "not_covered_techniques": not_covered,
            "coverage_percentage": coverage_percentage,
        }

        response_data = {"coverage": coverage, "summary": summary}

        logger.info(
            f"✅ Coverage stats: {covered}/{total} covered ({coverage_percentage}%)"
        )
        return create_success_response(response_data)

    except Exception as e:
        logger.error(f"❌ Failed to get coverage: {e}")
        return create_error_response(f"Failed to retrieve coverage: {str(e)}", 500)


# =============================================================================
# EXPORT
# =============================================================================

__all__ = ["techniques_bp"]

logger.info("✅ Techniques Blueprint v11.0 loaded successfully")
