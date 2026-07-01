"""
谈薪&背调服务
"""
from sqlalchemy.orm import Session
from db.models import (
    SalaryNegotiation, Candidate, User, CandidateStageHistory,
    JobDescription, UserRole, DepartmentModel, get_china_time
)
from db.salary_negotiation_queries import (
    get_latest_salary_negotiation_record,
    get_latest_salary_negotiation_subquery,
)
from services.todo_service import TodoService
from typing import Dict, List, Optional


class SalaryNegotiationService:
    """谈薪&背调服务类"""

    @staticmethod
    def _create_salary_negotiation_record(
        db: Session,
        candidate_id: int,
        salary_status: str,
        background_check_status: str,
        background_report_path: Optional[str],
        offer_status: str,
        is_onboarded: bool,
        user_id: int,
        submitted: bool = False
    ) -> SalaryNegotiation:
        """创建一条新的谈薪记录。"""
        salary_negotiation = SalaryNegotiation(
            candidate_id=candidate_id,
            salary_status=salary_status,
            background_check_status=background_check_status,
            background_report_path=background_report_path,
            offer_status=offer_status,
            is_onboarded=is_onboarded,
            created_by=user_id,
            updated_by=user_id,
            submitted_at=get_china_time() if submitted else None
        )
        db.add(salary_negotiation)
        return salary_negotiation

    @staticmethod
    def save_salary_negotiation(
        db: Session,
        candidate_id: int,
        salary_status: str,
        background_check_status: str,
        background_report_path: Optional[str],
        offer_status: str,
        is_onboarded: bool,
        user_id: int
    ) -> Dict:
        """
        保存谈薪&背调信息（不提交）

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            salary_status: 谈薪状态
            background_check_status: 背调状态
            background_report_path: 背调报告路径
            offer_status: OFFER状态
            is_onboarded: 是否入职
            user_id: 操作人ID

        Returns:
            保存结果
        """
        try:
            # 验证候选人
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise ValueError(f"候选人不存在: {candidate_id}")

            salary_negotiation = SalaryNegotiationService._create_salary_negotiation_record(
                db=db,
                candidate_id=candidate_id,
                salary_status=salary_status,
                background_check_status=background_check_status,
                background_report_path=background_report_path,
                offer_status=offer_status,
                is_onboarded=is_onboarded,
                user_id=user_id,
                submitted=False
            )

            db.commit()
            db.refresh(salary_negotiation)

            return {
                "success": True,
                "id": salary_negotiation.id,
                "candidate_id": candidate_id,
                "message": "谈薪&背调信息保存成功"
            }

        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    def submit_salary_negotiation(
        db: Session,
        candidate_id: int,
        salary_status: str,
        background_check_status: str,
        background_report_path: Optional[str],
        offer_status: str,
        is_onboarded: bool,
        user_id: int
    ) -> Dict:
        """
        提交谈薪&背调信息（完成流程）

        提交后：
        - 下一轮负责人 = 提交人
        - 下一轮事件 = 流程终止

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            salary_status: 谈薪状态
            background_check_status: 背调状态
            background_report_path: 背调报告路径
            offer_status: OFFER状态
            is_onboarded: 是否入职
            user_id: 操作人ID

        Returns:
            提交结果
        """
        try:
            # 验证候选人
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise ValueError(f"候选人不存在: {candidate_id}")

            salary_negotiation = SalaryNegotiationService._create_salary_negotiation_record(
                db=db,
                candidate_id=candidate_id,
                salary_status=salary_status,
                background_check_status=background_check_status,
                background_report_path=background_report_path,
                offer_status=offer_status,
                is_onboarded=is_onboarded,
                user_id=user_id,
                submitted=True
            )

            # 创建流程历史记录
            from db.models import CandidateStage, CandidateStageResult
            history = CandidateStageHistory(
                candidate_id=candidate_id,
                stage=CandidateStage.SALARY_NEGOTIATION.value,
                stage_result=CandidateStageResult.PASSED.value,
                stage_owner=user_id,
                next_stage=CandidateStage.TERMINATED.value,
                next_stage_owner=user_id,
                comments=f"谈薪&背调完成 - 谈薪:{salary_status}, 背调:{background_check_status}, OFFER:{offer_status}, 入职:{'是' if is_onboarded else '否'}"
            )
            db.add(history)

            # 更新候选人状态
            candidate.current_stage = CandidateStage.TERMINATED.value
            candidate.current_stage_result = CandidateStageResult.PASSED.value
            candidate.current_stage_owner = user_id

            # 标记待办为已处理
            TodoService.mark_candidate_todos_processed(
                db, candidate_id, CandidateStage.SALARY_NEGOTIATION.value
            )

            db.commit()
            db.refresh(salary_negotiation)

            return {
                "success": True,
                "id": salary_negotiation.id,
                "candidate_id": candidate_id,
                "current_stage": candidate.current_stage,
                "message": "谈薪&背调信息提交成功，流程已完成"
            }

        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    def get_salary_negotiation(db: Session, candidate_id: int) -> Optional[Dict]:
        """
        获取候选人的谈薪&背调信息

        Args:
            db: 数据库会话
            candidate_id: 候选人ID

        Returns:
            谈薪&背调信息或None
        """
        salary_negotiation = get_latest_salary_negotiation_record(db, candidate_id)

        if not salary_negotiation:
            return None

        return {
            "id": salary_negotiation.id,
            "candidate_id": salary_negotiation.candidate_id,
            "salary_status": salary_negotiation.salary_status,
            "background_check_status": salary_negotiation.background_check_status,
            "background_report_path": salary_negotiation.background_report_path,
            "offer_status": salary_negotiation.offer_status,
            "is_onboarded": salary_negotiation.is_onboarded,
            "created_by": salary_negotiation.created_by,
            "updated_by": salary_negotiation.updated_by,
            "created_at": salary_negotiation.created_at.isoformat() if salary_negotiation.created_at else None,
            "updated_at": salary_negotiation.updated_at.isoformat() if salary_negotiation.updated_at else None,
            "submitted_at": salary_negotiation.submitted_at.isoformat() if salary_negotiation.submitted_at else None
        }

    @staticmethod
    def get_all_salary_negotiations(
        db: Session,
        user_id: int,
        user_role: str
    ) -> List[Dict]:
        """
        查询候选人谈薪&背调列表（带权限控制）

        只返回当前阶段为"谈薪&背调"的候选人

        权限规则：
        - CEO/HR：可以看到所有候选人
        - 面试官：只能看到与自己相关的候选人（任何流程中有参与）

        Args:
            db: 数据库会话
            user_id: 用户ID
            user_role: 用户角色

        Returns:
            候选人谈薪&背调列表
        """
        from db.models import CandidateStage

        # 基础查询 - 只查询当前阶段为"谈薪&背调"的候选人
        latest_salary_negotiation = get_latest_salary_negotiation_subquery(db)

        query = db.query(
            Candidate.id.label('candidate_id'),
            Candidate.name.label('candidate_name'),
            Candidate.jd_id.label('jd_id'),
            JobDescription.job_title.label('job_title'),
            DepartmentModel.name.label('department'),
            latest_salary_negotiation.c.salary_status,
            latest_salary_negotiation.c.background_check_status,
            latest_salary_negotiation.c.offer_status,
            latest_salary_negotiation.c.is_onboarded
        ).join(
            JobDescription, Candidate.jd_id == JobDescription.id
        ).outerjoin(
            DepartmentModel, JobDescription.department_id == DepartmentModel.id
        ).outerjoin(
            latest_salary_negotiation, Candidate.id == latest_salary_negotiation.c.candidate_id
        ).filter(
            Candidate.current_stage == CandidateStage.SALARY_NEGOTIATION.value
        )

        # 权限过滤
        if user_role == UserRole.INTERVIEWER.value:
            # 面试官只能看到自己是当前阶段负责人的候选人
            query = query.filter(Candidate.current_stage_owner == user_id)

        # 执行查询
        results = query.all()

        # 构建返回结果 - 使用英文字段名与前端一致
        salary_negotiations = []
        for row in results:
            salary_negotiations.append({
                "candidate_id": row.candidate_id,
                "candidate_name": row.candidate_name or "未知",
                "jd_id": row.jd_id,
                "job_title": row.job_title,
                "department": row.department,
                "salary_status": row.salary_status or "待处理",
                "background_check_status": row.background_check_status or "待处理",
                "offer_status": row.offer_status or "待发放",
                "is_onboarded": row.is_onboarded if row.is_onboarded is not None else False
            })

        return salary_negotiations
