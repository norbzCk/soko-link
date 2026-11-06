export type UserRole = "user" | "seller" | "admin" | "super_admin" | "owner" | "logistics" | "analyst" | "";

export type UserType = "user" | "business" | "logistics" | "superadmin" | "";

export interface SessionUser {
  id?: number;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  profile_photo?: string;
  role?: UserRole | string;
  business_name?: string;
  owner_name?: string;
  is_verified?: boolean;
  is_active?: boolean;
  active_role?: string;
  roles?: string[];
  user_type?: UserType | string;
  account_status?: string;
}

export interface AuthResponse {
  access_token: string;
  user: SessionUser;
  userType?: UserType;
}
