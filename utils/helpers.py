"""
Utility helper functions for Flask MITRE ATT&CK API
COMPLETE VERSION with all required functions
"""

import json
import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from functools import wraps
from flask import request, jsonify, current_app, g
import jwt
from werkzeug.security import generate_password_hash
import re
import ipaddress


# ========================================
# AUDIT LOGGING
# ========================================


def log_audit_event(
    event_type,
    description,
    user_id=None,
    username=None,
    ip_address=None,
    entity_type=None,
    entity_id=None,
    status="success",
    details=None,
):
    """
    Логирование аудит-события

    Args:
        event_type (str): Тип события (login, create, update, delete, view, etc.)
        description (str): Описание события
        user_id (int, optional): ID пользователя
        username (str, optional): Имя пользователя
        ip_address (str, optional): IP-адрес
        entity_type (str, optional): Тип сущности
        entity_id (str, optional): ID сущности
        status (str, optional): Статус (success, error, warning)
        details (dict, optional): Дополнительные детали

    Returns:
        bool: True если успешно залогировано
    """
    try:
        # Получаем IP-адрес если не передан
        if ip_address is None:
            ip_address = get_client_ip()

        # Получаем данные пользователя из request если не переданы
        if user_id is None or username is None:
            current_user = getattr(request, "current_user", None)
            if current_user:
                user_id = current_user.get("id") or current_user.get("user_id")
                username = current_user.get("username") or current_user.get("full_name")

        # Пытаемся залогировать в базу данных
        try:
            from models import db, AuditLog

            audit = AuditLog(
                event_type=event_type,
                description=description,
                user_id=user_id,
                username=username,
                ip_address=ip_address,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id else None,
                status=status,
                details=json.dumps(details) if details else None,
                created_at=datetime.utcnow(),
            )

            db.session.add(audit)
            db.session.commit()

        except ImportError:
            # Если модели не доступны, логируем в файл
            log_to_file(event_type, description, user_id, username, ip_address, details)

        return True

    except Exception as e:
        print(f"⚠️ Error logging audit event: {e}")
        # Fallback логирование
        try:
            log_to_file(event_type, description, user_id, username, ip_address, details)
        except:
            pass
        return False


def log_to_file(
    event_type, description, user_id=None, username=None, ip_address=None, details=None
):
    """Fallback логирование в файл"""
    try:
        import os

        log_dir = "logs"
        os.makedirs(log_dir, exist_ok=True)

        log_file = os.path.join(log_dir, "audit.log")
        timestamp = datetime.utcnow().isoformat()

        log_entry = {
            "timestamp": timestamp,
            "event_type": event_type,
            "description": description,
            "user_id": user_id,
            "username": username,
            "ip_address": ip_address,
            "details": details,
        }

        with open(log_file, "a") as f:
            f.write(json.dumps(log_entry) + "\n")
    except:
        pass


# ========================================
# ID GENERATION
# ========================================


