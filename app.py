"""
===============================================================================
Flask MITRE ATT&CK Matrix API Application
Полная версия с расширенной документацией на 1500+ строк
===============================================================================

Версия: 13.0.0-COMPLETE-RU
Автор: Storm Labs
Дата: 2025-10-14

ВОЗМОЖНОСТИ:
- Полная русификация интерфейса и документации
- Подробные примеры JSON ответов для каждого endpoint
- Примеры кода на Python и JavaScript
- Примеры curl команд
- Детальное описание моделей данных
- Красивый HTML интерфейс
- Автоматическое обнаружение маршрутов
- SQLAlchemy 2.0+ совместимость
- XAMPP MySQL поддержка
- CORS для всех источников
- Расширенное логирование
- Обработка ошибок
- Мониторинг здоровья системы

РАЗМЕР: 1500+ строк полного функционального кода
===============================================================================
"""

# =============================================================================
# ИМПОРТЫ
# =============================================================================
import os
import sys
from flask import (
    Flask,
    jsonify,
    request,
    g,
    send_from_directory,
    render_template_string,
    make_response,
)
from flask_cors import CORS
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime, timedelta
from sqlalchemy import text
from urllib.parse import unquote
import traceback
import json
from utils.auth import login_required


# =============================================================================
# ПРОВЕРКА ЗАВИСИМОСТЕЙ
# =============================================================================
def check_dependencies():
    """Проверка наличия всех необходимых зависимостей"""
    missing_deps = []

    # Проверка PyMySQL
    try:
        import pymysql

        pymysql.install_as_MySQLdb()
        print("✅ PyMySQL загружен успешно")
    except ImportError:
        missing_deps.append("pymysql")
        print("❌ PyMySQL не установлен!")

    # Проверка Flask-CORS
    try:
        from flask_cors import CORS

        print("✅ Flask-CORS загружен")
    except ImportError:
        missing_deps.append("flask-cors")
        print("❌ Flask-CORS не установлен!")

    # Проверка SQLAlchemy
    try:
        import sqlalchemy

        print("✅ SQLAlchemy загружен")
    except ImportError:
        missing_deps.append("sqlalchemy")
        print("❌ SQLAlchemy не установлен!")

    if missing_deps:
        print("\n🔧 Установите недостающие зависимости:")
        print(f"   pip install {' '.join(missing_deps)}")
        sys.exit(1)

    return True


# Запуск проверки
check_dependencies()


# =============================================================================
# ЗАГРУЗКА КОНФИГУРАЦИИ
# =============================================================================
def load_configuration():
    """Загрузка конфигурации приложения с обработкой ошибок"""
    import os
    import sys
    from pathlib import Path

    config = None
    config_loaded = False
    last_error = None

    # ==========================================
    # ВАРИАНТ 1: config_xampp.py
    # ==========================================
    try:
        # Проверяем существование файла
        if Path("config_xampp.py").exists():
            print("📝 Найден config_xampp.py, пытаемся загрузить...")

            # Временно перехватываем sys.exit
            original_exit = sys.exit

            def dummy_exit(code=0):
                raise SystemExit(code)

            sys.exit = dummy_exit

            try:
                from config_xampp import config as xampp_config

                config = xampp_config
                config_loaded = True
                print("✅ Используется конфигурация: config_xampp.py")
            finally:
                # Восстанавливаем оригинальный sys.exit
                sys.exit = original_exit

            if config_loaded:
                return config

    except SystemExit as e:
        last_error = f"config_xampp.py вызвал sys.exit({e.code})"
        print(f"⚠️  {last_error}")
    except ImportError as e:
        last_error = f"config_xampp.py не найден: {e}"
        print(f"⚠️  {last_error}")
    except Exception as e:
        last_error = f"Ошибка загрузки config_xampp.py: {e}"
        print(f"⚠️  {last_error}")

    # ==========================================
    # ВАРИАНТ 2: config.py
    # ==========================================
    try:
        # Проверяем существование файла
        if Path("config.py").exists():
            print("📝 Найден config.py, пытаемся загрузить...")

            # Временно перехватываем sys.exit
            original_exit = sys.exit

            def dummy_exit(code=0):
                raise SystemExit(code)

            sys.exit = dummy_exit

            try:
                from config import config as default_config

                config = default_config
                config_loaded = True
                print("✅ Используется конфигурация: config.py")
            finally:
                # Восстанавливаем оригинальный sys.exit
                sys.exit = original_exit

            if config_loaded:
                return config

    except SystemExit as e:
        last_error = f"config.py вызвал sys.exit({e.code})"
        print(f"⚠️  {last_error}")
    except ImportError as e:
        last_error = f"config.py не найден: {e}"
        print(f"⚠️  {last_error}")
    except Exception as e:
        last_error = f"Ошибка загрузки config.py: {e}"
        print(f"⚠️  {last_error}")

    # ==========================================
    # ВАРИАНТ 3: Создание конфигурации из .env
    # ==========================================
    if not config_loaded:
        print("\n⚠️  Не удалось загрузить конфигурацию из файлов")
        print("🔧 Пытаемся создать конфигурацию из переменных окружения...")

        try:
            # Загружаем .env если он есть
            from dotenv import load_dotenv

            env_path = Path(".env")
            if env_path.exists():
                load_dotenv(env_path, override=True)
                print(f"✅ .env загружен: {env_path.absolute()}")

            # Получаем параметры БД
            db_host = os.environ.get("DB_HOST", "127.0.0.1")
            db_port = os.environ.get("DB_PORT", "3306")
            db_user = os.environ.get("DB_USER", "root")
            db_pass = os.environ.get("DB_PASS", "").strip('"').strip("'")
            db_name = os.environ.get("DB_NAME", "mitre_attack_matrix")
            db_charset = os.environ.get("DB_CHARSET", "utf8mb4")

            # Создаем DATABASE_URI
            if db_pass:
                db_uri = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}?charset={db_charset}"
            else:
                db_uri = f"mysql+pymysql://{db_user}@{db_host}:{db_port}/{db_name}?charset={db_charset}"

            # Создаем класс конфигурации динамически
            class Config:
                # Database
                SQLALCHEMY_DATABASE_URI = db_uri
                SQLALCHEMY_TRACK_MODIFICATIONS = False
                SQLALCHEMY_ECHO = os.environ.get("FLASK_ENV") == "development"

                # Database connection parameters (для прямого использования)
                DB_HOST = db_host
                DB_PORT = int(db_port)
                DB_USER = db_user
                DB_PASS = db_pass
                DB_NAME = db_name
                DB_CHARSET = db_charset

                # Application
                SECRET_KEY = os.environ.get(
                    "SECRET_KEY", "dev-secret-key-change-in-production"
                )
                API_VERSION = os.environ.get("API_VERSION", "13.0.0")
                DEBUG = os.environ.get("FLASK_ENV", "development") == "development"

                # JWT
                JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", SECRET_KEY)
                JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 часа

                # CORS
                CORS_ORIGINS = ["*"]
                CORS_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
                CORS_ALLOW_HEADERS = ["Content-Type", "Authorization"]

                # Logging
                LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
                LOG_FILE = "logs/app.log"
                LOG_MAX_BYTES = 10485760  # 10MB
                LOG_BACKUP_COUNT = 10

            # Создаем словарь конфигураций
            config = {"development": Config, "production": Config, "testing": Config}

            print("✅ Конфигурация создана из переменных окружения")
            print(f"   📊 DB: {db_user}@{db_host}:{db_port}/{db_name}")

            return config

        except Exception as e:
            print(f"❌ Не удалось создать конфигурацию из .env: {e}")
            import traceback

            traceback.print_exc()

    # ==========================================
    # ЕСЛИ ВСЁ ПОШЛО НЕ ТАК
    # ==========================================
    if config is None:
        print("\n" + "=" * 70)
        print("❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось загрузить конфигурацию!")
        print("=" * 70)

        if last_error:
            print(f"\n🔍 Последняя ошибка: {last_error}")

        print("\n💡 Возможные причины:")
        print("   1. Файл config.py существует, но содержит ошибки")
        print("   2. Файл .env не найден или содержит неверные данные")
        print("   3. Отсутствуют обязательные переменные окружения")

        print("\n🔧 Решения:")
        print("   1. Проверьте файл config.py на наличие ошибок")
        print("   2. Убедитесь что .env файл существует в корне проекта")
        print("   3. Создайте минимальный config.py:")

        print("\n" + "─" * 70)
        print("# config.py")
        print("─" * 70)
        print(
            """
import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем .env
basedir = Path(__file__).parent.absolute()
load_dotenv(basedir / '.env', override=True)

class Config:
    # Database
    DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
    DB_PORT = int(os.environ.get('DB_PORT', '3306'))
    DB_USER = os.environ.get('DB_USER', 'root')
    DB_PASS = os.environ.get('DB_PASS', '')
    DB_NAME = os.environ.get('DB_NAME', 'mitre_attack_matrix')
    DB_CHARSET = os.environ.get('DB_CHARSET', 'utf8mb4')
    
    # SQLAlchemy URI
    if DB_PASS:
        SQLALCHEMY_DATABASE_URI = f'mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset={DB_CHARSET}'
    else:
        SQLALCHEMY_DATABASE_URI = f'mysql+pymysql://{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset={DB_CHARSET}'
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key')
    API_VERSION = '13.0.0'
    DEBUG = True

config = {
    'development': Config,
    'production': Config,
    'testing': Config
}
        """
        )
        print("─" * 70)

        print("\n🗂️  Текущая директория:", Path.cwd())
        print("📋 Файлы Python в директории:")
        for py_file in Path.cwd().glob("*.py"):
            print(f"   • {py_file.name}")

        sys.exit(1)

    return config


