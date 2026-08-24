export type AdminUser = {
  id: string
  name: string
  email: string
  image: string | null
  role: 'admin' | 'user'
  banned: boolean
  twoFactorEnabled: boolean
  createdAt: Date
  updatedAt: Date
  rosterCount: number
  battleCount: number
  signInMethods: string[]
}

export type AdminUsersCursor = { createdAt: Date; id: string }
export type AdminUserPage = { users: AdminUser[]; nextCursor: AdminUsersCursor | null }
