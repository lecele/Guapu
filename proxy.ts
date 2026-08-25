import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * The panel is published as an independent Vercel project, but shares the
 * same codebase and APIs with the chatbot. The production-only environment
 * variable keeps the panel URL pointed at its dashboard without duplicating
 * the application.
 */
export function proxy(request: NextRequest) {
  if (process.env.GUAPU_SURFACE === 'panel' && request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/',
};
