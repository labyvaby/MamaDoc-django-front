import { supabase } from "./supabaseClient";

export type AppointmentNotificationType = "appointment_change" | "appointment_cancel";

interface NotificationPayload {
  appointment_id: string;
  notification_type: AppointmentNotificationType;
  patient_phone: string;
  patient_name: string;
  appointment_at: string;
  doctor_name: string;
}

export async function sendAppointmentNotification(payload: NotificationPayload): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("appointment-notifications", {
      body: { notification: payload },
    });
    if (error) {
      console.error("appointment-notifications edge function error:", error);
    }
  } catch (e) {
    console.error("Failed to invoke appointment-notifications:", e);
  }
}