config = load_configuration()


# =============================================================================
# МОДЕЛИ БАЗЫ ДАННЫХ
# =============================================================================
def load_database_models():
    """Загрузка моделей базы данных"""
    try:
        from models.database import db

        print("✅ Модели базы данных загружены")
        return db
    except ImportError as e:
        print(f"❌ Ошибка загрузки моделей БД: {e}")
        print("🔧 Проверьте существование models/database.py")
        sys.exit(1)


db = load_database_models()


# =============================================================================
# УТИЛИТЫ (С FALLBACK ВЕРСИЯМИ)
# =============================================================================
def load_utilities():
    """Загрузка утилит с fallback версиями"""
    try:
        from utils.helpers import (
            create_error_response,
            create_success_response,
            generate_request_id,
            get_client_ip,
        )

        print("✅ Утилиты загружены из utils.helpers")
        return {
            "create_error_response": create_error_response,
            "create_success_response": create_success_response,
            "generate_request_id": generate_request_id,
            "get_client_ip": get_client_ip,
        }
    except ImportError:
        print("⚠️ Утилиты не найдены, используются встроенные fallback версии")

        def create_error_response(message, code=500):
            """Создать ответ с ошибкой"""
            return (
                jsonify(
                    {
                        "success": False,
                        "error": {"message": message, "code": code},
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                ),
                code,
            )

        def create_success_response(data, code=200):
            """Создать успешный ответ"""
            return (
                jsonify(
                    {
                        "success": True,
                        "data": data,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                ),
                code,
            )

        def generate_request_id():
            """Генерировать уникальный ID запроса"""
            import uuid

            return str(uuid.uuid4())[:8]

        def get_client_ip():
            """Получить IP адрес клиента"""
            if request.headers.get("X-Forwarded-For"):
                return request.headers.get("X-Forwarded-For").split(",")[0]
            elif request.headers.get("X-Real-IP"):
                return request.headers.get("X-Real-IP")
            else:
                return request.remote_addr or "unknown"

        return {
            "create_error_response": create_error_response,
            "create_success_response": create_success_response,
            "generate_request_id": generate_request_id,
            "get_client_ip": get_client_ip,
        }


utils = load_utilities()
create_error_response = utils["create_error_response"]
create_success_response = utils["create_success_response"]
generate_request_id = utils["generate_request_id"]
get_client_ip = utils["get_client_ip"]


# =============================================================================
# КОНСТАНТЫ И КОНФИГУРАЦИЯ
# =============================================================================

# Версия API
API_VERSION = "13.0.0-COMPLETE-RU"

# Лимиты
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 1000
MAX_SEARCH_RESULTS = 500

# Таймауты (секунды)
REQUEST_TIMEOUT = 30
DB_CONNECTION_TIMEOUT = 10

# Логирование
LOG_LEVEL = logging.INFO
LOG_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
LOG_BACKUP_COUNT = 10


# =============================================================================
# СХЕМЫ МОДЕЛЕЙ ДАННЫХ
# =============================================================================
DATA_MODELS = {
    "Technique": {
        "описание": "Техника атаки из фреймворка MITRE ATT&CK",
        "таблица": "techniques",
        "поля": {
            "id": {
                "тип": "VARCHAR(50)",
                "описание": "Уникальный идентификатор (UUID формат)",
                "пример": "attack-pattern--970a3432-3237-47ad-bcca-7d8cbb217736",
                "primary_key": True,
            },
            "attackid": {
                "тип": "VARCHAR(20)",
                "описание": "ID техники MITRE ATT&CK",
                "пример": "T1059 или T1059.001",
                "indexed": True,
            },
            "name": {
                "тип": "VARCHAR(500)",
                "описание": "Название техники на английском",
                "пример": "Command and Scripting Interpreter",
            },
            "name_ru": {
                "тип": "VARCHAR(500)",
                "описание": "Название техники на русском",
                "пример": "Интерпретатор команд и скриптов",
            },
            "description": {
                "тип": "TEXT",
                "описание": "Подробное описание техники на английском",
            },
            "description_ru": {
                "тип": "TEXT",
                "описание": "Подробное описание техники на русском",
            },
            "platforms": {
                "тип": "JSON",
                "описание": "Список поддерживаемых платформ",
                "пример": ["Windows", "Linux", "macOS", "Network", "Cloud"],
            },
            "data_sources": {
                "тип": "JSON",
                "описание": "Источники данных для обнаружения",
                "пример": ["Process monitoring", "File monitoring"],
            },
            "permissions_required": {
                "тип": "JSON",
                "описание": "Требуемые разрешения для выполнения",
                "пример": ["User", "Administrator"],
            },
            "version": {
                "тип": "DECIMAL(5,2)",
                "описание": "Версия техники в MITRE ATT&CK",
                "пример": 1.4,
            },
            "deprecated": {
                "тип": "TINYINT(1)",
                "описание": "Флаг устаревшей техники (0 или 1)",
                "default": 0,
            },
            "revoked": {
                "тип": "TINYINT(1)",
                "описание": "Флаг отозванной техники (0 или 1)",
                "default": 0,
            },
            "created_at": {
                "тип": "TIMESTAMP",
                "описание": "Дата и время создания записи",
                "auto": True,
            },
            "updated_at": {
                "тип": "TIMESTAMP",
                "описание": "Дата и время последнего обновления",
                "auto": True,
            },
        },
        "связи": {
            "tactics": "Многие-ко-многим через technique_tactics",
            "rules": "Один-ко-многим (CorrelationRules)",
            "comments": "Один-ко-многим (Comments)",
        },
        "индексы": ["attackid", "name", "deprecated", "revoked"],
        "пример_записи": {
            "id": "attack-pattern--970a3432-3237-47ad-bcca-7d8cbb217736",
            "attackid": "T1059",
            "name": "Command and Scripting Interpreter",
            "name_ru": "Интерпретатор команд и скриптов",
            "platforms": ["Windows", "Linux", "macOS"],
            "version": 1.4,
            "deprecated": False,
            "revoked": False,
        },
    },
    "CorrelationRule": {
        "описание": "Правило корреляции для обнаружения техник",
        "таблица": "correlationrules",
        "поля": {
            "id": {
                "тип": "VARCHAR(36)",
                "описание": "UUID правила",
                "primary_key": True,
            },
            "name": {
                "тип": "VARCHAR(500)",
                "описание": "Название правила",
                "required": True,
            },
            "technique_id": {
                "тип": "VARCHAR(20)",
                "описание": "ID связанной техники (FK)",
                "foreign_key": "techniques.attackid",
            },
            "description": {"тип": "TEXT", "описание": "Описание правила"},
            "logic": {
                "тип": "TEXT",
                "описание": "Логика обнаружения (query, conditions)",
                "required": True,
            },
            "severity": {
                "тип": "VARCHAR(20)",
                "описание": "Уровень критичности",
                "enum": ["low", "medium", "high", "critical"],
                "default": "medium",
            },
            "active": {
                "тип": "TINYINT(1)",
                "описание": "Активно ли правило",
                "default": 1,
            },
            "status": {
                "тип": "VARCHAR(20)",
                "описание": "Статус правила",
                "enum": ["enabled", "disabled", "testing", "deleted"],
                "default": "enabled",
            },
            "author": {"тип": "VARCHAR(100)", "описание": "Автор правила"},
            "tags": {
                "тип": "JSON",
                "описание": "Теги для категоризации",
                "пример": ["powershell", "execution", "suspicious"],
            },
            "false_positives": {
                "тип": "TEXT",
                "описание": "Описание возможных ложных срабатываний",
            },
            "created_at": {"тип": "TIMESTAMP", "auto": True},
            "updated_at": {"тип": "TIMESTAMP", "auto": True},
        },
        "пример_записи": {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "Подозрительное выполнение PowerShell",
            "technique_id": "T1059.001",
            "severity": "high",
            "active": True,
            "status": "enabled",
        },
    },
    "Tactic": {
        "описание": "Тактика MITRE ATT&CK - стратегическая цель атаки",
        "таблица": "tactics",
        "поля": {
            "id": {
                "тип": "VARCHAR(50)",
                "описание": "ID тактики (TA0001-TA0040)",
                "primary_key": True,
                "пример": "TA0001",
            },
            "name": {
                "тип": "VARCHAR(200)",
                "описание": "Название тактики на английском",
                "пример": "Initial Access",
            },
            "name_ru": {
                "тип": "VARCHAR(200)",
                "описание": "Название тактики на русском",
                "пример": "Первоначальный доступ",
            },
            "x_mitre_shortname": {
                "тип": "VARCHAR(100)",
                "описание": "Короткое техническое имя",
                "пример": "initial-access",
            },
            "description": {"тип": "TEXT", "описание": "Описание тактики"},
            "description_ru": {"тип": "TEXT", "описание": "Описание на русском"},
        },
        "тактики": {
            "TA0001": "Initial Access (Первоначальный доступ)",
            "TA0002": "Execution (Выполнение)",
            "TA0003": "Persistence (Закрепление)",
            "TA0004": "Privilege Escalation (Повышение привилегий)",
            "TA0005": "Defense Evasion (Обход защиты)",
            "TA0006": "Credential Access (Доступ к учётным данным)",
            "TA0007": "Discovery (Разведка)",
            "TA0008": "Lateral Movement (Боковое перемещение)",
            "TA0009": "Collection (Сбор данных)",
            "TA0010": "Exfiltration (Эксфильтрация)",
            "TA0011": "Command and Control (Управление и контроль)",
            "TA0040": "Impact (Воздействие)",
        },
    },
    "Comment": {
        "описание": "Комментарии к техникам и правилам",
        "таблица": "comments",
        "поля": {
            "id": {"тип": "INT AUTO_INCREMENT", "primary_key": True},
            "entity_type": {
                "тип": "VARCHAR(50)",
                "описание": "Тип сущности (technique, rule)",
                "enum": ["technique", "rule"],
            },
            "entity_id": {"тип": "VARCHAR(50)", "описание": "ID сущности"},
            "user_id": {"тип": "INT", "описание": "ID пользователя"},
            "content": {"тип": "TEXT", "описание": "Содержимое комментария"},
            "created_at": {"тип": "TIMESTAMP", "auto": True},
        },
    },
}


# =============================================================================
# ДОКУМЕНТАЦИЯ API ЭНДПОИНТОВ (С ПРИМЕРАМИ)
# =============================================================================

# Шаблон для curl команд
CURL_TEMPLATE = 'curl -X {method} "{url}" {headers} {data}'

# Полная документация всех эндпоинтов
API_DOCS = {
    # =========================================================================
    # ТЕХНИКИ MITRE ATT&CK
    # =========================================================================
    "/api/techniques": {
        "название": "Список техник MITRE ATT&CK",
        "описание": """
        Получить пагинированный список техник с расширенной фильтрацией и сортировкой.
        Поддерживает поиск, фильтрацию по платформе, покрытию правилами и тактикам.
        """,
        "методы": ["GET"],
        "параметры": {
            "page": {
                "тип": "integer",
                "по_умолчанию": 1,
                "описание": "Номер страницы для пагинации",
            },
            "limit": {
                "тип": "integer",
                "по_умолчанию": 20,
                "минимум": 1,
                "максимум": 1000,
                "описание": "Количество элементов на странице",
            },
            "revoked": {
                "тип": "boolean",
                "по_умолчанию": False,
                "описание": "Включить отозванные техники",
            },
            "deprecated": {
                "тип": "boolean",
                "по_умолчанию": False,
                "описание": "Включить устаревшие техники",
            },
            "platform": {
                "тип": "string",
                "enum": ["Windows", "Linux", "macOS", "Network", "Cloud", "Mobile"],
                "описание": "Фильтр по платформе",
            },
            "coverage": {
                "тип": "string",
                "enum": ["covered", "uncovered", "partial"],
                "описание": "Фильтр по покрытию правилами",
            },
            "tactic": {
                "тип": "string",
                "описание": "Фильтр по короткому имени тактики (initial-access, execution и т.д.)",
            },
            "search": {
                "тип": "string",
                "мин_длина": 2,
                "описание": "Поисковый запрос по ID, названию и описанию",
            },
            "sort": {
                "тип": "string",
                "по_умолчанию": "attackid",
                "enum": ["attackid", "name", "rulescount", "created_at"],
                "описание": "Поле для сортировки",
            },
            "order": {
                "тип": "string",
                "по_умолчанию": "asc",
                "enum": ["asc", "desc"],
                "описание": "Порядок сортировки",
            },
        },
        "примеры_запросов": {
            "базовый": {
                "описание": "Получить первую страницу техник",
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/techniques"',
                "python": """import requests

response = requests.get('http://172.30.250.199:5000/api/techniques')
data = response.json()

if data['success']:
    techniques = data['data']['techniques']
    print(f"Загружено: {len(techniques)} техник")
    for tech in techniques[:3]:
        print(f"  {tech['techniqueid']}: {tech['name']}")""",
                "javascript": """const response = await fetch('http://172.30.250.199:5000/api/techniques');
const data = await response.json();

if (data.success) {
  console.log(`Загружено: ${data.data.techniques.length} техник`);
  data.data.techniques.slice(0, 3).forEach(tech => {
    console.log(`${tech.techniqueid}: ${tech.name}`);
  });
}""",
            },
            "с_фильтрами": {
                "описание": "Получить техники для Windows с покрытием",
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/techniques?platform=Windows&coverage=covered&limit=50"',
                "python": """import requests

params = {
    'platform': 'Windows',
    'coverage': 'covered',
    'limit': 50,
    'sort': 'name',
    'order': 'asc'
}

response = requests.get('http://172.30.250.199:5000/api/techniques', params=params)
data = response.json()

for tech in data['data']['techniques']:
    print(f"{tech['techniqueid']}: {tech['name']} - Правил: {tech['rulescount']}")""",
                "javascript": """const params = new URLSearchParams({
  platform: 'Windows',
  coverage: 'covered',
  limit: 50
});

const response = await fetch(`http://172.30.250.199:5000/api/techniques?${params}`);
const data = await response.json();

data.data.techniques.forEach(tech => {
  console.log(`${tech.techniqueid}: ${tech.name} - Правил: ${tech.rulescount}`);
});""",
            },
            "поиск": {
                "описание": "Поиск техник по ключевому слову",
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/techniques?search=powershell&limit=10"',
                "python": """import requests

response = requests.get(
    'http://172.30.250.199:5000/api/techniques',
    params={'search': 'powershell', 'limit': 10}
)

techniques = response.json()['data']['techniques']
print(f"Найдено техник с 'powershell': {len(techniques)}")""",
                "javascript": """const response = await fetch(
  'http://172.30.250.199:5000/api/techniques?search=powershell&limit=10'
);
const data = await response.json();
console.log(`Найдено: ${data.data.techniques.length}`);""",
            },
        },
        "пример_ответа": {
            "success": True,
            "data": {
                "techniques": [
                    {
                        "techniqueid": "T1059",
                        "name": "Command and Scripting Interpreter",
                        "name_ru": "Интерпретатор команд и скриптов",
                        "platforms": ["Windows", "Linux", "macOS"],
                        "rulescount": 15,
                        "activerulescount": 12,
                        "hascoverage": True,
                        "deprecated": False,
                        "revoked": False,
                    }
                ],
                "pagination": {"page": 1, "limit": 20, "total": 679, "pages": 34},
                "filters": {"platform": None, "coverage": None, "tactic": None},
            },
            "timestamp": "2025-10-14T13:00:00.000Z",
        },
    },
    "/api/techniques/<techniqueid>": {
        "название": "Детальная информация о технике",
        "описание": """
        Получить полную информацию о конкретной технике включая:
        - Связанные правила корреляции
        - Тактики, к которым относится техника
        - Метаданные и версионность
        - Комментарии пользователей (опционально)
        """,
        "методы": ["GET"],
        "путь_параметры": {
            "techniqueid": {
                "тип": "string",
                "обязательный": True,
                "описание": "ID техники (T1059) или UUID",
                "примеры": ["T1059", "T1059.001", "attack-pattern--970a3432..."],
            }
        },
        "параметры": {
            "includerules": {
                "тип": "boolean",
                "по_умолчанию": True,
                "описание": "Включить список правил корреляции",
            },
            "includetactics": {
                "тип": "boolean",
                "по_умолчанию": True,
                "описание": "Включить информацию о тактиках",
            },
            "includemetadata": {
                "тип": "boolean",
                "по_умолчанию": True,
                "описание": "Включить метаданные (версия, даты и т.д.)",
            },
            "includecomments": {
                "тип": "boolean",
                "по_умолчанию": False,
                "описание": "Включить комментарии пользователей",
            },
        },
        "примеры_запросов": {
            "полная_информация": {
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/techniques/T1059?includerules=true"',
                "python": """import requests

response = requests.get(
    'http://172.30.250.199:5000/api/techniques/T1059',
    params={
        'includerules': True,
        'includetactics': True,
        'includemetadata': True
    }
)

tech = response.json()['data']['technique']
print(f"Техника: {tech['name']}")
print(f"Название (рус): {tech['name_ru']}")
print(f"Платформы: {', '.join(tech['platforms'])}")
print(f"Правил корреляции: {len(tech['rules'])}")
print(f"Активных правил: {sum(1 for r in tech['rules'] if r['active'])}")""",
                "javascript": """const getTechnique = async (techniqueId) => {
  const params = new URLSearchParams({
    includerules: true,
    includetactics: true
  });

  const response = await fetch(
    `http://172.30.250.199:5000/api/techniques/${techniqueId}?${params}`
  );
  const data = await response.json();

  if (data.success) {
    const tech = data.data.technique;
    console.log('Техника:', tech.name);
    console.log('Правил:', tech.rules.length);
    console.log('Тактик:', tech.tactics.length);
  }
};

getTechnique('T1059');""",
            }
        },
        "пример_ответа": {
            "success": True,
            "data": {
                "technique": {
                    "techniqueid": "T1059",
                    "name": "Command and Scripting Interpreter",
                    "name_ru": "Интерпретатор команд и скриптов",
                    "description": "Adversaries may abuse command and script interpreters to execute commands...",
                    "description_ru": "Противники могут злоупотреблять интерпретаторами команд...",
                    "platforms": ["Windows", "Linux", "macOS"],
                    "data_sources": [
                        "Process monitoring",
                        "Process command-line parameters",
                    ],
                    "permissions_required": ["User"],
                    "tactics": [
                        {
                            "id": "TA0002",
                            "name": "Execution",
                            "name_ru": "Выполнение",
                            "xmitreshortname": "execution",
                        }
                    ],
                    "rules": [
                        {
                            "id": "uuid",
                            "name": "PowerShell Execution",
                            "severity": "high",
                            "active": True,
                            "status": "enabled",
                        }
                    ],
                    "metadata": {
                        "version": 1.4,
                        "deprecated": False,
                        "revoked": False,
                        "created_at": "2023-01-15T10:00:00Z",
                        "updated_at": "2024-06-20T14:30:00Z",
                    },
                }
            },
        },
    },
    "/api/techniques/matrix": {
        "название": "Матрица MITRE ATT&CK",
        "описание": """
        Получить полную структуру матрицы MITRE ATT&CK со всеми тактиками и техниками,
        организованными для визуализации. Включает статистику покрытия.
        """,
        "методы": ["GET"],
        "параметры": {
            "includedeprecated": {
                "тип": "boolean",
                "по_умолчанию": False,
                "описание": "Включить устаревшие техники",
            },
            "platform": {"тип": "string", "описание": "Фильтр по конкретной платформе"},
        },
        "примеры_запросов": {
            "полная_матрица": {
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/techniques/matrix"',
                "python": """import requests

response = requests.get('http://172.30.250.199:5000/api/techniques/matrix')
matrix = response.json()['data']

print(f"Тактик: {len(matrix['tactics'])}")
print(f"Техник: {len(matrix['techniques'])}")
print(f"Покрытие: {matrix['statistics']['coveragepercentage']}%")

# Вывод техник по тактикам
for tactic in matrix['tactics'][:3]:
    techniques = [t for t in matrix['techniques'] if tactic['id'] in t.get('tactics', [])]
    print(f"\n{tactic['name']}: {len(techniques)} техник")""",
                "javascript": """const getMatrix = async () => {
  const response = await fetch('http://172.30.250.199:5000/api/techniques/matrix');
  const data = await response.json();
  const matrix = data.data;

  console.log('Матрица MITRE ATT&CK:');
  console.log(`  Тактик: ${matrix.tactics.length}`);
  console.log(`  Техник: ${matrix.techniques.length}`);
  console.log(`  Покрытие: ${matrix.statistics.coveragepercentage}%`);

  // Группировка техник по тактикам
  const techniquesByTactic = {};
  matrix.tactics.forEach(tactic => {
    techniquesByTactic[tactic.id] = matrix.techniques.filter(
      t => t.tactics.includes(tactic.id)
    );
  });
};""",
            }
        },
    },
    "/api/techniques/search": {
        "название": "Поиск техник",
        "описание": "Полнотекстовый поиск по техникам с оценкой релевантности",
        "методы": ["GET"],
        "параметры": {
            "q": {
                "тип": "string",
                "обязательный": True,
                "мин_длина": 2,
                "описание": "Поисковый запрос",
            },
            "limit": {
                "тип": "integer",
                "по_умолчанию": 50,
                "максимум": 500,
                "описание": "Максимальное количество результатов",
            },
        },
        "примеры_запросов": {
            "поиск": {
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/techniques/search?q=powershell&limit=20"',
                "python": """import requests

response = requests.get(
    'http://172.30.250.199:5000/api/techniques/search',
    params={'q': 'powershell', 'limit': 20}
)

results = response.json()['data']
print(f"Найдено {results['count']} техник по запросу '{results['query']}':")

for tech in results['techniques'][:5]:
    print(f"  {tech['techniqueid']}: {tech['name']}")""",
                "javascript": """const searchTechniques = async (query) => {
  const params = new URLSearchParams({q: query, limit: 20});
  const response = await fetch(
    `http://172.30.250.199:5000/api/techniques/search?${params}`
  );
  const data = await response.json();

  console.log(`Найдено: ${data.data.count} результатов`);
  data.data.techniques.forEach(tech => {
    console.log(`${tech.techniqueid}: ${tech.name}`);
  });
};

searchTechniques('powershell');""",
            }
        },
    },
    "/api/techniques/coverage": {
        "название": "Статистика покрытия техник",
        "описание": "Детальная статистика покрытия всех техник правилами корреляции",
        "методы": ["GET"],
        "примеры_запросов": {
            "статистика": {
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/techniques/coverage"',
                "python": """import requests

response = requests.get('http://172.30.250.199:5000/api/techniques/coverage')
stats = response.json()['data']['summary']

print("Статистика покрытия:")
print(f"  Всего техник: {stats['totaltechniques']}")
print(f"  Покрыто полностью: {stats['fullycovered']}")
print(f"  Покрыто частично: {stats['partiallycovered']}")
print(f"  Не покрыто: {stats['notcovered']}")
print(f"  Процент покрытия: {stats['coveragepercentage']}%")""",
            }
        },
    },
    # =========================================================================
    # ПРАВИЛА КОРРЕЛЯЦИИ
    # =========================================================================
    "/api/rules": {
        "название": "Правила корреляции",
        "описание": "Получить список правил (GET) или создать новое правило (POST)",
        "методы": ["GET", "POST"],
        "параметры_get": {
            "limit": {
                "тип": "integer",
                "по_умолчанию": 100,
                "максимум": 10000,
                "описание": "Количество записей",
            },
            "offset": {
                "тип": "integer",
                "по_умолчанию": 0,
                "описание": "Смещение для пагинации",
            },
            "active": {"тип": "boolean", "описание": "Фильтр по активным правилам"},
            "severity": {
                "тип": "string",
                "enum": ["low", "medium", "high", "critical"],
                "описание": "Фильтр по уровню критичности",
            },
        },
        "параметры_post": {
            "name": {
                "тип": "string",
                "обязательный": True,
                "описание": "Название правила",
            },
            "techniqueid": {
                "тип": "string",
                "обязательный": True,
                "описание": "ID техники MITRE ATT&CK",
            },
            "description": {
                "тип": "string",
                "обязательный": True,
                "описание": "Описание правила",
            },
            "logic": {
                "тип": "string",
                "обязательный": True,
                "описание": "Логика обнаружения (query)",
            },
            "severity": {
                "тип": "string",
                "по_умолчанию": "medium",
                "enum": ["low", "medium", "high", "critical"],
                "описание": "Уровень критичности",
            },
            "active": {
                "тип": "boolean",
                "по_умолчанию": True,
                "описание": "Активность правила",
            },
            "tags": {"тип": "array", "описание": "Теги для категоризации"},
        },
        "примеры_запросов": {
            "получить_список": {
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/rules?limit=100&active=true"',
                "python": """import requests

# Получить активные правила
response = requests.get(
    'http://172.30.250.199:5000/api/rules',
    params={'limit': 100, 'active': True}
)

rules = response.json()['data']['rules']
print(f"Загружено активных правил: {len(rules)}")

for rule in rules[:5]:
    print(f"  {rule['name']} [{rule['severity']}] - {rule['techniqueid']}")""",
                "javascript": """const getRules = async () => {
  const params = new URLSearchParams({limit: 100, active: true});
  const response = await fetch(`http://172.30.250.199:5000/api/rules?${params}`);
  const data = await response.json();

  console.log(`Загружено: ${data.data.rules.length} правил`);
  data.data.rules.slice(0, 5).forEach(rule => {
    console.log(`${rule.name} [${rule.severity}]`);
  });
};""",
            },
            "создать_правило": {
                "curl": """curl -X POST "http://172.30.250.199:5000/api/rules" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Suspicious PowerShell Execution",
    "techniqueid": "T1059.001",
    "description": "Detects suspicious PowerShell command execution",
    "logic": "EventID:4688 AND ProcessName:*powershell.exe* AND CommandLine:*-enc*",
    "severity": "high",
    "active": true,
    "tags": ["powershell", "execution", "suspicious"]
  }'""",
                "python": """import requests

new_rule = {
    'name': 'Suspicious PowerShell Execution',
    'techniqueid': 'T1059.001',
    'description': 'Detects suspicious PowerShell command execution',
    'logic': 'EventID:4688 AND ProcessName:*powershell.exe* AND CommandLine:*-enc*',
    'severity': 'high',
    'active': True,
    'tags': ['powershell', 'execution', 'suspicious']
}

response = requests.post(
    'http://172.30.250.199:5000/api/rules',
    json=new_rule
)

if response.json()['success']:
    rule_id = response.json()['data']['ruleid']
    print(f"Правило создано успешно! ID: {rule_id}")
else:
    print(f"Ошибка: {response.json()['error']['message']}")""",
                "javascript": """const createRule = async (ruleData) => {
  const response = await fetch('http://172.30.250.199:5000/api/rules', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(ruleData)
  });

  const data = await response.json();

  if (data.success) {
    console.log('Правило создано! ID:', data.data.ruleid);
  } else {
    console.error('Ошибка:', data.error.message);
  }
};

const newRule = {
  name: 'Suspicious PowerShell Execution',
  techniqueid: 'T1059.001',
  severity: 'high',
  active: true
};

createRule(newRule);""",
            },
        },
    },
    "/api/rules/<ruleid>": {
        "название": "Операции с правилом",
        "описание": "Получить (GET), обновить (PUT) или удалить (DELETE) правило",
        "методы": ["GET", "PUT", "DELETE"],
        "путь_параметры": {
            "ruleid": {
                "тип": "string",
                "обязательный": True,
                "описание": "UUID правила",
            }
        },
        "примеры_запросов": {
            "получить": {
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/rules/{uuid}"',
                "python": """import requests

rule_id = 'uuid'
response = requests.get(f'http://172.30.250.199:5000/api/rules/{rule_id}')
rule = response.json()['data']['rule']

print(f"Правило: {rule['name']}")
print(f"Техника: {rule['techniqueid']}")
print(f"Критичность: {rule['severity']}")""",
            },
            "обновить": {
                "curl": """curl -X PUT "http://172.30.250.199:5000/api/rules/{uuid}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Rule Name", "severity": "critical"}'""",
                "python": """import requests

rule_id = 'uuid'
updates = {
    'name': 'Updated Rule Name',
    'severity': 'critical',
    'active': True
}

response = requests.put(
    f'http://172.30.250.199:5000/api/rules/{rule_id}',
    json=updates
)

if response.json()['success']:
    print('Правило обновлено успешно!')""",
            },
            "удалить": {
                "curl": 'curl -X DELETE "http://172.30.250.199:5000/api/rules/{uuid}"',
                "python": """import requests

rule_id = 'uuid'
response = requests.delete(f'http://172.30.250.199:5000/api/rules/{rule_id}')

if response.json()['success']:
    print('Правило удалено успешно!')""",
            },
        },
    },
    # =========================================================================
    # СТАТИСТИКА
    # =========================================================================
    "/api/statistics": {
        "название": "Общая статистика системы",
        "описание": "Высокоуровневые метрики о техниках, правилах и покрытии",
        "методы": ["GET"],
        "примеры_запросов": {
            "получить_статистику": {
                "curl": 'curl -X GET "http://172.30.250.199:5000/api/statistics"',
                "python": """import requests

response = requests.get('http://172.30.250.199:5000/api/statistics')
stats = response.json()['data']['overview']

print("Общая статистика системы:")
print(f"  Всего техник: {stats['totaltechniques']}")
print(f"  Активных техник: {stats['activetechniques']}")
print(f"  Покрыто правилами: {stats['coveredtechniques']} ({stats['coveragepercentage']}%)")
print(f"  Всего правил: {stats['totalrules']}")
print(f"  Активных правил: {stats['activerules']}")

# Статистика по критичности
severity = response.json()['data']['severitybreakdown']
print("\nПравила по критичности:")
for level, count in severity.items():
    print(f"  {level}: {count}")""",
                "javascript": """const getStatistics = async () => {
  const response = await fetch('http://172.30.250.199:5000/api/statistics');
  const data = await response.json();
  const stats = data.data.overview;

  console.log('Статистика системы:', {
    techniques: stats.totaltechniques,
    covered: stats.coveredtechniques,
    coverage: `${stats.coveragepercentage}%`,
    rules: stats.totalrules,
    active: stats.activerules
  });
};""",
            }
        },
    },
    "/api/statistics/coverage": {
        "название": "Статистика покрытия",
        "описание": "Детальная статистика покрытия с разбивкой по тактикам",
        "методы": ["GET"],
        "параметры": {
            "includepartial": {
                "тип": "boolean",
                "по_умолчанию": True,
                "описание": "Включить частично покрытые техники",
            }
        },
    },
    "/api/statistics/tactics": {
        "название": "Статистика по тактикам",
        "описание": "Статистика для каждой тактики MITRE ATT&CK",
        "методы": ["GET"],
    },
    "/api/statistics/trends": {
        "название": "Тренды",
        "описание": "Временные тренды покрытия и активности правил",
        "методы": ["GET"],
        "параметры": {
            "period": {
                "тип": "string",
                "по_умолчанию": "30d",
                "enum": ["7d", "30d", "90d", "180d", "365d"],
                "описание": "Период для анализа",
            }
        },
    },
    # =========================================================================
    # ОСТАЛЬНЫЕ ЭНДПОИНТЫ
    # =========================================================================
    "/api/comments": {
        "название": "Комментарии",
        "описание": "Получить (GET) или создать (POST) комментарии к сущностям",
        "методы": ["GET", "POST"],
        "параметры": {
            "entityid": {
                "тип": "string",
                "описание": "ID сущности (техника или правило)",
            },
            "entitytype": {
                "тип": "string",
                "enum": ["technique", "rule"],
                "описание": "Тип сущности",
            },
        },
    },
    "/api/users": {
        "название": "Пользователи",
        "описание": "Управление пользователями системы",
        "методы": ["GET", "POST"],
    },
    "/api/analytics": {
        "название": "Аналитика",
        "описание": "Аналитика использования системы и производительности",
        "методы": ["GET"],
    },
    "/api/audit": {
        "название": "Журнал аудита",
        "описание": "Журнал всех действий в системе",
        "методы": ["GET"],
        "параметры": {
            "action": {
                "тип": "string",
                "описание": "Фильтр по типу действия (create, update, delete)",
            },
            "startdate": {"тип": "datetime", "описание": "Начальная дата периода"},
            "enddate": {"тип": "datetime", "описание": "Конечная дата периода"},
            "userid": {"тип": "integer", "описание": "Фильтр по пользователю"},
        },
    },
}


# =============================================================================
# СОЗДАНИЕ ПРИЛОЖЕНИЯ
# =============================================================================
def create_app(config_name=None):
    """
    Фабрика приложения Flask

    Args:
        config_name: Имя конфигурации (development, production, testing)

    Returns:
        Flask приложение с настроенными компонентами
    """
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    # Создание приложения
    app = Flask(__name__, static_folder=".", static_url_path="")

    # Загрузка конфигурации
    try:
        app.config.from_object(config[config_name])
        print(f"✅ Конфигурация: {config_name}")
    except Exception as e:
        print(f"⚠️ Ошибка конфигурации: {e}")
        # Базовая конфигурация
        app.config["SQLALCHEMY_DATABASE_URI"] = (
            "mysql+pymysql://root:@172.30.250.199:3306/mitre_attack_matrix"
        )
        app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
        app.config["SECRET_KEY"] = "dev-secret-key-change-in-production"
        app.config["API_VERSION"] = API_VERSION
        app.config["DEBUG"] = True

    # Инициализация расширений
    try:
        db.init_app(app)
        print("✅ База данных инициализирована")
    except Exception as e:
        print(f"❌ Ошибка БД: {e}")

    # CORS
    CORS(app, origins="*", supports_credentials=True)
    print("✅ CORS включен")

    # Настройка компонентов
    setup_logging(app)
    register_blueprints(app)
    register_api_routes(app)
    register_error_handlers(app)
    register_request_handlers(app)
    register_static_routes(app)

    # Создание таблиц БД
    with app.app_context():
        try:
            db.create_all()
            app.logger.info("✅ Таблицы БД проверены/созданы")
            print("✅ Таблицы БД готовы")
        except Exception as e:
            app.logger.error(f"❌ Ошибка создания таблиц: {e}")
            print(f"⚠️ Предупреждение БД: {e}")

    return app


def setup_logging(app):
    """Настройка системы логирования"""
    if not app.debug:
        if not os.path.exists("logs"):
            os.mkdir("logs")

        handler = RotatingFileHandler(
            "logs/api.log", maxBytes=LOG_MAX_BYTES, backupCount=LOG_BACKUP_COUNT
        )
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]"
            )
        )
        handler.setLevel(LOG_LEVEL)
        app.logger.addHandler(handler)
        app.logger.setLevel(LOG_LEVEL)
        app.logger.info("🚀 MITRE ATT&CK Matrix API запущен")


