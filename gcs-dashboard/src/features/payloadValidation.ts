export type PayloadGuard = (value: unknown) => boolean;
export type PayloadSchema = Readonly<Record<string, PayloadGuard>>;

export function matchesPayloadSchema(payload: unknown, schema: PayloadSchema): boolean {
  if (!isRecord(payload)) return false;
  return Object.entries(schema).every(([field, guard]) => guard(payload[field]));
}

export function isArrayOf<T>(guard: (value: unknown) => value is T): (value: unknown) => value is T[] {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(guard);
}

export function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isOptionalNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isNumber(value);
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}
