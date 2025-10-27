"""
Blueprint для работы с правилами корреляции MITRE ATT&CK
Файл: blueprints/rules.py
Автор: ПангеоРадар
Версия: 2.0
"""

import uuid
from flask import Blueprint, jsonify, request, current_app
from sqlalchemy import text, func
from models.database import db, Users, Comments, CorrelationRules
from utils.auth import login_required, require_role, get_current_user
from utils.helpers import (
    log_audit_event,
    validate_uuid,
    sanitize_input,
    create_success_response,
)
import logging
import json
from datetime import datetime


# Настройка логирования
logger = logging.getLogger(__name__)

# Создание Blueprint
rules_bp = Blueprint("rules", __name__, url_prefix="/api/rules")


# ============================================================================
# WORKFLOW STATUS CONFIGURATION
# ============================================================================

RULE_STATUS_WORKFLOW = {
    "not_started": {
        "label": "Не взято в работу",
        "icon": "fa-circle",
        "color": "#6b7280",
        "requires_comment": False,
        "requires_assignee": False,
        "next_statuses": ["info_required", "in_progress"],
    },
    "info_required": {
        "label": "Требуется информация",
        "icon": "fa-question-circle",
        "color": "#f59e0b",
        "requires_comment": True,
        "requires_assignee": False,
        "next_statuses": ["in_progress", "not_started"],
    },
    "in_progress": {
        "label": "В работе",
        "icon": "fa-spinner",
        "color": "#3b82f6",
        "requires_comment": False,
        "requires_assignee": True,
        "next_statuses": ["stopped", "ready_for_testing"],
    },
    "stopped": {
        "label": "Остановлено",
        "icon": "fa-stop-circle",
        "color": "#ef4444",
        "requires_comment": True,
        "requires_assignee": False,
        "next_statuses": ["in_progress", "not_started"],
    },
    "returned": {
        "label": "Возвращено",
        "icon": "fa-undo-alt",
        "color": "#ec4899",
        "requires_comment": True,
        "requires_assignee": False,
        "next_statuses": ["in_progress", "info_required"],
    },
    "ready_for_testing": {
        "label": "Готово к тестированию",
        "icon": "fa-check-circle",
        "color": "#8b5cf6",
        "requires_comment": False,
        "requires_assignee": False,
        "next_statuses": ["tested", "returned", "in_progress"],
    },
    "tested": {
        "label": "Протестировано",
        "icon": "fa-vial",
        "color": "#10b981",
        "requires_comment": False,
        "requires_assignee": False,
        "next_statuses": ["deployed", "returned"],
    },
    "deployed": {
        "label": "Выгружено в Git",
        "icon": "fa-code-branch",
        "color": "#0f766e",
        "requires_comment": True,
        "requires_assignee": False,
        "next_statuses": [],
    },
}


def validate_status_transition(
    current_status, new_status, assignee_id=None, comment_text=None
):
    """
    Валидация переводов между workflow статусами

    Args:
        current_status: текущий статус
        new_status: новый статус
        assignee_id: ID исполнителя
        comment_text: текст комментария

    Returns:
        True если валидация прошла успешно

    Raises:
        ValueError если валидация не прошла
    """

    # Проверяем, есть ли такой статус
    if new_status not in RULE_STATUS_WORKFLOW:
        raise ValueError(f"Неизвестный статус: {new_status}")

    status_config = RULE_STATUS_WORKFLOW[new_status]

    # Проверяем возможный переход
    if current_status:
        if current_status not in RULE_STATUS_WORKFLOW:
            raise ValueError(f"Неизвестный текущий статус: {current_status}")

        if new_status not in RULE_STATUS_WORKFLOW[current_status]["next_statuses"]:
            current_label = RULE_STATUS_WORKFLOW[current_status]["label"]
            new_label = status_config["label"]
            raise ValueError(
                f'Невозможен переход со статуса "{current_label}" на "{new_label}"'
            )

    # Проверяем требуемые поля
    if status_config["requires_assignee"] and not assignee_id:
        raise ValueError(f'Статус "{status_config["label"]}" требует исполнителя')

    if status_config["requires_comment"] and not comment_text:
        raise ValueError(
            f'Статус "{status_config["label"]}" требует обязательного комментария'
        )

    return True


# ==========================================
# БАЗОВЫЕ ОПЕРАЦИИ С ПРАВИЛАМИ
# ==========================================


