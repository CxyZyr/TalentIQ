"""
数据库模型定义
"""
from datetime import datetime, timezone, timedelta
from enum import Enum
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Float, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

# 中国时区 (UTC+8)
CHINA_TZ = timezone(timedelta(hours=8))

def get_china_time():
    """获取中国时区的当前时间"""
    return datetime.now(CHINA_TZ)


class DepartmentModel(Base):
    """组织部门表"""
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)  # 部门名称
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True)  # 上级部门ID（None=顶级）
    sort_order = Column(Integer, default=0)  # 排序序号
    is_active = Column(Boolean, default=True)  # 是否启用
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)


class UserRole(str, Enum):
    """用户角色枚举"""
    INTERVIEWER = "面试官"
    HR = "HR"
    CEO = "CEO"


class JobLevel(str, Enum):
    """岗位级别枚举"""
    EXPERT = "专家"
    SENIOR = "高级"
    INTERMEDIATE = "中级"
    JUNIOR = "初级"


class JDStatus(str, Enum):
    """JD状态枚举"""
    DRAFT = "draft"  # 草稿
    PUBLISHED = "published"  # 已发布
    CLOSED = "closed"  # 已关闭


class CandidateStage(str, Enum):
    """候选人流程阶段枚举"""
    RESUME_SCREENING = "简历筛选"
    FIRST_INTERVIEW = "一面"
    SECOND_INTERVIEW = "二面"
    THIRD_INTERVIEW = "三面"
    SALARY_NEGOTIATION = "谈薪&背调"  # 包含谈薪、背调、offer、入职等
    TERMINATED = "终止流程"


class CandidateStageResult(str, Enum):
    """候选人阶段结果枚举"""
    PENDING = "待处理"
    PASSED = "通过"
    REJECTED = "不通过"


class TodoStatus(str, Enum):
    """待办状态枚举"""
    PENDING = "待处理"
    PROCESSED = "已处理"


class SalaryNegotiationStatus(str, Enum):
    """谈薪状态枚举"""
    PENDING = "待处理"
    IN_PROGRESS = "进行中"
    COMPLETED = "已完成"
    FAILED = "谈薪失败"


class BackgroundCheckStatus(str, Enum):
    """背调状态枚举"""
    PENDING = "待处理"
    IN_PROGRESS = "进行中"
    COMPLETED = "已完成"


class OfferStatus(str, Enum):
    """OFFER状态枚举"""
    TO_BE_ISSUED = "待发放"
    ISSUED = "已发放"
    SIGNED = "已回签"
    REJECTED = "已拒绝"
    ABANDONED = "自主放弃"


class WorkStatus(str, Enum):
    """工作状态枚举"""
    JOB_SEEKING = "求职中"
    RESIGNED = "离职"
    EMPLOYED = "在职"


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)  # 密码哈希
    role = Column(String(50), nullable=False)  # 面试官/HR/CEO

    # 扩展字段
    real_name = Column(String(100))  # 真实姓名
    phone = Column(String(20))  # 电话号码
    avatar = Column(String(500))  # 头像URL
    department = Column(String(100))  # 所属部门（旧字段，保留兼容）
    department_id = Column(Integer, ForeignKey("departments.id"))  # 所属部门ID
    job_title = Column(String(100))  # 职位
    is_active = Column(Boolean, default=True)  # 是否启用（禁用后不能登录）
    is_deleted = Column(Boolean, default=False)  # 是否删除（软删除，前端不显示）
    remark = Column(Text)  # 备注
    last_login_at = Column(DateTime)  # 最后登录时间

    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)

    # 关系
    department_ref = relationship("DepartmentModel", foreign_keys=[department_id])
    job_descriptions = relationship("JobDescription", back_populates="creator")


