import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element #root was not found");
}

void prepareApplication().then(() => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

async function prepareApplication(): Promise<void> {
  if (!import.meta.env.DEV) {
    return;
  }
  const { enableMocking } = await import("./mocks/enableMocking");
  await enableMocking();
}
