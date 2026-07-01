"""
候选人管理扩展接口 - 包含详细信息查询等功能
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import Optional, Dict, List

from db.database import get_db_context
from sqlalchemy import func
from db.models import (
    Candidate, User, JobDescription, CandidateStageHistory,
    InterviewRecording, InterviewEvaluation, InterviewQuestion,
    UserRole, CandidateStage, ResumeEvaluationRule
)
from db.salary_negotiation_queries import get_latest_salary_negotiation_record
from services.candidate_service import CandidateService
from services.stage_flow_service import StageFlowService
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/candidate-ext", tags=["候选人管理扩展"])


@router.get("/{candidate_id}/complete-info")
async def get_candidate_complete_info(
    candidate_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    查询候选人完整信息

    返回内容：
    - 基本信息
    - 基本概况
    - 隐私信息（按身份区分，普通面试官返回为空）
    - AI评分详情
    - 简历筛选环节信息
    - 面试环节信息（一面/二面/三面）
    - 谈薪&背调环节信息
    """
    try:
        with get_db_context() as db:
            CandidateService(db).get_candidate_by_id(candidate_id, current_user.id)

            # 查询候选人基本信息
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise HTTPException(status_code=404, detail="候选人不存在")

            # 查询JD信息
            jd = db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()

            # 构建基本信息
            basic_info = {
                "candidate_id": candidate.id,
                "candidate_number": candidate.candidate_number,
                "name": candidate.name,
                "gender": candidate.gender,
                "age": candidate.age,
                "work_status": candidate.work_status,
                "work_years": candidate.work_years,
                "expected_salary": candidate.expected_salary,
                "highest_education": candidate.highest_education,
                "school": candidate.school,
                "is_985": candidate.is_985,
                "is_211": candidate.is_211,
                "is_double_first_class": candidate.is_double_first_class,
                "resume_file_path": candidate.resume_file_path,
                "created_at": candidate.created_at.isoformat() if candidate.created_at else None,
                "current_stage": candidate.current_stage,
                "current_stage_result": candidate.current_stage_result,
                "current_stage_owner": candidate.current_stage_owner,
                "current_stage_owner_name": (
                    lambda u: u.real_name or u.username if u else None
                )(db.query(User).filter(User.id == candidate.current_stage_owner).first() if candidate.current_stage_owner else None)
            }

            # 基本概况
            summary = candidate.summary

            # 隐私信息（只有HR和CEO可见）
            privacy_info = None
            if current_user.role in [UserRole.HR.value, UserRole.CEO.value]:
                privacy_info = candidate.privacy_info

            # 查询评分规则的满分信息（按指标去重后求和）
            main_score_max = 100  # 默认值
            bonus_score_max = 20  # 默认值
            if jd and jd.resume_rule_set_id:
                # 获取所有指标（按指标名称去重，取每个指标的total_score）
                from sqlalchemy.sql import distinct

                # 计算主要分满分（非加分项）- 按指标名称去重
                main_indicators = db.query(
                    ResumeEvaluationRule.indicator_name,
                    func.max(ResumeEvaluationRule.total_score).label('max_score')
                ).filter(
                    and_(
                        ResumeEvaluationRule.rule_set_id == jd.resume_rule_set_id,
                        ResumeEvaluationRule.is_bonus == False
                    )
                ).group_by(ResumeEvaluationRule.indicator_name).all()

                if main_indicators:
                    main_score_max = sum(ind.max_score or 0 for ind in main_indicators)

                # 计算加分项满分 - 按指标名称去重
                bonus_indicators = db.query(
                    ResumeEvaluationRule.indicator_name,
                    func.max(ResumeEvaluationRule.total_score).label('max_score')
                ).filter(
                    and_(
                        ResumeEvaluationRule.rule_set_id == jd.resume_rule_set_id,
                        ResumeEvaluationRule.is_bonus == True
                    )
                ).group_by(ResumeEvaluationRule.indicator_name).all()

                if bonus_indicators:
                    bonus_score_max = sum(ind.max_score or 0 for ind in bonus_indicators)

            # AI评分详情
            ai_score = {
                "ai_score_main": candidate.ai_score_main,
                "ai_score_bonus": candidate.ai_score_bonus,
                "ai_score_total": candidate.ai_score_total,
                "main_score_max": main_score_max,
                "bonus_score_max": bonus_score_max,
                "total_score_max": main_score_max + bonus_score_max,
                "ai_score_detail": candidate.ai_score_detail,
                "hard_requirements_assessment": candidate.hard_requirements_assessment,
                "hard_requirements_passed": candidate.hard_requirements_passed
            }

            rollback_info = StageFlowService.get_rollback_info(db, candidate_id)

            def get_stage_history_for_display(stage: str):
                latest_history = db.query(CandidateStageHistory).filter(
                    and_(
                        CandidateStageHistory.candidate_id == candidate_id,
                        CandidateStageHistory.stage == stage,
                        or_(
                            CandidateStageHistory.stage_result != "转交",
                            CandidateStageHistory.stage_result == None
                        ),
                        or_(
                            CandidateStageHistory.is_abnormal_terminated == False,
                            CandidateStageHistory.is_abnormal_terminated == None
                        )
                    )
                ).order_by(CandidateStageHistory.id.desc()).first()

                if latest_history and latest_history.comments and latest_history.comments.startswith("终止流程回退"):
                    previous_history = db.query(CandidateStageHistory).filter(
                        and_(
                            CandidateStageHistory.candidate_id == candidate_id,
                            CandidateStageHistory.stage == stage,
                            CandidateStageHistory.id < latest_history.id,
                            or_(
                                CandidateStageHistory.stage_result != "转交",
                                CandidateStageHistory.stage_result == None
                            ),
                            or_(
                                CandidateStageHistory.is_abnormal_terminated == False,
                                CandidateStageHistory.is_abnormal_terminated == None
                            )
                        )
                    ).order_by(CandidateStageHistory.id.desc()).first()
                    return latest_history, previous_history, True

                return latest_history, latest_history, False

            # 简历筛选环节信息
            resume_screening = None
            screening_history, screening_display_history, screening_rollback = get_stage_history_for_display(CandidateStage.RESUME_SCREENING.value)

            if screening_history or screening_display_history:
                owner_id = None
                if screening_rollback and screening_history and screening_history.next_stage_owner:
                    owner_id = screening_history.next_stage_owner
                else:
                    owner_id = ((screening_history.stage_owner if screening_history else None) or (screening_display_history.stage_owner if screening_display_history else None))
                owner = db.query(User).filter(User.id == owner_id).first() if owner_id else None
                resume_screening = {
                    "负责人": owner.real_name if owner else "未知",
                    "状态": None if screening_rollback else (screening_history.stage_result if screening_history else None),
                    "完成时间": screening_display_history.created_at.isoformat() if screening_display_history and screening_display_history.created_at else None,
                    "原因": screening_display_history.rejection_reason or screening_display_history.comments if screening_display_history else None
                }

            # 面试环节信息（一面/二面/三面）
            interviews = []
            for stage in [CandidateStage.FIRST_INTERVIEW.value,
                         CandidateStage.SECOND_INTERVIEW.value,
                         CandidateStage.THIRD_INTERVIEW.value]:

                interview_history, interview_display_history, interview_rollback = get_stage_history_for_display(stage)

                evaluation = None
                if interview_display_history and interview_display_history.interview_evaluation_id:
                    evaluation = db.query(InterviewEvaluation).filter(
                        InterviewEvaluation.id == interview_display_history.interview_evaluation_id
                    ).first()
                elif not interview_display_history:
                    evaluation = db.query(InterviewEvaluation).filter(
                        and_(
                            InterviewEvaluation.candidate_id == candidate_id,
                            InterviewEvaluation.stage == stage
                        )
                    ).order_by(InterviewEvaluation.id.desc()).first()

                if interview_display_history or evaluation:
                    recording = db.query(InterviewRecording).filter(
                        and_(
                            InterviewRecording.candidate_id == candidate_id,
                            InterviewRecording.stage == stage,
                            InterviewRecording.interview_score_total != None
                        )
                    ).order_by(InterviewRecording.id.desc()).first()

                    if not recording:
                        recording = db.query(InterviewRecording).filter(
                            and_(
                                InterviewRecording.candidate_id == candidate_id,
                                InterviewRecording.stage == stage
                            )
                        ).order_by(InterviewRecording.id.desc()).first()

                    owner = None
                    owner_id = None
                    if interview_rollback and interview_history and interview_history.next_stage_owner:
                        owner_id = interview_history.next_stage_owner
                    elif interview_history:
                        owner_id = interview_history.stage_owner
                    elif candidate.current_stage == stage and candidate.current_stage_owner:
                        owner_id = candidate.current_stage_owner
                    elif interview_display_history:
                        owner_id = interview_display_history.stage_owner

                    if owner_id:
                        owner = db.query(User).filter(User.id == owner_id).first()

                    status = None if interview_rollback else (interview_history.stage_result if interview_history else candidate.current_stage_result)

                    interview_info = {
                        "轮次": stage,
                        "负责人": owner.real_name if owner else "未知",
                        "状态": status,
                        "总分": evaluation.total_score if evaluation else None,
                        "面试评价": evaluation.comments if evaluation else None,
                        "淘汰原因": interview_display_history.rejection_reason if interview_display_history else None,
                        "面试时间": recording.created_at.isoformat() if recording and recording.created_at else None,
                        "评价时间": interview_display_history.created_at.isoformat() if interview_display_history and interview_display_history.created_at else (evaluation.created_at.isoformat() if evaluation and hasattr(evaluation, 'created_at') and evaluation.created_at else None),
                        "recording_id": recording.id if recording else None,
                        "has_qa": bool(recording and recording.extracted_qa),
                        "ai_interview_score_total": recording.interview_score_total if recording else None,
                        "ai_interview_score_main": recording.interview_score_main if recording else None,
                        "ai_interview_score_bonus": recording.interview_score_bonus if recording else None,
                        "ai_interview_evaluation": recording.interview_evaluation if recording else None,
                        "ai_comprehensive_evaluation": recording.comprehensive_evaluation if recording else None,
                        "ai_strengths": recording.strengths if recording else None,
                        "ai_weaknesses": recording.weaknesses if recording else None,
                    }
                    interviews.append(interview_info)

            # 谈薪&背调环节信息
            salary_negotiation_info = None
            salary_negotiation = get_latest_salary_negotiation_record(db, candidate_id)

            if salary_negotiation:
                creator = db.query(User).filter(User.id == salary_negotiation.created_by).first()
                salary_negotiation_info = {
                    "负责人": creator.real_name if creator else "未知",
                    "谈薪状态": salary_negotiation.salary_status,
                    "背调状态": salary_negotiation.background_check_status,
                    "背调报告": salary_negotiation.background_report_path,
                    "OFFER状态": salary_negotiation.offer_status,
                    "是否入职": "是" if salary_negotiation.is_onboarded else "否",
                    "流程结束时间": salary_negotiation.submitted_at.isoformat() if salary_negotiation.submitted_at else None
                }

            # 查询异常终止信息
            abnormal_termination = None
            termination_history = db.query(CandidateStageHistory).filter(
                and_(
                    CandidateStageHistory.candidate_id == candidate_id,
                    CandidateStageHistory.is_abnormal_terminated == True
                )
            ).order_by(CandidateStageHistory.id.desc()).first()
            if termination_history:
                t_operator = db.query(User).filter(User.id == termination_history.stage_owner).first()
                abnormal_termination = {
                    "stage": termination_history.stage,
                    "termination_reason": termination_history.termination_reason,
                    "operator_name": t_operator.real_name or t_operator.username if t_operator else "未知",
                    "terminated_at": termination_history.created_at.isoformat() if termination_history.created_at else None
                }

            # 组装完整信息
            complete_info = {
                "基本信息": basic_info,
                "应聘职位": jd.job_title if jd else None,
                "所属部门": (jd.department_ref.name if jd.department_ref else jd.department) if jd else None,
                "基本概况": summary,
                "隐私信息": privacy_info,
                "AI评分详情": ai_score,
                "简历筛选": resume_screening,
                "面试环节": interviews,
                "谈薪&背调": salary_negotiation_info,
                "异常终止": abnormal_termination,
                "回退信息": rollback_info
            }

            return {
                "code": 200,
                "message": "查询成功",
                "data": complete_info
            }

    except HTTPException as e:
        raise e
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{candidate_id}/ai-score-detail")
async def get_ai_score_detail(
    candidate_id: int,
    stage: str,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    查看AI评分详情

    返回内容：
    - 候选人姓名
    - 应聘职位
    - 面试轮次
    - 面试时间
    - AI面试评分详情（完整）
    - AI综合评价
    - 优劣势
    - 面试问题清单
    """
    try:
        with get_db_context() as db:
            CandidateService(db).get_candidate_by_id(candidate_id, current_user.id)

            # 查询候选人
            candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
            if not candidate:
                raise HTTPException(status_code=404, detail="候选人不存在")

            # 查询JD
            jd = db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()

            # 查询录音记录
            recording = db.query(InterviewRecording).filter(
                and_(
                    InterviewRecording.candidate_id == candidate_id,
                    InterviewRecording.stage == stage
                )
            ).order_by(
                InterviewRecording.created_at.desc(),
                InterviewRecording.id.desc()
            ).first()

            if not recording:
                raise HTTPException(status_code=404, detail="未找到该轮次的面试录音")

            # 构建返回数据
            result = {
                "候选人姓名": candidate.name,
                "应聘职位": jd.job_title if jd else None,
                "面试轮次": stage,
                "面试时间": recording.created_at.isoformat() if recording.created_at else None,
                "AI面试评分详情": recording.interview_evaluation,
                "AI总分": recording.interview_score_total,
                "AI综合评价": recording.comprehensive_evaluation,
                "优势": recording.strengths,
                "劣势": recording.weaknesses,
                "面试问题清单": recording.extracted_qa
            }

            return {
                "code": 200,
                "message": "查询成功",
                "data": result
            }

    except HTTPException as e:
        raise e
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{candidate_id}/interview-qa/{stage}")
async def get_interview_qa(
    candidate_id: int,
    stage: str,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    查看面试问题清单（AI从转录文本中提取的问答）

    返回AI提取的面试官问过的问题以及候选人的回答
    """
    try:
        with get_db_context() as db:
            CandidateService(db).get_candidate_by_id(candidate_id, current_user.id)

            # 查询录音记录
            recording = db.query(InterviewRecording).filter(
                and_(
                    InterviewRecording.candidate_id == candidate_id,
                    InterviewRecording.stage == stage
                )
            ).order_by(
                InterviewRecording.created_at.desc(),
                InterviewRecording.id.desc()
            ).first()

            if not recording:
                raise HTTPException(status_code=404, detail="未找到该轮次的面试录音")

            if not recording.extracted_qa:
                return {
                    "code": 404,
                    "message": "AI尚未提取面试问答",
                    "data": None
                }

            return {
                "code": 200,
                "message": "查询成功",
                "data": {
                    "candidate_id": candidate_id,
                    "stage": stage,
                    "qa_pairs": recording.extracted_qa.get("qa_pairs", [])
                }
            }

    except HTTPException as e:
        raise e
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{candidate_id}/generated-questions/{stage}")
async def get_generated_questions(
    candidate_id: int,
    stage: str,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    查看AI生成的面试问题

    返回AI为该面试环节生成的问题，每个问题包含状态（已提问/未提问）
    """
    try:
        with get_db_context() as db:
            CandidateService(db).get_candidate_by_id(candidate_id, current_user.id)

            # 查询面试问题
            interview_question = db.query(InterviewQuestion).filter(
                and_(
                    InterviewQuestion.candidate_id == candidate_id,
                    InterviewQuestion.stage == stage
                )
            ).first()

            if not interview_question:
                return {
                    "code": 404,
                    "message": "未找到该轮次的面试问题",
                    "data": None
                }

            # 确保每个问题都有status字段
            questions = interview_question.questions or []
            for q in questions:
                if "status" not in q:
                    q["status"] = "未提问"

            return {
                "code": 200,
                "message": "查询成功",
                "data": {
                    "id": interview_question.id,
                    "candidate_id": candidate_id,
                    "stage": stage,
                    "questions": questions,
                    "created_at": interview_question.created_at.isoformat() if interview_question.created_at else None
                }
            }

    except HTTPException as e:
        raise e
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/questions/{question_id}/update-status")
async def update_question_status(
    question_id: int,
    question_index: int,
    status: str,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    修改面试问题状态

    Args:
        question_id: 面试问题记录ID
        question_index: 问题索引（从0开始）
        status: 状态（已提问/未提问）
    """
    try:
        with get_db_context() as db:
            # 查询面试问题
            interview_question = db.query(InterviewQuestion).filter(
                InterviewQuestion.id == question_id
            ).first()

            if not interview_question:
                raise HTTPException(status_code=404, detail="面试问题不存在")

            CandidateService(db).get_candidate_by_id(
                interview_question.candidate_id,
                current_user.id
            )

            # 更新问题状态
            questions = interview_question.questions or []
            if question_index < 0 or question_index >= len(questions):
                raise HTTPException(status_code=400, detail="问题索引无效")

            questions[question_index]["status"] = status
            interview_question.questions = questions

            db.commit()

            return {
                "code": 200,
                "message": "状态更新成功",
                "data": {
                    "question_id": question_id,
                    "question_index": question_index,
                    "status": status
                }
            }

    except HTTPException as e:
        raise e
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
