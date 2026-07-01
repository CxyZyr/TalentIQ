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
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


class DepartmentUpdateRequest(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


def _require_hr_or_ceo(current_user: CurrentUser):
    if current_user.role not in ("HR", "CEO"):
        raise HTTPException(status_code=403, detail="无权限操作")


@router.get("/list")
def get_department_list(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """获取部门列表（扁平，含 parent_id）"""
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
    _require_hr_or_ceo(current_user)
    try:
        service = DepartmentService(db)
        return service.create(name=req.name, parent_id=req.parent_id, sort_order=req.sort_order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/update/{dept_id}")
def update_department(
    dept_id: int,
    req: DepartmentUpdateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """更新部门（仅更新请求体中显式传入的字段）"""
    _require_hr_or_ceo(current_user)
    try:
        service = DepartmentService(db)
        kwargs = {}
        fields = req.model_fields_set
        if "name" in fields:
            kwargs["name"] = req.name
        if "sort_order" in fields:
            kwargs["sort_order"] = req.sort_order
        if "parent_id" in fields:
            kwargs["parent_id"] = req.parent_id  # 可为 None（移到顶级）
        return service.update(dept_id, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/toggle/{dept_id}")
def toggle_department(
    dept_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """切换部门启用/禁用"""
    _require_hr_or_ceo(current_user)
    try:
        service = DepartmentService(db)
        return service.toggle(dept_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/delete/{dept_id}")
def delete_department(
    dept_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """删除部门（有子部门或被用户/职位引用时会被拒绝）"""
    _require_hr_or_ceo(current_user)
    try:
        service = DepartmentService(db)
        service.delete(dept_id)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
