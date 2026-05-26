import { Component, type ErrorInfo, type ReactNode } from "react";

interface StreamPanelErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel: string;
}

interface StreamPanelErrorBoundaryState {
  hasError: boolean;
}

export class StreamPanelErrorBoundary extends Component<
  StreamPanelErrorBoundaryProps,
  StreamPanelErrorBoundaryState
> {
  state: StreamPanelErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): StreamPanelErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // The UI boundary is intentionally local; central logging can be wired later.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="stream-card stream-card--failed" role="status">
          <span className="stream-card__topline">
            <strong>{this.props.fallbackLabel}</strong>
            <span className="ops-badge is-error">오류</span>
          </span>
          <span className="stream-card__failure">이 스트림 패널만 격리되었습니다.</span>
        </div>
      );
    }

    return this.props.children;
  }
}
