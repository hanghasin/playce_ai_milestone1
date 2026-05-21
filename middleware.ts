import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const publicPaths = ['/password', '/api/auth', '/_next', '/favicon.ico']

  const isPublic = publicPaths.some((path) => pathname.startsWith(path))

  if (isPublic) {
    return NextResponse.next()
  }

  const auth = request.cookies.get('playce_auth')

  if (!auth || auth.value !== 'true') {
    return NextResponse.redirect(new URL('/password', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
