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
  try {
    await getResend().emails.send({
      from: getFrom(),
      to,
      subject: `Your project "${projectName}" is ready on Sol OS`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="margin: 0 0 8px;">Your project is ready</h2>
          <p style="color: #666; margin: 0 0 24px;">
            Sol OS has finished analyzing <strong>${projectName}</strong>.
            Your canvas, pages, and content are ready to review.
          </p>
          <a
            href="${process.env.APP_URL ?? 'http://localhost:5173'}"
            style="display: inline-block; background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;"
          >
            Open Sol OS
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">Sol OS &mdash; Generate anywhere. Launch with Sol.</p>
        </div>
      `,
    });
  } catch (err) {
    // Email failure should never block the main flow
    console.warn('Email send failed:', err);
  }
}
