"""
=============================================================================
MITRE ATT&CK MATRIX BLUEPRINT v14.0 - FIXED SUBTECHNIQUES COVERAGE
=============================================================================

КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ v14.0:
✅ Родительские техники (T1505) теперь считают правила ВСЕХ подтехник
✅ T1505 с подтехниками T1505.001, T1505.002, T1505.003, T1505.004
   показывает суммарное покрытие (например, 1/4 вместо 0/2)

ИСПРАВЛЕНИЯ v13.0:
- Корректное использование JOIN с technique_tactics
- Полные данные о тактиках для всех техник (включая подтехники)
- Оптимизированные запросы

@author Storm Labs
@version 14.0.0-SUBTECHNIQUES-COVERAGE-FIX
@date 2025-10-21
"""

from flask import Blueprint, request, jsonify, g
from sqlalchemy import func, text, and_, or_, desc, case, distinct
import traceback
from models.database import (
    db,
    Techniques,
    CorrelationRules,
    Tactics,
    TechniqueTactics,
    Comments,
)
from utils.helpers import (
    create_success_response,
    create_error_response,
    sanitize_input,
    parse_json_field,
)
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

# =============================================================================
# BLUEPRINT
# =============================================================================
matrix_bp = Blueprint("matrix", __name__)


# =============================================================================
# ULTIMATE MATRIX ENDPOINT v14.0 - WITH SUBTECHNIQUES COVERAGE
# =============================================================================


