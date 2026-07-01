"""
谈薪&背调路由接口
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import os
import shutil

from db.database import get_db_context
from services.candidate_service import CandidateService
from services.salary_negotiation_service import SalaryNegotiationService
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/salary-negotiation", tags=["谈薪&背调"])


# ==================== 请求模型 ====================

class SalaryNegotiationRequest(BaseModel):
    """谈薪&背调请求"""
    salary_status: str = Field(..., description="谈薪状态（待处理/进行中/已完成/谈薪失败）")
    background_check_status: str = Field(..., description="背调状态（待处理/进行中/已完成）")
    background_report_path: Optional[str] = Field(None, description="背调报告路径")
    offer_status: str = Field(..., description="OFFER状态（待发放/已发放/已回签/已拒绝/自主放弃）")
    is_onboarded: bool = Field(..., description="是否入职")


# ==================== 路由接口 ====================

@router.post("/upload-report")
async def upload_background_report(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    上传背调报告

    支持格式：PDF、Word（.doc/.docx）、JPG、PNG
    文件大小限制：50MB
    返回文件路径，用于保存/提交时使用
    """
    try:
        # 校验文件类型
        allowed_extensions = {'.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'}
        file_extension = os.path.splitext(file.filename)[1].lower()
        if file_extension not in allowed_extensions:
            raise HTTPException(status_code=400, detail=f"不支持的文件格式: {file_extension}，支持PDF、Word、JPG、PNG")

        # 校验文件大小（50MB）
        max_size = 50 * 1024 * 1024
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > max_size:
            raise HTTPException(status_code=400, detail="文件大小不能超过50MB")

        # 创建上传目录
        upload_dir = "uploads/background_reports"
        os.makedirs(upload_dir, exist_ok=True)

        # 生成文件名
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(file.filename)[1]
        filename = f"report_{timestamp}_{current_user.id}{file_extension}"
        file_path = os.path.join(upload_dir, filename)

        # 保存文件
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "code": 200,
            "message": "背调报告上传成功",
            "data": {
                "file_path": file_path,
                "filename": filename
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save/{candidate_id}")
async def save_salary_negotiation(
    candidate_id: int,
    request: SalaryNegotiationRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    保存谈薪&背调信息（不提交）

    保存后：
    - 信息写入数据库
    - 下一轮负责人和事件为空
    - 不创建流程历史记录
    """
    try:
        with get_db_context() as db:
            result = SalaryNegotiationService.save_salary_negotiation(
                db=db,
                candidate_id=candidate_id,
                salary_status=request.salary_status,
                background_check_status=request.background_check_status,
                background_report_path=request.background_report_path,
                offer_status=request.offer_status,
                is_onboarded=request.is_onboarded,
                user_id=current_user.id
            )

            return {
                "code": 200,
                "message": "保存成功",
                "data": result
            }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/submit/{candidate_id}")
async def submit_salary_negotiation(
    candidate_id: int,
    request: SalaryNegotiationRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    提交谈薪&背调信息（完成流程）

    提交后：
    - 信息写入数据库
    - 下一轮负责人 = 提交人
    - 下一轮事件 = 流程终止
    - 创建流程历史记录
    - 标记待办为已处理
    """
    try:
        with get_db_context() as db:
            result = SalaryNegotiationService.submit_salary_negotiation(
                db=db,
                candidate_id=candidate_id,
                salary_status=request.salary_status,
                background_check_status=request.background_check_status,
                background_report_path=request.background_report_path,
                offer_status=request.offer_status,
                is_onboarded=request.is_onboarded,
                user_id=current_user.id
            )

            return {
                "code": 200,
                "message": "提交成功，流程已完成",
                "data": result
            }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{candidate_id}")
async def get_salary_negotiation(
    candidate_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取候选人的谈薪&背调信息
    """
    try:
        with get_db_context() as db:
            CandidateService(db).get_candidate_by_id(candidate_id, current_user.id)

            result = SalaryNegotiationService.get_salary_negotiation(
                db=db,
                candidate_id=candidate_id
            )

            if not result:
                return {
                    "code": 200,
                    "message": "暂无谈薪&背调信息",
                    "data": None
                }

            return {
                "code": 200,
                "message": "查询成功",
                "data": result
            }

    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list/all")
async def get_all_salary_negotiations(
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    查询所有候选人的谈薪&背调信息（带权限控制）

    权限规则：
    - CEO/HR：可以看到所有候选人
    - 面试官：只能看到与自己相关的候选人（任何流程中有参与）

    返回字段：
    - 序号
    - 候选人ID
    - 姓名
    - 应聘职位
    - 所属部门
    - 谈薪状态
    - 背调状态
    - OFFER状态
    - 是否入职
    """
    try:
        with get_db_context() as db:
            result = SalaryNegotiationService.get_all_salary_negotiations(
                db=db,
                user_id=current_user.id,
                user_role=current_user.role
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": result,
                "total": len(result)
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
