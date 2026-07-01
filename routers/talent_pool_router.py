"""
人才储备API路由
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from services.talent_pool_service import TalentPoolService
from routers.auth_router import get_current_user
from utils.auth import CurrentUser
from db.database import get_db


router = APIRouter(prefix="/api/talent-pool", tags=["人才储备"])


# 依赖注入
def get_db_context():
    db = get_db()
    try:
        yield db
    finally:
        db.close()


# ==================== 请求模型 ====================

class AddToTalentPoolRequest(BaseModel):
    """添加到人才储备库请求"""
    candidate_ids: List[int] = Field(..., description="候选人ID列表")
    remark: Optional[str] = Field(None, description="入库备注")


class RemoveFromTalentPoolRequest(BaseModel):
    """从人才储备库删除请求"""
    talent_pool_ids: List[int] = Field(..., description="人才储备记录ID列表")


class RestartRecruitmentRequest(BaseModel):
    """重启招聘流程请求"""
    talent_pool_id: int = Field(..., description="人才储备记录ID")
    jd_id: int = Field(..., description="新的JD ID")
    screening_owner_id: int = Field(..., description="简历筛选负责人ID")


# ==================== API端点 ====================

@router.post("/add")
async def add_to_talent_pool(
    request: AddToTalentPoolRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    将候选人添加到人才储备库

    只有HR可以操作
    """
    try:
        result = TalentPoolService.add_to_talent_pool(
            db=db,
            candidate_ids=request.candidate_ids,
            user_id=current_user.id,
            remark=request.remark
        )

        return {
            "code": 200,
            "message": f"成功添加 {result['success']} 人到人才储备库",
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"添加到人才储备库失败: {str(e)}")


@router.get("/list")
async def get_talent_pool_list(
    keyword: Optional[str] = None,
    jd_id: Optional[int] = None,
    department: Optional[str] = None,
    jd_ids: Optional[str] = None,
    departments: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    查询人才储备库列表

    所有用户都可以查看
    """
    try:
        result = TalentPoolService.get_talent_pool_list(
            db=db,
            user_id=current_user.id,
            keyword=keyword,
            jd_id=jd_id,
            department=department,
            jd_ids=jd_ids,
            departments=departments,
            page=page,
            page_size=page_size
        )

        return {
            "code": 200,
            "message": "查询成功",
            "data": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询人才储备库失败: {str(e)}")


@router.post("/remove")
async def remove_from_talent_pool(
    request: RemoveFromTalentPoolRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    从人才储备库删除

    只有HR可以操作
    """
    try:
        result = TalentPoolService.remove_from_talent_pool(
            db=db,
            talent_pool_ids=request.talent_pool_ids,
            user_id=current_user.id
        )

        return {
            "code": 200,
            "message": f"成功删除 {result['deleted']} 人",
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"从人才储备库删除失败: {str(e)}")


@router.post("/restart")
async def restart_recruitment(
    request: RestartRecruitmentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    重启招聘流程

    从人才储备库中选择候选人，创建新的候选人记录进入简历筛选流程

    只有HR可以操作
    """
    try:
        result = TalentPoolService.restart_recruitment(
            db=db,
            talent_pool_id=request.talent_pool_id,
            jd_id=request.jd_id,
            screening_owner_id=request.screening_owner_id,
            user_id=current_user.id
        )

        return {
            "code": 200,
            "message": result['message'],
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重启招聘流程失败: {str(e)}")


@router.get("/{talent_pool_id}")
async def get_talent_pool_detail(
    talent_pool_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    获取人才储备详情
    """
    from db.models import TalentPool, Candidate, JobDescription

    try:
        talent_pool = db.query(TalentPool).filter(TalentPool.id == talent_pool_id).first()
        if not talent_pool:
            raise HTTPException(status_code=404, detail="人才储备记录不存在")

        candidate = talent_pool.candidate
        jd = talent_pool.jd
        if not candidate:
            raise HTTPException(status_code=404, detail="人才储备记录异常，关联候选人不存在")
        if candidate.created_at and talent_pool.created_at and candidate.created_at > talent_pool.created_at:
            raise HTTPException(status_code=404, detail="人才储备记录异常，关联候选人已失效")

        return {
            "code": 200,
            "message": "查询成功",
            "data": {
                "id": talent_pool.id,
                "candidate_id": candidate.id,
                "candidate_name": candidate.name,
                "jd_id": jd.id if jd else None,
                "job_title": jd.job_title if jd else None,
                "department": (jd.department_ref.name if jd.department_ref else jd.department) if jd else None,
                "remark": talent_pool.remark,
                "created_at": talent_pool.created_at.isoformat() if talent_pool.created_at else None
            }
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询人才储备详情失败: {str(e)}")
