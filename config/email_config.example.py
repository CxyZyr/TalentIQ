"""
邮件服务配置（模板）

复制为 email_config.py，或在项目根 .env 中配置 SMTP_*。
"""
import os

EMAIL_CONFIG = {
    "smtp_server": os.getenv("SMTP_SERVER", "smtp.example.com"),
    "smtp_port": int(os.getenv("SMTP_PORT", "465")),
    "use_ssl": True,
    "sender_email": os.getenv("SMTP_SENDER_EMAIL", "your-email@example.com"),
    "sender_password": os.getenv("SMTP_PASSWORD", "YOUR_SMTP_PASSWORD"),
    "sender_name": os.getenv("SMTP_SENDER_NAME", "TalentIQ 智能招聘系统"),
}

TODO_TIMEOUT_CONFIG = {
    "screening_timeout_hours": 24,
    "interview_timeout_hours": 48,
    "reminder_interval_hours": 72,
    "check_interval_minutes": 30,
}
