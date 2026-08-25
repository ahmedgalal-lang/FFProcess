import { prisma } from "@/lib/db/client";

/**
 * Resolves the company logo to show in the app header for a given user: via
 * their Firm Member record if they have one, otherwise via any Workspace
 * they belong to as a Member (an external client user has no Firm Member row
 * but still sees that workspace's Firm's branding).
 */
export async function getFirmLogoForUser(userId: string): Promise<string | null> {
  const firmMember = await prisma.firmMember.findUnique({
    where: { userId },
    include: { firm: { select: { logoDataUrl: true } } },
  });
  if (firmMember) return firmMember.firm.logoDataUrl;

  const member = await prisma.member.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { workspace: { select: { firm: { select: { logoDataUrl: true } } } } },
  });
  return member?.workspace.firm.logoDataUrl ?? null;
}
