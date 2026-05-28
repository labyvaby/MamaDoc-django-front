import { apiRequest } from "./client";

// ── Branch shape (mirrors BranchPayload rename='camel') ──────────────────────

export interface DjangoBranch {
  id: number;
  organizationId: number;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

export function getBranches(): Promise<DjangoBranch[]> {
  return apiRequest<DjangoBranch[]>("/organization/branches/");
}
