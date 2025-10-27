#!/bin/bash

################################################################################
# ПОЛНАЯ УСТАНОВКА MITRE ATT&CK MATRIX + RADAR SYNC
# Автор: ПангеоРадар  
# Версия: 3.0
# Дата: 2025-10-21
#
# Описание:
#   Автоматическая установка всего стека с поддержкой:
#   - Выбора отдельных этапов установки
#   - Интерактивного и автоматического режимов
#   - Пропуска уже установленных компонентов
#   - Детального логирования
#
# Использование:
#   sudo bash install.sh [ОПЦИИ]
#
# Опции:
#   -h, --help              Показать справку
#   -a, --auto              Автоматический режим (без вопросов)
#   -s, --stages STAGES     Установить только указанные этапы (например: 1,3,5)
#   -f, --from STAGE        Начать с указанного этапа
#   -t, --to STAGE          Закончить на указанном этапе
#   --skip-python           Пропустить установку Python
#   --skip-db               Пропустить установку БД
#   --skip-phpmyadmin       Пропустить установку phpMyAdmin
#   --skip-nginx            Пропустить установку Nginx
#   --no-backup             Не создавать резервную копию
#   --db-password PASS      Установить пароль БД
#   --radar-url URL         URL Платформы Радар
#   --radar-key KEY         API ключ Радар
#   -v, --verbose           Подробный вывод
#   -q, --quiet             Тихий режим
################################################################################

set -e

# ==========================================
# ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
# ==========================================
SCRIPT_VERSION="3.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/mitre-matrix-install.log"

# Режимы работы
AUTO_MODE=false
VERBOSE_MODE=false
QUIET_MODE=false
NO_BACKUP=false

# Выбор этапов
STAGES_TO_RUN="all"
START_FROM_STAGE=0
END_AT_STAGE=14

# Пропуск компонентов
SKIP_PYTHON=false
SKIP_DB=false
SKIP_PHPMYADMIN=false
SKIP_NGINX=false

# Конфигурация
PROJECT_DIR="/opt/mitre-matrix"
VENV_DIR="${PROJECT_DIR}/venv"
BACKUP_DIR="/opt/mitre-matrix-backup-$(date +%Y%m%d_%H%M%S)"

DB_NAME="mitre_attack_matrix"
DB_USER="root"
DB_PASS=""
DB_PORT="3306"

APP_USER="mitre-matrix"
APP_GROUP="mitre-matrix"

RADAR_URL=""
RADAR_API_KEY=""
ADMIN_LOGIN="admin"
ADMIN_PASS=""

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# ==========================================
# ФУНКЦИИ ЛОГИРОВАНИЯ
# ==========================================
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

print_banner() {
    if [ "$QUIET_MODE" = false ]; then
        clear
        echo -e "${CYAN}"
        echo "╔════════════════════════════════════════════════════════════════════╗"
        echo "║                                                                    ║"
        echo "║          MITRE ATT&CK MATRIX + RADAR SYNC INSTALLER               ║"
        echo "║                                                                    ║"
        echo "║          Полная автоматическая установка v${SCRIPT_VERSION}                      ║"
        echo "║          Автор: ПангеоРадар                                       ║"
        echo "║                                                                    ║"
        echo "╚════════════════════════════════════════════════════════════════════╝"
        echo -e "${NC}"
    fi
    log_message "=== Начало установки MITRE ATT&CK Matrix v${SCRIPT_VERSION} ==="
}

print_step() {
    if [ "$QUIET_MODE" = false ]; then
        echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║  ЭТАП $1${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════╝${NC}\n"
    fi
    log_message ">>> ЭТАП: $1"
}

print_info() {
    if [ "$QUIET_MODE" = false ]; then
        echo -e "${GREEN}[✓]${NC} $1"
    fi
    log_message "[INFO] $1"
}

print_warning() {
    if [ "$QUIET_MODE" = false ]; then
        echo -e "${YELLOW}[⚠]${NC} $1"
    fi
    log_message "[WARNING] $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1" >&2
    log_message "[ERROR] $1"
}

print_substep() {
    if [ "$QUIET_MODE" = false ]; then
        echo -e "${CYAN}  →${NC} $1"
    fi
    [ "$VERBOSE_MODE" = true ] && log_message "  → $1"
}

# ==========================================
# СПРАВКА
# ==========================================
show_help() {
    cat << EOF
MITRE ATT&CK Matrix + Radar Sync Installer v${SCRIPT_VERSION}

Использование: sudo bash install.sh [ОПЦИИ]

ОСНОВНЫЕ ОПЦИИ:
  -h, --help                 Показать эту справку
  -a, --auto                 Автоматический режим (без вопросов)
  -v, --verbose              Подробный вывод
  -q, --quiet                Тихий режим (только ошибки)

ВЫБОР ЭТАПОВ:
  -s, --stages STAGES        Установить только указанные этапы (например: 1,3,5-7)
  -f, --from STAGE           Начать с указанного этапа (0-14)
  -t, --to STAGE             Закончить на указанном этапе (0-14)

ПРОПУСК КОМПОНЕНТОВ:
  --skip-python              Пропустить установку Python 3.11
  --skip-db                  Пропустить установку MariaDB
  --skip-phpmyadmin          Пропустить установку phpMyAdmin
  --skip-nginx               Пропустить установку Nginx
  --no-backup                Не создавать резервную копию

ПАРАМЕТРЫ КОНФИГУРАЦИИ:
  --db-password PASS         Установить пароль БД
  --radar-url URL            URL Платформы Радар
  --radar-key KEY            API ключ Радар
  --admin-login LOGIN        Логин администратора
  --admin-password PASS      Пароль администратора
  --project-dir DIR          Директория проекта (/opt/mitre-matrix)

ЭТАПЫ УСТАНОВКИ:
  0  - Подготовка системы
  1  - Установка Python 3.11
  2  - Установка MariaDB
  3  - Создание базы данных
  4  - Установка phpMyAdmin
  5  - Создание пользователя приложения
  6  - Создание структуры проекта
  7  - Создание virtual environment
  8  - Установка Python зависимостей
  9  - Создание конфигурации (.env)
  10 - Создание systemd сервисов
  11 - Установка Nginx
  12 - Настройка firewall
  13 - Запуск сервисов
  14 - Создание администратора

ПРИМЕРЫ:
  # Полная установка в автоматическом режиме
  sudo bash install.sh --auto --radar-url https://172.30.250.162 --radar-key XXXXXXXX

  # Установить только этапы 7-10 (venv и зависимости)
  sudo bash install.sh --stages 7-10

  # Установка с пропуском phpMyAdmin и Nginx
  sudo bash install.sh --skip-phpmyadmin --skip-nginx

  # Начать с этапа 5 до конца
  sudo bash install.sh --from 5

  # Установить только создание сервисов и их запуск
  sudo bash install.sh --stages 10,13

  # Тихая установка с логами
  sudo bash install.sh --quiet --auto

ЛОГИ:
  Лог установки: ${LOG_FILE}
  Логи приложения: /opt/mitre-matrix/logs/

ПОДДЕРЖКА:
  Email: support@pangeoradar.ru
  Docs: https://docs.pangeoradar.ru

EOF
}

# ==========================================
# ПАРСИНГ АРГУМЕНТОВ
# ==========================================
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -a|--auto)
                AUTO_MODE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE_MODE=true
                shift
                ;;
            -q|--quiet)
                QUIET_MODE=true
                shift
                ;;
            -s|--stages)
                STAGES_TO_RUN="$2"
                shift 2
                ;;
            -f|--from)
                START_FROM_STAGE="$2"
                shift 2
                ;;
            -t|--to)
                END_AT_STAGE="$2"
                shift 2
                ;;
            --skip-python)
                SKIP_PYTHON=true
                shift
                ;;
            --skip-db)
                SKIP_DB=true
                shift
                ;;
            --skip-phpmyadmin)
                SKIP_PHPMYADMIN=true
                shift
                ;;
            --skip-nginx)
                SKIP_NGINX=true
                shift
                ;;
            --no-backup)
                NO_BACKUP=true
                shift
                ;;
            --db-password)
                DB_PASS="$2"
                shift 2
                ;;
            --radar-url)
                RADAR_URL="$2"
                shift 2
                ;;
            --radar-key)
                RADAR_API_KEY="$2"
                shift 2
                ;;
            --admin-login)
                ADMIN_LOGIN="$2"
                shift 2
                ;;
            --admin-password)
                ADMIN_PASS="$2"
                shift 2
                ;;
            --project-dir)
                PROJECT_DIR="$2"
                VENV_DIR="${PROJECT_DIR}/venv"
                shift 2
                ;;
            *)
                print_error "Неизвестная опция: $1"
                echo "Используйте --help для справки"
                exit 1
                ;;
        esac
    done
}

