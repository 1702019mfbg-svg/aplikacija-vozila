import { Component, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Umesto praznog ekrana prikazuje poruku i dugme za osvežavanje. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="login">
        <div className="login-card card">
          <h1 className="brand">Nešto nije u redu</h1>
          <p className="muted">Došlo je do greške u aplikaciji. Podaci su bezbedni. Osvežite stranicu.</p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Osveži
          </button>
        </div>
      </main>
    )
  }
}
