"""
用户管理接口
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from db.database import get_db_context
from db.models import User, UserRole, DepartmentModel
from utils.auth import get_current_user, get_password_hash, CurrentUser

router = APIRouter(prefix="/api/user", tags=["用户管理"])


class UserCreateRequest(BaseModel):
    username: str
    password: str
    real_name: str
    role: str
    department: Optional[str] = None
    remark: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class UserUpdateRequest(BaseModel):
    username: Optional[str] = None
    real_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    department: Optional[str] = None
    remark: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class UserSelfUpdateRequest(BaseModel):
    real_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None


class BatchIdsRequest(BaseModel):
    ids: List[int]


@router.get("/list")
async def get_user_list(
    current_user: CurrentUser = Depends(get_current_user)
):
    """获取用户列表（不包含已删除用户）"""
    try:
        with get_db_context() as db:
            users = db.query(User).filter(User.is_deleted == False).order_by(User.id).all()
            items = []
            for u in users:
                items.append({
                    "id": u.id,
                    "username": u.username,
                    "real_name": u.real_name or "",
                    "email": u.email or "",
                    "phone": u.phone or "",
                    "role": u.role,
                    "department": u.department_ref.name if u.department_ref else (u.department or ""),
                    "is_active": u.is_active,
                    "remark": u.remark or "",
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                })
            return {"code": 200, "message": "查询成功", "data": {"items": items, "total": len(items)}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询用户列表失败: {str(e)}")


@router.post("/create")
async def create_user(
    req: UserCreateRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """创建用户"""
    try:
        with get_db_context() as db:
            # 检查用户名是否已存在
            existing = db.query(User).filter(User.username == req.username).first()
            if existing:
                raise HTTPException(status_code=400, detail="用户名已存在")

            # 查找部门ID
            dept_id = None
            if req.department:
                dept = db.query(DepartmentModel).filter(DepartmentModel.name == req.department).first()
                if dept:
                    dept_id = dept.id

            user = User(
                username=req.username,
                password_hash=get_password_hash(req.password),
                real_name=req.real_name,
                email=(req.email.strip() if req.email else None) or None,
                phone=(req.phone.strip() if req.phone else None) or None,
                role=req.role,
                department=req.department,
                department_id=dept_id,
                remark=req.remark,
                is_active=True,
                is_deleted=False,
            )
            db.add(user)
            db.commit()
            return {"code": 200, "message": "创建成功"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建用户失败: {str(e)}")


@router.put("/update/{user_id}")
async def update_user(
    user_id: int,
    req: UserUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """编辑用户（角色、密码、备注）"""
    try:
        with get_db_context() as db:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            if req.username is not None:
                # 检查用户名是否已被其他用户占用
                existing = db.query(User).filter(User.username == req.username, User.id != user_id).first()
                if existing:
                    raise HTTPException(status_code=400, detail="用户名已存在")
                user.username = req.username
            if req.real_name is not None:
                user.real_name = req.real_name
            if req.role is not None:
                user.role = req.role
            if req.password:
                user.password_hash = get_password_hash(req.password)
            if req.department is not None:
                user.department = req.department
                dept = db.query(DepartmentModel).filter(DepartmentModel.name == req.department).first()
                user.department_id = dept.id if dept else None
            if req.remark is not None:
                user.remark = req.remark
            if req.email is not None:
                user.email = req.email.strip() or None
            if req.phone is not None:
                user.phone = req.phone.strip() or None

            db.commit()
            return {"code": 200, "message": "更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新用户失败: {str(e)}")


@router.post("/toggle-status/{user_id}")
async def toggle_user_status(
    user_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """切换用户启用/禁用状态"""
    try:
        with get_db_context() as db:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            user.is_active = not user.is_active
            db.commit()
            status = "启用" if user.is_active else "禁用"
            return {"code": 200, "message": f"用户已{status}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"操作失败: {str(e)}")


@router.post("/delete/{user_id}")
async def delete_user(
    user_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """软删除用户"""
    try:
        with get_db_context() as db:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            user.is_active = False
            user.is_deleted = True
            db.commit()
            return {"code": 200, "message": "删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@router.post("/batch-delete")
async def batch_delete(
    req: BatchIdsRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """批量软删除"""
    try:
        with get_db_context() as db:
            db.query(User).filter(User.id.in_(req.ids)).update(
                {User.is_active: False, User.is_deleted: True},
                synchronize_session=False
            )
            db.commit()
            return {"code": 200, "message": f"已删除{len(req.ids)}个用户"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量删除失败: {str(e)}")


@router.post("/batch-enable")
async def batch_enable(
    req: BatchIdsRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """批量启用"""
    try:
        with get_db_context() as db:
            db.query(User).filter(User.id.in_(req.ids)).update(
                {User.is_active: True},
                synchronize_session=False
            )
            db.commit()
            return {"code": 200, "message": f"已启用{len(req.ids)}个用户"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量启用失败: {str(e)}")


@router.post("/batch-disable")
async def batch_disable(
    req: BatchIdsRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """批量禁用"""
    try:
        with get_db_context() as db:
            db.query(User).filter(User.id.in_(req.ids)).update(
                {User.is_active: False},
                synchronize_session=False
            )
            db.commit()
            return {"code": 200, "message": f"已禁用{len(req.ids)}个用户"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量禁用失败: {str(e)}")


@router.get("/me")
async def get_current_user_info(
    current_user: CurrentUser = Depends(get_current_user)
):
    """获取当前登录用户完整信息"""
    try:
        with get_db_context() as db:
            user = db.query(User).filter(User.id == current_user.id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            return {
                "code": 200,
                "data": {
                    "id": user.id,
                    "username": user.username,
                    "real_name": user.real_name,
                    "email": user.email,
                    "phone": user.phone,
                    "role": user.role,
                    "department": user.department_ref.name if user.department_ref else (user.department or ""),
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取用户信息失败: {str(e)}")


@router.put("/update-self")
async def update_self(
    req: UserSelfUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """用户更新自己的信息（姓名、邮箱、电话、密码）"""
    try:
        with get_db_context() as db:
            user = db.query(User).filter(User.id == current_user.id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            if req.real_name is not None:
                user.real_name = req.real_name
            if req.email is not None:
                user.email = req.email.strip() or None
            if req.phone is not None:
                user.phone = req.phone.strip() or None
            if req.password:
                user.password_hash = get_password_hash(req.password)

            db.commit()
            return {"code": 200, "message": "更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新个人信息失败: {str(e)}")
