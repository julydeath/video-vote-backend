import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ contentId: string }> },
) {
  try {
    const { contentId } = await context.params;
    const decoded = decodeURIComponent(contentId);

    const segments = await prisma.transcriptSegment.findMany({
      where: { contentId: decoded },
      orderBy: { start: "asc" },
      select: {
        start: true,
        dur: true,
        text: true,
      },
    });

    return NextResponse.json({
      ok: true,
      contentId: decoded,
      segments,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
