import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return { ok: false as const, status: 401, error: "Missing Bearer token" };
  }

  const googleUser = await getGoogleUserFromAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { googleSub: googleUser.sub },
    select: { id: true, role: true },
  });

  if (!user) {
    return { ok: false as const, status: 401, error: "User not found" };
  }

  if (user.role !== "ADMIN") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ contentId: string }> },
) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: check.status },
      );
    }

    const { contentId } = await context.params;
    const decodedContentId = decodeURIComponent(contentId);

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
    const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
    const skip = (page - 1) * limit;

    const [votes, total] = await Promise.all([
      prisma.vote.findMany({
        where: { contentId: decodedContentId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          contentId: true,
          voteType: true,
          timeSeconds: true,
          timeBucket: true,
          pageUrl: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.vote.count({ where: { contentId: decodedContentId } }),
    ]);

    const payload = { ok: true, votes, total, page, limit };
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
