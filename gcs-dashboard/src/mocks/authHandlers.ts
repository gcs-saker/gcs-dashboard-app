import { http, HttpResponse } from "msw";
import { authUrl } from "@/config";
import { AUTH_ROUTES } from "@/features/apiRoutes";
import { MOCK_OPERATOR_TOKEN } from "./fixtures";
import { hasScenario, json, MockScenario, urlPattern } from "./handlerUtils";

export const authHandlers = [
  http.post(urlPattern(authUrl(AUTH_ROUTES.login)), ({ request }) => {
    if (hasScenario(request, MockScenario.AUTH_500)) {
      return json({ detail: "mock auth failure" }, 500);
    }
    return json(MOCK_OPERATOR_TOKEN);
  }),
  http.post(urlPattern(authUrl(AUTH_ROUTES.refresh)), ({ request }) => {
    if (hasScenario(request, MockScenario.AUTH_401)) {
      return json({ detail: "mock refresh expired" }, 401);
    }
    return json(MOCK_OPERATOR_TOKEN);
  }),
  http.post(urlPattern(authUrl(AUTH_ROUTES.logout)), () => new HttpResponse(null, { status: 204 })),
  http.post(urlPattern(authUrl(AUTH_ROUTES.signup)), () =>
    json({
      id: 3,
      username: "preview-user",
      email: "preview-user@example.test",
      company_id: 1,
      role: "viewer",
    }, 201),
  ),
  http.get(urlPattern(authUrl(AUTH_ROUTES.me)), ({ request }) => {
    if (hasScenario(request, MockScenario.AUTH_403)) {
      return json({ detail: "mock operator forbidden" }, 403);
    }
    return json({
      username: MOCK_OPERATOR_TOKEN.username,
      role: MOCK_OPERATOR_TOKEN.role,
    });
  }),
];