# ==========================================
# ПРОВЕРКА НЕОБХОДИМОСТИ ЗАПУСКА ЭТАПА
# ==========================================
should_run_stage() {
    local stage=$1
    
    # Проверка диапазона
    if [ "$stage" -lt "$START_FROM_STAGE" ] || [ "$stage" -gt "$END_AT_STAGE" ]; then
        return 1
    fi
    
    # Проверка конкретных этапов
    if [ "$STAGES_TO_RUN" != "all" ]; then
        # Парсинг списка этапов (поддержка: 1,3,5-7,10)
        local stages_array
        IFS=',' read -ra stages_array <<< "$STAGES_TO_RUN"
        
        for stage_spec in "${stages_array[@]}"; do
            if [[ "$stage_spec" =~ ^([0-9]+)-([0-9]+)$ ]]; then
                # Диапазон
                local range_start="${BASH_REMATCH[1]}"
                local range_end="${BASH_REMATCH[2]}"
                if [ "$stage" -ge "$range_start" ] && [ "$stage" -le "$range_end" ]; then
                    return 0
                fi
            elif [ "$stage" -eq "$stage_spec" ]; then
                # Конкретный этап
                return 0
            fi
        done
        return 1
    fi
    
    # Проверка пропусков
    case $stage in
        1)
            [ "$SKIP_PYTHON" = true ] && return 1
            ;;
        2|3)
            [ "$SKIP_DB" = true ] && return 1
            ;;
        4)
            [ "$SKIP_PHPMYADMIN" = true ] && return 1
            ;;
        11)
            [ "$SKIP_NGINX" = true ] && return 1
            ;;
    esac
    
    return 0
}

# ==========================================
# ПРОВЕРКА ПРАВ ROOT
# ==========================================
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "Этот скрипт должен быть запущен с правами root"
        echo "Используйте: sudo bash install.sh"
        exit 1
    fi
}

# ==========================================
# ОПРЕДЕЛЕНИЕ ОС
# ==========================================
detect_os() {
    print_substep "Определение операционной системы..."
    
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
        
        case $OS in
            ubuntu|debian)
                PKG_MANAGER="apt-get"
                PKG_UPDATE="apt-get update"
                PKG_INSTALL="apt-get install -y"
                ;;
            centos|rhel|rocky|almalinux)
                PKG_MANAGER="yum"
                PKG_UPDATE="yum update -y"
                PKG_INSTALL="yum install -y"
                ;;
            *)
                print_error "Неподдерживаемая ОС: $OS"
                exit 1
                ;;
        esac
        
        print_info "Обнаружена ОС: $PRETTY_NAME"
        log_message "OS: $PRETTY_NAME"
    else
        print_error "Не удалось определить ОС"
        exit 1
    fi
}

