"""
初始化用户数据（模板）

使用方法：复制为 init_users.py 后按需修改账号信息，再运行。
    cp db/init_users.example.py db/init_users.py
    python db/init_users.py
"""
from db.database import SessionLocal
from db.models import User, UserRole
from utils.auth import get_password_hash


def init_users():
    """初始化示例用户（仅在库中无用户时创建）"""
    print("正在初始化用户数据...")
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("用户已存在，跳过初始化")
            return

        users = [
            {"username": "admin", "email": "admin@example.com", "password": "admin123",
             "role": UserRole.HR.value, "real_name": "管理员", "department": "人力资源", "job_title": "HR"},
            {"username": "ceo", "email": "ceo@example.com", "password": "ceo123",
             "role": UserRole.CEO.value, "real_name": "示例CEO", "department": "管理层", "job_title": "CEO"},
            {"username": "interviewer", "email": "interviewer@example.com", "password": "interviewer123",
             "role": UserRole.INTERVIEWER.value, "real_name": "示例面试官", "department": "技术", "job_title": "工程师"},
        ]

        for u in users:
            db.add(User(
                username=u["username"],
                email=u["email"],
                password_hash=get_password_hash(u["password"]),
                role=u["role"],
                real_name=u["real_name"],
                department=u["department"],
                job_title=u["job_title"],
            ))
            print(f"创建用户: {u['real_name']} ({u['role']})")

        db.commit()
        print("用户初始化完成！默认密码见本脚本内的 password 字段。")
    except Exception as e:
        print(f"初始化用户时出错: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    init_users()
