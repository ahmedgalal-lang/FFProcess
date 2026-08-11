import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { getInvitationByToken } from "@/lib/actions/membership";
import { AcceptInvitationForm } from "./accept-form";

export default async function AcceptInvitationPage(
  props: PageProps<"/invitations/[token]/accept">
) {
  const { token } = await props.params;
  const [invitation, session] = await Promise.all([getInvitationByToken(token), auth()]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white">
            FF
          </div>
          <span className="text-sm font-semibold text-slate-900">FFProcess</span>
        </div>

        {!invitation ? (
          <>
            <h1 className="mb-1 text-lg font-semibold text-slate-900">Invitation not found</h1>
            <p className="text-sm text-slate-500">
              This invitation link is invalid, has already been used, or has expired. Ask a
              workspace admin to send a new one.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-slate-900 underline">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-semibold text-slate-900">Join {invitation.workspaceName}</h1>
            <p className="mb-6 text-sm text-slate-500">
              {invitation.invitedEmail} was invited as <strong>{invitation.accessLevel.toLowerCase()}</strong>.
            </p>
            <AcceptInvitationForm
              token={token}
              invitedEmail={invitation.invitedEmail}
              hasExistingAccount={invitation.hasExistingAccount}
              sessionEmail={session?.user?.email ?? null}
            />
          </>
        )}
      </div>
    </div>
  );
}
