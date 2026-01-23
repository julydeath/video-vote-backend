import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Allow requests from chrome-extension:// origins
  const origin = req.headers.get("origin") || "";

  // You can make this stricter later by checking for your extension id.
  if (origin.startsWith("chrome-extension://")) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }

  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
