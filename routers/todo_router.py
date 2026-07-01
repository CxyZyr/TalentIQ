"""
待办管理路由接口
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from db.database import get_db_context
from services.todo_service import TodoService
from utils.auth import get_current_user, CurrentUser


router = APIRouter(prefix="/api/todo", tags=["待办管理"])


class TransferTodoRequest(BaseModel):
    """待办转交请求"""
    candidate_id: int = Field(..., description="候选人ID")
    new_owner_id: int = Field(..., description="新负责人ID")
    target_stage: Optional[str] = Field(None, description="转交环节（可选，不传则默认当前环节）")


@router.get("/my")
async def get_my_todos(
    stage_filter: Optional[str] = Query(None, description="阶段过滤（可选）"),
    status_filter: Optional[str] = Query(None, description="状态过滤（可选，默认只返回待处理）"),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    查询我的待办列表

    按流程分类返回待办：
    - 简历筛选
    - 面试（一面/二面/三面）
    - 谈薪&背调
    """
    try:
        with get_db_context() as db:
            todos = TodoService.get_my_todos(
                db=db,
                user_id=current_user.id,
                stage_filter=stage_filter,
                status_filter=status_filter
            )

            return {
                "code": 200,
                "message": "查询成功",
                "data": todos
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{todo_id}/process")
async def mark_todo_processed(
    todo_id: int,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    标记待办为已处理

    注意：通常不需要手动调用此接口，流程流转时会自动标记待办为已处理
    """
    try:
        with get_db_context() as db:
            todo = TodoService.mark_todo_processed(db=db, todo_id=todo_id)

            return {
                "code": 200,
                "message": "待办已标记为已处理",
                "data": {
                    "id": todo.id,
                    "status": todo.status,
                    "processed_at": todo.processed_at.isoformat() if todo.processed_at else None
                }
            }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transfer")
async def transfer_todo(
    request: TransferTodoRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    转交待办（仅HR可操作）

    将候选人当前待处理的待办转交给新负责人。
    """
    # 权限校验：仅HR
    if current_user.role != "HR":
        raise HTTPException(status_code=403, detail="仅HR可以执行待办转交操作")

    try:
        with get_db_context() as db:
            result = TodoService.transfer_todo(
                db=db,
                candidate_id=request.candidate_id,
                new_owner_id=request.new_owner_id,
                operator_id=current_user.id,
                target_stage=request.target_stage
            )

            return {
                "code": 200,
                "message": "待办转交成功",
                "data": result
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
