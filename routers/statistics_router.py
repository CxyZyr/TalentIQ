"""
数据统计路由接口
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from db.database import get_db_context
from services.statistics_service import StatisticsService
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/statistics", tags=["数据统计"])


@router.get("/recruitment-funnel")
async def get_recruitment_funnel(
    start_date: Optional[str] = Query(None, description="开始日期（格式：YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（格式：YYYY-MM-DD）"),
    jd_id: Optional[int] = Query(None, description="职位ID"),
    department: Optional[str] = Query(None, description="部门"),
    jd_ids: Optional[str] = Query(None, description="多个职位ID（逗号分隔）"),
    departments: Optional[str] = Query(None, description="多个部门（逗号分隔）"),
    uploader_ids: Optional[str] = Query(None, description="多个负责HR（简历上传人）ID（逗号分隔）"),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取招聘漏斗数据

    返回数据包括：
    - total_resumes: 总简历数
    - resume_passed: 简历筛选通过数
    - first_interview_passed: 一面通过数
    - second_interview_passed: 二面通过数
    - offer_issued: OFFER发放数
    - onboarded: 已入职数

    权限规则：
    - HR/CEO：可以看到所有数据
    - 面试官：只能看到与自己相关的候选人数据
    """
    try:
        # 解析日期
        start_datetime = None
        end_datetime = None
        if start_date:
            try:
                start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")

        if end_date:
            try:
                end_datetime = datetime.strptime(end_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")

        with get_db_context() as db:
            data = StatisticsService.get_recruitment_funnel(
                db=db,
                user_id=current_user.id,
                start_date=start_datetime,
                end_date=end_datetime,
                jd_id=jd_id,
                department=department,
                jd_ids=jd_ids,
                departments=departments,
                uploader_ids=uploader_ids
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": data
            }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversion-rates")
async def get_conversion_rates(
    start_date: Optional[str] = Query(None, description="开始日期（格式：YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（格式：YYYY-MM-DD）"),
    jd_id: Optional[int] = Query(None, description="职位ID"),
    department: Optional[str] = Query(None, description="部门"),
    jd_ids: Optional[str] = Query(None, description="多个职位ID（逗号分隔）"),
    departments: Optional[str] = Query(None, description="多个部门（逗号分隔）"),
    uploader_ids: Optional[str] = Query(None, description="多个负责HR（简历上传人）ID（逗号分隔）"),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取转化率分析数据

    返回数据包括：
    - resume_pass_rate: 简历通过率（%）
    - first_interview_pass_rate: 一面通过率（%）
    - second_interview_pass_rate: 二面通过率（%）
    - offer_accept_rate: OFFER接受率（%）
    - onboard_rate: 入职转化率（%）
    - base_data: 基础数据（用于前端展示分母）

    权限规则：
    - HR/CEO：可以看到所有数据
    - 面试官：只能看到与自己相关的候选人数据
    """
    try:
        # 解析日期
        start_datetime = None
        end_datetime = None
        if start_date:
            try:
                start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")

        if end_date:
            try:
                end_datetime = datetime.strptime(end_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")

        with get_db_context() as db:
            data = StatisticsService.get_conversion_rates(
                db=db,
                user_id=current_user.id,
                start_date=start_datetime,
                end_date=end_datetime,
                jd_id=jd_id,
                department=department,
                jd_ids=jd_ids,
                departments=departments,
                uploader_ids=uploader_ids
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": data
            }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-todo")
async def get_my_todo_statistics(
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取我的待办统计

    返回数据包括：
    - resume_screening: 简历待筛选数量
    - interview: 待面试数量
    - salary_negotiation: 谈薪&背调数量

    只统计当前用户的待处理待办
    """
    try:
        with get_db_context() as db:
            data = StatisticsService.get_my_todo_statistics(
                db=db,
                user_id=current_user.id
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": data
            }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/job-progress")
async def get_job_recruitment_progress(
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取职位招聘进展

    返回数据包括：
    - jobs: 职位列表
      - jd_id: 职位ID
      - job_title: 职位名称
      - department: 部门
      - headcount: 要求人数
      - onboarded_count: 已入职数量
      - progress_rate: 完成率（%）

    权限规则：
    - HR/CEO：可以看到所有未关闭的职位
    - 面试官：只能看到与自己相关的职位
    """
    try:
        with get_db_context() as db:
            data = StatisticsService.get_job_recruitment_progress(
                db=db,
                user_id=current_user.id
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": data
            }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidate-profile")
async def get_candidate_profile(
    start_date: Optional[str] = Query(None, description="开始日期（格式：YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（格式：YYYY-MM-DD）"),
    jd_id: Optional[int] = Query(None, description="职位ID"),
    department: Optional[str] = Query(None, description="部门"),
    jd_ids: Optional[str] = Query(None, description="多个职位ID（逗号分隔）"),
    departments: Optional[str] = Query(None, description="多个部门（逗号分隔）"),
    uploader_ids: Optional[str] = Query(None, description="多个负责HR（简历上传人）ID（逗号分隔）"),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取候选人画像统计

    返回数据包括：
    - total: 参与统计的候选人总数
    - ai_score: AI得分分布（按得分率分桶）
    - education: 学历分布
    - top_school: 名校占比（985/211/双一流）
    - demographics: 人口结构（工作状态/工作年限/性别/年龄）

    权限规则：
    - HR/CEO：可以看到所有数据
    - 面试官：只能看到与自己相关的候选人数据
    """
    try:
        start_datetime = None
        end_datetime = None
        if start_date:
            try:
                start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
        if end_date:
            try:
                end_datetime = datetime.strptime(end_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")

        with get_db_context() as db:
            data = StatisticsService.get_candidate_profile(
                db=db,
                user_id=current_user.id,
                start_date=start_datetime,
                end_date=end_datetime,
                jd_id=jd_id,
                department=department,
                jd_ids=jd_ids,
                departments=departments,
                uploader_ids=uploader_ids
            )
            return {
                "code": 200,
                "message": "查询成功",
                "data": data
            }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/resume-uploaders")
async def get_resume_uploaders(
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    获取上传过简历的HR列表（用于"负责HR"筛选下拉）

    返回 data.uploaders: [{id, name, username}]
    权限：HR/CEO 返回全部上传人；面试官仅返回与其相关候选人的上传人
    """
    try:
        with get_db_context() as db:
            data = StatisticsService.get_resume_uploaders(
                db=db,
                user_id=current_user.id
            )
            return {
                "code": 200,
                "message": "查询成功",
                "data": data
            }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
