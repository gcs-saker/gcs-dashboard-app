import type { ReactNode } from "react";

interface DashboardStoryShellProps {
  children: ReactNode;
  description: string;
  title: string;
}

export function DashboardStoryShell({ children, description, title }: DashboardStoryShellProps) {
  return (
    <main className="dashboard-story-shell">
      <header className="dashboard-story-shell__header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  );
}