# ==========================================
# ИНТЕРАКТИВНЫЙ ВЫБОР ЭТАПОВ
# ==========================================
interactive_stage_selection() {
    if [ "$AUTO_MODE" = true ]; then
        return
    fi
    
    echo ""
    print_info "Выберите режим установки:"
    echo "  1) Полная установка (все этапы)"
    echo "  2) Выборочная установка (выбрать этапы)"
    echo "  3) Обновление (только зависимости и сервисы)"
    echo "  4) Минимальная (без БД и дополнительных сервисов)"
    echo ""
    
    read -p "Ваш выбор [1-4]: " choice
    
    case $choice in
        1)
            STAGES_TO_RUN="all"
            ;;
        2)
            echo ""
            echo "Доступные этапы:"
            echo "  0  - Подготовка системы"
            echo "  1  - Установка Python 3.11"
            echo "  2  - Установка MariaDB"
            echo "  3  - Создание базы данных"
            echo "  4  - Установка phpMyAdmin"
            echo "  5  - Создание пользователя"
            echo "  6  - Создание структуры"
            echo "  7  - Virtual environment"
            echo "  8  - Python зависимости"
            echo "  9  - Конфигурация .env"
            echo "  10 - Systemd сервисы"
            echo "  11 - Nginx"
            echo "  12 - Firewall"
            echo "  13 - Запуск сервисов"
            echo "  14 - Создание админа"
            echo ""
            read -p "Введите этапы (например: 1,3,5-7,10): " STAGES_TO_RUN
            ;;
        3)
            STAGES_TO_RUN="7-10,13"
            SKIP_PYTHON=true
            SKIP_DB=true
            SKIP_PHPMYADMIN=true
            SKIP_NGINX=true
            ;;
        4)
            SKIP_DB=true
            SKIP_PHPMYADMIN=true
            SKIP_NGINX=true
            ;;
        *)
            print_error "Неверный выбор"
            exit 1
            ;;
    esac
}

# ==========================================
# ПОДТВЕРЖДЕНИЕ ПАРАМЕТРОВ
# ==========================================
confirm_parameters() {
    if [ "$AUTO_MODE" = true ]; then
        return
    fi
    
    echo ""
    print_info "Параметры установки:"
    echo "  Директория проекта:  $PROJECT_DIR"
    echo "  База данных:         $DB_NAME"
    echo "  Режим:               ${STAGES_TO_RUN}"
    echo "  Пропустить Python:   $SKIP_PYTHON"
    echo "  Пропустить БД:       $SKIP_DB"
    echo "  Пропустить phpMyAdmin: $SKIP_PHPMYADMIN"
    echo "  Пропустить Nginx:    $SKIP_NGINX"
    echo ""
    
    read -p "Продолжить установку? (y/n): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Установка отменена пользователем"
        exit 0
    fi
}

# ==========================================
# ЭТАП 0: ПОДГОТОВКА
# ==========================================
stage_0_preparation() {
    print_step "0: ПОДГОТОВКА СИСТЕМЫ"
    
    # Обновление списка пакетов
    print_substep "Обновление списка пакетов..."
    $PKG_UPDATE > /dev/null 2>&1
    print_info "Список пакетов обновлен"
    
    # Установка базовых утилит
    print_substep "Установка базовых утилит..."
    $PKG_INSTALL curl wget git vim nano htop net-tools software-properties-common \
        apt-transport-https ca-certificates gnupg lsb-release > /dev/null 2>&1
    print_info "Базовые утилиты установлены"
    
    # Создание резервной копии
    if [ -d "$PROJECT_DIR" ] && [ "$NO_BACKUP" = false ]; then
        print_warning "Обнаружена существующая установка"
        
        if [ "$AUTO_MODE" = false ]; then
            read -p "Создать резервную копию? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_substep "Создание резервной копии..."
                cp -r "$PROJECT_DIR" "$BACKUP_DIR"
                print_info "Резервная копия создана: $BACKUP_DIR"
            fi
        else
            print_substep "Создание резервной копии..."
            cp -r "$PROJECT_DIR" "$BACKUP_DIR"
            print_info "Резервная копия создана: $BACKUP_DIR"
        fi
    fi
    
    return 0
}

# ==========================================
# ЭТАП 1: УСТАНОВКА PYTHON 3.11
# ==========================================
stage_1_install_python() {
    print_step "1: УСТАНОВКА PYTHON 3.11"
    
    # Проверка текущей версии Python
    if command -v python3.11 &> /dev/null; then
        PYTHON_VERSION=$(python3.11 --version | awk '{print $2}')
        print_info "Python 3.11 уже установлен (версия $PYTHON_VERSION)"
        return 0
    fi
    
    print_substep "Добавление репозитория deadsnakes PPA..."
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        add-apt-repository -y ppa:deadsnakes/ppa > /dev/null 2>&1
        apt-get update > /dev/null 2>&1
        
        print_substep "Установка Python 3.11..."
        $PKG_INSTALL python3.11 python3.11-venv python3.11-dev python3.11-distutils \
            python3-pip build-essential libssl-dev libffi-dev libmysqlclient-dev \
            pkg-config > /dev/null 2>&1
            
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        $PKG_INSTALL gcc openssl-devel bzip2-devel libffi-devel \
            mariadb-devel > /dev/null 2>&1
        
        # Компиляция Python 3.11 из исходников
        print_substep "Загрузка Python 3.11..."
        cd /usr/src
        wget -q https://www.python.org/ftp/python/3.11.6/Python-3.11.6.tgz
        tar xzf Python-3.11.6.tgz
        cd Python-3.11.6
        
        print_substep "Компиляция Python 3.11 (это может занять время)..."
        ./configure --enable-optimizations --with-ensurepip=install > /dev/null 2>&1
        make -j$(nproc) > /dev/null 2>&1
        make altinstall > /dev/null 2>&1
        
        print_info "Python 3.11 скомпилирован и установлен"
        cd ~
    fi
    
    # Проверка установки
    if command -v python3.11 &> /dev/null; then
        PYTHON_VERSION=$(python3.11 --version | awk '{print $2}')
        print_info "Python 3.11 успешно установлен (версия $PYTHON_VERSION)"
    else
        print_error "Не удалось установить Python 3.11"
        return 1
    fi
    
    # Обновление pip
    print_substep "Обновление pip..."
    python3.11 -m pip install --upgrade pip setuptools wheel > /dev/null 2>&1
    print_info "pip обновлен до последней версии"
    
    return 0
}

