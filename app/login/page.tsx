import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const callbackUrlRaw = searchParams["callbackUrl"];
  const callbackUrl = typeof callbackUrlRaw === "string" ? callbackUrlRaw : undefined;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white">
            FF
          </div>
          <span className="text-sm font-semibold text-slate-900">FFProcess</span>
        </div>
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Sign in</h1>
        <p className="mb-6 text-sm text-slate-500">
          Process mapping, RACI, and authority matrices for client engagements.
        </p>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