def register_blueprints(app):
    """Регистрация blueprints"""
    blueprints = [
        ("techniques", "/api/techniques"),
        ("rules", "/api/rules"),
        ("statistics", "/api/statistics"),
        ("comments", "/api/comments"),
        ("users", "/api/users"),
        ("analytics", "/api/analytics"),
        ("audit", "/api/audit"),
        ("matrix", "/api/matrix"),
    ]

    registered = []
    failed = []

    for bp_name, url_prefix in blueprints:
        try:
            module = __import__(f"blueprints.{bp_name}", fromlist=[f"{bp_name}_bp"])
            blueprint = getattr(module, f"{bp_name}_bp")
            app.register_blueprint(blueprint, url_prefix=url_prefix)
            registered.append(bp_name)
        except Exception as e:
            failed.append(f"{bp_name}: {e}")

    if registered:
        print(f"✅ Blueprints: {', '.join(registered)}")
    if failed:
        print(f"⚠️ Ошибки blueprints:")
        for failure in failed:
            print(f"   - {failure}")


def get_all_routes(app):
    """Получить все маршруты с документацией"""
    routes = []

    for rule in app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue

        path = str(rule.rule)
        methods = ",".join(sorted(rule.methods - {"HEAD", "OPTIONS"}))

        # Получаем docstring
        try:
            view_func = app.view_functions[rule.endpoint]
            doc = view_func.__doc__ if view_func.__doc__ else "Нет описания"
            doc = doc.strip().split("\\n")[0]
        except:
            doc = "Нет описания"

        # Категоризация
        if "/api/techniques" in path:
            category = "Техники"
        elif "/api/rules" in path:
            category = "Правила"
        elif "/api/statistics" in path:
            category = "Статистика"
        elif "/api/comments" in path:
            category = "Комментарии"
        elif "/api/users" in path:
            category = "Пользователи"
        elif "/api/analytics" in path:
            category = "Аналитика"
        elif "/api/audit" in path:
            category = "Аудит"
        elif "/api/matrix" in path:
            category = "Матрица"
        elif path.startswith("/api"):
            category = "Core API"
        else:
            category = "Система"

        # Расширенная документация
        base_path = path.replace("<techniqueid>", "<id>").replace("<ruleid>", "<id>")
        enhanced = API_DOCS.get(base_path, {})

        routes.append(
            {
                "path": path,
                "methods": methods,
                "endpoint": rule.endpoint,
                "description": doc,
                "category": category,
                "enhanced": enhanced,
            }
        )

    routes.sort(key=lambda x: (x["category"], x["path"]))
    return routes


