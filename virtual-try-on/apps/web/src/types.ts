export type AccountKind = "CUSTOMER" | "WORKFORCE";
export type MembershipRole = "STORE_ADMIN" | "STAFF";
export type MembershipState = "ACTIVE" | "INVITED";
export interface Membership {
  membershipId: string;
  storeId: string;
  storeName: string;
  role: MembershipRole;
  state: MembershipState;
}
export interface User {
  id: string;
  kind: AccountKind;
  name: string;
  email?: string;
  phone?: string;
  phoneVerified?: boolean;
  enabled: boolean;
  superAdmin: boolean;
  passwordChangeRequired: boolean;
  memberships: Membership[];
}
export interface AuthConfig {
  signupEnabled: boolean;
  captcha: {
    mode: "LOCAL_TEST" | "RECAPTCHA_ENTERPRISE" | "DISABLED";
    siteKey?: string;
    action: string;
  };
  passwordMinLength: number;
}
export interface Store {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  contactPhone?: string;
  status: "PENDING" | "ACTIVE" | "ARCHIVED";
}
export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MembershipRole;
  state: MembershipState;
}
export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}
export interface Provision {
  user: User;
  membership?: Member;
  temporaryPassword?: string;
}
export interface Problem {
  title?: string;
  detail?: string;
  status?: number;
  code?: string;
  fieldErrors?: Record<string, string | string[]>;
}
