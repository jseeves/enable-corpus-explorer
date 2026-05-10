import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // Skip auth if credentials are not configured
  if (!user || !password) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const colonIdx = decoded.indexOf(":");
      if (colonIdx !== -1) {
        const inputUser = decoded.slice(0, colonIdx);
        const inputPass = decoded.slice(colonIdx + 1);
        if (inputUser === user && inputPass === password) {
          return NextResponse.next();
        }
      }
    } catch {
      // invalid base64 — fall through to 401
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Enable Corpus Explorer"',
    },
  });
}

export const config = {
  matcher: "/:path*",
};
