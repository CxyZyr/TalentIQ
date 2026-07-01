"""
部门服务
"""
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from db.models import DepartmentModel, get_china_time


class DepartmentService:
    """部门服务类"""

    def __init__(self, db: Session):
        self.db = db

    def get_list(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """获取部门列表"""
        query = self.db.query(DepartmentModel)
        if not include_inactive:
            query = query.filter(DepartmentModel.is_active == True)
        departments = query.order_by(DepartmentModel.sort_order).all()
        return [
            {
                "id": d.id,
                "name": d.name,
                "sort_order": d.sort_order,
                "is_active": d.is_active,
            }
            for d in departments
        ]

    def create(self, name: str, sort_order: Optional[int] = None) -> Dict[str, Any]:
        """创建部门"""
        existing = self.db.query(DepartmentModel).filter(DepartmentModel.name == name).first()
        if existing:
            raise ValueError(f"部门名称已存在: {name}")

        if sort_order is None:
            max_order = self.db.query(DepartmentModel.sort_order).order_by(
                DepartmentModel.sort_order.desc()
            ).first()
            sort_order = (max_order[0] + 1) if max_order else 1

        dept = DepartmentModel(name=name, sort_order=sort_order)
        self.db.add(dept)
        self.db.commit()
        self.db.refresh(dept)
        return {"id": dept.id, "name": dept.name, "sort_order": dept.sort_order, "is_active": dept.is_active}

    def update(self, dept_id: int, name: Optional[str] = None, sort_order: Optional[int] = None) -> Dict[str, Any]:
        """更新部门"""
        dept = self.db.query(DepartmentModel).filter(DepartmentModel.id == dept_id).first()
        if not dept:
            raise ValueError(f"部门不存在: {dept_id}")

        if name is not None and name != dept.name:
            existing = self.db.query(DepartmentModel).filter(
                DepartmentModel.name == name, DepartmentModel.id != dept_id
            ).first()
            if existing:
                raise ValueError(f"部门名称已存在: {name}")
            dept.name = name

        if sort_order is not None:
            dept.sort_order = sort_order

        dept.updated_at = get_china_time()
        self.db.commit()
        self.db.refresh(dept)
        return {"id": dept.id, "name": dept.name, "sort_order": dept.sort_order, "is_active": dept.is_active}

    def toggle(self, dept_id: int) -> Dict[str, Any]:
        """切换启用/禁用"""
        dept = self.db.query(DepartmentModel).filter(DepartmentModel.id == dept_id).first()
        if not dept:
            raise ValueError(f"部门不存在: {dept_id}")

        dept.is_active = not dept.is_active
        dept.updated_at = get_china_time()
        self.db.commit()
        self.db.refresh(dept)
        return {"id": dept.id, "name": dept.name, "sort_order": dept.sort_order, "is_active": dept.is_active}

    @staticmethod
    def get_id_by_name(db: Session, name: str) -> Optional[int]:
        """根据名称获取部门ID"""
        dept = db.query(DepartmentModel).filter(DepartmentModel.name == name).first()
        return dept.id if dept else None

    @staticmethod
    def get_name_by_id(db: Session, dept_id: int) -> str:
        """根据ID获取部门名称"""
        dept = db.query(DepartmentModel).filter(DepartmentModel.id == dept_id).first()
        return dept.name if dept else ""
