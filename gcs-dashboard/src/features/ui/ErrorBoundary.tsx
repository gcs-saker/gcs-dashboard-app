import { Component, type ErrorInfo, type ReactNode } from "react";
import { ERROR_BOUNDARY_COPY, type ErrorBoundaryScope } from "./errorBoundaryContracts";
import { reportErrorBoundaryError } from "./errorBoundaryLogger";
import "./ErrorBoundary.css";

interface DashboardErrorBoundaryProps {
  boundaryId: string;
  children: ReactNode;
  description?: string;
  onReset?: () => void;
  resetKeys?: readonly unknown[];
  retryLabel?: string;
  scope: ErrorBoundaryScope;
  title: string;
}

interface DashboardErrorBoundaryState {
  hasError: boolean;
}

export class DashboardErrorBoundary extends Component<DashboardErrorBoundaryProps, DashboardErrorBoundaryState> {
  state: DashboardErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): DashboardErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportErrorBoundaryError({
      boundaryId: this.props.boundaryId,
      componentStack: errorInfo.componentStack || null,
      error,
      scope: this.props.scope,
      title: this.props.title,
    });
  }

  componentDidUpdate(previousProps: DashboardErrorBoundaryProps): void {
    if (this.state.hasError && didResetKeysChange(previousProps.resetKeys, this.props.resetKeys)) {
      this.setState({ hasError: false });
    }
  }

  private readonly reset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="dashboard-error-boundary" role="alert" aria-label={`${this.props.title} 복구`}>
        <span className="dashboard-error-boundary__topline">
          <strong>{this.props.title}</strong>
          <span className="dashboard-error-boundary__badge">{ERROR_BOUNDARY_COPY.badge}</span>
        </span>
        <p>{this.props.description ?? ERROR_BOUNDARY_COPY.defaultDescription}</p>
        <button className="dashboard-error-boundary__retry" onClick={this.reset} type="button">
          {this.props.retryLabel ?? ERROR_BOUNDARY_COPY.defaultRetryLabel}
        </button>
      </section>
    );
  }
}

function didResetKeysChange(previousKeys: readonly unknown[] = [], nextKeys: readonly unknown[] = []): boolean {
  return previousKeys.length !== nextKeys.length || previousKeys.some((previousKey, index) => !Object.is(previousKey, nextKeys[index]));
}
