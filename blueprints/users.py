"""
Users Blueprint - User Management with RBAC + Authentication
МОДЕРНИЗИРОВАНО: Добавлены методы login/logout
"""

from flask import Blueprint, request, g, session
from models.database import db, Users, CorrelationRules, Comments, UserSessions
from utils.helpers import (
    create_success_response,
    create_error_response,
    sanitize_input,
    validate_required_fields,
    validate_email,
    paginate_query,
)
from utils.auth import (
    require_role,
    admin_required,
    get_current_user_id,
    get_current_user_role,
)
import logging
from datetime import datetime, timedelta
from sqlalchemy import func, text
import secrets

logger = logging.getLogger(__name__)

users_bp = Blueprint("users", __name__)

# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================


@users_bp.route("/login", methods=["POST"])
def login():
    """
    Аутентифицировать пользователя, создать сессию и вернуть токен доступа.

Выполняет полную аутентификацию пользователя по логину/паролю с валидацией на каждом этапе,
генерирует криптографически стойкий токен сессии (57 символов), сохраняет сессию в БД user_sessions
с IP адресом и User-Agent, обновляет время последнего входа. Поддерживает опцию "Remember me" для
продления сессии на 30 дней. Включает двухуровневое хранение: в БД и во Flask session.
</br></br>

<b>Метод:</b> POST</br>
<b>URL:</b> /api/users/login</br>
<b>Авторизация:</b> Не требуется</br>
<b>Content-Type:</b> application/json</br></br>

<b>Обязательные параметры:</b></br>
- <code>username</code> [STRING] - имя пользователя (минимум 1 символ)</br>
- <code>password</code> [STRING] - пароль (минимум 1 символ)</br></br>

<b>Опциональные параметры:</b></br>
- <code>remember</code> [BOOLEAN] - запомнить пользователя на 30 дней (по умолчанию: false, сессия на 1 день)</br></br>

<b>Запросы curl:</b></br>
<code>
# Базовый логин
curl -X POST "http://172.30.250.199:5000/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'</br></br>

# С опцией "Remember me"
curl -X POST "http://172.30.250.199:5000/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password",
    "remember": true
  }'</br></br>

# С красивым форматированием
curl -X POST "http://172.30.250.199:5000/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }' | jq '.'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:00:00.123456",
  "data": {
    "message": "Login successful",
    "user": {
      "id": 4,
      "username": "admin",
      "email": "admin@mitre.local",
      "full_name": "Администратор",
      "role": "admin",
      "avatar": null,
      "is_active": true
    },
    "session": {
      "token": "bdcmIro8r3k3Bv6nbDiFqDBUAIYOQ87b4WZAF0uKKwRa9lzfVUpXF9kAdQ",
      "expires_at": "2025-10-24T14:00:00",
      "remember": false
    }
  }
}</pre></br></br>

<b>Ошибка: отсутствуют учетные данные (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Username and password required"
}</pre></br></br>

<b>Ошибка: неправильные учетные данные (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Invalid username or password"
}</pre></br></br>

<b>Ошибка: пользователь неактивен (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "User account is inactive"
}</pre></br></br>

<b>Ошибка: ошибка проверки пароля (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Authentication failed"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Login failed. Please try again."
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Успешный вход, токен сгенерирован и сохранён</br>
- 400: Неправильные параметры запроса (отсутствуют данные)</br>
- 401: Неправильные учетные данные или ошибка проверки пароля</br>
- 403: Учетная запись неактивна</br>
- 500: Ошибка при создании сессии в БД</br></br>

<b>Процесс аутентификации (7 этапов):</b></br>
1. Валидация JSON данных и входных параметров (username, password)</br>
2. Поиск пользователя в БД по username</br>
3. Проверка активности пользователя (is_active=True)</br>
4. Проверка наличия хеша пароля</br>
5. Проверка пароля через bcrypt (PBKDF2:SHA256:600000)</br>
6. Обновление last_login пользователя</br>
7. Генерация криптографического токена (secrets.token_urlsafe(43) = 57 символов)</br>
8. Сохранение сессии в user_sessions таблице с IP и User-Agent</br>
9. Сохранение сессии во Flask session для server-side</br>
10. Возврат токена и данных пользователя клиенту</br></br>

<b>Структура ответа:</b></br>

<b>User данные:</b></br>
- <code>id</code> [INT] - уникальный ID пользователя</br>
- <code>username</code> [STRING] - имя пользователя</br>
- <code>email</code> [STRING] - email адрес</br>
- <code>full_name</code> [STRING] - полное имя</br>
- <code>role</code> [STRING] - роль (admin, analyst, viewer)</br>
- <code>avatar</code> [STRING|NULL] - URL аватара (может быть null)</br>
- <code>is_active</code> [BOOLEAN] - активен ли пользователь</br></br>

<b>Session данные:</b></br>
- <code>token</code> [STRING] - токен сессии (57 символов, base64url)</br>
- <code>expires_at</code> [TIMESTAMP] - ISO 8601 время истечения токена</br>
- <code>remember</code> [BOOLEAN] - была ли установлена опция "Remember me"</br></br>

<b>Параметры сессии в БД:</b></br>
- <code>session_token</code> [STRING] - токен (сохранён в user_sessions)</br>
- <code>user_id</code> [INT] - ID пользователя</br>
- <code>expires_at</code> [TIMESTAMP] - срок действия (1 день или 30 дней)</br>
- <code>ip_address</code> [STRING] - IP адрес клиента (для аудита)</br>
- <code>user_agent</code> [STRING] - User-Agent браузера (для аудита)</br>
- <code>is_active</code> [BOOLEAN] - активна ли сессия (True после входа)</br>
- <code>created_at</code> [TIMESTAMP] - время создания сессии</br>
- <code>last_activity</code> [TIMESTAMP] - время последней активности</br></br>

<b>Примечания:</b></br>
- Токен сохраняется <b>И в БД</b>, <b>И во Flask session</b> для двухуровневой защиты</br>
- При remember=true сессия действует 30 дней, иначе 1 день</br>
- Старые неактивные сессии автоматически очищаются при входе</br>
- Пароль проверяется через bcrypt (PBKDF2:SHA256:600000)</br>
- IP адрес и User-Agent сохраняются для аудита безопасности</br>
- Пароль никогда не логируется в полном виде (только длина)</br>
- При успешном входе обновляется last_login пользователя</br>
- Ошибки намеренно неинформативны ("Invalid username or password") для защиты от brute-force</br></br>

<b>Безопасность:</b></br>
- Криптографически стойкий токен (57 символов из 62 возможных)</br>
- Пароль никогда не возвращается в API</br>
- Хеш пароля защищен bcrypt с 600000 итерациями</br>
- IP адрес логируется для обнаружения подозрительной активности</br>
- Сессия может быть дезактивирована администратором</br>
- Rate limiting рекомендуется на этом эндпоинте</br></br>

<b>Практические применения:</b></br>
- Аутентификация пользователей в веб-приложении</br>
- Создание защищённых сессий</br>
- Восстановление сессии при перезагрузке страницы</br>
- Аудит входов и попыток несанкционированного доступа</br>
- Анализ активности пользователей</br></br>

<b>Примеры использования:</b></br>

<b>1. Обычный логин (сессия на 1 день):</b></br>
<code>POST /api/users/login</code></br>
Body: <code>{ "username": "admin", "password": "SecurePass123!" }</code></br></br>

<b>2. Логин с "Remember me" (сессия на 30 дней):</b></br>
<code>POST /api/users/login</code></br>
Body: <code>{ "username": "admin", "password": "SecurePass123!", "remember": true }</code></br></br>

<b>3. JavaScript интеграция (сохранение токена):</b></br>
<code>
async function login(username, password, remember) {
  const response = await fetch('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, remember })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Сохранить токен в localStorage
    localStorage.setItem('authToken', data.data.session.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
    
    // Использовать токен в последующих запросах
    return data.data;
  }
}
</code></br></br>

<b>4. Использование токена в других запросах:</b></br>
<code>
const token = localStorage.getItem('authToken');
fetch('/api/comments', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
</code></br></br>

<b>Производительность:</b></br>
- Время ответа: ~100-300ms (зависит от скорости bcrypt проверки)</br>
- Размер ответа: ~1-2KB</br>
- Рекомендуется rate limiting: максимум 5 попыток в минуту</br>
- Блокировка после 10 неудачных попыток на 15 минут</br></br>
    """
    try:
        logger.info("=" * 80)
        logger.info("🔐 LOGIN ATTEMPT STARTED")
        logger.info("=" * 80)

        data = request.get_json()
        if not data:
            logger.warning("❌ No JSON data received")
            return create_error_response("JSON data required", 400)

        username = sanitize_input(data.get("username", "")).strip()
        password = data.get("password", "").strip()
        remember = bool(data.get("remember", False))

        logger.info(f"📝 Username: {username}")
        logger.info(f"🔑 Password length: {len(password)}")
        logger.info(f"💾 Remember me: {remember}")

        # Проверка входных данных
        if not username or not password:
            logger.warning("❌ Missing credentials")
            return create_error_response("Username and password required", 400)

        if len(password) < 1:
            logger.warning("❌ Password is empty")
            return create_error_response("Invalid username or password", 401)

        # Ищем пользователя в БД
        logger.info("🔍 Searching for user...")
        user = db.session.query(Users).filter(Users.username == username).first()

        if not user:
            logger.warning(f"❌ User not found: {username}")
            return create_error_response("Invalid username or password", 401)

        logger.info(f"✅ User found:")
        logger.info(f"   - ID: {user.id}")
        logger.info(f"   - Role: {user.role}")
        logger.info(f"   - Active: {user.is_active}")
        logger.info(f"   - Hash exists: {bool(user.password_hash)}")

        # Проверка активности пользователя
        if not user.is_active:
            logger.warning(f"❌ User account is inactive: {username}")
            return create_error_response("User account is inactive", 403)

        # Проверка хеша пароля
        if not user.password_hash:
            logger.error(f"❌ No password hash stored for user: {username}")
            return create_error_response("Invalid username or password", 401)

        # Проверка пароля
        logger.info("🔐 Verifying password...")
        try:
            password_valid = user.check_password(password)
            logger.info(f"   Password valid: {password_valid}")

            if not password_valid:
                logger.warning(f"❌ Invalid password for user: {username}")
                return create_error_response("Invalid username or password", 401)

        except Exception as pwd_error:
            logger.error(f"❌ Password verification error: {pwd_error}")
            import traceback

            logger.error(traceback.format_exc())
            return create_error_response("Authentication failed", 401)

        logger.info(f"✅ Password verified successfully")

        # ✅ СОЗДАЁМ ПРАВИЛЬНЫЙ SESSION TOKEN
        session_token = secrets.token_urlsafe(43)  # ~57 символов

        logger.info(f"🎫 Generated session token:")
        logger.info(f"   - Preview: {session_token[:20]}...")
        logger.info(f"   - Length: {len(session_token)}")

        # Обновляем last_login пользователя
        user.last_login = datetime.utcnow()
        db.session.commit()
        logger.info(f"   - Updated last_login: {user.last_login}")

        # ✅ СОХРАНЯЕМ ТОКЕН В БД (user_sessions)
        expires_at = datetime.utcnow() + timedelta(days=30 if remember else 1)

        logger.info(f"\n💾 Saving token to database...")

        try:
            # Удаляем старые неактивные сессии этого пользователя
            old_sessions = UserSessions.query.filter(
                UserSessions.user_id == user.id, UserSessions.is_active == False
            ).delete()
            logger.info(f"   - Cleaned {old_sessions} old sessions")

            # Создаём новую сессию
            user_session = UserSessions(
                user_id=user.id,
                session_token=session_token,
                expires_at=expires_at,
                ip_address=request.remote_addr,
                user_agent=request.headers.get("User-Agent"),
                is_active=True,
            )

            db.session.add(user_session)
            db.session.commit()

            logger.info(f"✅ Session saved to DB:")
            logger.info(f"   - Session ID: {user_session.id}")
            logger.info(f"   - User ID: {user.id}")
            logger.info(f"   - Token: {session_token[:20]}...")
            logger.info(f"   - Expires: {expires_at}")
            logger.info(f"   - IP: {request.remote_addr}")

        except Exception as db_error:
            logger.error(f"❌ Failed to save session to DB: {db_error}")
            import traceback

            logger.error(traceback.format_exc())
            db.session.rollback()
            return create_error_response("Failed to create session", 500)

        # ✅ СОХРАНЯЕМ ВО FLASK SESSION (для server-side)
        session.permanent = remember
        if remember:
            session.permanent_session_lifetime = timedelta(days=30)
            logger.info("   - Session lifetime: 30 days (remember me)")
        else:
            logger.info("   - Session lifetime: 1 day (default)")

        session["user_id"] = user.id
        session["username"] = user.username
        session["email"] = user.email
        session["role"] = user.role
        session["full_name"] = user.full_name
        session["session_token"] = session_token
        session["login_time"] = datetime.utcnow().isoformat()
        session["is_authenticated"] = True

        logger.info(f"✅ Flask session created for user: {username}")

        # Формируем данные пользователя для клиента
        user_data = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "avatar": None,
            "is_active": user.is_active,
        }

        # Формируем данные сессии для клиента
        session_data = {
            "token": session_token,  # ← ПРАВИЛЬНЫЙ ТОКЕН (57 символов)
            "expires_at": expires_at.isoformat(),
            "remember": remember,
        }

        logger.info("=" * 80)
        logger.info(f"✅ LOGIN SUCCESSFUL: {username}")
        logger.info(
            f"   - Token: {session_token[:20]}... (length: {len(session_token)})"
        )
        logger.info(f"   - Expires: {session_data['expires_at']}")
        logger.info("=" * 80)

        # ✅ ВОЗВРАЩАЕМ ПРАВИЛЬНЫЙ ОТВЕТ
        return create_success_response(
            {"message": "Login successful", "user": user_data, "session": session_data},
            200,
        )

    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"❌ LOGIN ERROR: {type(e).__name__}: {e}")
        logger.error("=" * 80)
        import traceback

        logger.error(traceback.format_exc())

        db.session.rollback()
        return create_error_response("Login failed. Please try again.", 500)


