// Minimal, dependency-free branded HTML for the public Talent Pool consent
// confirm / withdraw pages. These are served from /api routes (outside the
// Next.js app shell), so they ship their own inline styles.

type Variant = 'success' | 'neutral' | 'error';

const ACCENT: Record<Variant, string> = {
  success: '#0a84d6', // rs-primary-ish
  neutral: '#64748b',
  error:   '#dc2626',
};

export function consentHtmlPage(opts: {
  variant: Variant;
  heading: string;
  message: string;
  footnote?: string;
  withdrawUrl?: string;
}): string {
  const accent = ACCENT[opts.variant];
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const withdraw = opts.withdrawUrl
    ? `<p style="margin-top:28px;font-size:13px;color:#64748b">
         Changed your mind? You can
         <a href="${esc(opts.withdrawUrl)}" style="color:${accent};font-weight:600">withdraw your consent</a>
         at any time.
       </p>`
    : '';
  const footnote = opts.footnote
    ? `<p style="margin-top:18px;font-size:12px;color:#94a3b8">${esc(opts.footnote)}</p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(opts.heading)} · Romega Solutions</title>
</head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="max-width:460px;width:100%;background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(13,33,56,.12);padding:40px 32px;text-align:center">
      <div style="width:56px;height:56px;border-radius:14px;background:${accent};margin:0 auto 20px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:700">
        ${opts.variant === 'success' ? '&#10003;' : opts.variant === 'error' ? '&times;' : '&#8505;'}
      </div>
      <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3">${esc(opts.heading)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#475569">${esc(opts.message)}</p>
      ${withdraw}
      ${footnote}
      <p style="margin-top:28px;font-size:12px;color:#cbd5e1">Romega Solutions</p>
    </div>
  </div>
</body>
</html>`;
}

export function clientIpFrom(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || null;
  return headers.get('x-real-ip')?.trim() || null;
}
