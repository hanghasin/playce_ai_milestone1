'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = { error: Error | null }

export class PlayceErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PlayceErrorBoundary]', error, info.componentStack)
  }

  private handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <main
          className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center"
          style={{ background: 'var(--bg)', color: '#ffffff' }}
        >
          <p style={{ fontSize: 28, lineHeight: 1, opacity: 0.85 }} aria-hidden>
            ⚠
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>
            This page couldn&apos;t load
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>
            Reload to try again, or go back.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="cursor-pointer border-0 px-6 py-3 text-sm font-medium"
              style={{
                background: '#ffffff',
                color: '#0a0a0a',
                borderRadius: 5,
                fontFamily: 'var(--font-display)',
              }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="cursor-pointer px-6 py-3 text-sm font-medium"
              style={{
                background: 'transparent',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 5,
                fontFamily: 'var(--font-display)',
              }}
            >
              Back
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
