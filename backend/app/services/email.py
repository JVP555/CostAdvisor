import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from app.config import get_settings

logger = logging.getLogger(__name__)


def build_invite_html(team_name: str, role: str, invited_by_name: str,
                      invited_by_email: str, requests_url: str) -> str:
    role_colors = {"owner": "#6366f1", "admin": "#f59e0b", "member": "#10b981"}
    color = role_colors.get(role, "#10b981")
    inviter = f"{invited_by_name} ({invited_by_email})" if invited_by_name else invited_by_email
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">
        <tr><td style="background:#18181b;padding:24px 32px">
          <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px">CostAdvisor</span>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b">You've been invited</p>
          <p style="margin:0 0 24px;color:#71717a;font-size:14px">
            <strong style="color:#18181b">{inviter}</strong>
            has invited you to join <strong style="color:#18181b">{team_name}</strong> on CostAdvisor.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr>
              <td style="padding-right:12px;color:#71717a;font-size:13px">Team</td>
              <td style="font-size:13px;font-weight:600;color:#18181b">{team_name}</td>
            </tr>
            <tr><td style="padding:4px 0"></td></tr>
            <tr>
              <td style="padding-right:12px;color:#71717a;font-size:13px">Your role</td>
              <td>
                <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:12px;
                             font-weight:600;background:{color}22;color:{color}">{role.capitalize()}</span>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 24px;color:#52525b;font-size:13px;line-height:1.6">
            Sign in to CostAdvisor to accept or decline this invitation.
            The invite expires in 7 days.
          </p>
          <a href="{requests_url}"
             style="display:inline-block;background:#18181b;color:#fff;
                    text-decoration:none;padding:12px 28px;border-radius:6px;
                    font-size:14px;font-weight:600">
            View Invitation
          </a>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #f4f4f5;background:#fafafa">
          <p style="margin:0;font-size:11px;color:#a1a1aa">
            If you weren't expecting this, you can safely ignore it.<br>
            &copy; CostAdvisor &middot;
            <a href="https://costadvisor.org" style="color:#a1a1aa">costadvisor.org</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_invite_email(
    to_email: str,
    team_name: str,
    role: str,
    invited_by_name: str,
    invited_by_email: str,
) -> bool:
    """Send a team invite email via SMTP (stdlib only). Returns True on success, False if not configured or failed."""
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning("SMTP not configured — invite email not sent to %s", to_email)
        return False

    requests_url = f"{settings.app_url}/team?tab=requests"
    html = build_invite_html(team_name, role, invited_by_name, invited_by_email, requests_url)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{invited_by_name or invited_by_email} invited you to join {team_name} on CostAdvisor"
    msg["From"] = formataddr(("CostAdvisor", settings.email_from))
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        if settings.smtp_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.sendmail(settings.email_from, [to_email], msg.as_string())
        else:
            # Implicit SSL (port 465)
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.sendmail(settings.email_from, [to_email], msg.as_string())
        return True
    except Exception as e:
        logger.warning("Failed to send invite email to %s: %s", to_email, e)
        return False
