"""
========================================
CONFIGURATION MODULE - FIXED VERSION
========================================
Централизованная конфигурация приложения
с поддержкой переменных окружения

@version 2.0.0-FIXED
@date 2025-10-22
"""

import os
from datetime import timedelta
from dotenv import load_dotenv

# Загружаем переменные окружения из .env
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
    print(f"✅ Файл .env загружен: {env_path}")
else:
    print(f"⚠️  Файл .env не найден: {env_path}")


class Config:
    """Базовая конфигурация"""

    # ========================================
    # ОСНОВНЫЕ НАСТРОЙКИ
    # ========================================
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    DEBUG = os.getenv("DEBUG", "False").lower() == "true"
    TESTING = False

    # ========================================
    # БАЗА ДАННЫХ
    # ========================================
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv(
        "DB_PASSWORD", "NI3bhjBtCUXphjqfZb9sHGKtoH7YDd/vIWkanz8EaQs="
    )
    DB_NAME = os.getenv("DB_NAME", "mitre_attack_matrix")

    # Строка подключения SQLAlchemy
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        "?charset=utf8mb4&use_unicode=1"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 10,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
        "max_overflow": 20,
        "echo": False,
    }

    # ========================================
    # БЕЗОПАСНОСТЬ И АУТЕНТИФИКАЦИЯ
    # ========================================
    SESSION_SECRET_KEY = os.getenv("SECRET_KEY", SECRET_KEY)
    SESSION_TOKEN_EXPIRES_HOURS = int(os.getenv("SESSION_TOKEN_EXPIRES_HOURS", "24"))
    SESSION_TOKEN_REMEMBER_DAYS = int(os.getenv("SESSION_TOKEN_REMEMBER_DAYS", "30"))

    # Пароли
    PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", "8"))
    PASSWORD_REQUIRE_UPPERCASE = (
        os.getenv("PASSWORD_REQUIRE_UPPERCASE", "True").lower() == "true"
    )
    PASSWORD_REQUIRE_LOWERCASE = (
        os.getenv("PASSWORD_REQUIRE_LOWERCASE", "True").lower() == "true"
    )
    PASSWORD_REQUIRE_DIGITS = (
        os.getenv("PASSWORD_REQUIRE_DIGITS", "True").lower() == "true"
    )
    PASSWORD_REQUIRE_SPECIAL = (
        os.getenv("PASSWORD_REQUIRE_SPECIAL", "False").lower() == "true"
    )

    # ========================================
    # CORS
    # ========================================
    CORS_ENABLED = os.getenv("CORS_ENABLED", "True").lower() == "true"
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
    CORS_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    CORS_ALLOW_HEADERS = ["Content-Type", "Authorization", "X-Requested-With"]
    CORS_SUPPORTS_CREDENTIALS = True

    # ========================================
    # СЕРВЕР
    # ========================================
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "5000"))

    # ========================================
    # ЛОГИРОВАНИЕ
    # ========================================
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE = os.getenv("LOG_FILE", "logs/app.log")
    LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", "10485760"))  # 10MB
    LOG_BACKUP_COUNT = int(os.getenv("LOG_BACKUP_COUNT", "5"))

    # ========================================
    # API
    # ========================================
    API_VERSION = "13.0.0"
    API_TITLE = "MITRE ATT&CK Matrix API"
    API_DESCRIPTION = "REST API для работы с MITRE ATT&CK Framework"

    # Лимиты API
    API_RATE_LIMIT_ENABLED = (
        os.getenv("API_RATE_LIMIT_ENABLED", "False").lower() == "true"
    )
    API_RATE_LIMIT = os.getenv("API_RATE_LIMIT", "100/minute")

    # Пагинация
    API_DEFAULT_PAGE_SIZE = int(os.getenv("API_DEFAULT_PAGE_SIZE", "20"))
    API_MAX_PAGE_SIZE = int(os.getenv("API_MAX_PAGE_SIZE", "100"))

    # ========================================
    # UPLOADS
    # ========================================
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", "16777216"))  # 16MB
    ALLOWED_EXTENSIONS = {"json", "csv", "xlsx", "txt"}

    # ========================================
    # КЭШИРОВАНИЕ
    # ========================================
    CACHE_ENABLED = os.getenv("CACHE_ENABLED", "False").lower() == "true"
    CACHE_TYPE = os.getenv("CACHE_TYPE", "simple")
    CACHE_DEFAULT_TIMEOUT = int(os.getenv("CACHE_DEFAULT_TIMEOUT", "300"))

    # Redis (если используется)
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # ========================================
    # ДОПОЛНИТЕЛЬНО
    # ========================================
    TIMEZONE = os.getenv("TIMEZONE", "Europe/Moscow")
    LANGUAGE = os.getenv("LANGUAGE", "ru")

    @staticmethod
    def init_app(app):
        """Инициализация приложения с конфигурацией"""
        # Создаём необходимые директории
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(os.path.dirname(Config.LOG_FILE), exist_ok=True)


class DevelopmentConfig(Config):
    """Конфигурация для разработки"""

    DEBUG = True
    TESTING = False


class ProductionConfig(Config):
    """Конфигурация для продакшена"""

    DEBUG = False
    TESTING = False

    # Более строгие настройки безопасности
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    @staticmethod
    def init_app(app):
        Config.init_app(app)

        # Проверяем наличие критичных переменных
        if Config.SECRET_KEY == "dev-secret-key-change-in-production":
            print("⚠️  WARNING: Using default SECRET_KEY in production!")


class TestingConfig(Config):
    """Конфигурация для тестирования"""

    TESTING = True
    DEBUG = True

    # Используем отдельную тестовую БД
    DB_NAME = os.getenv("TEST_DB_NAME", "mitre_attack_matrix_test")
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{Config.DB_USER}:{Config.DB_PASSWORD}@"
        f"{Config.DB_HOST}:{Config.DB_PORT}/{DB_NAME}"
        "?charset=utf8mb4&use_unicode=1"
    )


# ========================================
# ЭКСПОРТ КОНФИГУРАЦИЙ
# ========================================
config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}

# Получаем текущее окружение
current_env = os.getenv("FLASK_ENV", "production")
CurrentConfig = config.get(current_env, ProductionConfig)

# Для обратной совместимости с app.py
__all__ = [
    "Config",
    "DevelopmentConfig",
    "ProductionConfig",
    "TestingConfig",
    "config",
    "CurrentConfig",
]