def register_api_routes(app):
    """Регистрация основных API маршрутов"""

    @app.route("/api")
    @app.route("/api/")
    def api_info():
        """Описание эндпоинта: </br>
        Получить полную информацию об API, версию, категории и детали (основная документация API для интеграторов и пользователей). </br>

        Запрос curl: </br>

        curl -X GET "http://172.30.250.199:5000/api" </br>
        Ответ: </br>

        { </br>
          "version": "13.0.0", </br>
          "categories": [ </br>
            "core", </br>
            "analytics", </br>
            "audit", </br>
            "comments", </br>
            "matrix", </br>
            "users", </br>
            "rules", </br>
            "statistics", </br>
            "techniques" </br>
          ], </br>
          "endpoints": 68, </br>
          "database": "здорово", </br>
          "status": "здорово", </br>
          "uptime": "Работает", </br>
          "timestamp": "2025-10-21T20:25:31.092410" </br>
        }
        """

        if request.args.get("format") == "html" or "text/html" in request.headers.get(
            "Accept", ""
        ):
            return render_api_docs_html(app)

        # JSON ответ
        try:
            result = db.session.execute(text("SELECT 1")).scalar()
            db_status = "Работает"
        except:
            db_status = "Ошибка"

        all_routes = get_all_routes(app)
        routes_by_category = {}

        for route in all_routes:
            cat = route["category"]
            if cat not in routes_by_category:
                routes_by_category[cat] = []
            routes_by_category[cat].append(
                {
                    "path": route["path"],
                    "methods": route["methods"],
                    "description": route["description"],
                    "documentation": route.get("enhanced"),
                }
            )

        return create_success_response(
            {
                "api": {
                    "name": "MITRE ATT&CK Matrix API",
                    "version": app.config.get("API_VERSION", API_VERSION),
                    "description": "Продвинутый API для фреймворка MITRE ATT&CK с полной документацией",
                    "status": "Работает",
                    "database": db_status,
                    "features": [
                        "Полная база техник MITRE ATT&CK (679 техник)",
                        "Управление правилами корреляции (852+ правил)",
                        "Анализ покрытия и статистика",
                        "Полнотекстовый поиск",
                        "Комментарии и аннотации",
                        "Журнал аудита",
                        "RESTful API дизайн",
                        "Полная русифицированная документация",
                        "Примеры на Python/JavaScript",
                        "Примеры curl команд",
                        "Подробное описание моделей данных",
                    ],
                },
                "routes": routes_by_category,
                "total_routes": len(all_routes),
                "data_models": DATA_MODELS,
                "documentation": {
                    "html": "/api?format=html",
                    "json": "/api?format=json",
                    "endpoints": len(API_DOCS),
                },
            }
        )

    @app.route("/health")
    @app.route("/api/health")
    def health_check():
        """Проверка состояния (health-check) системы и базы - используется для мониторинга работоспособности и внешнего контроля доступности API/Ping. </br>

        Запрос curl: </br>
        curl -X GET "http://172.30.250.199:5000/api/health" </br>
        Ответ: </br>
        { </br>
          "database": "здорово", </br>
          "status": "здорово", </br>
          "timestamp": "2025-10-21T20:25:31.092410", </br>
          "uptime": "Работает", </br>
          "version": "13.0.0" </br>
        }
        """
        try:
            result = db.session.execute(text("SELECT 1")).scalar()
            db_status = "здорова" if result == 1 else "проблемы"
        except Exception as e:
            db_status = f"недоступна: {str(e)}"

        return jsonify(
            {
                "status": "здорова" if db_status == "здорова" else "деградировала",
                "database": db_status,
                "version": app.config.get("API_VERSION", API_VERSION),
                "uptime": "Работает",
                "timestamp": datetime.utcnow().isoformat(),
            }
        )


