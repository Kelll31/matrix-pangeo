#!/usr/bin/env python3
"""
Quick Start скрипт для Flask MITRE ATT&CK Matrix API
Проверяет все зависимости и запускает API
Использует переменные из .env файла

Автор: ПангеоРадар
Версия: 3.0
"""

import sys
import os
import subprocess
from pathlib import Path


def check_dotenv():
    """Проверяем наличие python-dotenv"""
    try:
        from dotenv import load_dotenv

        return True
    except ImportError:
        print("❌ Модуль python-dotenv не установлен!")
        print("   Установите: pip install python-dotenv")
        return False


def load_env_variables():
    """Загружаем переменные из .env файла"""
    try:
        from dotenv import load_dotenv

        # Определяем путь к .env
        basedir = Path(__file__).parent.absolute()
        env_path = basedir / ".env"

        # Проверяем существование .env
        if not env_path.exists():
            print(f"⚠️  Файл .env не найден: {env_path}")
            return False

        # Загружаем переменные
        load_dotenv(env_path, override=True)
        print(f"✅ Файл .env загружен: {env_path}")
        return True

    except Exception as e:
        print(f"❌ Ошибка загрузки .env: {e}")
        return False


def get_db_config():
    """Получаем конфигурацию БД из переменных окружения"""
    config = {
        "host": os.environ.get("DB_HOST", "172.30.250.199"),
        "port": int(os.environ.get("DB_PORT", "3306")),
        "user": os.environ.get("DB_USER", "root"),
        "password": os.environ.get("DB_PASS", "").strip('"').strip("'"),
        "database": os.environ.get("DB_NAME", "mitre_attack_matrix"),
        "charset": os.environ.get("DB_CHARSET", "utf8mb4"),
    }
    return config


def check_python_version():
    """Проверяем версию Python"""
    print("1️⃣  Проверяем версию Python...")
    version = sys.version_info

    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print(f"   ❌ Python {version.major}.{version.minor} слишком старый!")
        print("   🔧 Требуется Python 3.8+")
        return False

    print(f"   ✅ Python {version.major}.{version.minor}.{version.micro} OK")
    return True


def check_pip_packages():
    """Проверяем установку пакетов"""
    print("\n2️⃣  Проверяем Python пакеты...")

    package_checks = [
        ("flask", "flask"),
        ("pymysql", "pymysql"),
        ("sqlalchemy", "sqlalchemy"),
        ("flask_sqlalchemy", "flask-sqlalchemy"),
        ("flask_cors", "flask-cors"),
        ("bcrypt", "bcrypt"),
        ("jwt", "PyJWT"),
        ("dotenv", "python-dotenv"),
    ]

    missing_packages = []

    for import_name, package_name in package_checks:
        try:
            __import__(import_name)
            print(f"   ✅ {package_name}")
        except ImportError:
            print(f"   ❌ {package_name} не установлен")
            missing_packages.append(package_name)

    if missing_packages:
        print(f"\n   🔧 Установите недостающие пакеты:")
        for package in missing_packages:
            print(f"      pip install {package}")
        print("\n   Или установите все зависимости:")
        print("      pip install -r requirements.txt")
        return False

    return True