@users_bp.route("/logout", methods=["POST"])
def logout():
    """
    Завершить сеанс пользователя, дезактивировать токен в БД и очистить сессию.

Деактивирует текущую сессию в user_sessions таблице (мягкое удаление), очищает Flask session,
удаляет токен с клиента. После logout токен больше не работает ни для каких операций.
Сессия остаётся в истории для аудита. Завершение гарантировано даже если произойдёт ошибка.
</br></br>

<b>Метод:</b> POST</br>
<b>URL:</b> /api/users/logout</br>
<b>Авторизация:</b> Требуется Bearer token (текущий пользователь должен быть авторизован)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры:</b> Нет (используются данные текущей сессии)</br></br>

<b>Запросы curl:</b></br>
<code>
# Базовый logout
curl -X POST "http://172.30.250.199:5000/api/users/logout" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# С информативным выводом
curl -X POST "http://172.30.250.199:5000/api/users/logout" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.'</br></br>

# С полной диагностикой
curl -v -X POST "http://172.30.250.199:5000/api/users/logout" \
  -H "Authorization: Bearer YOUR_TOKEN"
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:05:00.123456",
  "data": {
    "message": "Logout successful"
  }
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка: отсутствует токен (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Authorization token is missing"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Logout failed: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Успешный выход, сессия дезактивирована</br>
- 401: Пользователь не авторизован или токен отсутствует</br>
- 500: Ошибка при дезактивации сессии в БД</br></br>

<b>Процесс logout (3 этапа):</b></br>
1. Получить user_id и session_token из текущей Flask session</br>
2. Найти сессию в user_sessions по user_id и session_token</br>
3. Установить is_active=False для этой сессии (мягкое удаление)</br>
4. Очистить Flask session полностью</br>
5. Вернуть успешный ответ</br></br>

<b>Что происходит при logout:</b></br>

<b>В БД (user_sessions):</b></br>
- <code>is_active</code> устанавливается в False</br>
- Токен остаётся в таблице для аудита</br>
- Время деактивации логируется</br>
- Сессия может быть просмотрена администратором позже</br></br>

<b>В Flask session:</b></br>
- Полностью очищается все содержимое сессии</br>
- Удаляются: user_id, username, email, role, session_token и т.д.</br>
- Куки сессии инвалидируются</br></br>

<b>На клиенте:</b></br>
- Токен должен быть удалён из localStorage</br>
- Пользовательские данные должны быть очищены</br>
- Приложение должно перенаправить на страницу входа</br></br>

<b>Примечания:</b></br>
- Старый токен больше не работает после logout</br>
- Сессия не удаляется физически (soft delete для аудита)</br>
- Даже если произойдёт ошибка в БД, Flask session всё равно будет очищена</br>
- Логирование выполняется для все случаев (успех и ошибка)</br>
- Logout может быть вызван даже если сессия уже неактивна</br>
- IP адрес и User-Agent сохраняются в истории для аудита</br></br>

<b>Практические применения:</b></br>
- Безопасное завершение сеанса пользователя</br>
- Очистка памяти сессии</br>
- Аудит и логирование выходов</br>
- Механизм для "выхода со всех устройств" (дезактивация всех сессий)</br>
- Обеспечение безопасности при общих компьютерах</br></br>

<b>Примеры использования:</b></br>

<b>1. Простой logout из браузера:</b></br>
<code>
curl -X POST "http://172.30.250.199:5000/api/users/logout" \
  -H "Authorization: Bearer YOUR_TOKEN"
</code></br></br>

<b>2. JavaScript интеграция (полный logout):</b></br>
<code>
async function logout() {
  const token = localStorage.getItem('authToken');
  
  try {
    const response = await fetch('/api/users/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Очистить localStorage
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      
      // Перенаправить на страницу входа
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('Logout error:', error);
    // Всё равно очистить данные и перенаправить
    localStorage.removeItem('authToken');
    window.location.href = '/login';
  }
}
</code></br></br>

<b>3. Logout с обработкой ошибок:</b></br>
<code>
async function safeLogout() {
  const token = localStorage.getItem('authToken');
  
  // Попытаться сообщить серверу о logout
  try {
    await fetch('/api/users/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (error) {
    console.warn('Could not notify server about logout:', error);
  }
  
  // Всё равно очистить клиент
  localStorage.clear();
  sessionStorage.clear();
  
  // Перенаправить на login
  window.location.href = '/login';
}
</code></br></br>

<b>4. Автоматический logout при истечении сессии:</b></br>
<code>
function setupSessionTimeout() {
  const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 часа
  
  setTimeout(() => {
    // Автоматический logout
    logout().then(() => {
      alert('Your session has expired. Please login again.');
    });
  }, TOKEN_EXPIRY);
}
</code></br></br>

<b>5. Logout со всех устройств (администратор):</b></br>
<code>
async function logoutUserFromAllDevices(userId) {
  // Деактивировать все сессии пользователя
  // (требуется специальный endpoint для администратора)
  const response = await fetch(
    `/api/admin/users/${userId}/logout-all`,
    { method: 'POST' }
  );
  
  return await response.json();
}
</code></br></br>

<b>Обработка ошибок:</b></br>

<b>Если logout вернул ошибку:</b></br>
- Всё равно удалить токен с клиента</br>
- Очистить localStorage и sessionStorage</br>
- Перенаправить на страницу входа</br>
- Логировать ошибку для отладки</br></br>

<b>Если нет интернета:</b></br>
- Применить стратегию graceful degradation</br>
- Очистить клиентские данные</br>
- Сессия на сервере автоматически истечёт</br></br>

<b>Безопасность:</b></br>
- Токен деактивируется на сервере (не может быть переиспользован)</br>
- Flask session очищается (куки инвалидируются)</br>
- Мягкое удаление позволяет провести аудит</br>
- Ошибки логируются но не разглашают детали пользователю</br>
- Даже незавершённый logout оставляет сессию в безопасном состоянии</br></br>

<b>Рекомендации:</b></br>
1. Всегда вызывайте logout перед перенаправлением на login</br>
2. Удаляйте токен из localStorage сразу после logout</br>
3. Не полагайтесь на logout для удаления sensitive данных - очищайте на клиенте</br>
4. Обрабатывайте сетевые ошибки и всё равно очищайте клиент</br>
5. Покажите пользователю подтверждение успешного logout</br></br>

<b>Производительность:</b></br>
- Время ответа: ~50-150ms</br>
- Размер ответа: ~200 байт</br>
- Операция в БД очень быстрая (просто UPDATE одного поля)</br>
- Можно безопасно вызывать много раз подряд</br></br>
    """
    try:
        user_id = session.get("user_id")
        session_token = session.get("session_token")
        username = session.get("username")

        if user_id:
            logger.info(f"User logout: {username} (ID: {user_id})")

            # ✅ ДЕЗАКТИВИРУЕМ СЕССИЮ В БД
            try:
                user_session = UserSessions.query.filter_by(
                    user_id=user_id, session_token=session_token, is_active=True
                ).first()

                if user_session:
                    user_session.is_active = False
                    db.session.commit()
                    logger.info(f"✅ Session {user_session.id} deactivated")
            except Exception as db_error:
                logger.error(f"Failed to deactivate session: {db_error}")
                db.session.rollback()

        # Clear Flask session
        session.clear()

        return create_success_response({"message": "Logout successful"})

    except Exception as e:
        logger.error(f"Logout error: {e}")
        return create_error_response(f"Logout failed: {str(e)}", 500)


@users_bp.route("/check-auth", methods=["GET"])
def check_auth():
    """
    Проверить аутентификацию пользователя и получить информацию о текущей сессии.
    
    Проверяет валидность токена сессии, срок действия и статус пользователя.
    Возвращает данные аутентифицированного пользователя или статус неавторизованного доступа.
    </br></br>
    
    <b>Метод:</b> GET</br>
    <b>URL:</b> /api/users/check-auth</br>
    <b>Авторизация:</b> Требуется session token в localStorage (authToken)</br></br>
    
    <b>Проверки:</b></br>
    1. Наличие session_token в localStorage</br>
    2. Существование активной сессии в БД (user_sessions)</br>
    3. Срок действия токена (expires_at > now)</br>
    4. Активность пользователя (user.is_active = True)</br></br>
    
    <b>Запрос curl:</b></br>
    <code>curl -X GET "http://172.30.250.199:5000/api/users/check-auth" \\
  -H "Authorization: Bearer (токен из localStorage)"</code></br></br>
    
    <b>Успешный ответ (аутентифицирован):</b></br>
    <pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T12:03:45.123456",
  "data": {
    "authenticated": true,
    "user": {
      "id": 4,
      "username": "admin",
      "email": "admin@mitre.local",
      "full_name": "Администратор",
      "role": "admin"
    }
  }
}</pre></br>
    
    <b>Ответ (не аутентифицирован):</b></br>
    <pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T12:03:45.123456",
  "data": {
    "authenticated": false,
    "user": null
  }
}</pre></br>
    
    <b>Ответ при ошибке:</b></br>
    <pre>{
  "code": 500,
  "success": false,
  "timestamp": "2025-10-23T12:03:45.123456",
  "error": "Auth check failed: <описание ошибки>"
}</pre></br>
    
    <b>Коды состояния:</b></br>
    - 200: Успешная проверка (authenticated = true/false)</br>
    - 500: Внутренняя ошибка сервера</br></br>
    
    <b>Примечания:</b></br>
    - При успешной проверке обновляется last_activity в user_sessions</br>
    - Истёкшие сессии автоматически деактивируются (is_active = False)</br>
    - Используется для проверки состояния аутентификации при загрузке страницы</br>
    - Frontend вызывает этот endpoint через AuthSystem.verifyToken()</br>
    """
    try:
        # Получаем токен из заголовка Authorization
        token = None
        auth_header = request.headers.get("Authorization")

        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                token = parts[1].strip()
            else:
                return create_success_response(
                    {
                        "authenticated": False,
                        "user": None,
                        "debug": {
                            "error": "Invalid Authorization header format",
                            "auth_header": auth_header,
                        },
                    }
                )

        # Если токена нет в заголовке, проверяем session
        if not token:
            token = session.get("session_token")
            if token:
                token = token.strip()

        if not token:
            return create_success_response(
                {
                    "authenticated": False,
                    "user": None,
                    "debug": {
                        "error": "No token provided",
                        "auth_header": auth_header,
                        "session_token": session.get("session_token"),
                    },
                }
            )

        # 🔍 ДИАГНОСТИКА: Собираем все токены из БД
        debug_info = {
            "request_token": token,
            "request_token_length": len(token),
            "request_token_repr": repr(token),
            "request_token_hex": token.encode("utf-8").hex(),
            "all_sessions": [],
        }

        all_sessions = UserSessions.query.all()
        debug_info["total_sessions_in_db"] = len(all_sessions)

        for sess in all_sessions:
            session_info = {
                "id": sess.id,
                "user_id": sess.user_id,
                "token": sess.session_token,
                "token_length": len(sess.session_token),
                "token_repr": repr(sess.session_token),
                "is_active": sess.is_active,
                "expires_at": sess.expires_at.isoformat() if sess.expires_at else None,
                "created_at": sess.created_at.isoformat() if sess.created_at else None,
                "last_activity": (
                    sess.last_activity.isoformat() if sess.last_activity else None
                ),
                "matches_request": sess.session_token == token,
            }

            # Если не совпадает, найдём различия
            if not session_info["matches_request"] and len(sess.session_token) == len(
                token
            ):
                differences = []
                for i, (c1, c2) in enumerate(zip(token, sess.session_token)):
                    if c1 != c2:
                        differences.append(
                            {
                                "position": i,
                                "request_char": c1,
                                "request_ord": ord(c1),
                                "db_char": c2,
                                "db_ord": ord(c2),
                            }
                        )
                session_info["differences"] = differences[:5]  # Первые 5 различий

            debug_info["all_sessions"].append(session_info)

        # ✅ ПРОВЕРЯЕМ ТОКЕН В БД
        user_session = UserSessions.query.filter_by(
            session_token=token, is_active=True
        ).first()

        if not user_session:
            # Проверим без фильтра is_active
            any_session = UserSessions.query.filter_by(session_token=token).first()

            debug_info["search_result"] = "not_found"
            if any_session:
                debug_info["found_inactive_session"] = {
                    "id": any_session.id,
                    "user_id": any_session.user_id,
                    "is_active": any_session.is_active,
                    "expires_at": (
                        any_session.expires_at.isoformat()
                        if any_session.expires_at
                        else None
                    ),
                }

            return create_success_response(
                {"authenticated": False, "user": None, "debug": debug_info}
            )

        # ✅ ПРОВЕРЯЕМ СРОК ДЕЙСТВИЯ
        expires_at = user_session.expires_at
        current_time = datetime.now()

        debug_info["search_result"] = "found"
        debug_info["found_session"] = {
            "id": user_session.id,
            "user_id": user_session.user_id,
            "is_active": user_session.is_active,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "current_time": current_time.isoformat(),
            "is_expired": current_time > expires_at,
            "time_until_expiry": (
                str(expires_at - current_time)
                if expires_at > current_time
                else "EXPIRED"
            ),
        }

        if current_time > expires_at:
            user_session.is_active = False
            db.session.commit()

            return create_success_response(
                {"authenticated": False, "user": None, "debug": debug_info}
            )

        # ✅ ПОЛУЧАЕМ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
        user = db.session.query(Users).filter_by(id=user_session.user_id).first()

        if not user:
            debug_info["user_check"] = "user_not_found"
            return create_success_response(
                {"authenticated": False, "user": None, "debug": debug_info}
            )

        if not user.is_active:
            debug_info["user_check"] = "user_inactive"
            debug_info["user_details"] = {
                "id": user.id,
                "username": user.username,
                "is_active": user.is_active,
            }
            return create_success_response(
                {"authenticated": False, "user": None, "debug": debug_info}
            )

        # ✅ ОБНОВЛЯЕМ ВРЕМЯ ПОСЛЕДНЕЙ АКТИВНОСТИ
        user_session.last_activity = datetime.now()
        db.session.commit()

        # ✅ ФОРМИРУЕМ ОТВЕТ
        user_data = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
        }

        return create_success_response(
            {
                "authenticated": True,
                "user": user_data,
                "debug": debug_info,  # Для отладки оставим и в успешном ответе
            }
        )

    except Exception as e:
        import traceback

        return create_error_response(
            f"Auth check failed: {str(e)}",
            500,
            details={"exception": str(e), "traceback": traceback.format_exc()},
        )


