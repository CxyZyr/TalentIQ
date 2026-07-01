"""
用户认证工具
"""
import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db.database import get_db_context
from db.models import User

# JWT配置
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "gcl_hr_saas_secret_key_2026")  # 优先环境变量，未配置时回退默认
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 3  # 3天

# 密码加密
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer认证
security = HTTPBearer()


class CurrentUser(BaseModel):
    """当前登录用户信息"""
    id: int
    username: str
    email: Optional[str] = None
    role: str
    real_name: Optional[str] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None

    class Config:
        from_attributes = True


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建JWT访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """解码JWT令牌"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭证",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> CurrentUser:
    """获取当前登录用户（依赖注入）"""
    token = credentials.credentials
    payload = decode_access_token(token)

    user_id: int = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭证",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 从数据库获取用户
    with get_db_context() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 在会话内提取用户数据，避免detached instance错误
        return CurrentUser(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role,
            real_name=user.real_name,
            phone=user.phone,
            avatar=user.avatar,
            department=user.department,
            job_title=user.job_title
        )


def require_roles(*roles: str):
    """
    依赖工厂：要求当前用户角色属于 roles，否则返回 403。

    用于在路由层保护管理类接口（如用户管理），避免仅靠前端隐藏按钮。
    用法：current_user: CurrentUser = Depends(require_roles("HR", "CEO"))
    """
    def checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权限执行此操作",
            )
        return current_user

    return checker