def check_mysql():
    """Проверяем MySQL сервер"""
    print("\n3️⃣  Проверяем MySQL сервер...")

    # Загружаем конфигурацию из .env
    if not load_env_variables():
        print("   ⚠️  .env файл не загружен, используем значения по умолчанию")

    db_config = get_db_config()

    try:
        import pymysql

        # Подключаемся БЕЗ указания базы данных
        connection = pymysql.connect(
            host=db_config["host"],
            port=db_config["port"],
            user=db_config["user"],
            password=db_config["password"],
            charset=db_config["charset"],
        )

        with connection.cursor() as cursor:
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()
            print(f"   ✅ MySQL сервер работает! Версия: {version[0]}")
            print(
                f"   📊 Подключение: {db_config['user']}@{db_config['host']}:{db_config['port']}"
            )

        connection.close()
        return True

    except pymysql.err.OperationalError as e:
        error_code = e.args[0]

        if error_code == 1045:  # Access denied
            print(f"   ❌ Ошибка авторизации: {e}")
            print("\n   🔧 Решение:")
            print(f"      1. Проверьте пароль в .env файле (DB_PASS)")
            print(f"      2. Текущий пользователь: {db_config['user']}")
            print(f"      3. Длина пароля: {len(db_config['password'])} символов")
            print(f"      4. Проверьте подключение: mysql -u {db_config['user']} -p")

        elif error_code == 2003:  # Can't connect
            print(f"   ❌ MySQL сервер недоступен: {e}")
            print("\n   🔧 Решение:")
            print("      1. Убедитесь что MySQL запущен")
            print("      2. Для XAMPP: запустите MySQL из панели управления")
            print("      3. Для Linux: systemctl start mariadb")

        else:
            print(f"   ❌ Ошибка подключения: {e}")

        return False

    except Exception as e:
        print(f"   ❌ Неожиданная ошибка: {e}")
        return False


def check_database():
    """Проверяем базу данных"""
    print("\n4️⃣  Проверяем базу данных...")

    # Загружаем конфигурацию из .env
    if not load_env_variables():
        print("   ⚠️  .env файл не загружен")
        return False

    db_config = get_db_config()
    db_name = db_config["database"]

    try:
        import pymysql

        # Подключаемся к конкретной базе данных
        connection = pymysql.connect(
            host=db_config["host"],
            port=db_config["port"],
            user=db_config["user"],
            password=db_config["password"],
            database=db_name,
            charset=db_config["charset"],
        )

        with connection.cursor() as cursor:
            # Проверяем количество таблиц
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            table_count = len(tables)

            print(f"   ✅ База данных '{db_name}' найдена")
            print(f"   📊 Таблиц в БД: {table_count}")

            if table_count > 0:
                print(f"   📋 Список таблиц:")
                for table in tables[:5]:  # Показываем первые 5 таблиц
                    print(f"      • {table[0]}")
                if table_count > 5:
                    print(f"      ... и еще {table_count - 5} таблиц")
            else:
                print(f"   ⚠️  База данных пустая!")

        connection.close()
        return True

    except pymysql.err.OperationalError as e:
        error_code = e.args[0]

        if error_code == 1049:  # Unknown database
            print(f"   ❌ База данных '{db_name}' не найдена")
            print("\n   🔧 Создайте базу данных:")
            print(f"      1. Откройте http://localhost/phpmyadmin")
            print(f"      2. Создайте БД: {db_name}")
            print(f"      3. Импортируйте: database_demo.sql")
            print(f"\n   Или через командную строку:")
            print(
                f'      mysql -u {db_config["user"]} -p -e "CREATE DATABASE {db_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'
            )
        else:
            print(f"   ❌ Ошибка подключения к БД: {e}")

        return False

    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
        return False


def check_config_files():
    """Проверяем конфигурационные файлы"""
    print("\n5️⃣  Проверяем конфигурационные файлы...")

    required_files = [
        (".env", "Переменные окружения"),
        ("config.py", "Конфигурация приложения"),
        ("app.py", "Основное приложение Flask"),
    ]

    optional_files = [
        ("models/database.py", "Модели базы данных"),
        ("utils/helpers.py", "Вспомогательные функции"),
        ("blueprints/techniques.py", "API техник"),
        ("requirements.txt", "Зависимости Python"),
    ]

    all_ok = True

    # Проверяем обязательные файлы
    for file_path, description in required_files:
        if os.path.exists(file_path):
            print(f"   ✅ {file_path} - {description}")
        else:
            print(f"   ❌ {file_path} не найден - {description}")
            all_ok = False

    # Проверяем опциональные файлы
    for file_path, description in optional_files:
        if os.path.exists(file_path):
            print(f"   ✅ {file_path} - {description}")
        else:
            print(f"   ⚠️  {file_path} не найден - {description}")

    if not all_ok:
        print("\n   🔧 Убедитесь что все обязательные файлы присутствуют")

    return all_ok


