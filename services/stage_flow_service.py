"""
流程流转服务
"""
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_
from sqlalchemy.exc import SQLAlchemyError
from db.models import (
    Candidate, CandidateStageHistory, CandidateStage, CandidateStageResult,
    InterviewEvaluation, CandidateTodo, TodoStatus, User, UserRole, get_china_time
)
from services.todo_service import TodoService
from services.interview_evaluation_service import InterviewEvaluationService
from typing import Optional, Dict
import threading


class StageFlowService:
    """流程流转服务类"""

    @staticmethod
    def get_rollback_info(db: Session, candidate_id: int) -> Optional[Dict]:
        """查询终止流程候选人的回退信息"""
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate or candidate.current_stage != CandidateStage.TERMINATED.value:
            return None

        termination_history = db.query(CandidateStageHistory).filter(
            CandidateStageHistory.candidate_id == candidate_id,
            CandidateStageHistory.next_stage == CandidateStage.TERMINATED.value
        ).order_by(CandidateStageHistory.id.desc()).first()

        if not termination_history:
            return None

        source_stage = termination_history.stage
        latest_stage_todo = db.query(CandidateTodo).filter(
            CandidateTodo.candidate_id == candidate_id,
            CandidateTodo.stage == source_stage
        ).order_by(CandidateTodo.id.desc()).first()

        source_owner_id = latest_stage_todo.owner_id if latest_stage_todo else termination_history.stage_owner
        source_owner = db.query(User).filter(User.id == source_owner_id).first() if source_owner_id else None

        return {
            "source_stage": source_stage,
            "source_owner_id": source_owner_id,
            "source_owner_name": source_owner.real_name or source_owner.username if source_owner else "未知",
            "termination_history_id": termination_history.id
        }

    @staticmethod
    def process_resume_screening(
        db: Session,
        candidate_id: int,
        result: str,
        comments: str,
        user_id: int,
        next_stage: Optional[str] = None,
        next_owner_id: Optional[int] = None,
        rejection_reason: Optional[str] = None
    ) -> Dict:
        """
        处理简历筛选

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            result: 结果（通过/不通过）
            comments: 评价意见（必填）
            user_id: 当前操作人ID
            next_stage: 下一阶段（通过时必填）
            next_owner_id: 下一阶段负责人ID（通过时必填）
            rejection_reason: 淘汰原因（不通过时必填）

        Returns:
            处理结果
        """
        try:
            # 验证候选人
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise ValueError(f"候选人不存在: {candidate_id}")

            # 验证当前阶段
            if candidate.current_stage != CandidateStage.RESUME_SCREENING.value:
                raise ValueError(f"候选人当前阶段不是简历筛选: {candidate.current_stage}")

            # 验证权限（只有当前阶段负责人可以处理）
            if candidate.current_stage_owner != user_id:
                raise ValueError("只有当前阶段负责人可以处理该流程")

            # 验证必填字段
            if not comments:
                raise ValueError("评价意见为必填项")

            # 根据结果设置下一阶段
            if result == CandidateStageResult.PASSED.value:
                # 通过：必须填写下一阶段和负责人
                if not next_stage or not next_owner_id:
                    raise ValueError("通过时必须指定下一阶段和负责人")
                final_next_stage = next_stage
                final_next_owner_id = next_owner_id
                final_rejection_reason = None
            elif result == CandidateStageResult.REJECTED.value:
                # 不通过：必须填写淘汰原因，系统自动设置终止流程
                if not rejection_reason:
                    raise ValueError("不通过时必须填写淘汰原因")
                final_next_stage = CandidateStage.TERMINATED.value
                final_next_owner_id = user_id
                final_rejection_reason = rejection_reason
            else:
                raise ValueError(f"无效的结果: {result}")

            # 开始事务处理
            # 1. 创建流程历史记录
            history = CandidateStageHistory(
                candidate_id=candidate_id,
                stage=CandidateStage.RESUME_SCREENING.value,
                stage_result=result,
                stage_owner=user_id,
                next_stage=final_next_stage,
                next_stage_owner=final_next_owner_id,
                comments=comments,
                rejection_reason=final_rejection_reason
            )
            db.add(history)

            # 2. 更新候选人状态
            candidate.current_stage = final_next_stage
            candidate.current_stage_result = CandidateStageResult.PENDING.value if result == CandidateStageResult.PASSED.value else result
            candidate.current_stage_owner = final_next_owner_id

            # 3. 标记当前待办为已处理
            TodoService.mark_candidate_todos_processed(
                db, candidate_id, CandidateStage.RESUME_SCREENING.value
            )

            # 4. 如果通过，创建下一阶段的待办
            if result == CandidateStageResult.PASSED.value:
                TodoService.create_todo(
                    db, candidate_id, final_next_stage, final_next_owner_id
                )

            # 提交事务
            db.commit()
            db.refresh(candidate)

            # 5. 如果通过且进入面试阶段，异步生成面试问题
            if result == CandidateStageResult.PASSED.value and final_next_stage in [
                CandidateStage.FIRST_INTERVIEW.value,
                CandidateStage.SECOND_INTERVIEW.value,
                CandidateStage.THIRD_INTERVIEW.value
            ]:
                StageFlowService._trigger_interview_question_generation(
                    candidate_id, final_next_stage, user_id
                )

            return {
                "success": True,
                "candidate_id": candidate_id,
                "current_stage": candidate.current_stage,
                "current_stage_result": candidate.current_stage_result,
                "current_stage_owner": candidate.current_stage_owner,
                "message": "简历筛选处理成功"
            }

        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    def process_interview(
        db: Session,
        candidate_id: int,
        stage: str,
        interview_evaluation_data: Dict,
        user_id: int,
        next_stage: Optional[str] = None,
        next_owner_id: Optional[int] = None,
        rejection_reason: Optional[str] = None
    ) -> Dict:
        """
        处理面试流程

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            stage: 当前面试阶段
            interview_evaluation_data: 面试评价数据
            user_id: 当前操作人ID
            next_stage: 下一阶段（通过时必填）
            next_owner_id: 下一阶段负责人ID（通过时必填）
            rejection_reason: 淘汰原因（不通过时必填）

        Returns:
            处理结果
        """
        try:
            # 验证候选人
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise ValueError(f"候选人不存在: {candidate_id}")

            # 验证当前阶段
            if candidate.current_stage != stage:
                raise ValueError(f"候选人当前阶段不匹配: 期望{stage}, 实际{candidate.current_stage}")

            # 验证权限
            if candidate.current_stage_owner != user_id:
                raise ValueError("只有当前阶段负责人可以处理该流程")

            # 创建面试评价
            evaluation = InterviewEvaluationService.create_evaluation(
                db=db,
                candidate_id=candidate_id,
                stage=stage,
                interview_time=interview_evaluation_data["interview_time"],
                motivation_score=interview_evaluation_data["personal_quality"]["motivation_score"],
                communication_score=interview_evaluation_data["personal_quality"]["communication_score"],
                responsibility_score=interview_evaluation_data["personal_quality"]["responsibility_score"],
                stability_score=interview_evaluation_data["personal_quality"]["stability_score"],
                work_ability_score=interview_evaluation_data["work_ability"]["score"],
                conclusion=interview_evaluation_data["conclusion"],
                evaluator_id=user_id,
                is_ai_referenced=interview_evaluation_data["work_ability"].get("is_ai_referenced", False),
                recording_id=interview_evaluation_data["work_ability"].get("recording_id"),
                comments=interview_evaluation_data.get("comments")
            )

            # 待定处理：不流转，不标记待办为已处理，但更新阶段结果为待定
            if evaluation.conclusion == "待定":
                candidate.current_stage_result = "待定"

                # 创建流程历史记录（用于招聘日志展示）
                history = CandidateStageHistory(
                    candidate_id=candidate_id,
                    stage=stage,
                    stage_result="待定",
                    stage_owner=user_id,
                    next_stage=stage,
                    next_stage_owner=candidate.current_stage_owner,
                    comments=interview_evaluation_data.get("comments"),
                    interview_evaluation_id=evaluation.id
                )
                db.add(history)

                db.commit()
                db.refresh(candidate)
                return {
                    "success": True,
                    "candidate_id": candidate_id,
                    "evaluation_id": evaluation.id,
                    "current_stage": candidate.current_stage,
                    "current_stage_result": candidate.current_stage_result,
                    "current_stage_owner": candidate.current_stage_owner,
                    "message": "面试评价已保存（待定）"
                }

            # 根据结论设置下一阶段
            result = CandidateStageResult.PASSED.value if evaluation.conclusion == "通过" else CandidateStageResult.REJECTED.value

            if result == CandidateStageResult.PASSED.value:
                # 通过：必须填写下一阶段和负责人
                if not next_stage or not next_owner_id:
                    raise ValueError("通过时必须指定下一阶段和负责人")
                final_next_stage = next_stage
                final_next_owner_id = next_owner_id
                final_rejection_reason = None
            else:
                # 淘汰：必须填写淘汰原因，系统自动设置终止流程
                if not rejection_reason:
                    raise ValueError("淘汰时必须填写淘汰原因")
                final_next_stage = CandidateStage.TERMINATED.value
                final_next_owner_id = user_id
                final_rejection_reason = rejection_reason

            # 创建流程历史记录
            history = CandidateStageHistory(
                candidate_id=candidate_id,
                stage=stage,
                stage_result=result,
                stage_owner=user_id,
                next_stage=final_next_stage,
                next_stage_owner=final_next_owner_id,
                comments=interview_evaluation_data.get("comments"),
                rejection_reason=final_rejection_reason,
                interview_evaluation_id=evaluation.id
            )
            db.add(history)

            # 更新候选人状态
            candidate.current_stage = final_next_stage
            candidate.current_stage_result = CandidateStageResult.PENDING.value if result == CandidateStageResult.PASSED.value else result
            candidate.current_stage_owner = final_next_owner_id

            # 标记当前待办为已处理
            TodoService.mark_candidate_todos_processed(db, candidate_id, stage)

            # 如果通过，创建下一阶段的待办
            if result == CandidateStageResult.PASSED.value:
                TodoService.create_todo(db, candidate_id, final_next_stage, final_next_owner_id)

            # 提交事务
            db.commit()
            db.refresh(candidate)

            # 如果通过且进入下一轮面试，异步生成面试问题
            if result == CandidateStageResult.PASSED.value and final_next_stage in [
                CandidateStage.FIRST_INTERVIEW.value,
                CandidateStage.SECOND_INTERVIEW.value,
                CandidateStage.THIRD_INTERVIEW.value
            ]:
                StageFlowService._trigger_interview_question_generation(
                    candidate_id, final_next_stage, user_id
                )

            return {
                "success": True,
                "candidate_id": candidate_id,
                "evaluation_id": evaluation.id,
                "current_stage": candidate.current_stage,
                "current_stage_result": candidate.current_stage_result,
                "current_stage_owner": candidate.current_stage_owner,
                "message": "面试流程处理成功"
            }

        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    def terminate_process(
        db: Session,
        candidate_id: int,
        termination_reason: Optional[str],
        user_id: int
    ) -> Dict:
        """
        终止流程

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            termination_reason: 终止原因（非必填）
            user_id: 当前操作人ID

        Returns:
            处理结果
        """
        try:
            # 验证候选人
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise ValueError(f"候选人不存在: {candidate_id}")

            # 验证是否已经终止
            if candidate.current_stage == CandidateStage.TERMINATED.value:
                raise ValueError("该候选人流程已终止")

            # 记录当前阶段
            current_stage = candidate.current_stage

            # 创建流程历史记录
            history = CandidateStageHistory(
                candidate_id=candidate_id,
                stage=current_stage,
                stage_result=CandidateStageResult.REJECTED.value,
                stage_owner=user_id,
                next_stage=CandidateStage.TERMINATED.value,
                next_stage_owner=user_id,
                termination_reason=termination_reason,
                comments=f"流程终止{': ' + termination_reason if termination_reason else ''}"
            )
            db.add(history)

            # 更新候选人状态
            candidate.current_stage = CandidateStage.TERMINATED.value
            candidate.current_stage_result = CandidateStageResult.REJECTED.value
            candidate.current_stage_owner = user_id

            # 标记当前待办为已处理
            TodoService.mark_candidate_todos_processed(db, candidate_id, current_stage)

            # 提交事务
            db.commit()
            db.refresh(candidate)

            return {
                "success": True,
                "candidate_id": candidate_id,
                "current_stage": candidate.current_stage,
                "message": "流程已终止"
            }

        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    def hr_terminate_process(
        db: Session,
        candidate_id: int,
        termination_reason: str,
        user_id: int
    ) -> Dict:
        """
        HR异常终止流程（仅HR可操作）

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            termination_reason: 终止原因（必填）
            user_id: 当前操作人ID（HR）

        Returns:
            处理结果
        """
        try:
            # 验证候选人
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise ValueError(f"候选人不存在: {candidate_id}")

            # 验证是否已经终止
            if candidate.current_stage == CandidateStage.TERMINATED.value:
                raise ValueError("该候选人流程已终止")

            # 记录当前阶段
            current_stage = candidate.current_stage

            # 创建流程历史记录（标记为异常终止）
            history = CandidateStageHistory(
                candidate_id=candidate_id,
                stage=current_stage,
                stage_result=CandidateStageResult.REJECTED.value,
                stage_owner=user_id,
                next_stage=CandidateStage.TERMINATED.value,
                next_stage_owner=user_id,
                termination_reason=termination_reason,
                is_abnormal_terminated=True,
                comments=f"HR异常终止: {termination_reason}"
            )
            db.add(history)

            # 更新候选人状态
            candidate.current_stage = CandidateStage.TERMINATED.value
            candidate.current_stage_result = CandidateStageResult.REJECTED.value
            candidate.current_stage_owner = user_id

            # 标记当前待办为已处理
            TodoService.mark_candidate_todos_processed(db, candidate_id, current_stage)

            # 提交事务
            db.commit()
            db.refresh(candidate)

            return {
                "success": True,
                "candidate_id": candidate_id,
                "current_stage": candidate.current_stage,
                "message": "流程已异常终止"
            }

        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    def rollback_terminated_candidate(
        db: Session,
        candidate_id: int,
        user_id: int
    ) -> Dict:
        """将终止流程候选人回退到终止前的上一环节"""
        try:
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise ValueError(f"候选人不存在: {candidate_id}")

            if candidate.current_stage != CandidateStage.TERMINATED.value:
                raise ValueError("只有终止流程的候选人才允许回退")

            rollback_info = StageFlowService.get_rollback_info(db, candidate_id)
            if not rollback_info:
                raise ValueError("未找到可回退的上一环节信息")

            operator = db.query(User).filter(User.id == user_id).first()
            if not operator:
                raise ValueError("操作人不存在")

            source_stage = rollback_info["source_stage"]
            source_owner_id = rollback_info["source_owner_id"]
            source_owner_name = rollback_info["source_owner_name"]
            termination_history_id = rollback_info["termination_history_id"]

            if not source_owner_id:
                raise ValueError("未找到上一环节负责人，无法回退")

            if operator.role != UserRole.HR.value and user_id != source_owner_id:
                raise ValueError("仅HR或上一环节负责人可以执行回退")

            latest_pending_todo = db.query(CandidateTodo).filter(
                and_(
                    CandidateTodo.candidate_id == candidate_id,
                    CandidateTodo.status == TodoStatus.PENDING.value
                )
            ).first()
            if latest_pending_todo:
                latest_pending_todo.status = TodoStatus.PROCESSED.value
                latest_pending_todo.processed_at = get_china_time()

            rollback_history = CandidateStageHistory(
                candidate_id=candidate_id,
                stage=source_stage,
                stage_result="",
                stage_owner=user_id,
                next_stage=source_stage,
                next_stage_owner=source_owner_id,
                comments=f"终止流程回退：{CandidateStage.TERMINATED.value} -> {source_stage}",
                attachments={
                    "action": "rollback",
                    "termination_history_id": termination_history_id,
                    "operator_id": user_id
                }
            )
            db.add(rollback_history)

            new_todo = CandidateTodo(
                candidate_id=candidate_id,
                stage=source_stage,
                owner_id=source_owner_id,
                status=TodoStatus.PENDING.value
            )
            db.add(new_todo)

            candidate.current_stage = source_stage
            candidate.current_stage_result = CandidateStageResult.PENDING.value
            candidate.current_stage_owner = source_owner_id

            db.commit()
            db.refresh(candidate)
            db.refresh(new_todo)

            TodoService._send_todo_email(db, candidate_id, source_stage, source_owner_id)

            return {
                "success": True,
                "candidate_id": candidate_id,
                "current_stage": candidate.current_stage,
                "current_stage_result": candidate.current_stage_result,
                "current_stage_owner": candidate.current_stage_owner,
                "source_stage": source_stage,
                "source_owner_id": source_owner_id,
                "source_owner_name": source_owner_name,
                "message": "候选人已回退到上一环节"
            }

        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    def get_abnormal_termination_info(db: Session, candidate_id: int) -> Optional[Dict]:
        """
        查询候选人的异常终止信息

        Args:
            db: 数据库会话
            candidate_id: 候选人ID

        Returns:
            异常终止信息或None
        """
        from db.models import User
        history = db.query(CandidateStageHistory).filter(
            CandidateStageHistory.candidate_id == candidate_id,
            CandidateStageHistory.is_abnormal_terminated == True
        ).order_by(CandidateStageHistory.id.desc()).first()

        if not history:
            return None

        operator = db.query(User).filter(User.id == history.stage_owner).first()

        return {
            "stage": history.stage,
            "termination_reason": history.termination_reason,
            "operator_name": operator.real_name or operator.username if operator else "未知",
            "terminated_at": history.created_at.isoformat() if history.created_at else None
        }

    @staticmethod
    def _trigger_interview_question_generation(candidate_id: int, stage: str, user_id: int):
        """
        触发面试问题生成（后台异步）

        Args:
            candidate_id: 候选人ID
            stage: 面试阶段
            user_id: 用户ID
        """
        def generate_questions():
            from db.database import SessionLocal
            from services.interview_service import InterviewService

            db = SessionLocal()
            try:
                interview_service = InterviewService(db)
                interview_service.generate_interview_questions(
                    candidate_id=candidate_id,
                    stage=stage,
                    user_id=user_id
                )
                print(f"面试问题生成成功: 候选人{candidate_id}, 阶段{stage}")
            except Exception as e:
                print(f"面试问题生成失败: {str(e)}")
            finally:
                db.close()

        # 在后台线程中执行
        thread = threading.Thread(target=generate_questions)
        thread.daemon = True
        thread.start()