# ==========================================
# ЭТАП 2: УСТАНОВКА MARIADB
# ==========================================
stage_2_install_mariadb() {
    print_step "2: УСТАНОВКА И НАСТРОЙКА MARIADB"
    
    # Проверка установки MariaDB
    if systemctl is-active --quiet mariadb || systemctl is-active --quiet mysql; then
        print_info "MariaDB уже установлен и запущен"
    else
        print_substep "Установка MariaDB Server..."
        $PKG_INSTALL mariadb-server mariadb-client > /dev/null 2>&1
        
        print_substep "Запуск MariaDB..."
        systemctl start mariadb
        systemctl enable mariadb > /dev/null 2>&1
        
        print_info "MariaDB установлен и запущен"
    fi
    
    # Генерация пароля root
    if [ -z "$DB_PASS" ]; then
        DB_PASS=$(openssl rand -base64 32)
        print_info "Сгенерирован пароль для MySQL root"
    fi
    
    # Настройка root пароля
    print_substep "Настройка безопасности MySQL..."
    mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${DB_PASS}';" 2>/dev/null || \
    mysqladmin -u root password "${DB_PASS}" 2>/dev/null
    
    # Создание файла конфигурации MySQL для root
    cat > /root/.my.cnf << EOF
[client]
user=root
password=${DB_PASS}
EOF
    chmod 600 /root/.my.cnf
    
    # Удаление анонимных пользователей и тестовой БД
    mysql -u root -p"${DB_PASS}" << EOF > /dev/null 2>&1
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
EOF
    
    print_info "MariaDB настроен и защищен"
    
    return 0
}

# ==========================================
# ЭТАП 3: СОЗДАНИЕ БАЗЫ ДАННЫХ
# ==========================================
stage_3_create_database() {
    print_step "3: СОЗДАНИЕ БАЗЫ ДАННЫХ"
    
    print_substep "Создание базы данных ${DB_NAME}..."
    
    mysql -u root -p"${DB_PASS}" << EOF
DROP DATABASE IF EXISTS ${DB_NAME};
CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
FLUSH PRIVILEGES;
EOF
    
    print_info "База данных ${DB_NAME} создана"
    
    # Импорт структуры БД, если файл существует
    if [ -f "${SCRIPT_DIR}/mitre_attack_matrix-7.sql" ]; then
        print_substep "Импорт структуры БД..."
        mysql -u root -p"${DB_PASS}" ${DB_NAME} < "${SCRIPT_DIR}/mitre_attack_matrix-7.sql"
        print_info "Структура БД импортирована"
    else
        print_warning "Файл mitre_attack_matrix-7.sql не найден"
        print_warning "Структуру БД нужно будет импортировать вручную"
    fi
    
    return 0
}

# ==========================================
# ЭТАП 4: УСТАНОВКА PHPMYADMIN
# ==========================================
stage_4_install_phpmyadmin() {
    print_step "4: УСТАНОВКА PHPMYADMIN"
    
    print_substep "Установка PHP и зависимостей..."
    $PKG_INSTALL php php-cli php-fpm php-mysql php-mbstring php-xml \
        php-curl php-zip php-gd php-intl php-bcmath > /dev/null 2>&1
    
    print_substep "Загрузка phpMyAdmin..."
    cd /tmp
    PHPMYADMIN_VERSION="5.2.1"
    wget -q "https://files.phpmyadmin.net/phpMyAdmin/${PHPMYADMIN_VERSION}/phpMyAdmin-${PHPMYADMIN_VERSION}-all-languages.tar.gz"
    
    print_substep "Установка phpMyAdmin..."
    tar xzf phpMyAdmin-${PHPMYADMIN_VERSION}-all-languages.tar.gz
    rm -rf /usr/share/phpmyadmin
    mv phpMyAdmin-${PHPMYADMIN_VERSION}-all-languages /usr/share/phpmyadmin
    
    # Создание конфига
    mkdir -p /usr/share/phpmyadmin/tmp
    chmod 777 /usr/share/phpmyadmin/tmp
    
    cat > /usr/share/phpmyadmin/config.inc.php << 'EOF'
<?php
$cfg['blowfish_secret'] = 'CHANGE_THIS_SECRET_KEY_TO_SOMETHING_RANDOM';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
$cfg['TempDir'] = '/usr/share/phpmyadmin/tmp';
?>
EOF
    
    # Генерация blowfish secret
    BLOWFISH_SECRET=$(openssl rand -base64 32)
    sed -i "s/CHANGE_THIS_SECRET_KEY_TO_SOMETHING_RANDOM/${BLOWFISH_SECRET}/" \
        /usr/share/phpmyadmin/config.inc.php
    
    print_info "phpMyAdmin установлен в /usr/share/phpmyadmin"
    
    return 0
}

# ==========================================
# ЭТАП 5: СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ
# ==========================================
stage_5_create_user() {
    print_step "5: СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ ПРИЛОЖЕНИЯ"
    
    # Создание группы
    if ! getent group $APP_GROUP > /dev/null 2>&1; then
        print_substep "Создание группы ${APP_GROUP}..."
        groupadd --system $APP_GROUP
        print_info "Группа ${APP_GROUP} создана"
    else
        print_info "Группа ${APP_GROUP} уже существует"
    fi
    
    # Создание пользователя
    if ! id -u $APP_USER > /dev/null 2>&1; then
        print_substep "Создание пользователя ${APP_USER}..."
        useradd --system --gid $APP_GROUP --shell /bin/bash \
            --home-dir $PROJECT_DIR $APP_USER
        print_info "Пользователь ${APP_USER} создан"
    else
        print_info "Пользователь ${APP_USER} уже существует"
    fi
    
    return 0
}

# ==========================================
# ЭТАП 6: СОЗДАНИЕ СТРУКТУРЫ ПРОЕКТА
# ==========================================
stage_6_create_structure() {
    print_step "6: СОЗДАНИЕ СТРУКТУРЫ ПРОЕКТА"
    
    print_substep "Создание директорий..."
    
    mkdir -p $PROJECT_DIR/{blueprints,models,utils,static/{css,js},templates,logs,uploads}
    
    # Установка прав
    chown -R $APP_USER:$APP_GROUP $PROJECT_DIR
    chmod -R 755 $PROJECT_DIR
    chmod -R 777 $PROJECT_DIR/logs
    chmod -R 777 $PROJECT_DIR/uploads
    
    print_info "Структура проекта создана"
    
    return 0
}

