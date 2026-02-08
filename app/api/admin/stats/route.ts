import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
 

export async function GET(req: Request) {
  const r = await requireAdmin(req);
  if (!r.ok) return r.res;

  try {
    const [total, up, down] = await Promise.all([
      prisma.vote.count(),
      prisma.vote.count({ where: { voteType: "UP" } }),
      prisma.vote.count({ where: { voteType: "DOWN" } }),
    ]);

    const topContent = await prisma.vote.groupBy({
      by: ["contentId"],
      _count: { contentId: true },
      orderBy: { _count: { contentId: "desc" } },
      take: 10,
    });

    const topUsers = await prisma.vote.groupBy({
      by: ["userId"],
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 10,
    });

    const users = await prisma.user.findMany({
      where: { id: { in: topUsers.map((u) => u.userId) } },
      select: { id: true, email: true, name: true },
    });

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const payload = {
      ok: true,
      totals: {
        votes: total,
        upvotes: up,
        downvotes: down,
      },
      topContent: topContent.map((c) => ({
        contentId: c.contentId,
        count: c._count.contentId,
      })),
      topUsers: topUsers.map((u) => ({
        user: userMap[u.userId],
        count: u._count.userId,
      })),
    };

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