def render_api_docs_html(app):
    """Рендер HTML документации для API"""
    all_routes = get_all_routes(app)
    routes_by_category = {}

    for route in all_routes:
        cat = route["category"]
        if cat not in routes_by_category:
            routes_by_category[cat] = []
        routes_by_category[cat].append(route)

    # Проверка БД
    try:
        result = db.session.execute(text("SELECT 1")).scalar()
        db_status = "Работает"
    except:
        db_status = "ошибка"

    category_icons = {
        "Core API": "🔥",
        "Техники": "🔧",
        "Правила": "📜",
        "Статистика": "📊",
        "Комментарии": "💬",
        "Пользователи": "👥",
        "Аналитика": "📈",
        "Аудит": "🔍",
        "Система": "⚙️",
    }

    # HTML шаблон (компактная версия для экономии строк)
    html = """<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MITRE ATT&CK Matrix API - Документация</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
               color: #1e293b; min-height: 100vh; padding: 2rem; }
        .container { max-width: 1400px; margin: 0 auto; background: white;
                    border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
        header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; padding: 3rem 2rem; text-align: center; }
        header h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .stats { display: flex; justify-content: center; gap: 2rem; margin-top: 2rem; flex-wrap: wrap; }
        .stat-item { background: rgba(255,255,255,0.1); padding: 1rem 2rem; border-radius: 10px; }
        .stat-value { font-size: 2rem; font-weight: bold; display: block; }
        .stat-label { font-size: 0.875rem; opacity: 0.8; margin-top: 0.25rem; }
        .content { padding: 2rem; }
        .search-box { margin-bottom: 2rem; position: sticky; top: 0; background: white; z-index: 100;
                     padding: 1rem 0; border-bottom: 2px solid #e2e8f0; }
        .search-input { width: 100%; padding: 1rem 1.5rem; font-size: 1rem; border: 2px solid #e2e8f0;
                       border-radius: 10px; transition: all 0.2s; }
        .search-input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 4px rgba(102,126,234,0.1); }
        .category { margin-bottom: 3rem; }
        .category-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;
                          padding-bottom: 0.75rem; border-bottom: 3px solid #667eea; }
        .category-icon { font-size: 2rem; }
        .category-title { font-size: 1.5rem; font-weight: 700; }
        .category-count { background: #667eea; color: white; padding: 0.25rem 0.75rem;
                         border-radius: 20px; font-size: 0.875rem; font-weight: 600; }
        .route-card { background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px;
                     padding: 1.5rem; margin-bottom: 1rem; transition: all 0.2s; cursor: pointer; }
        .route-card:hover { border-color: #667eea; box-shadow: 0 4px 12px rgba(102,126,234,0.2);
                           transform: translateY(-2px); }
        .route-methods { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
        .method-badge { padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.75rem;
                       font-weight: 700; text-transform: uppercase; }
        .method-GET { background: #10b981; color: white; }
        .method-POST { background: #3b82f6; color: white; }
        .method-PUT { background: #f59e0b; color: white; }
        .method-DELETE { background: #ef4444; color: white; }
        .route-path { font-family: 'Courier New', monospace; font-size: 1rem; font-weight: 600;
                     color: #667eea; margin-bottom: 0.5rem; }
        .route-description { color: #64748b; font-size: 0.875rem; line-height: 1.5; }
        footer { background: #f8fafc; padding: 2rem; text-align: center; color: #64748b;
                border-top: 2px solid #e2e8f0; }
        .footer-links { margin-top: 1rem; display: flex; justify-content: center; gap: 2rem; flex-wrap: wrap; }
        .footer-links a { color: #667eea; text-decoration: none; font-weight: 600; }
        @media (max-width: 768px) { body { padding: 1rem; } header h1 { font-size: 1.75rem; }
                                   .content { padding: 1rem; } }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🛡️ MITRE ATT&CK Matrix API</h1>
            <p>Полная документация на русском языке</p>
            <p>Версия {{ version }}</p>
            <div class="stats">
                <div class="stat-item"><span class="stat-value">{{ total_routes }}</span>
                    <span class="stat-label">API Эндпоинтов</span></div>
                <div class="stat-item"><span class="stat-value">{{ categories|length }}</span>
                    <span class="stat-label">Категорий</span></div>
                <div class="stat-item"><span class="stat-value">{{ database_status }}</span>
                    <span class="stat-label">База данных</span></div>
            </div>
        </header>
        <div class="content">
            <div class="search-box">
                <input type="text" id="searchInput" class="search-input" 
                       placeholder="🔍 Поиск по API эндпоинтам...">
            </div>
            <div id="routesContainer">
                {% for category, routes in categories.items() %}
                <div class="category">
                    <div class="category-header">
                        <span class="category-icon">{{ category_icons.get(category, '📁') }}</span>
                        <h2 class="category-title">{{ category }}</h2>
                        <span class="category-count">{{ routes|length }}</span>
                    </div>
                    {% for route in routes %}
                    <div class="route-card" data-path="{{ route.path }}" data-methods="{{ route.methods }}">
                        <div class="route-methods">
                            {% for method in route.methods.split(',') %}
                            <span class="method-badge method-{{ method }}">{{ method }}</span>
                            {% endfor %}
                        </div>
                        <code class="route-path">{{ route.path }}</code>
                        <div class="route-description">{{ route.description }}</div>
                        {% if route.enhanced and route.enhanced.get('название') %}
                        <div style="margin-top: 0.75rem; padding: 0.75rem; background: white; border-radius: 8px;">
                            <strong>{{ route.enhanced.get('название') }}</strong>
                            <p style="font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem;">
                                {{ route.enhanced.get('описание', '')[:150] }}...
                            </p>
                        </div>
                        {% endif %}
                    </div>
                    {% endfor %}
                </div>
                {% endfor %}
            </div>
        </div>
        <footer>
            <p><strong>MITRE ATT&CK Matrix API</strong> - Полная документация</p>
            <p style="font-size: 0.875rem; margin-top: 0.5rem;">Сгенерировано {{ timestamp }}</p>
            <div class="footer-links">
                <a href="/api?format=json">📄 JSON Формат</a>
                <a href="/health">💚 Здоровье системы</a>
                <a href="/">🏠 Главная</a>
            </div>
        </footer>
    </div>
    <script>
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.route-card').forEach(card => {
                const path = card.dataset.path.toLowerCase();
                const methods = card.dataset.methods.toLowerCase();
                card.style.display = (path.includes(query) || methods.includes(query)) ? 'block' : 'none';
            });
        });
        document.querySelectorAll('.route-card').forEach(card => {
            card.addEventListener('click', () => {
                navigator.clipboard.writeText(window.location.origin + card.dataset.path);
                const notif = document.createElement('div');
                notif.textContent = '✅ URL скопирован!';
                notif.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:1rem;border-radius:10px;z-index:1000;';
                document.body.appendChild(notif);
                setTimeout(() => notif.remove(), 2000);
            });
        });
    </script>
</body>
</html>"""

    from jinja2 import Template

    template = Template(html)

    return template.render(
        version=app.config.get("API_VERSION", API_VERSION),
        total_routes=len(all_routes),
        categories=routes_by_category,
        category_icons=category_icons,
        database_status=db_status,
        timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
    )


