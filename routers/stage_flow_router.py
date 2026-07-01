"""
流程流转路由接口
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from db.database import get_db_context
from services.stage_flow_service import StageFlowService
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/stage-flow", tags=["流程流转"])


# ==================== 请求模型 ====================

class ResumeScreeningRequest(BaseModel):
    """简历筛选请求"""
    result: str = Field(..., description="结果（通过/不通过）")
    comments: str = Field(..., description="评价意见（必填）")
    next_stage: Optional[str] = Field(None, description="下一阶段（通过时必填）")
    next_owner_id: Optional[int] = Field(None, description="下一阶段负责人ID（通过时必填）")
    rejection_reason: Optional[str] = Field(None, description="淘汰原因（不通过时必填）")


class PersonalQualityScores(BaseModel):
    """个人素养评分"""
    motivation_score: float = Field(..., ge=0, le=5, description="求职动机得分（0-5）")
    communication_score: float = Field(..., ge=0, le=5, description="沟通能力得分（0-5）")
    responsibility_score: float = Field(..., ge=0, le=5, description="责任心得分（0-5）")
    stability_score: float = Field(..., ge=0, le=5, description="职业稳定性得分（0-5）")


class WorkAbilityScore(BaseModel):
    """工作能力评分"""
    score: float = Field(..., ge=0, le=80, description="工作能力得分（0-80）")
    is_ai_referenced: bool = Field(False, description="是否引用AI评分")
    recording_id: Optional[int] = Field(None, description="录音ID（引用AI评分时需要）")


class InterviewRequest(BaseModel):
    """面试流程请求"""
    stage: str = Field(..., description="面试阶段（一面/二面/三面）")
    interview_time: datetime = Field(..., description="面试时间（必填）")
    personal_quality: PersonalQualityScores = Field(..., description="个人素养评分")
    work_ability: WorkAbilityScore = Field(..., description="工作能力评分")
    conclusion: str = Field(..., description="面试结论（通过/不通过/待定）")
    comments: Optional[str] = Field(None, description="面试评价（选填）")
    next_stage: Optional[str] = Field(None, description="下一阶段（通过时必填）")
    next_owner_id: Optional[int] = Field(None, description="下一阶段负责人ID（通过时必填）")
    rejection_reason: Optional[str] = Field(None, description="淘汰原因（不通过时必填）")


class TerminateRequest(BaseModel):
    """终止流程请求"""
    termination_reason: Optional[str] = Field(None, description="终止原因（非必填）")


class HRTerminateRequest(BaseModel):
    """HR异常终止流程请求"""
    termination_reason: str = Field(..., description="终止原因（必填）")


# ==================== 路由接口 ====================

@router.post("/resume-screening/{candidate_id}")
async def process_resume_screening(
    candidate_id: int,
    request: ResumeScreeningRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    处理简历筛选

    业务逻辑：
    - 如果通过：必须填写 next_stage 和 next_owner_id
    - 如果不通过：只需填写 rejection_reason，系统自动设置 next_stage="终止流程"，next_owner_id=当前操作人
    - 如果通过且进入面试阶段，后台异步生成面试问题
    """
    try:
        with get_db_context() as db:
            result = StageFlowService.process_resume_screening(
                db=db,
                candidate_id=candidate_id,
                result=request.result,
                comments=request.comments,
                user_id=current_user.id,
                next_stage=request.next_stage,
                next_owner_id=request.next_owner_id,
                rejection_reason=request.rejection_reason
            )

            return {
                "code": 200,
                "message": "简历筛选处理成功",
                "data": result
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/interview/{candidate_id}")
async def process_interview(
    candidate_id: int,
    request: InterviewRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    处理面试流程

    业务逻辑：
    - 面试时间必填，用户手动输入
    - 如果引用AI评分，直接使用AI总分作为工作能力得分
    - 计算总分 = 个人素养总分（20分） + 工作能力得分（80分） = 100分
    - 如果通过：必须填写 next_stage 和 next_owner_id
    - 如果不通过：只需填写 rejection_reason，系统自动设置 next_stage="终止流程"，next_owner_id=当前操作人
    - 如果通过且进入下一轮面试，后台异步生成面试问题
    """
    try:
        with get_db_context() as db:
            # 构建面试评价数据
            interview_evaluation_data = {
                "interview_time": request.interview_time,
                "personal_quality": {
                    "motivation_score": request.personal_quality.motivation_score,
                    "communication_score": request.personal_quality.communication_score,
                    "responsibility_score": request.personal_quality.responsibility_score,
                    "stability_score": request.personal_quality.stability_score
                },
                "work_ability": {
                    "score": request.work_ability.score,
                    "is_ai_referenced": request.work_ability.is_ai_referenced,
                    "recording_id": request.work_ability.recording_id
                },
                "conclusion": request.conclusion,
                "comments": request.comments
            }

            result = StageFlowService.process_interview(
                db=db,
                candidate_id=candidate_id,
                stage=request.stage,
                interview_evaluation_data=interview_evaluation_data,
                user_id=current_user.id,
                next_stage=request.next_stage,
                next_owner_id=request.next_owner_id,
                rejection_reason=request.rejection_reason
            )

            return {
                "code": 200,
                "message": "面试流程处理成功",
                "data": result
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/terminate/{candidate_id}")
async def terminate_process(
    candidate_id: int,
    request: TerminateRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    终止流程

    任何阶段都可以选择终止流程，终止原因为非必填
    """
    try:
        with get_db_context() as db:
            result = StageFlowService.terminate_process(
                db=db,
                candidate_id=candidate_id,
                termination_reason=request.termination_reason,
                user_id=current_user.id
            )

            return {
                "code": 200,
                "message": "流程已终止",
                "data": result
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hr-terminate/{candidate_id}")
async def hr_terminate_process(
    candidate_id: int,
    request: HRTerminateRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    HR异常终止流程（仅HR可操作）

    在任何阶段HR都可以主动终止候选人流程，终止原因为必填。
    """
    # 权限校验：仅HR
    if current_user.role != "HR":
        raise HTTPException(status_code=403, detail="仅HR可以执行异常终止操作")

    try:
        with get_db_context() as db:
            result = StageFlowService.hr_terminate_process(
                db=db,
                candidate_id=candidate_id,
                termination_reason=request.termination_reason,
                user_id=current_user.id
            )

            return {
                "code": 200,
                "message": "流程已异常终止",
                "data": result
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rollback-terminated/{candidate_id}")
async def rollback_terminated_candidate(
    candidate_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """将终止流程候选人回退到上一环节"""
    try:
        with get_db_context() as db:
            result = StageFlowService.rollback_terminated_candidate(
                db=db,
                candidate_id=candidate_id,
                user_id=current_user.id
            )

            return {
                "code": 200,
                "message": "候选人回退成功",
                "data": result
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/termination-info/{candidate_id}")
async def get_termination_info(
    candidate_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    查询候选人的异常终止信息
    """
    try:
        with get_db_context() as db:
            info = StageFlowService.get_abnormal_termination_info(db, candidate_id)
            return {
                "code": 200,
                "message": "查询成功",
                "data": info
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
