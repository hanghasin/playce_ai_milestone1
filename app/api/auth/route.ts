import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { password } = await req.json()
  const demoPassword = process.env.DEMO_PASSWORD

  if (!demoPassword || password !== demoPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('playce_auth', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 3,
    path: '/',
  })
  return response
}
