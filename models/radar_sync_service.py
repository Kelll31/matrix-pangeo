#!/usr/bin/env python3
"""
Сервис автоматической синхронизации с Платформой Радар
Файл: models/radar_sync_service.py
Автор: ПангеоРадар
Версия: 1.0

Описание:
    Daemon-сервис для автоматической синхронизации правил корреляции
    с Платформой Радар по расписанию.

Использование:
    python models/radar_sync_service.py

Systemd:
    systemctl start radar-sync
    systemctl status radar-sync
    journalctl -u radar-sync -f
"""

import os
import sys
import signal
import time
import logging
import schedule
from pathlib import Path
from datetime import datetime
from logging.handlers import RotatingFileHandler

# Добавляем корневую директорию проекта в sys.path
project_root = Path(__file__).parent.parent.absolute()
sys.path.insert(0, str(project_root))

# Импорты после добавления в путь
from app import create_app
from models.database import db
from models.radar_sync import sync_rules_from_radar


# ==========================================
# НАСТРОЙКА ЛОГИРОВАНИЯ
# ==========================================
def setup_logging(log_dir: Path, log_level: str = "INFO") -> logging.Logger:
    """
    Настройка логирования для сервиса

    Args:
        log_dir: Директория для логов
        log_level: Уровень логирования

    Returns:
        Настроенный logger
    """
    # Создаем директорию для логов
    log_dir.mkdir(parents=True, exist_ok=True)

    # Создаем logger
    logger = logging.getLogger("radar_sync_service")
    logger.setLevel(getattr(logging, log_level.upper()))

    # Формат логов
    log_format = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # File handler с ротацией
    file_handler = RotatingFileHandler(
        log_dir / "radar_sync_service.log",
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=10,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(log_format)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(log_format)

    # Добавляем handlers
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


# Инициализация логгера
log_dir = project_root / "logs"
logger = setup_logging(log_dir)


# ==========================================
# КЛАСС СЕРВИСА СИНХРОНИЗАЦИИ
# ==========================================
class RadarSyncService:
    """
    Daemon-сервис автоматической синхронизации с Платформой Радар
    """

    def __init__(self):
        """
        Инициализация сервиса
        """
        self.running = True
        self.app = None
        self.sync_interval = None
        self.last_sync_time = None
        self.last_sync_status = None
        self.sync_count = 0

        # Регистрация обработчиков сигналов
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

        logger.info("=" * 70)
        logger.info("RADAR SYNC SERVICE - ИНИЦИАЛИЗАЦИЯ")
        logger.info("=" * 70)

    def _signal_handler(self, signum, frame):
        """
        Обработчик системных сигналов для graceful shutdown

        Args:
            signum: Номер сигнала
            frame: Текущий stack frame
        """
        signal_names = {signal.SIGTERM: "SIGTERM", signal.SIGINT: "SIGINT"}

        signal_name = signal_names.get(signum, f"Signal {signum}")
        logger.warning(f"Получен сигнал {signal_name} - инициирована остановка сервиса")

        self.running = False

        # Даем время на завершение текущей синхронизации
        logger.info("Ожидание завершения текущих операций...")
        time.sleep(2)

        logger.info("=" * 70)
        logger.info("RADAR SYNC SERVICE - ОСТАНОВЛЕН")
        logger.info(f"Всего выполнено синхронизаций: {self.sync_count}")
        logger.info(f"Последняя синхронизация: {self.last_sync_time or 'N/A'}")
        logger.info("=" * 70)

        sys.exit(0)

    def initialize_app(self):
        """
        Инициализация Flask приложения

        Returns:
            Flask app instance
        """
        try:
            logger.info("Инициализация Flask приложения...")

            # Создаем приложение
            self.app = create_app()

            # Получаем параметры из конфигурации
            with self.app.app_context():
                self.sync_interval = self.app.config.get("RADAR_SYNC_INTERVAL", 3600)
                radar_url = self.app.config.get("RADAR_BASE_URL", "")
                radar_api_key = self.app.config.get("RADAR_API_KEY", "")
                batch_size = self.app.config.get("RADAR_SYNC_BATCH_SIZE", 1000)
                auto_start = self.app.config.get("RADAR_SYNC_AUTO_START", True)

                # Проверка критичных параметров
                if not radar_url:
                    logger.error("RADAR_BASE_URL не установлен в конфигурации!")
                    logger.error("Проверьте файл .env")
                    return False

                if not radar_api_key:
                    logger.error("RADAR_API_KEY не установлен в конфигурации!")
                    logger.error("Проверьте файл .env")
                    return False

                if not auto_start:
                    logger.warning(
                        "RADAR_SYNC_AUTO_START = False - автоматическая синхронизация отключена"
                    )
                    logger.info(
                        "Для включения установите RADAR_SYNC_AUTO_START=True в .env"
                    )
                    return False

                logger.info("Параметры синхронизации:")
                logger.info(f"  Radar URL:       {radar_url}")
                logger.info(f"  API Key:         {'*' * 20}...{radar_api_key[-8:]}")
                logger.info(
                    f"  Интервал:        {self.sync_interval} сек ({self.sync_interval/3600:.1f} часов)"
                )
                logger.info(f"  Размер batch:    {batch_size}")
                logger.info(f"  Auto start:      {auto_start}")

            logger.info("✓ Flask приложение успешно инициализировано")
            return True

        except Exception as e:
            logger.critical(
                f"Ошибка инициализации Flask приложения: {e}", exc_info=True
            )
            return False

    def run_sync(self):
        """
        Выполнение синхронизации с Платформой Радар
        """
        sync_start = datetime.now()

        logger.info("=" * 70)
        logger.info(f"ЗАПУСК СИНХРОНИЗАЦИИ #{self.sync_count + 1}")
        logger.info(f"Время: {sync_start.strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 70)

        try:
            with self.app.app_context():
                # Запуск синхронизации
                stats = sync_rules_from_radar(db, self.app.config)

                # Обновление статистики сервиса
                self.sync_count += 1
                self.last_sync_time = sync_start
                self.last_sync_status = "success"

                sync_end = datetime.now()
                duration = (sync_end - sync_start).total_seconds()

                logger.info("=" * 70)
                logger.info("СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА УСПЕШНО")
                logger.info("=" * 70)
                logger.info(f"Всего правил:          {stats['total_rules']}")
                logger.info(f"Добавлено:             {stats['rules_added']}")
                logger.info(f"Обновлено:             {stats['rules_updated']}")
                logger.info(f"Пропущено:             {stats['rules_skipped']}")
                logger.info(f"Ошибок:                {stats['rules_errors']}")
                logger.info(f"Техник добавлено:      {stats['techniques_added']}")
                logger.info(f"Метаданных обновлено:  {stats['metadata_updated']}")
                logger.info(f"Время выполнения:      {duration:.1f} сек")
                logger.info(f"Следующая синхронизация через {self.sync_interval} сек")
                logger.info("=" * 70)

        except Exception as e:
            self.last_sync_status = "error"
            logger.error("=" * 70)
            logger.error("ОШИБКА СИНХРОНИЗАЦИИ")
            logger.error("=" * 70)
            logger.error(f"Ошибка: {e}", exc_info=True)
            logger.error("=" * 70)
            logger.warning(f"Повторная попытка через {self.sync_interval} сек")

    def schedule_sync(self):
        """
        Настройка расписания синхронизации
        """
        logger.info("Настройка расписания синхронизации...")

        # Очищаем существующие задачи
        schedule.clear()

        # Настраиваем периодическую синхронизацию
        schedule.every(self.sync_interval).seconds.do(self.run_sync)

        logger.info(f"✓ Синхронизация настроена каждые {self.sync_interval} секунд")

    def start(self):
        """
        Запуск сервиса синхронизации
        """
        logger.info("=" * 70)
        logger.info("RADAR SYNC SERVICE - ЗАПУСК")
        logger.info("=" * 70)

        # Инициализация приложения
        if not self.initialize_app():
            logger.critical("Не удалось инициализировать приложение!")
            sys.exit(1)

        # Настройка расписания
        self.schedule_sync()

        # Первый запуск синхронизации сразу
        logger.info("Выполнение первой синхронизации...")
        self.run_sync()

        # Основной цикл
        logger.info("")
        logger.info("=" * 70)
        logger.info("СЕРВИС СИНХРОНИЗАЦИИ ЗАПУЩЕН И РАБОТАЕТ")
        logger.info(
            "Для остановки нажмите Ctrl+C или выполните: systemctl stop radar-sync"
        )
        logger.info("=" * 70)
        logger.info("")

        # Бесконечный цикл с проверкой расписания
        while self.running:
            try:
                schedule.run_pending()
                time.sleep(60)  # Проверяем расписание каждую минуту

            except KeyboardInterrupt:
                logger.info("Получен KeyboardInterrupt - остановка сервиса")
                self.running = False
                break

            except Exception as e:
                logger.error(f"Неожиданная ошибка в основном цикле: {e}", exc_info=True)
                time.sleep(60)  # Подождем минуту перед продолжением


# ==========================================
# ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СЕРВИСОМ
# ==========================================


def check_already_running():
    """
    Проверка, не запущен ли уже сервис
    """
    pid_file = project_root / "logs" / "radar_sync_service.pid"

    if pid_file.exists():
        try:
            with open(pid_file, "r") as f:
                old_pid = int(f.read().strip())

            # Проверяем существует ли процесс
            try:
                os.kill(old_pid, 0)
                logger.error(f"Сервис уже запущен с PID: {old_pid}")
                logger.error("Остановите существующий процесс перед запуском нового")
                return True
            except OSError:
                # Процесс не существует, удаляем старый PID файл
                pid_file.unlink()

        except Exception as e:
            logger.warning(f"Ошибка проверки PID файла: {e}")

    return False


def write_pid_file():
    """
    Запись PID файла
    """
    pid_file = project_root / "logs" / "radar_sync_service.pid"

    try:
        with open(pid_file, "w") as f:
            f.write(str(os.getpid()))
        logger.info(f"PID файл создан: {pid_file}")

    except Exception as e:
        logger.error(f"Не удалось создать PID файл: {e}")


def cleanup_pid_file():
    """
    Удаление PID файла при выходе
    """
    pid_file = project_root / "logs" / "radar_sync_service.pid"

    try:
        if pid_file.exists():
            pid_file.unlink()
            logger.info("PID файл удален")
    except Exception as e:
        logger.error(f"Ошибка удаления PID файла: {e}")


def print_banner():
    """
    Вывод баннера при запуске
    """
    banner = """
    ╔═══════════════════════════════════════════════════════════════════╗
    ║                                                                   ║
    ║              RADAR SYNC SERVICE - MITRE ATT&CK MATRIX            ║
    ║                                                                   ║
    ║              Автоматическая синхронизация правил                 ║
    ║              корреляции с Платформой Радар                       ║
    ║                                                                   ║
    ║              Версия: 1.0                                         ║
    ║              Автор: ПангеоРадар                                  ║
    ║                                                                   ║
    ╚═══════════════════════════════════════════════════════════════════╝
    """
    print(banner)


# ==========================================
# ТОЧКА ВХОДА
# ==========================================


def main():
    """
    Главная функция - точка входа в приложение
    """
    try:
        # Вывод баннера
        print_banner()

        # Проверка на уже запущенный экземпляр
        if check_already_running():
            sys.exit(1)

        # Запись PID файла
        write_pid_file()

        # Создание и запуск сервиса
        service = RadarSyncService()
        service.start()

    except KeyboardInterrupt:
        logger.info("")
        logger.info("Остановка по запросу пользователя (Ctrl+C)")
        cleanup_pid_file()
        sys.exit(0)

    except Exception as e:
        logger.critical(f"Критическая ошибка: {e}", exc_info=True)
        cleanup_pid_file()
        sys.exit(1)

    finally:
        cleanup_pid_file()


if __name__ == "__main__":
    main()
