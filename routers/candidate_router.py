"""
候选人管理API路由
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional, Annotated
from pydantic import BaseModel, Field
import os
import shutil
import uuid
from pathlib import Path

from services.candidate_service import CandidateService
from routers.auth_router import get_current_user
from utils.auth import CurrentUser
from db.database import get_db
from db.models import UserRole, Candidate, JobDescription
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/candidate", tags=["候选人管理"])
ALLOWED_RESUME_EXTENSIONS = {".pdf", ".doc", ".docx"}

# 依赖注入
def get_db_context():
    db = get_db()
    try:
        yield db
    finally:
        db.close()


def _validate_resume_filename(filename: str) -> str:
    """校验并返回简历文件扩展名"""
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_RESUME_EXTENSIONS:
        raise HTTPException(status_code=400, detail="仅支持上传 PDF、DOC、DOCX 格式的简历")
    return ext


def _build_resume_file_path(prefix: str, original_filename: str) -> str:
    """生成简历文件的唯一存储路径"""
    upload_dir = "uploads/resumes"
    os.makedirs(upload_dir, exist_ok=True)
    file_ext = _validate_resume_filename(original_filename)
    unique_filename = f"{prefix}_{uuid.uuid4().hex}{file_ext}"
    return os.path.join(upload_dir, unique_filename)


# ==================== 请求/响应模型 ====================

class CandidateAddRequest(BaseModel):
    """添加候选人请求"""
    jd_id: int
    screening_owner_id: int


class CandidateQueryRequest(BaseModel):
    """查询候选人请求"""
    jd_id: Optional[int] = None
    stage: Optional[str] = None
    page: int = 1
    page_size: int = 20


class CandidateUpdateRequest(BaseModel):
    """更新候选人基本信息请求"""
    name: Optional[str] = Field(None, description="姓名")
    gender: Optional[str] = Field(None, description="性别")
    age: Optional[int] = Field(None, description="年龄")
    work_status: Optional[str] = Field(None, description="工作状态")
    work_years: Optional[int] = Field(None, description="工作年限")
    expected_salary: Optional[str] = Field(None, description="期望薪资")
    highest_education: Optional[str] = Field(None, description="最高学历")
    school: Optional[str] = Field(None, description="学校")
    privacy_info: Optional[str] = Field(None, description="隐私信息")


# ==================== API端点 ====================

@router.post("/add")
async def add_candidates(
    jd_id: int = Form(...),
    screening_owner_id: int = Form(...),
    resume_files: List[UploadFile] = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    添加候选人（批量上传简历）

    只有HR可以操作
    """
    try:
        # 保存上传的简历文件
        saved_files = []
        for resume_file in resume_files:
            file_path = _build_resume_file_path(str(current_user.id), resume_file.filename)

            # 保存文件
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(resume_file.file, buffer)

            saved_files.append(file_path)

        # 调用服务层处理
        candidate_service = CandidateService(db)
        result = candidate_service.add_candidates(
            jd_id=jd_id,
            resume_files=saved_files,
            screening_owner_id=screening_owner_id,
            user_id=current_user.id
        )

        return {
            "code": 200,
            "message": "候选人添加成功，正在后台解析简历",
            "data": result
        }

    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"添加候选人失败: {str(e)}")