def check_env_file():
    """Проверяем .env файл"""
    print("\n📝 Проверяем .env файл...")

    env_path = Path(__file__).parent.absolute() / ".env"

    if not env_path.exists():
        print(f"   ❌ Файл .env не найден: {env_path}")
        print("\n   🔧 Создаем .env файл...")

        env_template = """# Flask Configuration
FLASK_ENV=development
SECRET_KEY=your-secret-key-here-change-in-production

# MySQL Database Configuration
DB_HOST=172.30.250.199
DB_PORT=3306
DB_NAME=mitre_attack_matrix
DB_USER=root
DB_PASS=
DB_CHARSET=utf8mb4

# JWT Configuration
JWT_SECRET_KEY=your-jwt-secret-key-here

# Logging Configuration
LOG_LEVEL=DEBUG

# Application Port
PORT=5000

# Redis
REDIS_ENABLED=false
"""

        try:
            with open(env_path, "w", encoding="utf-8") as f:
                f.write(env_template)
            print(f"   ✅ .env файл создан: {env_path}")
            print("   ⚠️  Измените пароль DB_PASS при необходимости")
            return True
        except Exception as e:
            print(f"   ❌ Не удалось создать .env: {e}")
            return False

    # Проверяем содержимое .env
    print(f"   ✅ Файл .env найден: {env_path}")

    if load_env_variables():
        db_config = get_db_config()
        print(f"   📊 Конфигурация из .env:")
        print(f"      DB_HOST: {db_config['host']}")
        print(f"      DB_PORT: {db_config['port']}")
        print(f"      DB_USER: {db_config['user']}")
        print(f"      DB_NAME: {db_config['database']}")
        print(
            f"      DB_PASS: {'*' * len(db_config['password'])} ({len(db_config['password'])} символов)"
        )

        if len(db_config["password"]) == 0:
            print(f"   ⚠️  DB_PASS пустой! Если требуется пароль, установите его в .env")

        return True
    else:
        return False


def install_missing_packages():
    """Устанавливаем недостающие пакеты"""
    print("\n🔧 Устанавливаем недостающие пакеты...")

    try:
        if os.path.exists("requirements.txt"):
            print("   📦 Устанавливаем из requirements.txt...")
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
                capture_output=True,
                text=True,
            )

            if result.returncode == 0:
                print("   ✅ Пакеты установлены из requirements.txt")
                return True
            else:
                print(f"   ❌ Ошибка установки: {result.stderr}")
                return False
        else:
            # Устанавливаем базовые пакеты
            packages = [
                "flask",
                "pymysql",
                "sqlalchemy",
                "flask-sqlalchemy",
                "flask-cors",
                "bcrypt",
                "PyJWT",
                "python-dotenv",
            ]

            for package in packages:
                print(f"   📦 Устанавливаем {package}...")
                result = subprocess.run(
                    [sys.executable, "-m", "pip", "install", package],
                    capture_output=True,
                    text=True,
                )

                if result.returncode != 0:
                    print(f"   ❌ Ошибка установки {package}")
                    return False

            print("   ✅ Все пакеты установлены")
            return True

    except Exception as e:
        print(f"   ❌ Ошибка установки пакетов: {e}")
        return False


