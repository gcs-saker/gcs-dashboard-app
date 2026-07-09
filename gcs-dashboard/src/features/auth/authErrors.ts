export const AUTH_API_ERROR_MESSAGES = Object.freeze({
  generic: "authentication request failed",
});

export class AuthApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

export async function parseAuthError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail ?? AUTH_API_ERROR_MESSAGES.generic;
  } catch {
    return AUTH_API_ERROR_MESSAGES.generic;
  }
}
