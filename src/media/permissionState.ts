export type PermissionFailure = 'denied' | 'unavailable'

export function permissionFailure(error: unknown): PermissionFailure {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'denied'
  }
  return 'unavailable'
}
