/** True for a `/`-separated path that stays inside the directory it is joined to: no root, backslash, or empty, `.` or `..` segment. */
export function isSafeRelativePath(value: string) {
  return !value.includes('\\') && value.split('/').every((part) => part && part !== '.' && part !== '..')
}
