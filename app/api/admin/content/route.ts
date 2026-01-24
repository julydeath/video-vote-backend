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

  return { ok: true as const };
}

function parseDate(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok)
      return NextResponse.json(
        { error: check.error },
        { status: check.status },
      );

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || "";
    const q = (url.searchParams.get("q") || "").trim();
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

    const where: any = {};
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    if (q) {
      where.OR = [
        { contentId: { contains: q, mode: "insensitive" } },
        { pageUrl: { contains: q, mode: "insensitive" } },
      ];
    }

    // 1) group by contentId + voteType
    const grouped = await prisma.vote.groupBy({
      by: ["contentId", "voteType"],
      where,
      _count: { _all: true },
      orderBy: { contentId: "asc" },
    });

    // 2) aggregate into rows
    const map = new Map<
      string,
      { contentId: string; up: number; down: number }
    >();
    for (const g of grouped) {
      const row = map.get(g.contentId) || {
        contentId: g.contentId,
        up: 0,
        down: 0,
      };
      if (g.voteType === "UP") row.up = g._count._all;
      if (g.voteType === "DOWN") row.down = g._count._all;
      map.set(g.contentId, row);
    }
    const rows = Array.from(map.values());

    // 3) sort by most activity
    rows.sort((a, b) => b.up + b.down - (a.up + a.down));

    const top = rows.slice(0, limit);

    // 4) attach a sample pageUrl + lastVotedAt
    const contentIds = top.map((r) => r.contentId);

    const samples = await prisma.vote.findMany({
      where: { ...where, contentId: { in: contentIds } },
      select: { contentId: true, pageUrl: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });

    const extra = new Map<
      string,
      { pageUrl?: string | null; lastVotedAt?: string }
    >();
    for (const s of samples) {
      if (!extra.has(s.contentId)) {
        extra.set(s.contentId, {
          pageUrl: s.pageUrl || null,
          lastVotedAt: s.createdAt.toISOString(),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      items: top.map((r) => ({
        ...r,
        total: r.up + r.down,
        pageUrl: extra.get(r.contentId)?.pageUrl || null,
        lastVotedAt: extra.get(r.contentId)?.lastVotedAt || null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
