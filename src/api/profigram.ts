import { apiRequest } from "./client";

export interface Tariff {
  id: string;
  name: string;
  price: number;
  description?: string;
}

export interface ProfigramInvitePayload {
  doctorPhone: string;
  patientPhone: string;
  tariffId: string;
  doctorId?: string | number;
  patientName?: string;
  note?: string;
}

export interface ProfigramInviteResponse {
  success: boolean;
  message: string;
}

/**
 * Fetch Profigram monitoring tariffs for a doctor.
 */
export async function getProfigramTariffs(doctorPhone: string): Promise<Tariff[]> {
  const query = doctorPhone ? `?phone_number=${encodeURIComponent(doctorPhone)}` : "";
  return apiRequest<Tariff[]>(`/profigram/tariffs/${query}`);
}

/**
 * Send a Profigram invitation to a patient.
 */
export async function sendProfigramInvite(
  payload: ProfigramInvitePayload,
): Promise<ProfigramInviteResponse> {
  return apiRequest<ProfigramInviteResponse>("/profigram/invite/", {
    method: "POST",
    body: payload,
  });
}
