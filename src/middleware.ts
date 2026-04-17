import { NextResponse, type NextRequest } from "next/server";

// Feature-flag the backtest area. When NEXT_PUBLIC_SHOW_BACKTEST is "false"
// (set on production), any direct visit to /backtest or /backtest/:id redirects
// to /dashboard. Flip the env var to re-enable — no code changes required.
export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SHOW_BACKTEST === "false") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/backtest", "/backtest/:path*"],
};
