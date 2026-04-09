import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getFrom() {
  return process.env.RESEND_FROM ?? 'onboarding@resend.dev';
}

export async function sendAnalysisReady(to: string, projectName: string) {
  const from = getFrom();
  console.log('[email] Sending to:', to, '| from:', from);
  try {
    const result = await getResend().emails.send({
      from,
      to,
      subject: `"${projectName}" is ready to deploy on HostaPosta`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="margin: 0 0 8px;">Your project is ready</h2>
          <p style="color: #666; margin: 0 0 24px;">
            <strong>${projectName}</strong> has been unpacked and is ready to deploy.
            One click and it's live on your HostaPosta domain.
          </p>
          <a
            href="${process.env.APP_URL ?? 'http://localhost:5173'}"
            style="display: inline-block; background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;"
          >
            Open HostaPosta
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">HostaPosta — deploy in seconds, not hours.</p>
        </div>
      `,
    });
    if (result.error) {
      console.warn('[email] Resend API error:', JSON.stringify(result.error));
    } else {
      console.log('[email] Sent successfully, id:', result.data?.id);
    }
  } catch (err) {
    console.warn('[email] Send failed (exception):', err);
  }
}
