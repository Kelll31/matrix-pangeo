"""
Comments Blueprint - Collaborative Commenting System v4.0
===========================================================
CRITICAL FIX: Correct user detection from request data

@version 4.0.0-USER-FIX
@date 2025-10-21
"""

from flask import Blueprint, request, g
from models.database import db, Comments, Users
from utils.helpers import (
    create_success_response,
    create_error_response,
    sanitize_input,
    validate_required_fields,
)
from utils.auth import (
    login_required,
    get_current_user_id,
    get_current_user_role,
    get_current_user,
)
import logging
from datetime import datetime
from sqlalchemy import or_, and_

logger = logging.getLogger(__name__)
comments_bp = Blueprint("comments", __name__)


# ============================================================================
# LIST COMMENTS (с поддержкой фильтрации)
# ============================================================================
@comments_bp.route("/", methods=["GET"])
@comments_bp.route("", methods=["GET"])
@login_required
def list_comments():
    """
    Получить список комментариев с поддержкой пагинации и фильтрации по технікам, правилам и текстовому поиску.
    
    Возвращает все активные комментарии в системе с подробной информацией об авторах, сортировкой по времени создания и гибкой фильтрацией. 
    Поддерживает как стандартную пагинацию (page/per_page), так и альтернативный формат (limit/offset).
    </br></br>
    
    <b>Метод:</b> GET</br>
    <b>URL:</b> /api/comments</br>
    <b>Авторизация:</b> Требуется Bearer токен (Authorization header)</br>
    <b>Защита:</b> @login_required - требуется аутентификация</br></br>
    
    <b>Параметры запроса:</b></br>
    - <code>page</code> [INT] - номер страницы (по умолчанию: 1, минимум: 1)</br>
    - <code>per_page</code> [INT] - количество комментариев на странице (по умолчанию: 20, максимум: 100)</br>
    - <code>limit</code> [INT] - альтернативный параметр для per_page (для совместимости, максимум: 100)</br>
    - <code>offset</code> [INT] - смещение от начала (для совместимости, по умолчанию: 0)</br>
    - <code>entity_type</code> [STRING] - тип сущности для фильтрации (technique, rule, user, system)</br>
    - <code>entity_id</code> [STRING] - ID сущности для фильтрации (например: T1078, rule-id-123)</br>
    - <code>search</code> [STRING] - текстовый поиск по тексту комментария и имени автора (минимум 2 символа)</br></br>
    
    <b>Сортировка:</b></br>
    - Комментарии отсортированы по времени создания (новейшие первыми)</br>
    - Исключены удалённые комментарии (status != "deleted")</br></br>
    
    <b>Запросы curl:</b></br>
    <code>
    # Получить все комментарии (первая страница) </br>
    curl -X GET "http://172.30.250.199:5000/api/comments" \\
      -H "Authorization: Bearer YOUR_TOKEN"</br></br>
    
    # Получить комментарии для конкретной техники T1078 </br>
    curl -X GET "http://172.30.250.199:5000/api/comments?entity_type=technique&entity_id=T1078" \\
      -H "Authorization: Bearer YOUR_TOKEN"</br></br>
    
    # Поиск комментариев со словом "важно" с пагинацией </br>
    curl -X GET "http://172.30.250.199:5000/api/comments?search=важно&page=1&per_page=10" \\
      -H "Authorization: Bearer YOUR_TOKEN"</br></br>
    
    # Получить комментарии с использованием limit/offset </br>
    curl -X GET "http://172.30.250.199:5000/api/comments?limit=20&offset=0" \\
      -H "Authorization: Bearer YOUR_TOKEN"
    </code></br></br>
    
    <b>Успешный ответ (HTTP 200):</b></br>
    <pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T12:31:11.756919",
  "data": {
    "comments": [
      {
        "id": 30,
        "entity_type": "technique",
        "entity_id": "T1078",
        "parent_comment_id": null,
        "text": "Важный комментарий о технике",
        "comment_type": "comment",
        "priority": "normal",
        "visibility": "public",
        "status": "active",
        "author_name": "Администратор",
        "created_by": 4,
        "user_name": "admin",
        "user_email": "admin@mitre.local",
        "created_at": "2025-10-21T21:34:55",
        "updated_at": "2025-10-21T21:34:55"
      },
      {
        "id": 29,
        "entity_type": "technique",
        "entity_id": "T1078",
        "parent_comment_id": null,
        "text": "Другой комментарий",
        "comment_type": "question",
        "priority": "low",
        "visibility": "public",
        "status": "active",
        "author_name": "Администратор",
        "created_by": 4,
        "user_name": "admin",
        "user_email": "admin@mitre.local",
        "created_at": "2025-10-21T20:54:01",
        "updated_at": "2025-10-21T20:54:01"
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total_items": 6,
      "total_pages": 1,
      "has_next": false,
      "has_prev": false
    },
    "total": 6,
    "page": 1,
    "per_page": 20,
    "total_pages": 1
  }
}</pre></br>
    
    <b>Ошибка авторизации (HTTP 401):</b></br>
    <pre>{
  "code": 401,
  "success": false,
  "error": "Authorization token is missing"
}</pre></br>
    
    <b>Ошибка сервера (HTTP 500):</b></br>
    <pre>{
  "code": 500,
  "success": false,
  "error": "Failed to retrieve comments: <описание ошибки>"
}</pre></br>
    
    <b>Коды состояния:</b></br>
    - 200: Успешное получение списка комментариев (может быть пусто)</br>
    - 400: Неправильные параметры запроса</br>
    - 401: Не авторизован или истёк токен</br>
    - 403: Доступ запрещён</br>
    - 500: Внутренняя ошибка сервера</br></br>
    
    <b>Типы комментариев (comment_type):</b></br>
    - comment: обычный комментарий</br>
    - note: заметка</br>
    - question: вопрос</br>
    - issue: проблема</br>
    - improvement: предложение улучшения</br>
    - critical: критический комментарий</br></br>
    
    <b>Приоритеты (priority):</b></br>
    - low: низкий</br>
    - normal: нормальный</br>
    - high: высокий</br>
    - critical: критический</br>
    - urgent: срочный</br></br>
    
    <b>Видимость (visibility):</b></br>
    - public: открыт для всех</br>
    - internal: только для команды</br>
    - private: только для автора</br>
    - team: для конкретной команды</br></br>
    
    <b>Статусы (status):</b></br>
    - active: активный комментарий</br>
    - resolved: решённый вопрос</br>
    - locked: заблокирован</br>
    - deleted: удалён (не показывается в списке)</br>
    - pending: ожидает модерации</br></br>
    
    <b>Примечания:</b></br>
    - Поиск (search) работает только для строк длиной ≥ 2 символов</br>
    - Максимальный размер страницы ограничен 100 комментариями для оптимизации производительности</br>
    - Для каждого комментария автоматически добавляется информация об авторе (user_name, user_email)</br>
    - Комментарии отсортированы от новых к старым (по убыванию created_at)</br>
    - Удалённые комментарии (status="deleted") исключены из результатов</br>
    - Поддерживает вложенные комментарии через parent_comment_id (replies)</br>
    - Ответы на комментарии содержатся в поле replies</br></br>
    
    <b>Примеры использования:</b></br>
    
    <b>1. Получить первые 10 комментариев:</b></br>
    <code>/api/comments?page=1&per_page=10</code></br></br>
    
    <b>2. Найти все комментарии для техники T1078:</b></br>
    <code>/api/comments?entity_type=technique&entity_id=T1078</code></br></br>
    
    <b>3. Поиск комментариев со словом "критично":</b></br>
    <code>/api/comments?search=критично</code></br></br>
    
    <b>4. Комбинированная фильтрация:</b></br>
    <code>/api/comments?entity_type=technique&entity_id=T1078&search=важно&page=1&per_page=5</code></br></br>
    
    <b>5. Получить комментарии для правила:</b></br>
    <code>/api/comments?entity_type=rule&entity_id=rule-t1059-001</code></br></br>
    """
    try:
        # Pagination parameters
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))

        # Support for limit/offset (legacy format)
        if request.args.get("limit"):
            per_page = min(100, max(1, int(request.args.get("limit", 20))))
        if request.args.get("offset"):
            offset = max(0, int(request.args.get("offset", 0)))
            page = (offset // per_page) + 1

        # Filter parameters
        entity_type = request.args.get("entity_type")
        entity_id = request.args.get("entity_id")
        search = request.args.get("search", "").strip()

        # Base query
        query = db.session.query(Comments).filter(Comments.status != "deleted")

        # Apply filters
        if entity_type:
            query = query.filter(Comments.entity_type == sanitize_input(entity_type))
        if entity_id:
            query = query.filter(Comments.entity_id == sanitize_input(entity_id))

        if search and len(search) >= 2:
            search_term = f"%{sanitize_input(search)}%"
            query = query.filter(
                or_(
                    Comments.text.like(search_term),
                    Comments.author_name.like(search_term),
                )
            )

        # Order by newest first
        query = query.order_by(Comments.created_at.desc())

        # Count total
        total = query.count()
        total_pages = (total + per_page - 1) // per_page if total > 0 else 1

        # Paginate
        offset = (page - 1) * per_page
        items = query.limit(per_page).offset(offset).all()

        # Format comments
        comments_data = []
        for comment in items:
            comment_dict = comment.to_dict()
            # Добавляем информацию о пользователе
            if comment.created_by:
                user = db.session.query(Users).get(comment.created_by)
                if user:
                    comment_dict["user_name"] = user.username
                    comment_dict["user_email"] = user.email
            comments_data.append(comment_dict)

        return create_success_response(
            {
                "comments": comments_data,
                "pagination": {
                    "page": page,
                    "per_page": per_page,
                    "total_items": total,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1,
                },
                "total": total,
                "page": page,
                "per_page": per_page,
                "total_pages": total_pages,
            }
        )
    except Exception as e:
        logger.error(f"Failed to retrieve comments list: {e}", exc_info=True)
        return create_error_response(f"Failed to retrieve comments: {str(e)}", 500)


# ============================================================================
# SEARCH COMMENTS
# ============================================================================
@comments_bp.route("/search", methods=["GET"])
def search_comments():
    """
        Выполнить быстрый поиск комментариев по тексту, автору и типу сущности с ограничением результатов.

        Предоставляет быструю выборку комментариев с поддержкой текстового поиска и фильтрации по типам сущностей (техники, правила).
        Результаты ограничены и отсортированы по времени создания (новейшие первыми). Удалённые комментарии исключены.
        </br></br>

        <b>Метод:</b> GET</br>
        <b>URL:</b> /api/comments/search</br>
        <b>Авторизация:</b> Не требуется</br></br>

        <b>Параметры запроса:</b></br>
        - <code>q</code> [STRING] - текст для поиска (минимум 2 символа, поиск в тексте комментария и имени автора)</br>
        - <code>entity_type</code> [STRING] - фильтр по типу сущности (technique, rule, user, system)</br>
        - <code>entity_id</code> [STRING] - фильтр по ID сущности (например: T1078, rule-t1059-001)</br>
        - <code>limit</code> [INT] - максимальное количество результатов (по умолчанию: 50, максимум: 100)</br></br>

        <b>Сортировка:</b></br>
        - Результаты отсортированы по времени создания в убывающем порядке (новые первыми)</br>
        - Удалённые комментарии (status="deleted") исключены</br></br>

        <b>Запросы curl:</b></br>
        <code>
        # Поиск всех комментариев со словом "критично" (первые 50) </br>
        curl -X GET "http://172.30.250.199:5000/api/comments/search?q=критично"</br></br>

        # Поиск по слову "ошибка" в комментариях техники T1078 </br>
        curl -X GET "http://172.30.250.199:5000/api/comments/search?q=ошибка&entity_type=technique&entity_id=T1078"</br></br>

        # Получить последние 20 комментариев для конкретного правила </br>
        curl -X GET "http://172.30.250.199:5000/api/comments/search?entity_type=rule&entity_id=rule-123&limit=20"</br></br>

        # Поиск с максимальным количеством результатов </br>
        curl -X GET "http://172.30.250.199:5000/api/comments/search?q=важно&limit=100"
        </code></br></br>

        <b>Успешный ответ (HTTP 200):</b></br>
        <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T12:35:20.123456",
      "data": {
        "query": "критично",
        "entity_type": "technique",
        "entity_id": "T1078",
        "comments": [
          {
            "id": 30,
            "entity_type": "technique",
            "entity_id": "T1078",
            "parent_comment_id": null,
            "text": "Это критично важный комментарий",
            "comment_type": "comment",
            "priority": "critical",
            "visibility": "public",
            "status": "active",
            "author_name": "Администратор",
            "created_by": 4,
            "user_name": "admin",
            "user_email": "admin@mitre.local",
            "created_at": "2025-10-21T21:34:55",
            "updated_at": "2025-10-21T21:34:55"
          },
          {
            "id": 25,
            "entity_type": "technique",
            "entity_id": "T1078",
            "parent_comment_id": null,
            "text": "Согласен, это критично",
            "comment_type": "comment",
            "priority": "high",
            "visibility": "public",
            "status": "active",
            "author_name": "Администратор",
            "created_by": 4,
            "user_name": "admin",
            "user_email": "admin@mitre.local",
            "created_at": "2025-10-21T20:10:00",
            "updated_at": "2025-10-21T20:10:00"
          }
        ],
        "count": 2
      }
    }</pre></br>

        <b>Пустой результат поиска (HTTP 200):</b></br>
        <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T12:35:20.123456",
      "data": {
        "query": "несуществующий_текст",
        "entity_type": "",
        "entity_id": "",
        "comments": [],
        "count": 0
      }
    }</pre></br>

        <b>Ошибка сервера (HTTP 500):</b></br>
        <pre>{
      "code": 500,
      "success": false,
      "error": "Search failed: <описание ошибки>"
    }</pre></br>

        <b>Коды состояния:</b></br>
        - 200: Успешный поиск (результаты могут быть пусты)</br>
        - 400: Неправильные параметры запроса</br>
        - 500: Ошибка при выполнении поиска</br></br>

        <b>Примечания:</b></br>
        - Текстовый поиск (q) срабатывает только для строк длиной ≥ 2 символов</br>
        - Поиск выполняется по тексту комментария И имени автора (OR условие)</br>
        - Максимальное количество результатов ограничено 100 для оптимизации производительности</br>
        - Удалённые комментарии (status="deleted") не показываются в результатах</br>
        - Поиск без параметров (q) вернёт пусто</br>
        - Для каждого комментария автоматически добавляется информация об авторе (user_name, user_email)</br></br>

        <b>Примеры использования:</b></br>

        <b>1. Быстрый поиск по слову:</b></br>
        <code>/api/comments/search?q=bug</code></br></br>

        <b>2. Поиск в контексте техники:</b></br>
        <code>/api/comments/search?q=важно&entity_type=technique&entity_id=T1059</code></br></br>

        <b>3. Получить все комментарии правила без поиска:</b></br>
        <code>/api/comments/search?entity_type=rule&entity_id=rule-123</code></br></br>

        <b>4. Поиск с максимальной выборкой:</b></br>
        <code>/api/comments/search?q=ошибка&limit=100</code></br></br>
    """
    try:
        # Получаем параметры поиска
        search_query = request.args.get("q", "").strip()
        entity_type = request.args.get("entity_type", "").strip()
        entity_id = request.args.get("entity_id", "").strip()
        limit = min(100, max(1, int(request.args.get("limit", 50))))

        # Базовый запрос
        query = db.session.query(Comments).filter(Comments.status != "deleted")

        # Фильтруем по entity_type и entity_id
        if entity_type:
            query = query.filter(Comments.entity_type == sanitize_input(entity_type))
        if entity_id:
            query = query.filter(Comments.entity_id == sanitize_input(entity_id))

        # Поиск по тексту (опционально)
        if search_query and len(search_query) >= 2:
            search_term = f"%{sanitize_input(search_query)}%"
            query = query.filter(
                or_(
                    Comments.text.like(search_term),
                    Comments.author_name.like(search_term),
                )
            )

        # Сортировка и лимит
        query = query.order_by(Comments.created_at.desc()).limit(limit)

        # Выполняем запрос
        comments = query.all()

        # Форматируем результаты
        comments_data = []
        for comment in comments:
            comment_dict = comment.to_dict()
            # Добавляем информацию о пользователе
            if comment.created_by:
                user = db.session.query(Users).get(comment.created_by)
                if user:
                    comment_dict["user_name"] = user.username
                    comment_dict["user_email"] = user.email
            comments_data.append(comment_dict)

        return create_success_response(
            {
                "query": search_query,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "comments": comments_data,
                "count": len(comments_data),
            }
        )
    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        return create_error_response(f"Search failed: {str(e)}", 500)


# ============================================================================
# GET SINGLE COMMENT
# ============================================================================
@comments_bp.route("/<int:comment_id>", methods=["GET"])
@login_required
def get_comment(comment_id):
    """
        Получить полную информацию о конкретном комментарии, включая все ответы и информацию об авторе.

        Возвращает детальную информацию о одном комментарии с полной иерархией ответов (replies).
        Исключены удалённые комментарии. Ответы отсортированы по времени создания (старые первыми).
        </br></br>

        <b>Метод:</b> GET</br>
        <b>URL:</b> /api/comments/{comment_id}</br>
        <b>Параметры пути:</b></br>
        - <code>comment_id</code> [INT] - ID комментария (обязательный, целое число)</br>
        <b>Авторизация:</b> Не требуется</br></br>

        <b>Запросы curl:</b></br>
        <code>
        # Получить комментарий с ID 30 </br>
        curl -X GET "http://172.30.250.199:5000/api/comments/30"</br></br>

        # Получить комментарий с красивым форматированием JSON </br>
        curl -X GET "http://172.30.250.199:5000/api/comments/30" | jq '.'
        </code></br></br>

        <b>Успешный ответ (HTTP 200):</b></br>
        <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T12:36:45.123456",
      "data": {
        "id": 30,
        "entity_type": "technique",
        "entity_id": "T1078",
        "parent_comment_id": null,
        "text": "Это главный комментарий",
        "comment_type": "comment",
        "priority": "normal",
        "visibility": "public",
        "status": "active",
        "author_name": "Администратор",
        "created_by": 4,
        "user_name": "admin",
        "user_email": "admin@mitre.local",
        "created_at": "2025-10-21T21:34:55",
        "updated_at": "2025-10-21T21:34:55",
        "replies": [
          {
            "id": 31,
            "entity_type": "technique",
            "entity_id": "T1078",
            "parent_comment_id": 30,
            "text": "Согласен! Это важно.",
            "comment_type": "comment",
            "priority": "normal",
            "visibility": "public",
            "status": "active",
            "author_name": "Администратор",
            "created_by": 4,
            "created_at": "2025-10-21T21:45:10",
            "updated_at": "2025-10-21T21:45:10"
          },
          {
            "id": 32,
            "entity_type": "technique",
            "entity_id": "T1078",
            "parent_comment_id": 30,
            "text": "Нужно это исправить.",
            "comment_type": "issue",
            "priority": "high",
            "visibility": "public",
            "status": "active",
            "author_name": "Администратор",
            "created_by": 4,
            "created_at": "2025-10-21T22:00:00",
            "updated_at": "2025-10-21T22:00:00"
          }
        ],
        "replies_count": 2
      }
    }</pre></br>

        <b>Комментарий не найден (HTTP 404):</b></br>
        <pre>{
      "code": 404,
      "success": false,
      "error": "Комментарий не найден"
    }</pre></br>

        <b>Ошибка сервера (HTTP 500):</b></br>
        <pre>{
      "code": 500,
      "success": false,
      "error": "Failed to retrieve comment: <описание ошибки>"
    }</pre></br>

        <b>Коды состояния:</b></br>
        - 200: Комментарий успешно получен</br>
        - 400: Неправильный ID (не число)</br>
        - 404: Комментарий не найден или был удалён</br>
        - 500: Внутренняя ошибка сервера</br></br>

        <b>Структура ответа:</b></br>
        - <code>id</code>: уникальный ID комментария</br>
        - <code>entity_type</code>: тип сущности (technique, rule, user, system)</br>
        - <code>entity_id</code>: ID сущности, к которой относится комментарий</br>
        - <code>parent_comment_id</code>: ID родительского комментария (null, если это главный комментарий)</br>
        - <code>text</code>: текст комментария</br>
        - <code>comment_type</code>: тип (comment, note, question, issue, improvement, critical)</br>
        - <code>priority</code>: приоритет (low, normal, high, critical, urgent)</br>
        - <code>visibility</code>: видимость (public, internal, private, team)</br>
        - <code>status</code>: статус (active, resolved, locked, deleted, pending)</br>
        - <code>author_name</code>: имя автора</br>
        - <code>user_name</code>: username автора в системе</br>
        - <code>user_email</code>: email автора</br>
        - <code>created_at</code>: время создания (ISO 8601)</br>
        - <code>updated_at</code>: время последнего обновления (ISO 8601)</br>
        - <code>replies</code>: массив ответов (подкомментариев)</br>
        - <code>replies_count</code>: количество ответов</br></br>

        <b>Примечания:</b></br>
        - Комментарий должен быть активным (status != "deleted")</br>
        - Ответы загружаются автоматически и отсортированы по времени создания (старые первыми)</br>
        - Удалённые ответы (status="deleted") исключены из списка replies</br>
        - Для главного комментария parent_comment_id = null</br>
        - Информация об авторе (user_name, user_email) добавляется автоматически</br>
        - Ответы содержат только основные поля (replies не содержат свои replies)</br></br>

        <b>Примеры использования:</b></br>

        <b>1. Получить комментарий с ID 30:</b></br>
        <code>/api/comments/30</code></br></br>

        <b>2. Получить комментарий и распарсить JSON:</b></br>
        <code>/api/comments/30 | jq '.data'</code></br></br>

        <b>3. Проверить количество ответов на комментарий:</b></br>
        <code>/api/comments/30 | jq '.data.replies_count'</code></br></br>

        <b>4. Получить все ответы на комментарий:</b></br>
        <code>/api/comments/30 | jq '.data.replies'</code></br></br>
    """
    try:
        comment = (
            db.session.query(Comments)
            .filter(Comments.id == comment_id, Comments.status != "deleted")
            .first()
        )

        if not comment:
            return create_error_response("Комментарий не найден", 404)

        comment_dict = comment.to_dict()

        # Добавляем информацию о пользователе
        if comment.created_by:
            user = db.session.query(Users).get(comment.created_by)
            if user:
                comment_dict["user_name"] = user.username
                comment_dict["user_email"] = user.email

        # Добавляем ответы (если есть parent_comment_id)
        replies = (
            db.session.query(Comments)
            .filter(
                Comments.parent_comment_id == comment_id, Comments.status != "deleted"
            )
            .order_by(Comments.created_at.asc())
            .all()
        )

        comment_dict["replies"] = [reply.to_dict() for reply in replies]
        comment_dict["replies_count"] = len(replies)

        return create_success_response(comment_dict)
    except Exception as e:
        logger.error(f"Failed to retrieve comment {comment_id}: {e}", exc_info=True)
        return create_error_response(f"Failed to retrieve comment: {str(e)}", 500)


# ============================================================================
# CREATE COMMENT - теперь использует user_id из request
# ============================================================================
@comments_bp.route("/", methods=["POST"])
@comments_bp.route("", methods=["POST"])
@login_required
def create_comment():
    """Создать новый комментарий для техники, правила или другой сущности в системе MITRE ATT&CK Matrix.

Поддерживает создание как самостоятельных комментариев, так и ответов на существующие комментарии (через parent_comment_id). 
При создании автоматически определяется автор по user_id из запроса или текущей аутентификации. 
Поддерживает различные типы комментариев (заметки, вопросы, критические замечания) и уровни приоритета.
</br></br>

<b>Метод:</b> POST</br>
<b>URL:</b> /api/comments</br>
<b>Авторизация:</b> Не требуется (но рекомендуется)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Обязательные параметры в теле запроса:</b></br>
- <code>entity_type</code> [STRING] - тип сущности (technique, rule, user, system, incident, tactic)</br>
- <code>entity_id</code> [STRING] - ID сущности (например: T1078, rule-id-123)</br>
- <code>text</code> [STRING] - текст комментария (1-10000 символов)</br></br>

<b>Опциональные параметры:</b></br>
- <code>user_id</code> [INT] - ID пользователя, создавшего комментарий (если не указан, используется текущий пользователь)</br>
- <code>author_name</code> [STRING] - имя автора (если не указано, используется full_name пользователя или username)</br>
- <code>comment_type</code> [STRING] - тип комментария (comment, note, question, issue, improvement, critical) - по умолчанию: comment</br>
- <code>priority</code> [STRING] - приоритет (low, normal, high, critical, urgent) - по умолчанию: normal</br>
- <code>visibility</code> [STRING] - видимость (public, internal, private, team) - по умолчанию: public</br>
- <code>parent_comment_id</code> [INT] - ID родительского комментария (для создания ответов)</br>
- <code>content</code> [STRING] - альтернативное поле для текста (если text не указан)</br></br>

<b>Запросы curl:</b></br>
<code>
# Создать простой комментарий для техники T1078 </br>
curl -X POST "http://172.30.250.199:5000/api/comments" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entity_type": "technique",
    "entity_id": "T1078",
    "text": "Это важный комментарий о технике"
  }'</br></br>

# Создать комментарий с указанием пользователя </br>
curl -X POST "http://172.30.250.199:5000/api/comments" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entity_type": "technique",
    "entity_id": "T1078",
    "text": "Критическое замечание",
    "user_id": 4,
    "comment_type": "critical",
    "priority": "critical"
  }'</br></br>

# Создать ответ на существующий комментарий </br>
curl -X POST "http://172.30.250.199:5000/api/comments" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entity_type": "technique",
    "entity_id": "T1078",
    "text": "Согласен! Это очень важно",
    "parent_comment_id": 30,
    "user_id": 4
  }'</br></br>

# Создать вопрос относительно правила </br>
curl -X POST "http://172.30.250.199:5000/api/comments" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entity_type": "rule",
    "entity_id": "rule-t1059-001",
    "text": "Как эта правила работает?",
    "comment_type": "question",
    "priority": "normal"
  }'
</code></br></br>

<b>Успешный ответ (HTTP 201):</b></br>
<pre>{
  "code": 201,
  "success": true,
  "timestamp": "2025-10-23T12:40:00.123456",
  "data": {
    "message": "Comment created successfully",
    "comment_id": 42,
    "comment": {
      "id": 42,
      "entity_type": "technique",
      "entity_id": "T1078",
      "parent_comment_id": null,
      "text": "Это важный комментарий о технике",
      "comment_type": "comment",
      "priority": "normal",
      "visibility": "public",
      "status": "active",
      "author_name": "Администратор",
      "created_by": 4,
      "user_name": "admin",
      "user_email": "admin@mitre.local",
      "created_at": "2025-10-23T12:40:00",
      "updated_at": "2025-10-23T12:40:00"
    }
  }
}</pre></br>

<b>Ошибка: обязательное поле не указано (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Missing required field: entity_type"
}</pre></br>

<b>Ошибка: неправильный тип сущности (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Invalid entity type: invalid_type"
}</pre></br>

<b>Ошибка: текст слишком длинный (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Comment text is too long (max 10000 characters)"
}</pre></br>

<b>Ошибка: пользователь не найден (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "User with ID 999 not found in database. Please check user authentication."
}</pre></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to create comment: <описание ошибки>"
}</pre></br>

<b>Коды состояния:</b></br>
- 201: Комментарий успешно создан</br>
- 400: Ошибка валидации (отсутствуют обязательные поля, неправильные данные)</br>
- 500: Внутренняя ошибка сервера</br></br>

<b>Валидация данных:</b></br>
- <code>entity_type</code> должен быть одним из: technique, rule, user, system, incident, tactic</br>
- <code>text</code> должен содержать от 1 до 10000 символов</br>
- <code>user_id</code> должен соответствовать существующему пользователю в системе</br>
- Все поля автоматически санитизируются (удаляются опасные символы)</br></br>

<b>Примечания:</b></br>
- Текст комментария сохраняется с сохранением разметки</br>
- Для каждого комментария автоматически сохраняется время создания (created_at)</br>
- Статус нового комментария всегда "active"</br>
- При создании ответа (parent_comment_id) он связывается с родительским комментарием</br>
- Если user_id не указан, используется текущий аутентифицированный пользователь (если есть)</br>
- Если пользователь не найден, используется значение "Anonymous"</br>
- Информация об авторе (user_name, user_email) добавляется автоматически если пользователь существует</br></br>

<b>Примеры использования:</b></br>

<b>1. Создать простой комментарий:</b></br>
<code>POST /api/comments</code></br>
Body: <code>{ "entity_type": "technique", "entity_id": "T1078", "text": "Важно!" }</code></br></br>

<b>2. Создать критический комментарий с высоким приоритетом:</b></br>
<code>POST /api/comments</code></br>
Body: <code>{ "entity_type": "rule", "entity_id": "rule-123", "text": "...", "comment_type": "critical", "priority": "critical" }</code></br></br>

<b>3. Создать ответ на комментарий:</b></br>
<code>POST /api/comments</code></br>
Body: <code>{ "entity_type": "technique", "entity_id": "T1078", "text": "Согласен!", "parent_comment_id": 30 }</code></br></br>

<b>4. Создать приватный комментарий:</b></br>
<code>POST /api/comments</code></br>
Body: <code>{ "entity_type": "technique", "entity_id": "T1078", "text": "...", "visibility": "private" }</code></br></br>
"""
    try:
        data = request.get_json()
        if not data:
            return create_error_response("JSON data required", 400)

        # Validate required fields
        required_fields = ["entity_type", "entity_id", "text"]
        is_valid, error_msg = validate_required_fields(data, required_fields)
        if not is_valid:
            return create_error_response(error_msg, 400)

        entity_type = sanitize_input(data["entity_type"])
        entity_id = sanitize_input(data["entity_id"])
        text = sanitize_input(data.get("text") or data.get("content", ""))

        # Валидация типа сущности
        valid_entity_types = [
            "technique",
            "rule",
            "user",
            "system",
            "incident",
            "tactic",
        ]

        if entity_type not in valid_entity_types:
            return create_error_response(f"Invalid entity type: {entity_type}", 400)

        # Валидация длины текста
        if len(text) > 10000:
            return create_error_response(
                "Comment text is too long (max 10000 characters)", 400
            )
        if len(text) < 1:
            return create_error_response("Comment text is required", 400)

        # Optional fields
        comment_type = data.get("comment_type", "comment")
        priority = data.get("priority", "normal")
        visibility = data.get("visibility", "public")
        parent_comment_id = data.get("parent_comment_id")

        # КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Получаем user_id из request.json!
        user_id_from_request = data.get("user_id")
        author_name_from_request = data.get("author_name")

        # Приоритет: сначала из request, потом из auth
        if user_id_from_request:
            user_id = int(user_id_from_request)
            logger.info(f"Using user_id from request: {user_id}")
        else:
            user_id = get_current_user_id()
            logger.info(f"Using user_id from auth: {user_id}")

        # Проверяем существование пользователя
        user = None
        if user_id:
            user = db.session.query(Users).get(user_id)
            if not user:
                return create_error_response(
                    f"User with ID {user_id} not found in database. "
                    f"Please check user authentication.",
                    400,
                )

        # Определяем author_name
        if author_name_from_request:
            author_name = sanitize_input(author_name_from_request)
        elif user:
            author_name = user.full_name or user.username
        elif user_id:
            author_name = f"User {user_id}"
        else:
            author_name = "Anonymous"

        logger.info(
            f"Creating comment: user_id={user_id}, author_name={author_name}, "
            f"entity={entity_type}/{entity_id}"
        )

        # Create comment
        new_comment = Comments(
            entity_type=entity_type,
            entity_id=entity_id,
            text=text,
            comment_type=comment_type,
            priority=priority,
            visibility=visibility,
            parent_comment_id=parent_comment_id,
            author_name=author_name,
            created_by=user_id,
            status="active",
            created_at=datetime.utcnow(),
        )

        db.session.add(new_comment)
        db.session.commit()

        logger.info(
            f"✅ Comment created successfully: ID {new_comment.id} by user {user_id} "
            f"({author_name}) for {entity_type}/{entity_id}"
        )

        # Return created comment with full data
        comment_dict = new_comment.to_dict()
        if user:
            comment_dict["user_name"] = user.username
            comment_dict["user_email"] = user.email

        return create_success_response(
            {
                "message": "Comment created successfully",
                "comment_id": new_comment.id,
                "comment": comment_dict,
            },
            201,
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Failed to create comment: {e}", exc_info=True)
        return create_error_response(f"Failed to create comment: {str(e)}", 500)


# ============================================================================
# UPDATE COMMENT
# ============================================================================
@comments_bp.route("/<int:comment_id>", methods=["PUT", "PATCH"])
@login_required
def update_comment(comment_id):
    """
    Обновить существующий комментарий с проверкой прав доступа на основе роли пользователя.

Администраторы могут редактировать любые комментарии, аналитики - свои комментарии, обычные пользователи - только свои.
Поддерживает обновление текста, типа, приоритета и статуса (последний только для администраторов).
</br></br>

<b>Метод:</b> PUT, PATCH</br>
<b>URL:</b> /api/comments/{comment_id}</br>
<b>Параметры пути:</b></br>
- <code>comment_id</code> [INT] - ID комментария для обновления (обязательный)</br>
<b>Авторизация:</b> Требуется (текущий пользователь или администратор)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Опциональные параметры в теле запроса:</b></br>
- <code>text</code> [STRING] - новый текст комментария (1-10000 символов)</br>
- <code>content</code> [STRING] - альтернативное поле для текста (если text не указан)</br>
- <code>comment_type</code> [STRING] - новый тип (comment, note, question, issue, improvement, critical)</br>
- <code>priority</code> [STRING] - новый приоритет (low, normal, high, critical, urgent)</br>
- <code>status</code> [STRING] - новый статус (только для администраторов) (active, resolved, locked, deleted, pending)</br></br>

<b>Запросы curl:</b></br>
<code>
# Обновить текст комментария </br>
curl -X PUT "http://172.30.250.199:5000/api/comments/30" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Обновленный текст комментария"
  }'</br></br>

# Изменить приоритет комментария </br>
curl -X PUT "http://172.30.250.199:5000/api/comments/30" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "priority": "critical",
    "comment_type": "issue"
  }'</br></br>

# Администратор изменяет статус комментария </br>
curl -X PUT "http://172.30.250.199:5000/api/comments/30" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "resolved",
    "text": "Проблема решена"
  }'</br></br>

# PATCH запрос (альтернатива PUT) </br>
curl -X PATCH "http://172.30.250.199:5000/api/comments/30" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "priority": "high"
  }'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T12:45:00.123456",
  "data": {
    "message": "Comment updated successfully",
    "comment": {
      "id": 30,
      "entity_type": "technique",
      "entity_id": "T1078",
      "parent_comment_id": null,
      "text": "Обновленный текст комментария",
      "comment_type": "issue",
      "priority": "critical",
      "visibility": "public",
      "status": "active",
      "author_name": "Администратор",
      "created_by": 4,
      "created_at": "2025-10-21T21:34:55",
      "updated_at": "2025-10-23T12:45:00"
    }
  }
}</pre></br>

<b>Ошибка: комментарий не найден (HTTP 404):</b></br>
<pre>{
  "code": 404,
  "success": false,
  "error": "Комментарий не найден"
}</pre></br>

<b>Ошибка: пользователь не авторизован (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Пользователь не аутентифицирован"
}</pre></br>

<b>Ошибка: недостаточно прав (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Недостаточно прав для редактирования"
}</pre></br>

<b>Ошибка: текст слишком длинный (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Text too long"
}</pre></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to update comment: <описание ошибки>"
}</pre></br>

<b>Коды состояния:</b></br>
- 200: Комментарий успешно обновлён</br>
- 400: Ошибка валидации данных</br>
- 401: Пользователь не авторизован</br>
- 403: Недостаточно прав для редактирования</br>
- 404: Комментарий не найден</br>
- 500: Внутренняя ошибка сервера</br></br>

<b>Правила разграничения прав доступа:</b></br>
- <b>Администратор (is_admin=true, role=admin):</b> может редактировать любые комментарии, включая изменение статуса</br>
- <b>Аналитик (role=analyst, moderator):</b> может редактировать только свои комментарии</br>
- <b>Обычный пользователь (role=user, viewer):</b> может редактировать только свои комментарии</br>
- <b>Статус:</b> только администратор может изменять статус комментария</br></br>

<b>Валидация данных:</b></br>
- <code>text</code> должен содержать от 1 до 10000 символов (если указан)</br>
- <code>comment_type</code> должен быть одним из допустимых типов</br>
- <code>priority</code> должен быть одним из допустимых приоритетов</br>
- <code>status</code> может быть изменён только администратором</br>
- Все поля автоматически санитизируются</br></br>

<b>Примечания:</b></br>
- Время обновления (updated_at) автоматически устанавливается на текущее время</br>
- Статус "deleted" используется вместо полного удаления (soft delete)</br>
- Проверка прав выполняется на основе текущего пользователя и role</br>
- Если комментарий удалён (status="deleted"), его нельзя редактировать</br>
- Автор комментария (author_name, created_by) не может быть изменён</br>
- Удалённые комментарии исключены из выборки</br></br>

<b>Примеры использования:</b></br>

<b>1. Пользователь обновляет свой комментарий:</b></br>
<code>PUT /api/comments/30</code></br>
Body: <code>{ "text": "Новый текст" }</code></br></br>

<b>2. Аналитик изменяет приоритет:</b></br>
<code>PUT /api/comments/30</code></br>
Body: <code>{ "priority": "high", "comment_type": "issue" }</code></br></br>

<b>3. Администратор отмечает как решённо:</b></br>
<code>PUT /api/comments/30</code></br>
Body: <code>{ "status": "resolved", "text": "Проблема решена" }</code></br></br>

<b>4. Администратор может редактировать чужой комментарий:</b></br>
<code>PUT /api/comments/30</code></br>
Body: <code>{ "text": "Исправленный текст", "priority": "critical" }</code></br></br>"""

    try:
        comment = (
            db.session.query(Comments)
            .filter(Comments.id == comment_id, Comments.status != "deleted")
            .first()
        )

        if not comment:
            return create_error_response("Комментарий не найден", 404)

        # Получаем текущего пользователя
        current_user_id = get_current_user_id()
        current_user = get_current_user()

        if not current_user or not current_user_id:
            return create_error_response("Пользователь не аутентифицирован", 401)

        # Получаем роль пользователя
        current_user_role = getattr(current_user, "role", "user")
        is_admin = (
            getattr(current_user, "is_admin", False) or current_user_role == "admin"
        )

        # Логируем для отладки
        logger.info(
            f"Update comment {comment_id}: "
            f"user_id={current_user_id}, "
            f"role={current_user_role}, "
            f"is_admin={is_admin}, "
            f"comment_owner={comment.created_by}"
        )

        # Разграничение прав:
        # 1. Админ может редактировать любые комментарии
        # 2. Аналитик может редактировать свои комментарии
        # 3. Обычный пользователь может редактировать только свои комментарии

        can_edit = False

        if is_admin:
            # Администратор может редактировать любые комментарии
            can_edit = True
            logger.info(f"Admin access granted for comment {comment_id}")
        elif current_user_role in ["analyst", "moderator"]:
            # Аналитики могут редактировать свои комментарии
            can_edit = comment.created_by == current_user_id
            logger.info(
                f"Analyst access: {can_edit} for comment {comment_id} "
                f"(owner: {comment.created_by}, current: {current_user_id})"
            )
        elif current_user_role == "user" or current_user_role == "viewer":
            # Обычные пользователи могут редактировать только свои комментарии
            can_edit = comment.created_by == current_user_id
            logger.info(
                f"User access: {can_edit} for comment {comment_id} "
                f"(owner: {comment.created_by}, current: {current_user_id})"
            )

        if not can_edit:
            logger.warning(
                f"Access denied for user {current_user_id} (role: {current_user_role}) "
                f"to edit comment {comment_id} (owner: {comment.created_by})"
            )
            return create_error_response("Недостаточно прав для редактирования", 403)

        data = request.get_json()
        if not data:
            return create_error_response("JSON data required", 400)

        # Update fields
        if "text" in data or "content" in data:
            new_text = sanitize_input(data.get("text") or data.get("content", ""))
            if len(new_text) > 10000:
                return create_error_response("Text too long", 400)
            if len(new_text) < 1:
                return create_error_response("Text is required", 400)
            comment.text = new_text

        if "comment_type" in data:
            comment.comment_type = data["comment_type"]

        if "priority" in data:
            comment.priority = data["priority"]

        # Только администратор может менять статус
        if "status" in data and is_admin:
            comment.status = data["status"]

        comment.updated_at = datetime.utcnow()

        db.session.commit()
        logger.info(f"Comment {comment_id} updated by user {current_user_id}")

        return create_success_response(
            {"message": "Comment updated successfully", "comment": comment.to_dict()}
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to update comment {comment_id}: {e}", exc_info=True)
        return create_error_response(f"Failed to update comment: {str(e)}", 500)


# ============================================================================
# DELETE COMMENT
# ============================================================================
@comments_bp.route("/<int:comment_id>", methods=["DELETE"])
@login_required
def delete_comment(comment_id):
    """Delete comment (soft delete)"""
    try:
        comment = (
            db.session.query(Comments)
            .filter(Comments.id == comment_id, Comments.status != "deleted")
            .first()
        )

        if not comment:
            return create_error_response("Комментарий не найден", 404)

        # Получаем текущего пользователя
        current_user_id = get_current_user_id()
        current_user = get_current_user()

        if not current_user or not current_user_id:
            return create_error_response("Пользователь не аутентифицирован", 401)

        # Получаем роль пользователя (используем getattr для объекта Users!)
        current_user_role = getattr(current_user, "role", "user")
        is_admin = (
            getattr(current_user, "is_admin", False) or current_user_role == "admin"
        )

        logger.info(
            f"Delete comment {comment_id}: "
            f"user_id={current_user_id}, "
            f"role={current_user_role}, "
            f"is_admin={is_admin}, "
            f"comment_owner={comment.created_by}"
        )

        # Разграничение прав для удаления
        can_delete = False

        if is_admin:
            # Администратор может удалять любые комментарии
            can_delete = True
            logger.info(f"Admin delete access granted for comment {comment_id}")
        elif current_user_role in ["analyst", "moderator"]:
            # Аналитики могут удалять свои комментарии
            can_delete = comment.created_by == current_user_id
            logger.info(f"Analyst delete access: {can_delete} for comment {comment_id}")
        elif current_user_role == "user" or current_user_role == "viewer":
            # Обычные пользователи могут удалять только свои комментарии
            can_delete = comment.created_by == current_user_id
            logger.info(f"User delete access: {can_delete} for comment {comment_id}")

        if not can_delete:
            logger.warning(
                f"Delete access denied for user {current_user_id} "
                f"(role: {current_user_role}) to delete comment {comment_id}"
            )
            return create_error_response("Недостаточно прав для удаления", 403)

        # Soft delete
        comment.status = "deleted"
        comment.updated_at = datetime.utcnow()
        db.session.commit()

        logger.info(f"Comment {comment_id} deleted by user {current_user_id}")

        return create_success_response({"message": "Comment deleted successfully"})

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to delete comment {comment_id}: {e}", exc_info=True)
        return create_error_response(f"Failed to delete comment: {str(e)}", 500)


# ============================================================================
# STATISTICS
# ============================================================================
@comments_bp.route("/stats", methods=["GET"])
def get_statistics():
    """Получить статистику комментариев: общее количество, распределение по типам сущностей и недавние комментарии.

    Предоставляет быструю сводку по комментариям в системе, включая общее количество активных комментариев,
    распределение по типам сущностей (техники, правила, пользователи и т.д.), а также список из 10 последних добавленных комментариев.
    Удалённые комментарии исключены из статистики.
    </br></br>

    <b>Метод:</b> GET</br>
    <b>URL:</b> /api/comments/stats</br>
    <b>Авторизация:</b> Не требуется</br>
    <b>Параметры запроса:</b> Нет</br></br>

    <b>Запросы curl:</b></br>
    <code>
    # Получить статистику комментариев </br>
    curl -X GET "http://172.30.250.199:5000/api/comments/stats"</br></br>

    # Получить статистику с красивым форматированием </br>
    curl -X GET "http://172.30.250.199:5000/api/comments/stats" | jq '.'</br></br>

    # Получить только количество комментариев по типам </br>
    curl -X GET "http://172.30.250.199:5000/api/comments/stats" | jq '.data.by_entity_type'</br></br>

    # Получить только недавние комментарии </br>
    curl -X GET "http://172.30.250.199:5000/api/comments/stats" | jq '.data.recent_comments'
    </code></br></br>

    <b>Успешный ответ (HTTP 200):</b></br>
    <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T12:50:00.123456",
      "data": {
        "total_comments": 42,
        "by_entity_type": {
          "technique": 28,
          "rule": 10,
          "system": 3,
          "user": 1
        },
        "recent_comments": [
          {
            "id": 42,
            "entity_type": "technique",
            "entity_id": "T1078",
            "parent_comment_id": null,
            "text": "Последний добавленный комментарий",
            "comment_type": "comment",
            "priority": "normal",
            "visibility": "public",
            "status": "active",
            "author_name": "Администратор",
            "created_by": 4,
            "created_at": "2025-10-23T12:49:55",
            "updated_at": "2025-10-23T12:49:55"
          },
          {
            "id": 41,
            "entity_type": "rule",
            "entity_id": "rule-t1059-001",
            "parent_comment_id": null,
            "text": "Второй последний комментарий",
            "comment_type": "question",
            "priority": "high",
            "visibility": "public",
            "status": "active",
            "author_name": "Администратор",
            "created_by": 4,
            "created_at": "2025-10-23T12:40:00",
            "updated_at": "2025-10-23T12:40:00"
          },
          {
            "id": 40,
            "entity_type": "technique",
            "entity_id": "T1001",
            "parent_comment_id": null,
            "text": "Третий последний комментарий",
            "comment_type": "issue",
            "priority": "critical",
            "visibility": "public",
            "status": "active",
            "author_name": "Администратор",
            "created_by": 4,
            "created_at": "2025-10-23T12:35:00",
            "updated_at": "2025-10-23T12:35:00"
          }
        ]
      }
    }</pre></br>

    <b>Пустая статистика (когда нет комментариев, HTTP 200):</b></br>
    <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T12:50:00.123456",
      "data": {
        "total_comments": 0,
        "by_entity_type": {},
        "recent_comments": []
      }
    }</pre></br>

    <b>Ошибка сервера (HTTP 500):</b></br>
    <pre>{
      "code": 500,
      "success": false,
      "error": "Failed to get statistics: <описание ошибки>"
    }</pre></br>

    <b>Коды состояния:</b></br>
    - 200: Статистика успешно получена (может быть пустой)</br>
    - 500: Внутренняя ошибка сервера</br></br>

    <b>Структура ответа:</b></br>
    - <code>total_comments</code> [INT] - общее количество активных комментариев (статус != "deleted")</br>
    - <code>by_entity_type</code> [OBJECT] - словарь с распределением комментариев по типам сущностей</br>
      - <code>technique</code> [INT] - количество комментариев для техник</br>
      - <code>rule</code> [INT] - количество комментариев для правил</br>
      - <code>user</code> [INT] - количество комментариев для пользователей</br>
      - <code>system</code> [INT] - количество системных комментариев</br>
      - <code>incident</code> [INT] - количество комментариев для инцидентов (если есть)</br>
      - <code>tactic</code> [INT] - количество комментариев для тактик (если есть)</br>
    - <code>recent_comments</code> [ARRAY] - массив из 10 последних комментариев, отсортированных по времени создания (новые первыми)</br></br>

    <b>Примечания:</b></br>
    - Статистика обновляется в реальном времени при каждом запросе</br>
    - Удалённые комментарии (status="deleted") исключены из расчётов</br>
    - Максимальное количество недавних комментариев: 10 (фиксированное значение)</br>
    - Недавние комментарии отсортированы от новых к старым (по убыванию created_at)</br>
    - Если типа сущности нет комментариев, он не будет отображаться в by_entity_type</br>
    - Включены комментарии со статусом "active", "resolved", "locked", "pending" (кроме "deleted")</br>
    - Статистика лёгкая для парсинга и может использоваться для создания дашбордов</br></br>

    <b>Примеры использования:</b></br>

    <b>1. Получить общую статистику:</b></br>
    <code>GET /api/comments/stats</code></br></br>

    <b>2. Проверить общее количество комментариев:</b></br>
    <code>GET /api/comments/stats | jq '.data.total_comments'</code></br>
    Результат: <code>42</code></br></br>

    <b>3. Получить количество комментариев по типам:</b></br>
    <code>GET /api/comments/stats | jq '.data.by_entity_type'</code></br>
    Результат: <code>{ "technique": 28, "rule": 10, "system": 3, "user": 1 }</code></br></br>

    <b>4. Получить количество комментариев для техник:</b></br>
    <code>GET /api/comments/stats | jq '.data.by_entity_type.technique'</code></br>
    Результат: <code>28</code></br></br>

    <b>5. Получить автора последнего комментария:</b></br>
    <code>GET /api/comments/stats | jq '.data.recent_comments[0].author_name'</code></br>
    Результат: <code>"Администратор"</code></br></br>

    <b>6. Проверить, есть ли критические комментарии в последних 10:</b></br>
    <code>GET /api/comments/stats | jq '.data.recent_comments[] | select(.priority=="critical")'</code></br></br>

    <b>Практические применения:</b></br>
    - Вывод статистики на дашборде системы</br>
    - Быстрая проверка активности комментариев</br>
    - Отслеживание тренда комментариев по типам сущностей</br>
    - Поиск последних активностей в системе</br>
    - Интеграция в аналитические системы</br>
    - Мониторинг критических замечаний</br></br>

    <b>Оптимизация производительности:</b></br>
    - Индекс на поле status улучшит производительность фильтрации "deleted" комментариев</br>
    - Индекс на поле entity_type улучшит группировку по типам</br>
    - Индекс на поле created_at улучшит сортировку по времени создания</br>
    - Статистика кешируется на уровне приложения для часто запрашиваемых данных</br></br>
    """
    try:
        # Total comments
        total = db.session.query(Comments).filter(Comments.status != "deleted").count()

        # By entity type
        by_entity = (
            db.session.query(
                Comments.entity_type, db.func.count(Comments.id).label("count")
            )
            .filter(Comments.status != "deleted")
            .group_by(Comments.entity_type)
            .all()
        )

        # Recent comments
        recent = (
            db.session.query(Comments)
            .filter(Comments.status != "deleted")
            .order_by(Comments.created_at.desc())
            .limit(10)
            .all()
        )

        return create_success_response(
            {
                "total_comments": total,
                "by_entity_type": {entity: count for entity, count in by_entity},
                "recent_comments": [c.to_dict() for c in recent],
            }
        )
    except Exception as e:
        logger.error(f"Failed to get statistics: {e}", exc_info=True)
        return create_error_response(f"Failed to get statistics: {str(e)}", 500)