class JobDescription(Base):
    """职位描述(JD)表"""
    __tablename__ = "job_descriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 基本信息
    job_title = Column(String(200), nullable=False)  # 岗位名称（必填）
    industry = Column(String(100))  # 所属行业
    job_level = Column(String(50))  # 岗位级别
    department = Column(String(100), nullable=False)  # 所属部门（旧字段，保留兼容）
    department_id = Column(Integer, ForeignKey("departments.id"))  # 所属部门ID
    salary_range = Column(String(100))  # 薪资范围
    headcount = Column(Integer)  # 岗位人数
    expected_onboard_date = Column(DateTime)  # 期望到岗时间

    # 核心内容
    job_responsibilities = Column(Text)  # 岗位职责
    hard_requirements = Column(Text)  # 任职资格-硬性条件
    other_requirements = Column(Text)  # 任职资格-其他要求

    # 状态和关联
    status = Column(String(50), default=JDStatus.DRAFT.value, nullable=False)  # 状态
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # 创建人

    # 时间戳
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)
    published_at = Column(DateTime)  # 发布时间
    closed_at = Column(DateTime)  # 关闭时间

    # 评分规则集关联（默认关联通用规则集）
    interview_rule_set_id = Column(Integer, ForeignKey("evaluation_rule_sets.id"))
    resume_rule_set_id = Column(Integer, ForeignKey("evaluation_rule_sets.id"))

    # LLM提取的硬性条件（JSON格式存储）
    extracted_hard_requirements = Column(JSON)

    # 关系
    creator = relationship("User", back_populates="job_descriptions")
    department_ref = relationship("DepartmentModel", foreign_keys=[department_id])
    interview_rule_set = relationship("EvaluationRuleSet", foreign_keys=[interview_rule_set_id])
    resume_rule_set = relationship("EvaluationRuleSet", foreign_keys=[resume_rule_set_id])


class InterviewEvaluationRule(Base):
    """面试评分规则表"""
    __tablename__ = "interview_evaluation_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_set_id = Column(Integer, ForeignKey("evaluation_rule_sets.id"), nullable=False)  # 所属规则集
    dimension = Column(String(100))  # 维度（个人素养/工作能力）
    indicator_name = Column(String(200))  # 指标名称
    total_score = Column(Float)  # 指标总分
    is_bonus = Column(Boolean, default=False)  # 是否加分项
    level = Column(String(50))  # 等级
    description = Column(Text)  # 评分标准描述
    score_range = Column(String(50))  # 分数范围（原始字符串）
    score_min = Column(Float)  # 得分下限
    score_max = Column(Float)  # 得分上限
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)


class EvaluationRuleSet(Base):
    """评分规则集表"""
    __tablename__ = "evaluation_rule_sets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)  # 规则集名称（如：通用简历评价标准）
    type = Column(String(20), nullable=False)  # 规则类型：resume（简历）/ interview（面试）
    description = Column(Text)  # 规则集描述
    is_active = Column(Boolean, default=True)  # 是否启用
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)


class ResumeEvaluationRule(Base):
    """简历评分规则表"""
    __tablename__ = "resume_evaluation_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_set_id = Column(Integer, ForeignKey("evaluation_rule_sets.id"), nullable=False)  # 所属规则集
    dimension = Column(String(100))  # 维度
    indicator_name = Column(String(200))  # 指标名称
    total_score = Column(Float)  # 指标总分
    is_bonus = Column(Boolean, default=False)  # 是否为加分项
    level = Column(String(50))  # 等级
    description = Column(Text)  # 评分标准描述
    score_range = Column(String(50))  # 分数范围（原始字符串）
    score_min = Column(Float)  # 得分下限
    score_max = Column(Float)  # 得分上限
    notes = Column(String(500))  # 备注
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)


class School(Base):
    """学校表"""
    __tablename__ = "schools"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), unique=True, nullable=False)  # 学校名称
    is_double_first_class = Column(Boolean, default=True)  # 是否双一流（默认都是）
    is_985 = Column(Boolean, default=False)  # 是否985
    is_211 = Column(Boolean, default=False)  # 是否211
    disciplines = Column(Text)  # 双一流建设学科
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)


