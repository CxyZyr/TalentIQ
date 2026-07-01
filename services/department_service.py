"""
部门服务
"""
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from db.models import DepartmentModel, get_china_time

# 用于区分 update 时 parent_id "未传" 与 "显式设为 None（顶级）"
_UNSET = object()


class DepartmentService:
    """部门服务类"""

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _to_dict(d: DepartmentModel) -> Dict[str, Any]:
        return {
            "id": d.id,
            "name": d.name,
            "parent_id": d.parent_id,
            "sort_order": d.sort_order,
            "is_active": d.is_active,
        }

    def _collect_descendants(self, dept_id: int) -> set:
        """收集某部门的所有子孙 id（用于防环校验）"""
        pairs = self.db.query(DepartmentModel.id, DepartmentModel.parent_id).all()
        children_map: Dict[Any, List[int]] = {}
        for did, pid in pairs:
            children_map.setdefault(pid, []).append(did)
        result = set()
        stack = list(children_map.get(dept_id, []))
        while stack:
            cur = stack.pop()
            if cur in result:
                continue
            result.add(cur)
            stack.extend(children_map.get(cur, []))
        return result

    def get_list(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """获取部门列表（扁平，含 parent_id，前端自行组树）"""
        query = self.db.query(DepartmentModel)
        if not include_inactive:
            query = query.filter(DepartmentModel.is_active == True)
        departments = query.order_by(DepartmentModel.sort_order).all()
        return [self._to_dict(d) for d in departments]

    def create(self, name: str, parent_id: Optional[int] = None, sort_order: Optional[int] = None) -> Dict[str, Any]:
        """创建部门"""
        existing = self.db.query(DepartmentModel).filter(DepartmentModel.name == name).first()
        if existing:
            raise ValueError(f"部门名称已存在: {name}")

        if parent_id is not None:
            parent = self.db.query(DepartmentModel).filter(DepartmentModel.id == parent_id).first()
            if not parent:
                raise ValueError(f"上级部门不存在: {parent_id}")

        if sort_order is None:
            max_order = self.db.query(DepartmentModel.sort_order).order_by(
                DepartmentModel.sort_order.desc()
            ).first()
            sort_order = (max_order[0] + 1) if max_order and max_order[0] is not None else 1

        dept = DepartmentModel(name=name, parent_id=parent_id, sort_order=sort_order)
        self.db.add(dept)
        self.db.commit()
        self.db.refresh(dept)
        return self._to_dict(dept)

    def update(self, dept_id: int, name: Optional[str] = None,
               parent_id: Any = _UNSET, sort_order: Optional[int] = None) -> Dict[str, Any]:
        """更新部门（parent_id 传 _UNSET=不改，传 None=设为顶级，传 id=移动到该父级）"""
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

        if parent_id is not _UNSET:
            if parent_id is not None:
                if parent_id == dept_id:
                    raise ValueError("不能将部门设为自己的上级")
                if parent_id in self._collect_descendants(dept_id):
                    raise ValueError("不能将部门移动到其子部门之下")
                parent = self.db.query(DepartmentModel).filter(DepartmentModel.id == parent_id).first()
                if not parent:
                    raise ValueError(f"上级部门不存在: {parent_id}")
            dept.parent_id = parent_id

        if sort_order is not None:
            dept.sort_order = sort_order

        dept.updated_at = get_china_time()
        self.db.commit()
        self.db.refresh(dept)
        return self._to_dict(dept)

    def toggle(self, dept_id: int) -> Dict[str, Any]:
        """切换启用/禁用"""
        dept = self.db.query(DepartmentModel).filter(DepartmentModel.id == dept_id).first()
        if not dept:
            raise ValueError(f"部门不存在: {dept_id}")

        dept.is_active = not dept.is_active
        dept.updated_at = get_china_time()
        self.db.commit()
        self.db.refresh(dept)
        return self._to_dict(dept)

    def delete(self, dept_id: int) -> None:
        """删除部门（有子部门或被用户/职位引用时禁止）"""
        from db.models import User, JobDescription
        dept = self.db.query(DepartmentModel).filter(DepartmentModel.id == dept_id).first()
        if not dept:
            raise ValueError(f"部门不存在: {dept_id}")
        if self.db.query(DepartmentModel).filter(DepartmentModel.parent_id == dept_id).first():
            raise ValueError("该部门下有子部门，请先删除或移动子部门")
        if self.db.query(User).filter(User.department_id == dept_id).first():
            raise ValueError("该部门下有关联用户，无法删除")
        if self.db.query(JobDescription).filter(JobDescription.department_id == dept_id).first():
            raise ValueError("该部门有关联职位，无法删除")
        self.db.delete(dept)
        self.db.commit()

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
