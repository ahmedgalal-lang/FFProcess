import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { NameForm, PasswordForm } from "./account-client";

/**
 * Every signed-in user's own account settings — name and password. Not
 * workspace-scoped: unlike everything under /workspaces/[workspaceId], an
 * account belongs to the person, not to any one client engagement.
 */
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-8">
      <Link href="/workspaces" className="mb-3 inline-block text-xs font-medium text-slate-500 hover:text-slate-900">
        ← All workspaces
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Your Account</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{user.email}</p>

      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Name</h2>
          <NameForm name={user.name ?? ""} />
        </section>

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Password</h2>
          {user.passwordHash ? (
            <PasswordForm />
          ) : (
            <p className="text-sm text-slate-500">This account doesn&rsquo;t sign in with a password.</p>
          )}
        </section>
      </div>
    </main>
  );
}
