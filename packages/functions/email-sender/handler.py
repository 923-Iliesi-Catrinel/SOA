import json
import sys
import smtplib
import os
from email.message import EmailMessage


def handle(req):
    """
    Sends email via local SMTP server (MailHog).
    http://localhost:8025 for MailHog UI
    """
    try:
        data = json.loads(req)
        truck_id = data.get("truckId", "Unknown")
        subject = data.get("subject", "PharmaGuard Alert")
        message_body = data.get("message", "No details provided.")

        smtp_host = os.environ.get("SMTP_SERVER", "mailhog")
        smtp_port = int(os.environ.get("SMTP_PORT", 1025))

        sender = "alert@pharmaguard.com"
        recipient = "manager@pharmaguard.com"

        msg = EmailMessage()
        msg.set_content(f"CRITICAL ALERT - TRUCK {truck_id}\n\n{message_body}")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = recipient

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.send_message(msg)

        return json.dumps({"status": "Sent to MailHog", "to": recipient})

    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    print(handle(sys.stdin.read()))
