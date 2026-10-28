# Application emails

What happens when someone applies through the public careers form.

## Who gets what

| Email | From | To | Sent by |
| --- | --- | --- | --- |
| New-application notice (CV link included) | info@ mailbox | `APPLICATION_NOTIFY_TO` | n8n "Recruiter Notify" workflow |
| Applicant confirmation (designed, with the application code) | hr@romega-solutions.com | the applicant | the portal, through Resend |
| Applicant acknowledgement (plain text, today's behavior) | the existing communication workflow | the applicant | n8n "Candidate Communication" workflow |

Each applicant gets exactly one of the last two.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `APPLICATION_NOTIFY_TO` | `hr@romega-solutions.com` | The single address that receives the new-application notice. An invalid value falls back to the default. |
| `APPLICANT_ACK_MODE` | unset (off) | Set to `hr` to send the designed confirmation from the HR address through Resend. Any other value keeps the plain acknowledgement. |
| `RESEND_API_KEY` | unset | Resend API key. Only used when `APPLICANT_ACK_MODE=hr`. Never commit it. |

## Turning the confirmation on

1. Verify the sending domain in Resend and check the SPF, DKIM and DMARC records.
2. Add `RESEND_API_KEY` to the deployment environment.
3. Set `APPLICANT_ACK_MODE=hr` and redeploy.
4. Submit a test application with your own address and check the result, including the history entry on the candidate.

To turn it off again, unset `APPLICANT_ACK_MODE` (or set it to anything other than `hr`).

## Failure behavior

- Mode on, key missing or Resend refuses the request: the plain acknowledgement is sent instead and an `email_failed` history entry is added.
- Mode on, timeout, network error or a Resend server error: the outcome is unknown, so nothing else is sent (to avoid two emails) and an `email_failed` history entry is added for HR to follow up.
- A successful send adds an `email_sent` history entry and sets the candidate's last email template and time.

## Design

The email uses Poppins with Arial, Helvetica and sans-serif as fallbacks (`'Poppins', Arial, Helvetica, sans-serif`). The logo and check icon are served from `/images/romega-email-logo.png` and `/images/email-check.png` on the portal's public address.
