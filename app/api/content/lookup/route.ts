import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import { fetchYoutubeOEmbed } from "@/app/lib/youtubeMeta";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await getGoogleUserFromAccessToken(token);

    const url = new URL(req.url);
    const force =
      url.searchParams.get("force") === "1" ||
      req.headers.get("x-meta-refresh") === "1";

    const body = await req.json().catch(() => null);
    const contentIds = Array.isArray(body?.contentIds)
      ? body.contentIds.filter((v: any) => typeof v === "string")
      : [];

    if (contentIds.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    //@ts-expect-error
    const uniqueIds: string[] = Array.from(new Set(contentIds)).slice(0, 200);

    const items = await prisma.content.findMany({
      where: { contentId: { in: uniqueIds } },
      select: {
        contentId: true,
        source: true,
        title: true,
        channelName: true,
        pageUrl: true,
        pageHost: true,
        transcriptStatus: true,
        updatedAt: true,
      },
    });

    const enriched = await Promise.all(
      items.map(async (item) => {
        if (!item.contentId.startsWith("yt:")) return item;
        if (!force && item.title && item.channelName) return item;

        const videoId = item.contentId.slice(3);
        const meta = await fetchYoutubeOEmbed(videoId, { force });

        if (meta.title || meta.channelName) {
          await prisma.content.update({
            where: { contentId: item.contentId },
            data: {
              title: meta.title || item.title,
              channelName: meta.channelName || item.channelName,
            },
          });
        }

        return {
          ...item,
          title: meta.title || item.title,
          channelName: meta.channelName || item.channelName,
        };
      }),
    );

    return NextResponse.json({ ok: true, items: enriched });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