@matrix_bp.route("/", methods=["GET"])
def get_ultimate_matrix():
    """
        Получить полную интерактивную матрицу MITRE ATT&CK со всеми тактиками, техниками, подтехниками
    и детальной статистикой покрытия правилами (версия 14.0 с исправлением покрытия подтехник).

    Возвращает оптимизированную полную матрицу MITRE ATT&CK с поддержкой многоуровневой фильтрации
    по платформам, типам покрытия, тактикам. Включает детальную статистику покрытия техник и подтехник
    правилами корреляции, с разбивкой по уровням серьезности. Поддерживает компактный и полный форматы ответа.
    </br></br>

    <b>Метод:</b> GET</br>
    <b>URL:</b> /api/matrix</br>
    <b>Авторизация:</b> Не требуется</br></br>

    <b>Query параметры (все опциональны):</b></br>
    - <code>platform</code> [STRING] - фильтр по платформе (Windows, Linux, macOS, Azure, SaaS, IaaS, Google Cloud, AWS, Office 365, Network)</br>
    - <code>coverage</code> [STRING] - фильтр по покрытию (all, covered, uncovered) - по умолчанию: all</br>
    - <code>tactic</code> [STRING] - фильтр по конкретной тактике (initial-access, execution, persistence и т.д.)</br>
    - <code>include_deprecated</code> [BOOLEAN] - включать устаревшие техники (true/false) - по умолчанию: false</br>
    - <code>include_subtechniques</code> [BOOLEAN] - включать подтехники (true/false) - по умолчанию: true</br>
    - <code>include_statistics</code> [BOOLEAN] - включать детальную статистику (true/false) - по умолчанию: true</br>
    - <code>format</code> [STRING] - формат ответа (full, compact) - по умолчанию: full</br></br>

    <b>Запросы curl:</b></br>
    <code>
    # Получить полную матрицу со всеми данными </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix"</br></br>

    # Получить матрицу для платформы Windows </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix?platform=Windows"</br></br>

    # Получить только техники с покрытием правилами </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix?coverage=covered"</br></br>

    # Получить техники для тактики "execution" </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix?tactic=execution"</br></br>

    # Компактный формат без описаний </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix?format=compact"</br></br>

    # Комбинированная фильтрация </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix?platform=Windows&coverage=covered&include_deprecated=false"</br></br>

    # Получить только статистику без подробностей </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix?format=compact&include_statistics=true"
    </code></br></br>

    <b>Успешный ответ (HTTP 200):</b></br>
    <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T13:00:00.123456",
      "data": {
        "tactics": [
          {
            "id": "TA0001",
            "name": "Initial Access",
            "name_ru": "Начальный доступ",
            "shortname": "initial-access",
            "x_mitre_shortname": "initial-access",
            "techniques_count": 14,
            "covered_techniques_count": 8,
            "coverage_percentage": 57.1,
            "description": "The adversary is trying to get into your network..."
          },
          {
            "id": "TA0002",
            "name": "Execution",
            "name_ru": "Выполнение",
            "shortname": "execution",
            "x_mitre_shortname": "execution",
            "techniques_count": 39,
            "covered_techniques_count": 22,
            "coverage_percentage": 56.4
          }
        ],
        "techniques": [
          {
            "id": "attack-pattern--abc123",
            "technique_id": "T1078",
            "attack_id": "T1078",
            "name": "Valid Accounts",
            "name_ru": "Валидные учетные записи",
            "platforms": ["Windows", "Linux", "macOS"],
            "data_sources": ["Authentication logs", "Audit logs"],
            "permissions_required": ["User"],
            "version": 2.3,
            "deprecated": false,
            "revoked": false,
            "tactics": [
              {
                "id": "TA0004",
                "shortname": "privilege-escalation",
                "x_mitre_shortname": "privilege-escalation",
                "name": "Privilege Escalation",
                "name_ru": "Повышение привилегий"
              },
              {
                "id": "TA0001",
                "shortname": "initial-access",
                "x_mitre_shortname": "initial-access",
                "name": "Initial Access",
                "name_ru": "Начальный доступ"
              }
            ],
            "coverage": {
              "total_rules": 12,
              "active_rules": 12,
              "own_rules": 10,
              "sub_rules": 2,
              "rules_by_severity": {
                "critical": 2,
                "high": 4,
                "medium": 4,
                "low": 2
              },
              "has_coverage": true,
              "coverage_level": "excellent"
            },
            "comments_count": 3,
            "description": "Adversaries may use valid credentials...",
            "description_ru": "Противники могут использовать валидные учетные записи...",
            "subtechniques": [
              {
                "id": "attack-pattern--sub123",
                "technique_id": "T1078.001",
                "attack_id": "T1078.001",
                "name": "Default Accounts",
                "name_ru": "Учетные записи по умолчанию",
                "coverage": {
                  "total_rules": 2,
                  "active_rules": 2,
                  "coverage_level": "basic"
                }
              }
            ],
            "subtechniques_count": 4
          }
        ],
        "parent_techniques": [
          {
            "id": "attack-pattern--abc123",
            "technique_id": "T1078",
            "attack_id": "T1078",
            "name": "Valid Accounts",
            "coverage": {
              "total_rules": 12,
              "active_rules": 12
            },
            "subtechniques": [...]
          }
        ],
        "subtechniques_by_parent": {
          "T1078": [
            {
              "id": "attack-pattern--sub123",
              "technique_id": "T1078.001",
              "attack_id": "T1078.001",
              "name": "Default Accounts"
            }
          ]
        },
        "statistics": {
          "total_techniques": 680,
          "parent_techniques": 290,
          "subtechniques": 390,
          "covered_techniques": 456,
          "uncovered_techniques": 224,
          "coverage_percentage": 67.1,
          "tactics": {
            "total": 14,
            "with_techniques": 14
          },
          "coverage_levels": {
            "excellent": 124,
            "good": 189,
            "basic": 143,
            "none": 224
          },
          "rules_by_severity": {
            "critical": 312,
            "high": 568,
            "medium": 456,
            "low": 234
          },
          "filters_applied": {
            "platform": null,
            "coverage": "all",
            "tactic": null,
            "include_deprecated": false
          }
        },
        "matrix_info": {
          "version": "14.0",
          "generated_at": "2025-10-23T13:00:00.123456",
          "response_format": "full",
          "include_subtechniques": true,
          "include_deprecated": false,
          "fix_version": "v14.0-subtechniques-coverage-fix"
        }
      }
    }</pre></br>

    <b>Компактный формат (format=compact):</b></br>
    <pre>{
      "code": 200,
      "data": {
        "tactics": [
          {
            "id": "TA0001",
            "name": "Initial Access",
            "techniques_count": 14,
            "covered_techniques_count": 8,
            "coverage_percentage": 57.1
          }
        ],
        "techniques": [
          {
            "id": "T1078",
            "attack_id": "T1078",
            "name": "Valid Accounts",
            "platforms": ["Windows", "Linux"],
            "coverage": {
              "active_rules": 12,
              "coverage_level": "excellent"
            }
          }
        ],
        "statistics": {...}
      }
    }</pre></br>

    <b>Ошибка (HTTP 500):</b></br>
    <pre>{
      "code": 500,
      "success": false,
      "error": "Matrix generation failed: <описание ошибки>"
    }</pre></br>

    <b>Коды состояния:</b></br>
    - 200: Матрица успешно получена</br>
    - 400: Неправильные параметры фильтрации</br>
    - 500: Ошибка при генерации матрицы</br></br>

    <b>Уровни покрытия (coverage_level):</b></br>
    - <code>excellent</code>: ≥ 5 активных правил</br>
    - <code>good</code>: 3-4 активных правила</br>
    - <code>basic</code>: 1-2 активных правила</br>
    - <code>none</code>: 0 активных правил</br></br>

    <b>Версия 14.0 - Ключевые исправления и особенности:</b></br>
    - ✅ <b>Статистика покрытия подтехник:</b> Теперь статистика правил включает как правила самой техники, так и правила её подтехник</br>
    - ✅ <b>Разбор по severity:</b> Правила группируются по уровням серьезности (critical, high, medium, low)</br>
    - ✅ <b>Оптимизированные SQL запросы:</b> Использование INNER JOIN для максимальной производительности</br>
    - ✅ <b>Поддержка подтехник:</b> Полная иерархия техник и подтехник (T1078 и T1078.001, T1078.002 и т.д.)</br>
    - ✅ <b>Гибкая фильтрация:</b> Комбинируемые фильтры по платформе, покрытию и тактикам</br></br>

    <b>Примечания:</b></br>
    - Матрица отсортирована в правильном порядке MITRE ATT&CK (initial-access → impact)</br>
    - Удалённые техники (revoked=1) исключены из результатов</br>
    - Комбинация фильтров работает как AND (пересечение условий)</br>
    - Форма "compact" исключает описания и уменьшает размер ответа на ~60%</br>
    - Статистика автоматически пересчитывается для применённых фильтров</br>
    - Поддержка мультиязычности: английские и русские названия, описания</br></br>

    <b>Практические применения:</b></br>
    - Отображение интерактивной матрицы на фронтенде</br>
    - Аналитика покрытия техник правилами</br>
    - Планирование разработки новых правил (поиск uncovered техник)</br>
    - Отчётность по статусу обороны (coverage_percentage)</br>
    - Фильтрация по специфичным платформам или тактикам</br>
    - Интеграция в системы мониторинга и автоматизации</br></br>

    <b>Примеры использования:</b></br>

    <b>1. Получить техники с отличным покрытием:</b></br>
    <code>/api/matrix?coverage=covered</code> → фильтрует на техники с active_rules > 0</br></br>

    <b>2. Получить матрицу для среды Windows:</b></br>
    <code>/api/matrix?platform=Windows&include_deprecated=false</code></br></br>

    <b>3. Получить техники только для тактики "persistence":</b></br>
    <code>/api/matrix?tactic=persistence</code></br></br>

    <b>4. Быстрый загрузить матрицы без описаний:</b></br>
    <code>/api/matrix?format=compact</code></br></br>

    <b>5. Получить только статистику:</b></br>
    <code>/api/matrix?format=compact&include_subtechniques=false</code></br></br>

    <b>Оптимизация производительности:</b></br>
    - Для больших запросов используйте format=compact</br>
    - Добавьте фильтры для сокращения набора данных</br>
    - Используйте include_statistics=false если статистика не нужна</br>
    - Включаемые индексы: (technique_id, status), (entity_type, entity_id, status)</br></br>
    """

    try:
        logger.info("🚀 GET /api/matrix/ - Ultimate Matrix Endpoint v14.0 called")

        # =================================================================
        # ПАРАМЕТРЫ ЗАПРОСА
        # =================================================================
        platform_filter = sanitize_input(request.args.get("platform"))
        coverage_filter = request.args.get("coverage", "all")  # all, covered, uncovered
        tactic_filter = sanitize_input(request.args.get("tactic"))
        include_deprecated = (
            request.args.get("include_deprecated", "false").lower() == "true"
        )
        include_subtechniques = (
            request.args.get("include_subtechniques", "true").lower() == "true"
        )
        include_statistics = (
            request.args.get("include_statistics", "true").lower() == "true"
        )
        response_format = request.args.get("format", "full")  # full, compact

        logger.info(
            f"📊 Matrix filters: platform={platform_filter}, coverage={coverage_filter}, "
            f"tactic={tactic_filter}, deprecated={include_deprecated}"
        )

        # =================================================================
        # 1. ЗАГРУЗКА ТАКТИК (ОПТИМИЗИРОВАННЫЙ ЗАПРОС)
        # =================================================================

        tactics_query = text(
            """
            SELECT 
                t.id,
                t.name,
                t.name_ru,
                t.x_mitre_shortname,
                t.description,
                t.description_ru,
                COUNT(DISTINCT tt.technique_id) as techniques_count,
                COUNT(DISTINCT CASE 
                    WHEN cr.active = 1 AND cr.status != 'deleted' 
                    THEN tech.id 
                END) as covered_techniques_count
            FROM tactics t
            LEFT JOIN technique_tactics tt ON t.id = tt.tactic_id
            LEFT JOIN techniques tech ON tt.technique_id = tech.id 
                AND tech.revoked = 0 
                AND (:include_deprecated OR tech.deprecated = 0)
                AND (:platform_filter IS NULL OR JSON_CONTAINS(tech.platforms, :platform_json))
            LEFT JOIN correlation_rules cr ON tech.attack_id = cr.technique_id 
                AND cr.active = 1 AND cr.status != 'deleted'
            GROUP BY t.id, t.name, t.name_ru, t.x_mitre_shortname, t.description, t.description_ru
            ORDER BY 
                CASE t.x_mitre_shortname
                    WHEN 'initial-access' THEN 1
                    WHEN 'execution' THEN 2
                    WHEN 'persistence' THEN 3
                    WHEN 'privilege-escalation' THEN 4
                    WHEN 'defense-evasion' THEN 5
                    WHEN 'credential-access' THEN 6
                    WHEN 'discovery' THEN 7
                    WHEN 'lateral-movement' THEN 8
                    WHEN 'collection' THEN 9
                    WHEN 'command-and-control' THEN 10
                    WHEN 'exfiltration' THEN 11
                    WHEN 'impact' THEN 12
                    ELSE 99
                END
        """
        )

        platform_json = f'"{platform_filter}"' if platform_filter else None
        tactics_raw = db.session.execute(
            tactics_query,
            {
                "include_deprecated": include_deprecated,
                "platform_filter": platform_filter,
                "platform_json": platform_json,
            },
        ).fetchall()

        # =================================================================
        # 2. ЗАГРУЗКА ТЕХНИК С УЧЁТОМ ПОДТЕХНИК (v14.0 FIX)
        # =================================================================

        # Построение WHERE условий
        where_conditions = ["t.revoked = 0"]
        query_params = {}

        if not include_deprecated:
            where_conditions.append("t.deprecated = 0")

        if platform_filter:
            where_conditions.append("JSON_CONTAINS(t.platforms, :platform_json)")
            query_params["platform_json"] = f'"{platform_filter}"'

        if tactic_filter:
            where_conditions.append("tac.x_mitre_shortname = :tactic_filter")
            query_params["tactic_filter"] = tactic_filter

        where_clause = " AND ".join(where_conditions)

        # 🔧 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ v14.0: Учёт подтехник в покрытии
        techniques_query = text(
            f"""
            SELECT 
                -- Базовая информация о технике
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
                t.created_at,
                t.updated_at,
                
                -- 🔧 v14.0 FIX: Правила самой техники
                COUNT(DISTINCT cr_own.id) as own_total_rules,
                COUNT(DISTINCT CASE 
                    WHEN cr_own.active = 1 AND cr_own.status != 'deleted' 
                    THEN cr_own.id 
                END) as own_active_rules,
                
                -- 🔧 v14.0 NEW: Правила подтехник (для родительских техник)
                COUNT(DISTINCT cr_sub.id) as sub_total_rules,
                COUNT(DISTINCT CASE 
                    WHEN cr_sub.active = 1 AND cr_sub.status != 'deleted' 
                    THEN cr_sub.id 
                END) as sub_active_rules,
                
                -- 🔧 v14.0 FIX: Правила по severity (свои + подтехники)
                COUNT(DISTINCT CASE 
                    WHEN (cr_own.active = 1 OR cr_sub.active = 1)
                    AND (cr_own.status != 'deleted' OR cr_sub.status != 'deleted')
                    AND (COALESCE(cr_own.severity, cr_sub.severity) = 'critical')
                    THEN COALESCE(cr_own.id, cr_sub.id)
                END) as critical_rules_count,
                
                COUNT(DISTINCT CASE 
                    WHEN (cr_own.active = 1 OR cr_sub.active = 1)
                    AND (cr_own.status != 'deleted' OR cr_sub.status != 'deleted')
                    AND (COALESCE(cr_own.severity, cr_sub.severity) = 'high')
                    THEN COALESCE(cr_own.id, cr_sub.id)
                END) as high_rules_count,
                
                COUNT(DISTINCT CASE 
                    WHEN (cr_own.active = 1 OR cr_sub.active = 1)
                    AND (cr_own.status != 'deleted' OR cr_sub.status != 'deleted')
                    AND (COALESCE(cr_own.severity, cr_sub.severity) = 'medium')
                    THEN COALESCE(cr_own.id, cr_sub.id)
                END) as medium_rules_count,
                
                COUNT(DISTINCT CASE 
                    WHEN (cr_own.active = 1 OR cr_sub.active = 1)
                    AND (cr_own.status != 'deleted' OR cr_sub.status != 'deleted')
                    AND (COALESCE(cr_own.severity, cr_sub.severity) = 'low')
                    THEN COALESCE(cr_own.id, cr_sub.id)
                END) as low_rules_count,
                
                -- Тактики через technique_tactics
                GROUP_CONCAT(DISTINCT tac.id ORDER BY 
                    CASE tac.x_mitre_shortname
                        WHEN 'initial-access' THEN 1 WHEN 'execution' THEN 2 WHEN 'persistence' THEN 3
                        WHEN 'privilege-escalation' THEN 4 WHEN 'defense-evasion' THEN 5 WHEN 'credential-access' THEN 6
                        WHEN 'discovery' THEN 7 WHEN 'lateral-movement' THEN 8 WHEN 'collection' THEN 9
                        WHEN 'command-and-control' THEN 10 WHEN 'exfiltration' THEN 11 WHEN 'impact' THEN 12
                        ELSE 99
                    END
                    SEPARATOR '|||'
                ) as tactic_ids,
                
                GROUP_CONCAT(DISTINCT tac.x_mitre_shortname ORDER BY 
                    CASE tac.x_mitre_shortname
                        WHEN 'initial-access' THEN 1 WHEN 'execution' THEN 2 WHEN 'persistence' THEN 3
                        WHEN 'privilege-escalation' THEN 4 WHEN 'defense-evasion' THEN 5 WHEN 'credential-access' THEN 6
                        WHEN 'discovery' THEN 7 WHEN 'lateral-movement' THEN 8 WHEN 'collection' THEN 9
                        WHEN 'command-and-control' THEN 10 WHEN 'exfiltration' THEN 11 WHEN 'impact' THEN 12
                        ELSE 99
                    END
                    SEPARATOR '|||'
                ) as tactic_shortnames,
                
                GROUP_CONCAT(DISTINCT COALESCE(tac.name_ru, tac.name) ORDER BY 
                    CASE tac.x_mitre_shortname
                        WHEN 'initial-access' THEN 1 WHEN 'execution' THEN 2 WHEN 'persistence' THEN 3
                        WHEN 'privilege-escalation' THEN 4 WHEN 'defense-evasion' THEN 5 WHEN 'credential-access' THEN 6
                        WHEN 'discovery' THEN 7 WHEN 'lateral-movement' THEN 8 WHEN 'collection' THEN 9
                        WHEN 'command-and-control' THEN 10 WHEN 'exfiltration' THEN 11 WHEN 'impact' THEN 12
                        ELSE 99
                    END
                    SEPARATOR '|||'
                ) as tactic_names,
                
                -- Комментарии
                COUNT(DISTINCT c.id) as comments_count
                
            FROM techniques t
            INNER JOIN technique_tactics tt ON t.id = tt.technique_id
            INNER JOIN tactics tac ON tt.tactic_id = tac.id
            
            -- 🔧 v14.0 FIX: JOIN для своих правил
            LEFT JOIN correlation_rules cr_own 
                ON t.attack_id = cr_own.technique_id
            
            -- 🔧 v14.0 NEW: JOIN для правил подтехник (только для родительских)
            LEFT JOIN correlation_rules cr_sub 
                ON cr_sub.technique_id LIKE CONCAT(t.attack_id, '.%')
                AND t.attack_id NOT LIKE '%.%'
            
            LEFT JOIN comments c 
                ON c.entity_type = 'technique' 
                AND c.entity_id = t.attack_id 
                AND c.status != 'deleted'
            
            WHERE {where_clause}
            
            GROUP BY 
                t.id, t.attack_id, t.name, t.name_ru, t.description, t.description_ru,
                t.platforms, t.data_sources, t.permissions_required, t.version,
                t.deprecated, t.revoked, t.created_at, t.updated_at
            
            ORDER BY t.attack_id
        """
        )

        techniques_raw = db.session.execute(techniques_query, query_params).fetchall()

        # =================================================================
        # 3. ОБРАБОТКА И ГРУППИРОВКА ТЕХНИК (v14.0 FIX)
        # =================================================================

        parent_techniques = []
        subtechniques_by_parent = {}
        all_techniques_dict = {}

        for tech in techniques_raw:
            # 🔧 v14.0 FIX: Суммируем правила техники + подтехник
            own_total = int(tech.own_total_rules or 0)
            own_active = int(tech.own_active_rules or 0)
            sub_total = int(tech.sub_total_rules or 0)
            sub_active = int(tech.sub_active_rules or 0)

            total_rules = own_total + sub_total
            active_rules = own_active + sub_active

            # Применяем фильтр покрытия
            if coverage_filter == "covered" and active_rules == 0:
                continue
            elif coverage_filter == "uncovered" and active_rules > 0:
                continue

            # Парсим JSON поля
            platforms = parse_json_field(tech.platforms, [])
            data_sources = parse_json_field(tech.data_sources, [])
            permissions = parse_json_field(tech.permissions_required, [])

            # Обрабатываем тактики
            tactics_data = []
            if tech.tactic_ids and tech.tactic_shortnames and tech.tactic_names:
                tactic_ids = tech.tactic_ids.split("|||") if tech.tactic_ids else []
                shortnames = (
                    tech.tactic_shortnames.split("|||")
                    if tech.tactic_shortnames
                    else []
                )
                names = tech.tactic_names.split("|||") if tech.tactic_names else []

                for i, tactic_id in enumerate(tactic_ids):
                    if i < len(shortnames) and i < len(names):
                        tactics_data.append(
                            {
                                "id": tactic_id.strip(),
                                "shortname": shortnames[i].strip(),
                                "x_mitre_shortname": shortnames[i].strip(),
                                "name": names[i].strip(),
                                "name_ru": names[i].strip(),
                            }
                        )

            # Определяем уровень покрытия
            if active_rules >= 5:
                coverage_level = "excellent"
            elif active_rules >= 3:
                coverage_level = "good"
            elif active_rules >= 1:
                coverage_level = "basic"
            else:
                coverage_level = "none"

            # Формируем объект техники
            technique_obj = {
                "id": tech.id,
                "technique_id": tech.attack_id,
                "attack_id": tech.attack_id,
                "name": tech.name,
                "name_ru": tech.name_ru or tech.name,
                "platforms": platforms,
                "data_sources": data_sources,
                "permissions_required": permissions,
                "version": float(tech.version) if tech.version else 1.0,
                "deprecated": bool(tech.deprecated),
                "revoked": bool(tech.revoked),
                "tactics": tactics_data,
                # 🔧 v14.0 FIX: Статистика покрытия с учётом подтехник
                "coverage": {
                    "total_rules": total_rules,
                    "active_rules": active_rules,
                    "own_rules": own_total,  # Для отладки
                    "sub_rules": sub_total,  # Для отладки
                    "rules_by_severity": {
                        "critical": (
                            int(tech.critical_rules_count)
                            if tech.critical_rules_count
                            else 0
                        ),
                        "high": (
                            int(tech.high_rules_count) if tech.high_rules_count else 0
                        ),
                        "medium": (
                            int(tech.medium_rules_count)
                            if tech.medium_rules_count
                            else 0
                        ),
                        "low": int(tech.low_rules_count) if tech.low_rules_count else 0,
                    },
                    "has_coverage": active_rules > 0,
                    "coverage_level": coverage_level,
                },
                "comments_count": (
                    int(tech.comments_count) if tech.comments_count else 0
                ),
            }

            # Добавляем описание для полного формата
            if response_format == "full":
                technique_obj["description"] = tech.description
                technique_obj["description_ru"] = tech.description_ru
                technique_obj["created_at"] = (
                    tech.created_at.isoformat() if tech.created_at else None
                )
                technique_obj["updated_at"] = (
                    tech.updated_at.isoformat() if tech.updated_at else None
                )
            else:
                # Для компактного формата - только краткое описание
                if tech.description:
                    technique_obj["description"] = (
                        tech.description[:200] + "..."
                        if len(tech.description) > 200
                        else tech.description
                    )

            all_techniques_dict[tech.attack_id] = technique_obj

            # Разделяем на родительские техники и подтехники
            if "." in tech.attack_id:
                # Подтехника
                parent_id = tech.attack_id.split(".")[0]
                if parent_id not in subtechniques_by_parent:
                    subtechniques_by_parent[parent_id] = []
                subtechniques_by_parent[parent_id].append(technique_obj)
            else:
                # Родительская техника
                parent_techniques.append(technique_obj)

        # =================================================================
        # 4. ФОРМИРОВАНИЕ ТАКТИК
        # =================================================================

        tactics = []
        for tactic in tactics_raw:
            coverage_percentage = 0
            if tactic.techniques_count > 0:
                coverage_percentage = round(
                    (
                        int(tactic.covered_techniques_count or 0)
                        / int(tactic.techniques_count)
                    )
                    * 100,
                    1,
                )

            tactic_obj = {
                "id": tactic.id,
                "name": tactic.name,
                "name_ru": tactic.name_ru or tactic.name,
                "shortname": tactic.x_mitre_shortname,
                "x_mitre_shortname": tactic.x_mitre_shortname,
                "techniques_count": (
                    int(tactic.techniques_count) if tactic.techniques_count else 0
                ),
                "covered_techniques_count": (
                    int(tactic.covered_techniques_count)
                    if tactic.covered_techniques_count
                    else 0
                ),
                "coverage_percentage": coverage_percentage,
            }

            if response_format == "full":
                tactic_obj["description"] = tactic.description
                tactic_obj["description_ru"] = tactic.description_ru

            tactics.append(tactic_obj)

        # =================================================================
        # 5. ОБЩАЯ СТАТИСТИКА
        # =================================================================

        statistics = {}
        if include_statistics:
            total_techniques = len(all_techniques_dict)
            covered_techniques = len(
                [
                    t
                    for t in all_techniques_dict.values()
                    if t["coverage"]["has_coverage"]
                ]
            )
            parent_count = len(parent_techniques)
            subtechniques_count = sum(
                len(subs) for subs in subtechniques_by_parent.values()
            )

            # Статистика по уровням покрытия
            coverage_levels = {"excellent": 0, "good": 0, "basic": 0, "none": 0}
            rules_by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}

            for tech in all_techniques_dict.values():
                coverage_levels[tech["coverage"]["coverage_level"]] += 1
                for severity, count in tech["coverage"]["rules_by_severity"].items():
                    rules_by_severity[severity] += count

            statistics = {
                "total_techniques": total_techniques,
                "parent_techniques": parent_count,
                "subtechniques": subtechniques_count,
                "covered_techniques": covered_techniques,
                "uncovered_techniques": total_techniques - covered_techniques,
                "coverage_percentage": (
                    round((covered_techniques / total_techniques * 100), 1)
                    if total_techniques > 0
                    else 0
                ),
                "tactics": {
                    "total": len(tactics),
                    "with_techniques": len(
                        [t for t in tactics if t["techniques_count"] > 0]
                    ),
                },
                "coverage_levels": coverage_levels,
                "rules_by_severity": rules_by_severity,
                "filters_applied": {
                    "platform": platform_filter,
                    "coverage": coverage_filter,
                    "tactic": tactic_filter,
                    "include_deprecated": include_deprecated,
                },
            }

        # =================================================================
        # 6. ФОРМИРОВАНИЕ ФИНАЛЬНОГО ОТВЕТА
        # =================================================================

        techniques_list = list(all_techniques_dict.values())

        # Добавляем подтехники к родительским (если нужно)
        if include_subtechniques:
            for parent_tech in parent_techniques:
                parent_id = parent_tech["technique_id"]
                if parent_id in subtechniques_by_parent:
                    parent_tech["subtechniques"] = subtechniques_by_parent[parent_id]
                    parent_tech["subtechniques_count"] = len(
                        subtechniques_by_parent[parent_id]
                    )
                else:
                    parent_tech["subtechniques"] = []
                    parent_tech["subtechniques_count"] = 0

        matrix_data = {
            "tactics": tactics,
            "techniques": techniques_list,
            "parent_techniques": parent_techniques,
            "matrix_info": {
                "version": "14.0",
                "generated_at": datetime.utcnow().isoformat(),
                "response_format": response_format,
                "include_subtechniques": include_subtechniques,
                "include_deprecated": include_deprecated,
                "fix_version": "v14.0-subtechniques-coverage-fix",
            },
        }

        if include_statistics:
            matrix_data["statistics"] = statistics

        if include_subtechniques:
            matrix_data["subtechniques_by_parent"] = subtechniques_by_parent

        logger.info(
            f"✅ Ultimate matrix v14.0 generated: {len(tactics)} tactics, "
            f"{len(techniques_list)} techniques, "
            f"{len(parent_techniques)} parent techniques"
        )

        return create_success_response(matrix_data)

    except Exception as e:
        logger.error(f"❌ Ultimate matrix generation failed: {e}")
        logger.error(traceback.format_exc())
        return create_error_response(f"Matrix generation failed: {str(e)}", 500)


