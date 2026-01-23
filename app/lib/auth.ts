import { getGoogleUserFromAccessToken } from "@/app/lib/google";
import prisma from "@/app/lib/prisma";

export async function getUserFromRequest(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const googleUser = await getGoogleUserFromAccessToken(token);

  const user = await prisma.user.upsert({
    where: { googleSub: googleUser.sub },
    update: {
      email: googleUser.email,
      name: googleUser.name,
      image: googleUser.picture,
    },
    create: {
      googleSub: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name,
      image: googleUser.picture,
      role: "USER",
    },
  });

  return user;
}

export async function requireUser(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return {
      ok: false as const,
      res: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true as const, user };
}

export async function requireAdmin(req: Request) {
  const r = await requireUser(req);
  if (!r.ok) return r;

  if (r.user.role !== "ADMIN") {
    return {
      ok: false as const,
      res: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user: r.user };
}
