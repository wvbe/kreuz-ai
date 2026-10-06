import { Component } from "react";
import type { ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  /**
   * Called once per caught error (logging, a toast).
   */
  onError?: (error: Error) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches errors thrown while rendering the tree below it and shows a message with a retry
 * button instead of a blank page. The game itself lives in the host and is untouched.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  /**
   * The state before any error.
   */
  override state: ErrorBoundaryState = { error: null };

  /**
   * React hook: remembers the error so the next render shows the message.
   *
   * @param error - The thrown error.
   * @returns The new state.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  /**
   * React hook: reports the error.
   *
   * @param error - The thrown error.
   */
  override componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  /**
   * Renders the children, or the message after an error.
   *
   * @returns The element.
   */
  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <div className="kv-error" role="alert">
        <h2>Something went wrong</h2>
        <p>{this.state.error.message}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
