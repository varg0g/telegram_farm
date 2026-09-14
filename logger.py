import logging
import sys

def get_logger(name="telegram_farm"):
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)

        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

        # File handler
        fh = logging.FileHandler('farm.log', encoding='utf-8')
        fh.setFormatter(formatter)
        logger.addHandler(fh)

        # Console handler with safe UTF-8 encoding on Windows
        try:
            if hasattr(sys.stdout, "reconfigure"):
                sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
        ch = logging.StreamHandler(sys.stdout)
        ch.setFormatter(formatter)
        logger.addHandler(ch)

    return logger

logger = get_logger()
