"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/config";

export type LoginState = { error: string | null };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  try {
    const callbackUrl = formData.get("callbackUrl");
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: typeof callbackUrl === "string" && callbackUrl.startsWith("/") ? callbackUrl : "/workspaces",
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }
}