class Candidate(Base):
    """候选人表"""
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # 候选人序号（格式：YYYYMM-XXXX，如202601-0001）
    candidate_number = Column(String(20), unique=True)  # 候选人序号

    # 关联信息
    jd_id = Column(Integer, ForeignKey("job_descriptions.id"), nullable=False)  # 所属JD
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # 创建人（HR）

    # 简历信息
    resume_file_path = Column(String(500), nullable=False)  # 简历文件路径
    resume_text = Column(Text)  # 简历解析后的文本

    # 基础信息（AI提取）
    name = Column(String(100))  # 姓名
    gender = Column(String(10))  # 性别
    age = Column(Integer)  # 年龄
    work_status = Column(String(50))  # 工作状态（求职中/离职/在职）
    work_years = Column(Integer)  # 工作年限
    expected_salary = Column(String(100))  # 期望薪资
    highest_education = Column(String(50))  # 最高学历
    school = Column(String(200))  # 学校（最高学历对应的）
    school_id = Column(Integer, ForeignKey("schools.id"))  # 学校ID（关联学校表）
    is_985 = Column(Boolean)  # 是否985
    is_211 = Column(Boolean)  # 是否211
    is_double_first_class = Column(Boolean)  # 是否双一流
    basic_info_json = Column(JSON)  # 基础信息原始JSON

    # 隐私信息（只有HR可编辑，HR和CEO可查看）
    privacy_info = Column(Text)  # 隐私信息

    # 基本概况（AI提取，300字以内）
    summary = Column(Text)  # 与岗位相关的技能基本概况

    # 硬性条件评估（AI评估）
    hard_requirements_assessment = Column(JSON)  # 硬性条件评估结果（JSON格式）
    hard_requirements_passed = Column(Boolean)  # 硬性条件是否通过

    # AI智能评分
    ai_score_detail = Column(JSON)  # AI评分详细结果（JSON格式）
    ai_score_main = Column(Float)  # 主要得分
    ai_score_bonus = Column(Float)  # 加分项得分
    ai_score_total = Column(Float)  # 总得分

    # 当前流程状态
    current_stage = Column(String(50), default=CandidateStage.RESUME_SCREENING.value)  # 当前阶段
    current_stage_result = Column(String(50), default=CandidateStageResult.PENDING.value)  # 当前阶段结果
    current_stage_owner = Column(Integer, ForeignKey("users.id"))  # 当前阶段负责人

    # 解析状态
    is_parsed = Column(Boolean, default=False)  # 是否解析完成
    parse_error = Column(Text)  # 解析错误信息

    # 时间戳
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)

    # 关系
    jd = relationship("JobDescription")
    creator = relationship("User", foreign_keys=[created_by])
    stage_owner = relationship("User", foreign_keys=[current_stage_owner])
    stage_history = relationship("CandidateStageHistory", back_populates="candidate")


class CandidateStageHistory(Base):
    """候选人流程历史表"""
    __tablename__ = "candidate_stage_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)  # 候选人ID

    # 流程信息
    stage = Column(String(50), nullable=False)  # 阶段
    stage_result = Column(String(50))  # 阶段结果
    stage_owner = Column(Integer, ForeignKey("users.id"))  # 阶段负责人
    next_stage = Column(String(50))  # 下一阶段
    next_stage_owner = Column(Integer, ForeignKey("users.id"))  # 下一阶段负责人

    # 评价信息
    comments = Column(Text)  # 评价意见
    rejection_reason = Column(Text)  # 淘汰原因（不通过时必填）
    termination_reason = Column(Text)  # 终止流程原因（终止时必填）
    is_abnormal_terminated = Column(Boolean, default=False)  # 异常终止标记（HR主动终止时为True）
    interview_evaluation_id = Column(Integer, ForeignKey("interview_evaluations.id"))  # 面试评价ID（面试阶段关联）
    attachments = Column(JSON)  # 附件（如面试记录等）

    # 时间戳
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)

    # 关系
    candidate = relationship("Candidate", back_populates="stage_history")
    owner = relationship("User", foreign_keys=[stage_owner])
    next_owner = relationship("User", foreign_keys=[next_stage_owner])
    interview_evaluation = relationship("InterviewEvaluation", foreign_keys=[interview_evaluation_id])


class InterviewQuestion(Base):
    """面试问题表"""
    __tablename__ = "interview_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)  # 候选人ID
    stage = Column(String(50), nullable=False)  # 面试阶段（一面/二面/三面）

    # 面试问题（JSON格式）
    questions = Column(JSON, nullable=False)  # 问题列表，包含question、reason、priority

    # 生成问题时的上下文信息
    jd_content = Column(Text)  # JD内容
    resume_content = Column(Text)  # 简历内容
    previous_interview_qa = Column(JSON)  # 上一轮面试问答（如果有）

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # 创建人
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)

    # 关系
    candidate = relationship("Candidate")
    creator = relationship("User")


class InterviewRecording(Base):
    """面试录音记录表"""
    __tablename__ = "interview_recordings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)  # 候选人ID
    stage = Column(String(50), nullable=False)  # 面试阶段（一面/二面/三面）

    # 录音文件信息
    recording_file_path = Column(String(500))  # 录音文件路径
    duration = Column(Integer)  # 录音时长（秒）

    # ASR转录结果
    transcript_text = Column(Text)  # 转录文本
    transcript_status = Column(String(20), default="pending")  # 转录状态：pending/processing/completed/failed

    # AI提取的面试问答
    extracted_qa = Column(JSON)  # 提取的问题和答案

    # AI面试评价
    interview_evaluation = Column(JSON)  # 面试评分详情
    interview_score_main = Column(Float)  # 主要得分
    interview_score_bonus = Column(Float)  # 加分项得分
    interview_score_total = Column(Float)  # 总得分

    # AI综合评价（新增）
    comprehensive_evaluation = Column(Text)  # 综合评价
    strengths = Column(Text)  # 优势
    weaknesses = Column(Text)  # 劣势

    interviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # 面试官ID
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)

    # 关系
    candidate = relationship("Candidate")
    interviewer = relationship("User")