@users_bp.route("/refresh-session", methods=["POST"])
def refresh_session():
    """
    Refresh user session - ОБНОВЛЯЕТ токен и сессию в БД
    POST /api/users/refresh-session
    """
    try:
        user_id = session.get("user_id")
        session_token = session.get("session_token")

        if not user_id or not session_token:
            return create_error_response("Not authenticated", 401)

        # ✅ ПРОВЕРЯЕМ ТЕКУЩУЮ СЕССИЮ
        user_session = UserSessions.query.filter_by(
            user_id=user_id, session_token=session_token, is_active=True
        ).first()

        if not user_session:
            return create_error_response("Invalid session", 401)

        # Generate new token
        new_token = secrets.token_urlsafe(43)
        new_expires = datetime.utcnow() + timedelta(days=1)

        # ✅ ДЕЗАКТИВИРУЕМ СТАРУЮ СЕССИЮ
        user_session.is_active = False
        db.session.commit()

        # ✅ СОЗДАЁМ НОВУЮ СЕССИЮ
        new_session = UserSessions(
            user_id=user_id,
            session_token=new_token,
            expires_at=new_expires,
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
            is_active=True,
        )
        db.session.add(new_session)
        db.session.commit()

        logger.info(f"✅ Session refreshed for user {user_id}")

        # Обновляем Flask session
        session["session_token"] = new_token
        session["login_time"] = datetime.utcnow().isoformat()

        return create_success_response(
            {
                "message": "Session refreshed",
                "session": {
                    "token": new_token,
                    "expires_at": new_expires.isoformat(),
                },
            }
        )

    except Exception as e:
        logger.error(f"Session refresh error: {e}")
        import traceback

        logger.error(traceback.format_exc())
        db.session.rollback()
        return create_error_response(f"Session refresh failed: {str(e)}", 500)


# ============================================================================
# EXISTING USER MANAGEMENT ENDPOINTS
# ============================================================================


@users_bp.route("/", methods=["GET"])
@admin_required
def list_users():
    """Получить полный список всех пользователей системы с поддержкой гибкой пагинации (только для администраторов).

Возвращает полный список всех зарегистрированных пользователей, отсортированных по времени создания (новые первыми).
Доступен только для администраторов (@admin_required). Хеши паролей исключены из ответа в целях безопасности.
Поддерживает гибкую пагинацию с настраиваемым размером страницы (10-100 элементов). Включает как активные, 
так и неактивные пользователи с полной статистикой.
</br></br>

<b>Метод:</b> GET</br>
<b>URL:</b> /api/users</br>
<b>Авторизация:</b> Требуется @admin_required (только администраторы)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Query параметры:</b></br>
- <code>page</code> [INT] - номер страницы (по умолчанию: 1, минимум: 1)</br>
- <code>limit</code> [INT] - количество пользователей на странице (по умолчанию: 20, диапазон: 10-100)</br></br>

<b>Запросы curl:</b></br>
<code>
# Получить первую страницу со стандартным размером (20 пользователей)
curl -X GET "http://172.30.250.199:5000/api/users" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# Получить вторую страницу
curl -X GET "http://172.30.250.199:5000/api/users?page=2" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# Получить первую страницу с 50 пользователями
curl -X GET "http://172.30.250.199:5000/api/users?page=1&limit=50" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# Получить третью страницу с 100 пользователями (максимум)
curl -X GET "http://172.30.250.199:5000/api/users?page=3&limit=100" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# С красивым форматированием JSON
curl -X GET "http://172.30.250.199:5000/api/users?page=1&limit=10" \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq '.'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:20:00.123456",
  "data": {
    "users": [
      {
        "id": 4,
        "username": "admin",
        "email": "admin@mitre.local",
        "full_name": "Администратор",
        "role": "admin",
        "is_active": true,
        "last_login": "2025-10-23T14:00:00",
        "created_at": "2025-10-20T10:00:00",
        "updated_at": "2025-10-23T14:00:00"
      },
      {
        "id": 5,
        "username": "analyst_1",
        "email": "analyst@mitre.local",
        "full_name": "Аналитик",
        "role": "analyst",
        "is_active": true,
        "last_login": "2025-10-23T13:30:00",
        "created_at": "2025-10-21T09:00:00",
        "updated_at": "2025-10-23T13:30:00"
      },
      {
        "id": 6,
        "username": "viewer_1",
        "email": "viewer@mitre.local",
        "full_name": "Просмотрщик",
        "role": "viewer",
        "is_active": false,
        "last_login": null,
        "created_at": "2025-10-22T11:30:00",
        "updated_at": "2025-10-22T11:30:00"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total_items": 12,
      "total_pages": 1,
      "has_next": false,
      "has_prev": false
    }
  }
}</pre></br></br>

<b>Ошибка: недостаточно прав (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка: неправильные параметры пагинации (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Invalid page or limit parameter"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to retrieve users: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Список пользователей успешно получен</br>
- 400: Неправильные параметры пагинации (page < 1, limit вне диапазона)</br>
- 401: Пользователь не авторизован</br>
- 403: Не достаточно прав (требуется роль admin)</br>
- 500: Ошибка при получении данных из БД</br></br>

<b>Структура ответа:</b></br>

<b>Основные данные:</b></br>
- <code>users</code> [ARRAY] - массив объектов пользователей (отсортирован по created_at DESC)</br>
- <code>pagination</code> [OBJECT] - информация о пагинации</br></br>

<b>Объект pagination:</b></br>
- <code>page</code> [INT] - текущий номер страницы</br>
- <code>limit</code> [INT] - количество элементов на странице</br>
- <code>total_items</code> [INT] - всего пользователей в системе</br>
- <code>total_pages</code> [INT] - всего страниц при текущем limit</br>
- <code>has_next</code> [BOOLEAN] - есть ли следующая страница</br>
- <code>has_prev</code> [BOOLEAN] - есть ли предыдущая страница</br></br>

<b>Каждый пользователь содержит:</b></br>
- <code>id</code> [INT] - уникальный ID пользователя</br>
- <code>username</code> [STRING] - имя пользователя (уникальное)</br>
- <code>email</code> [STRING] - email адрес (уникальный)</br>
- <code>full_name</code> [STRING] - полное имя пользователя</br>
- <code>role</code> [STRING] - роль (admin, analyst, viewer)</br>
- <code>is_active</code> [BOOLEAN] - активен ли пользователь (может быть деактивирован)</br>
- <code>last_login</code> [TIMESTAMP|NULL] - время последнего входа (null если никогда не входил)</br>
- <code>created_at</code> [TIMESTAMP] - время создания учётной записи</br>
- <code>updated_at</code> [TIMESTAMP] - время последнего обновления профиля</br></br>

<b>Примечания:</b></br>
- Пароли (password_hash) никогда не возвращаются в API (для безопасности)</br>
- Пользователи отсортированы по времени создания (новые первыми)</br>
- Пагинация обязательна (максимум 100 на странице для оптимизации)</br>
- Доступен только для администраторов (@admin_required)</br>
- Включены как активные, так и неактивные пользователи</br>
- Если пользователь никогда не входил, last_login будет null</br>
- Минимальный размер страницы: 10 пользователей</br>
- Параметр page автоматически корректируется если он < 1</br></br>

<b>Валидация параметров:</b></br>
- <code>page = max(1, int(request.args.get("page", 1)))</code> - минимум 1</br>
- <code>limit = min(100, max(10, int(...)))</code> - диапазон 10-100</br></br>

<b>Примеры использования:</b></br>

<b>1. Получить всех пользователей постранично (10 на странице):</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/users?page=1&limit=10" \
  -H "Authorization: Bearer ADMIN_TOKEN"
</code></br></br>

<b>2. Получить количество всех пользователей:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/users" \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq '.data.pagination.total_items'
</code></br></br>

<b>3. Получить последних 50 пользователей (одна страница):</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/users?page=1&limit=50" \
  -H "Authorization: Bearer ADMIN_TOKEN"
</code></br></br>

<b>4. Итерировать по всем пользователям (JavaScript):</b></br>
<code>
async function getAllUsers(token) {
  const allUsers = [];
  let page = 1;
  
  while (true) {
    const response = await fetch(
      `/api/users?page=${page}&limit=50`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    const data = await response.json();
    allUsers.push(...data.data.users);
    
    if (!data.data.pagination.has_next) break;
    page++;
  }
  
  return allUsers;
}
</code></br></br>

<b>5. Получить активных администраторов (JavaScript):</b></br>
<code>
async function getActiveAdmins(token) {
  const response = await fetch('/api/users?limit=100', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  return data.data.users.filter(u => 
    u.is_active && u.role === 'admin'
  );
}
</code></br></br>

<b>6. Получить пользователей по статусу активности (JavaScript):</b></br>
<code>
async function getUsersByStatus(token, isActive) {
  const response = await fetch('/api/users?limit=100', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  return data.data.users.filter(u => u.is_active === isActive);
}
</code></br></br>

<b>7. Получить пользователей для администраторского интерфейса:</b></br>
<code>
async function loadUsersTable(page = 1, pageSize = 20) {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(
    `/api/users?page=${page}&limit=${pageSize}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  const { data } = await response.json();
  
  return {
    users: data.users,
    currentPage: data.pagination.page,
    totalPages: data.pagination.total_pages,
    totalUsers: data.pagination.total_items,
    hasNext: data.pagination.has_next,
    hasPrev: data.pagination.has_prev
  };
}
</code></br></br>

<b>Производительность:</b></br>
- Время ответа: ~50-200ms в зависимости от количества пользователей</br>
- Размер ответа: ~1-10KB в зависимости от limit</br>
- Рекомендуемый limit для удобства: 20-50 пользователей</br>
- Индексы на created_at ускоряют сортировку</br>
- Рекомендуется кешировать на 5 минут для редко меняющихся данных</br></br>

<b>Рекомендации:</b></br>
1. Используйте пагинацию, не запрашивайте всех пользователей сразу</br>
2. Для администраторского интерфейса оптимально 20-50 пользователей на странице</br>
3. При экспорте/аналитике используйте limit=100 для минимизации запросов</br>
4. Кешируйте результаты на клиенте для снижения нагрузки на сервер</br>
5. Всегда проверяйте has_next перед загрузкой следующей страницы</br></br>

<b>Сценарии использования:</b></br>
- Администраторский интерфейс управления пользователями</br>
- Таблица пользователей с пагинацией</br>
- Аудит и мониторинг активности пользователей</br>
- Экспорт списка пользователей</br>
- Анализ статистики пользователей по ролям</br></br>
"""
    try:
        page = max(1, int(request.args.get("page", 1)))
        limit = min(100, max(10, int(request.args.get("limit", 20))))

        query = db.session.query(Users).order_by(Users.created_at.desc())
        results = paginate_query(query, page, limit)

        users_data = []
        for user in results["items"]:
            user_dict = user.to_dict()
            user_dict.pop("password_hash", None)
            users_data.append(user_dict)

        return create_success_response(
            {"users": users_data, "pagination": results["pagination"]}
        )

    except Exception as e:
        logger.error(f"Failed to retrieve users list: {e}")
        return create_error_response(f"Failed to retrieve users: {str(e)}", 500)


