import type { ReactNode, ErrorInfo } from "react";
import { Component } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg text-text p-4">
          <div className="max-w-lg p-6 rounded-2xl bg-surface shadow-premium border border-border">
            <h1 className="text-2xl font-display font-black text-text mb-4">Something went wrong</h1>
            <p className="text-text-muted mb-4">{this.state.error?.message}</p>
            <pre className="text-xs bg-surface-soft p-4 rounded-xl overflow-auto text-text-muted">{this.state.error?.stack}</pre>
            <button
              className="mt-6 btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
