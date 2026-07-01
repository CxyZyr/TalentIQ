"""
JD路由接口
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime
import json
import os

from db.database import get_db_context
from services.jd_service import JDService
from utils.word_exporter import WordExporter
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/jd", tags=["JD管理"])


# ==================== 请求模型 ====================

class JDBaseInfo(BaseModel):
    """JD基本信息"""
    job_title: str = Field(..., description="岗位名称（必填）")
    industry: Optional[str] = Field(None, description="所属行业")
    job_level: Optional[str] = Field(None, description="岗位级别")
    department: str = Field(..., description="所属部门（必填）")
    salary_range: Optional[str] = Field(None, description="薪资范围")
    headcount: Optional[int] = Field(None, description="岗位人数")
    expected_onboard_date: Optional[str] = Field(None, description="期望到岗时间")
    job_responsibilities: Optional[str] = Field(None, description="岗位职责")
    hard_requirements: Optional[str] = Field(None, description="任职资格-硬性条件")
    other_requirements: Optional[str] = Field(None, description="任职资格-其他要求")


class AIAssistRequest(BaseModel):
    """AI帮写请求"""
    output_mode: str = Field(..., description="输出模式: job_responsibilities/hard_requirements/other_requirements")
    jd_info: JDBaseInfo


class SaveJDRequest(BaseModel):
    """保存JD请求"""
    id: Optional[int] = Field(None, description="JD ID（更新时提供）")
    jd_data: JDBaseInfo


class PublishJDRequest(BaseModel):
    """发布JD请求"""
    id: Optional[int] = Field(None, description="JD ID（更新时提供）")
    jd_data: JDBaseInfo


# ==================== 路由接口 ====================

@router.post("/ai-assist")
async def ai_assist_write(
    request: AIAssistRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    AI帮写接口（流式输出）

    根据提供的JD信息，使用LLM生成对应的内容
    """
    try:
        async def generate():
            with get_db_context() as db:
                jd_service = JDService(db)
                async for chunk in jd_service.async_ai_assist_write_stream(
                    jd_info=request.jd_info.dict(),
                    output_mode=request.output_mode
                ):
                    yield f"data: {json.dumps({'content': chunk})}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_jd(
    request: SaveJDRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    保存JD为草稿
    """
    try:
        with get_db_context() as db:
            jd_service = JDService(db)
            jd_data = request.jd_data.dict()
            if request.id:
                jd_data['id'] = request.id

            jd = jd_service.save_jd_as_draft(jd_data, current_user.id)

            return {
                "code": 200,
                "message": "保存成功",
                "data": {
                    "id": jd.id,
                    "status": jd.status
                }
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/publish")
async def publish_jd(
    request: PublishJDRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    发布JD

    发布时会自动提取硬性条件并关联评分规则
    """
    try:
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[发布JD] 收到请求: id={request.id}, user={current_user.id}")
        logger.info(f"[发布JD] 请求数据: {request.jd_data.dict()}")

        with get_db_context() as db:
            jd_service = JDService(db)
            jd_data = request.jd_data.dict()
            if request.id:
                jd_data['id'] = request.id

            jd = await jd_service.async_publish_jd(jd_data, current_user.id)

            return {
                "code": 200,
                "message": "发布成功",
                "data": {
                    "id": jd.id,
                    "status": jd.status,
                    "published_at": jd.published_at.isoformat() if jd.published_at else None,
                    "extracted_hard_requirements": jd.extracted_hard_requirements
                }
            }
    except ValueError as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"[发布JD] ValueError: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import logging, traceback
        logger = logging.getLogger(__name__)
        logger.error(f"[发布JD] Exception: {str(e)}")
        logger.error(f"[发布JD] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def get_jd_list(
    current_user: CurrentUser = Depends(get_current_user),
    keyword: Optional[str] = Query(None, description="关键词（岗位名称/创建者）"),
    department: Optional[str] = Query(None, description="所属部门（筛选）"),
    status: Optional[str] = Query(None, description="状态（筛选）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量")
):
    """
    查询JD列表

    根据用户角色返回相应的JD列表，支持部门和状态筛选
    """
    try:
        with get_db_context() as db:
            jd_service = JDService(db)
            result = jd_service.query_jd_list(
                user_id=current_user.id,
                keyword=keyword,
                department=department,
                status=status,
                page=page,
                page_size=page_size
            )
            return {
                "code": 200,
                "message": "查询成功",
                "data": result
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{jd_id}")
async def get_jd_detail(
    jd_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取JD详情
    """
    try:
        with get_db_context() as db:
            jd_service = JDService(db)
            jd = jd_service.get_jd_by_id(jd_id, current_user.id)

            if not jd:
                raise HTTPException(status_code=404, detail="JD不存在")

            return {
                "code": 200,
                "message": "查询成功",
                "data": {
                    "id": jd.id,
                    "job_title": jd.job_title,
                    "industry": jd.industry,
                    "job_level": jd.job_level,
                    "department": jd.department_ref.name if jd.department_ref else jd.department,
                    "salary_range": jd.salary_range,
                    "headcount": jd.headcount,
                    "expected_onboard_date": jd.expected_onboard_date.isoformat() if jd.expected_onboard_date else None,
                    "job_responsibilities": jd.job_responsibilities,
                    "hard_requirements": jd.hard_requirements,
                    "other_requirements": jd.other_requirements,
                    "status": jd.status,
                    "created_at": jd.created_at.isoformat() if jd.created_at else None,
                    "updated_at": jd.updated_at.isoformat() if jd.updated_at else None,
                    "published_at": jd.published_at.isoformat() if jd.published_at else None,
                    "extracted_hard_requirements": jd.extracted_hard_requirements
                }
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{jd_id}")
async def update_jd(
    jd_id: int,
    request: SaveJDRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    更新JD（编辑功能）
    """
    try:
        with get_db_context() as db:
            jd_service = JDService(db)
            jd = jd_service.update_jd(jd_id, request.jd_data.dict(), current_user.id)

            return {
                "code": 200,
                "message": "更新成功",
                "data": {
                    "id": jd.id,
                    "status": jd.status
                }
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{jd_id}")
async def delete_jd(
    jd_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    删除JD（仅草稿状态可删除）
    """
    try:
        with get_db_context() as db:
            jd_service = JDService(db)
            jd_service.delete_jd(jd_id, current_user.id)

            return {
                "code": 200,
                "message": "删除成功"
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{jd_id}/close")
async def close_jd(
    jd_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    关闭JD（仅HR可操作）
    """
    try:
        with get_db_context() as db:
            jd_service = JDService(db)
            jd = jd_service.close_jd(jd_id, current_user.id)

            return {
                "code": 200,
                "message": "关闭成功",
                "data": {
                    "id": jd.id,
                    "status": jd.status,
                    "closed_at": jd.closed_at.isoformat() if jd.closed_at else None
                }
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{jd_id}/export")
async def export_jd_to_word(
    jd_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    导出JD为Word文档（直接下载）
    """
    try:
        with get_db_context() as db:
            jd_service = JDService(db)
            jd = jd_service.get_jd_by_id(jd_id, current_user.id)

            if not jd:
                raise HTTPException(status_code=404, detail="JD不存在")

            # 导出为Word
            exporter = WordExporter()
            file_path = exporter.export_jd_to_word(jd)

            # 检查文件是否存在
            if not os.path.exists(file_path):
                raise HTTPException(status_code=500, detail="文件生成失败")

            # 生成下载文件名（使用URL编码处理中文）
            from urllib.parse import quote
            filename = f"JD_{jd.job_title}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
            encoded_filename = quote(filename)

            # 返回文件下载响应
            return FileResponse(
                path=file_path,
                filename=filename,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={
                    "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
                }
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