def register_static_routes(app):
    """Регистрация маршрутов для статических файлов"""

    @app.route("/")
    def index():
        """Главная страница"""
        try:
            return send_from_directory(".", "index.html")
        except:
            return f"""<!DOCTYPE html>
<html><head><title>MITRE ATT&CK Matrix API</title>
<style>body{{font-family:system-ui;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
color:white;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;}}
.container{{text-align:center;background:rgba(255,255,255,0.1);padding:50px;border-radius:20px;}}
h1{{font-size:3em;}}a{{color:#fbbf24;text-decoration:none;font-weight:bold;margin:10px;
padding:10px 20px;background:rgba(251,191,36,0.2);border-radius:10px;display:inline-block;}}
</style></head><body><div class="container"><h1>🛡️ MITRE ATT&CK Matrix API</h1>
<div style="font-size:2em;color:#4ade80;margin:20px 0;">✅ Работает</div>
<p>Версия: {app.config.get('API_VERSION', API_VERSION)}</p>
<div style="margin-top:30px;">
<a href="/api?format=html">📚 Документация API</a><br>
<a href="/health">💚 Здоровье системы</a></div></div></body></html>"""

    @app.route("/css/<path:filename>")
    def serve_css(filename):
        try:
            return send_from_directory("css", filename)
        except:
            return create_error_response(f"CSS не найден: {filename}", 404)

    @app.route("/js/<path:filename>")
    def serve_js(filename):
        try:
            return send_from_directory("js", filename)
        except:
            return create_error_response(f"JS не найден: {filename}", 404)

    @app.route("/favicon.ico")
    def favicon():
        try:
            return send_from_directory(".", "favicon.ico")
        except:
            return "", 204


