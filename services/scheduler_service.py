"""
定时任务：待办超时催办

定期扫描未处理的待办，简历筛选超过24小时、面试阶段超过48小时则发送催办邮件
同一待办重复催办的发送间隔由配置控制
周末时间不计入超时统计
"""
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

from config.email_config import TODO_TIMEOUT_CONFIG

scheduler = BackgroundScheduler()

# 记录已发送过催办的待办ID，避免重复发送（每个超时区间只发一次）
_reminded_todos: dict[int, datetime] = {}

# 面试阶段列表
_INTERVIEW_STAGES = {"一面", "二面", "三面"}


def _calc_working_hours(start: datetime, end: datetime) -> float:
    """计算两个时间之间的工作小时数（跳过周末）"""
    if start >= end:
        return 0.0

    total_seconds = 0.0
    current = start

    while current < end:
        # 0=Monday, 5=Saturday, 6=Sunday
        if current.weekday() < 5:
            # 工作日：计算到当天结束或end的较小值
            next_day = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            segment_end = min(next_day, end)
            total_seconds += (segment_end - current).total_seconds()
            current = segment_end
        else:
            # 周末：跳到下周一
            days_until_monday = 7 - current.weekday()
            current = (current + timedelta(days=days_until_monday)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

    return total_seconds / 3600


def _get_timeout_hours(stage: str) -> int:
    """根据阶段获取对应的超时小时数"""
    if stage in _INTERVIEW_STAGES:
        return TODO_TIMEOUT_CONFIG["interview_timeout_hours"]
    return TODO_TIMEOUT_CONFIG["screening_timeout_hours"]


def _get_reminder_interval_hours() -> int:
    """获取重复催办的发送间隔（小时）"""
    return TODO_TIMEOUT_CONFIG.get("reminder_interval_hours", 72)


def check_timeout_todos():
    """检查超时待办并发送催办邮件（周末不计入超时）"""
    # 周末不执行催办检查
    if datetime.now().weekday() >= 5:
        return

    from db.database import SessionLocal
    from db.models import CandidateTodo, Candidate, User, TodoStatus

    db = SessionLocal()
    try:
        # 使用较宽松的阈值预筛选（考虑周末可能多出2天）
        min_timeout = min(
            TODO_TIMEOUT_CONFIG["screening_timeout_hours"],
            TODO_TIMEOUT_CONFIG["interview_timeout_hours"]
        )
        threshold = datetime.now() - timedelta(hours=min_timeout + 48)

        # 查询所有可能超时的未处理待办
        candidate_todos = db.query(CandidateTodo).filter(
            CandidateTodo.status == TodoStatus.PENDING.value,
            CandidateTodo.created_at < threshold
        ).all()

        if not candidate_todos:
            return

        from services.email_service import EmailService

        now = datetime.now()
        overdue_count = 0
        for todo in candidate_todos:
            # 计算工作时间（跳过周末）
            timeout_hours = _get_timeout_hours(todo.stage)
            working_hours = _calc_working_hours(todo.created_at, now)

            if working_hours < timeout_hours:
                continue

            # 同一待办按配置控制重复催办的发送频率
            last_reminded = _reminded_todos.get(todo.id)
            reminder_interval_hours = _get_reminder_interval_hours()
            if last_reminded and (now - last_reminded).total_seconds() < reminder_interval_hours * 3600:
                continue

            owner = db.query(User).filter(User.id == todo.owner_id).first()
            candidate = db.query(Candidate).filter(Candidate.id == todo.candidate_id).first()

            if not owner or not owner.email or not candidate:
                continue

            hours_overdue = int(working_hours)
            job_title = candidate.jd.job_title if candidate.jd else None

            EmailService.send_timeout_reminder(
                to_email=owner.email,
                owner_name=owner.real_name or owner.username,
                candidate_name=candidate.name or f"候选人#{todo.candidate_id}",
                stage=todo.stage,
                created_at=todo.created_at,
                hours_overdue=hours_overdue,
                job_title=job_title,
                candidate_id=todo.candidate_id,
            )

            _reminded_todos[todo.id] = now
            overdue_count += 1

        if overdue_count:
            print(f"[超时催办] 本次催办 {overdue_count} 个超时待办")

        # 清理已处理的待办记录
        active_ids = {t.id for t in candidate_todos}
        for tid in list(_reminded_todos.keys()):
            if tid not in active_ids:
                del _reminded_todos[tid]

    except Exception as e:
        print(f"[超时催办] 检查失败: {str(e)}")
    finally:
        db.close()


def start_scheduler():
    """启动定时任务"""
    interval = TODO_TIMEOUT_CONFIG["check_interval_minutes"]
    scheduler.add_job(
        check_timeout_todos,
        "interval",
        minutes=interval,
        id="check_timeout_todos",
        replace_existing=True,
    )
    scheduler.start()
    screening_h = TODO_TIMEOUT_CONFIG["screening_timeout_hours"]
    interview_h = TODO_TIMEOUT_CONFIG["interview_timeout_hours"]
    reminder_interval_h = _get_reminder_interval_hours()
    print(
        f"[定时任务] 超时催办已启动，每 {interval} 分钟检查一次"
        f"（简历筛选{screening_h}h / 面试{interview_h}h / 重复催办间隔{reminder_interval_h}h）"
    )


def stop_scheduler():
    """停止定时任务"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[定时任务] 已停止")
