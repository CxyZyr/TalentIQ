"""
面试评价路由接口
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from db.database import get_db_context
from services.interview_evaluation_service import InterviewEvaluationService
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/interview-evaluation", tags=["面试评价"])


@router.get("/ai-score/{recording_id}")
async def get_ai_score_for_reference(
    recording_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取AI评分用于引用

    返回AI评分详情和调整后得分（AI总分*0.8）
    """
    try:
        with get_db_context() as db:
            ai_score = InterviewEvaluationService.get_ai_score_for_reference(
                db=db,
                recording_id=recording_id
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": ai_score
            }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{candidate_id}/{stage}")
async def get_evaluation_by_candidate_and_stage(
    candidate_id: int,
    stage: str,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    根据候选人ID和阶段查询面试评价
    """
    try:
        with get_db_context() as db:
            evaluation = InterviewEvaluationService.get_evaluation_by_candidate_and_stage(
                db=db,
                candidate_id=candidate_id,
                stage=stage
            )

            if not evaluation:
                return {
                    "code": 404,
                    "message": "未找到面试评价",
                    "data": None
                }

            # 获取评价详情
            evaluation_detail = InterviewEvaluationService.get_evaluation_detail(
                db=db,
                evaluation_id=evaluation.id
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": evaluation_detail
            }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/detail/{evaluation_id}")
async def get_evaluation_detail(
    evaluation_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取面试评价详情
    """
    try:
        with get_db_context() as db:
            evaluation_detail = InterviewEvaluationService.get_evaluation_detail(
                db=db,
                evaluation_id=evaluation_id
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": evaluation_detail
            }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
