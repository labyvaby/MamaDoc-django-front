import { apiRequest } from "./client";

export interface ActiveAnnouncement {
  id: number;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "ERROR";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export interface AnnouncementRoleShort {
  id: number;
  name: string;
}

export interface AnnouncementEmployeeShort {
  id: number;
  fullName: string;
}

export interface AnnouncementBranchShort {
  id: number;
  name: string;
}

export interface AnnouncementCreatorShort {
  id: number;
  fullName: string;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  targetType: "ALL" | "ROLES" | "EMPLOYEES";
  targetRoles: AnnouncementRoleShort[];
  targetEmployees: AnnouncementEmployeeShort[];
  targetBranches: AnnouncementBranchShort[];
  severity: "INFO" | "WARNING" | "ERROR";
  status: "ACTIVE" | "EXPIRED" | "INACTIVE";
  isActive: boolean;
  expiresAt?: string | null;
  creator?: AnnouncementCreatorShort | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementCreatePayload {
  title: string;
  message: string;
  targetType: "ALL" | "ROLES" | "EMPLOYEES";
  targetRoleIds?: number[];
  targetEmployeeIds?: number[];
  targetBranchIds?: number[];
  severity: "INFO" | "WARNING" | "ERROR";
  isActive: boolean;
  expiresAt?: string | null;
}

export async function getActiveAnnouncements(): Promise<ActiveAnnouncement[]> {
  return apiRequest<ActiveAnnouncement[]>("/notifications/announcements/active/");
}

export async function getAnnouncements(): Promise<Announcement[]> {
  return apiRequest<Announcement[]>("/notifications/announcements/");
}

export async function createAnnouncement(
  payload: AnnouncementCreatePayload
): Promise<Announcement> {
  return apiRequest<Announcement>("/notifications/announcements/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateAnnouncement(
  id: number,
  payload: Partial<AnnouncementCreatePayload>
): Promise<Announcement> {
  return apiRequest<Announcement>(`/notifications/announcements/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteAnnouncement(id: number): Promise<void> {
  return apiRequest<void>(`/notifications/announcements/${id}/`, {
    method: "DELETE",
  });
}
