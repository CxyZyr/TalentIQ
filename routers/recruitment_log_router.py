"""
招聘日志接口 - 查询所有流程操作记录
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import Optional, List, Dict, Any
from datetime import datetime

from db.database import get_db_context
from db.models import (
    Candidate, User, CandidateStageHistory, UserRole
)
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/recruitment-log", tags=["招聘日志"])


@router.get("/list")
async def get_recruitment_logs(
    start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    candidate_id: Optional[int] = Query(None, description="候选人ID"),
    stage: Optional[str] = Query(None, description="阶段筛选"),
    keyword: Optional[str] = Query(None, description="关键词搜索（候选人姓名/序号/操作人）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=1000, description="每页数量"),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    查询招聘日志
    
    返回所有流程操作记录，包括：
    - 候选人添加记录
    - 流程流转记录（简历筛选、面试、谈薪背调等）
    
    权限：
    - CEO/HR：可以查看所有日志
    - 面试官：只能查看与自己相关的候选人日志
    """
    try:
        with get_db_context() as db:
            # 构建日志列表
            logs = []
            
            # 1. 查询候选人添加记录
            candidate_query = db.query(Candidate, User).join(
                User, Candidate.created_by == User.id
            )
            
            # 根据用户角色过滤
            if current_user.role == UserRole.INTERVIEWER.value:
                # 面试官只能看到与自己相关的候选人
                related_candidate_ids = db.query(CandidateStageHistory.candidate_id).filter(
                    or_(
                        CandidateStageHistory.stage_owner == current_user.id,
                        CandidateStageHistory.next_stage_owner == current_user.id
                    )
                ).distinct().all()
                candidate_ids = [cid[0] for cid in related_candidate_ids]
                
                if candidate_ids:
                    candidate_query = candidate_query.filter(Candidate.id.in_(candidate_ids))
                else:
                    candidate_query = candidate_query.filter(Candidate.id == -1)
            
            # 应用筛选条件
            if candidate_id:
                candidate_query = candidate_query.filter(Candidate.id == candidate_id)
            
            if start_date:
                start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
                candidate_query = candidate_query.filter(Candidate.created_at >= start_datetime)
            
            if end_date:
                end_datetime = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")
                candidate_query = candidate_query.filter(Candidate.created_at <= end_datetime)
            
            candidates = candidate_query.all()
            
            # 添加候选人创建日志
            for candidate, creator in candidates:
                logs.append({
                    "log_type": "candidate_added",
                    "candidate_id": candidate.id,
                    "candidate_number": candidate.candidate_number,
                    "candidate_name": candidate.name,
                    "event": f"{candidate.candidate_number}-{candidate.name}：添加候选人",
                    "operator": creator.real_name,
                    "operator_id": creator.id,
                    "stage": None,
                    "result": None,
                    "comments": None,
                    "operation_time": candidate.created_at.isoformat() if candidate.created_at else None
                })
            
            # 2. 查询流程历史记录
            history_query = db.query(CandidateStageHistory, Candidate, User).join(
                Candidate, CandidateStageHistory.candidate_id == Candidate.id
            ).join(
                User, CandidateStageHistory.stage_owner == User.id
            )
            
            # 根据用户角色过滤
            if current_user.role == UserRole.INTERVIEWER.value:
                if candidate_ids:
                    history_query = history_query.filter(Candidate.id.in_(candidate_ids))
                else:
                    history_query = history_query.filter(Candidate.id == -1)
            
            # 应用筛选条件
            if candidate_id:
                history_query = history_query.filter(Candidate.id == candidate_id)
            
            if stage:
                history_query = history_query.filter(CandidateStageHistory.stage == stage)
            
            if start_date:
                start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
                history_query = history_query.filter(CandidateStageHistory.created_at >= start_datetime)
            
            if end_date:
                end_datetime = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")
                history_query = history_query.filter(CandidateStageHistory.created_at <= end_datetime)
            
            histories = history_query.all()
            
            # 添加流程历史日志
            for history, candidate, operator in histories:
                # 构建事件描述
                event_desc = _build_event_description(
                    candidate.candidate_number,
                    candidate.name,
                    history.stage,
                    history.stage_result,
                    history.termination_reason,
                    history.comments,
                    history.is_abnormal_terminated
                )
                
                logs.append({
                    "log_type": "stage_flow",
                    "candidate_id": candidate.id,
                    "candidate_number": candidate.candidate_number,
                    "candidate_name": candidate.name,
                    "event": event_desc,
                    "operator": operator.real_name,
                    "operator_id": operator.id,
                    "stage": history.stage,
                    "result": history.stage_result,
                    "comments": history.comments or history.rejection_reason or history.termination_reason,
                    "operation_time": history.created_at.isoformat() if history.created_at else None
                })
            
            # 按时间倒序排序
            logs.sort(key=lambda x: x["operation_time"] or "", reverse=True)

            # 关键词筛选
            if keyword:
                keyword_lower = keyword.lower()
                logs = [
                    log for log in logs
                    if keyword_lower in (log.get("candidate_name") or "").lower()
                    or keyword_lower in (log.get("candidate_number") or "").lower()
                    or keyword_lower in (log.get("operator") or "").lower()
                    or keyword_lower in (log.get("event") or "").lower()
                ]

            # 分页
            total = len(logs)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            paginated_logs = logs[start_idx:end_idx]
            
            return {
                "code": 200,
                "message": "查询成功",
                "data": {
                    "total": total,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": (total + page_size - 1) // page_size,
                    "logs": paginated_logs
                }
            }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询招聘日志失败: {str(e)}")


def _build_event_description(
    candidate_number: str,
    candidate_name: str,
    stage: str,
    stage_result: str,
    termination_reason: Optional[str],
    comments: Optional[str] = None,
    is_abnormal_terminated: bool = False,
) -> str:
    """
    构建事件描述
    
    Args:
        candidate_number: 候选人序号
        candidate_name: 候选人姓名
        stage: 阶段
        stage_result: 阶段结果
        termination_reason: 终止原因
    
    Returns:
        事件描述字符串
    """
    prefix = f"{candidate_number}-{candidate_name}"
    
    # HR异常终止
    if is_abnormal_terminated:
        return f"{prefix}：HR介入终止流程"

    # 主动终止流程
    if stage == "流程终止" or (comments and comments.startswith("流程终止")) or termination_reason is not None:
        return f"{prefix}：终止流程"

    # 终止流程回退
    if comments and comments.startswith("终止流程回退"):
        return f"{prefix}：终止流程回退"

    # 待办转交
    if stage_result == "转交":
        return f"{prefix}：{stage}待办转交"
    
    # 简历筛选
    if stage == "简历筛选":
        if stage_result == "通过":
            return f"{prefix}：简历筛选通过"
        elif stage_result == "不通过":
            return f"{prefix}：简历筛选不通过"
        else:
            return f"{prefix}：简历筛选处理中"
    
    # 面试阶段
    if stage in ["一面", "二面", "三面"]:
        if stage_result == "通过":
            return f"{prefix}：{stage}通过"
        elif stage_result == "不通过":
            return f"{prefix}：{stage}不通过"
        elif stage_result == "待定":
            return f"{prefix}：{stage}待定"
        else:
            return f"{prefix}：{stage}处理中"
    
    # 谈薪&背调
    if stage == "谈薪&背调":
        if stage_result == "通过":
            return f"{prefix}：谈薪&背调完成"
        elif stage_result == "不通过":
            return f"{prefix}：谈薪&背调失败"
        else:
            return f"{prefix}：谈薪&背调处理中"
    
    # 默认
    return f"{prefix}：{stage}-{stage_result or '处理中'}"
