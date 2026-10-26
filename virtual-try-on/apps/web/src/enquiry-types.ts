import type { ProductSnapshot } from "./tryon-types";
export type EnquiryStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "AWAITING_CUSTOMER_RESPONSE"
  | "CUSTOMER_REPLIED"
  | "CLOSED";
export type EnquiryOutcome =
  | "CONTACTED"
  | "CONVERTED"
  | "NOT_INTERESTED"
  | "UNREACHABLE";
export interface EnquiryConfig {
  consent: { version: string; notice: string };
  limits: { noteChars: number; messageChars: number };
  outcomes: EnquiryOutcome[];
}
export interface Assignee {
  id: string;
  name: string;
}
export interface EnquiryEvent {
  id: number;
  type: string;
  actor: {
    name: string;
    kind: "CUSTOMER" | "WORKFORCE" | "SYSTEM";
    id?: string;
  };
  text: string | null;
  redacted: boolean;
  createdAt: string;
  fromStatus?: EnquiryStatus | null;
  toStatus?: EnquiryStatus | null;
  outcome?: EnquiryOutcome | null;
  visibility?: "PUBLIC" | "INTERNAL";
  fromAssignee?: Assignee | null;
  toAssignee?: Assignee | null;
}
export interface Enquiry {
  id: string;
  product: ProductSnapshot;
  contact: {
    name: string;
    phone: string | null;
    phoneVerified: false;
    state: "AVAILABLE" | "REMOVED_ACCOUNT" | "EXPIRED";
  };
  status: EnquiryStatus;
  outcome: EnquiryOutcome | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  contactRemovedAt: string | null;
  canReply: boolean;
  events?: EnquiryEvent[];
}
export interface StaffEnquiry extends Enquiry {
  assignee: Assignee | null;
  canClaim: boolean;
  canAssign: boolean;
  canChangeStatus: boolean;
  canReopen: boolean;
  canAddNote: boolean;
}
export interface EnquiryCounts {
  unassignedNew: number;
  active: number;
}
export interface StoreAssignee {
  userId: string;
  name: string;
  role: string;
}
export const statuses: EnquiryStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "AWAITING_CUSTOMER_RESPONSE",
  "CUSTOMER_REPLIED",
  "CLOSED",
];
export const statusName: Record<EnquiryStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  AWAITING_CUSTOMER_RESPONSE: "Awaiting customer response",
  CUSTOMER_REPLIED: "Customer replied",
  CLOSED: "Closed",
};
export const outcomeName: Record<EnquiryOutcome, string> = {
  CONTACTED: "Contacted",
  CONVERTED: "Converted",
  NOT_INTERESTED: "Not interested",
  UNREACHABLE: "Unreachable",
};
export const transitions: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW: [],
  OPEN: ["IN_PROGRESS", "AWAITING_CUSTOMER_RESPONSE", "CLOSED"],
  IN_PROGRESS: ["AWAITING_CUSTOMER_RESPONSE", "CLOSED"],
  AWAITING_CUSTOMER_RESPONSE: ["IN_PROGRESS", "CLOSED"],
  CUSTOMER_REPLIED: ["IN_PROGRESS", "AWAITING_CUSTOMER_RESPONSE", "CLOSED"],
  CLOSED: [],
};
