"""
待办服务
"""
from datetime import datetime
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from db.models import (
    CandidateTodo, Candidate, User, TodoStatus, CandidateStage, CandidateStageResult, CandidateStageHistory,
    InterviewEvaluation, InterviewRecording,
    ResumeEvaluationRule, JobDescription, get_china_time
)
from db.salary_negotiation_queries import get_latest_salary_negotiation_record
from typing import List, Optional, Dict


class TodoService:
    """待办服务类"""

    @staticmethod
    def create_todo(db: Session, candidate_id: int, stage: str, owner_id: int) -> CandidateTodo:
        """
        创建待办

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            stage: 阶段
            owner_id: 负责人ID

        Returns:
            创建的待办对象
        """
        todo = CandidateTodo(
            candidate_id=candidate_id,
            stage=stage,
            owner_id=owner_id,
            status=TodoStatus.PENDING.value
        )
        db.add(todo)
        db.commit()
        db.refresh(todo)

        # 异步发送邮件通知（非简历筛选阶段直接发送，简历筛选阶段在解析完成后发送）
        if stage != CandidateStage.RESUME_SCREENING.value:
            TodoService._send_todo_email(db, candidate_id, stage, owner_id)

        return todo

    @staticmethod
    def _send_todo_email(db: Session, candidate_id: int, stage: str, owner_id: int):
        """发送待办邮件通知"""
        try:
            owner = db.query(User).filter(User.id == owner_id).first()
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if owner and owner.email and candidate:
                from services.email_service import EmailService
                job_title = candidate.jd.job_title if candidate.jd else None
                EmailService.send_todo_notification(
                    to_email=owner.email,
                    owner_name=owner.real_name or owner.username,
                    candidate_name=candidate.name or f"候选人#{candidate_id}",
                    stage=stage,
                    job_title=job_title,
                    candidate_id=candidate_id,
                )
        except Exception as e:
            print(f"[待办邮件] 发送通知失败: {str(e)}")

    @staticmethod
    def mark_todo_processed(db: Session, todo_id: int) -> CandidateTodo:
        """
        标记待办已处理

        Args:
            db: 数据库会话
            todo_id: 待办ID

        Returns:
            更新后的待办对象
        """
        todo = db.query(CandidateTodo).filter(CandidateTodo.id == todo_id).first()
        if not todo:
            raise ValueError(f"待办不存在: {todo_id}")

        todo.status = TodoStatus.PROCESSED.value
        todo.processed_at = get_china_time()
        db.commit()
        db.refresh(todo)
        return todo

    @staticmethod
    def mark_candidate_todos_processed(db: Session, candidate_id: int, stage: str) -> None:
        """
        标记候选人某个阶段的所有待办为已处理

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            stage: 阶段
        """
        todos = db.query(CandidateTodo).filter(
            and_(
                CandidateTodo.candidate_id == candidate_id,
                CandidateTodo.stage == stage,
                CandidateTodo.status == TodoStatus.PENDING.value
            )
        ).all()

        for todo in todos:
            todo.status = TodoStatus.PROCESSED.value
            todo.processed_at = get_china_time()

        db.commit()

    @staticmethod
    def get_my_todos(
        db: Session,
        user_id: int,
        stage_filter: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> Dict[str, List[Dict]]:
        """
        查询用户的待办列表，按流程分类

        Args:
            db: 数据库会话
            user_id: 用户ID
            stage_filter: 阶段过滤（可选）
            status_filter: 状态过滤（可选，默认只返回待处理）

        Returns:
            按流程分类的待办列表
        """
        # 构建查询条件
        query = db.query(CandidateTodo).filter(CandidateTodo.owner_id == user_id)

        # 默认只查询待处理的待办
        if status_filter:
            query = query.filter(CandidateTodo.status == status_filter)
        else:
            query = query.filter(CandidateTodo.status == TodoStatus.PENDING.value)

        if stage_filter:
            query = query.filter(CandidateTodo.stage == stage_filter)

        # 查询所有待办
        todos = query.order_by(CandidateTodo.created_at.desc()).all()

        # 批量预计算各 JD 的 total_score_max，避免 N+1 查询
        candidate_score_max_map = {}
        candidate_ids = [t.candidate_id for t in todos]
        if candidate_ids:
            # 查 candidate -> jd_id
            candidate_jd_pairs = db.query(
                Candidate.id, Candidate.jd_id
            ).filter(Candidate.id.in_(candidate_ids)).all()
            candidate_jd_map = {c_id: jd_id for c_id, jd_id in candidate_jd_pairs}

            # 查 jd -> resume_rule_set_id
            unique_jd_ids = set(jd_id for jd_id in candidate_jd_map.values() if jd_id)
            jd_rule_set_map = {}
            if unique_jd_ids:
                jd_rule_set_pairs = db.query(
                    JobDescription.id, JobDescription.resume_rule_set_id
                ).filter(JobDescription.id.in_(unique_jd_ids)).all()
                jd_rule_set_map = {jd_id: rs_id for jd_id, rs_id in jd_rule_set_pairs}

            unique_rule_set_ids = set(
                rs_id for rs_id in jd_rule_set_map.values() if rs_id is not None
            )

            # 批量查询评分规则满分
            rule_set_score_map = {}
            if unique_rule_set_ids:
                main_scores = db.query(
                    ResumeEvaluationRule.rule_set_id,
                    ResumeEvaluationRule.indicator_name,
                    func.max(ResumeEvaluationRule.total_score).label('max_score')
                ).filter(
                    and_(
                        ResumeEvaluationRule.rule_set_id.in_(unique_rule_set_ids),
                        ResumeEvaluationRule.is_bonus == False
                    )
                ).group_by(
                    ResumeEvaluationRule.rule_set_id,
                    ResumeEvaluationRule.indicator_name
                ).all()

                bonus_scores = db.query(
                    ResumeEvaluationRule.rule_set_id,
                    ResumeEvaluationRule.indicator_name,
                    func.max(ResumeEvaluationRule.total_score).label('max_score')
                ).filter(
                    and_(
                        ResumeEvaluationRule.rule_set_id.in_(unique_rule_set_ids),
                        ResumeEvaluationRule.is_bonus == True
                    )
                ).group_by(
                    ResumeEvaluationRule.rule_set_id,
                    ResumeEvaluationRule.indicator_name
                ).all()

                main_sum = defaultdict(float)
                for row in main_scores:
                    main_sum[row.rule_set_id] += (row.max_score or 0)

                bonus_sum = defaultdict(float)
                for row in bonus_scores:
                    bonus_sum[row.rule_set_id] += (row.max_score or 0)

                for rs_id in unique_rule_set_ids:
                    rule_set_score_map[rs_id] = main_sum.get(rs_id, 100) + bonus_sum.get(rs_id, 20)

            # 构建 candidate_id -> total_score_max 映射
            for c_id, jd_id in candidate_jd_map.items():
                rule_set_id = jd_rule_set_map.get(jd_id)
                if rule_set_id and rule_set_id in rule_set_score_map:
                    candidate_score_max_map[c_id] = rule_set_score_map[rule_set_id]
                else:
                    candidate_score_max_map[c_id] = 120

        # 按流程分类
        result = {
            "简历筛选": [],
            "面试": [],
            "谈薪&背调": []
        }

        for todo in todos:
            # 获取候选人信息
            candidate = db.query(Candidate).filter(Candidate.id == todo.candidate_id).first()
            if not candidate:
                continue

            # 构建待办信息（包含完整的候选人信息用于列表展示）
            todo_info = {
                "id": todo.id,
                "candidate_id": todo.candidate_id,
                "candidate_number": candidate.candidate_number,
                "candidate_name": candidate.name,
                "stage": todo.stage,
                "status": todo.status,
                "created_at": todo.created_at.isoformat() if todo.created_at else None,
                "jd_id": candidate.jd_id,
                "jd_title": candidate.jd.job_title if candidate.jd else None,
                "department": (candidate.jd.department_ref.name if candidate.jd.department_ref else candidate.jd.department) if candidate.jd else None,
                # 候选人详细信息
                "gender": candidate.gender,
                "age": candidate.age,
                "highest_education": candidate.highest_education,
                "school": candidate.school,
                "is_985": candidate.is_985,
                "is_211": candidate.is_211,
                "is_double_first_class": candidate.is_double_first_class,
                "work_years": candidate.work_years,
                "summary": candidate.summary,
                "resume_file_path": candidate.resume_file_path,
                "resume_upload_time": candidate.created_at.isoformat() if candidate.created_at else None,
                # AI评分信息
                "ai_score_total": candidate.ai_score_total,
                "hard_requirements_passed": candidate.hard_requirements_passed,
                "total_score_max": candidate_score_max_map.get(todo.candidate_id, 120)
            }

            # 分类
            if todo.stage == CandidateStage.RESUME_SCREENING.value:
                result["简历筛选"].append(todo_info)
            elif todo.stage in [
                CandidateStage.FIRST_INTERVIEW.value,
                CandidateStage.SECOND_INTERVIEW.value,
                CandidateStage.THIRD_INTERVIEW.value
            ]:
                # 查询该候选人在当前面试阶段的最新人工评价
                evaluation = db.query(InterviewEvaluation).filter(
                    InterviewEvaluation.candidate_id == todo.candidate_id,
                    InterviewEvaluation.stage == todo.stage
                ).order_by(InterviewEvaluation.id.desc()).first()

                if evaluation:
                    todo_info["manual_work_ability_score"] = evaluation.work_ability_score
                    todo_info["personal_quality_score"] = evaluation.personal_quality_total
                    todo_info["total_score"] = evaluation.total_score
                    todo_info["interview_result"] = evaluation.conclusion
                    todo_info["interview_time"] = evaluation.interview_time.isoformat() if evaluation.interview_time else None

                # 查询AI面试评分（来自录音评价）
                recording = db.query(InterviewRecording).filter(
                    InterviewRecording.candidate_id == todo.candidate_id,
                    InterviewRecording.stage == todo.stage
                ).order_by(InterviewRecording.id.desc()).first()

                if recording:
                    if recording.interview_score_main is not None:
                        todo_info["ai_work_ability_score"] = recording.interview_score_main
                    # 如果没有人工评价的面试时间，用录音开始时间
                    if not todo_info.get("interview_time") and recording.created_at:
                        todo_info["interview_time"] = recording.created_at.isoformat()

                result["面试"].append(todo_info)
            elif todo.stage == CandidateStage.SALARY_NEGOTIATION.value:
                # 补充谈薪&背调业务字段
                salary_neg = get_latest_salary_negotiation_record(db, todo.candidate_id)
                todo_info["salary_status"] = salary_neg.salary_status if salary_neg else "待处理"
                todo_info["background_check_status"] = salary_neg.background_check_status if salary_neg else "待处理"
                todo_info["offer_status"] = salary_neg.offer_status if salary_neg else "待发放"
                todo_info["is_onboarded"] = salary_neg.is_onboarded if salary_neg and salary_neg.is_onboarded is not None else False
                result["谈薪&背调"].append(todo_info)

        return result

    @staticmethod
    def transfer_todo(
        db: Session,
        candidate_id: int,
        new_owner_id: int,
        operator_id: int,
        target_stage: Optional[str] = None
    ) -> Dict:
        """
        转交待办（仅HR可操作）

        支持两种场景：
        1. 仅转交负责人（不传 target_stage 或传当前阶段）
        2. 转交负责人并推进到后续环节（仅允许当前及后续环节）
        """
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise ValueError(f"候选人不存在: {candidate_id}")

        if candidate.current_stage == CandidateStage.TERMINATED.value:
            raise ValueError("该候选人流程已终止，无法转交")

        new_owner = db.query(User).filter(User.id == new_owner_id, User.is_deleted == False).first()
        if not new_owner:
            raise ValueError(f"目标负责人不存在: {new_owner_id}")

        current_todo = db.query(CandidateTodo).filter(
            and_(
                CandidateTodo.candidate_id == candidate_id,
                CandidateTodo.status == TodoStatus.PENDING.value
            )
        ).first()
        if not current_todo:
            raise ValueError("该候选人没有待处理的待办")

        current_stage = current_todo.stage
        stage_order = [
            CandidateStage.RESUME_SCREENING.value,
            CandidateStage.FIRST_INTERVIEW.value,
            CandidateStage.SECOND_INTERVIEW.value,
            CandidateStage.THIRD_INTERVIEW.value,
            CandidateStage.SALARY_NEGOTIATION.value,
        ]
        if current_stage not in stage_order:
            raise ValueError(f"当前阶段不支持转交: {current_stage}")

        current_index = stage_order.index(current_stage)
        allowed_stages = [current_stage] if current_stage == CandidateStage.SALARY_NEGOTIATION.value else stage_order[current_index:]
        actual_target_stage = target_stage or current_stage
        if actual_target_stage not in allowed_stages:
            raise ValueError("转交环节仅允许选择当前及后续环节")

        stage_changed = actual_target_stage != current_stage
        if not stage_changed and current_todo.owner_id == new_owner_id:
            raise ValueError("新负责人与当前负责人相同")

        old_owner_id = current_todo.owner_id
        old_owner = db.query(User).filter(User.id == old_owner_id).first()
        previous_stage_result = candidate.current_stage_result

        current_todo.status = TodoStatus.PROCESSED.value
        current_todo.processed_at = get_china_time()

        new_todo = CandidateTodo(
            candidate_id=candidate_id,
            stage=actual_target_stage,
            owner_id=new_owner_id,
            status=TodoStatus.PENDING.value
        )
        db.add(new_todo)

        interview_stages = {
            CandidateStage.FIRST_INTERVIEW.value,
            CandidateStage.SECOND_INTERVIEW.value,
            CandidateStage.THIRD_INTERVIEW.value,
        }
        if stage_changed and current_stage in interview_stages and previous_stage_result == "待定":
            latest_evaluation = db.query(InterviewEvaluation).filter(
                and_(
                    InterviewEvaluation.candidate_id == candidate_id,
                    InterviewEvaluation.stage == current_stage
                )
            ).order_by(InterviewEvaluation.id.desc()).first()

            pass_history = CandidateStageHistory(
                candidate_id=candidate_id,
                stage=current_stage,
                stage_result=CandidateStageResult.PASSED.value,
                stage_owner=operator_id,
                next_stage=actual_target_stage,
                next_stage_owner=new_owner_id,
                comments=f"待定后转交至{actual_target_stage}，默认按通过处理",
                interview_evaluation_id=latest_evaluation.id if latest_evaluation else None,
            )
            db.add(pass_history)

        transfer_comments = (
            f"待办转交："
            f"{old_owner.real_name or old_owner.username if old_owner else '未知'} -> "
            f"{new_owner.real_name or new_owner.username}"
        )
        if stage_changed:
            transfer_comments += f"，环节：{current_stage} -> {actual_target_stage}"

        transfer_history = CandidateStageHistory(
            candidate_id=candidate_id,
            stage=current_stage,
            stage_result="转交",
            stage_owner=operator_id,
            next_stage=actual_target_stage,
            next_stage_owner=new_owner_id,
            comments=transfer_comments
        )
        db.add(transfer_history)

        candidate.current_stage_owner = new_owner_id
        if stage_changed:
            candidate.current_stage = actual_target_stage
            candidate.current_stage_result = CandidateStageResult.PENDING.value

        db.commit()
        db.refresh(new_todo)

        if stage_changed and actual_target_stage in interview_stages:
            from services.stage_flow_service import StageFlowService
            StageFlowService._trigger_interview_question_generation(
                candidate_id,
                actual_target_stage,
                operator_id,
            )

        TodoService._send_todo_email(db, candidate_id, actual_target_stage, new_owner_id)

        return {
            "success": True,
            "candidate_id": candidate_id,
            "source_stage": current_stage,
            "target_stage": actual_target_stage,
            "stage_changed": stage_changed,
            "old_owner_id": old_owner_id,
            "old_owner_name": old_owner.real_name or old_owner.username if old_owner else "未知",
            "new_owner_id": new_owner_id,
            "new_owner_name": new_owner.real_name or new_owner.username,
            "message": "待办转交成功"
        }

    @staticmethod
    def get_todo_by_candidate_and_stage(
        db: Session,
        candidate_id: int,
        stage: str,
        owner_id: int
    ) -> Optional[CandidateTodo]:
        """
        根据候选人ID、阶段和负责人ID查询待办

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            stage: 阶段
            owner_id: 负责人ID

        Returns:
            待办对象或None
        """
        return db.query(CandidateTodo).filter(
            and_(
                CandidateTodo.candidate_id == candidate_id,
                CandidateTodo.stage == stage,
                CandidateTodo.owner_id == owner_id,
                CandidateTodo.status == TodoStatus.PENDING.value
            )
        ).first()