def generate_unique_id(prefix="", length=32):
    """Generate unique ID with optional prefix"""
    unique_id = secrets.token_hex(length // 2)
    if prefix:
        return f"{prefix}_{unique_id}"
    return unique_id


def generate_audit_id():
    """Generate audit log ID"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    unique = secrets.token_hex(4)
    random_num = secrets.randbelow(9999)
    return f"audit_{timestamp}_{unique}_{random_num:04d}"


def generate_request_id():
    """Generate request ID"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    unique = secrets.token_hex(4)
    return f"req_{timestamp}_{unique}"


# ========================================
# INPUT SANITIZATION
# ========================================


def sanitize_input(data):
    """Sanitize input data"""
    if data is None:
        return None

    if isinstance(data, str):
        # Remove null bytes
        data = data.replace("\x00", "")
        # Basic HTML/script tag removal
        data = re.sub(r"<[^>]*>", "", data)
        # Remove potentially dangerous characters
        data = re.sub(r'[<>"\'&]', "", data)
        return data.strip()

    elif isinstance(data, dict):
        return {key: sanitize_input(value) for key, value in data.items()}

    elif isinstance(data, list):
        return [sanitize_input(item) for item in data]

    return data


# ========================================
# VALIDATION
# ========================================


def validate_email(email):
    """Validate email format"""
    if not email:
        return False

    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None


def validate_ip_address(ip):
    """Validate IP address"""
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False


def validate_uuid(uuid_string):
    """
    Validate UUID format

    Args:
        uuid_string (str): UUID string to validate

    Returns:
        bool: True if valid UUID
    """
    if not uuid_string:
        return False

    try:
        # Try to parse as UUID
        uuid_obj = uuid.UUID(str(uuid_string))
        # Check if string representation matches
        return str(uuid_obj) == str(uuid_string).lower()
    except (ValueError, AttributeError, TypeError):
        return False


def validate_required_fields(data, required_fields):
    """Validate that required fields are present in data"""
    missing_fields = []

    for field in required_fields:
        if field not in data or data[field] is None or data[field] == "":
            missing_fields.append(field)

    if missing_fields:
        return False, f"Missing required fields: {', '.join(missing_fields)}"

    return True, None


def validate_date_format(date_string, format="%Y-%m-%d"):
    """Validate date string format"""
    try:
        datetime.strptime(date_string, format)
        return True
    except ValueError:
        return False


def validate_enum_value(value, enum_values, default=None):
    """Validate enum value"""
    if value in enum_values:
        return value
    return default


# ========================================
# REQUEST HELPERS
# ========================================


def get_client_ip():
    """Get client IP address from request"""
    # Check for CloudFlare
    if request.headers.get("CF-Connecting-IP"):
        return request.headers.get("CF-Connecting-IP")

    # Check for real IP
    if request.headers.get("X-Real-IP"):
        return request.headers.get("X-Real-IP")

    # Check for forwarded for
    if request.headers.get("X-Forwarded-For"):
        ips = request.headers.get("X-Forwarded-For").split(",")
        return ips[0].strip()

    # Check for client IP
    if request.headers.get("X-Client-IP"):
        return request.headers.get("X-Client-IP")

    return request.remote_addr or "0.0.0.0"


def get_user_agent():
    """Get user agent from request"""
    return request.headers.get("User-Agent", "Unknown")


# ========================================
# JSON HELPERS
# ========================================


def parse_json_field(json_field, default=None):
    """Parse JSON field safely"""
    if json_field is None or json_field == "":
        return default

    if isinstance(json_field, (list, dict)):
        return json_field

    try:
        decoded = json.loads(json_field)
        return decoded if decoded is not None else default
    except (json.JSONDecodeError, TypeError):
        return default


def is_valid_json(json_string):
    """Check if string is valid JSON"""
    try:
        json.loads(json_string)
        return True
    except (json.JSONDecodeError, TypeError):
        return False


# ========================================
# RESPONSE HELPERS
# ========================================


def create_success_response(data=None, code=200, meta=None):
    """Create standardized success response"""
    response = {
        "success": True,
        "code": code,
        "data": data,
        "timestamp": datetime.utcnow().isoformat(),
    }

    if meta:
        response["meta"] = meta

    return jsonify(response), code


def create_error_response(message, code=500, details=None):
    """Create standardized error response"""
    response = {
        "success": False,
        "error": {
            "message": message,
            "code": code,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }

    if details:
        response["error"]["details"] = details

    return jsonify(response), code


# ========================================
# FORMATTING HELPERS
# ========================================


def format_bytes(bytes_value, precision=2):
    """Format bytes to human readable format"""
    if bytes_value == 0:
        return "0 B"

    units = ["B", "KB", "MB", "GB", "TB"]
    unit_index = 0

    while bytes_value >= 1024 and unit_index < len(units) - 1:
        bytes_value /= 1024
        unit_index += 1

    return f"{bytes_value:.{precision}f} {units[unit_index]}"


def time_ago(timestamp):
    """Get time ago string from timestamp"""
    if not timestamp:
        return "Never"

    try:
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

        now = datetime.now(timezone.utc)
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)

        diff = now - timestamp

        if diff.days > 7:
            return timestamp.strftime("%Y-%m-%d")
        elif diff.days > 0:
            return f"{diff.days} days ago"
        elif diff.seconds > 3600:
            hours = diff.seconds // 3600
            return f"{hours} hours ago"
        elif diff.seconds > 60:
            minutes = diff.seconds // 60
            return f"{minutes} minutes ago"
        else:
            return "Just now"

    except Exception:
        return "Unknown"


# ========================================
# UTILITY FUNCTIONS
# ========================================


def clamp_value(value, min_val, max_val):
    """Clamp value between min and max"""
    return max(min_val, min(max_val, value))


def calculate_risk_score(level, event_type):
    """Calculate risk score based on level and event type"""
    base_scores = {
        "CRITICAL": 10.0,
        "SECURITY": 8.5,
        "ERROR": 6.0,
        "WARN": 4.0,
        "INFO": 2.0,
        "DEBUG": 1.0,
    }

    type_modifiers = {
        "security": 1.5,
        "login": 1.3,
        "admin": 1.4,
        "delete": 1.2,
        "export": 1.1,
    }

    base_score = base_scores.get(level.upper(), 1.0)

    modifier = 1.0
    for keyword, mult in type_modifiers.items():
        if keyword.lower() in event_type.lower():
            modifier = mult
            break

    return round(base_score * modifier, 2)


def escape_like_pattern(string):
    """Escape special characters for SQL LIKE pattern"""
    return string.replace("%", "\\%").replace("_", "\\_")


def get_current_timestamp():
    """Get current timestamp in ISO format"""
    return datetime.utcnow().isoformat()


def clean_dict(data, remove_none=True, remove_empty_strings=True):
    """Clean dictionary by removing None values and empty strings"""
    if not isinstance(data, dict):
        return data

    cleaned = {}
    for key, value in data.items():
        if remove_none and value is None:
            continue
        if remove_empty_strings and value == "":
            continue

        if isinstance(value, dict):
            cleaned[key] = clean_dict(value, remove_none, remove_empty_strings)
        else:
            cleaned[key] = value

    return cleaned


# ========================================
# AUTHENTICATION HELPERS
# ========================================


def hash_password(password):
    """Hash password using werkzeug"""
    return generate_password_hash(password, method="pbkdf2:sha256")


def generate_jwt_token(user_id, role, expires_in=None):
    """Generate JWT token for user"""
    if expires_in is None:
        expires_in = current_app.config.get("JWT_ACCESS_TOKEN_EXPIRES")

    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.utcnow() + expires_in if expires_in else datetime.utcnow(),
        "iat": datetime.utcnow(),
    }

    secret_key = current_app.config.get("JWT_SECRET_KEY", "dev-secret-key")
    return jwt.encode(payload, secret_key, algorithm="HS256")


