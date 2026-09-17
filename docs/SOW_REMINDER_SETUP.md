# SOW reminder

Run docs/migrations/add-sow-reminder-timestamp.sql before deploying.

The shared N8N_FORM_REMINDER_URL receives the existing recruitment reminder
payload with reminderType set to sow. Add a sow branch to the existing n8n
workflow before using the button. Send to recipientEmail, using recipientName
and subjectName. Ask the candidate to reply to the original document-package
email with their signed Statement of Work attached. Do not include a form link.

Suggested subject: Reminder: Return your signed Statement of Work

Suggested message: Please reply to our original document-package email with
your signed Statement of Work attached. If you have already sent it, thank you;
our team will review it. Let us know if you have any questions.

Return a successful HTTP response only after the email-send step succeeds.
HR checks the inbox before sending and clicks Mark SOW signed after reviewing
the attachment. The app does not monitor email replies automatically.
