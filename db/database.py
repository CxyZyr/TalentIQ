"""
数据库连接配置
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
import os

# 数据库连接URL（可以通过环境变量配置）
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./gcl_hr_saas.db")

# 创建数据库引擎
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False  # 设置为True可以看到SQL语句
)


if "sqlite" in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        """确保 SQLite 外键约束生效，避免出现悬空引用。"""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """获取数据库会话"""
    db = SessionLocal()
    try:
        return db
    finally:
        pass


@contextmanager
def get_db_context():
    """数据库会话上下文管理器"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """初始化数据库表"""
    from db.models import Base
    Base.metadata.create_all(bind=engine)
    _migrate_salary_negotiations_to_history()


def _migrate_salary_negotiations_to_history():
    """将谈薪表从单记录模式迁移为历史记录模式。"""
    if "sqlite" not in DATABASE_URL:
        return

    with engine.begin() as conn:
        table_sql_row = conn.exec_driver_sql(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='salary_negotiations'"
        ).fetchone()

        if not table_sql_row or not table_sql_row[0]:
            return

        table_sql = table_sql_row[0].upper()
        has_candidate_unique = (
            "UNIQUE (CANDIDATE_ID)" in table_sql
            or "CANDIDATE_ID INTEGER NOT NULL UNIQUE" in table_sql
        )

        if has_candidate_unique:
            conn.exec_driver_sql("DROP TABLE IF EXISTS salary_negotiations_new")
            conn.exec_driver_sql(
                """
                CREATE TABLE salary_negotiations_new (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    candidate_id INTEGER NOT NULL,
                    salary_status VARCHAR(20) NOT NULL,
                    background_check_status VARCHAR(20) NOT NULL,
                    background_report_path VARCHAR(500),
                    offer_status VARCHAR(20) NOT NULL,
                    is_onboarded BOOLEAN NOT NULL DEFAULT 0,
                    created_by INTEGER NOT NULL,
                    updated_by INTEGER,
                    created_at DATETIME,
                    updated_at DATETIME,
                    submitted_at DATETIME,
                    FOREIGN KEY(candidate_id) REFERENCES candidates (id),
                    FOREIGN KEY(created_by) REFERENCES users (id),
                    FOREIGN KEY(updated_by) REFERENCES users (id)
                )
                """
            )
            conn.exec_driver_sql(
                """
                INSERT INTO salary_negotiations_new (
                    id, candidate_id, salary_status, background_check_status,
                    background_report_path, offer_status, is_onboarded,
                    created_by, updated_by, created_at, updated_at, submitted_at
                )
                SELECT
                    id, candidate_id, salary_status, background_check_status,
                    background_report_path, offer_status, is_onboarded,
                    created_by, updated_by, created_at, updated_at, submitted_at
                FROM salary_negotiations
                """
            )
            conn.exec_driver_sql("DROP TABLE salary_negotiations")
            conn.exec_driver_sql(
                "ALTER TABLE salary_negotiations_new RENAME TO salary_negotiations"
            )

        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_salary_negotiations_candidate_id ON salary_negotiations(candidate_id)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS idx_salary_negotiations_candidate_id_id ON salary_negotiations(candidate_id, id DESC)"
        )
