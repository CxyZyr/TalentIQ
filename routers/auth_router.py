"""
认证路由接口
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from db.database import get_db_context
from services.auth_service import AuthService
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/auth", tags=["用户认证"])


# ==================== 请求模型 ====================

class LoginRequest(BaseModel):
    """登录请求"""
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


# ==================== 路由接口 ====================

@router.post("/login")
async def login(request: LoginRequest):
    """
    用户登录接口

    返回JWT令牌和用户信息
    """
    try:
        with get_db_context() as db:
            auth_service = AuthService(db)
            result = auth_service.login(request.username, request.password)

            return {
                "code": 200,
                "message": "登录成功",
                "data": result
            }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me")
async def get_current_user_info(current_user: CurrentUser = Depends(get_current_user)):
    """
    获取当前登录用户信息

    需要在请求头中携带JWT令牌
    """
    return {
        "code": 200,
        "message": "获取成功",
        "data": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "role": current_user.role,
            "real_name": current_user.real_name,
            "phone": current_user.phone,
            "avatar": current_user.avatar,
            "department": current_user.department_ref.name if current_user.department_ref else current_user.department,
            "job_title": current_user.job_title
        }
    }


@router.get("/users")
async def get_user_list(current_user: CurrentUser = Depends(get_current_user)):
    """
    获取用户列表

    返回所有用户信息，用于选择负责人等场景
    """
    try:
        with get_db_context() as db:
            from db.models import User
            users = db.query(User).options(
                joinedload(User.department_ref)
            ).filter(
                User.is_deleted == False
            ).order_by(User.id.asc()).all()
            return {
                "code": 200,
                "message": "获取成功",
                "data": [
                    {
                        "id": user.id,
                        "username": user.username,
                        "real_name": user.real_name,
                        "role": user.role,
                        "department": user.department_ref.name if user.department_ref else user.department,
                        "is_active": user.is_active,
                    }
                    for user in users
                ]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
