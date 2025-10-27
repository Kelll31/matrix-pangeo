"""
========================================
AUTHENTICATION UTILITIES - SESSION TOKEN
========================================
Модуль аутентификации на основе session tokens
БЕЗ JWT - только проверка через базу данных

@version 6.1.0-SESSION-FIX
@date 2025-10-22

ИСПРАВЛЕННАЯ ВЕРСИЯ - Правильно работает с session tokens
"""

from functools import wraps
from flask import request, jsonify, g
import os
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import logging
import traceback

# ========================================
# КОНСТАНТЫ
# ========================================
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")

logger = logging.getLogger(__name__)


# ========================================
# ДЕКОРАТОРЫ АУТЕНТИФИКАЦИИ
# ========================================


def login_required(f):
    """
    ✅ Декоратор для защиты эндпоинтов, требующих аутентификации
    Проверяет session token через БД (user_sessions таблица)

    Usage:
        @app.route('/api/protected')
        @login_required
        def protected_route():
            return jsonify({'message': 'Success'})

    Authorization: Bearer <token>
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization")

        logger.debug(
            f"🔍 Checking auth header: {auth_header[:50] if auth_header else 'NONE'}..."
        )

        # ========================================
        # ЭТАП 1: Парсинг токена из заголовка
        # ========================================
        if auth_header:
            try:
                parts = auth_header.split()

                if len(parts) == 2 and parts[0].lower() == "bearer":
                    token = parts[
                        1
                    ].strip()  # ✅ ДОБАВЛЕНО: strip() для удаления пробелов
                    logger.debug(f"✅ Bearer token extracted: {token[:20]}...")
                else:
                    token = auth_header.strip()  # Fallback: может быть просто токен
                    logger.warning(
                        f"⚠️ Authorization header not in 'Bearer <token>' format, trying as token"
                    )

            except Exception as e:
                logger.error(f"❌ Error parsing auth header: {e}")
                logger.error(traceback.format_exc())
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": "Invalid authorization header format",
                            "details": str(e),
                        }
                    ),
                    401,
                )

        if not token:
            logger.warning("❌ Authorization token is missing")
            return (
                jsonify({"success": False, "error": "Authorization token is missing"}),
                401,
            )

        # ========================================
        # ЭТАП 2: Проверка токена в БД
        # ========================================
        try:
            from models.database import db, UserSessions, Users

            logger.debug(f"🔍 Looking up session token in DB: {token[:20]}...")

            # Ищем активную сессию с этим токеном
            session_obj = UserSessions.query.filter_by(
                session_token=token, is_active=True
            ).first()

            if not session_obj:
                logger.warning(f"❌ Session not found for token: {token[:20]}...")

                # Диагностика: проверим, существует ли токен вообще
                any_session = UserSessions.query.filter_by(session_token=token).first()
                if any_session:
                    logger.warning(
                        f"  ⚠️ Token exists but is_active={any_session.is_active}"
                    )
                else:
                    logger.warning(f"  ⚠️ Token does not exist in database at all")

                return (
                    jsonify({"success": False, "error": "Invalid or expired token"}),
                    401,
                )

            logger.debug(
                f"✅ Session found: ID={session_obj.id}, User={session_obj.user_id}"
            )

            # ========================================
            # ЭТАП 3: Проверка срока действия
            # ========================================
            try:
                expires_at = session_obj.expires_at
                current_time = datetime.now()

                logger.debug(f"⏰ Current time: {current_time}")
                logger.debug(f"⏰ Expires at: {expires_at}")

                if current_time > expires_at:
                    logger.warning(
                        f"❌ Session expired at {expires_at} (current: {current_time})"
                    )
                    session_obj.is_active = False
                    db.session.commit()
                    return (
                        jsonify({"success": False, "error": "Token has expired"}),
                        401,
                    )

            except Exception as e:
                logger.error(f"❌ Error checking expiration: {e}")
                logger.error(traceback.format_exc())
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": "Token validation failed",
                            "details": str(e),
                        }
                    ),
                    401,
                )

            # ========================================
            # ЭТАП 4: Получение пользователя
            # ========================================
            try:
                user = Users.query.get(session_obj.user_id)

                if not user:
                    logger.error(f"❌ User not found: {session_obj.user_id}")
                    return jsonify({"success": False, "error": "User not found"}), 401

                logger.debug(f"✅ User found: {user.username}")

                if not user.is_active:
                    logger.warning(f"❌ User account is inactive: {user.username}")
                    return (
                        jsonify(
                            {"success": False, "error": "User account is inactive"}
                        ),
                        403,
                    )

            except Exception as e:
                logger.error(f"❌ Error getting user: {e}")
                logger.error(traceback.format_exc())
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": "User lookup failed",
                            "details": str(e),
                        }
                    ),
                    401,
                )

            # ========================================
            # ЭТАП 5: Установление контекста
            # ========================================
            try:
                g.user_id = user.id
                g.user = user
                g.username = user.username
                g.role = user.role
                g.user_role = user.role  # Для совместимости со старым кодом
                g.session_id = session_obj.id
                g.session_token = token

                logger.debug(
                    f"✅ User authenticated: {user.username} (role: {user.role})"
                )

            except Exception as e:
                logger.error(f"❌ Error setting context: {e}")
                logger.error(traceback.format_exc())
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": "Context setup failed",
                            "details": str(e),
                        }
                    ),
                    401,
                )

            # ========================================
            # ЭТАП 6: Обновление времени активности
            # ========================================
            try:
                session_obj.last_activity = datetime.now()
                db.session.commit()
                logger.debug(f"✅ Updated last_activity for user {user.username}")

            except Exception as e:
                logger.error(f"❌ Error updating last_activity: {e}")
                logger.error(traceback.format_exc())
                # Не возвращаем ошибку - пусть запрос выполняется, но логируем

            # ========================================
            # ЭТАП 7: Выполнение защищённой функции
            # ========================================
            logger.debug(f"✅ All auth checks passed, executing {f.__name__}")
            return f(*args, **kwargs)

        except ImportError as e:
            logger.error(f"❌ Import error (models not found): {e}")
            logger.error(traceback.format_exc())
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Database initialization failed",
                        "details": str(e),
                    }
                ),
                500,
            )

        except Exception as e:
            logger.error(f"❌ Unexpected authentication error: {type(e).__name__}: {e}")
            logger.error(traceback.format_exc())
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Authentication failed",
                        "details": str(e),
                        "error_type": type(e).__name__,
                    }
                ),
                401,
            )

    return decorated_function


def optional_auth(f):
    """
    ✅ Декоратор для эндпоинтов с опциональной аутентификацией
    Если токен предоставлен - проверяет его, если нет - продолжает без аутентификации

    Usage:
        @app.route('/api/public-or-private')
        @optional_auth
        def mixed_route():
            if hasattr(g, 'user'):
                return jsonify({'message': 'Authenticated', 'user': g.username})
            return jsonify({'message': 'Anonymous'})
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization")

        if auth_header:
            try:
                # ✅ ИСПРАВЛЕННЫЙ ПАРСИНГ
                parts = auth_header.split()
                if len(parts) == 2 and parts[0].lower() == "bearer":
                    token = parts[1]
                else:
                    token = auth_header
            except:
                pass

        if token:
            try:
                from models.database import db, UserSessions, Users

                session = UserSessions.query.filter_by(
                    session_token=token, is_active=True
                ).first()

                if session and datetime.now() <= session.expires_at:
                    user = Users.query.get(session.user_id)
                    if user and user.is_active:
                        g.user_id = user.id
                        g.user = user
                        g.username = user.username
                        g.role = user.role
                        g.user_role = user.role  # Для совместимости
                        g.session_id = session.id

                        # Обновляем активность
                        session.last_activity = datetime.now()
                        db.session.commit()
            except:
                pass

        # Устанавливаем дефолтные значения если не авторизован
        if not hasattr(g, "user_id"):
            g.user_id = None
            g.user = None
            g.username = None
            g.role = None
            g.user_role = None

        return f(*args, **kwargs)

    return decorated_function


