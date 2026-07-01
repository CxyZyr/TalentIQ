"""
JD服务层 - 处理JD生成、管理和查询的业务逻辑
"""
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from db.models import (
    JobDescription, User, UserRole, JDStatus,
    EvaluationRuleSet, DepartmentModel,
    get_china_time
)
from utils.llm_service import JDAssistantService, HardRequirementsExtractionService


class JDService:
    """JD服务类"""

    def __init__(self, db: Session):
        self.db = db
        self._jd_assistant = None
        self._hard_req_extractor = None

    @property
    def jd_assistant(self):
        """延迟初始化JD助手服务"""
        if self._jd_assistant is None:
            self._jd_assistant = JDAssistantService()
        return self._jd_assistant

    @property
    def hard_req_extractor(self):
        """延迟初始化硬性条件提取服务"""
        if self._hard_req_extractor is None:
            self._hard_req_extractor = HardRequirementsExtractionService()
        return self._hard_req_extractor

    def _get_user(self, user_id: int) -> User:
        """获取当前操作用户"""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("用户不存在")
        return user

    def _get_editable_jd(self, jd_id: int, user_id: int) -> JobDescription:
        """
        获取当前用户可编辑的JD

        面试官只能编辑自己创建的JD；HR和CEO可以编辑已有JD。
        """
        user = self._get_user(user_id)
        query = self.db.query(JobDescription).filter(JobDescription.id == jd_id)

        if user.role == UserRole.INTERVIEWER.value:
            query = query.filter(JobDescription.created_by == user_id)

        jd = query.first()
        if not jd:
            raise ValueError("JD不存在或无权限修改")

        return jd

    def _can_user_view_jd(self, jd: JobDescription, user_id: int) -> bool:
        """
        JD查看权限规则：
        - 已发布、已关闭：所有登录用户可见
        - 草稿：仅创建者可见
        """
        if jd.status in [JDStatus.PUBLISHED.value, JDStatus.CLOSED.value]:
            return True

        if jd.status == JDStatus.DRAFT.value:
            return jd.created_by == user_id

        return False

    # ==================== JD生成相关 ====================

    def ai_assist_write(self, jd_info: Dict[str, Any], output_mode: str) -> str:
        """
        AI帮写功能

        Args:
            jd_info: JD信息字典
            output_mode: 输出模式 ('job_responsibilities', 'hard_requirements', 'other_requirements')

        Returns:
            生成的内容
        """
        if output_mode == "job_responsibilities":
            return self.jd_assistant.generate_job_responsibilities(jd_info)
        elif output_mode == "hard_requirements":
            return self.jd_assistant.generate_hard_requirements(jd_info)
        elif output_mode == "other_requirements":
            return self.jd_assistant.generate_other_requirements(jd_info)
        else:
            raise ValueError(f"不支持的输出模式: {output_mode}")

    def ai_assist_write_stream(self, jd_info: Dict[str, Any], output_mode: str):
        """
        AI帮写功能（流式输出）

        Args:
            jd_info: JD信息字典
            output_mode: 输出模式 ('job_responsibilities', 'hard_requirements', 'other_requirements')

        Yields:
            生成的内容片段
        """
        if output_mode == "job_responsibilities":
            yield from self.jd_assistant.generate_job_responsibilities_stream(jd_info)
        elif output_mode == "hard_requirements":
            yield from self.jd_assistant.generate_hard_requirements_stream(jd_info)
        elif output_mode == "other_requirements":
            yield from self.jd_assistant.generate_other_requirements_stream(jd_info)
        else:
            raise ValueError(f"不支持的输出模式: {output_mode}")

    async def async_ai_assist_write_stream(self, jd_info: Dict[str, Any], output_mode: str):
        """
        AI帮写功能（异步流式输出）

        Args:
            jd_info: JD信息字典
            output_mode: 输出模式 ('job_responsibilities', 'hard_requirements', 'other_requirements')

        Yields:
            生成的内容片段
        """
        if output_mode == "job_responsibilities":
            async for chunk in self.jd_assistant.async_generate_job_responsibilities_stream(jd_info):
                yield chunk
        elif output_mode == "hard_requirements":
            async for chunk in self.jd_assistant.async_generate_hard_requirements_stream(jd_info):
                yield chunk
        elif output_mode == "other_requirements":
            async for chunk in self.jd_assistant.async_generate_other_requirements_stream(jd_info):
                yield chunk
        else:
            raise ValueError(f"不支持的输出模式: {output_mode}")

    def save_jd_as_draft(self, jd_data: Dict[str, Any], user_id: int) -> JobDescription:
        """
        保存JD为草稿

        Args:
            jd_data: JD数据
            user_id: 用户ID

        Returns:
            保存的JD对象
        """
        # 检查是否是更新现有草稿
        jd_id = jd_data.get('id')
        if jd_id:
            jd = self._get_editable_jd(jd_id, user_id)
            self._update_jd_fields(jd, jd_data)
        else:
            # 创建新JD
            jd = JobDescription(
                created_by=user_id,
                status=JDStatus.DRAFT.value
            )
            self._update_jd_fields(jd, jd_data)
            self.db.add(jd)

        self.db.commit()
        self.db.refresh(jd)
        return jd

    def publish_jd(self, jd_data: Dict[str, Any], user_id: int) -> JobDescription:
        """
        发布JD

        Args:
            jd_data: JD数据
            user_id: 用户ID

        Returns:
            发布的JD对象
        """
        # 检查是否是更新现有JD
        jd_id = jd_data.get('id')
        if jd_id:
            jd = self._get_editable_jd(jd_id, user_id)
            self._update_jd_fields(jd, jd_data)
        else:
            # 创建新JD
            jd = JobDescription(created_by=user_id)
            self._update_jd_fields(jd, jd_data)
            self.db.add(jd)

        # 提取硬性条件（只传递硬性条件文本）
        if jd.hard_requirements:
            extracted_requirements = self.hard_req_extractor.extract_hard_requirements(
                jd.hard_requirements
            )
            jd.extracted_hard_requirements = extracted_requirements
        else:
            jd.extracted_hard_requirements = None

        # 关联默认评分规则集（通用规则集）
        if not jd.interview_rule_set_id:
            default_interview_rule_set = self.db.query(EvaluationRuleSet).filter(
                EvaluationRuleSet.name == "通用面试评价标准",
                EvaluationRuleSet.type == "interview"
            ).first()
            if default_interview_rule_set:
                jd.interview_rule_set_id = default_interview_rule_set.id

        if not jd.resume_rule_set_id:
            default_resume_rule_set = self.db.query(EvaluationRuleSet).filter(
                EvaluationRuleSet.name == "通用简历评价标准",
                EvaluationRuleSet.type == "resume"
            ).first()
            if default_resume_rule_set:
                jd.resume_rule_set_id = default_resume_rule_set.id

        # 设置为已发布状态
        jd.status = JDStatus.PUBLISHED.value
        jd.published_at = get_china_time()

        self.db.commit()
        self.db.refresh(jd)
        return jd

    async def async_publish_jd(self, jd_data: Dict[str, Any], user_id: int) -> JobDescription:
        """
        发布JD（异步版本）

        Args:
            jd_data: JD数据
            user_id: 用户ID

        Returns:
            发布的JD对象
        """
        # 检查是否是更新现有JD
        jd_id = jd_data.get('id')
        if jd_id:
            jd = self._get_editable_jd(jd_id, user_id)
            self._update_jd_fields(jd, jd_data)
        else:
            # 创建新JD
            jd = JobDescription(created_by=user_id)
            self._update_jd_fields(jd, jd_data)
            self.db.add(jd)

        # 提取硬性条件（异步调用LLM）
        if jd.hard_requirements:
            extracted_requirements = await self.hard_req_extractor.async_extract_hard_requirements(
                jd.hard_requirements
            )
            jd.extracted_hard_requirements = extracted_requirements
        else:
            jd.extracted_hard_requirements = None

        # 关联默认评分规则集（通用规则集）
        if not jd.interview_rule_set_id:
            default_interview_rule_set = self.db.query(EvaluationRuleSet).filter(
                EvaluationRuleSet.name == "通用面试评价标准",
                EvaluationRuleSet.type == "interview"
            ).first()
            if default_interview_rule_set:
                jd.interview_rule_set_id = default_interview_rule_set.id

        if not jd.resume_rule_set_id:
            default_resume_rule_set = self.db.query(EvaluationRuleSet).filter(
                EvaluationRuleSet.name == "通用简历评价标准",
                EvaluationRuleSet.type == "resume"
            ).first()
            if default_resume_rule_set:
                jd.resume_rule_set_id = default_resume_rule_set.id

        # 设置为已发布状态
        jd.status = JDStatus.PUBLISHED.value
        jd.published_at = get_china_time()

        self.db.commit()
        self.db.refresh(jd)
        return jd

    def update_jd(self, jd_id: int, jd_data: Dict[str, Any], user_id: int) -> JobDescription:
        """
        更新JD（编辑功能）

        Args:
            jd_id: JD ID
            jd_data: 更新的JD数据
            user_id: 用户ID

        Returns:
            更新后的JD对象
        """
        jd = self._get_editable_jd(jd_id, user_id)
        self._update_jd_fields(jd, jd_data)
        self.db.commit()
        self.db.refresh(jd)
        return jd

    def delete_jd(self, jd_id: int, user_id: int) -> bool:
        """
        删除JD（仅草稿状态可删除）

        Args:
            jd_id: JD ID
            user_id: 用户ID

        Returns:
            是否删除成功
        """
        jd = self.db.query(JobDescription).filter(
            JobDescription.id == jd_id,
            JobDescription.created_by == user_id
        ).first()

        if not jd:
            raise ValueError("JD不存在或无权限删除")

        if jd.status != JDStatus.DRAFT.value:
            raise ValueError("只能删除草稿状态的JD")

        self.db.delete(jd)
        self.db.commit()
        return True

    def close_jd(self, jd_id: int, user_id: int) -> JobDescription:
        """
        关闭JD（仅HR可操作）

        Args:
            jd_id: JD ID
            user_id: 用户ID

        Returns:
            关闭后的JD对象
        """
        # 检查用户权限
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user or user.role != UserRole.HR.value:
            raise ValueError("只有HR可以关闭JD")

        jd = self.db.query(JobDescription).filter(JobDescription.id == jd_id).first()
        if not jd:
            raise ValueError("JD不存在")

        if jd.status != JDStatus.PUBLISHED.value:
            raise ValueError("只能关闭已发布状态的JD")

        jd.status = JDStatus.CLOSED.value
        jd.closed_at = get_china_time()

        self.db.commit()
        self.db.refresh(jd)

        # TODO: 后续完善关闭JD后的相关流程变更逻辑

        return jd

    def get_jd_by_id(self, jd_id: int, user_id: int) -> Optional[JobDescription]:
        """
        根据ID获取JD详情

        Args:
            jd_id: JD ID
            user_id: 用户ID

        Returns:
            JD对象
        """
        self._get_user(user_id)

        jd = self.db.query(JobDescription).filter(JobDescription.id == jd_id).first()
        if not jd:
            return None

        if not self._can_user_view_jd(jd, user_id):
            raise ValueError("无权限查看此JD")

        return jd

    # ==================== JD查询相关 ====================

    def query_jd_list(
        self,
        user_id: int,
        keyword: Optional[str] = None,
        department: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """
        查询JD列表（带权限控制）

        Args:
            user_id: 用户ID
            keyword: 关键词（岗位名称/创建者）
            department: 所属部门（筛选条件）
            status: 状态（筛选条件）
            page: 页码
            page_size: 每页数量

        Returns:
            包含JD列表和分页信息的字典
        """
        self._get_user(user_id)

        # 构建基础查询
        query = self.db.query(JobDescription)

        # 所有人都可以看到所有已发布/已关闭的JD；草稿仅创建者可见
        query = query.filter(
            or_(
                JobDescription.status.in_([JDStatus.PUBLISHED.value, JDStatus.CLOSED.value]),
                and_(JobDescription.status == JDStatus.DRAFT.value, JobDescription.created_by == user_id)
            )
        )

        # 应用筛选条件
        if keyword and keyword.strip():
            keyword_like = f"%{keyword.strip()}%"
            query = query.join(User, JobDescription.created_by == User.id).filter(
                or_(
                    JobDescription.job_title.like(keyword_like),
                    User.real_name.like(keyword_like),
                    User.username.like(keyword_like)
                )
            )
        if department:
            dept = self.db.query(DepartmentModel).filter(DepartmentModel.name == department).first()
            if dept:
                query = query.filter(JobDescription.department_id == dept.id)
            else:
                query = query.filter(JobDescription.id == -1)  # 无匹配部门
        if status:
            query = query.filter(JobDescription.status == status)

        # 计算总数
        total = query.count()

        # 排序：先按状态排序（草稿和已发布在前，已关闭在后），再按更新时间倒序
        # 使用case语句给状态赋予排序权重：draft=1, published=1, closed=2
        from sqlalchemy import case
        status_order = case(
            (JobDescription.status == JDStatus.DRAFT.value, 1),
            (JobDescription.status == JDStatus.PUBLISHED.value, 1),
            (JobDescription.status == JDStatus.CLOSED.value, 2),
            else_=3
        )

        # 分页
        offset = (page - 1) * page_size
        jd_list = query.order_by(
            status_order.asc(),  # 先按状态排序（草稿和已发布在前）
            JobDescription.updated_at.desc()  # 再按更新时间倒序
        ).offset(offset).limit(page_size).all()

        # 格式化返回数据
        result = {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "items": [
                {
                    "id": jd.id,
                    "job_title": jd.job_title,
                    "department": jd.department_ref.name if jd.department_ref else jd.department,
                    "creator_id": jd.created_by,
                    "creator_name": jd.creator.real_name if jd.creator else None,
                    "created_at": jd.created_at.isoformat() if jd.created_at else None,
                    "updated_at": jd.updated_at.isoformat() if jd.updated_at else None,
                    "expected_onboard_date": jd.expected_onboard_date.isoformat() if jd.expected_onboard_date else None,
                    "status": jd.status,
                    "headcount": jd.headcount
                }
                for jd in jd_list
            ]
        }

        return result

    # ==================== 辅助方法 ====================

    def _update_jd_fields(self, jd: JobDescription, jd_data: Dict[str, Any]):
        """更新JD字段"""
        # 基本信息
        if 'job_title' in jd_data:
            jd.job_title = jd_data['job_title']
        if 'industry' in jd_data:
            jd.industry = jd_data['industry']
        if 'job_level' in jd_data:
            jd.job_level = jd_data['job_level']
        if 'department' in jd_data:
            jd.department = jd_data['department']
            # 同步设置 department_id
            dept = self.db.query(DepartmentModel).filter(DepartmentModel.name == jd_data['department']).first()
            if dept:
                jd.department_id = dept.id
        if 'salary_range' in jd_data:
            jd.salary_range = jd_data['salary_range']
        if 'headcount' in jd_data:
            jd.headcount = jd_data['headcount']
        if 'expected_onboard_date' in jd_data:
            if isinstance(jd_data['expected_onboard_date'], str) and jd_data['expected_onboard_date'].strip():
                jd.expected_onboard_date = datetime.fromisoformat(jd_data['expected_onboard_date'])
            elif jd_data['expected_onboard_date'] is None or (isinstance(jd_data['expected_onboard_date'], str) and not jd_data['expected_onboard_date'].strip()):
                jd.expected_onboard_date = None
            else:
                jd.expected_onboard_date = jd_data['expected_onboard_date']

        # 核心内容
        if 'job_responsibilities' in jd_data:
            jd.job_responsibilities = jd_data['job_responsibilities']
        if 'hard_requirements' in jd_data:
            jd.hard_requirements = jd_data['hard_requirements']
        if 'other_requirements' in jd_data:
            jd.other_requirements = jd_data['other_requirements']
