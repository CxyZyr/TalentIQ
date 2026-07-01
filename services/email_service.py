"""
邮件发送服务

提供待办通知和超时催办邮件发送功能
"""
import smtplib
import threading
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formataddr
from datetime import datetime
from typing import Optional

from config.email_config import EMAIL_CONFIG

# 前端访问地址（部署时改为你自己的域名）
FRONTEND_BASE_URL = "http://localhost:7587"


class EmailService:
    """邮件发送服务"""

    @staticmethod
    def _send_email(to_email: str, subject: str, html_content: str):
        """
        发送邮件（同步）

        Args:
            to_email: 收件人邮箱
            subject: 邮件主题
            html_content: HTML邮件内容
        """
        cfg = EMAIL_CONFIG
        msg = MIMEText(html_content, "html", "utf-8")
        msg["From"] = formataddr((str(Header(cfg['sender_name'], 'utf-8')), cfg['sender_email']))
        msg["To"] = to_email
        msg["Subject"] = Header(subject, "utf-8")

        try:
            if cfg["use_ssl"]:
                server = smtplib.SMTP_SSL(cfg["smtp_server"], cfg["smtp_port"], timeout=15)
            else:
                server = smtplib.SMTP(cfg["smtp_server"], cfg["smtp_port"], timeout=15)
                server.starttls()

            server.login(cfg["sender_email"], cfg["sender_password"])
            server.sendmail(cfg["sender_email"], [to_email], msg.as_string())
            server.quit()
            print(f"[邮件服务] 发送成功: {to_email} - {subject}")
        except Exception as e:
            print(f"[邮件服务] 发送失败: {to_email} - {subject} - {str(e)}")

    @staticmethod
    def send_async(to_email: str, subject: str, html_content: str):
        """
        异步发送邮件（后台线程，不阻塞调用方）

        Args:
            to_email: 收件人邮箱
            subject: 邮件主题
            html_content: HTML邮件内容
        """
        thread = threading.Thread(
            target=EmailService._send_email,
            args=(to_email, subject, html_content),
            daemon=True
        )
        thread.start()

    @staticmethod
    def send_todo_notification(
        to_email: str,
        owner_name: str,
        candidate_name: str,
        stage: str,
        job_title: Optional[str] = None,
        candidate_id: Optional[int] = None,
    ):
        """
        发送新待办通知邮件

        Args:
            to_email: 收件人邮箱
            owner_name: 负责人姓名
            candidate_name: 候选人姓名
            stage: 待办阶段
            job_title: 应聘职位
            candidate_id: 候选人ID（用于生成跳转链接）
        """
        subject = f"待办通知 - {candidate_name} - {stage}"
        job_info = f"<tr><td style='padding:6px 0;color:#888;'>应聘职位：</td><td style='padding:6px 0;'>{job_title}</td></tr>" if job_title else ""
        link_html = ""
        if candidate_id:
            link_url = f"{FRONTEND_BASE_URL}/candidate/detail/{candidate_id}"
            link_html = f"""<div style="margin-top:20px;">
<a href="{link_url}" style="display:inline-flex;align-items:center;gap:4px;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">立即处理 &#8594;</a>
</div>"""
        html = f"""<div style="font-family:sans-serif;color:#333;max-width:500px;">
<p>您好，{owner_name}，</p>
<p>您有一个新的待办任务需要处理：</p>
<table style="margin:12px 0;">
<tr><td style="padding:6px 0;color:#888;">候选人：</td><td style="padding:6px 0;">{candidate_name}</td></tr>
{job_info}
<tr><td style="padding:6px 0;color:#888;">当前阶段：</td><td style="padding:6px 0;">{stage}</td></tr>
<tr><td style="padding:6px 0;color:#888;">创建时间：</td><td style="padding:6px 0;">{datetime.now().strftime('%Y-%m-%d %H:%M')}</td></tr>
</table>
{link_html}
<p style="color:#aaa;font-size:12px;margin-top:24px;">— GCL智能招聘系统</p>
</div>"""
        EmailService.send_async(to_email, subject, html)

    @staticmethod
    def send_timeout_reminder(
        to_email: str,
        owner_name: str,
        candidate_name: str,
        stage: str,
        created_at: datetime,
        hours_overdue: int,
        job_title: Optional[str] = None,
        candidate_id: Optional[int] = None,
    ):
        """
        发送待办超时催办邮件

        Args:
            to_email: 收件人邮箱
            owner_name: 负责人姓名
            candidate_name: 候选人姓名
            stage: 待办阶段
            created_at: 待办创建时间
            hours_overdue: 已超时小时数
            job_title: 应聘职位
            candidate_id: 候选人ID（用于生成跳转链接）
        """
        subject = f"催办提醒 - {candidate_name} - {stage} 已超时{hours_overdue}小时"
        job_info = f"<tr><td style='padding:6px 0;color:#888;'>应聘职位：</td><td style='padding:6px 0;'>{job_title}</td></tr>" if job_title else ""
        link_html = ""
        if candidate_id:
            link_url = f"{FRONTEND_BASE_URL}/candidate/detail/{candidate_id}"
            link_html = f"""<div style="margin-top:20px;">
<a href="{link_url}" style="display:inline-flex;align-items:center;gap:4px;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">立即处理 &#8594;</a>
</div>"""
        html = f"""<div style="font-family:sans-serif;color:#333;max-width:500px;">
<p>您好，{owner_name}，</p>
<p>以下待办已超过 <b>{hours_overdue}小时</b> 未处理，请尽快处理：</p>
<table style="margin:12px 0;">
<tr><td style="padding:6px 0;color:#888;">候选人：</td><td style="padding:6px 0;">{candidate_name}</td></tr>
{job_info}
<tr><td style="padding:6px 0;color:#888;">当前阶段：</td><td style="padding:6px 0;">{stage}</td></tr>
<tr><td style="padding:6px 0;color:#888;">创建时间：</td><td style="padding:6px 0;">{created_at.strftime('%Y-%m-%d %H:%M')}</td></tr>
<tr><td style="padding:6px 0;color:#888;">已超时：</td><td style="padding:6px 0;color:red;"><b>{hours_overdue} 小时</b></td></tr>
</table>
{link_html}
<p style="color:#aaa;font-size:12px;margin-top:24px;">— GCL智能招聘系统</p>
</div>"""
        EmailService.send_async(to_email, subject, html)