def admin_required(f):
    """
    ✅ Декоратор для эндпоинтов, требующих права администратора

    Usage:
        @app.route('/api/admin/users')
        @admin_required
        def admin_users():
            return jsonify({'users': []})
    """

    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        # login_required уже выполнен, g.user_role должен быть установлен
        user_role = getattr(g, "role", None) or getattr(g, "user_role", None)

        if user_role != "admin":
            return (
                jsonify(
                    {"success": False, "error": "Administrator privileges required"}
                ),
                403,
            )

        return f(*args, **kwargs)

    return decorated_function


def require_role(*allowed_roles):
    """
    ✅ Декоратор для защиты эндпоинтов по ролям

    Args:
        *allowed_roles: Список разрешённых ролей

    Usage:
        @app.route('/api/analysts-only')
        @require_role('admin', 'analyst')
        def analysts_route():
            return jsonify({'message': 'Welcome analyst'})
    """

    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            # login_required уже выполнен
            user_role = getattr(g, "role", None) or getattr(g, "user_role", None)

            if user_role not in allowed_roles and user_role != "admin":
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": f'Required role: {", ".join(allowed_roles)}',
                        }
                    ),
                    403,
                )

            return f(*args, **kwargs)

        return decorated_function

    return decorator


# ========================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ========================================


