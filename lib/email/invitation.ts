import "server-only";
import { Resend } from "resend";

/**
 * Sends a workspace invitation email via Resend. When RESEND_API_KEY isn't
 * configured (local dev, this sandbox), this is a no-op that logs the accept
 * link instead — inviteMember() still returns the link so the UI can surface
 * it as a fallback "copy this link" affordance.
 */
export async function sendInvitationEmail(params: {
  to: string;
  workspaceName: string;
  acceptUrl: string;
  invitedByName: string | null;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.log(`[email:noop] Invitation to ${params.to} — accept link: ${params.acceptUrl}`);
    return { sent: false };
  }

  const resend = new Resend(apiKey);
  const from = process.env["EMAIL_FROM"] ?? "FFProcess <onboarding@resend.dev>";
  const inviter = params.invitedByName ?? "A workspace admin";

  await resend.emails.send({
    from,
    to: params.to,
    subject: `You've been invited to ${params.workspaceName} on FFProcess`,
    html: `
      <p>${inviter} invited you to collaborate on <strong>${params.workspaceName}</strong> in FFProcess.</p>
      <p><a href="${params.acceptUrl}">Accept the invitation</a></p>
      <p style="color:#64748b;font-size:12px">This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
    `,
  });

  return { sent: true };
}
