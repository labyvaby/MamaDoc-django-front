import { apiRequest } from "./client";

export interface PlatformModule {
  id: number;
  code: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  sortOrder: number;
}

export interface OrganizationModule {
  id: number;
  organizationId: number;
  moduleCode: string;
  moduleName: string;
  moduleCategory: string;
  isEnabled: boolean;
  enabledAt: string | null;
  disabledAt: string | null;
  notes: string;
}

export interface OrganizationPlan {
  planCode: string;
  planName: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  maxClients: number | null;
  clientsUsed: number;
  maxStaff: number | null;
  staffUsed: number;
  maxSmsPerMonth: number | null;
  smsUsedThisMonth: number;
}

export interface PlanChargeHistory {
  id: number;
  planCode: string;
  amount: string;
  periodStart: string;
  periodEnd: string;
  chargedAt: string;
}

const scope = (organizationId?: number) => organizationId ? `?organizationId=${organizationId}` : "";

export const tenancyApi = {
  modules: () => apiRequest<PlatformModule[]>("/tenancy/modules/"),
  organizationModules: (organizationId: number) => apiRequest<OrganizationModule[]>(`/tenancy/organizations/${organizationId}/modules/`),
  updateOrganizationModules: (organizationId: number, enabledModules: string[]) =>
    apiRequest<OrganizationModule[]>(`/tenancy/organizations/${organizationId}/modules/`, { method: "PATCH", body: { enabledModules } }),
  plan: (organizationId?: number) => apiRequest<OrganizationPlan>(`/tenancy/plan/${scope(organizationId)}`),
  planHistory: (organizationId?: number) => apiRequest<PlanChargeHistory[]>(`/tenancy/plan/history/${scope(organizationId)}`),
};

