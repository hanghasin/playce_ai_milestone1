import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Playce AI | Find What Moves You',
  description:
    'Discover your perfect sport and destination with AI-powered recommendations. Not more choices, just the one.',
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#B97A3E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="bg-black antialiased text-white overflow-x-hidden"
        style={{
          fontFamily: 'var(--font-body)',
        }}
      >
        {children}
      </body>
    </html>
  )
}
