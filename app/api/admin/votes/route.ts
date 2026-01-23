import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";

export async function GET(req: Request) {
  const r = await requireAdmin(req);
  if (!r.ok) return r.res;

  const { searchParams } = new URL(req.url);

  const userId = searchParams.get("userId");
  const voteType = searchParams.get("voteType");
  const contentId = searchParams.get("contentId");
  const q = searchParams.get("q");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Number(searchParams.get("limit") || 100);

  const where: any = {};

  if (userId) where.userId = userId;
  if (contentId) where.contentId = contentId;

  if (voteType === "UP" || voteType === "DOWN") {
    where.voteType = voteType;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  if (q) {
    where.OR = [
      { pageUrl: { contains: q, mode: "insensitive" } },
      { contentId: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const votes = await prisma.vote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      contentId: true,
      timeSeconds: true,
      voteType: true,
      pageUrl: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  const total = await prisma.vote.count({ where });

  return NextResponse.json({
    ok: true,
    total,
    votes,
  });
}
