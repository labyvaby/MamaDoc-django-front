import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../utility/supabaseClient";
import { DB_TABLES } from "../../utility/constants";

export type PatientBalance = {
  balance: number;
  bonuses: number;
};

export type TopUpType = "balance" | "bonuses";
export type PaymentMethod = "cash" | "card" | "free";

export type TopUpPayload = {
  type: TopUpType;
  amount: number;
  payment_method?: PaymentMethod; // required for balance
  note?: string;
};

type State = {
  data: PatientBalance | null;
  loading: boolean;
  errorMsg: string | null;
};

export function usePatientBalance(patientId: string | null | undefined) {
  const [state, setState] = useState<State>({
    data: null,
    loading: false,
    errorMsg: null,
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) {
      setState({ data: null, loading: false, errorMsg: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, errorMsg: null }));

    const { data, error } = await supabase
      .from(DB_TABLES.PATIENT_BALANCES)
      .select("balance, bonuses")
      .eq("patient_id", patientId)
      .maybeSingle();

    if (error) {
      setState({ data: null, loading: false, errorMsg: error.message });
      return;
    }

    setState({
      data: data
        ? {
            balance: Number(data.balance) || 0,
            bonuses: Number(data.bonuses) || 0,
          }
        : { balance: 0, bonuses: 0 },
      loading: false,
      errorMsg: null,
    });
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const topUp = useCallback(
    async (payload: TopUpPayload): Promise<boolean> => {
      if (!patientId) return false;

      setSubmitting(true);
      setSubmitError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase.rpc("top_up_patient_balance", {
        p_patient_id: patientId,
        p_type: payload.type,
        p_amount: payload.amount,
        p_payment_method: (payload.payment_method && payload.payment_method !== "free") ? payload.payment_method : null,
        p_note: payload.note ?? null,
        p_created_by: user?.id ?? null,
      });

      setSubmitting(false);

      if (error) {
        setSubmitError(error.message);
        return false;
      }

      // RPC returns an array with one row (columns prefixed with out_)
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setState({
          data: {
            balance: Number(row.out_balance) || 0,
            bonuses: Number(row.out_bonuses) || 0,
          },
          loading: false,
          errorMsg: null,
        });
      }

      return true;
    },
    [patientId]
  );

  return {
    balance: state.data,
    loading: state.loading,
    errorMsg: state.errorMsg,
    submitting,
    submitError,
    topUp,
    reload: load,
  };
}