# ==========================================
# ЭТАП 7: СОЗДАНИЕ VIRTUAL ENVIRONMENT
# ==========================================
stage_7_create_venv() {
    print_step "7: СОЗДАНИЕ VIRTUAL ENVIRONMENT"
    
    print_substep "Создание venv в ${VENV_DIR}..."
    
    # Удаление старого venv если существует
    if [ -d "$VENV_DIR" ]; then
        print_warning "Удаление существующего venv..."
        rm -rf "$VENV_DIR"
    fi
    
    # Создание нового venv
    python3.11 -m venv "$VENV_DIR"
    
    # Активация venv
    source "${VENV_DIR}/bin/activate"
    
    print_info "Virtual environment создан"
    
    # Обновление pip в venv
    print_substep "Обновление pip в venv..."
    pip install --quiet --upgrade pip setuptools wheel
    
    print_info "pip обновлен в venv"
    
    return 0
}

# ==========================================
# ЭТАП 8: УСТАНОВКА PYTHON ЗАВИСИМОСТЕЙ
# ==========================================
stage_8_install_dependencies() {
    print_step "8: УСТАНОВКА PYTHON ЗАВИСИМОСТЕЙ"
    
    # Активация venv
    source "${VENV_DIR}/bin/activate"
    
    # Создание requirements.txt если не существует
    if [ ! -f "${PROJECT_DIR}/requirements.txt" ]; then
        print_substep "Создание requirements.txt..."
        cat > "${PROJECT_DIR}/requirements.txt" << 'EOF'
Flask==3.0.0
Flask-SQLAlchemy==3.1.1
Flask-JWT-Extended==4.6.0
Flask-Cors==4.0.0
PyMySQL==1.1.0
cryptography==41.0.7
python-dotenv==1.0.0
requests==2.31.0
urllib3==2.1.0
python-dateutil==2.8.2
schedule==1.2.0
SQLAlchemy==2.0.23
Werkzeug==3.0.1
gunicorn==21.2.0
gevent==23.9.1
EOF
    fi
    
    print_substep "Установка зависимостей из requirements.txt..."
    pip install --quiet -r "${PROJECT_DIR}/requirements.txt"
    
    print_info "Все Python зависимости установлены"
    
    return 0
}

# ==========================================
# ЭТАП 9: СОЗДАНИЕ КОНФИГУРАЦИИ .env
# ==========================================
stage_9_create_env() {
    print_step "9: СОЗДАНИЕ ФАЙЛА КОНФИГУРАЦИИ"
    
    # Запрос параметров Radar если не указаны
    if [ -z "$RADAR_URL" ] && [ "$AUTO_MODE" = false ]; then
        echo ""
        print_substep "Настройка интеграции с Платформой Радар"
        echo ""
        read -p "Введите URL Радар (например: https://172.30.250.162): " RADAR_URL
        read -p "Введите API ключ Радар: " RADAR_API_KEY
    fi
    
    # Генерация секретных ключей
    SECRET_KEY=$(openssl rand -hex 32)
    JWT_SECRET_KEY=$(openssl rand -hex 32)
    
    print_substep "Создание файла .env..."
    
    cat > "${PROJECT_DIR}/.env" << EOF
# ==========================================
# DATABASE SETTINGS
# ==========================================
DB_HOST=127.0.0.1
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
DB_CHARSET=utf8mb4

# SQLAlchemy settings
SQLALCHEMY_ECHO=False
SQLALCHEMY_POOL_SIZE=10
SQLALCHEMY_MAX_OVERFLOW=20
SQLALCHEMY_POOL_TIMEOUT=30
SQLALCHEMY_POOL_RECYCLE=3600

# ==========================================
# RADAR PLATFORM INTEGRATION
# ==========================================
RADAR_BASE_URL=${RADAR_URL}
RADAR_API_KEY=${RADAR_API_KEY}
RADAR_SYNC_INTERVAL=3600
RADAR_SYNC_BATCH_SIZE=1000
RADAR_SYNC_AUTO_START=True
RADAR_VERIFY_SSL=False
RADAR_REQUEST_TIMEOUT=30
RADAR_MAX_RETRIES=3

# ==========================================
# SECURITY SETTINGS
# ==========================================
SECRET_KEY=${SECRET_KEY}
JWT_SECRET_KEY=${JWT_SECRET_KEY}
JWT_ACCESS_TOKEN_HOURS=1
JWT_REFRESH_TOKEN_DAYS=30

# Session settings
SESSION_COOKIE_SECURE=False
SESSION_COOKIE_HTTPONLY=True
SESSION_COOKIE_SAMESITE=Lax

# CORS settings
CORS_ORIGINS=*

# ==========================================
# LOGGING SETTINGS
# ==========================================
LOG_LEVEL=INFO
LOG_FILE=logs/app.log
LOG_MAX_BYTES=10485760
LOG_BACKUP_COUNT=10
LOG_SQL_QUERIES=False

# ==========================================
# APPLICATION SETTINGS
# ==========================================
FLASK_ENV=production
PAGINATION_PER_PAGE=50
PAGINATION_MAX_PER_PAGE=1000
MAX_CONTENT_LENGTH=16777216
UPLOAD_FOLDER=uploads
TIMEZONE=Europe/Moscow

# JSON settings
JSONIFY_PRETTYPRINT=True

# ==========================================
# CACHE SETTINGS
# ==========================================
CACHE_TYPE=simple
CACHE_DEFAULT_TIMEOUT=300

# ==========================================
# MITRE ATT&CK SPECIFIC
# ==========================================
MITRE_ATTACK_VERSION=v14.1
MITRE_UPDATE_INTERVAL=86400
MATRIX_DEFAULT_VIEW=enterprise

# ==========================================
# AUDIT SETTINGS
# ==========================================
AUDIT_ENABLED=True
AUDIT_LOG_FILE=logs/audit.log
AUDIT_RETENTION_DAYS=90

# ==========================================
# PERFORMANCE SETTINGS
# ==========================================
REQUEST_TIMEOUT=30
RATELIMIT_ENABLED=False
RATELIMIT_DEFAULT=1000 per hour
EOF
    
    chmod 600 "${PROJECT_DIR}/.env"
    chown $APP_USER:$APP_GROUP "${PROJECT_DIR}/.env"
    
    print_info "Файл .env создан"
    
    return 0
}

