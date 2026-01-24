import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";

async function requireAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token)
    return { ok: false as const, status: 401, error: "Missing Bearer token" };

  const googleUser = await getGoogleUserFromAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { googleSub: googleUser.sub },
  });

  if (!user)
    return { ok: false as const, status: 401, error: "User not found" };
  if (user.role !== "ADMIN")
    return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, user };
}

export async function GET(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok)
      return NextResponse.json(
        { error: check.error },
        { status: check.status },
      );

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ ok: true, users });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
