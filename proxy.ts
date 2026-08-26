import { NextRequest, NextResponse } from 'next/server';

function unauthorized(): NextResponse {
  return new NextResponse('Autenticação necessária para o painel administrativo.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Guapu Painel"' },
  });
}

export function proxy(request: NextRequest) {
  const expectedUser = process.env.ADMIN_DASHBOARD_USER;
  const expectedPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
  const isPanelRoot = process.env.GUAPU_SURFACE === 'panel' && request.nextUrl.pathname === '/';
  const isProtectedPath = isPanelRoot || request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/api/admin');

  if (!isProtectedPath) return NextResponse.next();

  // Em produção, um painel que contém conversas só abre depois de as credenciais
  // terem sido configuradas. Em desenvolvimento local, mantém a experiência simples.
  if (!expectedUser || !expectedPassword) {
    return process.env.NODE_ENV === 'production'
      ? new NextResponse('Painel administrativo ainda não configurado.', { status: 503 })
      : NextResponse.next();
  }

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return unauthorized();

  try {
    const [user, password] = atob(header.slice(6)).split(':');
    if (user !== expectedUser || password !== expectedPassword) return unauthorized();
    return isPanelRoot ? NextResponse.rewrite(new URL('/admin', request.url)) : NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ['/', '/admin/:path*', '/api/admin/:path*'],
};
