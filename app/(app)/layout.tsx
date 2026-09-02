import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const firmMember = await prisma.firmMember.findUnique({ where: { userId: session.user.id! } });
  const isFirmOwner = firmMember?.role === "OWNER";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
        <Link href="/workspaces" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 font-mono text-[11px] font-bold text-white">
            FF
          </div>
          <span className="text-sm font-semibold text-slate-900">FFProcess</span>
        </Link>
        <div className="flex-1" />
        {isFirmOwner && (
          <Link href="/firm/settings" className="text-xs font-medium text-slate-500 hover:text-slate-900">
            Firm Settings
          </Link>
        )}
        <Link href="/account" className="text-xs text-slate-500 hover:text-slate-900">
          {session.user.email}
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
            Sign out
          </button>
        </form>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
