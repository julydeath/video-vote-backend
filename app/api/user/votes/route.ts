import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/auth";

export async function GET(req: Request) {
  const r = await requireUser(req);
  if (!r.ok) return r.res;

  const { searchParams } = new URL(req.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const voteType = searchParams.get("voteType"); // UP | DOWN
  const contentId = searchParams.get("contentId");
  const q = searchParams.get("q"); // URL search
  const limit = Number(searchParams.get("limit") || 50);

  const where: any = {
    userId: r.user.id,
  };

  // Date filter
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  // Vote type
  if (voteType === "UP" || voteType === "DOWN") {
    where.voteType = voteType;
  }

  // Content filter
  if (contentId) {
    where.contentId = contentId;
  }

  // URL search
  if (q) {
    where.OR = [
      { pageUrl: { contains: q, mode: "insensitive" } },
      { contentId: { contains: q, mode: "insensitive" } },
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
      pageHost: true,
      createdAt: true,
    },
  });

  const total = await prisma.vote.count({ where });

  return NextResponse.json({
    ok: true,
    total,
    votes,
  });
}
