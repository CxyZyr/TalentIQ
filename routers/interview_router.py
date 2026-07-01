"""
面试管理API路由
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import json

from services.interview_service import InterviewService
from routers.auth_router import get_current_user
from utils.auth import CurrentUser
from db.database import get_db
from db.models import UserRole
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/interview", tags=["面试管理"])

# 依赖注入
def get_db_context():
    db = get_db()
    try:
        yield db
    finally:
        db.close()


# ==================== 请求/响应模型 ====================

class GenerateQuestionsRequest(BaseModel):
    """生成面试问题请求"""
    candidate_id: int = Field(..., description="候选人ID")
    stage: str = Field(..., description="面试阶段（一面/二面/三面）")


class ModifyQuestionsRequest(BaseModel):
    """修改面试问题请求"""
    focus_points: Optional[str] = Field(None, description="重点关注内容（可选）")
    message: str = Field(..., description="用户的修改需求")


class UploadRecordingChunkRequest(BaseModel):
    """上传录音分片请求"""
    candidate_id: int
    stage: str
    chunk_index: int
    total_chunks: int


class ChatRequest(BaseModel):
    """智能对话请求"""
    candidate_id: int = Field(..., description="候选人ID")
    message: str = Field(..., description="用户消息")
    conversation_history: List[Dict[str, str]] = Field(default=[], description="对话历史")


class FinishRecordingRequest(BaseModel):
    """完成录音请求"""
    candidate_id: int = Field(..., description="候选人ID")
    stage: str = Field(..., description="面试阶段（一面/二面/三面）")


# ==================== API端点 ====================

@router.post("/questions/generate")
async def generate_interview_questions(
    request: GenerateQuestionsRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    AI生成面试问题

    生成8-12道面试问题，包含问题原因和优先级
    如果是二面/三面，会包含上一轮的面试问答作为上下文
    """
    try:
        interview_service = InterviewService(db)
        result = await interview_service.async_generate_interview_questions(
            candidate_id=request.candidate_id,
            stage=request.stage,
            user_id=current_user.id
        )

        return {
            "code": 200,
            "message": "面试问题生成成功",
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成面试问题失败: {str(e)}")


@router.get("/questions/{candidate_id}/{stage}")
async def get_interview_questions(
    candidate_id: int,
    stage: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    获取候选人的面试问题

    返回指定阶段的面试问题列表
    """
    try:
        from db.models import InterviewQuestion, Candidate, UserRole

        # 权限检查
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候选人不存在")

        # 面试官只能查看自己负责的候选人
        if current_user.role == UserRole.INTERVIEWER.value:
            if candidate.current_stage_owner != current_user.id:
                raise ValueError("无权限查看此候选人的面试问题")

        # 查询面试问题
        interview_question = db.query(InterviewQuestion).filter(
            InterviewQuestion.candidate_id == candidate_id,
            InterviewQuestion.stage == stage
        ).order_by(InterviewQuestion.created_at.desc()).first()

        if not interview_question:
            raise HTTPException(status_code=404, detail="未找到面试问题")

        return {
            "code": 200,
            "message": "查询成功",
            "data": {
                "id": interview_question.id,
                "candidate_id": interview_question.candidate_id,
                "stage": interview_question.stage,
                "questions": interview_question.questions,
                "created_at": interview_question.created_at.isoformat() if interview_question.created_at else None,
                "updated_at": interview_question.updated_at.isoformat() if interview_question.updated_at else None
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取面试问题失败: {str(e)}")


@router.put("/questions/{question_id}/modify")
async def modify_interview_questions(
    question_id: int,
    request: ModifyQuestionsRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    修改面试问题

    根据用户的修改需求调整面试问题
    上下文包括：当前面试问题 + JD信息 + 完整简历信息 + 考察重点（可选）
    """
    try:
        interview_service = InterviewService(db)
        result = await interview_service.async_modify_interview_questions(
            question_id=question_id,
            focus_points=request.focus_points,
            user_message=request.message,
            user_id=current_user.id
        )

        return {
            "code": 200,
            "message": "面试问题修改成功",
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"修改面试问题失败: {str(e)}")


@router.post("/recording/upload-chunk")
async def upload_recording_chunk(
    candidate_id: int = Form(...),
    stage: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    chunk_file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    上传面试录音分片

    支持大文件分片上传，所有分片上传完成后自动触发ASR转录和AI分析
    """
    try:
        # 读取分片数据
        chunk_data = await chunk_file.read()

        interview_service = InterviewService(db)
        result = interview_service.upload_recording_chunk(
            candidate_id=candidate_id,
            stage=stage,
            chunk_index=chunk_index,
            chunk_data=chunk_data,
            total_chunks=total_chunks,
            interviewer_id=current_user.id
        )

        return {
            "code": 200,
            "message": result["message"],
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传录音分片失败: {str(e)}")


@router.post("/recording/finish")
async def finish_recording(
    request: FinishRecordingRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    完成录音

    合并所有分片为完整音频文件，创建录音记录，异步触发ASR转录和AI分析评价
    """
    try:
        interview_service = InterviewService(db)
        result = await interview_service.async_finish_recording(
            candidate_id=request.candidate_id,
            stage=request.stage,
            interviewer_id=current_user.id
        )

        return {
            "code": 200,
            "message": "录音完成，正在处理",
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"完成录音失败: {str(e)}")


@router.get("/recording/status/{recording_id}")
async def get_recording_status(
    recording_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    获取录音处理状态

    返回录音的转录和评价状态
    """
    try:
        from db.models import InterviewRecording, InterviewEvaluation

        recording = db.query(InterviewRecording).filter(
            InterviewRecording.id == recording_id
        ).first()

        if not recording:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        # 检查是否有评价结果
        evaluation = db.query(InterviewEvaluation).filter(
            InterviewEvaluation.candidate_id == recording.candidate_id,
            InterviewEvaluation.stage == recording.stage
        ).first()

        status_map = {
            "pending": "waiting",      # 等待处理
            "transcribing": "transcribing",  # 正在转录
            "transcribed": "transcribed",    # 转录完成
            "evaluating": "evaluating",      # 正在生成评价
            "completed": "completed",        # 全部完成
            "failed": "failed"               # 失败
        }

        return {
            "code": 200,
            "data": {
                "recording_id": recording.id,
                "candidate_id": recording.candidate_id,
                "stage": recording.stage,
                "status": status_map.get(recording.transcript_status, "waiting"),
                "transcript_status": recording.transcript_status,
                "has_transcript": bool(recording.transcript_text),
                "has_evaluation": bool(evaluation),
                "evaluation_id": evaluation.id if evaluation else None
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取录音状态失败: {str(e)}")


@router.get("/recording/{recording_id}")
async def get_recording_detail(
    recording_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    获取面试录音详情

    包括转录文本、提取的问答、面试评价等信息
    """
    try:
        from db.models import InterviewRecording, Candidate, UserRole

        # 查询录音记录
        recording = db.query(InterviewRecording).filter(
            InterviewRecording.id == recording_id
        ).first()

        if not recording:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        # 权限检查
        candidate = db.query(Candidate).filter(Candidate.id == recording.candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候选人不存在")

        # 面试官只能查看自己负责的候选人
        if current_user.role == UserRole.INTERVIEWER.value:
            if candidate.current_stage_owner != current_user.id:
                raise ValueError("无权限查看此录音")

        return {
            "code": 200,
            "message": "查询成功",
            "data": {
                "id": recording.id,
                "candidate_id": recording.candidate_id,
                "stage": recording.stage,
                "recording_file_path": recording.recording_file_path,
                "duration": recording.duration,
                "transcript_text": recording.transcript_text,
                "transcript_status": recording.transcript_status,
                "extracted_qa": recording.extracted_qa,
                "interview_evaluation": recording.interview_evaluation,
                "interview_score_main": recording.interview_score_main,
                "interview_score_bonus": recording.interview_score_bonus,
                "interview_score_total": recording.interview_score_total,
                "comprehensive_evaluation": recording.comprehensive_evaluation,
                "strengths": recording.strengths,
                "weaknesses": recording.weaknesses,
                "interviewer_id": recording.interviewer_id,
                "created_at": recording.created_at.isoformat() if recording.created_at else None,
                "updated_at": recording.updated_at.isoformat() if recording.updated_at else None
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取录音详情失败: {str(e)}")


@router.get("/recording/candidate/{candidate_id}")
async def get_candidate_recordings(
    candidate_id: int,
    stage: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    获取候选人的所有面试录音

    可选择按阶段筛选
    """
    try:
        from db.models import InterviewRecording, Candidate, UserRole

        # 权限检查
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候选人不存在")

        # 面试官只能查看自己负责的候选人
        if current_user.role == UserRole.INTERVIEWER.value:
            if candidate.current_stage_owner != current_user.id:
                raise ValueError("无权限查看此候选人的录音")

        # 查询录音记录
        query = db.query(InterviewRecording).filter(
            InterviewRecording.candidate_id == candidate_id
        )

        if stage:
            query = query.filter(InterviewRecording.stage == stage)

        recordings = query.order_by(InterviewRecording.created_at.desc()).all()

        return {
            "code": 200,
            "message": "查询成功",
            "data": [
                {
                    "id": r.id,
                    "stage": r.stage,
                    "transcript_status": r.transcript_status,
                    "interview_score_total": r.interview_score_total,
                    "created_at": r.created_at.isoformat() if r.created_at else None
                }
                for r in recordings
            ]
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取录音列表失败: {str(e)}")


@router.post("/chat")
async def chat_about_interview(
    request: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    面试结果智能对话

    支持多轮对话，自动管理上下文
    当上下文超过10万token时会自动压缩
    """
    try:
        from db.models import Candidate, UserRole, InterviewRecording

        # 权限检查
        candidate = db.query(Candidate).filter(Candidate.id == request.candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候选人不存在")

        # 面试官只能查看自己负责的候选人
        if current_user.role == UserRole.INTERVIEWER.value:
            if candidate.current_stage_owner != current_user.id:
                raise ValueError("无权限与此候选人的面试结果对话")

        # 检查是否有已完成的面试录音（即AI评价已生成）
        completed_recording = db.query(InterviewRecording).filter(
            InterviewRecording.candidate_id == request.candidate_id,
            InterviewRecording.transcript_status == "completed"
        ).first()
        if not completed_recording:
            raise HTTPException(status_code=400, detail="请先完成面试录音和AI评价后，才能开始对话")

        interview_service = InterviewService(db)
        result = await interview_service.async_chat_about_interview(
            candidate_id=request.candidate_id,
            user_message=request.message,
            conversation_history=request.conversation_history
        )

        return {
            "code": 200,
            "message": "对话成功",
            "data": result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"对话失败: {str(e)}")


@router.post("/chat/stream")
async def chat_about_interview_stream(
    request: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    面试结果智能对话（流式输出）

    支持多轮对话，自动管理上下文
    返回SSE流式响应，实现打字机效果
    """
    from db.models import Candidate, UserRole, InterviewRecording

    # 权限检查
    candidate = db.query(Candidate).filter(Candidate.id == request.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="候选人不存在")

    # 面试官只能查看自己负责的候选人
    if current_user.role == UserRole.INTERVIEWER.value:
        if candidate.current_stage_owner != current_user.id:
            raise HTTPException(status_code=403, detail="无权限与此候选人的面试结果对话")

    # 检查是否有已完成的面试录音（即AI评价已生成）
    completed_recording = db.query(InterviewRecording).filter(
        InterviewRecording.candidate_id == request.candidate_id,
        InterviewRecording.transcript_status == "completed"
    ).first()
    if not completed_recording:
        raise HTTPException(status_code=400, detail="请先完成面试录音和AI评价后，才能开始对话")

    async def generate():
        try:
            interview_service = InterviewService(db)
            async for chunk in interview_service.async_chat_about_interview_stream(
                candidate_id=request.candidate_id,
                user_message=request.message,
                conversation_history=request.conversation_history
            ):
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


class ToggleAskedRequest(BaseModel):
    """切换问题提问状态请求"""
    question_index: int = Field(..., description="问题索引")
    asked: bool = Field(..., description="是否已提问")


@router.put("/questions/{question_id}/toggle-asked")
async def toggle_question_asked(
    question_id: int,
    request: ToggleAskedRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    切换面试问题的已提问/未提问状态

    更新指定问题的asked字段并持久化到数据库
    """
    try:
        from db.models import InterviewQuestion

        question_set = db.query(InterviewQuestion).filter(
            InterviewQuestion.id == question_id
        ).first()

        if not question_set:
            raise HTTPException(status_code=404, detail="面试问题不存在")

        questions = question_set.questions
        if not isinstance(questions, list):
            raise HTTPException(status_code=400, detail="问题数据格式异常")

        if request.question_index < 0 or request.question_index >= len(questions):
            raise HTTPException(status_code=400, detail="问题索引超出范围")

        # 更新指定问题的asked字段
        questions[request.question_index]["asked"] = request.asked

        # SQLAlchemy JSON字段需要显式标记为已修改
        from sqlalchemy.orm.attributes import flag_modified
        question_set.questions = questions
        flag_modified(question_set, "questions")
        db.commit()

        return {
            "code": 200,
            "message": "更新成功",
            "data": {"question_index": request.question_index, "asked": request.asked}
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新提问状态失败: {str(e)}")


class ReEvaluateRequest(BaseModel):
    """重新评价请求"""
    recording_id: int = Field(..., description="录音ID")


@router.post("/recording/re-evaluate")
async def re_evaluate_recording(
    request: ReEvaluateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_context)
):
    """
    重新生成面试AI评价

    对已完成转录的录音重新进行AI评分分析
    """
    try:
        from db.models import InterviewRecording, Candidate, UserRole

        # 查询录音记录
        recording = db.query(InterviewRecording).filter(
            InterviewRecording.id == request.recording_id
        ).first()

        if not recording:
            raise HTTPException(status_code=404, detail="录音记录不存在")

        if not recording.transcript_text:
            raise HTTPException(status_code=400, detail="录音尚未完成转录，无法重新评价")

        # 权限检查
        candidate = db.query(Candidate).filter(Candidate.id == recording.candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候选人不存在")

        if current_user.role == UserRole.INTERVIEWER.value:
            if candidate.current_stage_owner != current_user.id:
                raise HTTPException(status_code=403, detail="无权限操作此录音")

        interview_service = InterviewService(db)
        result = interview_service.re_evaluate_recording(recording.id)

        return {
            "code": 200,
            "message": "重新评价成功",
            "data": result
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重新评价失败: {str(e)}")