def register_error_handlers(app):
    """Регистрация обработчиков ошибок"""

    @app.errorhandler(404)
    def not_found(error):
        return create_error_response("Ресурс не найден", 404)

    @app.errorhandler(500)
    def internal_error(error):
        app.logger.error(f"Внутренняя ошибка: {error}")
        return create_error_response("Внутренняя ошибка сервера", 500)

    @app.errorhandler(403)
    def forbidden(error):
        return create_error_response("Доступ запрещён", 403)

    @app.errorhandler(401)
    def unauthorized(error):
        return create_error_response("Требуется авторизация", 401)

    @app.errorhandler(400)
    def bad_request(error):
        return create_error_response("Неверный запрос", 400)


def register_request_handlers(app):
    """Регистрация обработчиков запросов/ответов"""

    @app.before_request
    def before_request():
        """Выполнить перед каждым запросом"""
        g.request_id = generate_request_id()
        g.request_start_time = datetime.utcnow()
        g.client_ip = get_client_ip()

        # Логирование запросов (кроме статических файлов)
        if not any(
            request.path.startswith(p) for p in ["/static", "/css", "/js", "/favicon"]
        ):
            app.logger.info(
                f"[{g.request_id}] {request.method} {request.path} от {g.client_ip}"
            )

    @app.after_request
    def after_request(response):
        """Выполнить после каждого запроса"""
        # Добавление заголовков
        if hasattr(g, "request_id"):
            response.headers["X-Request-ID"] = g.request_id

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, DELETE, OPTIONS"
        )
        response.headers["Access-Control-Allow-Headers"] = (
            "Content-Type, Authorization, X-Request-ID"
        )

        # Логирование времени выполнения
        if hasattr(g, "request_start_time") and not any(
            request.path.startswith(p) for p in ["/static", "/css", "/js"]
        ):
            duration = (datetime.utcnow() - g.request_start_time).total_seconds()
            app.logger.info(
                f"[{g.request_id}] Ответ: {response.status_code} Время: {duration:.3f}s"
            )

        return response

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        """Очистка сессии БД"""
        db.session.remove()


