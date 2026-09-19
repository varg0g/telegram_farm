import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler
from app.core.config import DATA_DIR

# Гарантируем UTF-8 вывод в консоли Windows для эмодзи и спецсимволов
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

LOG_FILE = DATA_DIR / "crm.log"

logger = logging.getLogger("telegram_crm")
logger.setLevel(logging.INFO)

# Форматирование
log_format = logging.Formatter(
    fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# Вывод в консоль с поддержкой UTF-8
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_format)
logger.addHandler(console_handler)

# Вывод в файл логов (макс 10 Мб, 3 бэкапа)
file_handler = RotatingFileHandler(
    LOG_FILE,
    maxBytes=10 * 1024 * 1024,
    backupCount=3,
    encoding="utf-8"
)
file_handler.setFormatter(log_format)
logger.addHandler(file_handler)