@router.get("/list")
async def query_candidates(
    keyword: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    jd_id: Optional[int] = None,
    department: Optional[str] = None,
    stage: Optional[str] = None,
    screening_result: Optional[str] = None,
    first_interview_result: Optional[str] = None,
    second_interview_result: Optional[str] = None,
    third_interview_result: Optional[str] = None,
    offer_status: Optional[str] = None,
    # 多选筛选参数（逗号分隔）
    jd_ids: Optional[str] = None,
    departments: Optional[str] = None,
    stages: Optional[str] = None,
    screening_results: Optional[str] = None,
    first_interview_results: Optional[str] = None,
    second_interview_results: Optional[str] = None,
    third_interview_results: Optional[str] = None,
    offer_statuses: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    查询候选人列表

    支持多种筛选条件，支持多选（逗号分隔）
    """
    try:
        candidate_service = CandidateService(db)
        result = candidate_service.query_candidates(
            user_id=current_user.id,
            keyword=keyword,
            start_date=start_date,
            end_date=end_date,
            jd_id=jd_id,
            jd_ids=jd_ids,
            department=department,
            stage=stage,
            screening_result=screening_result,
            first_interview_result=first_interview_result,
            second_interview_result=second_interview_result,
            third_interview_result=third_interview_result,
            offer_status=offer_status,
            departments=departments,
            stages=stages,
            screening_results=screening_results,
            first_interview_results=first_interview_results,
            second_interview_results=second_interview_results,
            third_interview_results=third_interview_results,
            offer_statuses=offer_statuses,
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
        raise HTTPException(status_code=500, detail=f"查询候选人失败: {str(e)}")


@router.get("/export")
async def export_candidates(
    jd_id: Optional[int] = None,
    stage: Optional[str] = None,
    candidate_ids: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    导出候选人列表为Excel

    支持按筛选条件导出或按选中的候选人ID导出
    candidate_ids: 逗号分隔的候选人ID，如 "1,2,3"
    """
    from fastapi.responses import Response

    try:
        # 解析候选人ID列表
        id_list = None
        if candidate_ids:
            id_list = [int(x.strip()) for x in candidate_ids.split(",") if x.strip()]

        candidate_service = CandidateService(db)
        excel_data = candidate_service.export_candidates_to_excel(
            user_id=current_user.id,
            jd_id=jd_id,
            stage=stage,
            candidate_ids=id_list
        )

        # 生成文件名
        from datetime import datetime
        from urllib.parse import quote
        filename = f"候选人列表_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        encoded_filename = quote(filename)

        return Response(
            content=excel_data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出候选人列表失败: {str(e)}")


@router.get("/{candidate_id}")
async def get_candidate_detail(
    candidate_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    获取候选人详情

    隐私信息只有HR和CEO可以查看
    """
    try:
        candidate_service = CandidateService(db)
        candidate = candidate_service.get_candidate_by_id(
            candidate_id=candidate_id,
            user_id=current_user.id
        )

        if not candidate:
            raise HTTPException(status_code=404, detail="候选人不存在")

        # 获取JD信息（职位和部门）
        jd = db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()

        # 格式化返回数据
        result = {
            "id": candidate.id,
            "name": candidate.name,
            "gender": candidate.gender,
            "age": candidate.age,
            "work_status": candidate.work_status,
            "work_years": candidate.work_years,
            "expected_salary": candidate.expected_salary,
            "highest_education": candidate.highest_education,
            "school": candidate.school,
            "summary": candidate.summary,
            "hard_requirements_assessment": candidate.hard_requirements_assessment,
            "hard_requirements_passed": candidate.hard_requirements_passed,
            "ai_score_detail": candidate.ai_score_detail,
            "ai_score_main": candidate.ai_score_main,
            "ai_score_bonus": candidate.ai_score_bonus,
            "ai_score_total": candidate.ai_score_total,
            "current_stage": candidate.current_stage,
            "current_stage_result": candidate.current_stage_result,
            "is_parsed": candidate.is_parsed,
            "parse_error": candidate.parse_error,
            "jd_id": candidate.jd_id,
            "job_title": jd.job_title if jd else None,
            "department": (jd.department_ref.name if jd.department_ref else jd.department) if jd else None,
            "resume_file_path": candidate.resume_file_path,
            "created_at": candidate.created_at.isoformat() if candidate.created_at else None
        }

        # 隐私信息只有HR和CEO可以查看
        if current_user.role in [UserRole.HR.value, UserRole.CEO.value]:
            result["privacy_info"] = candidate.privacy_info
        else:
            result["privacy_info"] = None  # 面试官不能查看

        return {
            "code": 200,
            "message": "查询成功",
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取候选人详情失败: {str(e)}")


@router.delete("/{candidate_id}")
async def delete_candidate(
    candidate_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    删除候选人

    只有HR可以操作
    """
    try:
        candidate_service = CandidateService(db)
        candidate_service.delete_candidate(
            candidate_id=candidate_id,
            user_id=current_user.id
        )

        return {
            "code": 200,
            "message": "删除成功",
            "data": None
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除候选人失败: {str(e)}")


@router.put("/{candidate_id}")
async def update_candidate(
    candidate_id: int,
    request: CandidateUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    更新候选人基本信息

    只有HR可以编辑
    隐私信息只有HR可以编辑，HR和CEO可以查看
    """
    try:
        candidate_service = CandidateService(db)

        # 过滤掉None值
        update_data = {k: v for k, v in request.dict().items() if v is not None}

        candidate = candidate_service.update_candidate_basic_info(
            candidate_id=candidate_id,
            user_id=current_user.id,
            update_data=update_data
        )

        return {
            "code": 200,
            "message": "更新成功",
            "data": {
                "id": candidate.id,
                "name": candidate.name,
                "gender": candidate.gender,
                "age": candidate.age,
                "work_status": candidate.work_status,
                "work_years": candidate.work_years,
                "expected_salary": candidate.expected_salary,
                "highest_education": candidate.highest_education,
                "school": candidate.school,
                "privacy_info": candidate.privacy_info
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新候选人失败: {str(e)}")


@router.put("/{candidate_id}/resume")
async def update_candidate_resume(
    candidate_id: int,
    resume_file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    更新候选人简历文件

    只更新简历文件，不重新解析
    """
    # 权限检查：只有HR可以更新简历
    if current_user.role != UserRole.HR.value:
        raise HTTPException(status_code=403, detail="只有HR可以更新简历")

    try:
        # 查找候选人
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候选人不存在")

        # 保存新简历文件
        file_path = _build_resume_file_path(str(candidate_id), resume_file.filename)

        # 保存文件
        with open(file_path, "wb") as f:
            content = await resume_file.read()
            f.write(content)

        # 删除旧文件（如果存在）
        old_file_path = candidate.resume_file_path
        if old_file_path and os.path.exists(old_file_path):
            try:
                os.remove(old_file_path)
            except:
                pass  # 忽略删除旧文件的错误

        # 更新数据库记录
        candidate.resume_file_path = file_path
        db.commit()

        return {
            "code": 200,
            "message": "简历更新成功",
            "data": {
                "resume_file_path": file_path
            }
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新简历失败: {str(e)}")
