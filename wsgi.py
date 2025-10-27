"""
WSGI Entry Point for Production Deployment
"""

import sys
import os
import logging
from pathlib import Path

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Определяем базовый путь проекта
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Загружаем переменные окружения из .env (если есть)
env_path = BASE_DIR / '.env'
if env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
        logger.info(f"Loaded environment variables from {env_path}")
    except ImportError:
        logger.warning("python-dotenv not installed, skipping .env file")

# Устанавливаем переменные окружения по умолчанию
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('PYTHONUNBUFFERED', '1')

try:
    # Импортируем приложение Flask
    from app import app as application
    logger.info("Flask application successfully loaded")
    logger.info(f"Application name: {application.name}")
    logger.info(f"Debug mode: {application.debug}")
except Exception as e:
    logger.error(f"Failed to import Flask application: {e}", exc_info=True)
    raise

# Точка входа для WSGI серверов (Gunicorn, uWSGI)
if __name__ == "__main__":
    logger.info("Starting Flask development server")
    application.run(
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
        debug=False
    )
