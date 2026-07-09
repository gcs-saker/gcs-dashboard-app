import { authHandlers } from "./authHandlers";
import { dashboardHandlers } from "./dashboardHandlers";
import { streamHandlers } from "./streamHandlers";

export const handlers = [
  ...authHandlers,
  ...streamHandlers,
  ...dashboardHandlers,
];
