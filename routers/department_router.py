"""
部门管理路由接口
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from services.department_service import DepartmentService
from utils.auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/department", tags=["部门管理"])


class DepartmentCreateRequest(BaseModel):
    name: str
    sort_order: Optional[int] = None


class DepartmentUpdateRequest(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


@router.get("/list")
def get_department_list(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """获取部门列表"""
    service = DepartmentService(db)
    items = service.get_list(include_inactive=include_inactive)
    return {"items": items}


@router.post("/create")
def create_department(
    req: DepartmentCreateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """创建部门"""
    if current_user.role not in ("HR", "CEO"):
        raise HTTPException(status_code=403, detail="无权限操作")
    try:
        service = DepartmentService(db)
        result = service.create(name=req.name, sort_order=req.sort_order)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/update/{dept_id}")
def update_department(
    dept_id: int,
    req: DepartmentUpdateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """更新部门"""
    if current_user.role not in ("HR", "CEO"):
        raise HTTPException(status_code=403, detail="无权限操作")
    try:
        service = DepartmentService(db)
        result = service.update(dept_id, name=req.name, sort_order=req.sort_order)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/toggle/{dept_id}")
def toggle_department(
    dept_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """切换部门启用/禁用"""
    if current_user.role not in ("HR", "CEO"):
        raise HTTPException(status_code=403, detail="无权限操作")
    try:
        service = DepartmentService(db)
        result = service.toggle(dept_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