# ==========================================
# ЭТАП 10: СОЗДАНИЕ SYSTEMD СЕРВИСОВ
# ==========================================
stage_10_create_services() {
    print_step "10: СОЗДАНИЕ SYSTEMD СЕРВИСОВ"
    
    # ========== Сервис основного приложения ==========
    print_substep "Создание сервиса pangeo-matrix..."
    
    cat > /etc/systemd/system/pangeo-matrix.service << EOF
[Unit]
Description=MITRE ATT&CK Matrix API - Pangeo Radar Integration
Documentation=https://docs.pangeoradar.ru
After=network-online.target mysql.service mariadb.service
Wants=network-online.target
Requires=mysql.service

[Service]
Type=notify
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$PROJECT_DIR

Environment="PATH=${VENV_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONPATH=$PROJECT_DIR"
Environment="PYTHONUNBUFFERED=1"

ExecStart=${VENV_DIR}/bin/gunicorn \\
    --workers 4 \\
    --threads 2 \\
    --worker-class gthread \\
    --bind 0.0.0.0:5000 \\
    --timeout 120 \\
    --graceful-timeout 30 \\
    --keep-alive 5 \\
    --max-requests 1000 \\
    --max-requests-jitter 50 \\
    --access-logfile ${PROJECT_DIR}/logs/access.log \\
    --error-logfile ${PROJECT_DIR}/logs/error.log \\
    --log-level info \\
    --pid ${PROJECT_DIR}/logs/gunicorn.pid \\
    wsgi:app

Restart=always
RestartSec=5
StartLimitInterval=300
StartLimitBurst=5

ExecReload=/bin/kill -s HUP \$MAINPID
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30

StandardOutput=journal
StandardError=journal
SyslogIdentifier=pangeo-matrix

NoNewPrivileges=true
PrivateTmp=true

LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF
    
    print_info "Сервис pangeo-matrix создан"
    
    # ========== Сервис синхронизации ==========
    print_substep "Создание сервиса radar-sync..."
    
    cat > /etc/systemd/system/radar-sync.service << EOF
[Unit]
Description=Radar Sync Service - MITRE ATT&CK Matrix Synchronization
Documentation=https://docs.pangeoradar.ru
After=network-online.target mysql.service mariadb.service pangeo-matrix.service
Wants=network-online.target
Requires=mysql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$PROJECT_DIR

Environment="PATH=${VENV_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONPATH=$PROJECT_DIR"
Environment="PYTHONUNBUFFERED=1"

ExecStart=${VENV_DIR}/bin/python3 ${PROJECT_DIR}/models/radar_sync_service.py

Restart=always
RestartSec=10
StartLimitInterval=300
StartLimitBurst=5

KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30

StandardOutput=journal
StandardError=journal
SyslogIdentifier=radar-sync

NoNewPrivileges=true
PrivateTmp=true

LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF
    
    print_info "Сервис radar-sync создан"
    
    # Перезагрузка systemd
    print_substep "Перезагрузка systemd daemon..."
    systemctl daemon-reload
    
    print_info "Systemd сервисы созданы"
    
    return 0
}

