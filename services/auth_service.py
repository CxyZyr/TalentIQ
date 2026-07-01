"""
认证服务
"""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_
from db.models import User
from utils.auth import verify_password, create_access_token


class AuthService:
    """认证服务类"""

    def __init__(self, db: Session):
        self.db = db

    def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """
        验证用户登录

        Args:
            username: 用户名
            password: 密码

        Returns:
            验证成功返回用户对象，失败返回None
        """
        user = self.db.query(User).filter(
            or_(User.username == username, User.real_name == username)
        ).first()
        if not user:
            return None

        if not verify_password(password, user.password_hash):
            return None

        return user

    def login(self, username: str, password: str) -> dict:
        """
        用户登录

        Args:
            username: 用户名
            password: 密码

        Returns:
            包含token和用户信息的字典

        Raises:
            ValueError: 用户名或密码错误、账号已禁用或已删除
        """
        user = self.authenticate_user(username, password)
        if not user:
            raise ValueError("用户名或密码错误")

        # 检查用户是否已删除
        if getattr(user, 'is_deleted', False):
            raise ValueError("该账号已被删除")

        # 检查用户是否已禁用
        if not getattr(user, 'is_active', True):
            raise ValueError("该账号已被禁用")

        # 生成JWT令牌
        access_token = create_access_token(
            data={"user_id": user.id, "username": user.username, "role": user.role}
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role
            }
        }
