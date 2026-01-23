import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json(
        { error: "Missing Bearer token" },
        { status: 401 },
      );
    }

    const googleUser = await getGoogleUserFromAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { googleSub: googleUser.sub },
      select: { id: true },
    });

    if (!user) return NextResponse.json({ ok: true, votes: [] });

    const url = new URL(req.url);
    const videoId = url.searchParams.get("videoId") || undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 100);

    const votes = await prisma.vote.findMany({
      where: { userId: user.id, ...(videoId ? { videoId } : {}) },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        contentId: true,
        timeBucket: true,
        timeSeconds: true,
        voteType: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, votes });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
