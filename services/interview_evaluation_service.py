"""
面试评价服务
"""
from datetime import datetime
from sqlalchemy.orm import Session
from db.models import InterviewEvaluation, InterviewRecording, Candidate, get_china_time
from typing import Dict, Optional


class InterviewEvaluationService:
    """面试评价服务类"""

    @staticmethod
    def calculate_total_score(
        motivation_score: float,
        communication_score: float,
        responsibility_score: float,
        stability_score: float,
        work_ability_score: float
    ) -> tuple:
        """
        计算总分

        Args:
            motivation_score: 求职动机得分
            communication_score: 沟通能力得分
            responsibility_score: 责任心得分
            stability_score: 职业稳定性得分
            work_ability_score: 工作能力得分

        Returns:
            (个人素养总分, 总分)
        """
        personal_quality_total = (
            motivation_score + communication_score +
            responsibility_score + stability_score
        )
        total_score = personal_quality_total + work_ability_score
        return personal_quality_total, total_score

    @staticmethod
    def get_ai_score_for_reference(db: Session, recording_id: int) -> Dict:
        """
        获取AI评分用于引用

        Args:
            db: 数据库会话
            recording_id: 录音记录ID

        Returns:
            AI评分详情（直接使用AI总分，不需要调整）
        """
        recording = db.query(InterviewRecording).filter(
            InterviewRecording.id == recording_id
        ).first()

        if not recording:
            raise ValueError(f"录音记录不存在: {recording_id}")

        if not recording.interview_score_total:
            raise ValueError("AI评分尚未完成，无法引用")

        return {
            "recording_id": recording.id,
            "ai_score_main": recording.interview_score_main,
            "ai_score_bonus": recording.interview_score_bonus,
            "ai_score_total": recording.interview_score_total,
            "interview_evaluation": recording.interview_evaluation
        }

    @staticmethod
    def create_evaluation(
        db: Session,
        candidate_id: int,
        stage: str,
        interview_time: datetime,
        motivation_score: float,
        communication_score: float,
        responsibility_score: float,
        stability_score: float,
        work_ability_score: float,
        conclusion: str,
        evaluator_id: int,
        is_ai_referenced: bool = False,
        recording_id: Optional[int] = None,
        comments: Optional[str] = None
    ) -> InterviewEvaluation:
        """
        创建面试评价

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            stage: 面试阶段
            interview_time: 面试时间
            motivation_score: 求职动机得分
            communication_score: 沟通能力得分
            responsibility_score: 责任心得分
            stability_score: 职业稳定性得分
            work_ability_score: 工作能力得分
            conclusion: 面试结论
            evaluator_id: 评价人ID
            is_ai_referenced: 是否引用AI评分
            recording_id: 录音记录ID
            comments: 面试评价

        Returns:
            创建的面试评价对象
        """
        # 验证候选人是否存在
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise ValueError(f"候选人不存在: {candidate_id}")

        # 如果引用AI评分但未填写工作能力得分，使用AI总分作为默认值
        # （引用后允许用户调整，以前端实际提交值为准）
        if is_ai_referenced and recording_id and not work_ability_score:
            ai_score_info = InterviewEvaluationService.get_ai_score_for_reference(db, recording_id)
            work_ability_score = ai_score_info["ai_score_total"]

        # 计算总分
        personal_quality_total, total_score = InterviewEvaluationService.calculate_total_score(
            motivation_score, communication_score, responsibility_score,
            stability_score, work_ability_score
        )

        # 创建面试评价
        evaluation = InterviewEvaluation(
            candidate_id=candidate_id,
            recording_id=recording_id,
            stage=stage,
            interview_time=interview_time,
            motivation_score=motivation_score,
            communication_score=communication_score,
            responsibility_score=responsibility_score,
            stability_score=stability_score,
            personal_quality_total=personal_quality_total,
            work_ability_score=work_ability_score,
            is_ai_referenced=is_ai_referenced,
            total_score=total_score,
            conclusion=conclusion,
            comments=comments,
            evaluator_id=evaluator_id
        )

        db.add(evaluation)
        db.commit()
        db.refresh(evaluation)
        return evaluation

    @staticmethod
    def get_evaluation_by_candidate_and_stage(
        db: Session,
        candidate_id: int,
        stage: str
    ) -> Optional[InterviewEvaluation]:
        """
        根据候选人ID和阶段查询面试评价

        Args:
            db: 数据库会话
            candidate_id: 候选人ID
            stage: 面试阶段

        Returns:
            面试评价对象或None
        """
        return db.query(InterviewEvaluation).filter(
            InterviewEvaluation.candidate_id == candidate_id,
            InterviewEvaluation.stage == stage
        ).order_by(InterviewEvaluation.id.desc()).first()

    @staticmethod
    def get_evaluation_detail(db: Session, evaluation_id: int) -> Dict:
        """
        获取面试评价详情

        Args:
            db: 数据库会话
            evaluation_id: 评价ID

        Returns:
            面试评价详情
        """
        evaluation = db.query(InterviewEvaluation).filter(
            InterviewEvaluation.id == evaluation_id
        ).first()

        if not evaluation:
            raise ValueError(f"面试评价不存在: {evaluation_id}")

        return {
            "id": evaluation.id,
            "candidate_id": evaluation.candidate_id,
            "candidate_name": evaluation.candidate.name if evaluation.candidate else None,
            "recording_id": evaluation.recording_id,
            "stage": evaluation.stage,
            "interview_time": evaluation.interview_time.isoformat() if evaluation.interview_time else None,
            "personal_quality": {
                "motivation_score": evaluation.motivation_score,
                "communication_score": evaluation.communication_score,
                "responsibility_score": evaluation.responsibility_score,
                "stability_score": evaluation.stability_score,
                "total": evaluation.personal_quality_total
            },
            "work_ability": {
                "score": evaluation.work_ability_score,
                "is_ai_referenced": evaluation.is_ai_referenced
            },
            "total_score": evaluation.total_score,
            "conclusion": evaluation.conclusion,
            "comments": evaluation.comments,
            "evaluator_id": evaluation.evaluator_id,
            "evaluator_name": evaluation.evaluator.real_name if evaluation.evaluator else None,
            "created_at": evaluation.created_at.isoformat() if evaluation.created_at else None
        }
