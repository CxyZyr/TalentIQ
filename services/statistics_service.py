"""
数据统计服务
"""
from datetime import datetime
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from db.models import (
    User, UserRole, Candidate, CandidateStageHistory,
    CandidateTodo, JobDescription,
    TodoStatus, OfferStatus, DepartmentModel,
    ResumeEvaluationRule, InterviewEvaluation
)
from db.salary_negotiation_queries import get_latest_salary_negotiation_subquery
from typing import Optional, Dict, List, Any


class StatisticsService:
    """数据统计服务类"""

    @staticmethod
    def _get_default_date_range():
        """获取默认时间范围（当年）"""
        now = datetime.now()
        start_date = datetime(now.year, 1, 1)
        end_date = now
        return start_date, end_date

    @staticmethod
    def _get_related_candidate_ids(db: Session, user_id: int, user_role: str) -> Optional[List[int]]:
        """
        获取与用户相关的候选人ID列表

        Args:
            db: 数据库会话
            user_id: 用户ID
            user_role: 用户角色

        Returns:
            候选人ID列表，如果是HR/CEO则返回None（表示不过滤）
        """
        if user_role in [UserRole.HR.value, UserRole.CEO.value]:
            # HR和CEO可以看到所有候选人
            return None
        else:
            # 面试官只能看到相关候选人
            # 从历史记录中查找
            related_ids = db.query(CandidateStageHistory.candidate_id).filter(
                or_(
                    CandidateStageHistory.stage_owner == user_id,
                    CandidateStageHistory.next_stage_owner == user_id
                )
            ).distinct().all()
            ids = [cid[0] for cid in related_ids]
            # 同时包含当前阶段负责人是该用户的候选人
            current_owner_ids = db.query(Candidate.id).filter(
                Candidate.current_stage_owner == user_id
            ).all()
            ids.extend([cid[0] for cid in current_owner_ids])
            return list(set(ids))

    @staticmethod
    def _apply_filters(
        db,
        query,
        candidate_ids: Optional[List[int]],
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        jd_id: Optional[int],
        department: Optional[str],
        jd_ids: Optional[str] = None,
        departments: Optional[str] = None,
        uploader_ids: Optional[str] = None
    ):
        """
        应用筛选条件

        Args:
            query: 查询对象
            candidate_ids: 候选人ID列表（None表示不过滤）
            start_date: 开始日期
            end_date: 结束日期
            jd_id: 职位ID
            department: 部门
            jd_ids: 多个职位ID（逗号分隔）
            departments: 多个部门（逗号分隔）

        Returns:
            应用筛选后的查询对象
        """
        # 候选人ID过滤
        if candidate_ids is not None:
            if len(candidate_ids) == 0:
                # 如果没有相关候选人，返回空结果
                query = query.filter(Candidate.id == -1)
            else:
                query = query.filter(Candidate.id.in_(candidate_ids))

        # 时间过滤（简历上传时间）
        if start_date:
            query = query.filter(Candidate.created_at >= start_date)
        if end_date:
            # 包含结束日期当天的所有数据
            end_datetime = datetime.combine(end_date.date(), datetime.max.time())
            query = query.filter(Candidate.created_at <= end_datetime)

        # 职位过滤（支持多选）
        jd_id_list = [int(j.strip()) for j in jd_ids.split(',') if j.strip()] if jd_ids else []
        if jd_id and not jd_id_list:
            jd_id_list = [jd_id]
        if jd_id_list:
            query = query.filter(Candidate.jd_id.in_(jd_id_list))

        # 部门过滤（支持多选）
        from db.models import DepartmentModel
        dept_names = [d.strip() for d in departments.split(',') if d.strip()] if departments else []
        if department and not dept_names:
            dept_names = [department]
        if dept_names:
            dept_objs = db.query(DepartmentModel).filter(DepartmentModel.name.in_(dept_names)).all()
            if dept_objs:
                dept_ids = [d.id for d in dept_objs]
                query = query.join(JobDescription).filter(JobDescription.department_id.in_(dept_ids))
            else:
                query = query.filter(Candidate.id == -1)

        # 负责HR（简历上传人 created_by）过滤（支持多选，逗号分隔）
        uploader_id_list = [int(u.strip()) for u in uploader_ids.split(',') if u.strip()] if uploader_ids else []
        if uploader_id_list:
            query = query.filter(Candidate.created_by.in_(uploader_id_list))

        return query

    @staticmethod
    def get_recruitment_funnel(
        db: Session,
        user_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        jd_id: Optional[int] = None,
        department: Optional[str] = None,
        jd_ids: Optional[str] = None,
        departments: Optional[str] = None,
        uploader_ids: Optional[str] = None
    ) -> Dict[str, int]:
        """
        获取招聘漏斗数据

        Args:
            db: 数据库会话
            user_id: 当前用户ID
            start_date: 开始日期（可选）
            end_date: 结束日期（可选）
            jd_id: 职位ID（可选）
            department: 部门（可选）

        Returns:
            招聘漏斗数据
        """
        # 1. 获取用户信息
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"用户不存在: {user_id}")

        # 2. 获取相关候选人ID
        candidate_ids = StatisticsService._get_related_candidate_ids(db, user_id, user.role)

        # 3. 设置默认时间范围
        if not start_date or not end_date:
            start_date, end_date = StatisticsService._get_default_date_range()

        # 4. 构建基础查询
        base_query = db.query(Candidate)
        base_query = StatisticsService._apply_filters(
            db, base_query, candidate_ids, start_date, end_date, jd_id, department, jd_ids, departments, uploader_ids
        )

        # 5. 统计总简历数
        total_resumes = base_query.count()

        # 6. 获取候选人ID列表（用于后续查询）
        filtered_candidate_ids = [c.id for c in base_query.all()]

        # 如果没有候选人，直接返回全0
        if not filtered_candidate_ids:
            return {
                "total_resumes": 0,
                "resume_passed": 0,
                "first_interview_passed": 0,
                "second_interview_passed": 0,
                "offer_issued": 0,
                "onboarded": 0
            }

        # 7. 统计简历筛选通过数
        resume_passed = db.query(CandidateStageHistory).filter(
            CandidateStageHistory.candidate_id.in_(filtered_candidate_ids),
            CandidateStageHistory.stage == "简历筛选",
            CandidateStageHistory.stage_result == "通过"
        ).count()

        # 8. 统计一面通过数
        first_interview_passed = db.query(CandidateStageHistory).filter(
            CandidateStageHistory.candidate_id.in_(filtered_candidate_ids),
            CandidateStageHistory.stage == "一面",
            CandidateStageHistory.stage_result == "通过"
        ).count()

        # 9. 统计二面通过数
        second_interview_passed = db.query(CandidateStageHistory).filter(
            CandidateStageHistory.candidate_id.in_(filtered_candidate_ids),
            CandidateStageHistory.stage == "二面",
            CandidateStageHistory.stage_result == "通过"
        ).count()

        # 10. 统计OFFER发放数
        latest_salary_negotiation = get_latest_salary_negotiation_subquery(db)

        offer_issued = db.query(latest_salary_negotiation.c.candidate_id).filter(
            latest_salary_negotiation.c.candidate_id.in_(filtered_candidate_ids),
            latest_salary_negotiation.c.offer_status.in_([
                OfferStatus.ISSUED.value,
                OfferStatus.SIGNED.value,
                OfferStatus.REJECTED.value,
                OfferStatus.ABANDONED.value
            ])
        ).count()

        # 11. 统计已入职数
        onboarded = db.query(latest_salary_negotiation.c.candidate_id).filter(
            latest_salary_negotiation.c.candidate_id.in_(filtered_candidate_ids),
            latest_salary_negotiation.c.is_onboarded == True
        ).count()

        return {
            "total_resumes": total_resumes,
            "resume_passed": resume_passed,
            "first_interview_passed": first_interview_passed,
            "second_interview_passed": second_interview_passed,
            "offer_issued": offer_issued,
            "onboarded": onboarded
        }

    @staticmethod
    def get_conversion_rates(
        db: Session,
        user_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        jd_id: Optional[int] = None,
        department: Optional[str] = None,
        jd_ids: Optional[str] = None,
        departments: Optional[str] = None,
        uploader_ids: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        获取转化率分析数据

        Args:
            db: 数据库会话
            user_id: 当前用户ID
            start_date: 开始日期（可选）
            end_date: 结束日期（可选）
            jd_id: 职位ID（可选）
            department: 部门（可选）

        Returns:
            转化率分析数据
        """
        # 1. 获取招聘漏斗数据
        funnel_data = StatisticsService.get_recruitment_funnel(
            db, user_id, start_date, end_date, jd_id, department, jd_ids, departments, uploader_ids
        )

        # 2. 获取用户信息
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"用户不存在: {user_id}")

        # 3. 获取相关候选人ID
        candidate_ids = StatisticsService._get_related_candidate_ids(db, user_id, user.role)

        # 4. 设置默认时间范围
        if not start_date or not end_date:
            start_date, end_date = StatisticsService._get_default_date_range()

        # 5. 构建基础查询
        base_query = db.query(Candidate)
        base_query = StatisticsService._apply_filters(
            db, base_query, candidate_ids, start_date, end_date, jd_id, department, jd_ids, departments, uploader_ids
        )

        # 6. 获取候选人ID列表
        filtered_candidate_ids = [c.id for c in base_query.all()]

        # 7. 统计进入各面试环节的人数（去重候选人数）
        def count_stage_entered(stage: str) -> int:
            return db.query(func.count(func.distinct(CandidateTodo.candidate_id))).filter(
                CandidateTodo.candidate_id.in_(filtered_candidate_ids),
                CandidateTodo.stage == stage
            ).scalar() or 0

        def count_stage_passed(stage: str) -> int:
            return db.query(func.count(func.distinct(CandidateStageHistory.candidate_id))).filter(
                CandidateStageHistory.candidate_id.in_(filtered_candidate_ids),
                CandidateStageHistory.stage == stage,
                CandidateStageHistory.stage_result == "通过"
            ).scalar() or 0

        first_interview_entered = count_stage_entered("一面")
        second_interview_entered = count_stage_entered("二面")
        third_interview_entered = count_stage_entered("三面")

        first_interview_passed = count_stage_passed("一面")
        second_interview_passed = count_stage_passed("二面")
        third_interview_passed = count_stage_passed("三面")

        # 8. 统计各类 OFFER 状态，用于转化率计算
        offer_status_counts = {
            OfferStatus.TO_BE_ISSUED.value: 0,
            OfferStatus.ISSUED.value: 0,
            OfferStatus.SIGNED.value: 0,
            OfferStatus.REJECTED.value: 0,
            OfferStatus.ABANDONED.value: 0,
        }
        if filtered_candidate_ids:
            latest_salary_negotiation = get_latest_salary_negotiation_subquery(db)
            rows = db.query(
                latest_salary_negotiation.c.offer_status,
                func.count(latest_salary_negotiation.c.id)
            ).filter(
                latest_salary_negotiation.c.candidate_id.in_(filtered_candidate_ids),
                latest_salary_negotiation.c.offer_status.in_(list(offer_status_counts.keys()))
            ).group_by(latest_salary_negotiation.c.offer_status).all()

            for offer_status, count in rows:
                if offer_status in offer_status_counts:
                    offer_status_counts[offer_status] = count

        offer_pending = offer_status_counts[OfferStatus.TO_BE_ISSUED.value]
        offer_issued = offer_status_counts[OfferStatus.ISSUED.value]
        offer_signed = offer_status_counts[OfferStatus.SIGNED.value]
        offer_rejected = offer_status_counts[OfferStatus.REJECTED.value]
        offer_abandoned = offer_status_counts[OfferStatus.ABANDONED.value]

        offer_accept_denominator = (
            offer_pending + offer_issued + offer_signed + offer_rejected + offer_abandoned
        )
        onboard_denominator = (
            offer_issued + offer_signed + offer_rejected + offer_abandoned
        )

        # 9. 计算转化率（处理除零情况）
        def safe_divide(numerator, denominator):
            return round(numerator / denominator * 100, 2) if denominator > 0 else 0.0

        return {
            "resume_pass_rate": safe_divide(funnel_data["resume_passed"], funnel_data["total_resumes"]),
            "first_interview_pass_rate": safe_divide(first_interview_passed, first_interview_entered),
            "second_interview_pass_rate": safe_divide(second_interview_passed, second_interview_entered),
            "third_interview_pass_rate": safe_divide(third_interview_passed, third_interview_entered),
            "offer_accept_rate": safe_divide(
                offer_signed + offer_abandoned + offer_rejected,
                offer_accept_denominator
            ),
            "onboard_rate": safe_divide(funnel_data["onboarded"], onboard_denominator),
            "base_data": {
                "total_resumes": funnel_data["total_resumes"],
                "resume_passed": funnel_data["resume_passed"],
                "first_interview_entered": first_interview_entered,
                "first_interview_passed": first_interview_passed,
                "second_interview_entered": second_interview_entered,
                "second_interview_passed": second_interview_passed,
                "third_interview_entered": third_interview_entered,
                "third_interview_passed": third_interview_passed,
                "offer_pending": offer_pending,
                "offer_issued": offer_issued,
                "offer_signed": offer_signed,
                "offer_rejected": offer_rejected,
                "offer_abandoned": offer_abandoned,
                "offer_accept_denominator": offer_accept_denominator,
                "onboard_denominator": onboard_denominator,
                "onboarded": funnel_data["onboarded"]
            }
        }

    @staticmethod
    def _batch_candidate_score_max(db: Session, candidate_ids: List[int]) -> Dict[int, float]:
        """
        批量计算候选人的AI简历评分满分（candidate_id -> total_score_max）

        因各JD使用的评分规则集不同、满分不一，需按JD对应规则集聚合。
        算法与 todo_service 中批量满分预计算保持一致，用于把AI绝对分换算为得分率。
        """
        score_max_map: Dict[int, float] = {}
        if not candidate_ids:
            return score_max_map

        # candidate -> jd_id
        candidate_jd_map = {
            c_id: jd_id
            for c_id, jd_id in db.query(Candidate.id, Candidate.jd_id)
            .filter(Candidate.id.in_(candidate_ids)).all()
        }

        # jd -> resume_rule_set_id
        unique_jd_ids = set(jd_id for jd_id in candidate_jd_map.values() if jd_id)
        jd_rule_set_map = {}
        if unique_jd_ids:
            jd_rule_set_map = {
                jd_id: rs_id
                for jd_id, rs_id in db.query(
                    JobDescription.id, JobDescription.resume_rule_set_id
                ).filter(JobDescription.id.in_(unique_jd_ids)).all()
            }

        unique_rule_set_ids = set(rs for rs in jd_rule_set_map.values() if rs is not None)

        # rule_set -> total_score_max（主项满分 + 加分项满分，按指标名去重后求和）
        rule_set_score_map = {}
        if unique_rule_set_ids:
            main_scores = db.query(
                ResumeEvaluationRule.rule_set_id,
                ResumeEvaluationRule.indicator_name,
                func.max(ResumeEvaluationRule.total_score).label('max_score')
            ).filter(
                and_(
                    ResumeEvaluationRule.rule_set_id.in_(unique_rule_set_ids),
                    ResumeEvaluationRule.is_bonus == False
                )
            ).group_by(
                ResumeEvaluationRule.rule_set_id,
                ResumeEvaluationRule.indicator_name
            ).all()

            bonus_scores = db.query(
                ResumeEvaluationRule.rule_set_id,
                ResumeEvaluationRule.indicator_name,
                func.max(ResumeEvaluationRule.total_score).label('max_score')
            ).filter(
                and_(
                    ResumeEvaluationRule.rule_set_id.in_(unique_rule_set_ids),
                    ResumeEvaluationRule.is_bonus == True
                )
            ).group_by(
                ResumeEvaluationRule.rule_set_id,
                ResumeEvaluationRule.indicator_name
            ).all()

            main_sum = defaultdict(float)
            for row in main_scores:
                main_sum[row.rule_set_id] += (row.max_score or 0)
            bonus_sum = defaultdict(float)
            for row in bonus_scores:
                bonus_sum[row.rule_set_id] += (row.max_score or 0)

            for rs_id in unique_rule_set_ids:
                rule_set_score_map[rs_id] = main_sum.get(rs_id, 100) + bonus_sum.get(rs_id, 20)

        for c_id, jd_id in candidate_jd_map.items():
            rs_id = jd_rule_set_map.get(jd_id)
            if rs_id and rs_id in rule_set_score_map:
                score_max_map[c_id] = rule_set_score_map[rs_id]
            else:
                score_max_map[c_id] = 120  # 默认满分，与 todo_service 保持一致

        return score_max_map

    @staticmethod
    def _normalize_education(edu: Optional[str]) -> str:
        """学历归一化到标准桶"""
        if not edu or not edu.strip():
            return "其他"
        e = edu.strip()
        if "博士" in e:
            return "博士"
        if "硕士" in e or "研究生" in e:
            return "硕士"
        if "本科" in e or "学士" in e:
            return "本科"
        if "大专" in e or "专科" in e or "高职" in e:
            return "大专"
        if "高中" in e or "中专" in e or "职高" in e or "技校" in e:
            return "高中及以下"
        return "其他"

    @staticmethod
    def _normalize_work_status(ws: Optional[str]) -> str:
        """工作状态归一化到标准桶"""
        if not ws or not ws.strip():
            return "未知"
        s = ws.strip()
        if "在校" in s or "应届" in s:
            return "在校/应届"
        if "离职" in s:
            return "离职"
        if "在职" in s:
            return "在职"
        if "求职" in s or "找工作" in s:
            return "求职中"
        return "其他"

    @staticmethod
    def get_candidate_profile(
        db: Session,
        user_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        jd_id: Optional[int] = None,
        department: Optional[str] = None,
        jd_ids: Optional[str] = None,
        departments: Optional[str] = None,
        uploader_ids: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        获取候选人画像统计（AI得分分布、学历分布、名校占比、人口结构）

        权限与筛选规则与招聘漏斗一致：
        - HR/CEO 可见全部；面试官仅见相关候选人
        - 支持按时间/职位/部门筛选

        返回：
        - total: 参与统计的候选人总数
        - ai_score: {scored_count, avg_rate, buckets[{range,count}]}（按得分率分桶）
        - education: [{name,count}]
        - top_school: {is_985, is_211, is_double_first_class, total}
        - demographics: {work_status[], work_years[], gender[], age[]}
        """
        # 1. 用户与权限
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"用户不存在: {user_id}")
        candidate_ids = StatisticsService._get_related_candidate_ids(db, user_id, user.role)

        # 2. 默认时间范围
        if not start_date or not end_date:
            start_date, end_date = StatisticsService._get_default_date_range()

        # 3. 过滤候选人
        base_query = db.query(Candidate)
        base_query = StatisticsService._apply_filters(
            db, base_query, candidate_ids, start_date, end_date, jd_id, department, jd_ids, departments, uploader_ids
        )
        candidates = base_query.all()
        total = len(candidates)

        # 统一的空结构（无候选人时返回，前端可直接渲染空态）
        if total == 0:
            return {
                "total": 0,
                "ai_score": {
                    "scored_count": 0,
                    "avg_score": 0.0,
                    "buckets": [
                        {"range": "<60", "count": 0},
                        {"range": "60-70", "count": 0},
                        {"range": "70-80", "count": 0},
                        {"range": "80-90", "count": 0},
                        {"range": "≥90", "count": 0},
                    ],
                },
                "education": [],
                "top_school": {"is_985": 0, "is_211": 0, "is_double_first_class": 0, "total": 0},
                "school_tier": [],
                "trend": [],
                "job_ranking": [],
                "stage_dist": [],
                "interview_scores": {
                    "first": {"avg": None, "count": 0},
                    "second": {"avg": None, "count": 0},
                    "third": {"avg": None, "count": 0},
                },
                "demographics": {"work_status": [], "work_years": [], "gender": [], "age": []},
            }

        # 4. AI得分分布（按AI原始总分绝对分分桶；未评分或0分不计入）
        cand_id_list = [c.id for c in candidates]
        bucket_labels = ["<60", "60-70", "70-80", "80-90", "≥90"]
        bucket_counts = [0, 0, 0, 0, 0]
        score_sum = 0.0
        scored_count = 0
        for c in candidates:
            score = c.ai_score_total
            if score is None or score <= 0:
                continue
            scored_count += 1
            score_sum += score
            if score < 60:
                bucket_counts[0] += 1
            elif score < 70:
                bucket_counts[1] += 1
            elif score < 80:
                bucket_counts[2] += 1
            elif score < 90:
                bucket_counts[3] += 1
            else:
                bucket_counts[4] += 1
        ai_score = {
            "scored_count": scored_count,
            "avg_score": round(score_sum / scored_count, 1) if scored_count else 0.0,
            "buckets": [{"range": bucket_labels[i], "count": bucket_counts[i]} for i in range(5)],
        }

        # 5. 学历分布（归一化，仅输出非空桶，按标准顺序）
        edu_order = ["博士", "硕士", "本科", "大专", "高中及以下", "其他"]
        edu_counter = defaultdict(int)
        for c in candidates:
            edu_counter[StatisticsService._normalize_education(c.highest_education)] += 1
        education = [{"name": k, "count": edu_counter[k]} for k in edu_order if edu_counter[k] > 0]

        # 6. 名校占比（None 视为否）
        top_school = {
            "is_985": sum(1 for c in candidates if c.is_985),
            "is_211": sum(1 for c in candidates if c.is_211),
            "is_double_first_class": sum(1 for c in candidates if c.is_double_first_class),
            "total": total,
        }

        # 7. 人口结构
        # 7.1 工作状态
        ws_order = ["在职", "离职", "求职中", "在校/应届", "其他", "未知"]
        ws_counter = defaultdict(int)
        for c in candidates:
            ws_counter[StatisticsService._normalize_work_status(c.work_status)] += 1
        work_status = [{"name": k, "count": ws_counter[k]} for k in ws_order if ws_counter[k] > 0]

        # 7.2 工作年限（固定分桶，保留全部区间便于柱状图刻度）
        wy_labels = ["应届(0年)", "1-3年", "3-5年", "5-10年", "10年以上"]
        wy_counts = [0, 0, 0, 0, 0]
        for c in candidates:
            wy = c.work_years
            if wy is None:
                continue
            if wy < 1:
                wy_counts[0] += 1
            elif wy < 3:
                wy_counts[1] += 1
            elif wy < 5:
                wy_counts[2] += 1
            elif wy < 10:
                wy_counts[3] += 1
            else:
                wy_counts[4] += 1
        work_years = [{"range": wy_labels[i], "count": wy_counts[i]} for i in range(5)]

        # 7.3 性别
        gender_counter = defaultdict(int)
        for c in candidates:
            g = (c.gender or "").strip()
            if g in ("男", "女"):
                gender_counter[g] += 1
            else:
                gender_counter["未知"] += 1
        gender = [{"name": k, "count": gender_counter[k]} for k in ["男", "女", "未知"] if gender_counter[k] > 0]

        # 7.4 年龄（固定分桶）
        age_labels = ["25岁以下", "25-30岁", "30-35岁", "35-40岁", "40岁以上"]
        age_counts = [0, 0, 0, 0, 0]
        for c in candidates:
            age = c.age
            if age is None or age <= 0:
                continue
            if age < 25:
                age_counts[0] += 1
            elif age < 30:
                age_counts[1] += 1
            elif age < 35:
                age_counts[2] += 1
            elif age < 40:
                age_counts[3] += 1
            else:
                age_counts[4] += 1
        age_dist = [{"range": age_labels[i], "count": age_counts[i]} for i in range(5)]

        # 8. 院校层次分布（互斥，按最高层次归类）
        tier_985 = tier_211 = tier_dfc = tier_normal = 0
        for c in candidates:
            if c.is_985:
                tier_985 += 1
            elif c.is_211:
                tier_211 += 1
            elif c.is_double_first_class:
                tier_dfc += 1
            else:
                tier_normal += 1
        school_tier = [
            {"name": "985", "count": tier_985},
            {"name": "211", "count": tier_211},
            {"name": "双一流", "count": tier_dfc},
            {"name": "普通院校", "count": tier_normal},
        ]
        school_tier = [s for s in school_tier if s["count"] > 0]

        # 9. 新增趋势（最近最多12个月的滚动窗口，以当前月为终点，连续填充、空月补0）
        #    独立统计：受权限与职位/部门/负责HR筛选，但不受时间范围限制，使其始终随当前日期向前滚动一年；
        #    数据不足12个月时，从最早有数据的月份开始（如系统上线仅8个月则渲染8个点）。
        trend_query = db.query(Candidate.created_at)
        trend_query = StatisticsService._apply_filters(
            db, trend_query, candidate_ids,
            None, None, jd_id, department, jd_ids, departments, uploader_ids
        )
        trend_dates = [row[0] for row in trend_query.all() if row[0]]
        now = datetime.now()
        now_idx = now.year * 12 + (now.month - 1)
        if trend_dates:
            earliest = min(trend_dates)
            earliest_idx = earliest.year * 12 + (earliest.month - 1)
        else:
            earliest_idx = now_idx
        start_idx = max(earliest_idx, now_idx - 11)
        trend_counter = defaultdict(int)
        for dt in trend_dates:
            idx = dt.year * 12 + (dt.month - 1)
            if start_idx <= idx <= now_idx:
                trend_counter[idx] += 1
        trend = []
        for idx in range(start_idx, now_idx + 1):
            y, mm = divmod(idx, 12)
            trend.append({"month": f"{y:04d}-{mm + 1:02d}", "count": trend_counter.get(idx, 0)})

        # 10. 职位候选人排行（Top 10）
        jd_counter = defaultdict(int)
        for c in candidates:
            if c.jd_id:
                jd_counter[c.jd_id] += 1
        job_ranking = []
        if jd_counter:
            jd_title_map = {
                jid: title
                for jid, title in db.query(JobDescription.id, JobDescription.job_title)
                .filter(JobDescription.id.in_(list(jd_counter.keys()))).all()
            }
            job_ranking = sorted(
                [{"name": (jd_title_map.get(jid) or f"职位{jid}"), "count": cnt} for jid, cnt in jd_counter.items()],
                key=lambda x: x["count"],
                reverse=True,
            )[:10]

        # 11. 当前阶段分布（仅在途候选人，排除"终止流程"）
        stage_order = ["简历筛选", "一面", "二面", "三面", "谈薪&背调"]
        excluded_stages = {"终止流程"}
        stage_counter = defaultdict(int)
        for c in candidates:
            stage = c.current_stage or "未知"
            if stage in excluded_stages:
                continue
            stage_counter[stage] += 1
        stage_dist = [{"name": s, "count": stage_counter[s]} for s in stage_order if stage_counter.get(s, 0) > 0]
        # 追加枚举之外的在途阶段值（兜底）
        stage_dist += [{"name": k, "count": v} for k, v in stage_counter.items() if k not in stage_order]

        # 12. 一面/二面/三面 人工面试平均分（仅统计有评价记录的候选人）
        interview_scores = {
            "first": {"avg": None, "count": 0},
            "second": {"avg": None, "count": 0},
            "third": {"avg": None, "count": 0},
        }
        stage_key = {"一面": "first", "二面": "second", "三面": "third"}
        interview_rows = db.query(
            InterviewEvaluation.stage,
            func.avg(InterviewEvaluation.total_score),
            func.count(func.distinct(InterviewEvaluation.candidate_id)),
        ).filter(
            InterviewEvaluation.candidate_id.in_(cand_id_list),
            InterviewEvaluation.stage.in_(list(stage_key.keys())),
        ).group_by(InterviewEvaluation.stage).all()
        for stage_name, avg_score, cnt in interview_rows:
            k = stage_key.get(stage_name)
            if k:
                interview_scores[k] = {
                    "avg": round(avg_score, 1) if avg_score is not None else None,
                    "count": cnt or 0,
                }

        return {
            "total": total,
            "ai_score": ai_score,
            "education": education,
            "top_school": top_school,
            "school_tier": school_tier,
            "trend": trend,
            "job_ranking": job_ranking,
            "stage_dist": stage_dist,
            "interview_scores": interview_scores,
            "demographics": {
                "work_status": work_status,
                "work_years": work_years,
                "gender": gender,
                "age": age_dist,
            },
        }

    @staticmethod
    def get_resume_uploaders(db: Session, user_id: int) -> Dict[str, List[Dict]]:
        """
        获取上传过简历的HR列表（用于"负责HR"筛选下拉）

        - HR/CEO：返回所有上传过简历的用户
        - 面试官：仅返回与其相关候选人的上传者
        """
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"用户不存在: {user_id}")
        candidate_ids = StatisticsService._get_related_candidate_ids(db, user_id, user.role)

        query = db.query(Candidate.created_by).filter(Candidate.created_by.isnot(None))
        if candidate_ids is not None:
            if not candidate_ids:
                return {"uploaders": []}
            query = query.filter(Candidate.id.in_(candidate_ids))
        uploader_ids = [row[0] for row in query.distinct().all()]
        if not uploader_ids:
            return {"uploaders": []}

        users = db.query(User).filter(User.id.in_(uploader_ids)).all()
        uploaders = [
            {"id": u.id, "name": (u.real_name or u.username), "username": u.username}
            for u in users
        ]
        uploaders.sort(key=lambda x: x["name"])
        return {"uploaders": uploaders}

    @staticmethod
    def get_my_todo_statistics(db: Session, user_id: int) -> Dict[str, int]:
        """
        获取我的待办统计

        Args:
            db: 数据库会话
            user_id: 当前用户ID

        Returns:
            我的待办统计数据
        """
        # 1. 统计简历待筛选数量
        resume_screening = db.query(CandidateTodo).filter(
            CandidateTodo.owner_id == user_id,
            CandidateTodo.stage == "简历筛选",
            CandidateTodo.status == TodoStatus.PENDING.value
        ).count()

        # 2. 统计待面试数量
        interview = db.query(CandidateTodo).filter(
            CandidateTodo.owner_id == user_id,
            CandidateTodo.stage.in_(["一面", "二面", "三面"]),
            CandidateTodo.status == TodoStatus.PENDING.value
        ).count()

        # 3. 统计谈薪&背调数量
        salary_negotiation = db.query(CandidateTodo).filter(
            CandidateTodo.owner_id == user_id,
            CandidateTodo.stage == "谈薪&背调",
            CandidateTodo.status == TodoStatus.PENDING.value
        ).count()

        return {
            "resume_screening": resume_screening,
            "interview": interview,
            "salary_negotiation": salary_negotiation
        }

    @staticmethod
    def get_job_recruitment_progress(db: Session, user_id: int) -> Dict[str, List[Dict]]:
        """
        获取职位招聘进展

        Args:
            db: 数据库会话
            user_id: 当前用户ID

        Returns:
            职位招聘进展数据
        """
        # 1. 获取用户信息
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"用户不存在: {user_id}")

        # 2. 只查询已发布的职位（不显示草稿和已关闭的）
        jobs_query = db.query(JobDescription).filter(
            JobDescription.status == "published"
        )

        # 3. 如果是面试官，过滤与用户相关的职位
        if user.role == UserRole.INTERVIEWER.value:
            # 从历史记录中查找关联的候选人ID
            related_candidate_ids = db.query(CandidateStageHistory.candidate_id).filter(
                or_(
                    CandidateStageHistory.stage_owner == user_id,
                    CandidateStageHistory.next_stage_owner == user_id
                )
            ).distinct().all()
            candidate_ids = [cid[0] for cid in related_candidate_ids]
            # 同时包含当前阶段负责人是该用户的候选人
            current_owner_ids = db.query(Candidate.id).filter(
                Candidate.current_stage_owner == user_id
            ).all()
            candidate_ids.extend([cid[0] for cid in current_owner_ids])
            candidate_ids = list(set(candidate_ids))

            if not candidate_ids:
                # 如果没有相关候选人，返回空列表
                return {"jobs": []}

            # 获取这些候选人对应的职位ID
            related_jd_ids = db.query(Candidate.jd_id).filter(
                Candidate.id.in_(candidate_ids)
            ).distinct().all()
            jd_ids = [jid[0] for jid in related_jd_ids]

            # 过滤职位
            jobs_query = jobs_query.filter(JobDescription.id.in_(jd_ids))

        # 4. 获取职位列表
        jobs = jobs_query.all()
        if not jobs:
            return {"jobs": []}

        # 5. 聚合每个职位的已入职数量和最近入职更新时间
        job_ids = [job.id for job in jobs]
        latest_salary_negotiation = get_latest_salary_negotiation_subquery(db)
        onboarded_stats = {
            row.jd_id: {
                "onboarded_count": row.onboarded_count or 0,
                "latest_onboarded_updated_at": row.latest_onboarded_updated_at,
            }
            for row in db.query(
                Candidate.jd_id.label("jd_id"),
                func.count(latest_salary_negotiation.c.id).label("onboarded_count"),
                func.max(latest_salary_negotiation.c.updated_at).label("latest_onboarded_updated_at")
            ).join(
                latest_salary_negotiation, latest_salary_negotiation.c.candidate_id == Candidate.id
            ).filter(
                Candidate.jd_id.in_(job_ids),
                latest_salary_negotiation.c.is_onboarded == True
            ).group_by(Candidate.jd_id).all()
        }

        result = []
        for job in jobs:
            job_stats = onboarded_stats.get(job.id, {})
            onboarded_count = job_stats.get("onboarded_count", 0)
            latest_onboarded_updated_at = job_stats.get("latest_onboarded_updated_at")

            # 计算完成率
            progress_rate = round(onboarded_count / job.headcount * 100, 2) if job.headcount and job.headcount > 0 else 0.0

            result.append({
                "jd_id": job.id,
                "job_title": job.job_title,
                "department": (job.department_ref.name if job.department_ref else job.department),
                "headcount": job.headcount or 0,
                "onboarded_count": onboarded_count,
                "progress_rate": progress_rate,
                "_latest_onboarded_updated_at": latest_onboarded_updated_at,
            })

        # 有入职结果的职位优先，其次按最近一次入职结果更新时间倒序
        result.sort(key=lambda item: item["job_title"] or "")
        result.sort(key=lambda item: item["_latest_onboarded_updated_at"] or datetime.min, reverse=True)
        result.sort(key=lambda item: item["onboarded_count"] > 0, reverse=True)

        for item in result:
            item.pop("_latest_onboarded_updated_at", None)

        return {"jobs": result}
