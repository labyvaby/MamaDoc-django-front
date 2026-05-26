import { Appointment } from "../home/types";

// Re-using Appointment type mostly, but we might want a specific subset
export type HistoryRow = {
    id: string;
    appointment_at: string; // ISO
    patient_name: string;
    service_names: string;
    total_cost: number;
    status: string;
    doctor_name: string;
    performer_ids?: string[];
    doctor_id?: string;
};

export type HistoryFilterVariables = {
    start_date?: string;
    end_date?: string;
    patient_name?: string;
    employee_id?: string;
};
