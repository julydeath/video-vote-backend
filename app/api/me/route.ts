import { NextResponse } from "next/server";
import { requireUser } from "@/app/lib/auth";

export async function GET(req: Request) {
  const r = await requireUser(req);
  if (!r.ok) return r.res;

  return NextResponse.json({
    ok: true,
    user: {
      id: r.user.id,
      email: r.user.email,
      name: r.user.name,
      image: r.user.image,
      role: r.user.role,
    },
  });
}
