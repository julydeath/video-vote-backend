import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: { contentId: string } },
) {
  const contentId = params.contentId;
  const segments = await prisma.transcriptSegment.findMany({
    where: { contentId },
    orderBy: { start: "asc" },
    take: 2000,
    select: { start: true, dur: true, text: true },
  });

  return NextResponse.json({ ok: true, contentId, segments });
}