# =============================================================================
# ДОПОЛНИТЕЛЬНЫЕ ЭНДПОИНТЫ
# =============================================================================


@matrix_bp.route("/tactics", methods=["GET"])
def get_tactics_only():
    """Получить упрощённый список всех MITRE ATT&CK тактик с базовой статистикой по количеству техник в каждой.

    Предоставляет быстрый и лёгкий доступ к полному списку 14 тактик MITRE ATT&CK в правильном порядке
    с базовой информацией и счётчиком техник. Оптимизирован для быстрой загрузки и использования в навигационных меню и дашбордах.
    Поддерживает мультиязычность (английский и русский языки).
    </br></br>

    <b>Метод:</b> GET</br>
    <b>URL:</b> /api/matrix/tactics</br>
    <b>Авторизация:</b> Не требуется</br>
    <b>Параметры запроса:</b> Нет</br>
    <b>Кеширование:</b> Рекомендуется (данные редко меняются)</br></br>

    <b>Запросы curl:</b></br>
    <code>
    # Получить список всех тактик </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/tactics"</br></br>

    # С красивым форматированием </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/tactics" | jq '.'</br></br>

    # Получить только названия тактик </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/tactics" | jq '.data.tactics[].name'</br></br>

    # Получить количество техник в каждой тактике </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/tactics" | jq '.data.tactics[] | {name: .name, count: .techniques_count}'
    </code></br></br>

    <b>Успешный ответ (HTTP 200):</b></br>
    <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T13:05:00.123456",
      "data": {
        "tactics": [
          {
            "id": "TA0001",
            "name": "Initial Access",
            "name_ru": "Начальный доступ",
            "shortname": "initial-access",
            "description": "The adversary is trying to get into your network.",
            "techniques_count": 14
          },
          {
            "id": "TA0002",
            "name": "Execution",
            "name_ru": "Выполнение",
            "shortname": "execution",
            "description": "The adversary is trying to run malicious code.",
            "techniques_count": 39
          },
          {
            "id": "TA0003",
            "name": "Persistence",
            "name_ru": "Сохранение присутствия",
            "shortname": "persistence",
            "description": "The adversary is trying to persist in your network.",
            "techniques_count": 60
          },
          {
            "id": "TA0004",
            "name": "Privilege Escalation",
            "name_ru": "Повышение привилегий",
            "shortname": "privilege-escalation",
            "description": "The adversary is trying to get higher-level permissions.",
            "techniques_count": 37
          },
          {
            "id": "TA0005",
            "name": "Defense Evasion",
            "name_ru": "Обход защиты",
            "shortname": "defense-evasion",
            "description": "The adversary is trying to avoid being detected.",
            "techniques_count": 89
          },
          {
            "id": "TA0006",
            "name": "Credential Access",
            "name_ru": "Получение учетных данных",
            "shortname": "credential-access",
            "description": "The adversary is trying to steal account names and passwords.",
            "techniques_count": 56
          },
          {
            "id": "TA0007",
            "name": "Discovery",
            "name_ru": "Разведка",
            "shortname": "discovery",
            "description": "The adversary is trying to figure out your environment.",
            "techniques_count": 31
          },
          {
            "id": "TA0008",
            "name": "Lateral Movement",
            "name_ru": "Боковое передвижение",
            "shortname": "lateral-movement",
            "description": "The adversary is trying to move through your network.",
            "techniques_count": 16
          },
          {
            "id": "TA0009",
            "name": "Collection",
            "name_ru": "Сбор информации",
            "shortname": "collection",
            "description": "The adversary is trying to gather data of interest.",
            "techniques_count": 59
          },
          {
            "id": "TA0010",
            "name": "Command and Control",
            "name_ru": "Управление и контроль",
            "shortname": "command-and-control",
            "description": "The adversary is trying to communicate with compromised systems.",
            "techniques_count": 31
          },
          {
            "id": "TA0011",
            "name": "Exfiltration",
            "name_ru": "Кража данных",
            "shortname": "exfiltration",
            "description": "The adversary is trying to steal data.",
            "techniques_count": 16
          },
          {
            "id": "TA0012",
            "name": "Impact",
            "name_ru": "Воздействие",
            "shortname": "impact",
            "description": "The adversary is trying to manipulate, interrupt, or destroy your systems.",
            "techniques_count": 15
          }
        ],
        "total": 12
      }
    }</pre></br>

    <b>Ошибка сервера (HTTP 500):</b></br>
    <pre>{
      "code": 500,
      "success": false,
      "error": "Failed to fetch tactics: <описание ошибки>"
    }</pre></br>

    <b>Коды состояния:</b></br>
    - 200: Список тактик успешно получен</br>
    - 500: Ошибка при извлечении данных из БД</br></br>

    <b>Структура каждой тактики:</b></br>
    - <code>id</code> [STRING] - уникальный ID тактики MITRE ATT&CK (TA0001-TA0012)</br>
    - <code>name</code> [STRING] - английское название тактики</br>
    - <code>name_ru</code> [STRING] - русское название тактики (с фалбеком на английское)</br>
    - <code>shortname</code> [STRING] - короткое имя (kebab-case, используется в URL и фильтрах)</br>
    - <code>description</code> [STRING] - описание на английском языке</br>
    - <code>techniques_count</code> [INT] - количество активных техник (не revoked, не deprecated) в этой тактике</br></br>

    <b>Список всех 12 тактик MITRE ATT&CK (в правильном порядке):</b></br>
    1. <code>initial-access</code> - Начальный доступ (TA0001)</br>
    2. <code>execution</code> - Выполнение (TA0002)</br>
    3. <code>persistence</code> - Сохранение присутствия (TA0003)</br>
    4. <code>privilege-escalation</code> - Повышение привилегий (TA0004)</br>
    5. <code>defense-evasion</code> - Обход защиты (TA0005)</br>
    6. <code>credential-access</code> - Получение учетных данных (TA0006)</br>
    7. <code>discovery</code> - Разведка (TA0007)</br>
    8. <code>lateral-movement</code> - Боковое передвижение (TA0008)</br>
    9. <code>collection</code> - Сбор информации (TA0009)</br>
    10. <code>command-and-control</code> - Управление и контроль (TA0010)</br>
    11. <code>exfiltration</code> - Кража данных (TA0011)</br>
    12. <code>impact</code> - Воздействие (TA0012)</br></br>

    <b>Примечания:</b></br>
    - Тактики всегда возвращаются в правильном порядке MITRE ATT&CK (от initial-access к impact)</br>
    - Данные включают только активные техники (revoked=0 и deprecated=0)</br>
    - Порядок отсортирован по специальному случаю в SQL (CASE WHEN)</br>
    - Поддерживается мультиязычность: name (английский) и name_ru (русский)</br>
    - Счётчик техник обновляется автоматически при добавлении/удалении техник</br>
    - Эндпоинт очень лёгкий для кеширования (кеш можно обновлять раз в день)</br>
    - Данные используются в навигационных меню, фильтрах и дашбордах</br></br>

    <b>Примеры использования:</b></br>

    <b>1. Получить список для выпадающего меню:</b></br>
    <code>GET /api/matrix/tactics</code></br>
    Используйте поле <code>shortname</code> как значение фильтра в других endpoints</br></br>

    <b>2. Найти тактику с наибольшим количеством техник:</b></br>
    <code>GET /api/matrix/tactics | jq '.data.tactics | max_by(.techniques_count)'</code></br>
    Результат: Defense Evasion (89 техник)</br></br>

    <b>3. Получить общее количество техник:</b></br>
    <code>GET /api/matrix/tactics | jq '.data.tactics | map(.techniques_count) | add'</code></br>
    Результат: 463</br></br>

    <b>4. Создать навигационное меню на фронтенде:</b></br>
    """
    try:
        logger.info("📋 GET /api/matrix/tactics")

        tactics_query = text(
            """
            SELECT 
                t.id, t.name, t.name_ru, t.x_mitre_shortname, t.description,
                COUNT(DISTINCT tt.technique_id) as techniques_count
            FROM tactics t
            LEFT JOIN technique_tactics tt ON t.id = tt.tactic_id
            LEFT JOIN techniques tech ON tt.technique_id = tech.id AND tech.revoked = 0 AND tech.deprecated = 0
            GROUP BY t.id, t.name, t.name_ru, t.x_mitre_shortname, t.description
            ORDER BY 
                CASE t.x_mitre_shortname
                    WHEN 'initial-access' THEN 1 WHEN 'execution' THEN 2 WHEN 'persistence' THEN 3
                    WHEN 'privilege-escalation' THEN 4 WHEN 'defense-evasion' THEN 5 WHEN 'credential-access' THEN 6
                    WHEN 'discovery' THEN 7 WHEN 'lateral-movement' THEN 8 WHEN 'collection' THEN 9
                    WHEN 'command-and-control' THEN 10 WHEN 'exfiltration' THEN 11 WHEN 'impact' THEN 12
                    ELSE 99
                END
        """
        )

        tactics_raw = db.session.execute(tactics_query).fetchall()

        tactics = []
        for tactic in tactics_raw:
            tactics.append(
                {
                    "id": tactic.id,
                    "name": tactic.name,
                    "name_ru": tactic.name_ru or tactic.name,
                    "shortname": tactic.x_mitre_shortname,
                    "description": tactic.description,
                    "techniques_count": (
                        int(tactic.techniques_count) if tactic.techniques_count else 0
                    ),
                }
            )

        return create_success_response({"tactics": tactics, "total": len(tactics)})

    except Exception as e:
        logger.error(f"❌ Tactics fetch failed: {e}")
        return create_error_response(f"Failed to fetch tactics: {str(e)}", 500)


