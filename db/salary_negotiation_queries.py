"""
谈薪&背调查询辅助方法
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import SalaryNegotiation


def get_latest_salary_negotiation_subquery(db: Session):
    """返回每个候选人的最新谈薪记录子查询。"""
    latest_ids_subquery = (
        db.query(
            func.max(SalaryNegotiation.id).label("latest_id")
        )
        .group_by(SalaryNegotiation.candidate_id)
        .subquery()
    )

    return (
        db.query(
            SalaryNegotiation.id.label("id"),
            SalaryNegotiation.candidate_id.label("candidate_id"),
            SalaryNegotiation.salary_status.label("salary_status"),
            SalaryNegotiation.background_check_status.label("background_check_status"),
            SalaryNegotiation.background_report_path.label("background_report_path"),
            SalaryNegotiation.offer_status.label("offer_status"),
            SalaryNegotiation.is_onboarded.label("is_onboarded"),
            SalaryNegotiation.created_by.label("created_by"),
            SalaryNegotiation.updated_by.label("updated_by"),
            SalaryNegotiation.created_at.label("created_at"),
            SalaryNegotiation.updated_at.label("updated_at"),
            SalaryNegotiation.submitted_at.label("submitted_at"),
        )
        .join(
            latest_ids_subquery,
            SalaryNegotiation.id == latest_ids_subquery.c.latest_id
        )
        .subquery()
    )


def get_latest_salary_negotiation_record(db: Session, candidate_id: int):
    """获取指定候选人的最新谈薪记录。"""
    return (
        db.query(SalaryNegotiation)
        .filter(SalaryNegotiation.candidate_id == candidate_id)
        .order_by(SalaryNegotiation.id.desc())
        .first()
    )