def get_current_user():
    """
    Получить текущего пользователя из Flask g

    Returns:
        Users or None: Объект пользователя или None если не аутентифицирован
    """
    return getattr(g, "user", None)


def get_current_user_id():
    """
    Получить ID текущего пользователя

    Returns:
        int or None: ID пользователя или None если не аутентифицирован
    """
    return getattr(g, "user_id", None)


def get_current_user_role():
    """
    Получить роль текущего пользователя

    Returns:
        str or None: Роль пользователя или None если не аутентифицирован
    """
    return getattr(g, "role", None) or getattr(g, "user_role", None)


def get_current_username():
    """
    Получить username текущего пользователя

    Returns:
        str or None: Username или None если не аутентифицирован
    """
    return getattr(g, "username", None)


# Алиас для совместимости
def get_current_user_name():
    """Алиас для get_current_username()"""
    return get_current_username()


def authenticate_request():
    """
    Аутентифицировать текущий запрос (вручную)

    Returns:
        Users or None: Объект пользователя или None
    """
    token = extract_token_from_request()

    if not token:
        return None

    try:
        from models.database import db, UserSessions, Users

        session = UserSessions.query.filter_by(
            session_token=token, is_active=True
        ).first()

        if session and datetime.now() <= session.expires_at:
            user = Users.query.get(session.user_id)
            if user and user.is_active:
                return user
    except:
        pass

    return None


def extract_token_from_request():
    """
    ✅ Извлечь токен из текущего запроса

    Returns:
        str or None: Токен или None
    """
    auth_header = request.headers.get("Authorization")

    if not auth_header:
        return None

    try:
        # ✅ ПРАВИЛЬНЫЙ ПАРСИНГ
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1]  # ← parts[1] это токен!
        return auth_header  # Fallback
    except Exception:
        return None


# ========================================
# ФУНКЦИИ РАБОТЫ С ПАРОЛЯМИ
# ========================================


def hash_password(password):
    """
    Хэширование пароля с использованием Werkzeug

    Args:
        password (str): Пароль в открытом виде

    Returns:
        str: Хэшированный пароль
    """
    return generate_password_hash(password, method="pbkdf2:sha256:600000")


def verify_password(password, hashed_password):
    """
    Проверка пароля

    Args:
        password (str): Пароль в открытом виде
        hashed_password (str): Хэшированный пароль

    Returns:
        bool: True если пароль совпадает
    """
    try:
        return check_password_hash(hashed_password, password)
    except Exception as e:
        logger.error(f"❌ Password verification error: {e}")
        return False


