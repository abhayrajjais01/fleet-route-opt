// Keeps one broken page from blanking the whole app: shows a recoverable error card instead.
import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
  componentDidCatch(error: Error) { console.error('Page crashed:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5 p-6 text-center">
          <p className="text-base font-semibold text-slate-900">This page hit an error</p>
          <p className="text-sm text-slate-500 mt-1">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} className="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700">Try again</button>
        </div>
      </div>
    )
  }
}