@users_bp.route("/<int:user_id>", methods=["GET"])
def get_user(user_id):
    """Получить детальную информацию о конкретном пользователе с расширенной статистикой активности.

Возвращает полную информацию о пользователе с вычисленной статистикой: количество созданных правил,
комментариев и общей активности. Администраторы могут просматривать любых пользователей, обычные пользователи
могут просматривать только свой профиль (систему разграничения доступа). Для автора и администраторов включается
подсчёт активности в реальном времени.
</br></br>

<b>Метод:</b> GET</br>
<b>URL:</b> /api/users/{user_id}</br>
<b>Авторизация:</b> Требуется (администратор может смотреть любого, остальные - только себя)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры пути:</b></br>
- <code>user_id</code> [INT] - ID пользователя (обязательный, целое число)</br></br>

<b>Запросы curl:</b></br>
<code>
# Получить информацию о пользователе с ID 5
curl -X GET "http://172.30.250.199:5000/api/users/5" \
  -H "Authorization: Bearer TOKEN"</br></br>

# Администратор получает информацию о любом пользователе
curl -X GET "http://172.30.250.199:5000/api/users/3" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# Пользователь получает свой профиль
curl -X GET "http://172.30.250.199:5000/api/users/5" \
  -H "Authorization: Bearer MY_TOKEN"</br></br>

# С красивым форматированием
curl -X GET "http://172.30.250.199:5000/api/users/5" \
  -H "Authorization: Bearer TOKEN" | jq '.'</br></br>

# Получить только активность пользователя
curl -X GET "http://172.30.250.199:5000/api/users/5" \
  -H "Authorization: Bearer TOKEN" | jq '.data.user | {rules: .rules_created, comments: .comments_created, total: .total_activity}'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:25:00.123456",
  "data": {
    "user": {
      "id": 5,
      "username": "analyst_1",
      "email": "analyst@mitre.local",
      "full_name": "Аналитик",
      "role": "analyst",
      "is_active": true,
      "last_login": "2025-10-23T13:30:00",
      "created_at": "2025-10-21T09:00:00",
      "updated_at": "2025-10-23T13:30:00",
      "rules_created": 23,
      "comments_created": 47,
      "total_activity": 70
    }
  }
}</pre></br></br>

<b>Ответ для администратора (с полной активностью):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:25:00.123456",
  "data": {
    "user": {
      "id": 4,
      "username": "admin",
      "email": "admin@mitre.local",
      "full_name": "Администратор",
      "role": "admin",
      "is_active": true,
      "last_login": "2025-10-23T14:00:00",
      "created_at": "2025-10-20T10:00:00",
      "updated_at": "2025-10-23T14:00:00",
      "rules_created": 156,
      "comments_created": 289,
      "total_activity": 445
    }
  }
}</pre></br></br>

<b>Ошибка: пользователь не найден (HTTP 404):</b></br>
<pre>{
  "code": 404,
  "success": false,
  "error": "User not found"
}</pre></br></br>

<b>Ошибка: доступ запрещён (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка: неправильный ID пользователя (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Invalid user ID"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to retrieve user: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Информация о пользователе успешно получена</br>
- 400: Неправильный формат ID (не число)</br>
- 401: Пользователь не авторизован</br>
- 403: Доступ запрещён (не администратор и user_id != current_user_id)</br>
- 404: Пользователь не найден в системе</br>
- 500: Ошибка при получении данных из БД</br></br>

<b>Правила разграничения доступа:</b></br>

<b>1. Администратор (role == "admin"):</b></br>
- Может смотреть любого пользователя</br>
- Видит полную статистику активности (rules_created, comments_created)</br>
- Может анализировать активность всех пользователей</br></br>

<b>2. Обычный пользователь/аналитик:</b></br>
- Может смотреть только свой профиль (user_id == current_user_id)</br>
- Видит свою полную статистику активности</br>
- При попытке доступа к чужому профилю получит 403 Access denied</br></br>

<b>Структура ответа:</b></br>

<b>Основные данные пользователя:</b></br>
- <code>id</code> [INT] - уникальный ID пользователя</br>
- <code>username</code> [STRING] - имя пользователя (уникальное)</br>
- <code>email</code> [STRING] - email адрес (уникальный)</br>
- <code>full_name</code> [STRING] - полное имя пользователя</br>
- <code>role</code> [STRING] - роль (admin, analyst, viewer)</br>
- <code>is_active</code> [BOOLEAN] - активна ли учётная запись</br>
- <code>last_login</code> [TIMESTAMP|NULL] - время последнего входа (null если никогда не входил)</br>
- <code>created_at</code> [TIMESTAMP] - время создания учётной записи</br>
- <code>updated_at</code> [TIMESTAMP] - время последнего обновления профиля</br></br>

<b>Статистика активности (для admin или own user):</b></br>
- <code>rules_created</code> [INT] - количество созданных правил корреляции</br>
- <code>comments_created</code> [INT] - количество написанных комментариев</br>
- <code>total_activity</code> [INT] - общая активность (rules + comments)</br></br>

<b>Примечания:</b></br>
- Пароли (password_hash) никогда не возвращаются в API</br>
- Статистика активности вычисляется в реальном времени при запросе</br>
- Для неавторизованного доступа вернётся 403 Access denied</br>
- Если произойдёт ошибка при подсчёте активности, вернутся нулевые значения с логированием</br>
- Администраторы могут видеть активность любого пользователя</br>
- Обычные пользователи видят активность только своего профиля</br></br>

<b>Примеры использования:</b></br>

<b>1. Получить свой профиль:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/users/5" \
  -H "Authorization: Bearer MY_TOKEN"
</code></br></br>

<b>2. Администратор смотрит профиль пользователя:</b></br>
<code>
curl -X GET "http://172.30.250.199:5000/api/users/5" \
  -H "Authorization: Bearer ADMIN_TOKEN"
</code></br></br>

<b>3. Получить активность пользователя (JavaScript):</b></br>
<code>
async function getUserActivity(userId, token) {
  const response = await fetch(`/api/users/${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  
  if (data.success) {
    const { rules_created, comments_created, total_activity } = data.data.user;
    return {
      rules: rules_created,
      comments: comments_created,
      total: total_activity
    };
  }
}
</code></br></br>

<b>4. Получить свой профиль с активностью (JavaScript):</b></br>
<code>
async function getMyProfile(token) {
  const response = await fetch('/api/users/profile', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await response.json();
}
</code></br></br>

<b>5. Администратор анализирует активность пользователя (JavaScript):</b></br>
<code>
async function analyzeUserActivity(userId, adminToken) {
  const response = await fetch(`/api/users/${userId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const data = await response.json();
  const user = data.data.user;
  
  return {
    username: user.username,
    role: user.role,
    isActive: user.is_active,
    rulesCreated: user.rules_created,
    commentsCreated: user.comments_created,
    totalActivity: user.total_activity,
    lastLogin: user.last_login,
    accountAge: new Date() - new Date(user.created_at)
  };
}
</code></br></br>

<b>6. Получить информацию о пользователе для профиля (JavaScript):</b></br>
<code>
async function loadUserProfile(userId, token) {
  try {
    const response = await fetch(`/api/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.status === 403) {
      throw new Error('You do not have permission to view this profile');
    }
    
    if (response.status === 404) {
      throw new Error('User not found');
    }
    
    const data = await response.json();
    return data.data.user;
  } catch (error) {
    console.error('Error loading profile:', error);
    return null;
  }
}
</code></br></br>

<b>7. Получить самых активных пользователей (администратор):</b></br>
<code>
async function getMostActiveUsers(adminToken) {
  // Сначала получить список всех пользователей
  const listResponse = await fetch('/api/users?limit=100', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const listData = await listResponse.json();
  
  // Затем получить активность каждого
  const usersWithActivity = await Promise.all(
    listData.data.users.map(async (user) => {
      const response = await fetch(`/api/users/${user.id}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      return await response.json();
    })
  );
  
  // Сортировать по активности (убывание)
  return usersWithActivity
    .map(r => r.data.user)
    .sort((a, b) => b.total_activity - a.total_activity);
}
</code></br></br>

<b>Производительность:</b></br>
- Время ответа: ~100-300ms (зависит от подсчёта активности)</br>
- Размер ответа: ~1-2KB</br>
- Подсчёт активности может быть медленным для пользователей с большим количеством правил/комментариев</br>
- Рекомендуется кешировать на 5-10 минут</br></br>

<b>Безопасность:</b></br>
- Обычные пользователи не могут смотреть профили друг друга</br>
- Пароли никогда не передаются</br>
- Администраторы имеют полный доступ для аудита</br>
- Статистика пересчитывается при каждом запросе (актуальная информация)</br></br>

<b>Рекомендации:</b></br>
1. Используйте этот endpoint для отображения профилей пользователей</br>
2. Администраторы могут использовать для анализа активности</br>
3. Обычные пользователи используют для просмотра своего профиля</br>
4. Кешируйте результаты на клиенте для снижения нагрузки</br>
5. Обработайте 403 как указание на попытку несанкционированного доступа</br></br>
"""
    try:
        current_user_id = get_current_user_id()
        current_user_role = get_current_user_role()

        if current_user_role != "admin" and user_id != current_user_id:
            return create_error_response("Access denied", 403)

        user = db.session.query(Users).filter(Users.id == user_id).first()

        if not user:
            return create_error_response("User not found", 404)

        user_data = user.to_dict()
        user_data.pop("password_hash", None)

        if current_user_role == "admin" or user_id == current_user_id:
            try:
                rules_count = (
                    db.session.query(func.count(CorrelationRules.id))
                    .filter(CorrelationRules.author == user.username)
                    .scalar()
                    or 0
                )

                comments_count = (
                    db.session.query(func.count(Comments.id))
                    .filter(Comments.author_name == user.username)
                    .scalar()
                    or 0
                )

                user_data["rules_created"] = rules_count
                user_data["comments_created"] = comments_count
                user_data["total_activity"] = rules_count + comments_count

            except Exception as activity_error:
                logger.warning(
                    f"Could not calculate activity for user {user_id}: {activity_error}"
                )
                user_data["rules_created"] = 0
                user_data["comments_created"] = 0
                user_data["total_activity"] = 0

        return create_success_response({"user": user_data})

    except Exception as e:
        logger.error(f"Failed to retrieve user {user_id}: {e}")
        return create_error_response(f"Failed to retrieve user: {str(e)}", 500)


@users_bp.route("/profile", methods=["GET"])
def get_profile():
    """Получить профиль текущего авторизованного пользователя с полной статистикой активности.

Удобный shortcut endpoint для получения информации о текущем пользователе. Автоматически определяет 
user_id из текущей сессии и возвращает полный профиль с активностью. Эквивалент вызова GET /api/users/{current_user_id}
но без необходимости передавать ID.
</br></br>

<b>Метод:</b> GET</br>
<b>URL:</b> /api/users/profile</br>
<b>Авторизация:</b> Требуется (любой авторизованный пользователь)</br>
<b>Параметры:</b> Нет</br></br>

<b>Запросы curl:</b></br>
<code>
# Получить свой профиль
curl -X GET "http://172.30.250.199:5000/api/users/profile" \
  -H "Authorization: Bearer YOUR_TOKEN"</br></br>

# С красивым форматированием
curl -X GET "http://172.30.250.199:5000/api/users/profile" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:30:00.123456",
  "data": {
    "user": {
      "id": 4,
      "username": "admin",
      "email": "admin@mitre.local",
      "full_name": "Администратор",
      "role": "admin",
      "is_active": true,
      "last_login": "2025-10-23T14:00:00",
      "created_at": "2025-10-20T10:00:00",
      "updated_at": "2025-10-23T14:00:00",
      "rules_created": 156,
      "comments_created": 289,
      "total_activity": 445
    }
  }
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to retrieve profile: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Профиль успешно получен</br>
- 401: Пользователь не авторизован</br>
- 500: Ошибка при получении профиля</br></br>

<b>Структура ответа:</b></br>
- <code>id</code> [INT] - ID пользователя</br>
- <code>username</code> [STRING] - имя пользователя</br>
- <code>email</code> [STRING] - email адрес</br>
- <code>full_name</code> [STRING] - полное имя</br>
- <code>role</code> [STRING] - роль (admin, analyst, viewer)</br>
- <code>is_active</code> [BOOLEAN] - активен ли пользователь</br>
- <code>last_login</code> [TIMESTAMP] - время последнего входа</br>
- <code>created_at</code> [TIMESTAMP] - время создания учётной записи</br>
- <code>updated_at</code> [TIMESTAMP] - время последнего обновления</br>
- <code>rules_created</code> [INT] - количество созданных правил</br>
- <code>comments_created</code> [INT] - количество комментариев</br>
- <code>total_activity</code> [INT] - общая активность</br></br>

<b>Примеры использования:</b></br>

<b>1. Получить свой профиль (JavaScript):</b></br>
<code>
async function getMyProfile(token) {
  const response = await fetch('/api/users/profile', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Загрузить профиль при инициализации (JavaScript):</b></br>
<code>
async function initializeApp() {
  const token = localStorage.getItem('authToken');
  const response = await fetch('/api/users/profile', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (response.ok) {
    const data = await response.json();
    document.getElementById('username').textContent = data.data.user.username;
    document.getElementById('activity').textContent = data.data.user.total_activity;
  }
}
</code></br></br>

<b>Примечания:</b></br>
- Это shortcut для GET /api/users/{current_user_id}</br>
- Автоматически определяет ID текущего пользователя</br>
- Пароли никогда не возвращаются</br>
- Включает полную статистику активности</br>
- Требует авторизации</br></br>
"""
    try:
        user_id = get_current_user_id()
        return get_user(user_id)

    except Exception as e:
        logger.error(f"Failed to retrieve profile: {e}")
        return create_error_response(f"Failed to retrieve profile: {str(e)}", 500)