class CandidateTodo(Base):
    """候选人待办表"""
    __tablename__ = "candidate_todos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)  # 候选人ID
    stage = Column(String(50), nullable=False)  # 当前阶段（简历筛选/一面/二面/三面/谈薪&背调）
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # 负责人ID
    status = Column(String(20), default=TodoStatus.PENDING.value, nullable=False)  # 待办状态（待处理/已处理）

    # 时间戳
    created_at = Column(DateTime, default=get_china_time)
    processed_at = Column(DateTime)  # 处理时间

    # 关系
    candidate = relationship("Candidate")
    owner = relationship("User")


class InterviewEvaluation(Base):
    """面试评价表（人工评分）"""
    __tablename__ = "interview_evaluations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)  # 候选人ID
    recording_id = Column(Integer, ForeignKey("interview_recordings.id"))  # 录音记录ID（可选）
    stage = Column(String(50), nullable=False)  # 面试阶段（一面/二面/三面）

    # 面试时间（必填，用户手动填写）
    interview_time = Column(DateTime, nullable=False)  # 面试时间

    # 第一部分：个人素养（20分）
    motivation_score = Column(Float, default=0)  # 求职动机得分（0-5）
    communication_score = Column(Float, default=0)  # 沟通能力得分（0-5）
    responsibility_score = Column(Float, default=0)  # 责任心得分（0-5）
    stability_score = Column(Float, default=0)  # 职业稳定性得分（0-5）
    personal_quality_total = Column(Float, default=0)  # 个人素养总分（0-20，自动计算）

    # 第二部分：工作能力（80分）
    work_ability_score = Column(Float, nullable=False)  # 工作能力得分（0-80，必填，可引用AI总分）
    is_ai_referenced = Column(Boolean, default=False)  # 是否引用AI评分

    # 总分（100分）
    total_score = Column(Float, default=0)  # 总分（个人素养20分+工作能力80分=100分，自动计算）

    # 面试结论
    conclusion = Column(String(20), nullable=False)  # 面试结论（通过/不通过）
    comments = Column(Text)  # 面试评价（可选）

    # 元数据
    evaluator_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # 评价人ID
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)

    # 关系
    candidate = relationship("Candidate")
    recording = relationship("InterviewRecording")
    evaluator = relationship("User")


class SalaryNegotiation(Base):
    """谈薪&背调表"""
    __tablename__ = "salary_negotiations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)  # 候选人ID

    # 谈薪状态（必填）
    salary_status = Column(String(20), nullable=False, default=SalaryNegotiationStatus.PENDING.value)  # 谈薪状态

    # 背调状态（必填）
    background_check_status = Column(String(20), nullable=False, default=BackgroundCheckStatus.PENDING.value)  # 背调状态
    background_report_path = Column(String(500))  # 背调报告文件路径（必填）

    # OFFER状态（必填）
    offer_status = Column(String(20), nullable=False, default=OfferStatus.TO_BE_ISSUED.value)  # OFFER状态

    # 是否入职（必填）
    is_onboarded = Column(Boolean, nullable=False, default=False)  # 是否入职

    # 操作人
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # 创建人
    updated_by = Column(Integer, ForeignKey("users.id"))  # 最后更新人

    # 时间戳
    created_at = Column(DateTime, default=get_china_time)
    updated_at = Column(DateTime, default=get_china_time, onupdate=get_china_time)
    submitted_at = Column(DateTime)  # 提交时间

    # 关系
    candidate = relationship("Candidate")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])


class TalentPool(Base):
    """人才储备表"""
    __tablename__ = "talent_pool"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)  # 候选人ID
    jd_id = Column(Integer, ForeignKey("job_descriptions.id"), nullable=False)  # 当时应聘的JD ID

    # 备注/入库原因
    remark = Column(Text)  # 入库备注

    # 创建信息
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # 创建人（HR）
    created_at = Column(DateTime, default=get_china_time)

    # 关系
    candidate = relationship("Candidate")
    jd = relationship("JobDescription")
    creator = relationship("User", foreign_keys=[created_by])