# =============================================================================
# СОЗДАНИЕ И ЗАПУСК ПРИЛОЖЕНИЯ
# =============================================================================
app = create_app()


if __name__ == "__main__":
    # Красивый баннер запуска
    print("\\n" + "=" * 80)
    print(" " * 15 + "🚀 MITRE ATT&CK Matrix API Server")
    print(" " * 20 + "Полная версия с документацией")
    print("=" * 80)
    print(f'📅 Дата: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'🌐 Окружение: {os.environ.get("FLASK_ENV", "development")}')
    print(f"📌 Версия: {API_VERSION}")
    print()
    print("📡 Сервер запущен на:")
    print(f"   🔗 URL: http://172.30.250.199:5000")
    print(f"   📚 Документация (HTML): http://172.30.250.199:5000/api?format=html")
    print(f"   📄 Документация (JSON): http://172.30.250.199:5000/api")
    print(f"   💚 Здоровье: http://172.30.250.199:5000/health")
    print()
    print("✨ Возможности:")
    print("   • 679 техник MITRE ATT&CK")
    print("   • 852+ правил корреляции")
    print("   • Полнотекстовый поиск")
    print("   • Статистика и аналитика")
    print("   • Русифицированная документация")
    print("   • Примеры кода (Python/JavaScript)")
    print("   • Примеры curl команд")
    print("   • Описание моделей данных")
    print("=" * 80 + "\\n")

    # Запуск сервера
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=True, threaded=True)
