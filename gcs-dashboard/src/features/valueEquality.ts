export function haveEqualFields<T>(left: T, right: T, fields: readonly (keyof T)[]): boolean {
  return fields.every((field) => left[field] === right[field]);
}