@rules_bp.route("/", methods=["GET"])
@login_required
def get_rules():
    """
    Получить список всех правил корреляции с поддержкой фильтрации, поиска и пагинации.

Возвращает полный список правил корреляции с информацией о связанных техниках MITRE ATT&CK, 
метаданных и результатах тестирования. Поддерживает мощную систему фильтрации по технике, уровню риска,
статусу и текстовый поиск. Включает детальную пагинацию с настраиваемым размером страницы (10-100).
Требует авторизации (@login_required).
</br></br>

<b>Метод:</b> GET</br>
<b>URL:</b> /api/rules</br>
<b>Авторизация:</b> Требуется @login_required (любой авторизованный пользователь)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Query параметры:</b></br>
- <code>page</code> [INT] - номер страницы (по умолчанию: 1, минимум: 1)</br>
- <code>per_page</code> [INT] - количество правил на странице (по умолчанию: 50, диапазон: 1-100)</br>
- <code>search</code> [STRING] - поиск по названию, описанию или ID техники (опционально)</br>
- <code>technique_id</code> [STRING] - фильтр по ID техники MITRE ATT&CK (опционально)</br>
- <code>severity</code> [STRING] - фильтр по уровню риска: low, medium, high, critical (опционально)</br>
- <code>status</code> [STRING] - фильтр по статусу: active, disabled, draft, archived (опционально)</br></br>

<b>Запросы curl:</b></br>
<code>
# Получить первую страницу (50 правил)
curl -X GET "http://172.30.250.199:5000/api/rules" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# Получить вторую страницу с 100 правилами
curl -X GET "http://172.30.250.199:5000/api/rules?page=2&per_page=100" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# Поиск по названию "brute force"
curl -X GET "http://172.30.250.199:5000/api/rules?search=brute%20force" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# Фильтр по технике T1078
curl -X GET "http://172.30.250.199:5000/api/rules?technique_id=T1078" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# Фильтр по высокому уровню риска
curl -X GET "http://172.30.250.199:5000/api/rules?severity=high" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# Фильтр по активным правилам
curl -X GET "http://172.30.250.199:5000/api/rules?status=active" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# Комбинированные фильтры
curl -X GET "http://172.30.250.199:5000/api/rules?severity=critical&status=active&page=1&per_page=20" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# С красивым форматированием
curl -X GET "http://172.30.250.199:5000/api/rules" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Suspicious Login Activity",
      "name_ru": "Подозрительная активность при входе",
      "description": "Detects multiple failed login attempts",
      "technique_id": 5,
      "attack_id": "T1078",
      "technique_name": "Valid Accounts",
      "severity": "high",
      "confidence": 85,
      "status": "active",
      "active": true,
      "folder": "authentication",
      "author": "admin",
      "tags": ["authentication", "brute-force", "login"],
      "created_at": "2025-10-20T10:00:00",
      "updated_at": "2025-10-23T14:30:00",
      "test_results": {
        "passed": 15,
        "failed": 2,
        "last_tested": "2025-10-23T12:00:00"
      },
      "performance_rating": 4.5
    },
    {
      "id": 2,
      "name": "Privilege Escalation Detection",
      "name_ru": "Обнаружение повышения привилегий",
      "description": "Detects attempts to escalate privileges",
      "technique_id": 12,
      "attack_id": "T1068",
      "technique_name": "Exploitation for Privilege Escalation",
      "severity": "critical",
      "confidence": 92,
      "status": "active",
      "active": true,
      "folder": "privilege-escalation",
      "author": "analyst_1",
      "tags": ["privilege-escalation", "exploitation"],
      "created_at": "2025-10-21T09:00:00",
      "updated_at": "2025-10-23T15:00:00",
      "test_results": null,
      "performance_rating": 4.8
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 124,
    "pages": 3
  }
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "success": false,
  "error": "Ошибка получения правил: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Список правил успешно получен</br>
- 401: Пользователь не авторизован</br>
- 500: Ошибка при получении данных</br></br>

<b>Структура ответа:</b></br>

<b>Основные данные:</b></br>
- <code>success</code> [BOOLEAN] - статус успеха операции</br>
- <code>data</code> [ARRAY] - массив объектов правил</br>
- <code>pagination</code> [OBJECT] - информация о пагинации</br></br>

<b>Объект правила:</b></br>
- <code>id</code> [INT] - уникальный ID правила</br>
- <code>name</code> [STRING] - название правила (English)</br>
- <code>name_ru</code> [STRING] - название правила (Русский)</br>
- <code>description</code> [STRING] - описание правила</br>
- <code>technique_id</code> [INT] - внутренний ID техники в БД</br>
- <code>attack_id</code> [STRING] - MITRE ATT&CK ID техники (например, T1078)</br>
- <code>technique_name</code> [STRING] - название техники MITRE ATT&CK</br>
- <code>severity</code> [STRING] - уровень риска (low, medium, high, critical)</br>
- <code>confidence</code> [INT] - уверенность срабатывания (0-100)</br>
- <code>status</code> [STRING] - статус правила (active, disabled, draft, archived)</br>
- <code>active</code> [BOOLEAN] - активно ли правило (true/false)</br>
- <code>folder</code> [STRING] - категория/папка правила</br>
- <code>author</code> [STRING] - автор правила</br>
- <code>tags</code> [ARRAY] - массив тегов</br>
- <code>created_at</code> [TIMESTAMP] - время создания</br>
- <code>updated_at</code> [TIMESTAMP] - время последнего обновления</br>
- <code>test_results</code> [OBJECT|NULL] - результаты тестирования</br>
- <code>performance_rating</code> [FLOAT|NULL] - рейтинг производительности (0-5)</br></br>

<b>Объект pagination:</b></br>
- <code>page</code> [INT] - текущий номер страницы</br>
- <code>per_page</code> [INT] - количество элементов на странице</br>
- <code>total</code> [INT] - всего правил (с учётом фильтров)</br>
- <code>pages</code> [INT] - всего страниц</br></br>

<b>Примеры использования:</b></br>

<b>1. Получить все правила (JavaScript):</b></br>
<code>
async function getAllRules(token) {
  const response = await fetch('/api/rules', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Получить правила с пагинацией (JavaScript):</b></br>
<code>
async function getRulesPaginated(token, page = 1, perPage = 50) {
  const response = await fetch(
    `/api/rules?page=${page}&per_page=${perPage}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  return await response.json();
}
</code></br></br>

<b>3. Поиск правил по тексту (JavaScript):</b></br>
<code>
async function searchRules(token, searchQuery) {
  const response = await fetch(
    `/api/rules?search=${encodeURIComponent(searchQuery)}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  return await response.json();
}
</code></br></br>

<b>4. Фильтр по технике MITRE ATT&CK (JavaScript):</b></br>
<code>
async function getRulesByTechnique(token, techniqueId) {
  const response = await fetch(
    `/api/rules?technique_id=${encodeURIComponent(techniqueId)}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  return await response.json();
}
</code></br></br>

<b>5. Фильтр по уровню риска (JavaScript):</b></br>
<code>
async function getCriticalRules(token) {
  const response = await fetch(
    '/api/rules?severity=critical&status=active',
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  return await response.json();
}
</code></br></br>

<b>6. Комбинированные фильтры с пагинацией (JavaScript):</b></br>
<code>
async function getFilteredRules(token, filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.page) params.append('page', filters.page);
  if (filters.perPage) params.append('per_page', filters.perPage);
  if (filters.search) params.append('search', filters.search);
  if (filters.techniqueId) params.append('technique_id', filters.techniqueId);
  if (filters.severity) params.append('severity', filters.severity);
  if (filters.status) params.append('status', filters.status);
  
  const response = await fetch(
    `/api/rules?${params.toString()}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  return await response.json();
}

// Использование:
const rules = await getFilteredRules(token, {
  page: 2,
  perPage: 20,
  severity: 'high',
  status: 'active',
  search: 'brute force'
});
</code></br></br>

<b>7. Загрузить все правила постранично (JavaScript):</b></br>
<code>
async function loadAllRules(token) {
  const allRules = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = await fetch(
      `/api/rules?page=${page}&per_page=100`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    const data = await response.json();
    allRules.push(...data.data);
    
    hasMore = page < data.pagination.pages;
    page++;
  }
  
  return allRules;
}
</code></br></br>

<b>Примечания:</b></br>
- Требуется авторизация (@login_required)</br>
- Максимальный размер страницы: 100 правил</br>
- Поиск выполняется по названию, описанию и ID техники</br>
- Фильтры комбинируются (логическое AND)</br>
- Правила отсортированы по updated_at DESC (новые первыми)</br>
- Поле tags автоматически парсится из JSON</br>
- test_results и performance_rating могут быть null</br></br>

<b>Фильтры:</b></br>

<b>Severity (Уровень риска):</b></br>
- <code>low</code> - низкий</br>
- <code>medium</code> - средний</br>
- <code>high</code> - высокий</br>
- <code>critical</code> - критический</br></br>

<b>Status (Статус):</b></br>
- <code>active</code> - активное правило</br>
- <code>disabled</code> - отключено</br>
- <code>draft</code> - черновик</br>
- <code>archived</code> - архивировано</br></br>

<b>Производительность:</b></br>
- Время ответа: ~100-500ms (зависит от фильтров)</br>
- Размер ответа: ~5-50KB (зависит от per_page)</br>
- Рекомендуемый per_page: 20-50 для UI</br>
- Индексы на technique_id, severity, status ускоряют фильтрацию</br></br>

<b>Рекомендации:</b></br>
1. Используйте пагинацию для больших списков (не загружайте всё сразу)</br>
2. Кешируйте результаты на клиенте на 2-5 минут</br>
3. Применяйте фильтры для снижения объёма данных</br>
4. Используйте per_page=100 только для экспорта/аналитики</br>
5. Обрабатывайте пустые массивы (data: [])</br></br>

<b>Сценарии использования:</b></br>
- Список правил в интерфейсе управления</br>
- Поиск и фильтрация правил</br>
- Экспорт правил корреляции</br>
- Аналитика покрытия техник</br>
- Мониторинг активных правил</br></br>

    """
    try:
        # Параметры пагинации
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 50, type=int), 100)

        # Параметры фильтрации
        search = request.args.get("search", "").strip()
        technique_id = request.args.get("technique_id", "").strip()
        severity = request.args.get("severity", "").strip()
        status = request.args.get("status", "").strip()

        # Базовый запрос
        query = """
            SELECT 
                cr.id,
                cr.name,
                cr.name_ru,
                cr.description,
                cr.technique_id,
                t.attack_id,
                t.name as technique_name,
                cr.severity,
                cr.confidence,
                cr.status,
                cr.active,
                cr.folder,
                cr.author,
                cr.tags,
                cr.created_at,
                cr.updated_at,
                rm.test_results,
                rm.performance_rating
            FROM correlation_rules cr
            LEFT JOIN techniques t ON cr.technique_id = t.id
            LEFT JOIN rule_metadata rm ON cr.id = rm.rule_id
            WHERE 1=1
        """

        params = {}

        # Фильтр по поиску
        if search:
            query += """ AND (
                cr.name LIKE :search 
                OR cr.description LIKE :search 
                OR t.attack_id LIKE :search
            )"""
            params["search"] = f"%{search}%"

        # Фильтр по технике
        if technique_id:
            query += " AND cr.technique_id = :technique_id"
            params["technique_id"] = technique_id

        # Фильтр по severity
        if severity:
            query += " AND cr.severity = :severity"
            params["severity"] = severity

        # Фильтр по статусу
        if status:
            query += " AND cr.status = :status"
            params["status"] = status

        # Подсчет общего количества
        count_query = f"SELECT COUNT(*) as total FROM ({query}) as filtered"
        total_result = db.session.execute(text(count_query), params).fetchone()
        total = total_result[0] if total_result else 0

        # Добавление сортировки и пагинации
        query += " ORDER BY cr.updated_at DESC LIMIT :limit OFFSET :offset"
        params["limit"] = per_page
        params["offset"] = (page - 1) * per_page

        # Выполнение запроса
        result = db.session.execute(text(query), params)
        rules = [dict(row._mapping) for row in result]

        # Парсинг JSON полей
        for rule in rules:
            if rule.get("tags"):
                try:
                    rule["tags"] = (
                        json.loads(rule["tags"])
                        if isinstance(rule["tags"], str)
                        else rule["tags"]
                    )
                except:
                    rule["tags"] = []

        return (
            jsonify(
                {
                    "success": True,
                    "data": rules,
                    "pagination": {
                        "page": page,
                        "per_page": per_page,
                        "total": total,
                        "pages": (total + per_page - 1) // per_page,
                    },
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Ошибка получения правил: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@rules_bp.route("/<rule_id>", methods=["GET"])
@login_required
def get_rule(rule_id):
    """
    Получить детальную информацию о конкретном правиле корреляции с полными метаданными.

Возвращает полную информацию о правиле корреляции включая связанную технику MITRE ATT&CK,
результаты тестирования, рейтинг производительности и пользовательские поля. Автоматически
парсит JSON поля (logic, tags, custom_fields) для удобства работы. Требует авторизации
(@login_required). Валидирует формат UUID перед запросом.
</br></br>

<b>Метод:</b> GET</br>
<b>URL:</b> /api/rules/{rule_id}</br>
<b>Авторизация:</b> Требуется @login_required (любой авторизованный пользователь)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры пути:</b></br>
- <code>rule_id</code> [UUID] - уникальный идентификатор правила (обязательный, формат UUID)</br></br>

<b>Запросы curl:</b></br>
<code>
# Получить правило по UUID
curl -X GET "http://172.30.250.199:5000/api/rules/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# С красивым форматированием
curl -X GET "http://172.30.250.199:5000/api/rules/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Suspicious Login Activity",
    "name_ru": "Подозрительная активность при входе",
    "description": "Detects multiple failed login attempts followed by successful login",
    "description_ru": "Обнаруживает множественные неудачные попытки входа с последующим успешным входом",
    "technique_id": 5,
    "attack_id": "T1078",
    "technique_name": "Valid Accounts",
    "technique_name_ru": "Действительные учётные записи",
    "severity": "high",
    "confidence": 85,
    "status": "active",
    "active": true,
    "folder": "authentication",
    "author": "admin",
    "logic": {
      "type": "sequence",
      "events": [
        {"event_type": "failed_login", "count": ">= 5", "timeframe": "5m"},
        {"event_type": "successful_login", "count": "1"}
      ]
    },
    "tags": ["authentication", "brute-force", "login", "credential-access"],
    "rule_text": "event.type:\"failed_login\" AND count >= 5 WITHIN 5m THEN event.type:\"successful_login\"",
    "created_at": "2025-10-20T10:00:00",
    "updated_at": "2025-10-23T14:30:00",
    "test_results": {
      "passed": 15,
      "failed": 2,
      "last_tested": "2025-10-23T12:00:00",
      "coverage": 88.2
    },
    "performance_rating": 4.5,
    "custom_fields": {
      "priority": "high",
      "siem_compatibility": ["Splunk", "QRadar", "ArcSight"],
      "mitre_version": "13.0"
    }
  }
}</pre></br></br>

<b>Ошибка: правило не найдено (HTTP 404):</b></br>
<pre>{
  "success": false,
  "error": "Правило не найдено"
}</pre></br></br>

<b>Ошибка: некорректный UUID (HTTP 400):</b></br>
<pre>{
  "success": false,
  "error": "Некорректный формат UUID"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "success": false,
  "error": "Ошибка получения правила: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Правило успешно получено</br>
- 400: Некорректный формат UUID</br>
- 401: Пользователь не авторизован</br>
- 404: Правило не найдено</br>
- 500: Ошибка при получении данных</br></br>

<b>Структура ответа:</b></br>

<b>Основные поля правила:</b></br>
- <code>id</code> [UUID] - уникальный идентификатор правила</br>
- <code>name</code> [STRING] - название правила (English)</br>
- <code>name_ru</code> [STRING] - название правила (Русский)</br>
- <code>description</code> [STRING] - описание правила (English)</br>
- <code>description_ru</code> [STRING] - описание правила (Русский)</br>
- <code>technique_id</code> [INT] - внутренний ID техники в БД</br>
- <code>attack_id</code> [STRING] - MITRE ATT&CK ID техники (например, T1078)</br>
- <code>technique_name</code> [STRING] - название техники MITRE ATT&CK (English)</br>
- <code>technique_name_ru</code> [STRING] - название техники MITRE ATT&CK (Русский)</br></br>

<b>Параметры правила:</b></br>
- <code>severity</code> [STRING] - уровень риска (low, medium, high, critical)</br>
- <code>confidence</code> [INT] - уверенность срабатывания (0-100)</br>
- <code>status</code> [STRING] - статус правила (active, disabled, draft, archived)</br>
- <code>active</code> [BOOLEAN] - активно ли правило</br>
- <code>folder</code> [STRING] - категория/папка правила</br>
- <code>author</code> [STRING] - автор правила</br></br>

<b>Логика и код:</b></br>
- <code>logic</code> [OBJECT] - JSON структура логики правила (автоматически распарсен)</br>
- <code>tags</code> [ARRAY] - массив тегов (автоматически распарсен из JSON)</br>
- <code>rule_text</code> [STRING] - текст правила корреляции</br></br>

<b>Временные метки:</b></br>
- <code>created_at</code> [TIMESTAMP] - время создания</br>
- <code>updated_at</code> [TIMESTAMP] - время последнего обновления</br></br>

<b>Метаданные (из rule_metadata):</b></br>
- <code>test_results</code> [OBJECT|NULL] - результаты тестирования правила</br>
- <code>performance_rating</code> [FLOAT|NULL] - рейтинг производительности (0-5)</br>
- <code>custom_fields</code> [OBJECT|NULL] - дополнительные пользовательские поля</br></br>

<b>Примеры использования:</b></br>

<b>1. Получить правило по ID (JavaScript):</b></br>
<code>
async function getRuleById(token, ruleId) {
  const response = await fetch(`/api/rules/${ruleId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return await response.json();
}
</code></br></br>

<b>2. Получить правило с обработкой ошибок (JavaScript):</b></br>
<code>
async function loadRule(token, ruleId) {
  try {
    const response = await fetch(`/api/rules/${ruleId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    return data.data;
  } catch (error) {
    console.error('Failed to load rule:', error);
    return null;
  }
}
</code></br></br>

<b>3. Отобразить детали правила (JavaScript):</b></br>
<code>
async function displayRuleDetails(token, ruleId) {
  const data = await getRuleById(token, ruleId);
  const rule = data.data;
  
  document.getElementById('ruleName').textContent = rule.name_ru || rule.name;
  document.getElementById('ruleDescription').textContent = rule.description_ru || rule.description;
  document.getElementById('ruleSeverity').textContent = rule.severity;
  document.getElementById('ruleStatus').textContent = rule.status;
  document.getElementById('ruleTechnique').textContent = rule.attack_id;
  
  // Отобразить теги
  const tagsHtml = rule.tags.map(tag => `<span class="badge">${tag}</span>`).join('');
  document.getElementById('ruleTags').innerHTML = tagsHtml;
}
</code></br></br>

<b>Примечания:</b></br>
- Требуется авторизация (@login_required)</br>
- UUID валидируется перед запросом в БД</br>
- JSON поля (logic, tags, custom_fields) автоматически парсятся</br>
- Включает данные из связанных таблиц (techniques, rule_metadata)</br>
- Если правило не найдено, возвращается 404</br>
- test_results, performance_rating, custom_fields могут быть null</br></br>

<b>Производительность:</b></br>
- Время ответа: ~50-150ms</br>
- Размер ответа: ~2-5KB</br>
- JOIN с techniques и rule_metadata</br>
- Рекомендуется кешировать на 5-10 минут</br></br>

    """
    try:
        if not validate_uuid(rule_id):
            return jsonify({"success": False, "error": "Некорректный формат UUID"}), 400

        query = """
            SELECT 
                cr.*,
                t.attack_id,
                t.name as technique_name,
                t.name_ru as technique_name_ru,
                rm.test_results,
                rm.performance_rating,
                rm.custom_fields
            FROM correlation_rules cr
            LEFT JOIN techniques t ON cr.technique_id = t.id
            LEFT JOIN rule_metadata rm ON cr.id = rm.rule_id
            WHERE cr.id = :rule_id
        """

        result = db.session.execute(text(query), {"rule_id": rule_id}).fetchone()

        if not result:
            return jsonify({"success": False, "error": "Правило не найдено"}), 404

        rule = dict(result._mapping)

        # Парсинг JSON полей
        json_fields = ["logic", "tags", "custom_fields"]
        for field in json_fields:
            if rule.get(field):
                try:
                    rule[field] = (
                        json.loads(rule[field])
                        if isinstance(rule[field], str)
                        else rule[field]
                    )
                except:
                    rule[field] = None

        return jsonify({"success": True, "data": rule}), 200

    except Exception as e:
        logger.error(f"Ошибка получения правила {rule_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@rules_bp.route("/<rule_id>", methods=["PUT"])
@login_required
@require_role(["admin", "analyst"])
def update_rule(rule_id):
    """
    Обновить информацию о правиле корреляции с валидацией данных и аудит-логированием.

Позволяет администраторам и аналитикам обновлять название, описание, статус, уровень риска
и теги правила корреляции. Автоматически обновляет временную метку updated_at, санитизирует
входные данные и логирует все изменения для аудита. Требует авторизации с ролью admin или analyst.
</br></br>

<b>Метод:</b> PUT</br>
<b>URL:</b> /api/rules/{rule_id}</br>
<b>Авторизация:</b> Требуется @require_role(["admin", "analyst"])</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры пути:</b></br>
- <code>rule_id</code> [UUID] - уникальный идентификатор правила (обязательный, формат UUID)</br></br>

<b>Параметры тела запроса (все опциональны):</b></br>
- <code>name</code> [STRING] - новое название правила (санитизируется, обновляет также name_ru)</br>
- <code>description</code> [STRING] - новое описание (санитизируется, обновляет также description_ru)</br>
- <code>status</code> [STRING] - новый статус (валидные: active, disabled)</br>
- <code>severity</code> [STRING] - новый уровень риска (валидные: low, medium, high, critical)</br>
- <code>tags</code> [ARRAY] - новые теги (автоматически конвертируются в JSON)</br></br>

<b>Запросы curl:</b></br>
<code>
# Обновить название и описание
curl -X PUT "http://172.30.250.199:5000/api/rules/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Enhanced Brute Force Detection",
    "description": "Improved detection of brute force attacks with lower false positives"
  }'</br></br>

# Изменить статус на disabled
curl -X PUT "http://172.30.250.199:5000/api/rules/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "disabled"
  }'</br></br>

# Обновить severity и теги
curl -X PUT "http://172.30.250.199:5000/api/rules/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "critical",
    "tags": ["authentication", "brute-force", "credential-access", "high-priority"]
  }'</br></br>

# Комплексное обновление
curl -X PUT "http://172.30.250.199:5000/api/rules/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Advanced Login Anomaly Detection",
    "description": "Detects anomalous login patterns with ML-enhanced analysis",
    "severity": "high",
    "status": "active",
    "tags": ["authentication", "anomaly", "machine-learning"]
  }'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "message": "Правило успешно обновлено"
}</pre></br></br>

<b>Ошибка: правило не найдено (HTTP 404):</b></br>
<pre>{
  "success": false,
  "error": "Правило не найдено"
}</pre></br></br>

<b>Ошибка: нет данных для обновления (HTTP 400):</b></br>
<pre>{
  "success": false,
  "error": "Нет данных для обновления"
}</pre></br></br>

<b>Ошибка: некорректный UUID (HTTP 400):</b></br>
<pre>{
  "success": false,
  "error": "Некорректный формат UUID"
}</pre></br></br>

<b>Ошибка: недостаточно прав (HTTP 403):</b></br>
<pre>{
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "success": false,
  "error": "Ошибка обновления правила: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Правило успешно обновлено</br>
- 400: Некорректный UUID или нет данных для обновления</br>
- 401: Пользователь не авторизован</br>
- 403: Недостаточно прав (требуется admin или analyst)</br>
- 404: Правило не найдено</br>
- 500: Ошибка при обновлении</br></br>

<b>Валидация полей:</b></br>

<b>Status (только эти значения):</b></br>
- <code>active</code> - правило активно</br>
- <code>disabled</code> - правило отключено</br>
<i>Другие значения игнорируются</i></br></br>

<b>Severity (только эти значения):</b></br>
- <code>low</code> - низкий уровень риска</br>
- <code>medium</code> - средний уровень риска</br>
- <code>high</code> - высокий уровень риска</br>
- <code>critical</code> - критический уровень риска</br>
<i>Другие значения игнорируются</i></br></br>

<b>Примеры использования:</b></br>

<b>1. Обновить правило (JavaScript):</b></br>
<code>
async function updateRule(token, ruleId, updates) {
  const response = await fetch(`/api/rules/${ruleId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Изменить статус правила (JavaScript):</b></br>
<code>
async function toggleRuleStatus(token, ruleId, isActive) {
  const response = await fetch(`/api/rules/${ruleId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: isActive ? 'active' : 'disabled'
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>3. Обновить severity (JavaScript):</b></br>
<code>
async function updateRuleSeverity(token, ruleId, severity) {
  const validSeverities = ['low', 'medium', 'high', 'critical'];
  
  if (!validSeverities.includes(severity)) {
    throw new Error('Invalid severity level');
  }
  
  const response = await fetch(`/api/rules/${ruleId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ severity })
  });
  
  return await response.json();
}
</code></br></br>

<b>4. Обновить теги правила (JavaScript):</b></br>
<code>
async function updateRuleTags(token, ruleId, tags) {
  const response = await fetch(`/api/rules/${ruleId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tags })
  });
  
  return await response.json();
}

// Использование:
await updateRuleTags(token, ruleId, ['authentication', 'brute-force', 'high-priority']);
</code></br></br>

<b>5. Комплексное обновление с проверкой (JavaScript):</b></br>
<code>
async function safeUpdateRule(token, ruleId, updates) {
  try {
    // Валидация severity
    if (updates.severity && !['low', 'medium', 'high', 'critical'].includes(updates.severity)) {
      throw new Error('Invalid severity level');
    }
    
    // Валидация status
    if (updates.status && !['active', 'disabled'].includes(updates.status)) {
      throw new Error('Invalid status');
    }
    
    const response = await fetch(`/api/rules/${ruleId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error) {
    console.error('Failed to update rule:', error);
    throw error;
  }
}
</code></br></br>

<b>Процесс обновления:</b></br>
1. Валидация формата UUID правила</br>
2. Получение JSON данных из тела запроса</br>
3. Проверка существования правила в БД</br>
4. Валидация обновляемых полей (status, severity)</br>
5. Санитизация текстовых полей (name, description)</br>
6. Конвертация tags в JSON формат</br>
7. Динамическое построение SQL UPDATE запроса</br>
8. Автоматическое обновление updated_at</br>
9. Логирование события аудита (RULE_UPDATE)</br>
10. Фиксация изменений (commit)</br></br>

<b>Примечания:</b></br>
- Требуется роль admin или analyst (@require_role)</br>
- Все входные данные санитизируются</br>
- UUID валидируется перед запросом</br>
- Обновляются только переданные поля</br>
- updated_at обновляется автоматически</br>
- Действие логируется в audit log</br>
- При ошибке БД выполняется rollback</br>
- name обновляет также name_ru</br>
- description обновляет также description_ru</br></br>

<b>Производительность:</b></br>
- Время ответа: ~50-200ms</br>
- Размер ответа: ~100 байт</br>
- Транзакционная операция (с rollback при ошибке)</br></br>

<b>Рекомендации:</b></br>
1. Валидируйте данные на клиенте перед отправкой</br>
2. Обрабатывайте ошибку 404 (правило не найдено)</br>
3. Показывайте пользователю список обновлённых полей</br>
4. Логируйте все операции обновления</br>
5. Обновляйте UI после успешного обновления</br></br>

    """
    try:
        if not validate_uuid(rule_id):
            return jsonify({"success": False, "error": "Некорректный формат UUID"}), 400

        data = request.get_json()

        # Проверка существования правила
        check_query = "SELECT id FROM correlation_rules WHERE id = :rule_id"
        exists = db.session.execute(text(check_query), {"rule_id": rule_id}).fetchone()

        if not exists:
            return jsonify({"success": False, "error": "Правило не найдено"}), 404

        # Обновляемые поля
        update_fields = []
        params = {"rule_id": rule_id}

        if "name" in data:
            update_fields.append("name = :name")
            update_fields.append("name_ru = :name")
            params["name"] = sanitize_input(data["name"])

        if "description" in data:
            update_fields.append("description = :description")
            update_fields.append("description_ru = :description")
            params["description"] = sanitize_input(data["description"])

        if "status" in data and data["status"] in ["active", "disabled"]:
            update_fields.append("status = :status")
            params["status"] = data["status"]

        if "severity" in data and data["severity"] in [
            "low",
            "medium",
            "high",
            "critical",
        ]:
            update_fields.append("severity = :severity")
            params["severity"] = data["severity"]

        if "tags" in data:
            update_fields.append("tags = :tags")
            params["tags"] = json.dumps(data["tags"], ensure_ascii=False)

        if not update_fields:
            return (
                jsonify({"success": False, "error": "Нет данных для обновления"}),
                400,
            )

        # Обновление
        update_query = f"""
            UPDATE correlation_rules 
            SET {', '.join(update_fields)}, updated_at = NOW()
            WHERE id = :rule_id
        """

        db.session.execute(text(update_query), params)
        db.session.commit()

        # Логирование
        user = get_current_user()
        log_audit_event(
            event_type="RULE_UPDATE",
            description=f"Обновлено правило {rule_id}",
            user_id=user.id if user else None,
        )

        return jsonify({"success": True, "message": "Правило успешно обновлено"}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Ошибка обновления правила {rule_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@rules_bp.route("/<rule_id>", methods=["DELETE"])
@login_required
@require_role(["admin"])
def delete_rule(rule_id):
    """
Удалить правило корреляции с каскадным удалением метаданных и аудит-логированием.

Полностью удаляет правило корреляции из системы вместе со всеми связанными метаданными
(test_results, performance_rating, custom_fields). Операция необратима и требует прав администратора.
Автоматически логирует удаление в audit log с уровнем WARNING для отслеживания критических изменений.
При ошибке выполняется rollback транзакции.
</br></br>

<b>Метод:</b> DELETE</br>
<b>URL:</b> /api/rules/{rule_id}</br>
<b>Авторизация:</b> Требуется @require_role(["admin"]) (только администраторы)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры пути:</b></br>
- <code>rule_id</code> [UUID] - уникальный идентификатор правила (обязательный, формат UUID)</br></br>

<b>Запросы curl:</b></br>
<code>
# Удалить правило по UUID
curl -X DELETE "http://172.30.250.199:5000/api/rules/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# С подтверждением успеха
curl -X DELETE "http://172.30.250.199:5000/api/rules/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq '.'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "message": "Правило успешно удалено"
}</pre></br></br>

<b>Ошибка: правило не найдено (HTTP 404):</b></br>
<pre>{
  "success": false,
  "error": "Правило не найдено"
}</pre></br></br>

<b>Ошибка: некорректный UUID (HTTP 400):</b></br>
<pre>{
  "success": false,
  "error": "Некорректный формат UUID"
}</pre></br></br>

<b>Ошибка: недостаточно прав (HTTP 403):</b></br>
<pre>{
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "success": false,
  "error": "Ошибка удаления правила: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Правило успешно удалено</br>
- 400: Некорректный формат UUID</br>
- 401: Пользователь не авторизован</br>
- 403: Недостаточно прав (требуется admin)</br>
- 404: Правило не найдено</br>
- 500: Ошибка при удалении</br></br>

<b>Процесс удаления:</b></br>
1. Валидация формата UUID правила</br>
2. Удаление записей из rule_metadata (каскадное удаление метаданных)</br>
3. Удаление записи из correlation_rules (основное правило)</br>
4. Проверка количества удалённых строк (rowcount)</br>
5. Фиксация транзакции (commit)</br>
6. Логирование события RULE_DELETE с уровнем WARNING</br>
7. При ошибке: откат транзакции (rollback)</br></br>

<b>Примеры использования:</b></br>

<b>1. Удалить правило (JavaScript):</b></br>
odede>
async function deleteRule(adminToken, ruleId) {
  const response = await fetch(`/api/rules/${ruleId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Удалить правило с подтверждением (JavaScript):</b></br>
<code>
async function deleteRuleWithConfirm(adminToken, ruleId, ruleName) {
  const confirmed = confirm(
    `Вы уверены, что хотите удалить правило "${ruleName}"?\n\n` +
    `Это действие необратимо и удалит все связанные метаданные.`
  );
  
  if (!confirmed) return null;
  
  const response = await fetch(`/api/rules/${ruleId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    alert(`Правило "${ruleName}" успешно удалено`);
  } else {
    alert(`Ошибка удаления: ${data.error}`);
  }
  
  return data;
}
</code></br></br>

<b>3. Удалить правило с обработкой ошибок (JavaScript):</b></br>
<code>
async function safeDeleteRule(adminToken, ruleId) {
  try {
    const response = await fetch(`/api/rules/${ruleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error) {
    console.error('Failed to delete rule:', error);
    throw error;
  }
}
</code></br></br>

<b>4. Удалить правило из таблицы (JavaScript):</b></br>
<code>
async function handleDeleteButtonClick(adminToken, ruleId, ruleName) {
  const confirmed = confirm(`Удалить правило "${ruleName}"?`);
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`/api/rules/${ruleId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Удалить строку из таблицы
      document.getElementById(`rule-row-${ruleId}`).remove();
      showNotification('Правило успешно удалено', 'success');
    } else {
      showNotification(`Ошибка: ${data.error}`, 'error');
    }
  } catch (error) {
    showNotification('Не удалось удалить правило', 'error');
  }
}
</code></br></br>

<b>Примечания:</b></br>
- Только администраторы могут удалять правила (@require_role(["admin"]))</br>
- Операция необратима - удаление нельзя отменить</br>
- UUID валидируется перед удалением</br>
- Каскадное удаление метаданных из rule_metadata</br>
- Логируется с уровнем WARNING для аудита</br>
- При ошибке БД выполняется rollback транзакции</br>
- Если правило не найдено, возвращается 404</br></br>

<b>Безопасность:</b></br>
- Требуется роль администратора</br>
- Валидация UUID предотвращает SQL-инъекции</br>
- Транзакционная операция (rollback при ошибке)</br>
- Логирование с ID администратора для аудита</br></br>

<b>Производительность:</b></br>
- Время ответа: ~50-150ms</br>
- Размер ответа: ~100 байт</br>
- Каскадное удаление (2 DELETE запроса)</br></br>

<b>Рекомендации:</b></br>
1. Всегда запрашивайте подтверждение перед удалением</br>
2. Предупредите пользователя о необратимости операции</br>
3. Обновите UI после успешного удаления</br>
4. Логируйте все операции удаления</br>
5. Показывайте название правила в диалоге подтверждения</br></br>
    """
    try:
        if not validate_uuid(rule_id):
            return jsonify({"success": False, "error": "Некорректный формат UUID"}), 400

        # Удаление метаданных
        db.session.execute(
            text("DELETE FROM rule_metadata WHERE rule_id = :rule_id"),
            {"rule_id": rule_id},
        )

        # Удаление правила
        result = db.session.execute(
            text("DELETE FROM correlation_rules WHERE id = :rule_id"),
            {"rule_id": rule_id},
        )

        if result.rowcount == 0:
            return jsonify({"success": False, "error": "Правило не найдено"}), 404

        db.session.commit()

        # Логирование
        user = get_current_user()
        log_audit_event(
            event_type="RULE_DELETE",
            description=f"Удалено правило {rule_id}",
            user_id=user.id if user else None,
        )

        return jsonify({"success": True, "message": "Правило успешно удалено"}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Ошибка удаления правила {rule_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


# ==========================================
# СТАТИСТИКА И АНАЛИТИКА
# ==========================================


@rules_bp.route("/statistics", methods=["GET"])
@login_required
def get_rules_statistics():
    """
    Получить комплексную статистику по правилам корреляции с топ-10 техниками по покрытию.

Возвращает подробную статистику правил корреляции: общее количество, разбивку по статусу (active/disabled),
распределение по уровням риска (critical/high/medium/low), количество уникальных покрытых техник.
Включает топ-10 техник MITRE ATT&CK с наибольшим количеством правил для анализа покрытия.
Требует авторизации (@login_required).
</br></br>

<b>Метод:</b> GET</br>
<b>URL:</b> /api/rules/statistics</br>
<b>Авторизация:</b> Требуется @login_required (любой авторизованный пользователь)</br>
<b>Параметры запроса:</b> Нет</br></br>

<b>Запросы curl:</b></br>
<code>
# Получить статистику по правилам
curl -X GET "http://172.30.250.199:5000/api/rules/statistics" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# С красивым форматированием
curl -X GET "http://172.30.250.199:5000/api/rules/statistics" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.'</br></br>

# Получить только общее количество правил
curl -X GET "http://172.30.250.199:5000/api/rules/statistics" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.data.total_rules'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": {
    "total_rules": 124,
    "active_rules": 98,
    "disabled_rules": 26,
    "critical_rules": 15,
    "high_rules": 34,
    "medium_rules": 52,
    "low_rules": 23,
    "unique_techniques": 47,
    "top_techniques": [
      {
        "attack_id": "T1078",
        "name": "Valid Accounts",
        "rules_count": 12
      },
      {
        "attack_id": "T1059",
        "name": "Command and Scripting Interpreter",
        "rules_count": 10
      },
      {
        "attack_id": "T1105",
        "name": "Ingress Tool Transfer",
        "rules_count": 8
      },
      {
        "attack_id": "T1003",
        "name": "OS Credential Dumping",
        "rules_count": 7
      },
      {
        "attack_id": "T1082",
        "name": "System Information Discovery",
        "rules_count": 6
      },
      {
        "attack_id": "T1055",
        "name": "Process Injection",
        "rules_count": 5
      },
      {
        "attack_id": "T1071",
        "name": "Application Layer Protocol",
        "rules_count": 5
      },
      {
        "attack_id": "T1068",
        "name": "Exploitation for Privilege Escalation",
        "rules_count": 4
      },
      {
        "attack_id": "T1547",
        "name": "Boot or Logon Autostart Execution",
        "rules_count": 4
      },
      {
        "attack_id": "T1112",
        "name": "Modify Registry",
        "rules_count": 3
      }
    ]
  }
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "success": false,
  "error": "Ошибка получения статистики: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Статистика успешно получена</br>
- 401: Пользователь не авторизован</br>
- 500: Ошибка при получении статистики</br></br>

<b>Структура ответа:</b></br>

<b>Основная статистика:</b></br>
- <code>total_rules</code> [INT] - общее количество правил корреляции</br>
- <code>active_rules</code> [INT] - количество активных правил (status = 'active')</br>
- <code>disabled_rules</code> [INT] - количество отключённых правил (status = 'disabled')</br>
- <code>unique_techniques</code> [INT] - количество уникальных покрытых техник MITRE ATT&CK</br></br>

<b>Распределение по уровню риска (severity):</b></br>
- <code>critical_rules</code> [INT] - критический уровень</br>
- <code>high_rules</code> [INT] - высокий уровень</br>
- <code>medium_rules</code> [INT] - средний уровень</br>
- <code>low_rules</code> [INT] - низкий уровень</br></br>

<b>Топ-10 техник (top_techniques):</b></br>
Массив объектов с техниками, для которых создано наибольшее количество правил:</br>
- <code>attack_id</code> [STRING] - MITRE ATT&CK ID техники (например, T1078)</br>
- <code>name</code> [STRING] - название техники MITRE ATT&CK</br>
- <code>rules_count</code> [INT] - количество правил для этой техники</br></br>

<b>Примеры использования:</b></br>

<b>1. Получить статистику (JavaScript):</b></br>
<code>
async function getRulesStatistics(token) {
  const response = await fetch('/api/rules/statistics', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Отобразить статистику на дашборде (JavaScript):</b></br>
<code>
async function displayRulesStatistics(token) {
  const data = await getRulesStatistics(token);
  const stats = data.data;
  
  document.getElementById('totalRules').textContent = stats.total_rules;
  document.getElementById('activeRules').textContent = stats.active_rules;
  document.getElementById('disabledRules').textContent = stats.disabled_rules;
  document.getElementById('uniqueTechniques').textContent = stats.unique_techniques;
  
  // Диаграмма по severity
  const severityChart = {
    critical: stats.critical_rules,
    high: stats.high_rules,
    medium: stats.medium_rules,
    low: stats.low_rules
  };
  
  renderSeverityChart(severityChart);
  
  // Топ-10 техник
  renderTopTechniques(stats.top_techniques);
}
</code></br></br>

<b>3. Анализ покрытия (JavaScript):</b></br>
<code>
async function analyzeRulesCoverage(token) {
  const data = await getRulesStatistics(token);
  const stats = data.data;
  
  const activePercent = ((stats.active_rules / stats.total_rules) * 100).toFixed(1);
  const criticalPercent = ((stats.critical_rules / stats.total_rules) * 100).toFixed(1);
  
  return {
    totalRules: stats.total_rules,
    activeRules: stats.active_rules,
    activePercent: activePercent + '%',
    criticalPercent: criticalPercent + '%',
    uniqueTechniques: stats.unique_techniques,
    topTechnique: stats.top_techniques[0]
  };
}
</code></br></br>

<b>4. Создать KPI карточки (JavaScript):</b></br>
<code>
async function createRulesKPIs(token) {
  const data = await getRulesStatistics(token);
  const stats = data.data;
  
  return [
    {
      title: 'Всего правил',
      value: stats.total_rules,
      icon: 'fa-shield-alt',
      color: 'primary'
    },
    {
      title: 'Активных',
      value: stats.active_rules,
      icon: 'fa-check-circle',
      color: 'success'
    },
    {
      title: 'Критических',
      value: stats.critical_rules,
      icon: 'fa-exclamation-triangle',
      color: 'danger'
    },
    {
      title: 'Техник покрыто',
      value: stats.unique_techniques,
      icon: 'fa-bullseye',
      color: 'info'
    }
  ];
}
</code></br></br>

<b>5. Построить график топ-10 техник (JavaScript):</b></br>
<code>
async function renderTopTechniquesChart(token) {
  const data = await getRulesStatistics(token);
  const topTechniques = data.data.top_techniques;
  
  const labels = topTechniques.map(t => t.attack_id);
  const values = topTechniques.map(t => t.rules_count);
  
  // Создать график (например, с Chart.js)
  const ctx = document.getElementById('topTechniquesChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Количество правил',
        data: values,
        backgroundColor: 'rgba(54, 162, 235, 0.6)'
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}
</code></br></br>

<b>6. Проверка здоровья системы (JavaScript):</b></br>
<code>
async function checkRulesHealth(token) {
  const data = await getRulesStatistics(token);
  const stats = data.data;
  
  const health = {
    status: 'HEALTHY',
    warnings: [],
    info: []
  };
  
  // Проверка: мало активных правил
  const activePercent = (stats.active_rules / stats.total_rules) * 100;
  if (activePercent < 50) {
    health.warnings.push(`⚠️ Только ${activePercent.toFixed(1)}% правил активны`);
    health.status = 'WARNING';
  }
  
  // Проверка: мало критических правил
  if (stats.critical_rules < 10) {
    health.info.push(`ℹ️ Всего ${stats.critical_rules} критических правил`);
  }
  
  // Проверка: мало покрытых техник
  if (stats.unique_techniques < 30) {
    health.warnings.push(`⚠️ Покрыто только ${stats.unique_techniques} техник`);
    health.status = 'WARNING';
  }
  
  return health;
}
</code></br></br>

<b>Примечания:</b></br>
- Требуется авторизация (@login_required)</br>
- Статистика рассчитывается в реальном времени</br>
- top_techniques отсортированы по убыванию rules_count</br>
- Включает только техники с хотя бы одним правилом</br>
- Ограничение топ-10 техник для производительности</br></br>

<b>Производительность:</b></br>
- Время ответа: ~100-300ms</br>
- Размер ответа: ~1-2KB</br>
- Рекомендуется кешировать на 5-10 минут</br>
- JOIN с таблицей techniques</br></br>

<b>Сценарии использования:</b></br>
- Дашборды администратора</br>
- Анализ покрытия техник MITRE ATT&CK</br>
- Планирование разработки новых правил</br>
- Мониторинг активных правил</br>
- Отчёты по безопасности</br></br>

<b>Рекомендации:</b></br>
1. Обновляйте статистику на дашборде каждые 5-10 минут</br>
2. Используйте для визуализации графиков и диаграмм</br>
3. Отслеживайте изменения количества активных правил</br>
4. Анализируйте топ-10 техник для приоритизации</br>
5. Кешируйте результаты на клиенте</br></br>

    """
    try:
        stats_query = """
            SELECT 
                COUNT(*) as total_rules,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_rules,
                SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) as disabled_rules,
                SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_rules,
                SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high_rules,
                SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium_rules,
                SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low_rules,
                COUNT(DISTINCT technique_id) as unique_techniques
            FROM correlation_rules
        """

        result = db.session.execute(text(stats_query)).fetchone()
        stats = dict(result._mapping) if result else {}

        # Статистика по техникам
        techniques_query = """
            SELECT 
                t.attack_id,
                t.name,
                COUNT(cr.id) as rules_count
            FROM techniques t
            LEFT JOIN correlation_rules cr ON t.id = cr.technique_id
            GROUP BY t.id, t.attack_id, t.name
            HAVING COUNT(cr.id) > 0
            ORDER BY rules_count DESC
            LIMIT 10
        """

        techniques_result = db.session.execute(text(techniques_query))
        top_techniques = [dict(row._mapping) for row in techniques_result]

        stats["top_techniques"] = top_techniques

        return jsonify({"success": True, "data": stats}), 200

    except Exception as e:
        logger.error(f"Ошибка получения статистики: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


# ==========================================
# СИНХРОНИЗАЦИЯ С ПЛАТФОРМОЙ РАДАР
# ==========================================


@rules_bp.route("/sync/radar", methods=["POST"])
@login_required
@require_role(["admin"])
def sync_with_radar():
    """
    Запустить ручную синхронизацию правил корреляции с Платформой Радар (только для администраторов).

<b>Метод:</b> POST</br>
<b>URL:</b> /api/rules/sync/radar</br>
<b>Авторизация:</b> @require_role(["admin"])</br></br>

<b>Запрос curl:</b></br>
<code>
curl -X POST "http://172.30.250.199:5000/api/rules/sync/radar" \
  -H "Authorization: Bearer ADMIN_TOKEN"
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "message": "Синхронизация завершена успешно",
  "stats": {
    "rules_added": 15,
    "rules_updated": 23,
    "rules_deleted": 2,
    "duration_seconds": 12.5
  }
}</pre></br></br>

<b>Ошибка (HTTP 500):</b></br>
<pre>{
  "success": false,
  "error": "Connection to Radar failed"
}</pre></br></br>

<b>JavaScript:</b></br>
<code>
async function syncWithRadar(adminToken) {
  const response = await fetch('/api/rules/sync/radar', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  return await response.json();
}
</code></br></br>

    """
    try:
        from models.radar_sync_service import sync_rules_from_radar

        logger.info("Запущена ручная синхронизация с Платформой Радар")

        # Запуск синхронизации
        stats = sync_rules_from_radar(db, current_app.config)

        # Логирование в audit
        user = get_current_user()
        log_audit_event(
            event_type="RADAR_SYNC",
            description=f"Синхронизация с Радар завершена: добавлено {stats['rules_added']}, обновлено {stats['rules_updated']}",
            user_id=user.id if user else None,
        )

        return (
            jsonify(
                {
                    "success": True,
                    "message": "Синхронизация завершена успешно",
                    "stats": stats,
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"Ошибка синхронизации с Радар: {e}", exc_info=True)

        user = get_current_user()
        log_audit_event(
            event_type="RADAR_SYNC_ERROR",
            description=f"Ошибка синхронизации с Радар: {str(e)}",
            user_id=user.id if user else None,
        )

        return jsonify({"success": False, "error": str(e)}), 500


@rules_bp.route("/sync/radar/status", methods=["GET"])
@login_required
@require_role(["admin", "analyst"])
def get_sync_status():
    """
    Получить информацию о последней синхронизации с Платформой Радар.

<b>Метод:</b> GET</br>
<b>URL:</b> /api/rules/sync/radar/status</br>
<b>Авторизация:</b> @require_role(["admin", "analyst"])</br></br>

<b>Запрос curl:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/rules/sync/radar/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "status": {
    "event_type": "RADAR_SYNC",
    "level": "INFO",
    "description": "Синхронизация с Радар завершена: добавлено 15, обновлено 23",
    "created_at": "2025-10-23T16:30:00",
    "is_success": true
  }
}</pre></br></br>

<b>Ответ (синхронизация не выполнялась):</b></br>
<pre>{
  "success": true,
  "status": {
    "event_type": null,
    "level": null,
    "description": "Синхронизация еще не выполнялась",
    "created_at": null,
    "is_success": null
  }
}</pre></br></br>

<b>JavaScript:</b></br>
<code>
async function getSyncStatus(token) {
  const response = await fetch('/api/rules/sync/radar/status', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
}
</code></br></br>

    """
    try:
        # Получаем информацию о последней синхронизации из audit лога
        query = """
            SELECT 
                event_type,
                level,
                description,
                created_at
            FROM audit_logs
            WHERE event_type IN ('RADAR_SYNC', 'RADAR_SYNC_ERROR')
            ORDER BY created_at DESC
            LIMIT 1
        """

        result = db.session.execute(text(query)).fetchone()

        if result:
            status = dict(result._mapping)
            status["is_success"] = result[0] == "RADAR_SYNC"
        else:
            status = {
                "event_type": None,
                "level": None,
                "description": "Синхронизация еще не выполнялась",
                "created_at": None,
                "is_success": None,
            }

        return jsonify({"success": True, "status": status}), 200

    except Exception as e:
        logger.error(f"Ошибка получения статуса синхронизации: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@rules_bp.route("/sync/radar/schedule", methods=["GET", "POST"])
@login_required
@require_role(["admin"])
def manage_sync_schedule():
    """
    Получить или обновить настройки автоматической синхронизации (только для администраторов).

<b>Метод:</b> GET | POST</br>
<b>URL:</b> /api/rules/sync/radar/schedule</br>
<b>Авторизация:</b> @require_role(["admin"])</br></br>

<b>GET - Получить расписание:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/rules/sync/radar/schedule" \
  -H "Authorization: Bearer ADMIN_TOKEN"
</code></br></br>

<b>Ответ GET (HTTP 200):</b></br>
<pre>{
  "success": true,
  "schedule": {
    "interval": 3600,
    "interval_hours": 1.0,
    "auto_start": true,
    "batch_size": 1000,
    "radar_url": "https://radar.example.com",
    "verify_ssl": false
  }
}</pre></br></br>

<b>POST - Обновить расписание:</b></br>
<code>
curl -X POST "http://172.30.250.199:5000/api/rules/sync/radar/schedule" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"interval": 7200, "auto_start": true}'
</code></br></br>

<b>Ответ POST (HTTP 200):</b></br>
<pre>{
  "success": true,
  "message": "Для применения изменений требуется перезапуск сервиса синхронизации",
  "note": "Обновите параметры в .env файле и перезапустите: systemctl restart radar-sync"
}</pre></br></br>

<b>JavaScript:</b></br>
<code>
// Получить расписание
async function getSchedule(adminToken) {
  const response = await fetch('/api/rules/sync/radar/schedule', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  return await response.json();
}

// Обновить расписание
async function updateSchedule(adminToken, settings) {
  const response = await fetch('/api/rules/sync/radar/schedule', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings)
  });
  return await response.json();
}
</code></br></br>

<b>Параметры schedule:</b></br>
- <code>interval</code> - интервал синхронизации в секундах</br>
- <code>interval_hours</code> - интервал в часах</br>
- <code>auto_start</code> - автозапуск синхронизации</br>
- <code>batch_size</code> - размер пакета для обработки</br>
- <code>radar_url</code> - URL Платформы Радар</br>
- <code>verify_ssl</code> - проверка SSL сертификата</br></br>

    """
    if request.method == "GET":
        return (
            jsonify(
                {
                    "success": True,
                    "schedule": {
                        "interval": current_app.config.get("RADAR_SYNC_INTERVAL", 3600),
                        "interval_hours": current_app.config.get(
                            "RADAR_SYNC_INTERVAL", 3600
                        )
                        / 3600,
                        "auto_start": current_app.config.get(
                            "RADAR_SYNC_AUTO_START", True
                        ),
                        "batch_size": current_app.config.get(
                            "RADAR_SYNC_BATCH_SIZE", 1000
                        ),
                        "radar_url": current_app.config.get("RADAR_BASE_URL", ""),
                        "verify_ssl": current_app.config.get("RADAR_VERIFY_SSL", False),
                    },
                }
            ),
            200,
        )

    elif request.method == "POST":
        data = request.get_json()

        # В реальном приложении здесь можно обновить конфигурацию
        # Для применения изменений требуется перезапуск сервиса

        user = get_current_user()
        log_audit_event(
            event_type="RADAR_SYNC_CONFIG",
            description=f"Запрос на изменение настроек синхронизации: {json.dumps(data)}",
            user_id=user.id if user else None,
        )

        return (
            jsonify(
                {
                    "success": True,
                    "message": "Для применения изменений требуется перезапуск сервиса синхронизации",
                    "note": "Обновите параметры в .env файле и перезапустите: systemctl restart radar-sync",
                }
            ),
            200,
        )


# ==========================================
# ДОПОЛНИТЕЛЬНЫЕ ENDPOINTS
# ==========================================


@rules_bp.route("/by-technique/<technique_id>", methods=["GET"])
@login_required
def get_rules_by_technique(technique_id):
    """
    Получить список всех правил корреляции для конкретной техники MITRE ATT&CK по UUID.

<b>Метод:</b> GET</br>
<b>URL:</b> /api/rules/by-technique/{technique_id}</br>
<b>Авторизация:</b> @login_required</br></br>

<b>Параметры пути:</b></br>
- <code>technique_id</code> [UUID] - уникальный ID техники (обязательный)</br></br>

<b>Запрос curl:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/rules/by-technique/a5f2e9b1-3c4d-4e5f-8a9b-1c2d3e4f5a6b" \
  -H "Authorization: Bearer YOUR_TOKEN"
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Suspicious Login Activity",
      "description": "Detects multiple failed login attempts",
      "severity": "high",
      "status": "active",
      "created_at": "2025-10-20T10:00:00",
      "updated_at": "2025-10-23T14:30:00"
    },
    {
      "id": "660f9511-f39c-52e5-b827-557766551111",
      "name": "Brute Force Detection",
      "description": "Detects brute force login attempts",
      "severity": "critical",
      "status": "active",
      "created_at": "2025-10-21T09:00:00",
      "updated_at": "2025-10-23T15:00:00"
    }
  ],
  "count": 2
}</pre></br></br>

<b>Пустой результат (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": [],
  "count": 0
}</pre></br></br>

<b>Ошибка: некорректный UUID (HTTP 400):</b></br>
<pre>{
  "success": false,
  "error": "Некорректный формат UUID"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Список правил успешно получен (может быть пустым)</br>
- 400: Некорректный формат UUID</br>
- 401: Не авторизован</br>
- 500: Ошибка сервера</br></br>

<b>Структура ответа:</b></br>
- <code>success</code> - статус операции</br>
- <code>data</code> - массив правил корреляции</br>
- <code>count</code> - количество найденных правил</br></br>

<b>Поля правила:</b></br>
- <code>id</code> - UUID правила</br>
- <code>name</code> - название правила</br>
- <code>description</code> - описание</br>
- <code>severity</code> - уровень риска (low/medium/high/critical)</br>
- <code>status</code> - статус (active/disabled)</br>
- <code>created_at</code> - время создания</br>
- <code>updated_at</code> - время обновления</br></br>

<b>JavaScript:</b></br>
<code>
// Получить правила для техники
async function getRulesByTechnique(token, techniqueId) {
  const response = await fetch(`/api/rules/by-technique/${techniqueId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
}

// Пример использования
const rules = await getRulesByTechnique(token, 'a5f2e9b1-3c4d-4e5f-8a9b-1c2d3e4f5a6b');
console.log(`Found ${rules.count} rules`);
</code></br></br>

<b>Примечания:</b></br>
- Требуется авторизация</br>
- UUID валидируется перед запросом</br>
- Результаты отсортированы по updated_at DESC (новые первые)</br>
- Если правил нет, возвращается пустой массив</br></br>

    """
    try:
        if not validate_uuid(technique_id):
            return jsonify({"success": False, "error": "Некорректный формат UUID"}), 400

        query = """
            SELECT 
                cr.id,
                cr.name,
                cr.description,
                cr.severity,
                cr.status,
                cr.created_at,
                cr.updated_at
            FROM correlation_rules cr
            WHERE cr.technique_id = :technique_id
            ORDER BY cr.updated_at DESC
        """

        result = db.session.execute(text(query), {"technique_id": technique_id})
        rules = [dict(row._mapping) for row in result]

        return jsonify({"success": True, "data": rules, "count": len(rules)}), 200

    except Exception as e:
        logger.error(f"Ошибка получения правил по технике {technique_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@rules_bp.route("/search", methods=["POST"])
@login_required
def search_rules():
    """
    Расширенный поиск правил с фильтрацией по названию, описанию, технике MITRE ATT&CK, severity и status.

<b>Метод:</b> POST</br>
<b>URL:</b> /api/rules/search</br>
<b>Авторизация:</b> @login_required</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры тела запроса:</b></br>
- <code>query</code> [STRING] - поисковый запрос (обязательный, мин. 1 символ)</br>
- <code>filters</code> [OBJECT] - дополнительные фильтры (опционально)</br>
  - <code>severity</code> [STRING] - фильтр по уровню риска</br>
  - <code>status</code> [STRING] - фильтр по статусу</br></br>

<b>Запрос curl:</b></br>
<code>
# Простой поиск
curl -X POST "http://172.30.250.199:5000/api/rules/search" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "brute force"}'</br></br>

# Поиск с фильтрами
curl -X POST "http://172.30.250.199:5000/api/rules/search" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "login",
    "filters": {
      "severity": "high",
      "status": "active"
    }
  }'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Suspicious Login Activity",
      "description": "Detects multiple failed login attempts",
      "attack_id": "T1078",
      "technique_name": "Valid Accounts",
      "severity": "high",
      "status": "active",
      "updated_at": "2025-10-23T14:30:00"
    },
    {
      "id": "660f9511-f39c-52e5-b827-557766551111",
      "name": "Brute Force Login Detection",
      "description": "Detects brute force login attempts",
      "attack_id": "T1110",
      "technique_name": "Brute Force",
      "severity": "critical",
      "status": "active",
      "updated_at": "2025-10-23T15:00:00"
    }
  ],
  "count": 2
}</pre></br></br>

<b>Ошибка: пустой запрос (HTTP 400):</b></br>
<pre>{
  "success": false,
  "error": "Поисковый запрос пуст"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Поиск выполнен успешно (может вернуть 0 результатов)</br>
- 400: Пустой поисковый запрос</br>
- 401: Не авторизован</br>
- 500: Ошибка сервера</br></br>

<b>Что ищется:</b></br>
- Название правила (name)</br>
- Описание правила (description)</br>
- MITRE ATT&CK ID (attack_id, например T1078)</br>
- Название техники MITRE (technique_name)</br></br>

<b>Структура ответа:</b></br>
- <code>success</code> - статус операции</br>
- <code>data</code> - массив найденных правил</br>
- <code>count</code> - количество результатов</br></br>

<b>Поля правила:</b></br>
- <code>id</code> - UUID правила</br>
- <code>name</code> - название</br>
- <code>description</code> - описание</br>
- <code>attack_id</code> - MITRE ATT&CK ID (T1078)</br>
- <code>technique_name</code> - название техники</br>
- <code>severity</code> - уровень риска</br>
- <code>status</code> - статус</br>
- <code>updated_at</code> - время обновления</br></br>

<b>JavaScript:</b></br>
<code>
// Простой поиск
async function searchRules(token, query) {
  const response = await fetch('/api/rules/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  return await response.json();
}

// Поиск с фильтрами
async function searchRulesAdvanced(token, query, filters = {}) {
  const response = await fetch('/api/rules/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, filters })
  });
  return await response.json();
}

// Примеры использования
const results1 = await searchRules(token, 'brute force');
console.log(`Found ${results1.count} rules`);

const results2 = await searchRulesAdvanced(token, 'login', {
  severity: 'high',
  status: 'active'
});
</code></br></br>

<b>Примечания:</b></br>
- Требуется авторизация</br>
- Поисковый запрос обязателен (не может быть пустым)</br>
- Поиск без учёта регистра (LIKE %query%)</br>
- Максимум 100 результатов</br>
- Результаты отсортированы по updated_at DESC</br>
- Фильтры комбинируются (логическое AND)</br></br>

    """
    try:
        data = request.get_json()
        search_query = data.get("query", "").strip()
        filters = data.get("filters", {})

        if not search_query:
            return jsonify({"success": False, "error": "Поисковый запрос пуст"}), 400

        query = """
            SELECT 
                cr.id,
                cr.name,
                cr.description,
                t.attack_id,
                t.name as technique_name,
                cr.severity,
                cr.status,
                cr.updated_at
            FROM correlation_rules cr
            LEFT JOIN techniques t ON cr.technique_id = t.id
            WHERE (
                cr.name LIKE :search 
                OR cr.description LIKE :search 
                OR t.attack_id LIKE :search
                OR t.name LIKE :search
            )
        """

        params = {"search": f"%{search_query}%"}

        # Дополнительные фильтры
        if filters.get("severity"):
            query += " AND cr.severity = :severity"
            params["severity"] = filters["severity"]

        if filters.get("status"):
            query += " AND cr.status = :status"
            params["status"] = filters["status"]

        query += " ORDER BY cr.updated_at DESC LIMIT 100"

        result = db.session.execute(text(query), params)
        rules = [dict(row._mapping) for row in result]

        return jsonify({"success": True, "data": rules, "count": len(rules)}), 200

    except Exception as e:
        logger.error(f"Ошибка поиска правил: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


# ============================================================================
# WORKFLOW STATUS ENDPOINTS
# ============================================================================


@rules_bp.route("/<rule_id>/workflow-status", methods=["PUT"])
@login_required
def update_rule_workflow_status(rule_id, current_user):
    """
    Обновить workflow статус правила

    Request JSON:
    {
        "workflow_status": "in_progress",
        "assignee_id": 123,
        "comment": "Текст комментария",
        "deployment_mr_url": "https://gitlab.com/project/-/merge_requests/123"
    }
    """

    try:
        data = request.get_json()
        new_status = data.get("workflow_status")
        assignee_id = data.get("assignee_id")
        comment_text = data.get("comment")
        deployment_mr_url = data.get("deployment_mr_url")

        if not new_status:
            return create_success_response(400, error="workflow_status обязателен")

        # Получаем правило
        rule = db.session.query(rule).filter(rule.id == rule_id).first()
        if not rule:
            return create_success_response(404, error="Правило не найдено")

        # Валидация перехода
        try:
            validate_status_transition(
                rule.workflow_status, new_status, assignee_id, comment_text
            )
        except ValueError as e:
            return create_success_response(400, error=str(e))

        # Сохраняем старый статус для аудита
        old_status = rule.workflow_status

        # Обновляем основной статус
        rule.workflow_status = new_status
        rule.workflow_updated_at = datetime.utcnow()

        # Обновляем доп. поля в зависимости от статуса
        if new_status == "in_progress":
            rule.assignee_id = assignee_id
        elif new_status == "stopped":
            rule.stopped_reason = comment_text
        elif new_status == "deployed":
            rule.deployment_mr_url = deployment_mr_url
        elif new_status == "tested":
            rule.tested_by_id = current_user.id

        # Создаем автоматический комментарий об изменении статуса
        if comment_text:

            comment = Comments(
                id=str(uuid.uuid4()),
                entity_type="rule",
                entity_id=rule_id,
                user_id=current_user.id,
                text=f"**[Workflow]** {RULE_STATUS_WORKFLOW[old_status]['label']} → {RULE_STATUS_WORKFLOW[new_status]['label']}\n\n{comment_text}",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.session.add(comment)

        # Логируем аудит
        log_audit_event(
            entity_type="rule",
            entity_id=rule_id,
            action="workflow_status_changed",
            details={
                "old_status": old_status,
                "new_status": new_status,
                "assignee_id": assignee_id,
                "comment": comment_text[:100] if comment_text else None,
            },
            user_id=current_user.id,
        )

        db.session.commit()

        logger.info(
            f"[{current_user.username}] Изменён workflow статус правила {rule_id}: {old_status} → {new_status}"
        )

        return create_success_response(
            200,
            data={
                "workflow_status": rule.workflow_status,
                "assignee_id": rule.assignee_id,
                "message": f'Статус изменён на "{RULE_STATUS_WORKFLOW[new_status]["label"]}"',
            },
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Ошибка обновления workflow статуса: {str(e)}")
        return create_success_response(500, error="Ошибка обновления статуса")


@rules_bp.route("/<rule_id>/workflow-info", methods=["GET"])
@login_required
def get_workflow_info(rule_id):
    """
    📋 Получить информацию о workflow статусе правила
    """
    try:
        logger.info(f"📋 Getting workflow info for rule: {rule_id}")

        from models.database import CorrelationRules, Users

        # ✅ Не используем relationships - просто простой запрос
        rule = (
            db.session.query(CorrelationRules)
            .filter(CorrelationRules.id == rule_id)
            .first()
        )

        if not rule:
            logger.warning(f"❌ Rule not found: {rule_id}")
            return jsonify({"success": False, "error": "Правило не найдено"}), 404

        logger.debug(f"✅ Rule found: {rule.name}")

        # =====================================================================
        # Получение конфигурации статуса
        # =====================================================================

        workflow_status = getattr(rule, "workflow_status", "not_started")
        current_status_config = RULE_STATUS_WORKFLOW.get(workflow_status, {})
        next_statuses = current_status_config.get("next_statuses", [])

        logger.debug(f"   Current workflow status: {workflow_status}")

        # =====================================================================
        # Получение информации об исполнителе
        # =====================================================================

        assignee_data = None
        assignee_id = getattr(rule, "assignee_id", None)

        if assignee_id:
            try:
                assignee = (
                    db.session.query(Users).filter(Users.id == assignee_id).first()
                )

                if assignee:
                    assignee_data = {
                        "id": assignee.id,
                        "username": assignee.username,
                        "email": assignee.email,
                    }
                    logger.debug(f"   Assignee: {assignee.username}")

            except Exception as e:
                logger.warning(f"⚠️ Error loading assignee: {e}")

        # =====================================================================
        # Получение информации о тестировщике
        # =====================================================================

        tested_by_data = None
        tested_by_id = getattr(rule, "tested_by_id", None)

        if tested_by_id:
            try:
                tested_by = (
                    db.session.query(Users).filter(Users.id == tested_by_id).first()
                )

                if tested_by:
                    tested_by_data = {
                        "id": tested_by.id,
                        "username": tested_by.username,
                        "email": tested_by.email,
                    }
                    logger.debug(f"   Tested by: {tested_by.username}")

            except Exception as e:
                logger.warning(f"⚠️ Error loading tester: {e}")

        # =====================================================================
        # Подготовка ответа
        # =====================================================================

        response_data = {
            "workflow_status": workflow_status,
            "status_config": {
                "label": current_status_config.get("label", "Unknown"),
                "icon": current_status_config.get("icon", "fa-question"),
                "color": current_status_config.get("color", "gray"),
                "requires_comment": current_status_config.get(
                    "requires_comment", False
                ),
                "requires_assignee": current_status_config.get(
                    "requires_assignee", False
                ),
            },
            "available_next_statuses": next_statuses,
            "assignee": assignee_data,
            "stopped_reason": getattr(rule, "stopped_reason", None),
            "deployment_mr_url": getattr(rule, "deployment_mr_url", None),
            "tested_by": tested_by_data,
            "workflow_updated_at": (
                rule.workflow_updated_at.isoformat()
                if getattr(rule, "workflow_updated_at", None)
                else None
            ),
        }

        logger.info(f"✅ Workflow info retrieved successfully for rule: {rule_id}")

        return jsonify({"success": True, "data": response_data}), 200

    except Exception as e:
        logger.error(f"❌ Error getting workflow info: {type(e).__name__}: {str(e)}")

        return (
            jsonify(
                {
                    "success": False,
                    "error": f"Ошибка получения информации о workflow: {str(e)}",
                }
            ),
            500,
        )


@rules_bp.route("/<rule_id>/workflow-status", methods=["PUT"])
@login_required
def update_workflow_status(rule_id):
    """
    📝 Обновить workflow статус правила
    """
    try:
        from flask import current_user

        logger.info(f"📝 Updating workflow status for rule: {rule_id}")

        # Получаем данные из запроса
        data = request.get_json()
        new_status = data.get("workflow_status")

        if not new_status:
            return (
                jsonify({"success": False, "error": "workflow_status не указан"}),
                400,
            )

        # Получаем правило
        rule = CorrelationRules.query.filter_by(id=rule_id).first()
        if not rule:
            return jsonify({"success": False, "error": "Правило не найдено"}), 404

        # Обновляем статус
        rule.workflow_status = new_status
        rule.workflow_updated_at = datetime.utcnow()

        # Если указан исполнитель
        if "assignee_id" in data and data["assignee_id"]:
            rule.assignee_id = data["assignee_id"]

        # Если указана причина остановки
        if "stopped_reason" in data:
            rule.stopped_reason = data["stopped_reason"]

        # Если указан URL MR
        if "deployment_mr_url" in data:
            rule.deployment_mr_url = data["deployment_mr_url"]

        # Если указан комментарий
        if "comment_text" in data and data["comment_text"]:
            from models.database import Comments

            comment = Comments(
                entity_type="rule",
                entity_id=rule_id,
                author_id=current_user.id,
                text=data["comment_text"],
                comment_type="status_change",
            )
            db.session.add(comment)

        db.session.commit()
        logger.info(f"✅ Workflow status updated: {new_status}")

        return (
            jsonify(
                {
                    "success": True,
                    "data": rule.to_dict(),
                    "message": f"Статус изменён на {new_status}",
                }
            ),
            200,
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Error updating workflow status: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==========================================
# ЭКСПОРТ КОНФИГУРАЦИИ
# ==========================================

__all__ = ["rules_bp"]
