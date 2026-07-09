import type { StoryDefault } from "@ladle/react";
import { useState } from "react";

import { DashboardErrorBoundary } from "./ErrorBoundary";

export default {
  title: "UI/Error boundary",
} satisfies StoryDefault;

function MaybeBrokenPanel({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("story panel failure");
  }
  return <section className="dashboard-error-boundary"><strong>패널 복구 완료</strong></section>;
}

export function Recovery() {
  const [shouldThrow, setShouldThrow] = useState(true);

  return (
    <main style={{ background: "#05101a", minHeight: "100vh", padding: 24 }}>
      <DashboardErrorBoundary
        boundaryId="story:error-boundary"
        onReset={() => setShouldThrow(false)}
        scope="panel"
        title="지도"
      >
        <MaybeBrokenPanel shouldThrow={shouldThrow} />
      </DashboardErrorBoundary>
    </main>
  );
}
