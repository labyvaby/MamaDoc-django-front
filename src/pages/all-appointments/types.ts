import { Appointment } from "../home/types";

export interface HistoryState {
    appointments: Appointment[];
    loading: boolean;
    error: string | null;
}