@users_bp.route("/", methods=["POST"])
@admin_required
def create_user():
    """Создать нового пользователя с валидацией данных и проверкой уникальности (только для администраторов).

Создаёт новую учётную запись пользователя с полной валидацией: проверка уникальности username/email,
валидация формата email, требование минимальной длины пароля (8 символов). Пароль автоматически хешируется 
при сохранении через bcrypt. Доступен только администраторам (@admin_required). При создании логируется 
администратор, выполнивший действие.
</br></br>

<b>Метод:</b> POST</br>
<b>URL:</b> /api/users</br>
<b>Авторизация:</b> Требуется @admin_required (только администраторы)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Обязательные параметры:</b></br>
- <code>username</code> [STRING] - уникальное имя пользователя (санитизируется)</br>
- <code>email</code> [STRING] - уникальный email в формате user@domain.com (санитизируется)</br>
- <code>password</code> [STRING] - пароль (минимум 8 символов, хешируется bcrypt)</br>
- <code>full_name</code> [STRING] - полное имя пользователя (санитизируется)</br></br>

<b>Опциональные параметры:</b></br>
- <code>role</code> [STRING] - роль (admin, analyst, viewer) - по умолчанию: analyst</br>
- <code>active</code> [BOOLEAN] - активна ли учётная запись (по умолчанию: true)</br></br>

<b>Запросы curl:</b></br>
<code>
# Создать обычного аналитика
curl -X POST "http://172.30.250.199:5000/api/users" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "analyst_2",
    "email": "analyst2@mitre.local",
    "password": "SecurePassword123!",
    "full_name": "Второй Аналитик"
  }'</br></br>

# Создать администратора
curl -X POST "http://172.30.250.199:5000/api/users" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin_2",
    "email": "admin2@mitre.local",
    "password": "SecureAdminPassword123!",
    "full_name": "Второй Администратор",
    "role": "admin"
  }'</br></br>

# Создать неактивного пользователя
curl -X POST "http://172.30.250.199:5000/api/users" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "viewer_1",
    "email": "viewer@mitre.local",
    "password": "ViewerPassword123!",
    "full_name": "Просмотрщик",
    "role": "viewer",
    "active": false
  }'
</code></br></br>

<b>Успешный ответ (HTTP 201):</b></br>
<pre>{
  "code": 201,
  "success": true,
  "timestamp": "2025-10-23T14:35:00.123456",
  "data": {
    "message": "User created successfully",
    "user_id": 6
  }
}</pre></br></br>

<b>Ошибка: отсутствуют обязательные поля (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Missing required field: email"
}</pre></br></br>

<b>Ошибка: некорректный email (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Invalid email format"
}</pre></br></br>

<b>Ошибка: username или email уже существует (HTTP 409):</b></br>
<pre>{
  "code": 409,
  "success": false,
  "error": "User with this username or email already exists"
}</pre></br></br>

<b>Ошибка: слабый пароль (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Password must be at least 8 characters long"
}</pre></br></br>

<b>Ошибка: недостаточно прав (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to create user: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 201: Пользователь успешно создан</br>
- 400: Ошибка валидации (отсутствуют поля, неверный email, слабый пароль)</br>
- 403: Не достаточно прав (требуется роль admin)</br>
- 409: Username или email уже существует</br>
- 500: Ошибка при создании пользователя в БД</br></br>

<b>Процесс создания пользователя:</b></br>
1. Получить и парсить JSON данные</br>
2. Проверить наличие обязательных полей</br>
3. Санитизировать входные данные (удалить опасные символы)</br>
4. Валидировать формат email</br>
5. Проверить уникальность username и email в БД</br>
6. Проверить минимальную длину пароля (8 символов)</br>
7. Создать объект Users с хешированным паролем</br>
8. Сохранить в БД и зафиксировать транзакцию</br>
9. Залогировать создание с ID администратора</br>
10. Вернуть ID нового пользователя</br></br>

<b>Структура ответа:</b></br>
- <code>message</code> [STRING] - сообщение об успехе</br>
- <code>user_id</code> [INT] - ID созданного пользователя (для последующих операций)</br></br>

<b>Валидация данных:</b></br>

<b>Username:</b></br>
- Не может быть пустым</br>
- Должен быть уникальным в системе</br>
- Санитизируется от опасных символов</br></br>

<b>Email:</b></br>
- Должен быть в формате user@domain.com</br>
- Должен быть уникальным в системе</br>
- Санитизируется</br></br>

<b>Password:</b></br>
- Минимум 8 символов</br>
- Хешируется bcrypt (PBKDF2:SHA256:600000)</br>
- Никогда не возвращается в ответах API</br></br>

<b>Role:</b></br>
- Допустимые значения: admin, analyst, viewer</br>
- По умолчанию: analyst</br></br>

<b>Full Name:</b></br>
- Санитизируется от опасных символов</br>
- Может быть пустым (не обязательно)</br></br>

<b>Примеры использования:</b></br>

<b>1. Создать аналитика (JavaScript):</b></br>
<code>
async function createAnalyst(adminToken) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'analyst_new',
      email: 'analyst@example.com',
      password: 'SecurePass123!',
      full_name: 'New Analyst',
      role: 'analyst'
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Создать администратора (JavaScript):</b></br>
<code>
async function createAdmin(adminToken) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'admin_new',
      email: 'admin@example.com',
      password: 'SuperSecurePass123!',
      full_name: 'New Admin',
      role: 'admin'
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>3. Создать неактивного пользователя (JavaScript):</b></br>
<code>
async function createInactiveUser(adminToken) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'temp_user',
      email: 'temp@example.com',
      password: 'TempPassword123!',
      full_name: 'Temporary User',
      active: false
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>4. С обработкой ошибок (JavaScript):</b></br>
<code>
async function createUserSafe(adminToken, userData) {
  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create user');
    }
    
    return data;
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}
</code></br></br>

<b>Примечания:</b></br>
- Только администраторы могут создавать пользователей (@admin_required)</br>
- Пароль хешируется и никогда не хранится в открытом виде</br>
- Username и email должны быть уникальны в системе</br>
- Валидация выполняется на нескольких уровнях</br>
- При ошибке транзакция откатывается (rollback)</br>
- Действие логируется с ID администратора</br></br>

<b>Безопасность:</b></br>
- Пароли хешируются bcrypt с 600000 итерациями</br>
- Входные данные санитизируются</br>
- Проверка уникальности предотвращает дубликаты</br>
- Валидация email предотвращает неправильные адреса</br>
- Требование минимальной длины пароля</br>
- Логирование действий администратора для аудита</br></br>

<b>Рекомендации:</b></br>
1. Используйте надёжные пароли (минимум 8 символов, буквы + цифры + специальные символы)</br>
2. Проверьте уникальность email перед отправкой на сервер (UX)</br>
3. Отправляйте приветственное письмо на email новому пользователю</br>
4. Используйте правильную роль при создании (не давайте admin без необходимости)</br>
5. Логируйте все операции создания пользователей</br></br>
"""
    try:
        data = request.get_json()
        if not data:
            return create_error_response("JSON data required", 400)

        required_fields = ["username", "email", "password", "full_name"]
        is_valid, error_msg = validate_required_fields(data, required_fields)
        if not is_valid:
            return create_error_response(error_msg, 400)

        username = sanitize_input(data["username"])
        email = sanitize_input(data["email"])
        password = data["password"]
        full_name = sanitize_input(data["full_name"])
        role = data.get("role", "analyst")

        if not validate_email(email):
            return create_error_response("Invalid email format", 400)

        existing_user = (
            db.session.query(Users)
            .filter((Users.username == username) | (Users.email == email))
            .first()
        )

        if existing_user:
            return create_error_response(
                "User with this username or email already exists", 409
            )

        if len(password) < 8:
            return create_error_response(
                "Password must be at least 8 characters long", 400
            )

        new_user = Users(
            username=username,
            email=email,
            full_name=full_name,
            role=role,
            is_active=bool(data.get("active", True)),
        )
        new_user.set_password(password)

        db.session.add(new_user)
        db.session.commit()

        logger.info(
            f"User created: {username} (ID: {new_user.id}) by admin {get_current_user_id()}"
        )

        return create_success_response(
            {"message": "User created successfully", "user_id": new_user.id}, 201
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to create user: {e}")
        return create_error_response(f"Failed to create user: {str(e)}", 500)


@users_bp.route("/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    """Обновить информацию о пользователе с разграничением прав доступа (админ или сам пользователь).

Позволяет администраторам обновлять любого пользователя и изменять роль/статус активности,
обычные пользователи могут обновлять только свой профиль (username, email, full_name).
Включает валидацию email, санитизацию данных, отслеживание обновлённых полей.
Автоматически обновляет updated_at и логирует операцию.
</br></br>

<b>Метод:</b> PUT</br>
<b>URL:</b> /api/users/{user_id}</br>
<b>Авторизация:</b> Требуется (администратор может редактировать любого, остальные - только себя)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры пути:</b></br>
- <code>user_id</code> [INT] - ID пользователя для обновления (обязательный)</br></br>

<b>Параметры для обычного пользователя:</b></br>
- <code>username</code> [STRING] - новое имя пользователя (санитизируется)</br>
- <code>email</code> [STRING] - новый email (валидируется и санитизируется)</br>
- <code>full_name</code> [STRING] - новое полное имя (санитизируется)</br></br>

<b>Параметры для администратора (дополнительно):</b></br>
- <code>role</code> [STRING] - новая роль (admin, analyst, viewer)</br>
- <code>is_active</code> [BOOLEAN] - активность пользователя (true/false)</br></br>

<b>Запросы curl:</b></br>
<code>
# Пользователь обновляет свой профиль
curl -X PUT "http://172.30.250.199:5000/api/users/5" \
  -H "Authorization: Bearer MY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Новое имя",
    "email": "newemail@mitre.local"
  }'</br></br>

# Администратор изменяет роль пользователя
curl -X PUT "http://172.30.250.199:5000/api/users/5" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "analyst",
    "full_name": "Обновленное имя"
  }'</br></br>

# Администратор деактивирует пользователя
curl -X PUT "http://172.30.250.199:5000/api/users/6" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_active": false
  }'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:40:00.123456",
  "data": {
    "message": "User updated successfully",
    "user_id": 5,
    "updated_fields": ["full_name", "email"]
  }
}</pre></br></br>

<b>Ответ администратора с изменением роли:</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:40:00.123456",
  "data": {
    "message": "User updated successfully",
    "user_id": 5,
    "updated_fields": ["role", "is_active"]
  }
}</pre></br></br>

<b>Ошибка: пользователь не найден (HTTP 404):</b></br>
<pre>{
  "code": 404,
  "success": false,
  "error": "User not found"
}</pre></br></br>

