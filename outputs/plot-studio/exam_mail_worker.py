"""Small SMTP worker for access-link delivery. It never logs recipients or links."""

import json
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.headerregistry import Address
from email.utils import formatdate


def send(job):
    settings = job["smtp"]
    security = ssl.create_default_context()
    endpoint = (settings["host"], settings["port"])
    if settings["mode"] == "tls":
        transport = smtplib.SMTP_SSL(*endpoint, timeout=6, context=security)
    else:
        transport = smtplib.SMTP(*endpoint, timeout=6)
    with transport as smtp:
        smtp.ehlo()
        if settings["mode"] == "starttls":
            smtp.starttls(context=security)
            smtp.ehlo()
        if settings["username"]:
            smtp.login(settings["username"], settings["password"])
        if job.get("probe"):
            code, _ = smtp.mail(settings["sender"])
            if code != 250:
                raise smtplib.SMTPSenderRefused(code, b"", settings["sender"])
            smtp.rset()
            return
        message = EmailMessage()
        message["From"] = Address(display_name="PLOT Studio", addr_spec=settings["sender"])
        message["To"] = job["recipient"]
        message["Subject"] = "Your PLOT Studio exam access"
        message["Date"] = formatdate(usegmt=True)
        message["Message-ID"] = job["messageId"]
        message.set_content(job["text"])
        refusal = smtp.send_message(message, from_addr=settings["sender"], to_addrs=[job["recipient"]])
        if refusal:
            raise smtplib.SMTPRecipientsRefused(refusal)


def main():
    job = json.loads(sys.stdin.buffer.read(65536).decode("utf-8"))
    try:
        send(job)
    except ConnectionError:
        status = "SMTP_UNAVAILABLE"
    except TimeoutError:
        status = "SMTP_TIMEOUT"
    except smtplib.SMTPAuthenticationError:
        status = "SMTP_AUTH_FAILED"
    except ssl.SSLError:
        status = "SMTP_TLS_FAILED"
    except (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPDataError):
        status = "SMTP_REFUSED"
    except (smtplib.SMTPException, OSError, ValueError):
        status = "SMTP_DELIVERY_FAILED"
    else:
        status = "accepted"
    print(json.dumps({"status": status}, separators=(",", ":")))


if __name__ == "__main__":
    main()
