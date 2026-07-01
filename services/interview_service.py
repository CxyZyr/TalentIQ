"""
面试服务层 - 处理面试相关的业务逻辑
"""
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
import json
import tiktoken
import os
from pathlib import Path
import requests
from concurrent.futures import ThreadPoolExecutor
import asyncio
from datetime import datetime

from db.models import (
    Candidate, JobDescription, InterviewQuestion, InterviewRecording,
    User, InterviewEvaluationRule, get_china_time
)
from utils.llm_service import LLMService
from config.llm_config import AI_SCORE_CONFIG

# 获取项目根目录（绝对路径）
PROJECT_ROOT = Path(__file__).parent.parent.absolute()
UPLOADS_DIR = PROJECT_ROOT / "uploads" / "recordings"
MAX_RECORDING_SESSION_SECONDS = 3 * 60 * 60
RECORDING_SESSION_META_FILENAME = "session_meta.json"


class InterviewService:
    """面试服务类"""

    def __init__(self, db: Session):
        self.db = db
        self.llm_service = LLMService(AI_SCORE_CONFIG)

    @staticmethod
    def _validate_questions_result(result: Dict[str, Any]) -> None:
        if not isinstance(result, dict):
            raise ValueError("面试问题结果不是JSON对象")
        if "questions" not in result or not isinstance(result.get("questions"), list):
            raise ValueError("面试问题结果缺少questions数组")

    @staticmethod
    def _validate_qa_result(result: Dict[str, Any]) -> None:
        if not isinstance(result, dict):
            raise ValueError("问答提取结果不是JSON对象")
        if "qa_pairs" not in result or not isinstance(result.get("qa_pairs"), list):
            raise ValueError("问答提取结果缺少qa_pairs数组")

    @staticmethod
    def _validate_interview_score_result(result: Dict[str, Any]) -> None:
        if not isinstance(result, dict):
            raise ValueError("面试评分结果不是JSON对象")
        if "dimensions" not in result or not isinstance(result.get("dimensions"), list):
            raise ValueError("面试评分结果缺少dimensions数组")

    @staticmethod
    def _validate_comprehensive_result(result: Dict[str, Any]) -> None:
        if not isinstance(result, dict):
            raise ValueError("综合评价结果不是JSON对象")
        required_keys = ["comprehensive_evaluation", "strengths", "weaknesses"]
        missing_keys = [key for key in required_keys if key not in result]
        if missing_keys:
            raise ValueError(f"综合评价结果缺少字段: {', '.join(missing_keys)}")

    def _get_recording_temp_dir(self, candidate_id: int, stage: str) -> Path:
        return UPLOADS_DIR / "temp" / f"{candidate_id}_{stage}"

    def _get_recording_session_meta_path(self, temp_dir: Path) -> Path:
        return temp_dir / RECORDING_SESSION_META_FILENAME

    def _load_recording_session_meta(self, temp_dir: Path) -> Optional[Dict[str, Any]]:
        meta_path = self._get_recording_session_meta_path(temp_dir)
        if not meta_path.exists():
            return None

        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _infer_recording_session_started_at(self, temp_dir: Path) -> Optional[datetime]:
        chunk_files = list(temp_dir.glob("chunk_*.webm"))
        if not chunk_files:
            return None

        earliest_chunk = min(chunk_files, key=lambda filepath: filepath.stat().st_mtime)
        return datetime.fromtimestamp(earliest_chunk.stat().st_mtime)

    def _ensure_recording_session_meta(
        self,
        temp_dir: Path,
        candidate_id: int,
        stage: str,
        interviewer_id: int
    ) -> Dict[str, Any]:
        meta = self._load_recording_session_meta(temp_dir)
        if meta and meta.get("started_at"):
            return meta

        inferred_started_at = self._infer_recording_session_started_at(temp_dir)
        started_at = (inferred_started_at or get_china_time()).isoformat()
        meta = {
            "candidate_id": candidate_id,
            "stage": stage,
            "interviewer_id": interviewer_id,
            "started_at": started_at,
        }
        self._get_recording_session_meta_path(temp_dir).write_text(
            json.dumps(meta, ensure_ascii=False),
            encoding="utf-8"
        )
        return meta

    def _get_recording_session_elapsed_seconds(self, temp_dir: Path) -> Optional[float]:
        meta = self._load_recording_session_meta(temp_dir)
        started_at_str = meta.get("started_at") if meta else None

        if started_at_str:
            try:
                started_at = datetime.fromisoformat(started_at_str)
            except ValueError:
                started_at = self._infer_recording_session_started_at(temp_dir)
        else:
            started_at = self._infer_recording_session_started_at(temp_dir)

        if not started_at:
            return None

        return (get_china_time() - started_at).total_seconds()

    def _auto_finish_expired_recording_if_needed(
        self,
        candidate_id: int,
        stage: str,
        interviewer_id: int
    ) -> Optional[Dict[str, Any]]:
        temp_dir = self._get_recording_temp_dir(candidate_id, stage)
        if not temp_dir.exists():
            return None

        elapsed_seconds = self._get_recording_session_elapsed_seconds(temp_dir)
        if elapsed_seconds is None or elapsed_seconds <= MAX_RECORDING_SESSION_SECONDS:
            return None

        print(
            f"[录音] 录音会话超时，自动结束并处理: candidate_id={candidate_id}, "
            f"stage={stage}, elapsed={elapsed_seconds:.0f}s"
        )
        finish_result = self.finish_recording(candidate_id, stage, interviewer_id)
        finish_result["status"] = "recording_auto_finished"
        finish_result["auto_finished"] = True
        finish_result["rejected_chunk"] = True
        finish_result["message"] = "录音已超过3小时，系统已自动结束录音并开始处理"
        return finish_result

    def generate_interview_questions(
        self,
        candidate_id: int,
        stage: str,
        user_id: int
    ) -> Dict[str, Any]:
        """
        生成面试问题

        Args:
            candidate_id: 候选人ID
            stage: 面试阶段（一面/二面/三面）
            user_id: 用户ID

        Returns:
            生成的面试问题
        """
        # 获取候选人信息
        candidate = self.db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise ValueError("候选人不存在")

        # 获取JD信息
        jd = self.db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()
        if not jd:
            raise ValueError("JD不存在")

        # 准备上下文信息
        jd_content = f"""
岗位名称：{jd.job_title}
岗位职责：{jd.job_responsibilities}
硬性条件：{jd.hard_requirements}
其他要求：{jd.other_requirements}
"""

        resume_content = candidate.resume_text

        # 获取上一轮面试问答（如果有）
        previous_interview_qa = None
        if stage == "二面":
            previous_stage = "一面"
        elif stage == "三面":
            previous_stage = "二面"
        else:
            previous_stage = None

        if previous_stage:
            # 查找上一轮面试的录音记录
            previous_recording = self.db.query(InterviewRecording).filter(
                InterviewRecording.candidate_id == candidate_id,
                InterviewRecording.stage == previous_stage,
                InterviewRecording.transcript_status == "completed"
            ).first()

            if previous_recording and previous_recording.extracted_qa:
                previous_interview_qa = previous_recording.extracted_qa

        # 构建提示词
        prompt = self._build_question_generation_prompt(
            jd_content,
            resume_content,
            stage,
            previous_interview_qa
        )

        messages = [{"role": "user", "content": prompt}]
        result = self.llm_service.chat_json(messages, validator=self._validate_questions_result)
        if "parse_error" in result:
            return result

        questions = result.get("questions", [])

        # 检查是否已存在该候选人该阶段的面试问题
        existing_question = self.db.query(InterviewQuestion).filter(
            InterviewQuestion.candidate_id == candidate_id,
            InterviewQuestion.stage == stage
        ).first()

        if existing_question:
            # 如果已存在，直接更新
            existing_question.questions = questions
            existing_question.jd_content = jd_content
            existing_question.resume_content = resume_content
            existing_question.previous_interview_qa = previous_interview_qa
            self.db.commit()
            self.db.refresh(existing_question)
            interview_question = existing_question
        else:
            # 如果不存在，创建新记录
            interview_question = InterviewQuestion(
                candidate_id=candidate_id,
                stage=stage,
                questions=questions,
                jd_content=jd_content,
                resume_content=resume_content,
                previous_interview_qa=previous_interview_qa,
                created_by=user_id
            )
            self.db.add(interview_question)
            self.db.commit()
            self.db.refresh(interview_question)

        return {
            "id": interview_question.id,
            "candidate_id": candidate_id,
            "stage": stage,
            "questions": questions,
            "created_at": interview_question.created_at.isoformat()
        }

    async def async_generate_interview_questions(
        self,
        candidate_id: int,
        stage: str,
        user_id: int
    ) -> Dict[str, Any]:
        """
        生成面试问题（异步版本）

        Args:
            candidate_id: 候选人ID
            stage: 面试阶段（一面/二面/三面）
            user_id: 用户ID

        Returns:
            生成的面试问题
        """
        # 获取候选人信息
        candidate = self.db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise ValueError("候选人不存在")

        # 获取JD信息
        jd = self.db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()
        if not jd:
            raise ValueError("JD不存在")

        # 准备上下文信息
        jd_content = f"""
岗位名称：{jd.job_title}
岗位职责：{jd.job_responsibilities}
硬性条件：{jd.hard_requirements}
其他要求：{jd.other_requirements}
"""

        resume_content = candidate.resume_text

        # 获取上一轮面试问答（如果有）
        previous_interview_qa = None
        if stage == "二面":
            previous_stage = "一面"
        elif stage == "三面":
            previous_stage = "二面"
        else:
            previous_stage = None

        if previous_stage:
            # 查找上一轮面试的录音记录
            previous_recording = self.db.query(InterviewRecording).filter(
                InterviewRecording.candidate_id == candidate_id,
                InterviewRecording.stage == previous_stage,
                InterviewRecording.transcript_status == "completed"
            ).first()

            if previous_recording and previous_recording.extracted_qa:
                previous_interview_qa = previous_recording.extracted_qa

        # 构建提示词
        prompt = self._build_question_generation_prompt(
            jd_content,
            resume_content,
            stage,
            previous_interview_qa
        )

        messages = [{"role": "user", "content": prompt}]
        result = await self.llm_service.async_chat_json(messages, validator=self._validate_questions_result)
        if "parse_error" in result:
            return result

        questions = result.get("questions", [])

        # 检查是否已存在该候选人该阶段的面试问题
        existing_question = self.db.query(InterviewQuestion).filter(
            InterviewQuestion.candidate_id == candidate_id,
            InterviewQuestion.stage == stage
        ).first()

        if existing_question:
            # 如果已存在，直接更新
            existing_question.questions = questions
            existing_question.jd_content = jd_content
            existing_question.resume_content = resume_content
            existing_question.previous_interview_qa = previous_interview_qa
            self.db.commit()
            self.db.refresh(existing_question)
            interview_question = existing_question
        else:
            # 如果不存在，创建新记录
            interview_question = InterviewQuestion(
                candidate_id=candidate_id,
                stage=stage,
                questions=questions,
                jd_content=jd_content,
                resume_content=resume_content,
                previous_interview_qa=previous_interview_qa,
                created_by=user_id
            )
            self.db.add(interview_question)
            self.db.commit()
            self.db.refresh(interview_question)

        return {
            "id": interview_question.id,
            "candidate_id": candidate_id,
            "stage": stage,
            "questions": questions,
            "created_at": interview_question.created_at.isoformat()
        }

    def modify_interview_questions(
        self,
        question_id: int,
        focus_points: Optional[str],
        user_message: str,
        user_id: int
    ) -> Dict[str, Any]:
        """
        对话修改面试问题

        Args:
            question_id: 面试问题ID
            focus_points: 考察重点（可选）
            user_message: 用户的修改需求
            user_id: 用户ID

        Returns:
            修改后的面试问题
        """
        # 获取原有问题
        interview_question = self.db.query(InterviewQuestion).filter(
            InterviewQuestion.id == question_id
        ).first()

        if not interview_question:
            raise ValueError("面试问题不存在")

        # 构建提示词
        prompt = f"""你是一位专业的面试官助手，需要根据用户的修改需求调整面试问题。

当前面试问题：
{json.dumps(interview_question.questions, ensure_ascii=False, indent=2)}

JD信息：
{interview_question.jd_content}

简历信息：
{interview_question.resume_content}

"""
        if focus_points:
            prompt += f"考察重点：{focus_points}\n\n"

        prompt += f"""用户的修改需求：{user_message}

请根据修改需求调整面试问题，输出新的问题列表。保持JSON格式，每个问题包含：
- question: 问题内容
- reason: 选择该问题的原因
- priority: 优先级（高/中/低）

输出格式：
{{
    "questions": [
        {{
            "question": "问题内容",
            "reason": "选择原因",
            "priority": "高"
        }}
    ]
}}
"""

        messages = [{"role": "user", "content": prompt}]
        result = self.llm_service.chat_json(messages, validator=self._validate_questions_result)
        if "parse_error" in result:
            raise ValueError(f"AI返回格式错误，无法解析问题列表: {result['parse_error']}")

        new_questions = result.get("questions", [])

        # 更新问题到数据库
        interview_question.questions = new_questions
        self.db.commit()
        self.db.refresh(interview_question)

        return {
            "id": interview_question.id,
            "questions": new_questions,
            "updated_at": interview_question.updated_at.isoformat()
        }

    async def async_modify_interview_questions(
        self,
        question_id: int,
        focus_points: Optional[str],
        user_message: str,
        user_id: int
    ) -> Dict[str, Any]:
        """
        对话修改面试问题（异步版本）

        Args:
            question_id: 面试问题ID
            focus_points: 考察重点（可选）
            user_message: 用户的修改需求
            user_id: 用户ID

        Returns:
            修改后的面试问题
        """
        # 获取原有问题
        interview_question = self.db.query(InterviewQuestion).filter(
            InterviewQuestion.id == question_id
        ).first()

        if not interview_question:
            raise ValueError("面试问题不存在")

        # 构建提示词
        prompt = f"""你是一位专业的面试官助手，需要根据用户的修改需求调整面试问题。

当前面试问题：
{json.dumps(interview_question.questions, ensure_ascii=False, indent=2)}

JD信息：
{interview_question.jd_content}

简历信息：
{interview_question.resume_content}

"""
        if focus_points:
            prompt += f"考察重点：{focus_points}\n\n"

        prompt += f"""用户的修改需求：{user_message}

请根据修改需求调整面试问题，输出新的问题列表。保持JSON格式，每个问题包含：
- question: 问题内容
- reason: 选择该问题的原因
- priority: 优先级（高/中/低）

输出格式：
{{
    "questions": [
        {{
            "question": "问题内容",
            "reason": "选择原因",
            "priority": "高"
        }}
    ]
}}
"""

        messages = [{"role": "user", "content": prompt}]
        result = await self.llm_service.async_chat_json(messages, validator=self._validate_questions_result)
        if "parse_error" in result:
            raise ValueError(f"AI返回格式错误，无法解析问题列表: {result['parse_error']}")

        new_questions = result.get("questions", [])

        # 更新问题到数据库
        interview_question.questions = new_questions
        self.db.commit()
        self.db.refresh(interview_question)

        return {
            "id": interview_question.id,
            "questions": new_questions,
            "updated_at": interview_question.updated_at.isoformat()
        }

    def _build_question_generation_prompt(
        self,
        jd_content: str,
        resume_content: str,
        stage: str,
        previous_interview_qa: Optional[Dict] = None
    ) -> str:
        """构建生成面试问题的提示词"""

        prompt = f"""你是一位资深的面试官，需要根据JD和候选人简历生成针对性的面试问题。

面试阶段：{stage}

JD信息：
{jd_content}

候选人简历：
{resume_content}

"""

        if previous_interview_qa:
            prompt += f"""
上一轮面试问答：
{json.dumps(previous_interview_qa, ensure_ascii=False, indent=2)}

请结合上一轮面试的情况，深入考察候选人的能力。
"""

        prompt += """
请生成8-12个面试问题，要求：
1. 问题要有针对性，结合候选人的实际经历
2. 问题要有深度，能够考察候选人的真实能力
3. 问题要有梯度，从基础到深入
4. 每个问题需要说明选择该问题的原因
5. 为每个问题设置优先级（高/中/低）

输出格式（JSON）：
{
    "questions": [
        {
            "question": "具体的问题内容",
            "reason": "选择该问题的原因（例如：验证简历中提到的XX项目经验）",
            "priority": "高"
        }
    ]
}

请确保输出的是有效的JSON格式。
"""

        return prompt


    def upload_recording_chunk(
        self,
        candidate_id: int,
        stage: str,
        chunk_index: int,
        chunk_data: bytes,
        total_chunks: int,
        interviewer_id: int
    ) -> Dict[str, Any]:
        """
        上传录音切片

        Args:
            candidate_id: 候选人ID
            stage: 面试阶段
            chunk_index: 切片索引
            chunk_data: 切片数据
            total_chunks: 总切片数（-1表示流式上传，最终数量未知）
            interviewer_id: 面试官ID

        Returns:
            上传结果
        """
        auto_finish_result = self._auto_finish_expired_recording_if_needed(
            candidate_id=candidate_id,
            stage=stage,
            interviewer_id=interviewer_id
        )
        if auto_finish_result:
            return auto_finish_result

        # 使用绝对路径创建临时目录
        temp_dir = self._get_recording_temp_dir(candidate_id, stage)
        temp_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_recording_session_meta(temp_dir, candidate_id, stage, interviewer_id)

        # 保存切片（使用4位数字格式，与参考项目一致）
        chunk_path = temp_dir / f"chunk_{chunk_index:04d}.webm"
        with open(chunk_path, "wb") as f:
            f.write(chunk_data)

        print(f"[录音] 分片保存成功: {chunk_path}, 大小: {len(chunk_data)} 字节")

        # 统计已上传的分片数
        uploaded_chunks = len([f for f in temp_dir.iterdir() if f.name.startswith("chunk_")])

        # 注意：不在这里自动合并，由 finish_recording 接口负责合并
        return {
            "status": "chunk_uploaded",
            "message": f"分片 {chunk_index} 上传成功",
            "uploaded_chunks": uploaded_chunks,
            "total_chunks": total_chunks
        }

    def finish_recording(
        self,
        candidate_id: int,
        stage: str,
        interviewer_id: int
    ) -> Dict[str, Any]:
        """
        完成录音：合并所有分片，创建录音记录，异步触发ASR转录和AI分析

        Args:
            candidate_id: 候选人ID
            stage: 面试阶段
            interviewer_id: 面试官ID

        Returns:
            处理结果
        """
        import shutil

        # 使用绝对路径
        temp_dir = UPLOADS_DIR / "temp" / f"{candidate_id}_{stage}"

        print(f"[录音] 完成录音，检查临时目录: {temp_dir}")

        # 检查临时目录是否存在
        if not temp_dir.exists():
            print(f"[录音] 临时目录不存在: {temp_dir}")
            raise ValueError("未找到录音分片，请先上传录音")

        # 获取所有分片文件
        chunk_files = list(temp_dir.glob("chunk_*.webm"))
        if not chunk_files:
            print(f"[录音] 临时目录中没有分片文件")
            raise ValueError("未找到录音分片")

        print(f"[录音] 找到 {len(chunk_files)} 个分片文件")

        # 按索引排序（支持 chunk_0000.webm 和 chunk_0.webm 格式）
        def get_chunk_index(filepath):
            filename = filepath.name
            # 提取数字部分
            try:
                # chunk_0000.webm -> 0000 -> 0
                index_str = filename.replace('chunk_', '').replace('.webm', '')
                return int(index_str)
            except:
                return 0

        chunk_files.sort(key=get_chunk_index)
        total_chunks = len(chunk_files)

        # 过滤掉空文件（小于100字节的可能是无效分片）
        valid_chunks = []
        for chunk_file in chunk_files:
            file_size = chunk_file.stat().st_size
            if file_size > 100:
                valid_chunks.append(chunk_file)
                print(f"[录音] 有效分片: {chunk_file.name}, 大小: {file_size} 字节")
            else:
                print(f"[录音] 跳过小文件: {chunk_file.name}, 大小: {file_size} 字节")

        if not valid_chunks:
            raise ValueError("未找到有效的录音分片")

        # 创建最终目录
        final_dir = UPLOADS_DIR / str(candidate_id)
        final_dir.mkdir(parents=True, exist_ok=True)

        # 合并文件
        final_filename = f"{stage}_{get_china_time().strftime('%Y%m%d_%H%M%S')}.webm"
        final_path = final_dir / final_filename

        print(f"[录音] 开始合并到: {final_path}")

        with open(final_path, "wb") as outfile:
            for chunk_file in valid_chunks:
                with open(chunk_file, "rb") as infile:
                    outfile.write(infile.read())

        final_size = final_path.stat().st_size
        print(f"[录音] 合并完成，文件大小: {final_size / 1024 / 1024:.2f} MB")

        # 删除临时文件
        shutil.rmtree(temp_dir)

        # 创建录音记录
        recording = InterviewRecording(
            candidate_id=candidate_id,
            stage=stage,
            recording_file_path=str(final_path),
            transcript_status="pending",
            interviewer_id=interviewer_id
        )
        self.db.add(recording)
        self.db.commit()
        self.db.refresh(recording)

        # 异步处理ASR转录和AI分析
        self._process_recording_async(recording.id)

        return {
            "status": "recording_finished",
            "recording_id": recording.id,
            "file_path": final_path,
            "total_chunks": total_chunks,
            "message": "录音已合并，正在进行ASR转录和AI分析"
        }

    async def async_finish_recording(
        self,
        candidate_id: int,
        stage: str,
        interviewer_id: int
    ) -> Dict[str, Any]:
        """
        完成录音：合并所有分片，创建录音记录，异步触发ASR转录和AI分析（异步版本）

        Args:
            candidate_id: 候选人ID
            stage: 面试阶段
            interviewer_id: 面试官ID

        Returns:
            处理结果
        """
        import shutil

        # 使用绝对路径
        temp_dir = UPLOADS_DIR / "temp" / f"{candidate_id}_{stage}"

        print(f"[录音] 完成录音，检查临时目录: {temp_dir}")

        # 检查临时目录是否存在
        if not temp_dir.exists():
            print(f"[录音] 临时目录不存在: {temp_dir}")
            raise ValueError("未找到录音分片，请先上传录音")

        # 获取所有分片文件
        chunk_files = list(temp_dir.glob("chunk_*.webm"))
        if not chunk_files:
            print(f"[录音] 临时目录中没有分片文件")
            raise ValueError("未找到录音分片")

        print(f"[录音] 找到 {len(chunk_files)} 个分片文件")

        # 按索引排序（支持 chunk_0000.webm 和 chunk_0.webm 格式）
        def get_chunk_index(filepath):
            filename = filepath.name
            # 提取数字部分
            try:
                # chunk_0000.webm -> 0000 -> 0
                index_str = filename.replace('chunk_', '').replace('.webm', '')
                return int(index_str)
            except:
                return 0

        chunk_files.sort(key=get_chunk_index)
        total_chunks = len(chunk_files)

        # 过滤掉空文件（小于100字节的可能是无效分片）
        valid_chunks = []
        for chunk_file in chunk_files:
            file_size = chunk_file.stat().st_size
            if file_size > 100:
                valid_chunks.append(chunk_file)
                print(f"[录音] 有效分片: {chunk_file.name}, 大小: {file_size} 字节")
            else:
                print(f"[录音] 跳过小文件: {chunk_file.name}, 大小: {file_size} 字节")

        if not valid_chunks:
            raise ValueError("未找到有效的录音分片")

        # 创建最终目录
        final_dir = UPLOADS_DIR / str(candidate_id)
        final_dir.mkdir(parents=True, exist_ok=True)

        # 合并文件
        final_filename = f"{stage}_{get_china_time().strftime('%Y%m%d_%H%M%S')}.webm"
        final_path = final_dir / final_filename

        print(f"[录音] 开始合并到: {final_path}")

        # 将文件合并和清理操作放到同步内部函数中，通过 asyncio.to_thread 调用
        def _do_merge():
            with open(final_path, "wb") as outfile:
                for chunk_file in valid_chunks:
                    with open(chunk_file, "rb") as infile:
                        outfile.write(infile.read())
            # 删除临时文件
            shutil.rmtree(temp_dir)

        await asyncio.to_thread(_do_merge)

        final_size = final_path.stat().st_size
        print(f"[录音] 合并完成，文件大小: {final_size / 1024 / 1024:.2f} MB")

        # 创建录音记录
        recording = InterviewRecording(
            candidate_id=candidate_id,
            stage=stage,
            recording_file_path=str(final_path),
            transcript_status="pending",
            interviewer_id=interviewer_id
        )
        self.db.add(recording)
        self.db.commit()
        self.db.refresh(recording)

        # 异步处理ASR转录和AI分析
        self._process_recording_async(recording.id)

        return {
            "status": "recording_finished",
            "recording_id": recording.id,
            "file_path": final_path,
            "total_chunks": total_chunks,
            "message": "录音已合并，正在进行ASR转录和AI分析"
        }

    def _merge_and_process_recording(
        self,
        candidate_id: int,
        stage: str,
        temp_dir: str,
        total_chunks: int,
        interviewer_id: int
    ) -> Dict[str, Any]:
        """
        合并录音切片并处理

        Args:
            candidate_id: 候选人ID
            stage: 面试阶段
            temp_dir: 临时目录
            total_chunks: 总切片数
            interviewer_id: 面试官ID

        Returns:
            处理结果
        """
        # 使用绝对路径合并切片
        final_dir = UPLOADS_DIR / str(candidate_id)
        final_dir.mkdir(parents=True, exist_ok=True)

        final_path = final_dir / f"{stage}_{get_china_time().strftime('%Y%m%d_%H%M%S')}.webm"

        temp_dir_path = Path(temp_dir)
        with open(final_path, "wb") as outfile:
            for i in range(total_chunks):
                # 支持新格式 chunk_0000.webm
                chunk_path = temp_dir_path / f"chunk_{i:04d}.webm"
                if not chunk_path.exists():
                    # 兼容旧格式 chunk_0.webm
                    chunk_path = temp_dir_path / f"chunk_{i}.webm"
                with open(chunk_path, "rb") as infile:
                    outfile.write(infile.read())

        # 删除临时文件
        import shutil
        shutil.rmtree(temp_dir)

        # 创建录音记录
        recording = InterviewRecording(
            candidate_id=candidate_id,
            stage=stage,
            recording_file_path=str(final_path),
            transcript_status="pending",
            interviewer_id=interviewer_id
        )
        self.db.add(recording)
        self.db.commit()
        self.db.refresh(recording)

        # 异步处理ASR转录和AI分析
        self._process_recording_async(recording.id)

        return {
            "status": "recording_uploaded",
            "message": "录音上传完成，正在处理",
            "recording_id": recording.id,
            "file_path": final_path
        }

    def _process_recording_async(self, recording_id: int):
        """
        异步处理录音（ASR转录 + AI分析）
        使用线程池真正异步执行，不阻塞主线程

        Args:
            recording_id: 录音记录ID
        """
        import threading

        def process_in_thread():
            from db.database import SessionLocal

            db = SessionLocal()
            try:
                recording = db.query(InterviewRecording).filter(
                    InterviewRecording.id == recording_id
                ).first()

                if not recording:
                    return

                # 更新状态为正在转录
                recording.transcript_status = "transcribing"
                db.commit()
                print(f"[录音处理] 开始转录: recording_id={recording_id}")

                # 1. ASR转录
                transcript_text = self._transcribe_audio(recording.recording_file_path)

                if not transcript_text:
                    recording.transcript_status = "failed"
                    db.commit()
                    print(f"[录音处理] 转录失败: recording_id={recording_id}")
                    return

                recording.transcript_text = transcript_text
                recording.transcript_status = "transcribed"
                db.commit()
                print(f"[录音处理] 转录完成: recording_id={recording_id}, 文本长度={len(transcript_text)}")

                # 更新状态为正在生成评价
                recording.transcript_status = "evaluating"
                db.commit()
                print(f"[录音处理] 开始生成评价: recording_id={recording_id}")

                # 2. 并行执行AI提取问题、生成评价和生成综合评价（3个任务）
                with ThreadPoolExecutor(max_workers=3) as executor:
                    future_qa = executor.submit(
                        self._extract_interview_qa,
                        transcript_text
                    )
                    future_evaluation = executor.submit(
                        self._evaluate_interview,
                        recording.candidate_id,
                        recording.stage,
                        transcript_text,
                        db
                    )
                    future_comprehensive = executor.submit(
                        self._generate_comprehensive_evaluation,
                        transcript_text,
                        recording.candidate_id,
                        recording.stage,
                        db
                    )

                    # 获取结果
                    extracted_qa = future_qa.result()
                    evaluation_result = future_evaluation.result()
                    comprehensive_result = future_comprehensive.result()

                # 3. 保存结果
                recording.extracted_qa = extracted_qa
                recording.interview_evaluation = evaluation_result.get("detail")
                recording.interview_score_main = evaluation_result.get("main_score")
                recording.interview_score_bonus = evaluation_result.get("bonus_score")
                recording.interview_score_total = evaluation_result.get("total_score")

                # 保存综合评价、优劣势
                recording.comprehensive_evaluation = comprehensive_result.get("comprehensive_evaluation")
                recording.strengths = comprehensive_result.get("strengths")
                recording.weaknesses = comprehensive_result.get("weaknesses")

                # 更新状态为完成
                recording.transcript_status = "completed"
                db.commit()
                print(f"[录音处理] 全部完成: recording_id={recording_id}")

            except Exception as e:
                print(f"[录音处理] 处理失败: {str(e)}")
                try:
                    recording = db.query(InterviewRecording).filter(
                        InterviewRecording.id == recording_id
                    ).first()
                    if recording:
                        recording.transcript_status = "failed"
                        db.commit()
                except:
                    pass
            finally:
                db.close()

        # 启动后台线程执行处理
        thread = threading.Thread(target=process_in_thread, daemon=True)
        thread.start()
        print(f"[录音处理] 后台线程已启动: recording_id={recording_id}")

    def _transcribe_audio(self, file_path: str) -> Optional[str]:
        """
        调用ASR服务转录音频

        Args:
            file_path: 音频文件路径

        Returns:
            转录文本
        """
        try:
            print(f"[ASR] 开始转录音频: {file_path}")

            # 读取音频文件
            with open(file_path, "rb") as f:
                audio_data = f.read()

            print(f"[ASR] 音频文件大小: {len(audio_data) / 1024 / 1024:.2f} MB")

            # 使用实际的 ASR 服务地址
            asr_url = "http://180.213.184.248:9876/asr_processing"

            files = {"file": ("recording.webm", audio_data, "audio/webm")}

            print(f"[ASR] 发送请求到: {asr_url}")
            response = requests.post(asr_url, files=files, timeout=600)  # 10分钟超时

            print(f"[ASR] 响应状态码: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print(f"[ASR] 响应内容: {result}")

                # 解析 ASR 响应
                if "asr_result" in result:
                    transcript_text = result["asr_result"].get("text", "")
                    print(f"[ASR] 转录成功，文本长度: {len(transcript_text)}")
                    return transcript_text
                else:
                    error_msg = result.get("message", "未知错误")
                    print(f"[ASR] 转录失败: {error_msg}")
                    return None
            else:
                print(f"[ASR] 转录失败: {response.status_code}, {response.text}")
                return None

        except Exception as e:
            print(f"[ASR] 转录异常: {str(e)}")
            return None

    def _extract_interview_qa(self, transcript_text: str) -> Dict[str, Any]:
        """
        从转录文本中提取面试问答

        Args:
            transcript_text: 转录文本

        Returns:
            提取的问答
        """
        prompt = f"""你是一位专业的面试分析专家，需要从面试录音的转录文本中提取面试官的问题和候选人的回答。

转录文本：
{transcript_text}

请提取出：
1. 面试官问的所有问题
2. 候选人对每个问题的回答

**重要要求：**
- 对提取的问题和回答进行语言加工，去除口语化表达（如"嗯"、"那个"、"就是说"、"然后呢"、"对对对"等口语词和语气词）
- 问题需要重新组织为清晰、专业的书面表达
- 回答需要精炼概括，去除口语化描述和重复内容，保持专业简洁，但不能遗漏关键信息和重要细节
- 保留回答中的具体数据、案例、技术细节等实质性内容

输出格式（JSON）：
{{
    "qa_pairs": [
        {{
            "question": "面试官的问题（书面化）",
            "answer": "候选人的回答（精炼后）"
        }}
    ]
}}

请确保输出的是有效的JSON格式。
"""

        messages = [{"role": "user", "content": prompt}]
        result = self.llm_service.chat_json(messages, validator=self._validate_qa_result)
        if "parse_error" in result:
            print(f"提取问答JSON解析失败: {result['parse_error']}")
            return {"qa_pairs": [], "parse_error": result["parse_error"], "raw_response": result.get("raw_response")}
        return result

    def _evaluate_interview(
        self,
        candidate_id: int,
        stage: str,
        transcript_text: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        生成面试评价

        Args:
            candidate_id: 候选人ID
            stage: 面试阶段
            transcript_text: 转录文本
            db: 数据库会话

        Returns:
            评价结果
        """
        # 获取候选人和JD信息
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            return {"error": "候选人不存在"}

        jd = db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()
        if not jd or not jd.interview_rule_set_id:
            return {"error": "未找到面试评分规则"}

        # 获取评分规则
        evaluation_rules = db.query(InterviewEvaluationRule).filter(
            InterviewEvaluationRule.rule_set_id == jd.interview_rule_set_id
        ).all()

        if not evaluation_rules:
            return {"error": "未找到面试评分规则"}

        # 构建评分规则prompt
        rules_prompt = self._build_interview_rules_prompt(evaluation_rules)

        # 构建评价prompt
        prompt = f"""请根据以下评分标准对面试进行评分：

{rules_prompt}

面试转录文本：
{transcript_text}

请对候选人的面试表现进行评分，要求：
1. 按维度输出每个维度下每个指标的得分
2. 给出评分理由
3. 引用转录文本中的原文作为评估来源

输出格式（JSON）：
{{
    "dimensions": [
        {{
            "dimension_name": "维度名称",
            "is_bonus": false,
            "indicators": [
                {{
                    "indicator_name": "指标名称",
                    "actual_score": 实际得分,
                    "reason": "评分理由",
                    "evidence": "转录文本中的原文证据"
                }}
            ]
        }}
    ]
}}

请确保输出的是有效的JSON格式。
"""

        messages = [{"role": "user", "content": prompt}]
        result = self.llm_service.chat_json(messages, validator=self._validate_interview_score_result)
        if "parse_error" in result:
            print(f"面试评价JSON解析失败: {result['parse_error']}")
            return result

        # 处理评分结果（计算维度得分、总分等）
        processed_result = self._process_interview_score_result(result, evaluation_rules)
        return processed_result

    def _build_interview_rules_prompt(self, evaluation_rules: List[InterviewEvaluationRule]) -> str:
        """构建面试评分规则的提示词"""

        # 按维度分组
        dimensions = {}
        for rule in evaluation_rules:
            if rule.dimension not in dimensions:
                dimensions[rule.dimension] = {
                    "total_score": 0,
                    "is_bonus": rule.is_bonus,
                    "indicators": {}
                }

            if rule.indicator_name not in dimensions[rule.dimension]["indicators"]:
                dimensions[rule.dimension]["indicators"][rule.indicator_name] = {
                    "total_score": rule.total_score,
                    "levels": []
                }

            dimensions[rule.dimension]["indicators"][rule.indicator_name]["levels"].append({
                "level": rule.level,
                "description": rule.description,
                "score_range": rule.score_range,
                "score_min": rule.score_min,
                "score_max": rule.score_max
            })

        # 构建prompt
        prompt = ""
        for dim_name, dim_data in dimensions.items():
            bonus_tag = "（加分项）" if dim_data["is_bonus"] else ""
            prompt += f"\n【{dim_name}】{bonus_tag}\n\n"

            for ind_name, ind_data in dim_data["indicators"].items():
                prompt += f"{ind_name}（总分：{ind_data['total_score']}分）\n"
                for level in ind_data["levels"]:
                    score_range = f"（{level['score_min']}-{level['score_max']}分）" if level['score_min'] != level['score_max'] else f"（{level['score_max']}分）"
                    prompt += f"  - {level['level']}{score_range}：{level['description']}\n"
                prompt += "\n"

        return prompt

    def _process_interview_score_result(
        self,
        ai_result: Dict[str, Any],
        evaluation_rules: List[InterviewEvaluationRule]
    ) -> Dict[str, Any]:
        """
        处理面试评分结果（计算维度得分、总分、得分率）

        类似简历评分的处理逻辑
        """
        # 构建维度结构（从数据库规则中获取）
        dimension_structure = {}
        for rule in evaluation_rules:
            if rule.dimension not in dimension_structure:
                dimension_structure[rule.dimension] = {
                    "is_bonus": rule.is_bonus,
                    "indicators": {}
                }

            if rule.indicator_name not in dimension_structure[rule.dimension]["indicators"]:
                dimension_structure[rule.dimension]["indicators"][rule.indicator_name] = rule.total_score

        def find_matching_indicator(ai_ind_name: str, db_indicators: dict) -> tuple:
            """
            模糊匹配指标名称
            数据库中可能是 "1. 求职动机"，AI返回的可能是 "求职动机"
            返回 (匹配的数据库指标名, 总分) 或 (None, None)
            """
            # 先尝试精确匹配
            if ai_ind_name in db_indicators:
                return ai_ind_name, db_indicators[ai_ind_name]

            # 模糊匹配：检查AI指标名是否包含在数据库指标名中，或反过来
            for db_ind_name, total_score in db_indicators.items():
                # 去掉序号前缀进行匹配（如 "1. 求职动机" -> "求职动机"）
                clean_db_name = db_ind_name
                if '. ' in db_ind_name:
                    clean_db_name = db_ind_name.split('. ', 1)[1]

                # 匹配：AI名称等于清理后的数据库名称，或互相包含
                if ai_ind_name == clean_db_name or ai_ind_name in db_ind_name or db_ind_name in ai_ind_name:
                    return db_ind_name, total_score

            return None, None

        # 处理AI返回的结果
        processed_dimensions = []
        main_score = 0
        main_total_score = 0
        bonus_score = 0
        bonus_total_score = 0

        for dim in ai_result.get("dimensions", []):
            dim_name = dim.get("dimension_name")
            if dim_name not in dimension_structure:
                continue

            is_bonus = dimension_structure[dim_name]["is_bonus"]
            dim_actual_score = 0
            dim_total_score = 0

            processed_indicators = []
            for ind in dim.get("indicators", []):
                ind_name = ind.get("indicator_name")

                # 使用模糊匹配查找指标
                matched_ind_name, total_score = find_matching_indicator(
                    ind_name,
                    dimension_structure[dim_name]["indicators"]
                )

                if matched_ind_name is None:
                    continue

                actual_score = ind.get("actual_score", 0)

                # 确保得分不超过总分
                actual_score = min(actual_score, total_score)

                score_rate = round(actual_score / total_score, 4) if total_score > 0 else 0

                processed_indicators.append({
                    "indicator_name": matched_ind_name,  # 使用数据库中的规范名称
                    "total_score": total_score,
                    "actual_score": actual_score,
                    "score_rate": score_rate,
                    "reason": ind.get("reason", ""),
                    "evidence": ind.get("evidence", "")
                })

                dim_actual_score += actual_score
                dim_total_score += total_score

            dim_score_rate = round(dim_actual_score / dim_total_score, 4) if dim_total_score > 0 else 0

            processed_dimensions.append({
                "dimension_name": dim_name,
                "is_bonus": is_bonus,
                "indicators": processed_indicators,
                "dimension_total_score": dim_total_score,
                "dimension_actual_score": dim_actual_score,
                "dimension_score_rate": dim_score_rate
            })

            if is_bonus:
                bonus_score += dim_actual_score
                bonus_total_score += dim_total_score
            else:
                main_score += dim_actual_score
                main_total_score += dim_total_score

        # 计算总分
        total_score = main_score + bonus_score
        total_possible_score = main_total_score + bonus_total_score

        main_score_rate = round(main_score / main_total_score, 4) if main_total_score > 0 else 0
        bonus_score_rate = round(bonus_score / bonus_total_score, 4) if bonus_total_score > 0 else 0
        overall_score_rate = round(total_score / total_possible_score, 4) if total_possible_score > 0 else 0

        return {
            "detail": {
                "dimensions": processed_dimensions,
                "main_score": main_score,
                "main_total_score": main_total_score,
                "main_score_rate": main_score_rate,
                "bonus_score": bonus_score,
                "bonus_total_score": bonus_total_score,
                "bonus_score_rate": bonus_score_rate,
                "total_score": total_score,
                "total_possible_score": total_possible_score,
                "overall_score_rate": overall_score_rate
            },
            "main_score": main_score,
            "bonus_score": bonus_score,
            "total_score": total_score
        }

    def chat_about_interview(
        self,
        candidate_id: int,
        user_message: str,
        conversation_history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        面试结果智能对话

        Args:
            candidate_id: 候选人ID
            user_message: 用户消息
            conversation_history: 对话历史

        Returns:
            AI回复
        """
        # 获取候选人信息
        candidate = self.db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise ValueError("候选人不存在")

        # 获取JD信息
        jd = self.db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()

        # 获取所有面试录音转录结果
        recordings = self.db.query(InterviewRecording).filter(
            InterviewRecording.candidate_id == candidate_id,
            InterviewRecording.transcript_status == "completed"
        ).all()

        # 构建上下文 - 区分主要信息和背景参考
        context = f"""
【岗位信息】
岗位名称：{jd.job_title}
岗位职责：{jd.job_responsibilities}
任职要求：{jd.hard_requirements}

【候选人基本信息】
姓名：{candidate.name}
最高学历：{candidate.highest_education}
学校：{candidate.school}

【面试录音转录（主要分析依据）】
"""
        if recordings:
            for recording in recordings:
                context += f"\n--- {recording.stage}面试 ---\n{recording.transcript_text}\n"
        else:
            context += "\n暂无面试录音转录内容。\n"

        context += f"""
【简历摘要（仅供背景参考）】
{candidate.summary}
"""

        # 记录原始上下文用于判断是否压缩
        original_context = context

        # 检查上下文长度，如果超过100K token则压缩
        context = self._compress_context_if_needed(context, conversation_history)

        # 构建消息
        messages = [
            {
                "role": "system",
                "content": f"""你是一位专业的HR面试助手。

{context}

**重要原则**：
1. 分析候选人面试表现时，必须**以面试录音转录内容为主要依据**
2. 简历信息仅作为背景参考，不能替代面试表现的分析
3. 如果面试录音内容过短、无实质内容或是测试录音，请诚实告知用户"从面试录音来看，内容不足以进行有效分析"
4. 不要基于简历内容编造面试中的表现
5. 回答简洁有效，直击要点"""
            }
        ]

        # 添加对话历史
        messages.extend(conversation_history)

        # 添加用户当前消息
        messages.append({"role": "user", "content": user_message})

        # 调用LLM
        response = self.llm_service.chat(messages)

        return {
            "response": response,
            "context_compressed": context != original_context
        }

    async def async_chat_about_interview(
        self,
        candidate_id: int,
        user_message: str,
        conversation_history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        面试结果智能对话（异步版本）

        Args:
            candidate_id: 候选人ID
            user_message: 用户消息
            conversation_history: 对话历史

        Returns:
            AI回复
        """
        # 获取候选人信息
        candidate = self.db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise ValueError("候选人不存在")

        # 获取JD信息
        jd = self.db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()

        # 获取所有面试录音转录结果
        recordings = self.db.query(InterviewRecording).filter(
            InterviewRecording.candidate_id == candidate_id,
            InterviewRecording.transcript_status == "completed"
        ).all()

        # 构建上下文 - 区分主要信息和背景参考
        context = f"""
【岗位信息】
岗位名称：{jd.job_title}
岗位职责：{jd.job_responsibilities}
任职要求：{jd.hard_requirements}

【候选人基本信息】
姓名：{candidate.name}
最高学历：{candidate.highest_education}
学校：{candidate.school}

【面试录音转录（主要分析依据）】
"""
        if recordings:
            for recording in recordings:
                context += f"\n--- {recording.stage}面试 ---\n{recording.transcript_text}\n"
        else:
            context += "\n暂无面试录音转录内容。\n"

        context += f"""
【简历摘要（仅供背景参考）】
{candidate.summary}
"""

        # 记录原始上下文用于判断是否压缩
        original_context = context

        # 检查上下文长度，如果超过100K token则压缩（异步）
        context = await self._async_compress_context_if_needed(context, conversation_history)

        # 构建消息
        messages = [
            {
                "role": "system",
                "content": f"""你是一位专业的HR面试助手。

{context}

**重要原则**：
1. 分析候选人面试表现时，必须**以面试录音转录内容为主要依据**
2. 简历信息仅作为背景参考，不能替代面试表现的分析
3. 如果面试录音内容过短、无实质内容或是测试录音，请诚实告知用户"从面试录音来看，内容不足以进行有效分析"
4. 不要基于简历内容编造面试中的表现
5. 回答简洁有效，直击要点"""
            }
        ]

        # 添加对话历史
        messages.extend(conversation_history)

        # 添加用户当前消息
        messages.append({"role": "user", "content": user_message})

        # 调用LLM（异步）
        response = await self.llm_service.async_chat(messages)

        return {
            "response": response,
            "context_compressed": context != original_context
        }

    def chat_about_interview_stream(
        self,
        candidate_id: int,
        user_message: str,
        conversation_history: List[Dict[str, str]]
    ):
        """
        面试结果智能对话（流式输出）

        Args:
            candidate_id: 候选人ID
            user_message: 用户消息
            conversation_history: 对话历史

        Yields:
            AI回复的流式内容
        """
        # 获取候选人信息
        candidate = self.db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise ValueError("候选人不存在")

        # 获取JD信息
        jd = self.db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()

        # 获取所有面试录音转录结果
        recordings = self.db.query(InterviewRecording).filter(
            InterviewRecording.candidate_id == candidate_id,
            InterviewRecording.transcript_status == "completed"
        ).all()

        # 构建上下文 - 区分主要信息和背景参考
        context = f"""
【岗位信息】
岗位名称：{jd.job_title}
岗位职责：{jd.job_responsibilities}
任职要求：{jd.hard_requirements}

【候选人基本信息】
姓名：{candidate.name}
最高学历：{candidate.highest_education}
学校：{candidate.school}

【面试录音转录（主要分析依据）】
"""
        if recordings:
            for recording in recordings:
                context += f"\n--- {recording.stage}面试 ---\n{recording.transcript_text}\n"
        else:
            context += "\n暂无面试录音转录内容。\n"

        context += f"""
【简历摘要（仅供背景参考）】
{candidate.summary}
"""

        # 检查上下文长度，如果超过100K token则压缩
        context = self._compress_context_if_needed(context, conversation_history)

        # 构建消息
        messages = [
            {
                "role": "system",
                "content": f"""你是一位专业的HR面试助手。

{context}

**重要原则**：
1. 分析候选人面试表现时，必须**以面试录音转录内容为主要依据**
2. 简历信息仅作为背景参考，不能替代面试表现的分析
3. 如果面试录音内容过短、无实质内容或是测试录音，请诚实告知用户"从面试录音来看，内容不足以进行有效分析"
4. 不要基于简历内容编造面试中的表现
5. 回答简洁有效，直击要点"""
            }
        ]

        # 添加对话历史
        messages.extend(conversation_history)

        # 添加用户当前消息
        messages.append({"role": "user", "content": user_message})

        # 调用LLM流式输出
        yield from self.llm_service.chat_stream(messages)

    async def async_chat_about_interview_stream(
        self,
        candidate_id: int,
        user_message: str,
        conversation_history: List[Dict[str, str]]
    ):
        """
        面试结果智能对话（异步流式输出版本）

        Args:
            candidate_id: 候选人ID
            user_message: 用户消息
            conversation_history: 对话历史

        Yields:
            AI回复的流式内容
        """
        # 获取候选人信息
        candidate = self.db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            raise ValueError("候选人不存在")

        # 获取JD信息
        jd = self.db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()

        # 获取所有面试录音转录结果
        recordings = self.db.query(InterviewRecording).filter(
            InterviewRecording.candidate_id == candidate_id,
            InterviewRecording.transcript_status == "completed"
        ).all()

        # 构建上下文 - 区分主要信息和背景参考
        context = f"""
【岗位信息】
岗位名称：{jd.job_title}
岗位职责：{jd.job_responsibilities}
任职要求：{jd.hard_requirements}

【候选人基本信息】
姓名：{candidate.name}
最高学历：{candidate.highest_education}
学校：{candidate.school}

【面试录音转录（主要分析依据）】
"""
        if recordings:
            for recording in recordings:
                context += f"\n--- {recording.stage}面试 ---\n{recording.transcript_text}\n"
        else:
            context += "\n暂无面试录音转录内容。\n"

        context += f"""
【简历摘要（仅供背景参考）】
{candidate.summary}
"""

        # 检查上下文长度，如果超过100K token则压缩（异步）
        context = await self._async_compress_context_if_needed(context, conversation_history)

        # 构建消息
        messages = [
            {
                "role": "system",
                "content": f"""你是一位专业的HR面试助手。

{context}

**重要原则**：
1. 分析候选人面试表现时，必须**以面试录音转录内容为主要依据**
2. 简历信息仅作为背景参考，不能替代面试表现的分析
3. 如果面试录音内容过短、无实质内容或是测试录音，请诚实告知用户"从面试录音来看，内容不足以进行有效分析"
4. 不要基于简历内容编造面试中的表现
5. 回答简洁有效，直击要点"""
            }
        ]

        # 添加对话历史
        messages.extend(conversation_history)

        # 添加用户当前消息
        messages.append({"role": "user", "content": user_message})

        # 调用LLM异步流式输出
        async for chunk in self.llm_service.async_chat_stream(messages):
            yield chunk

    def _compress_context_if_needed(
        self,
        context: str,
        conversation_history: List[Dict[str, str]]
    ) -> str:
        """
        如果上下文超过100K token，则压缩

        Args:
            context: 原始上下文
            conversation_history: 对话历史

        Returns:
            压缩后的上下文（如果需要）
        """
        try:
            # 使用tiktoken计算token数
            encoding = tiktoken.encoding_for_model("gpt-4")
            total_tokens = len(encoding.encode(context))

            # 加上对话历史的token
            for msg in conversation_history:
                total_tokens += len(encoding.encode(msg.get("content", "")))

            if total_tokens > 100000:
                # 需要压缩，调用LLM生成摘要
                summary_prompt = f"""请将以下内容压缩为简洁的摘要，保留关键信息：

{context}

请生成一份精炼的摘要（控制在2000字以内）。"""

                messages = [{"role": "user", "content": summary_prompt}]
                summary = self.llm_service.chat(messages)
                return summary
            else:
                return context

        except Exception as e:
            print(f"上下文压缩失败: {str(e)}")
            return context

    async def _async_compress_context_if_needed(
        self,
        context: str,
        conversation_history: List[Dict[str, str]]
    ) -> str:
        """
        如果上下文超过100K token，则压缩（异步版本）

        Args:
            context: 原始上下文
            conversation_history: 对话历史

        Returns:
            压缩后的上下文（如果需要）
        """
        try:
            # 使用tiktoken计算token数
            encoding = tiktoken.encoding_for_model("gpt-4")
            total_tokens = len(encoding.encode(context))

            # 加上对话历史的token
            for msg in conversation_history:
                total_tokens += len(encoding.encode(msg.get("content", "")))

            if total_tokens > 100000:
                # 需要压缩，调用LLM生成摘要（异步）
                summary_prompt = f"""请将以下内容压缩为简洁的摘要，保留关键信息：

{context}

请生成一份精炼的摘要（控制在2000字以内）。"""

                messages = [{"role": "user", "content": summary_prompt}]
                summary = await self.llm_service.async_chat(messages)
                return summary
            else:
                return context

        except Exception as e:
            print(f"上下文压缩失败: {str(e)}")
            return context

    def _generate_comprehensive_evaluation(
        self,
        transcript_text: str,
        candidate_id: int,
        stage: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        生成综合评价、优势、劣势

        Args:
            transcript_text: 转录文本
            candidate_id: 候选人ID
            stage: 面试阶段
            db: 数据库会话

        Returns:
            综合评价结果
        """
        # 获取候选人和JD信息
        candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not candidate:
            return {"error": "候选人不存在"}

        jd = db.query(JobDescription).filter(JobDescription.id == candidate.jd_id).first()
        if not jd:
            return {"error": "JD不存在"}

        # 构建prompt - 只使用JD信息和录音转录文本，不包含简历
        prompt = f"""你是一位资深的面试官，需要**仅根据面试录音转录文本**对候选人进行综合评价。

应聘职位：{jd.job_title}
岗位职责：{jd.job_responsibilities}
任职要求：{jd.hard_requirements}

面试转录文本：
{transcript_text}

**重要提示**：
- 评价必须**完全基于转录文本中的实际内容**，不得参考任何外部信息
- 如果转录文本过短、不完整、是测试录音、或缺乏实质性面试问答，请如实指出"无法进行有效评价"
- 不要凭空编造候选人的表现

请对候选人的面试表现进行综合评价，要求**简洁有效、直击要点、避免冗长**：

1. **综合评价**（50-100字）：结合岗位要求给出整体判断和录用建议，录音内容不足时直接说明
2. **优势**（30-60字）：提炼面试中展现的核心优势，无法识别时写"根据现有录音内容无法识别明显优势"
3. **劣势**（30-60字）：提炼面试中暴露的关键不足，无法识别时写"根据现有录音内容无法识别明显劣势"

输出格式（JSON）：
{{
    "comprehensive_evaluation": "综合评价",
    "strengths": "优势",
    "weaknesses": "劣势"
}}

请确保输出有效JSON，内容精炼不啰嗦。
"""

        messages = [{"role": "user", "content": prompt}]
        result = self.llm_service.chat_json(messages, validator=self._validate_comprehensive_result)
        if "parse_error" in result:
            print(f"综合评价JSON解析失败: {result['parse_error']}")
            return {
                "comprehensive_evaluation": "",
                "strengths": "",
                "weaknesses": "",
                "parse_error": result["parse_error"],
                "raw_response": result.get("raw_response")
            }

        return {
            "comprehensive_evaluation": result.get("comprehensive_evaluation", ""),
            "strengths": result.get("strengths", ""),
            "weaknesses": result.get("weaknesses", "")
        }

    def re_evaluate_recording(self, recording_id: int) -> Dict[str, Any]:
        """
        重新评价录音（异步后台处理，不阻塞请求）

        Args:
            recording_id: 录音ID

        Returns:
            启动重新评价的状态信息
        """
        # 获取录音记录
        recording = self.db.query(InterviewRecording).filter(
            InterviewRecording.id == recording_id
        ).first()

        if not recording:
            raise ValueError("录音记录不存在")

        if not recording.transcript_text:
            raise ValueError("录音尚未完成转录")

        # 更新状态为正在评价
        recording.transcript_status = "evaluating"
        self.db.commit()

        # 在后台线程中执行AI评价
        self._re_evaluate_recording_async(recording_id)

        return {
            "recording_id": recording.id,
            "status": "evaluating",
            "message": "重新评价已启动，请等待完成"
        }

    def _re_evaluate_recording_async(self, recording_id: int):
        """
        异步执行重新评价（后台线程，不阻塞事件循环）

        Args:
            recording_id: 录音记录ID
        """
        import threading

        def process_in_thread():
            from db.database import SessionLocal

            db = SessionLocal()
            try:
                recording = db.query(InterviewRecording).filter(
                    InterviewRecording.id == recording_id
                ).first()

                if not recording:
                    return

                print(f"[重新评价] 开始: recording_id={recording_id}")

                # 并行执行AI评价任务
                with ThreadPoolExecutor(max_workers=3) as executor:
                    future_qa = executor.submit(
                        self._extract_interview_qa,
                        recording.transcript_text
                    )
                    future_evaluation = executor.submit(
                        self._evaluate_interview,
                        recording.candidate_id,
                        recording.stage,
                        recording.transcript_text,
                        db
                    )
                    future_comprehensive = executor.submit(
                        self._generate_comprehensive_evaluation,
                        recording.transcript_text,
                        recording.candidate_id,
                        recording.stage,
                        db
                    )

                    # 获取结果
                    extracted_qa = future_qa.result()
                    evaluation_result = future_evaluation.result()
                    comprehensive_result = future_comprehensive.result()

                # 保存结果
                recording.extracted_qa = extracted_qa
                recording.interview_evaluation = evaluation_result.get("detail")
                recording.interview_score_main = evaluation_result.get("main_score")
                recording.interview_score_bonus = evaluation_result.get("bonus_score")
                recording.interview_score_total = evaluation_result.get("total_score")
                recording.comprehensive_evaluation = comprehensive_result.get("comprehensive_evaluation")
                recording.strengths = comprehensive_result.get("strengths")
                recording.weaknesses = comprehensive_result.get("weaknesses")

                recording.transcript_status = "completed"
                db.commit()
                print(f"[重新评价] 完成: recording_id={recording_id}")

            except Exception as e:
                print(f"[重新评价] 失败: {str(e)}")
                try:
                    recording = db.query(InterviewRecording).filter(
                        InterviewRecording.id == recording_id
                    ).first()
                    if recording:
                        recording.transcript_status = "completed"
                        db.commit()
                except:
                    pass
            finally:
                db.close()

        # 启动后台线程
        thread = threading.Thread(target=process_in_thread, daemon=True)
        thread.start()
        print(f"[重新评价] 后台线程已启动: recording_id={recording_id}")
