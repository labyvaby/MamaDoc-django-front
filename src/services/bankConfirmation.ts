import { supabase } from "../utility/supabaseClient";

export type BankCandidate = {
    movement_id: string;
    credit_amount: number;
    transaction_date: string;
    comment: string | null;
    time_diff_min: number;
    already_used: boolean;
};

export const findBankCandidates = async (appointmentId: string): Promise<BankCandidate[]> => {
    const { data, error } = await supabase
        .rpc("find_bank_candidates", { p_appointment_id: appointmentId });
    if (error) throw error;
    return (data ?? []) as BankCandidate[];
};

export const confirmBankPayment = async (
    appointmentId: string,
    movementId: string,
    comment?: string,
): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await supabase
        .rpc("confirm_bank_payment", {
            p_appointment_id: appointmentId,
            p_movement_id:    movementId,
            p_comment:        comment ?? null,
        });
    if (error) throw error;
    return data as { ok: boolean; error?: string };
};