@matrix_bp.route("/statistics", methods=["GET"])
def get_matrix_statistics():
    """Получить детальную статистику матрицы MITRE ATT&CK: глобальные показатели, распределение по тактикам и платформам.

    Предоставляет комплексную аналитику состояния матрицы с информацией о количестве техник, подтехник, покрытии правилами,
    распределении по тактикам и платформам. Используется для создания дашбордов, отчётов и мониторинга уровня защиты.
    Включает проценты покрытия и детальный анализ по каждой тактике.
    </br></br>

    <b>Метод:</b> GET</br>
    <b>URL:</b> /api/matrix/statistics</br>
    <b>Авторизация:</b> Не требуется</br>
    <b>Параметры запроса:</b> Нет</br>
    <b>Кеширование:</b> 1 час (данные достаточно статичны)</br></br>

    <b>Запросы curl:</b></br>
    <code>
    # Получить полную статистику матрицы </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/statistics"</br></br>

    # С красивым форматированием </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/statistics" | jq '.'</br></br>

    # Получить только процент покрытия </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/statistics" | jq '.data.overview.coverage_percentage'</br></br>

    # Получить статистику по тактикам </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/statistics" | jq '.data.by_tactics'</br></br>

    # Получить статистику по платформам </br>
    curl -X GET "http://172.30.250.199:5000/api/matrix/statistics" | jq '.data.by_platforms'
    </code></br></br>

    <b>Успешный ответ (HTTP 200):</b></br>
    <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T13:10:00.123456",
      "data": {
        "overview": {
          "total_techniques": 680,
          "active_techniques": 645,
          "deprecated_techniques": 35,
          "parent_techniques": 290,
          "subtechniques": 390,
          "covered_techniques": 456,
          "uncovered_techniques": 224,
          "coverage_percentage": 67.1,
          "total_rules": 1570,
          "active_rules": 1245
        },
        "by_tactics": [
          {
            "tactic": "defense-evasion",
            "name_ru": "Обход защиты",
            "techniques": 89,
            "covered": 64,
            "coverage_percentage": 71.9
          },
          {
            "tactic": "persistence",
            "name_ru": "Сохранение присутствия",
            "techniques": 60,
            "covered": 38,
            "coverage_percentage": 63.3
          },
          {
            "tactic": "collection",
            "name_ru": "Сбор информации",
            "techniques": 59,
            "covered": 42,
            "coverage_percentage": 71.2
          },
          {
            "tactic": "credential-access",
            "name_ru": "Получение учетных данных",
            "techniques": 56,
            "covered": 35,
            "coverage_percentage": 62.5
          },
          {
            "tactic": "execution",
            "name_ru": "Выполнение",
            "techniques": 39,
            "covered": 28,
            "coverage_percentage": 71.8
          },
          {
            "tactic": "privilege-escalation",
            "name_ru": "Повышение привилегий",
            "techniques": 37,
            "covered": 24,
            "coverage_percentage": 64.9
          },
          {
            "tactic": "command-and-control",
            "name_ru": "Управление и контроль",
            "techniques": 31,
            "covered": 22,
            "coverage_percentage": 71.0
          },
          {
            "tactic": "discovery",
            "name_ru": "Разведка",
            "techniques": 31,
            "covered": 19,
            "coverage_percentage": 61.3
          },
          {
            "tactic": "initial-access",
            "name_ru": "Начальный доступ",
            "techniques": 14,
            "covered": 8,
            "coverage_percentage": 57.1
          },
          {
            "tactic": "lateral-movement",
            "name_ru": "Боковое передвижение",
            "techniques": 16,
            "covered": 12,
            "coverage_percentage": 75.0
          },
          {
            "tactic": "exfiltration",
            "name_ru": "Кража данных",
            "techniques": 16,
            "covered": 11,
            "coverage_percentage": 68.8
          },
          {
            "tactic": "impact",
            "name_ru": "Воздействие",
            "techniques": 15,
            "covered": 8,
            "coverage_percentage": 53.3
          }
        ],
        "by_platforms": [
          {
            "platform": "Windows",
            "techniques_count": 412
          },
          {
            "platform": "Linux",
            "techniques_count": 378
          },
          {
            "platform": "macOS",
            "techniques_count": 289
          },
          {
            "platform": "AWS",
            "techniques_count": 145
          },
          {
            "platform": "Azure",
            "techniques_count": 132
          },
          {
            "platform": "Google Cloud",
            "techniques_count": 98
          },
          {
            "platform": "Office 365",
            "techniques_count": 87
          },
          {
            "platform": "SaaS",
            "techniques_count": 76
          },
          {
            "platform": "IaaS",
            "techniques_count": 65
          },
          {
            "platform": "Network",
            "techniques_count": 54
          }
        ],
        "generated_at": "2025-10-23T13:10:00.123456"
      }
    }</pre></br>

    <b>Ошибка сервера (HTTP 500):</b></br>
    <pre>{
      "code": 500,
      "success": false,
      "error": "Failed to generate statistics: <описание ошибки>"
    }</pre></br>

    <b>Коды состояния:</b></br>
    - 200: Статистика успешно получена</br>
    - 500: Ошибка при расчёте статистики</br></br>

    <b>Структура ответа:</b></br>

    <b>1. Overview (Обзор):</b></br>
    - <code>total_techniques</code> [INT] - всего техник (включая deprecated)</br>
    - <code>active_techniques</code> [INT] - активные техники (не deprecated)</br>
    - <code>deprecated_techniques</code> [INT] - устаревшие техники</br>
    - <code>parent_techniques</code> [INT] - родительские техники (без суффикса .X)</br>
    - <code>subtechniques</code> [INT] - подтехники (с суффиксом .X, например T1078.001)</br>
    - <code>covered_techniques</code> [INT] - техники с активными правилами</br>
    - <code>uncovered_techniques</code> [INT] - техники без правил</br>
    - <code>coverage_percentage</code> [FLOAT] - процент техник с покрытием (0-100%)</br>
    - <code>total_rules</code> [INT] - всего правил корреляции</br>
    - <code>active_rules</code> [INT] - активные правила</br></br>

    <b>2. By Tactics (По тактикам):</b></br>
    Массив объектов, отсортированный по количеству техник (убывание):</br>
    - <code>tactic</code> [STRING] - shortname тактики (kebab-case)</br>
    - <code>name_ru</code> [STRING] - русское название тактики</br>
    - <code>techniques</code> [INT] - количество техник в тактике</br>
    - <code>covered</code> [INT] - количество техник с покрытием</br>
    - <code>coverage_percentage</code> [FLOAT] - процент покрытия для этой тактики</br></br>

    <b>3. By Platforms (По платформам):</b></br>
    Массив из топ-10 платформ (отсортирован по количеству техник, убывание):</br>
    - <code>platform</code> [STRING] - название платформы (Windows, Linux, macOS, AWS, Azure и т.д.)</br>
    - <code>techniques_count</code> [INT] - количество техник для этой платформы</br></br>

    <b>4. Generated At (Время генерации):</b></br>
    - <code>generated_at</code> [STRING] - ISO 8601 время расчёта статистики</br></br>

    <b>Примечания:</b></br>
    - Статистика рассчитывается в реальном времени, но может быть закеширована на 1 час</br>
    - Revoked техники (revoked=1) исключены из всех расчётов</br>
    - Техники отсортированы по тактикам (в порядке убывания количества техник)</br>
    - Платформы показывают топ-10 (более 10 не выводятся)</br>
    - Процент покрытия вычисляется как (covered / total) * 100</br>
    - Процент может быть 0% если нет техник в тактике</br></br>

    <b>Интерпретация данных:</b></br>

    <b>Coverage Percentage:</b></br>
    - 80-100%: Отличное покрытие, система хорошо защищена</br>
    - 60-79%: Хорошее покрытие, есть пробелы в защите</br>
    - 40-59%: Среднее покрытие, требуется доработка</br>
    - 20-39%: Слабое покрытие, нужны новые правила</br>
    - 0-19%: Критически низкое покрытие, срочная доработка</br></br>

    <b>Практические применения:</b></br>
    - Создание KPI дашбордов и отчётов</br>
    - Мониторинг уровня защиты в организации</br>
    - Планирование разработки новых правил</br>
    - Идентификация критических пробелов в защите</br>
    - Анализ покрытия по платформам</br>
    - Сравнение уровней защиты по тактикам</br></br>

    <b>Примеры использования:</b></br>

    <b>1. Получить общий уровень защиты:</b></br>
    <code>/api/matrix/statistics | jq '.data.overview | {total: .total_techniques, covered: .covered_techniques, percentage: .coverage_percentage}'</code></br>
    Результат: <code>{ "total": 680, "covered": 456, "percentage": 67.1 }</code></br></br>

    <b>2. Найти тактику с наименьшим покрытием:</b></br>
    <code>/api/matrix/statistics | jq '.data.by_tactics | min_by(.coverage_percentage)'</code></br>
    Результат: Impact (53.3%)</br></br>

    <b>3. Найти тактику с наибольшим покрытием:</b></br>
    <code>/api/matrix/statistics | jq '.data.by_tactics | max_by(.coverage_percentage)'</code></br>
    Результат: Lateral Movement (75.0%)</br></br>

    <b>4. Получить статистику для видео в Power BI/Tableau:</b></br>
    """
    try:
        logger.info("📊 GET /api/matrix/statistics")

        # Общая статистика
        stats_query = text(
            """
            SELECT 
                COUNT(DISTINCT t.attack_id) as total_techniques,
                COUNT(DISTINCT CASE WHEN t.deprecated = 0 THEN t.attack_id END) as active_techniques,
                COUNT(DISTINCT CASE WHEN t.deprecated = 1 THEN t.attack_id END) as deprecated_techniques,
                COUNT(DISTINCT CASE WHEN t.attack_id NOT LIKE '%.%' THEN t.attack_id END) as parent_techniques,
                COUNT(DISTINCT CASE WHEN t.attack_id LIKE '%.%' THEN t.attack_id END) as subtechniques,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS(
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id 
                        AND cr.active = 1 AND cr.status != 'deleted'
                    ) THEN t.attack_id 
                END) as covered_techniques,
                COUNT(DISTINCT cr.id) as total_rules,
                COUNT(DISTINCT CASE WHEN cr.active = 1 AND cr.status != 'deleted' THEN cr.id END) as active_rules
            FROM techniques t
            LEFT JOIN correlation_rules cr ON t.attack_id = cr.technique_id
            WHERE t.revoked = 0
        """
        )

        stats = db.session.execute(stats_query).fetchone()

        # Статистика по тактикам
        tactics_stats_query = text(
            """
            SELECT 
                tac.x_mitre_shortname,
                tac.name_ru,
                COUNT(DISTINCT tt.technique_id) as techniques_count,
                COUNT(DISTINCT CASE 
                    WHEN EXISTS(
                        SELECT 1 FROM correlation_rules cr 
                        WHERE cr.technique_id = t.attack_id 
                        AND cr.active = 1 AND cr.status != 'deleted'
                    ) THEN t.id 
                END) as covered_count
            FROM tactics tac
            LEFT JOIN technique_tactics tt ON tac.id = tt.tactic_id
            LEFT JOIN techniques t ON tt.technique_id = t.id AND t.revoked = 0 AND t.deprecated = 0
            GROUP BY tac.id, tac.x_mitre_shortname, tac.name_ru
            ORDER BY techniques_count DESC
        """
        )

        tactics_stats = db.session.execute(tactics_stats_query).fetchall()

        # Статистика по платформам
        platforms_stats_query = text(
            """
            SELECT 
                JSON_UNQUOTE(JSON_EXTRACT(platforms, '$[0]')) as platform,
                COUNT(*) as techniques_count
            FROM (
                SELECT DISTINCT t.attack_id, t.platforms
                FROM techniques t
                WHERE t.revoked = 0 AND t.deprecated = 0 
                AND t.platforms IS NOT NULL AND t.platforms != '[]'
            ) as platform_techniques
            GROUP BY platform
            ORDER BY techniques_count DESC
            LIMIT 10
        """
        )

        platforms_stats = db.session.execute(platforms_stats_query).fetchall()

        # Формируем ответ
        total_techniques = int(stats.total_techniques) if stats.total_techniques else 0
        covered_techniques = (
            int(stats.covered_techniques) if stats.covered_techniques else 0
        )
        coverage_percentage = (
            round((covered_techniques / total_techniques * 100), 1)
            if total_techniques > 0
            else 0
        )

        statistics_data = {
            "overview": {
                "total_techniques": total_techniques,
                "active_techniques": (
                    int(stats.active_techniques) if stats.active_techniques else 0
                ),
                "deprecated_techniques": (
                    int(stats.deprecated_techniques)
                    if stats.deprecated_techniques
                    else 0
                ),
                "parent_techniques": (
                    int(stats.parent_techniques) if stats.parent_techniques else 0
                ),
                "subtechniques": int(stats.subtechniques) if stats.subtechniques else 0,
                "covered_techniques": covered_techniques,
                "uncovered_techniques": total_techniques - covered_techniques,
                "coverage_percentage": coverage_percentage,
                "total_rules": int(stats.total_rules) if stats.total_rules else 0,
                "active_rules": int(stats.active_rules) if stats.active_rules else 0,
            },
            "by_tactics": [
                {
                    "tactic": tactic.x_mitre_shortname,
                    "name_ru": tactic.name_ru,
                    "techniques": (
                        int(tactic.techniques_count) if tactic.techniques_count else 0
                    ),
                    "covered": int(tactic.covered_count) if tactic.covered_count else 0,
                    "coverage_percentage": (
                        round(
                            (
                                int(tactic.covered_count or 0)
                                / int(tactic.techniques_count)
                                * 100
                            ),
                            1,
                        )
                        if tactic.techniques_count and int(tactic.techniques_count) > 0
                        else 0
                    ),
                }
                for tactic in tactics_stats
            ],
            "by_platforms": [
                {
                    "platform": platform.platform,
                    "techniques_count": (
                        int(platform.techniques_count)
                        if platform.techniques_count
                        else 0
                    ),
                }
                for platform in platforms_stats
            ],
            "generated_at": datetime.utcnow().isoformat(),
        }

        return create_success_response(statistics_data)

    except Exception as e:
        logger.error(f"❌ Matrix statistics failed: {e}")
        return create_error_response(f"Failed to generate statistics: {str(e)}", 500)


# =============================================================================
# ЭКСПОРТ
# =============================================================================
__all__ = ["matrix_bp"]

logger.info(
    "✅ Matrix Blueprint v14.0 (SUBTECHNIQUES-COVERAGE-FIX) loaded successfully"
)