def verify_jwt_token(token):
    """Verify and decode JWT token"""
    try:
        secret_key = current_app.config.get("JWT_SECRET_KEY", "dev-secret-key")
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def requires_auth(f):
    """Decorator to require authentication"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get("Authorization")

        if not token:
            return create_error_response("Authorization header missing", 401)

        if token.startswith("Bearer "):
            token = token[7:]

        payload = verify_jwt_token(token)
        if not payload:
            return create_error_response("Invalid or expired token", 401)

        g.current_user_id = payload["user_id"]
        g.current_user_role = payload["role"]

        return f(*args, **kwargs)

    return decorated_function


def requires_role(required_role):
    """Decorator to require specific role"""

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(g, "current_user_role"):
                return create_error_response("Authentication required", 401)

            role_hierarchy = {"viewer": 0, "analyst": 1, "admin": 2}

            user_level = role_hierarchy.get(g.current_user_role, -1)
            required_level = role_hierarchy.get(required_role, 999)

            if user_level < required_level:
                return create_error_response(f"Role {required_role} required", 403)

            return f(*args, **kwargs)

        return decorated_function

    return decorator


# ========================================
# DATABASE HELPERS
# ========================================


def log_to_db(level, message, source, user_id=None, ip=None):
    """Log message to database"""
    try:
        from models import db, SystemLogs

        log_entry = SystemLogs(
            level=level,
            source=source,
            message=message,
            user_id=user_id,
            ip=ip or get_client_ip(),
        )

        db.session.add(log_entry)
        db.session.commit()

    except Exception as e:
        # Fallback to application logger
        current_app.logger.error(f"Failed to log to database: {str(e)}")


def paginate_query(query, page=1, per_page=50):
    """Paginate SQLAlchemy query"""
    per_page = clamp_value(per_page, 1, 1000)
    page = max(1, page)

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "items": items,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "pages": (total + per_page - 1) // per_page,
            "has_prev": page > 1,
            "has_next": page * per_page < total,
        },
    }
