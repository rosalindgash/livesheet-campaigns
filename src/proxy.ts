import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (isAppPageRequest(request)) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
  }

  return response;
}

function isAppPageRequest(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;

  return (
    request.method === "GET" &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    pathname !== "/favicon.ico"
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
