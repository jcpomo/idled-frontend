export function canManageTypes(role: string | null): boolean {
  return role === 'admin' || role === 'direccion'
}
