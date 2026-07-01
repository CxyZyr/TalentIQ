"""
邮件服务配置（模板）

使用方法：复制本文件为 email_config.py，并填入你自己的 SMTP 配置。
    cp config/email_config.example.py config/email_config.py
"""

EMAIL_CONFIG = {
    "smtp_server": "smtp.example.com",
    "smtp_port": 465,
    "use_ssl": True,
    "sender_email": "your-email@example.com",
    "sender_password": "YOUR_SMTP_PASSWORD",
    "sender_name": "TalentIQ 智能招聘系统",
}

# 超时提醒配置
TODO_TIMEOUT_CONFIG = {
    "screening_timeout_hours": 24,     # 简历筛选超时小时数
    "interview_timeout_hours": 48,     # 面试阶段超时小时数
    "reminder_interval_hours": 72,     # 重复催办发送间隔（小时）
    "check_interval_minutes": 30,      # 定时检查间隔（分钟）
}
