"""
人才储备服务层 - 处理人才储备的业务逻辑
"""
import threading
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_
from concurrent.futures import ThreadPoolExecutor, as_completed

from db.models import (
    TalentPool, Candidate, CandidateStageHistory, JobDescription, User,
    UserRole, CandidateStage, CandidateStageResult, DepartmentModel, get_china_time
)


class TalentPoolService:
    """人才储备服务类"""

    @staticmethod
    def add_to_talent_pool(
        db: Session,
        candidate_ids: List[int],
        user_id: int,
        remark: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        将候选人添加到人才储备库

        Args:
            db: 数据库会话
            candidate_ids: 候选人ID列表
            user_id: 操作用户ID（HR）
            remark: 入库备注

        Returns:
            添加结果
        """
        # 权限检查：只有HR可以操作
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.role != UserRole.HR.value:
            raise ValueError("只有HR可以添加人才到储备库")

        success_count = 0
        failed_count = 0
        failed_ids = []

        for candidate_id in candidate_ids:
            try:
                # 检查候选人是否存在
                candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
                if not candidate:
                    failed_count += 1
                    failed_ids.append(candidate_id)
                    continue

                # 检查是否已在人才储备库中
                existing = db.query(TalentPool).filter(
                    TalentPool.candidate_id == candidate_id
                ).first()
                if existing:
                    failed_count += 1
                    failed_ids.append(candidate_id)
                    continue

                # 添加到人才储备库
                talent_pool = TalentPool(
                    candidate_id=candidate_id,
                    jd_id=candidate.jd_id,
                    remark=remark,
                    created_by=user_id
                )
                db.add(talent_pool)
                success_count += 1

            except Exception as e:
                failed_count += 1
                failed_ids.append(candidate_id)

        db.commit()

        return {
            "total": len(candidate_ids),
            "success": success_count,
            "failed": failed_count,
            "failed_ids": failed_ids
        }

    @staticmethod
    def get_talent_pool_list(
        db: Session,
        user_id: int,
        keyword: Optional[str] = None,
        jd_id: Optional[int] = None,
        department: Optional[str] = None,
        jd_ids: Optional[str] = None,
        departments: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """
        查询人才储备库列表
        """
        # 构建查询
        query = db.query(TalentPool).join(Candidate).join(JobDescription)
        query = query.filter(
            or_(
                Candidate.created_at.is_(None),
                TalentPool.created_at.is_(None),
                Candidate.created_at <= TalentPool.created_at
            )
        )

        # 关键词筛选
        if keyword:
            query = query.filter(
                or_(
                    Candidate.name.like(f"%{keyword}%"),
                    JobDescription.job_title.like(f"%{keyword}%")
                )
            )

        # JD筛选（支持多选）
        jd_id_list = [int(j.strip()) for j in jd_ids.split(',') if j.strip()] if jd_ids else []
        if jd_id and not jd_id_list:
            jd_id_list = [jd_id]
        if jd_id_list:
            query = query.filter(TalentPool.jd_id.in_(jd_id_list))

        # 部门筛选（支持多选）
        dept_names = [d.strip() for d in departments.split(',') if d.strip()] if departments else []
        if department and not dept_names:
            dept_names = [department]
        if dept_names:
            dept_objs = db.query(DepartmentModel).filter(DepartmentModel.name.in_(dept_names)).all()
            if dept_objs:
                dept_ids = [d.id for d in dept_objs]
                query = query.filter(JobDescription.department_id.in_(dept_ids))
            else:
                query = query.filter(JobDescription.id == -1)

        # 总数
        total = query.count()

        # 分页
        offset = (page - 1) * page_size
        talent_pools = query.order_by(TalentPool.created_at.desc()).offset(offset).limit(page_size).all()

        # 构建返回数据
        items = []
        for tp in talent_pools:
            candidate = tp.candidate
            jd = tp.jd
            creator = tp.creator

            items.append({
                "id": tp.id,
                "candidate_id": candidate.id,
                "candidate_number": candidate.candidate_number,
                "candidate_name": candidate.name,
                "gender": candidate.gender,
                "age": candidate.age,
                "highest_education": candidate.highest_education,
                "school": candidate.school,
                "is_985": candidate.is_985,
                "is_211": candidate.is_211,
                "work_years": candidate.work_years,
                "expected_salary": candidate.expected_salary,
                "jd_id": jd.id if jd else None,
                "job_title": jd.job_title if jd else None,
                "department": (jd.department_ref.name if jd.department_ref else jd.department) if jd else None,
                "resume_upload_time": candidate.created_at.isoformat() if candidate.created_at else None,
                "ai_score_total": candidate.ai_score_total,
                "resume_file_path": candidate.resume_file_path,
                "remark": tp.remark,
                "created_by": creator.real_name if creator else None,
                "created_at": tp.created_at.isoformat() if tp.created_at else None
            })

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "items": items
        }

    @staticmethod
    def remove_from_talent_pool(
        db: Session,
        talent_pool_ids: List[int],
        user_id: int
    ) -> Dict[str, Any]:
        """
        从人才储备库删除

        Args:
            db: 数据库会话
            talent_pool_ids: 人才储备记录ID列表
            user_id: 操作用户ID

        Returns:
            删除结果
        """
        # 权限检查：只有HR可以操作
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.role != UserRole.HR.value:
            raise ValueError("只有HR可以从储备库删除人才")

        deleted_count = 0
        for tp_id in talent_pool_ids:
            tp = db.query(TalentPool).filter(TalentPool.id == tp_id).first()
            if tp:
                db.delete(tp)
                deleted_count += 1

        db.commit()

        return {
            "total": len(talent_pool_ids),
            "deleted": deleted_count
        }

    @staticmethod
    def restart_recruitment(
        db: Session,
        talent_pool_id: int,
        jd_id: int,
        screening_owner_id: int,
        user_id: int
    ) -> Dict[str, Any]:
        """
        重启招聘流程

        从人才储备库中选择候选人，创建新的候选人记录，进入简历筛选流程

        Args:
            db: 数据库会话
            talent_pool_id: 人才储备记录ID
            jd_id: 新的JD ID
            screening_owner_id: 简历筛选负责人ID
            user_id: 操作用户ID（HR）

        Returns:
            新创建的候选人信息
        """
        from services.candidate_service import CandidateService
        from services.todo_service import TodoService

        # 权限检查：只有HR可以操作
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.role != UserRole.HR.value:
            raise ValueError("只有HR可以重启招聘流程")

        # 获取人才储备记录
        talent_pool = db.query(TalentPool).filter(TalentPool.id == talent_pool_id).first()
        if not talent_pool:
            raise ValueError("人才储备记录不存在")

        # 获取原候选人信息
        old_candidate = talent_pool.candidate
        if not old_candidate:
            raise ValueError("候选人信息不存在")

        # 检查JD是否存在
        jd = db.query(JobDescription).filter(JobDescription.id == jd_id).first()
        if not jd:
            raise ValueError("JD不存在")

        # 检查负责人是否存在
        screening_owner = db.query(User).filter(User.id == screening_owner_id).first()
        if not screening_owner:
            raise ValueError("简历筛选负责人不存在")

        # 生成新的候选人序号
        candidate_service = CandidateService(db)
        new_candidate_number = candidate_service._generate_candidate_number()

        # 创建新的候选人记录（复制旧记录的基本信息）
        new_candidate = Candidate(
            candidate_number=new_candidate_number,
            jd_id=jd_id,
            created_by=user_id,
            resume_file_path=old_candidate.resume_file_path,  # 复用旧简历文件
            resume_text=old_candidate.resume_text,
            # 复制基本信息
            name=old_candidate.name,
            gender=old_candidate.gender,
            age=old_candidate.age,
            work_status=old_candidate.work_status,
            work_years=old_candidate.work_years,
            expected_salary=old_candidate.expected_salary,
            highest_education=old_candidate.highest_education,
            school=old_candidate.school,
            school_id=old_candidate.school_id,
            is_985=old_candidate.is_985,
            is_211=old_candidate.is_211,
            is_double_first_class=old_candidate.is_double_first_class,
            basic_info_json=old_candidate.basic_info_json,
            privacy_info=old_candidate.privacy_info,
            summary=old_candidate.summary,
            # 流程状态
            current_stage=CandidateStage.RESUME_SCREENING.value,
            current_stage_result=CandidateStageResult.PENDING.value,
            current_stage_owner=screening_owner_id,
            is_parsed=False  # 需要重新进行AI评估
        )
        db.add(new_candidate)
        db.commit()
        db.refresh(new_candidate)

        # 待办在简历解析完成后由 candidate_service 自动创建，此处不重复创建

        # 从人才储备库删除该记录
        db.delete(talent_pool)
        db.commit()

        # 异步进行AI评估（硬性条件评估和智能简历评分）
        TalentPoolService._process_candidate_async(new_candidate.id, jd)

        return {
            "new_candidate_id": new_candidate.id,
            "new_candidate_number": new_candidate_number,
            "message": "重启招聘流程成功，候选人已进入简历筛选环节"
        }

    @staticmethod
    def _process_candidate_async(candidate_id: int, jd: JobDescription):
        """
        异步处理候选人AI评估

        Args:
            candidate_id: 候选人ID
            jd: JD对象
        """
        # 提取JD信息
        jd_info = {
            'id': jd.id,
            'job_title': jd.job_title,
            'job_responsibilities': jd.job_responsibilities,
            'hard_requirements': jd.hard_requirements,
            'extracted_hard_requirements': jd.extracted_hard_requirements,
            'resume_rule_set_id': jd.resume_rule_set_id
        }

        def background_task():
            """后台执行的任务"""
            from db.database import SessionLocal
            from services.candidate_service import CandidateService

            db = SessionLocal()
            try:
                candidate_service = CandidateService(db)
                candidate_service._process_single_candidate(candidate_id, jd_info)
            except Exception as e:
                print(f"候选人AI评估失败: {str(e)}")
            finally:
                db.close()

        # 在后台线程中执行
        thread = threading.Thread(target=background_task, daemon=True)
        thread.start()