# ==========================================
# ЭТАП 11: УСТАНОВКА NGINX
# ==========================================
stage_11_install_nginx() {
    print_step "11: УСТАНОВКА И НАСТРОЙКА NGINX"
    
    # Установка Nginx
    if ! command -v nginx &> /dev/null; then
        print_substep "Установка Nginx..."
        $PKG_INSTALL nginx > /dev/null 2>&1
        print_info "Nginx установлен"
    else
        print_info "Nginx уже установлен"
    fi
    
    # Создание конфигурации для MITRE Matrix
    print_substep "Создание конфигурации Nginx..."
    
    cat > /etc/nginx/sites-available/mitre-matrix << 'EOF'
upstream mitre_matrix {
    server 127.0.0.1:5000 fail_timeout=0;
}

server {
    listen 80;
    server_name _;
    
    client_max_body_size 16M;
    
    # Основное приложение
    location / {
        proxy_pass http://mitre_matrix;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
        proxy_buffering off;
        
        proxy_connect_timeout 120;
        proxy_send_timeout 120;
        proxy_read_timeout 120;
    }
    
    # phpMyAdmin
    location /phpmyadmin {
        alias /usr/share/phpmyadmin;
        index index.php;
        
        location ~ ^/phpmyadmin/(.+\.php)$ {
            alias /usr/share/phpmyadmin/$1;
            fastcgi_pass unix:/run/php/php-fpm.sock;
            fastcgi_index index.php;
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME $request_filename;
        }
        
        location ~* ^/phpmyadmin/(.+\.(jpg|jpeg|gif|css|png|js|ico|html|xml|txt))$ {
            alias /usr/share/phpmyadmin/$1;
        }
    }
    
    # Статические файлы
    location /static {
        alias /opt/mitre-matrix/static;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    # Включение конфигурации
    if [ ! -L /etc/nginx/sites-enabled/mitre-matrix ]; then
        ln -s /etc/nginx/sites-available/mitre-matrix /etc/nginx/sites-enabled/
    fi
    
    # Удаление дефолтной конфигурации
    rm -f /etc/nginx/sites-enabled/default
    
    # Проверка конфигурации
    print_substep "Проверка конфигурации Nginx..."
    if nginx -t > /dev/null 2>&1; then
        print_info "Конфигурация Nginx корректна"
    else
        print_error "Ошибка в конфигурации Nginx"
        nginx -t
        return 1
    fi
    
    # Запуск Nginx
    print_substep "Запуск Nginx..."
    systemctl restart nginx
    systemctl enable nginx > /dev/null 2>&1
    
    print_info "Nginx настроен и запущен"
    
    return 0
}

# ==========================================
# ЭТАП 12: НАСТРОЙКА FIREWALL
# ==========================================
stage_12_configure_firewall() {
    print_step "12: НАСТРОЙКА FIREWALL"
    
    if command -v ufw &> /dev/null; then
        print_substep "Настройка UFW..."
        ufw allow 80/tcp > /dev/null 2>&1
        ufw allow 443/tcp > /dev/null 2>&1
        ufw allow 22/tcp > /dev/null 2>&1
        print_info "UFW настроен"
    elif command -v firewall-cmd &> /dev/null; then
        print_substep "Настройка firewalld..."
        firewall-cmd --permanent --add-service=http > /dev/null 2>&1
        firewall-cmd --permanent --add-service=https > /dev/null 2>&1
        firewall-cmd --reload > /dev/null 2>&1
        print_info "firewalld настроен"
    else
        print_warning "Firewall не обнаружен"
    fi
    
    return 0
}

# ==========================================
# ЭТАП 13: ЗАПУСК СЕРВИСОВ
# ==========================================
stage_13_start_services() {
    print_step "13: ЗАПУСК СЕРВИСОВ"
    
    # Включение автозапуска
    print_substep "Включение автозапуска сервисов..."
    systemctl enable pangeo-matrix.service > /dev/null 2>&1
    systemctl enable radar-sync.service > /dev/null 2>&1
    print_info "Автозапуск включен"
    
    # Запуск основного приложения
    print_substep "Запуск pangeo-matrix..."
    systemctl start pangeo-matrix.service
    sleep 3
    
    if systemctl is-active --quiet pangeo-matrix.service; then
        print_info "Сервис pangeo-matrix запущен"
    else
        print_error "Не удалось запустить pangeo-matrix"
        journalctl -u pangeo-matrix.service -n 20 --no-pager
        return 1
    fi
    
    # Запуск сервиса синхронизации
    print_substep "Запуск radar-sync..."
    systemctl start radar-sync.service
    sleep 3
    
    if systemctl is-active --quiet radar-sync.service; then
        print_info "Сервис radar-sync запущен"
    else
        print_warning "Не удалось запустить radar-sync (проверьте настройки Radar)"
    fi
    
    return 0
}

# ==========================================
# ЭТАП 14: СОЗДАНИЕ АДМИНА
# ==========================================
stage_14_create_admin() {
    print_step "14: СОЗДАНИЕ АДМИНИСТРАТОРА"
    
    if [ "$AUTO_MODE" = false ]; then
        echo ""
        print_substep "Создание администратора системы"
        echo ""
        
        read -p "Логин администратора [admin]: " input_login
        ADMIN_LOGIN=${input_login:-admin}
        
        read -sp "Пароль администратора: " input_pass
        echo ""
        ADMIN_PASS=$input_pass
    fi
    
    if [ -z "$ADMIN_PASS" ]; then
        ADMIN_PASS=$(openssl rand -base64 12)
        print_warning "Сгенерирован пароль: ${ADMIN_PASS}"
    fi
    
    # Создание скрипта для добавления админа
    cat > /tmp/create_admin.py << EOF
#!/usr/bin/env python3
import sys
sys.path.insert(0, '${PROJECT_DIR}')
from app import create_app
from models.database import db
from werkzeug.security import generate_password_hash
import uuid

app = create_app()
with app.app_context():
    try:
        # Проверка существования пользователя
        cursor = db.session.execute(
            db.text("SELECT id FROM users WHERE username = :username"),
            {'username': '${ADMIN_LOGIN}'}
        )
        if cursor.fetchone():
            print("Пользователь уже существует")
        else:
            user_id = str(uuid.uuid4())
            password_hash = generate_password_hash('${ADMIN_PASS}')
            
            db.session.execute(
                db.text("""INSERT INTO users (id, username, email, password_hash, role, active, created_at)
                   VALUES (:id, :username, :email, :password, 'admin', 1, NOW())"""),
                {
                    'id': user_id,
                    'username': '${ADMIN_LOGIN}',
                    'email': '${ADMIN_LOGIN}@local.host',
                    'password': password_hash
                }
            )
            db.session.commit()
            print("Администратор создан успешно")
    except Exception as e:
        print(f"Ошибка: {e}")
        sys.exit(1)
EOF
    
    chmod +x /tmp/create_admin.py
    
    # Активация venv и выполнение скрипта
    source "${VENV_DIR}/bin/activate"
    python3 /tmp/create_admin.py
    rm -f /tmp/create_admin.py
    
    print_info "Администратор создан"
    
    return 0
}

# ==========================================
# ФИНАЛЬНЫЙ ВЫВОД
# ==========================================
print_final_info() {
    clear
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                    ║"
    echo "║                    УСТАНОВКА ЗАВЕРШЕНА УСПЕШНО!                   ║"
    echo "║                                                                    ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
    
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  ИНФОРМАЦИЯ О СИСТЕМЕ${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}\n"
    
    SERVER_IP=$(hostname -I | awk '{print $1}')
    
    echo -e "${WHITE}📦 Установленные компоненты:${NC}"
    echo "   • Python 3.11 + Virtual Environment"
    echo "   • MariaDB Server"
    [ "$SKIP_PHPMYADMIN" = false ] && echo "   • phpMyAdmin"
    echo "   • MITRE ATT&CK Matrix API"
    echo "   • Radar Sync Service"
    [ "$SKIP_NGINX" = false ] && echo "   • Nginx Reverse Proxy"
    echo ""
    
    echo -e "${WHITE}🌐 Веб-интерфейсы:${NC}"
    echo "   • Matrix API:    http://${SERVER_IP}"
    [ "$SKIP_PHPMYADMIN" = false ] && echo "   • phpMyAdmin:    http://${SERVER_IP}/phpmyadmin"
    echo "   • API Docs:      http://${SERVER_IP}/api/docs"
    echo ""
    
    echo -e "${WHITE}🔐 Учетные данные:${NC}"
    echo "   • MySQL Root:    root / ${DB_PASS}"
    echo "   • Admin:         ${ADMIN_LOGIN} / ${ADMIN_PASS}"
    echo ""
    
    echo -e "${WHITE}📁 Директории:${NC}"
    echo "   • Проект:        ${PROJECT_DIR}"
    echo "   • Логи:          ${PROJECT_DIR}/logs"
    echo "   • Venv:          ${VENV_DIR}"
    echo "   • Конфиг:        ${PROJECT_DIR}/.env"
    echo ""
    
    echo -e "${WHITE}🔧 Управление сервисами:${NC}"
    echo "   • systemctl status pangeo-matrix"
    echo "   • systemctl status radar-sync"
    echo "   • systemctl restart pangeo-matrix"
    echo "   • systemctl restart radar-sync"
    echo ""
    
    echo -e "${WHITE}📊 Просмотр логов:${NC}"
    echo "   • journalctl -u pangeo-matrix -f"
    echo "   • journalctl -u radar-sync -f"
    echo "   • tail -f ${PROJECT_DIR}/logs/app.log"
    echo "   • tail -f ${LOG_FILE}"
    echo ""
    
    if [ -d "$BACKUP_DIR" ]; then
        echo -e "${WHITE}💾 Резервная копия:${NC}"
        echo "   • ${BACKUP_DIR}"
        echo ""
    fi
    
    echo -e "${YELLOW}⚠️  ВАЖНЫЕ ЗАМЕЧАНИЯ:${NC}"
    echo "   1. Сохраните учетные данные в безопасном месте"
    echo "   2. Настройте SSL сертификат для production"
    echo "   3. Проверьте настройки firewall"
    echo "   4. Настройте регулярные резервные копии БД"
    echo "   5. Проверьте интеграцию с Платформой Радар"
    echo ""
    
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Для проверки системы откройте: http://${SERVER_IP}${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════╝${NC}\n"
}

# ==========================================
# ОСНОВНОЙ ЦИКЛ УСТАНОВКИ
# ==========================================
main() {
    # Инициализация лога
    touch "$LOG_FILE"
    chmod 666 "$LOG_FILE"
    
    # Парсинг аргументов
    parse_arguments "$@"
    
    # Вывод баннера
    print_banner
    
    # Проверка прав
    check_root
    
    # Определение ОС
    detect_os
    
    # Интерактивный выбор (если не auto)
    interactive_stage_selection
    
    # Подтверждение
    confirm_parameters
    
    # Запуск этапов
    local stages=(
        "0:stage_0_preparation:Подготовка системы"
        "1:stage_1_install_python:Установка Python"
        "2:stage_2_install_mariadb:Установка MariaDB"
        "3:stage_3_create_database:Создание БД"
        "4:stage_4_install_phpmyadmin:Установка phpMyAdmin"
        "5:stage_5_create_user:Создание пользователя"
        "6:stage_6_create_structure:Структура проекта"
        "7:stage_7_create_venv:Virtual environment"
        "8:stage_8_install_dependencies:Python зависимости"
        "9:stage_9_create_env:Конфигурация"
        "10:stage_10_create_services:Systemd сервисы"
        "11:stage_11_install_nginx:Установка Nginx"
        "12:stage_12_configure_firewall:Настройка firewall"
        "13:stage_13_start_services:Запуск сервисов"
        "14:stage_14_create_admin:Создание администратора"
    )
    
    local failed_stages=()
    
    for stage_info in "${stages[@]}"; do
        IFS=':' read -r stage_num stage_func stage_name <<< "$stage_info"
        
        if should_run_stage "$stage_num"; then
            print_step "$stage_num: $stage_name"
            
            if $stage_func; then
                print_info "Этап $stage_num завершен успешно"
                log_message "Stage $stage_num completed successfully"
            else
                print_error "Ошибка на этапе $stage_num"
                log_message "ERROR: Stage $stage_num failed"
                failed_stages+=("$stage_num:$stage_name")
                
                if [ "$AUTO_MODE" = false ]; then
                    read -p "Продолжить установку? (y/n): " -n 1 -r
                    echo ""
                    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
                else
                    print_warning "Продолжение установки в автоматическом режиме"
                fi
            fi
        else
            print_warning "Этап $stage_num пропущен"
            log_message "Stage $stage_num skipped"
        fi
    done
    
    # Вывод информации о проваленных этапах
    if [ ${#failed_stages[@]} -gt 0 ]; then
        echo ""
        print_warning "Некоторые этапы завершились с ошибками:"
        for failed in "${failed_stages[@]}"; do
            IFS=':' read -r num name <<< "$failed"
            echo "  ✗ Этап $num: $name"
        done
        echo ""
    fi
    
    # Финальная информация
    print_final_info
    
    log_message "=== Установка завершена ==="
    
    # Сохранение информации в файл
    cat > "${PROJECT_DIR}/INSTALLATION_INFO.txt" << EOF
╔════════════════════════════════════════════════════════════════════╗
║  MITRE ATT&CK MATRIX INSTALLATION INFO                            ║
╚════════════════════════════════════════════════════════════════════╝

Дата установки: $(date '+%Y-%m-%d %H:%M:%S')
Версия установщика: ${SCRIPT_VERSION}
ОС: ${PRETTY_NAME:-Unknown}

УЧЕТНЫЕ ДАННЫЕ:
  MySQL Root: root / ${DB_PASS}
  Администратор: ${ADMIN_LOGIN} / ${ADMIN_PASS}

ДИРЕКТОРИИ:
  Проект: ${PROJECT_DIR}
  Логи: ${PROJECT_DIR}/logs
  Virtual Environment: ${VENV_DIR}

СЕРВИСЫ:
  • pangeo-matrix.service (Основное приложение)
  • radar-sync.service (Синхронизация с Радар)

КОМАНДЫ УПРАВЛЕНИЯ:
  systemctl status pangeo-matrix
  systemctl restart pangeo-matrix
  journalctl -u pangeo-matrix -f

RADAR INTEGRATION:
  URL: ${RADAR_URL}
  API Key: ${RADAR_API_KEY}

УСТАНОВЛЕННЫЕ ЭТАПЫ:
$(for stage_info in "${stages[@]}"; do
    IFS=':' read -r num func name <<< "$stage_info"
    if should_run_stage "$num"; then
        echo "  ✓ $num: $name"
    fi
done)

╚════════════════════════════════════════════════════════════════════╝
EOF
    
    chmod 600 "${PROJECT_DIR}/INSTALLATION_INFO.txt"
    
    print_info "Информация об установке сохранена в ${PROJECT_DIR}/INSTALLATION_INFO.txt"
}

# Запуск
main "$@"

exit 0
