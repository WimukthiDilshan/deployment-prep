import os
import logging

import mysql.connector
from mysql.connector import Error

logger = logging.getLogger(__name__)


def get_db_config():
    # Keep the local DB setup simple for development, while still allowing env overrides later.
    return {
        "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": os.getenv("MYSQL_USER", "root"),
        "password": os.getenv("MYSQL_PASSWORD", ""),
        "database": os.getenv("MYSQL_DATABASE", "cognitive_load_db"),
    }


def get_db_connection():
    try:
        return mysql.connector.connect(**get_db_config())
    except Error as exc:
        # Returning None lets the API keep working even if MySQL is temporarily unavailable.
        logger.warning("MySQL connection unavailable: %s", exc)
        return None


def get_db_status():
    connection = get_db_connection()
    if connection is None:
        return {
            "connected": False,
            "database": get_db_config()["database"],
        }

    try:
        return {
            "connected": bool(connection.is_connected()),
            "database": connection.database,
            "server_host": connection.server_host,
            "server_port": connection.server_port,
        }
    except Error as exc:
        logger.warning("MySQL status check failed: %s", exc)
        return {
            "connected": False,
            "database": get_db_config()["database"],
            "error": str(exc),
        }
    finally:
        connection.close()