def validate_password(
    password,
    min_length=8,
    require_uppercase=True,
    require_lowercase=True,
    require_digits=True,
    require_special=False,
):
    """
    Валидация пароля по заданным правилам

    Args:
        password (str): Пароль для проверки
        min_length (int): Минимальная длина пароля
        require_uppercase (bool): Требовать заглавные буквы
        require_lowercase (bool): Требовать строчные буквы
        require_digits (bool): Требовать цифры
        require_special (bool): Требовать специальные символы

    Returns:
        tuple: (bool, str) - (валиден ли пароль, сообщение об ошибке)
    """
    if not password:
        return False, "Password is required"

    if len(password) < min_length:
        return False, f"Password must be at least {min_length} characters"

    if require_uppercase and not any(c.isupper() for c in password):
        return False, "Password must contain uppercase letter"

    if require_lowercase and not any(c.islower() for c in password):
        return False, "Password must contain lowercase letter"

    if require_digits and not any(c.isdigit() for c in password):
        return False, "Password must contain digit"

    if require_special:
        special_chars = "!@#$%^&*()_+-=[]{}|;:',.<>?/"
        if not any(c in special_chars for c in password):
            return False, "Password must contain special character"

    return True, "Valid"


# ========================================
# УПРАВЛЕНИЕ СЕССИЯМИ
# ========================================


def create_session(user_id, ip_address=None, user_agent=None, remember=False):
    """
    Создать новую сессию для пользователя

    Args:
        user_id (int): ID пользователя
        ip_address (str): IP адрес
        user_agent (str): User-Agent браузера
        remember (bool): Продлить сессию (30 дней вместо 24 часов)

    Returns:
        str: Session token
    """
    import secrets
    from models.database import db, UserSessions

    # Генерируем уникальный токен (43 байта = ~57 символов base64)
    session_token = secrets.token_urlsafe(43)

    # Определяем время жизни
    if remember:
        expires_in = 30 * 24 * 60 * 60  # 30 дней
    else:
        expires_in = 24 * 60 * 60  # 24 часа

    expires_at = datetime.now() + timedelta(seconds=expires_in)

    # Создаем запись в БД
    session = UserSessions(
        user_id=user_id,
        session_token=session_token,
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
        is_active=True,
    )

    db.session.add(session)
    db.session.commit()

    logger.info(f"✅ Session created for user {user_id}: {session_token[:20]}...")

    return session_token


def revoke_session(session_token):
    """
    Отозвать (деактивировать) сессию

    Args:
        session_token (str): Session token для отзыва

    Returns:
        bool: True если успешно
    """
    try:
        from models.database import db, UserSessions

        session = UserSessions.query.filter_by(session_token=session_token).first()
        if session:
            session.is_active = False
            db.session.commit()
            logger.info(f"✅ Session revoked: {session_token[:20]}...")
            return True
    except Exception as e:
        logger.error(f"❌ Failed to revoke session: {e}")

    return False


def revoke_all_user_sessions(user_id):
    """
    Отозвать все сессии пользователя (logout everywhere)

    Args:
        user_id (int): ID пользователя

    Returns:
        int: Количество отозванных сессий
    """
    try:
        from models.database import db, UserSessions

        count = UserSessions.query.filter_by(user_id=user_id, is_active=True).update(
            {"is_active": False}
        )

        db.session.commit()
        logger.info(f"✅ Revoked {count} sessions for user {user_id}")
        return count
    except Exception as e:
        logger.error(f"❌ Failed to revoke user sessions: {e}")
        return 0


def cleanup_expired_sessions():
    """
    Очистить истёкшие сессии из БД

    Returns:
        int: Количество удалённых сессий
    """
    try:
        from models.database import db, UserSessions

        count = UserSessions.query.filter(
            UserSessions.expires_at < datetime.now()
        ).delete()

        db.session.commit()
        logger.info(f"✅ Cleaned up {count} expired sessions")
        return count
    except Exception as e:
        logger.error(f"❌ Failed to cleanup sessions: {e}")
        return 0


# ========================================
# ЭКСПОРТ
# ========================================
__all__ = [
    # Декораторы
    "login_required",
    "optional_auth",
    "admin_required",
    "require_role",
    # Получение текущего пользователя
    "get_current_user",
    "get_current_user_id",
    "get_current_user_role",
    "get_current_username",
    "get_current_user_name",
    "authenticate_request",
    "extract_token_from_request",
    # Работа с паролями
    "hash_password",
    "verify_password",
    "validate_password",
    # Управление сессиями
    "create_session",
    "revoke_session",
    "revoke_all_user_sessions",
    "cleanup_expired_sessions",
]