def run_flask_api():
    """Запускаем Flask API"""
    print("\n🚀 Запускаем Flask API...")

    # Определяем какой app.py использовать
    app_files = ["app.py", "app_xampp.py", "run.py"]
    app_file = None

    for filename in app_files:
        if os.path.exists(filename):
            app_file = filename
            break

    if not app_file:
        print("   ❌ Файл app.py не найден!")
        return False

    print(f"   📝 Используем: {app_file}")

    # Получаем порт из .env
    port = os.environ.get("PORT", "5000")
    print(f"   🌐 API будет доступно по адресу: http://localhost:{port}")
    print("   ⏹️  Для остановки нажмите Ctrl+C")
    print("\n" + "=" * 70)

    try:
        # ВАЖНО: Устанавливаем PYTHONUNBUFFERED для немедленного вывода
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        subprocess.run([sys.executable, app_file], check=True, env=env)

    except KeyboardInterrupt:
        print("\n   ⏹️  API остановлен пользователем")

    except subprocess.CalledProcessError as e:
        print(f"\n   ❌ Ошибка запуска API: {e}")
        print("\n   🔍 Возможные причины:")
        print("      1. Ошибка в config.py - файл .env не найден или некорректен")
        print("      2. Ошибка подключения к базе данных")
        print("      3. Синтаксическая ошибка в Python коде")
        print("\n   💡 Попробуйте запустить напрямую для просмотра ошибок:")
        print(f"      python {app_file}")
        return False

    except Exception as e:
        print(f"   ❌ Неожиданная ошибка: {e}")
        return False

    return True


def main():
    """Главная функция"""
    print("=" * 70)
    print("🚀 Quick Start - MITRE ATT&CK Matrix Flask API")
    print("=" * 70)

    # Проверяем Python версию
    if not check_python_version():
        return False

    # Проверяем .env файл
    env_ok = check_env_file()
    if not env_ok:
        print("\n❌ Проблемы с .env файлом!")
        return False

    # Проверяем пакеты
    packages_ok = check_pip_packages()

    if not packages_ok:
        response = input("\n❓ Попробовать установить недостающие пакеты? (y/n): ")
        if response.lower() == "y":
            if install_missing_packages():
                print("\n✅ Пакеты установлены! Повторяем проверку...")
                packages_ok = check_pip_packages()
            else:
                print("\n❌ Не удалось установить пакеты")
                return False
        else:
            return False

    # Остальные проверки
    checks = [packages_ok, check_mysql(), check_database(), check_config_files()]

    if all(checks):
        print("\n🎉 Все проверки пройдены успешно!")

        # Загружаем конфигурацию для вывода
        load_env_variables()
        db_config = get_db_config()
        port = os.environ.get("PORT", "5000")

        # Показываем доступные endpoints
        print("\n" + "=" * 70)
        print("🌐 Flask API будет доступен по адресу:")
        print(f"   📋 API Documentation:  http://localhost:{port}/api")
        print(f"   🔍 Health Check:       http://localhost:{port}/health")
        print(f"   📊 Techniques:         http://localhost:{port}/api/techniques")
        print(f"   📈 Statistics:         http://localhost:{port}/api/statistics")

        print(f"\n📊 Ваша база данных:")
        print(
            f"   phpMyAdmin: http://localhost/phpmyadmin/index.php?route=/database/structure&db={db_config['database']}"
        )
        print("=" * 70)

        try:
            input("\n🔥 Нажмите Enter для запуска API (или Ctrl+C для выхода)...")
            run_flask_api()
        except KeyboardInterrupt:
            print("\n👋 Отменено пользователем")

    else:
        print("\n❌ Есть проблемы с настройкой!")
        print("🔧 Исправьте ошибки выше и запустите снова")

        # Показываем советы по решению проблем
        print("\n💡 Быстрые решения:")
        print("   📦 Установить пакеты: pip install -r requirements.txt")
        print("   📝 Проверить .env файл: notepad .env")
        print("   🔄 Перезапустить MySQL из панели XAMPP")

        db_config = get_db_config()
        print(
            f"   🗄️  phpMyAdmin: http://localhost/phpmyadmin/index.php?route=/database/structure&db={db_config['database']}"
        )

        return False


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Программа прервана пользователем")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Критическая ошибка: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
