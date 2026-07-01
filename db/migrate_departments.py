"""
部门表迁移脚本

幂等执行：
1. 创建 departments 表（如不存在）
2. 插入初始部门数据
3. 为 users 和 job_descriptions 添加 department_id 列（如不存在）
4. 根据现有 department 字符串填充 department_id
"""
import sqlite3
from db.database import DATABASE_URL

# 初始部门数据
INITIAL_DEPARTMENTS = [
    ("市场销售", 1),
    ("AI产品", 2),
    ("数据产品", 3),
    ("智能应用与运营", 4),
    ("技术研发", 5),
    ("数字科技创新实验室", 6),
    ("综合运营", 7),
]


def _get_db_path():
    """从 DATABASE_URL 提取 SQLite 文件路径"""
    # sqlite:///./gcl_hr_saas.db -> ./gcl_hr_saas.db
    return DATABASE_URL.replace("sqlite:///", "")


def _table_exists(cursor, table_name):
    cursor.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cursor.fetchone()[0] > 0


def _column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns


def run_migration():
    """执行部门表迁移"""
    db_path = _get_db_path()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. 创建 departments 表
        if not _table_exists(cursor, "departments"):
            print("[迁移] 创建 departments 表...")
            cursor.execute("""
                CREATE TABLE departments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    sort_order INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME
                )
            """)
            conn.commit()
            print("[迁移] departments 表创建完成")
        else:
            print("[迁移] departments 表已存在，跳过创建")

        # 2. 插入初始部门数据（跳过已存在的）
        for name, sort_order in INITIAL_DEPARTMENTS:
            cursor.execute("SELECT id FROM departments WHERE name = ?", (name,))
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO departments (name, sort_order, is_active) VALUES (?, ?, 1)",
                    (name, sort_order)
                )
                print(f"[迁移] 插入部门: {name}")
        conn.commit()

        # 3. 扫描 users 和 job_descriptions 中的旧 department 字符串，自动补录
        for table in ["users", "job_descriptions"]:
            if _column_exists(cursor, table, "department"):
                cursor.execute(f"SELECT DISTINCT department FROM {table} WHERE department IS NOT NULL AND department != ''")
                existing_dept_names = [row[0] for row in cursor.fetchall()]
                for dept_name in existing_dept_names:
                    cursor.execute("SELECT id FROM departments WHERE name = ?", (dept_name,))
                    if not cursor.fetchone():
                        # 获取当前最大排序号
                        cursor.execute("SELECT MAX(sort_order) FROM departments")
                        max_order = cursor.fetchone()[0] or 0
                        cursor.execute(
                            "INSERT INTO departments (name, sort_order, is_active) VALUES (?, ?, 1)",
                            (dept_name, max_order + 1)
                        )
                        print(f"[迁移] 从 {table} 补录历史部门: {dept_name}")
        conn.commit()

        # 4. 为 users 添加 department_id 列
        if not _column_exists(cursor, "users", "department_id"):
            print("[迁移] 为 users 表添加 department_id 列...")
            cursor.execute("ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id)")
            conn.commit()

        # 5. 为 job_descriptions 添加 department_id 列
        if not _column_exists(cursor, "job_descriptions", "department_id"):
            print("[迁移] 为 job_descriptions 表添加 department_id 列...")
            cursor.execute("ALTER TABLE job_descriptions ADD COLUMN department_id INTEGER REFERENCES departments(id)")
            conn.commit()

        # 6. 填充 department_id（基于现有 department 字符串）
        for table in ["users", "job_descriptions"]:
            cursor.execute(f"""
                UPDATE {table}
                SET department_id = (
                    SELECT d.id FROM departments d WHERE d.name = {table}.department
                )
                WHERE department IS NOT NULL
                  AND department != ''
                  AND (department_id IS NULL OR department_id = 0)
            """)
            updated = cursor.rowcount
            if updated > 0:
                print(f"[迁移] {table} 表填充 department_id: {updated} 条")
        conn.commit()

        print("[迁移] 部门表迁移完成！")

        # 打印最终状态
        cursor.execute("SELECT id, name, sort_order, is_active FROM departments ORDER BY sort_order")
        print("[迁移] 当前部门列表:")
        for row in cursor.fetchall():
            print(f"  ID={row[0]}, 名称={row[1]}, 排序={row[2]}, 启用={row[3]}")

    except Exception as e:
        conn.rollback()
        print(f"[迁移] 执行失败: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