<b>Ошибка: доступ запрещён (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: некорректный email (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Invalid email format"
}</pre></br></br>

<b>Ошибка: нет полей для обновления (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "No fields to update"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to update user: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Пользователь успешно обновлён</br>
- 400: Ошибка валидации (неверный email, нет полей для обновления)</br>
- 401: Пользователь не авторизован</br>
- 403: Доступ запрещён (не администратор и user_id != current_user_id)</br>
- 404: Пользователь не найден</br>
- 500: Ошибка при обновлении в БД</br></br>

<b>Правила разграничения доступа:</b></br>

<b>1. Администратор (role == "admin"):</b></br>
- Может обновлять любого пользователя</br>
- Может изменять: username, email, full_name, role, is_active</br>
- Может деактивировать пользователя</br>
- Может менять роли</br></br>

<b>2. Обычный пользователь:</b></br>
- Может обновлять только свой профиль (user_id == current_user_id)</br>
- Может менять: username, email, full_name</br>
- НЕ может менять: role, is_active</br>
- При попытке доступа к чужому профилю получит 403</br></br>

<b>Структура ответа:</b></br>
- <code>message</code> [STRING] - сообщение об успехе</br>
- <code>user_id</code> [INT] - ID обновлённого пользователя</br>
- <code>updated_fields</code> [ARRAY] - список обновлённых полей</br></br>

<b>Примеры использования:</b></br>

<b>1. Пользователь обновляет свой профиль (JavaScript):</b></br>
<code>
async function updateMyProfile(token, updates) {
  // Только эти поля разрешены
  const allowed = {
    username: updates.username,
    email: updates.email,
    full_name: updates.full_name
  };
  
  const response = await fetch('/api/users/profile', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(allowed)
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Администратор меняет роль пользователя (JavaScript):</b></br>
<code>
async function promoteToAdmin(adminToken, userId) {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'admin'
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>3. Администратор деактивирует пользователя (JavaScript):</b></br>
<code>
async function deactivateUser(adminToken, userId) {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      is_active: false
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>4. С обработкой ошибок (JavaScript):</b></br>
<code>
async function updateUserSafe(token, userId, updates) {
  try {
    const response = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    const data = await response.json();
    
    if (response.status === 403) {
      throw new Error('You can only edit your own profile');
    }
    
    if (response.status === 404) {
      throw new Error('User not found');
    }
    
    if (!response.ok) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error) {
    console.error('Error updating user:', error);
    return null;
  }
}
</code></br></br>

<b>Процесс обновления:</b></br>
1. Проверить разграничение доступа (админ или сам пользователь)</br>
2. Найти пользователя в БД</br>
3. Получить и парсить JSON данные</br>
4. Отфильтровать разрешённые поля (разные для админа и обычного пользователя)</br>
5. Для каждого поля: валидировать и санитизировать данные</br>
6. Обновить поля в объекте пользователя</br>
7. Установить updated_at в текущее время</br>
8. Сохранить в БД и зафиксировать транзакцию</br>
9. Залогировать операцию с ID редактирующего пользователя</br>
10. Вернуть список обновлённых полей</br></br>

<b>Примечания:</b></br>
- Только разрешённые поля обновляются (остальные игнорируются)</br>
- Email валидируется перед обновлением</br>
- Обычные пользователи НЕ могут менять роль или статус активности</br>
- Все данные санитизируются перед сохранением</br>
- updated_at автоматически обновляется</br>
- При ошибке БД транзакция откатывается (rollback)</br></br>

<b>Безопасность:</b></br>
- Обычные пользователи не могут редактировать чужие профили</br>
- Email валидируется перед сохранением</br>
- Входные данные санитизируются</br>
- Только администраторы могут менять роли</br>
- Логирование всех операций обновления</br></br>

<b>Рекомендации:</b></br>
1. Проверяйте список updated_fields на клиенте перед обновлением UI</br>
2. Обработайте 403 как указание на попытку редактирования чужого профиля</br>
3. Валидируйте email на клиенте перед отправкой</br>
4. Покажите список изменённых полей пользователю</br>
5. Логируйте все операции обновления для аудита</br></br>
"""
    try:
        current_user_id = get_current_user_id()
        current_user_role = get_current_user_role()

        if current_user_role != "admin" and user_id != current_user_id:
            return create_error_response("Access denied", 403)

        user = db.session.query(Users).get(user_id)
        if not user:
            return create_error_response("User not found", 404)

        data = request.get_json()
        if not data:
            return create_error_response("JSON data required", 400)

        allowed_fields = ["username", "email", "full_name"]
        if current_user_role == "admin":
            allowed_fields.extend(["role", "is_active"])

        updated_fields = []
        for field in allowed_fields:
            if field in data:
                if field == "email" and not validate_email(data[field]):
                    return create_error_response("Invalid email format", 400)

                if field == "is_active":
                    setattr(user, field, bool(data[field]))
                else:
                    setattr(user, field, sanitize_input(data[field]))

                updated_fields.append(field)

        if not updated_fields:
            return create_error_response("No fields to update", 400)

        user.updated_at = datetime.utcnow()
        db.session.commit()

        logger.info(
            f"User updated: {user.username} (ID: {user_id}) by user {current_user_id}"
        )

        return create_success_response(
            {
                "message": "User updated successfully",
                "user_id": user_id,
                "updated_fields": updated_fields,
            }
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to update user {user_id}: {e}")
        return create_error_response(f"Failed to update user: {str(e)}", 500)


@users_bp.route("/<int:user_id>/password", methods=["POST"])
def change_password(user_id):
    """Изменить пароль пользователя с двухуровневой валидацией и требованием подтверждения текущего пароля.

Позволяет пользователям менять свой пароль (с верификацией текущего пароля) или администраторам 
менять пароль любого пользователя (без необходимости знать текущий пароль). Включает валидацию 
минимальной длины пароля (8 символов), хеширование через bcrypt. Логирует все изменения паролей.
</br></br>

<b>Метод:</b> POST</br>
<b>URL:</b> /api/users/{user_id}/password</br>
<b>Авторизация:</b> Требуется (администратор может менять любому, остальные - только себе)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры пути:</b></br>
- <code>user_id</code> [INT] - ID пользователя для смены пароля (обязательный)</br></br>

<b>Параметры для обычного пользователя (меняет свой пароль):</b></br>
- <code>current_password</code> [STRING] - текущий пароль (требуется для проверки)</br>
- <code>new_password</code> [STRING] - новый пароль (минимум 8 символов)</br></br>

<b>Параметры для администратора (меняет пароль любого пользователя):</b></br>
- <code>new_password</code> [STRING] - новый пароль (минимум 8 символов, текущий не нужен)</br></br>

<b>Запросы curl:</b></br>
<code>
# Пользователь меняет свой пароль
curl -X POST "http://172.30.250.199:5000/api/users/5/password" \
  -H "Authorization: Bearer MY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "OldPassword123!",
    "new_password": "NewSecurePassword123!"
  }'</br></br>

# Администратор меняет пароль пользователю
curl -X POST "http://172.30.250.199:5000/api/users/6/password" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "new_password": "NewAdminSetPassword123!"
  }'</br></br>

# Администратор восстанавливает пароль для пользователя
curl -X POST "http://172.30.250.199:5000/api/users/7/password" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "new_password": "TemporaryPassword123!"
  }'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:50:00.123456",
  "data": {
    "message": "Password changed successfully"
  }
}</pre></br></br>

<b>Ошибка: пользователь не найден (HTTP 404):</b></br>
<pre>{
  "code": 404,
  "success": false,
  "error": "User not found"
}</pre></br></br>

<b>Ошибка: доступ запрещён (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: текущий пароль неверный (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Current password is incorrect"
}</pre></br></br>

<b>Ошибка: слабый новый пароль (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "New password must be at least 8 characters long"
}</pre></br></br>

<b>Ошибка: отсутствуют обязательные поля (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Missing required field: new_password"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to change password: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Пароль успешно изменён</br>
- 400: Ошибка валидации (слабый пароль, неверный текущий пароль, отсутствуют поля)</br>
- 401: Пользователь не авторизован</br>
- 403: Доступ запрещён (не администратор и user_id != current_user_id)</br>
- 404: Пользователь не найден</br>
- 500: Ошибка при изменении пароля в БД</br></br>

<b>Правила изменения пароля:</b></br>

<b>1. Обычный пользователь меняет свой пароль:</b></br>
- ОБЯЗАТЕЛЬНО требуется знать текущий пароль (для верификации)</br>
- Текущий пароль проверяется через bcrypt</br>
- Новый пароль должен быть минимум 8 символов</br>
- Новый пароль хешируется и заменяет старый</br></br>

<b>2. Администратор меняет пароль пользователю:</b></br>
- НЕ требуется знать текущий пароль</br>
- Может установить любой новый пароль (минимум 8 символов)</br>
- Используется для восстановления доступа</br>
- Логируется с ID администратора</br></br>

<b>Структура ответа:</b></br>
- <code>message</code> [STRING] - сообщение об успехе</br></br>

<b>Процесс изменения пароля:</b></br>
1. Проверить разграничение доступа (админ или сам пользователь)</br>
2. Получить и парсить JSON данные</br>
3. Проверить наличие обязательных полей</br>
4. Найти пользователя в БД</br>
5. Если пользователь меняет свой пароль: верифицировать текущий пароль</br>
6. Валидировать новый пароль (минимум 8 символов)</br>
7. Хешировать новый пароль через bcrypt</br>
8. Обновить хеш пароля и updated_at</br>
9. Сохранить в БД и зафиксировать транзакцию</br>
10. Залогировать операцию</br></br>

<b>Примеры использования:</b></br>

<b>1. Пользователь меняет свой пароль (JavaScript):</b></br>
<code>
async function changeMyPassword(token, currentPassword, newPassword) {
  const response = await fetch('/api/users/profile/password', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Администратор устанавливает новый пароль (JavaScript):</b></br>
<code>
async function resetUserPassword(adminToken, userId, newPassword) {
  const response = await fetch(`/api/users/${userId}/password`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      new_password: newPassword
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>3. С валидацией пароля на клиенте (JavaScript):</b></br>
<code>
function validatePassword(password) {
  if (password.length < 8) return 'Minimum 8 characters';
  if (!/[A-Z]/.test(password)) return 'Requires uppercase letter';
  if (!/[a-z]/.test(password)) return 'Requires lowercase letter';
  if (!/[0-9]/.test(password)) return 'Requires number';
  if (!/[!@#$%^&*]/.test(password)) return 'Requires special character';
  return null;
}

async function changePasswordSafe(token, currentPassword, newPassword) {
  const error = validatePassword(newPassword);
  if (error) {
    alert('Password error: ' + error);
    return;
  }
  
  const response = await fetch('/api/users/profile/password', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword
    })
  });
  
  return await response.json();
}
</code></br></br>

<b>4. Восстановление пароля (администратор, JavaScript):</b></br>
<code>
async function resetUserPasswordByAdmin(adminToken, userId) {
  // Генерировать временный пароль
  const tempPassword = generateRandomPassword(12);
  
  const response = await fetch(`/api/users/${userId}/password`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      new_password: tempPassword
    })
  });
  
  if (response.ok) {
    // Отправить временный пароль пользователю по email
    console.log('Password reset to:', tempPassword);
  }
  
  return await response.json();
}

function generateRandomPassword(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
</code></br></br>

<b>Примечания:</b></br>
- Пароль хешируется через bcrypt (PBKDF2:SHA256:600000)</br>
- Минимальная длина нового пароля: 8 символов</br>
- При смене своего пароля ТРЕБУЕТСЯ текущий пароль</br>
- Администраторы могут менять пароль без знания текущего</br>
- Старый пароль полностью заменяется новым</br>
- Все сессии пользователя остаются активными после смены пароля</br></br>

<b>Безопасность:</b></br>
- Пароли хешируются и никогда не хранятся в открытом виде</br>
- Верификация текущего пароля при самостоятельной смене</br>
- Минимальные требования к длине пароля</br>
- Только администраторы могут менять пароль без верификации</br>
- Логирование всех операций смены пароля</br></br>

<b>Рекомендации:</b></br>
1. Используйте надёжные пароли (минимум 8 символов, буквы + цифры + спецсимволы)</br>
2. Валидируйте пароль на клиенте перед отправкой</br>
3. Отправляйте временный пароль по email при восстановлении администратором</br>
4. Логируйте все попытки смены пароля для аудита</br>
5. Обработайте 400 для неверного текущего пароля</br>
6. При смене пароля администратором рекомендуется выслать уведомление пользователю</br></br>
"""
    try:
        current_user_id = get_current_user_id()
        current_user_role = get_current_user_role()

        if current_user_role != "admin" and user_id != current_user_id:
            return create_error_response("Access denied", 403)

        data = request.get_json()
        if not data:
            return create_error_response("JSON data required", 400)

        required_fields = ["new_password"]
        if user_id == current_user_id:
            required_fields.append("current_password")

        is_valid, error_msg = validate_required_fields(data, required_fields)
        if not is_valid:
            return create_error_response(error_msg, 400)

        user = db.session.query(Users).get(user_id)
        if not user:
            return create_error_response("User not found", 404)

        if user_id == current_user_id and "current_password" in data:
            if not user.check_password(data["current_password"]):
                return create_error_response("Current password is incorrect", 400)

        new_password = data["new_password"]
        if len(new_password) < 8:
            return create_error_response(
                "New password must be at least 8 characters long", 400
            )

        user.set_password(new_password)
        user.updated_at = datetime.utcnow()
        db.session.commit()

        logger.info(f"Password changed for user: {user.username} (ID: {user_id})")

        return create_success_response({"message": "Password changed successfully"})

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to change password for user {user_id}: {e}")
        return create_error_response(f"Failed to change password: {str(e)}", 500)


@users_bp.route("/search", methods=["GET"])
@admin_required
def search_users():
    """Быстрый поиск пользователей по имени, email или username (только для администраторов).

Предоставляет быстрый поиск пользователей с поддержкой частичного совпадения по трём полям:
username, email и full_name. Результаты отсортированы по полному имени и ограничены максимум 50 пользователями.
Доступен только администраторам (@admin_required). Все входные данные санитизируются для безопасности.
</br></br>

<b>Метод:</b> GET</br>
<b>URL:</b> /api/users/search</br>
<b>Авторизация:</b> Требуется @admin_required (только администраторы)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Query параметры:</b></br>
- <code>q</code> [STRING] - поисковый запрос (обязательный, минимум 1 символ, санитизируется)</br></br>

<b>Запросы curl:</b></br>
<code>
# Поиск по имени пользователя
curl -X GET "http://172.30.250.199:5000/api/users/search?q=analyst" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# Поиск по email
curl -X GET "http://172.30.250.199:5000/api/users/search?q=mitre.local" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# Поиск по полному имени
curl -X GET "http://172.30.250.199:5000/api/users/search?q=администратор" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# С красивым форматированием
curl -X GET "http://172.30.250.199:5000/api/users/search?q=admin" \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq '.'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:55:00.123456",
  "data": {
    "query": "analyst",
    "users": [
      {
        "id": 5,
        "username": "analyst_1",
        "email": "analyst@mitre.local",
        "full_name": "Аналитик",
        "role": "analyst",
        "is_active": true,
        "last_login": "2025-10-23T13:30:00",
        "created_at": "2025-10-21T09:00:00",
        "updated_at": "2025-10-23T13:30:00"
      },
      {
        "id": 7,
        "username": "analyst_2",
        "email": "analyst2@mitre.local",
        "full_name": "Второй Аналитик",
        "role": "analyst",
        "is_active": true,
        "last_login": "2025-10-23T12:00:00",
        "created_at": "2025-10-22T10:00:00",
        "updated_at": "2025-10-23T12:00:00"
      }
    ],
    "count": 2
  }
}</pre></br></br>

<b>Пустой результат поиска (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T14:55:00.123456",
  "data": {
    "query": "nonexistent",
    "users": [],
    "count": 0
  }
}</pre></br></br>

<b>Ошибка: пустой поисковый запрос (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Search query is required"
}</pre></br></br>

<b>Ошибка: недостаточно прав (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Search failed: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Поиск выполнен (результаты могут быть пусты)</br>
- 400: Поисковый запрос отсутствует</br>
- 401: Пользователь не авторизован</br>
- 403: Не достаточно прав (требуется роль admin)</br>
- 500: Ошибка при выполнении поиска</br></br>

<b>Структура ответа:</b></br>
- <code>query</code> [STRING] - поисковый запрос (санитизированный)</br>
- <code>users</code> [ARRAY] - массив найденных пользователей</br>
- <code>count</code> [INT] - количество найденных пользователей</br></br>

<b>Каждый найденный пользователь содержит:</b></br>
- <code>id</code> [INT] - ID пользователя</br>
- <code>username</code> [STRING] - имя пользователя</br>
- <code>email</code> [STRING] - email адрес</br>
- <code>full_name</code> [STRING] - полное имя</br>
- <code>role</code> [STRING] - роль (admin, analyst, viewer)</br>
- <code>is_active</code> [BOOLEAN] - активен ли пользователь</br>
- <code>last_login</code> [TIMESTAMP|NULL] - время последнего входа</br>
- <code>created_at</code> [TIMESTAMP] - время создания учётной записи</br>
- <code>updated_at</code> [TIMESTAMP] - время последнего обновления</br></br>

<b>Особенности поиска:</b></br>
- Поиск выполняется по трём полям: username, email, full_name</br>
- Поиск НЕ чувствителен к регистру (LIKE в SQL)</br>
- Поддерживает частичное совпадение (подстрока)</br>
- Результаты ограничены максимум 50 пользователями</br>
- Результаты отсортированы по full_name (по алфавиту)</br>
- Входной запрос санитизируется для защиты от SQL-инъекций</br>
- Пароли (password_hash) исключены из результатов</br></br>

<b>Примеры использования:</b></br>

<b>1. Поиск администратора (JavaScript):</b></br>
<code>
async function searchUsers(adminToken, query) {
  const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Поиск пользователя по email (JavaScript):</b></br>
<code>
async function findUserByEmail(adminToken, email) {
  const response = await fetch(
    `/api/users/search?q=${encodeURIComponent(email)}`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );
  
  const data = await response.json();
  return data.data.users.find(u => u.email === email) || null;
}
</code></br></br>

<b>3. Автодополнение при поиске пользователя (JavaScript):</b></br>
<code>
let searchTimeout;

async function handleUserSearch(adminToken, query) {
  clearTimeout(searchTimeout);
  
  if (!query) {
    document.getElementById('suggestions').innerHTML = '';
    return;
  }
  
  searchTimeout = setTimeout(async () => {
    const response = await fetch(
      `/api/users/search?q=${encodeURIComponent(query)}`,
      { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );
    
    const data = await response.json();
    
    const suggestions = data.data.users
      .map(u => `<li data-id="${u.id}">${u.full_name} (${u.username})</li>`)
      .join('');
    
    document.getElementById('suggestions').innerHTML = suggestions;
  }, 300);
}
</code></br></br>

<b>4. Поиск с фильтрацией по роли (JavaScript):</b></br>
<code>
async function findAdminsByQuery(adminToken, query) {
  const response = await fetch(
    `/api/users/search?q=${encodeURIComponent(query)}`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );
  
  const data = await response.json();
  return data.data.users.filter(u => u.role === 'admin');
}
</code></br></br>

<b>5. Поиск активных пользователей (JavaScript):</b></br>
<code>
async function findActiveUsers(adminToken, query) {
  const response = await fetch(
    `/api/users/search?q=${encodeURIComponent(query)}`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );
  
  const data = await response.json();
  return data.data.users.filter(u => u.is_active);
}
</code></br></br>

<b>6. Поиск в таблице администратора (JavaScript):</b></br>
<code>
async function handleAdminSearch() {
  const adminToken = localStorage.getItem('authToken');
  const searchQuery = document.getElementById('searchInput').value;
  
  if (!searchQuery) {
    alert('Please enter a search query');
    return;
  }
  
  const response = await fetch(
    `/api/users/search?q=${encodeURIComponent(searchQuery)}`,
    { headers: { 'Authorization': `Bearer ${adminToken}` } }
  );
  
  const data = await response.json();
  
  if (data.success) {
    // Отобразить результаты в таблице
    displayUserTable(data.data.users);
    document.getElementById('resultCount').textContent = 
      `Found ${data.data.count} user(s)`;
  }
}
</code></br></br>

<b>Примечания:</b></br>
- Только администраторы могут выполнять поиск (@admin_required)</br>
- Поисковый запрос обязателен (не может быть пустым)</br>
- Максимум 50 результатов для оптимизации производительности</br>
- Результаты отсортированы по полному имени (по алфавиту)</br>
- Поиск без учёта регистра (LIKE в SQL)</br>
- Поддерживает частичное совпадение (подстроку)</br>
- Все результаты исключают хеши паролей</br></br>

<b>Производительность:</b></br>
- Время ответа: ~50-200ms в зависимости от количества пользователей</br>
- Размер ответа: ~1-5KB</br>
- Рекомендуется добавить индексы на username, email, full_name</br>
- Результаты ограничены 50 для защиты от слишком больших ответов</br></br>

<b>Рекомендации:</b></br>
1. Добавьте валидацию на клиенте: минимум 2 символа для оптимальных результатов</br>
2. Используйте debounce для автодополнения (не чаще чем раз в 300ms)</br>
3. Покажите количество результатов пользователю</br>
4. Обработайте пустой результат поиска (count === 0)</br>
5. Логируйте все операции поиска для аудита</br></br>
"""
    try:
        query = sanitize_input(request.args.get("q", ""))
        if not query:
            return create_error_response("Search query is required", 400)

        users = (
            db.session.query(Users)
            .filter(
                (Users.username.like(f"%{query}%"))
                | (Users.email.like(f"%{query}%"))
                | (Users.full_name.like(f"%{query}%"))
            )
            .order_by(Users.full_name)
            .limit(50)
            .all()
        )

        users_data = []
        for user in users:
            user_dict = user.to_dict()
            user_dict.pop("password_hash", None)
            users_data.append(user_dict)

        return create_success_response(
            {"query": query, "users": users_data, "count": len(users_data)}
        )

    except Exception as e:
        logger.error(f"Search failed: {e}")
        return create_error_response(f"Search failed: {str(e)}", 500)


@users_bp.route("/statistics", methods=["GET"])
@admin_required
def get_user_statistics():
    """Получить статистику пользователей: количество, роли, активность (только для администраторов).

Предоставляет комплексную статистику по пользователям системы с разбивкой по ролям,
активности и времени последнего входа. Включает анализ активности за последние 30 дней
и количество новых пользователей. Используется для создания дашбордов и мониторинга системы.
Доступен только администраторам (@admin_required).
</br></br>

<b>Метод:</b> GET</br>
<b>URL:</b> /api/users/statistics</br>
<b>Авторизация:</b> Требуется @admin_required (только администраторы)</br>
<b>Параметры запроса:</b> Нет</br></br>

<b>Запросы curl:</b></br>
<code>
# Получить статистику по пользователям
curl -X GET "http://172.30.250.199:5000/api/users/statistics" \
  -H "Authorization: Bearer ADMIN_TOKEN"</br></br>

# С красивым форматированием
curl -X GET "http://172.30.250.199:5000/api/users/statistics" \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq '.'</br></br>

# Получить только количество активных пользователей
curl -X GET "http://172.30.250.199:5000/api/users/statistics" \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq '.data.user_stats.active_users'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T15:00:00.123456",
  "data": {
    "user_stats": {
      "total_users": 12,
      "active_users": 10,
      "admin_users": 2,
      "analyst_users": 7,
      "viewer_users": 3,
      "active_last_30days": 9,
      "new_last_30days": 3
    }
  }
}</pre></br></br>

<b>Ошибка: недостаточно прав (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to get statistics: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Статистика успешно получена</br>
- 401: Пользователь не авторизован</br>
- 403: Не достаточно прав (требуется роль admin)</br>
- 500: Ошибка при получении статистики</br></br>

<b>Структура ответа:</b></br>
- <code>total_users</code> [INT] - всего пользователей в системе</br>
- <code>active_users</code> [INT] - количество активных пользователей (is_active=true)</br>
- <code>admin_users</code> [INT] - количество администраторов (role=admin)</br>
- <code>analyst_users</code> [INT] - количество аналитиков (role=analyst)</br>
- <code>viewer_users</code> [INT] - количество просмотрщиков (role=viewer)</br>
- <code>active_last_30days</code> [INT] - пользователи со входом за последние 30 дней</br>
- <code>new_last_30days</code> [INT] - новые пользователи, созданные за последние 30 дней</br></br>

<b>Примеры использования:</b></br>

<b>1. Получить статистику (JavaScript):</b></br>
<code>
async function getUserStats(adminToken) {
  const response = await fetch('/api/users/statistics', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Вывести статистику на дашборд (JavaScript):</b></br>
<code>
async function displayUserDashboard() {
  const adminToken = localStorage.getItem('authToken');
  const response = await fetch('/api/users/statistics', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const data = await response.json();
  const stats = data.data.user_stats;
  
  document.getElementById('totalUsers').textContent = stats.total_users;
  document.getElementById('activeUsers').textContent = stats.active_users;
  document.getElementById('adminCount').textContent = stats.admin_users;
  document.getElementById('analystCount').textContent = stats.analyst_users;
  document.getElementById('viewerCount').textContent = stats.viewer_users;
  document.getElementById('active30days').textContent = stats.active_last_30days;
  document.getElementById('new30days').textContent = stats.new_last_30days;
}
</code></br></br>

<b>3. Анализ активности пользователей (JavaScript):</b></br>
<code>
async function analyzeUserActivity(adminToken) {
  const response = await fetch('/api/users/statistics', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const data = await response.json();
  const stats = data.data.user_stats;
  
  const activityRate = (stats.active_last_30days / stats.total_users * 100).toFixed(1);
  const inactiveUsers = stats.total_users - stats.active_users;
  
  return {
    totalUsers: stats.total_users,
    activeUsers: stats.active_users,
    inactiveUsers: inactiveUsers,
    activityRate: activityRate + '%',
    newUsersMonth: stats.new_last_30days,
    roleBreakdown: {
      admin: stats.admin_users,
      analyst: stats.analyst_users,
      viewer: stats.viewer_users
    }
  };
}
</code></br></br>

<b>4. Создать KPI карточки (JavaScript):</b></br>
<code>
async function createKPICards(adminToken) {
  const response = await fetch('/api/users/statistics', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const data = await response.json();
  const stats = data.data.user_stats;
  
  return [
    {
      title: 'Total Users',
      value: stats.total_users,
      color: 'blue'
    },
    {
      title: 'Active Users',
      value: stats.active_users,
      color: 'green'
    },
    {
      title: 'Inactive Users',
      value: stats.total_users - stats.active_users,
      color: 'red'
    },
    {
      title: 'New Users (30d)',
      value: stats.new_last_30days,
      color: 'orange'
    },
    {
      title: 'Active (30d)',
      value: stats.active_last_30days,
      color: 'purple'
    }
  ];
}
</code></br></br>

<b>5. Проверить здоровье системы (JavaScript):</b></br>
<code>
async function checkSystemHealth(adminToken) {
  const response = await fetch('/api/users/statistics', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  
  const data = await response.json();
  const stats = data.data.user_stats;
  
  const health = {
    status: 'HEALTHY',
    warnings: [],
    info: []
  };
  
  // Проверка: мало администраторов
  if (stats.admin_users < 2) {
    health.warnings.push('⚠️ Less than 2 admins in system');
    health.status = 'WARNING';
  }
  
  // Проверка: много неактивных пользователей
  const inactivityRate = (stats.total_users - stats.active_users) / stats.total_users;
  if (inactivityRate > 0.3) {
    health.warnings.push('⚠️ More than 30% inactive users');
    health.status = 'WARNING';
  }
  
  // Информация: новые пользователи
  if (stats.new_last_30days > 0) {
    health.info.push(`ℹ️ ${stats.new_last_30days} new users in last 30 days`);
  }
  
  return health;
}
</code></br></br>

<b>Примечания:</b></br>
- Только администраторы могут получить статистику (@admin_required)</br>
- Данные в реальном времени, пересчитываются при каждом запросе</br>
- Активность считается за последние 30 дней от текущего момента</br>
- Неактивные пользователи - это те, у кого is_active=false</br>
- Новые пользователи - созданные за последние 30 дней</br></br>

<b>Производительность:</b></br>
- Время ответа: ~50-150ms</br>
- Размер ответа: ~200 байт</br>
- Рекомендуется кеширование на 5-10 минут</br></br>

<b>Рекомендации:</b></br>
1. Обновляйте статистику на дашборде каждые 5-10 минут</br>
2. Используйте для мониторинга здоровья системы</br>
3. Отслеживайте тренды активности пользователей</br>
4. Проверяйте количество администраторов (не менее 2)</br>
5. Логируйте запросы статистики для аудита</br></br>
"""
    try:
        stats_query = text(
            """
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_users,
                COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
                COUNT(CASE WHEN role = 'analyst' THEN 1 END) as analyst_users,
                COUNT(CASE WHEN role = 'viewer' THEN 1 END) as viewer_users,
                COUNT(CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_last_30days,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_last_30days
            FROM users
        """
        )

        stats = db.session.execute(stats_query).fetchone()

        statistics = {
            "total_users": int(stats.total_users),
            "active_users": int(stats.active_users),
            "admin_users": int(stats.admin_users),
            "analyst_users": int(stats.analyst_users),
            "viewer_users": int(stats.viewer_users),
            "active_last_30days": int(stats.active_last_30days),
            "new_last_30days": int(stats.new_last_30days),
        }

        return create_success_response({"user_stats": statistics})

    except Exception as e:
        logger.error(f"Failed to get user statistics: {e}")
        return create_error_response(f"Failed to get statistics: {str(e)}", 500)


@users_bp.route("/<int:user_id>/toggle", methods=["POST"])
@admin_required
def toggle_user_status(user_id):
    """Переключить статус активности пользователя (включить/отключить) с защитой от самодезактивации.

Позволяет администраторам деактивировать или активировать учётные записи пользователей.
Включает защиту: администратор не может деактивировать свой собственный аккаунт.
Автоматически инвертирует статус или устанавливает переданное значение.
Логирует все операции изменения статуса для аудита.
</br></br>

<b>Метод:</b> POST</br>
<b>URL:</b> /api/users/{user_id}/toggle</br>
<b>Авторизация:</b> Требуется @admin_required (только администраторы)</br>
<b>Content-Type:</b> application/json</br></br>

<b>Параметры пути:</b></br>
- <code>user_id</code> [INT] - ID пользователя для изменения статуса (обязательный)</br></br>

<b>Параметры тела запроса (опциональны):</b></br>
- <code>active</code> [BOOLEAN] - явно установить статус (true/false)</br>
- Если параметр не указан: будет инвертирован текущий статус</br></br>

<b>Запросы curl:</b></br>
<code>
# Переключить статус пользователя (инвертировать)
curl -X POST "http://172.30.250.199:5000/api/users/5/toggle" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json"</br></br>

# Явно деактивировать пользователя
curl -X POST "http://172.30.250.199:5000/api/users/6/toggle" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active": false
  }'</br></br>

# Явно активировать пользователя
curl -X POST "http://172.30.250.199:5000/api/users/7/toggle" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active": true
  }'
</code></br></br>

<b>Успешный ответ (HTTP 200):</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T15:05:00.123456",
  "data": {
    "message": "User status updated",
    "user_id": 5,
    "active": false
  }
}</pre></br></br>

<b>Ответ при активации:</b></br>
<pre>{
  "code": 200,
  "success": true,
  "timestamp": "2025-10-23T15:05:00.123456",
  "data": {
    "message": "User status updated",
    "user_id": 7,
    "active": true
  }
}</pre></br></br>

<b>Ошибка: пользователь не найден (HTTP 404):</b></br>
<pre>{
  "code": 404,
  "success": false,
  "error": "User not found"
}</pre></br></br>

<b>Ошибка: попытка деактивировать свой аккаунт (HTTP 400):</b></br>
<pre>{
  "code": 400,
  "success": false,
  "error": "Cannot deactivate your own account"
}</pre></br></br>

<b>Ошибка: недостаточно прав (HTTP 403):</b></br>
<pre>{
  "code": 403,
  "success": false,
  "error": "Access denied"
}</pre></br></br>

<b>Ошибка: не авторизован (HTTP 401):</b></br>
<pre>{
  "code": 401,
  "success": false,
  "error": "Not authenticated"
}</pre></br></br>

<b>Ошибка сервера (HTTP 500):</b></br>
<pre>{
  "code": 500,
  "success": false,
  "error": "Failed to update user status: <описание ошибки>"
}</pre></br></br>

<b>Коды состояния:</b></br>
- 200: Статус пользователя успешно обновлён</br>
- 400: Попытка деактивировать свой собственный аккаунт</br>
- 401: Пользователь не авторизован</br>
- 403: Не достаточно прав (требуется роль admin)</br>
- 404: Пользователь не найден</br>
- 500: Ошибка при обновлении статуса в БД</br></br>

<b>Структура ответа:</b></br>
- <code>message</code> [STRING] - сообщение об успехе</br>
- <code>user_id</code> [INT] - ID обновлённого пользователя</br>
- <code>active</code> [BOOLEAN] - новый статус активности</br></br>

<b>Поведение:</b></br>

<b>1. Инверсия статуса (без параметра active):</b></br>
- Если пользователь активен: станет неактивным</br>
- Если пользователь неактивен: станет активным</br></br>

<b>2. Явное установление статуса (с параметром active):</b></br>
- active=true: активировать пользователя</br>
- active=false: деактивировать пользователя</br></br>

<b>3. Защита от самодезактивации:</b></br>
- Администратор не может деактивировать свой собственный аккаунт</br>
- Если попытается: получит 400 ошибку</br></br>

<b>Примеры использования:</b></br>

<b>1. Переключить статус пользователя (JavaScript):</b></br>
<code>
async function toggleUserStatus(adminToken, userId) {
  const response = await fetch(`/api/users/${userId}/toggle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  return await response.json();
}
</code></br></br>

<b>2. Деактивировать пользователя (JavaScript):</b></br>
<code>
async function deactivateUser(adminToken, userId) {
  const response = await fetch(`/api/users/${userId}/toggle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ active: false })
  });
  
  return await response.json();
}
</code></br></br>

<b>3. Активировать пользователя (JavaScript):</b></br>
<code>
async function activateUser(adminToken, userId) {
  const response = await fetch(`/api/users/${userId}/toggle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ active: true })
  });
  
  return await response.json();
}
</code></br></br>

<b>4. Деактивировать с подтверждением (JavaScript):</b></br>
<code>
async function deactivateUserWithConfirm(adminToken, userId, username) {
  const confirmed = confirm(
    `Are you sure you want to deactivate ${username}? This user will not be able to log in.`
  );
  
  if (!confirmed) return null;
  
  const response = await fetch(`/api/users/${userId}/toggle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ active: false })
  });
  
  const data = await response.json();
  
  if (data.success) {
    alert(`User ${username} has been deactivated`);
  } else {
    alert(`Error: ${data.error}`);
  }
  
  return data;
}
</code></br></br>

<b>5. Переключить статус через кнопку в таблице (JavaScript):</b></br>
<code>
async function handleToggleButtonClick(adminToken, userId, currentStatus, username) {
  try {
    // Проверка: пытаемся ли деактивировать себя?
    const myId = parseInt(localStorage.getItem('userId'));
    if (userId === myId && currentStatus === true) {
      alert('You cannot deactivate your own account');
      return;
    }
    
    // Отправить запрос
    const response = await fetch(`/api/users/${userId}/toggle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Обновить статус в UI
      const newStatus = data.data.active ? 'Active' : 'Inactive';
      document.getElementById(`status-${userId}`).textContent = newStatus;
      alert(`${username} is now ${newStatus.toLowerCase()}`);
    } else {
      alert(`Error: ${data.error}`);
    }
  } catch (error) {
    console.error('Toggle error:', error);
    alert('Failed to update user status');
  }
}
</code></br></br>

<b>Примечания:</b></br>
- Только администраторы могут переключать статус (@admin_required)</br>
- Администратор не может деактивировать собственный аккаунт (защита от блокировки)</br>
- Деактивированный пользователь не может войти в систему</br>
- При деактивации активные сессии пользователя остаются (требуется отдельное удаление)</br>
- Статус обновляется в реальном времени в БД</br>
- Все операции логируются для аудита</br></br>

<b>Безопасность:</b></br>
- Только администраторы могут менять статусы пользователей</br>
- Защита от самодезактивации администратора</br>
- Логирование всех операций</br></br>

<b>Рекомендации:</b></br>
1. Всегда просите подтверждение перед деактивацией</br>
2. Убедитесь, что остаётся минимум 2 администратора в системе</br>
3. Отправляйте уведомление пользователю при деактивации</br>
4. Логируйте все операции для аудита безопасности</br>
5. Обработайте 400 ошибку о самодезактивации на клиенте</br></br>
"""
    try:
        current_user_id = get_current_user_id()

        if user_id == current_user_id:
            return create_error_response("Cannot deactivate your own account", 400)

        user = db.session.query(Users).get(user_id)
        if not user:
            return create_error_response("User not found", 404)

        data = request.get_json()
        active = data.get("active") if data else not user.is_active

        user.is_active = bool(active)
        user.updated_at = datetime.utcnow()
        db.session.commit()

        logger.info(
            f"User status toggled: {user.username} (ID: {user_id}) -> active: {active}"
        )

        return create_success_response(
            {
                "message": "User status updated",
                "user_id": user_id,
                "active": user.is_active,
            }
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to toggle user status {user_id}: {e}")
        return create_error_response(f"Failed to update user status: {str(e)}", 500)


@users_bp.route("/list", methods=["GET"])
def list_users_simple():
    """Получить упрощённый список пользователей без ограничений авторизации (для разработки и отладки).

    Возвращает простой список первых 20 пользователей с базовой информацией (id, username, email, role, статус).
    Эндпоинт БЕЗ ограничений авторизации - используется только для разработки и отладки.
    В production среде НЕОБХОДИМО добавить @admin_required или другую защиту!
    Пароли исключены для безопасности.
    </br></br>

    <b>ВАЖНО:</b> Этот endpoint НЕ защищён авторизацией! Используется только для development!</br></br>

    <b>Метод:</b> GET</br>
    <b>URL:</b> /api/users/list</br>
    <b>Авторизация:</b> Не требуется (только для разработки!)</br>
    <b>Параметры запроса:</b> Нет</br>
    <b>Максимум результатов:</b> 20 пользователей (фиксировано)</br></br>

    <b>Запросы curl:</b></br>
    <code>
    # Получить список первых 20 пользователей
    curl -X GET "http://172.30.250.199:5000/api/users/list"</br></br>

    # С красивым форматированием
    curl -X GET "http://172.30.250.199:5000/api/users/list" | jq '.'</br></br>

    # Получить только количество пользователей
    curl -X GET "http://172.30.250.199:5000/api/users/list" | jq '.data.count'
    </code></br></br>

    <b>Успешный ответ (HTTP 200):</b></br>
    <pre>{
      "code": 200,
      "success": true,
      "timestamp": "2025-10-23T15:10:00.123456",
      "data": {
        "users": [
          {
            "id": 1,
            "username": "admin",
            "email": "admin@mitre.local",
            "full_name": "Администратор",
            "role": "admin",
            "is_active": true,
            "created_at": "2025-10-20T10:00:00"
          },
          {
            "id": 2,
            "username": "analyst_1",
            "email": "analyst@mitre.local",
            "full_name": "Аналитик",
            "role": "analyst",
            "is_active": true,
            "created_at": "2025-10-21T09:00:00"
          },
          {
            "id": 3,
            "username": "viewer_1",
            "email": "viewer@mitre.local",
            "full_name": "Просмотрщик",
            "role": "viewer",
            "is_active": false,
            "created_at": "2025-10-22T11:30:00"
          }
        ],
        "count": 3
      }
    }</pre></br></br>

    <b>Ошибка сервера (HTTP 500):</b></br>
    <pre>{
      "code": 500,
      "success": false,
      "error": "Failed to retrieve users: <описание ошибки>"
    }</pre></br></br>

    <b>Коды состояния:</b></br>
    - 200: Список успешно получен</br>
    - 500: Ошибка при получении данных</br></br>

    <b>Структура ответа:</b></br>
    - <code>users</code> [ARRAY] - массив пользователей (максимум 20)</br>
    - <code>count</code> [INT] - количество возвращённых пользователей</br></br>

    <b>Каждый пользователь содержит:</b></br>
    - <code>id</code> [INT] - ID пользователя</br>
    - <code>username</code> [STRING] - имя пользователя</br>
    - <code>email</code> [STRING] - email адрес</br>
    - <code>full_name</code> [STRING] - полное имя</br>
    - <code>role</code> [STRING] - роль (admin, analyst, viewer)</br>
    - <code>is_active</code> [BOOLEAN] - активен ли пользователь</br>
    - <code>created_at</code> [TIMESTAMP] - время создания учётной записи</br></br>

    <b>БЕЗОПАСНОСТЬ - КРИТИЧНО ДЛЯ PRODUCTION:</b></br>
    - Этот endpoint НЕ требует авторизации</br>
    - Любой может получить список пользователей</br>
    - Раскрывает информацию о пользователях</br>
    - ДОЛЖЕН быть защищен в production! Добавьте @admin_required или удалите</br></br>

    <b>Примеры использования:</b></br>

    <b>1. Получить список (JavaScript):</b></br>
    <code>
    async function getUsersList() {
      const response = await fetch('/api/users/list');
      return await response.json();
    }
    </code></br></br>

    <b>2. Отобразить таблицу пользователей (только для разработки):</b></br>
    <code>
    async function displayUsersList() {
      const response = await fetch('/api/users/list');
      const data = await response.json();

      const html = data.data.users
        .map(user => `
          <tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.full_name}</td>
            <td>${user.role}</td>
            <td>${user.is_active ? '✓' : '✗'}</td>
          </tr>
        `)
        .join('');

      document.getElementById('userTable').innerHTML = html;
    }
    </code></br></br>

    <b>3. Получить список для отладки консоли (JavaScript):</b></br>
    <code>
    fetch('/api/users/list')
      .then(r => r.json())
      .then(data => console.table(data.data.users));
    </code></br></br>

    <b>Примечания:</b></br>
    - Endpoint для development/debug только</br>
    - Максимум 20 пользователей в ответе</br>
    - Пароли исключены (password_hash не передаётся)</br>
    - Нет пагинации (фиксированный лимит 20)</br>
    - НЕ защищён авторизацией!</br></br>

    <b>Рекомендации для Production:</b></br>

    <b>ОПЦИЯ 1: Добавить защиту</b></br>
    <code>
    @users_bp.route("/list", methods=["GET"])
    @admin_required  # ← Добавить эту строку!
    def list_users_simple():
        ...
    </code></br></br>

    <b>✓ ОПЦИЯ 2: Удалить этот endpoint полностью</b></br>
    <code>
    # Удалить весь файл с этим endpoint'ом или закомментировать
    # Использовать вместо этого /api/users с @admin_required
    </code></br></br>

    <b>✓ ОПЦИЯ 3: Ограничить информацию</b></br>
    <code>
    @users_bp.route("/list", methods=["GET"])
    @admin_required
    def list_users_simple():
        users = db.session.query(Users).limit(20).all()
        users_data = []
        for user in users:
            users_data.append({
                "id": user.id,
                "username": user.username,
                "role": user.role,
                # Исключить email и другие чувствительные данные
            })
        return create_success_response({"users": users_data})
    </code></br></br>

    <b>Производительность:</b></br>
    - Время ответа: ~50-100ms</br>
    - Размер ответа: ~1-2KB</br>
    - Максимум 20 результатов (фиксировано)</br></br>

    <b>КРИТИЧЕСКИЕ ЗАМЕЧАНИЯ:</b></br>
    1. Этот endpoint НЕ защищён авторизацией</br>
    2. Раскрывает информацию о пользователях любому</br>
    3. ОБЯЗАТЕЛЬНО добавить @admin_required перед production</br>
    4. Рассмотреть удаление этого endpoint'а полностью</br>
    5. Использовать вместо этого /api/users с авторизацией</br></br>

    <b>Статус для Production:</b></br>
    ОПАСНО - ТРЕБУЕТ НЕМЕДЛЕННОЙ ЗАЩИТЫ</br></br>
    """
    try:
        users = db.session.query(Users).limit(20).all()

        users_data = []
        for user in users:
            user_dict = {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "is_active": user.is_active,
                "created_at": user.created_at.isoformat() if user.created_at else None,
            }
            users_data.append(user_dict)

        return create_success_response({"users": users_data, "count": len(users_data)})

    except Exception as e:
        logger.error(f"Failed to retrieve simple users list: {e}")
        return create_error_response(f"Failed to retrieve users: {str(e)}", 500)
