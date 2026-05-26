import React from "react";
import { supabase } from "../../utility/supabaseClient";

export type OldConclusion = {
  id: string;
  legacy_id: string | null;
  appointment_id: string | null;
  patient_number: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  temperature: number | null;
  complaints: string | null;
  diagnosis: string | null;
  diagnosis_catalog: string | null;
  anamnesis: string | null;
  objective: string | null;
  recommendations: string | null;
  doctor_comment: string | null;
  document_path: string | null;
  patient_document_path: string | null;
  photo: string | null;
  changed_at: string | null;
  changed_by: string | null;
  ask_for_feedback: boolean;
};

export function useOldConclusions(patientPhone?: string) {
  const [data, setData] = React.useState<OldConclusion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!patientPhone) {
      setData([]);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    // Очищаем номер от плюсов, пробелов, скобок
    const cleanNumber = patientPhone.replace(/\D/g, '');

    // Генерируем возможные варианты форматов для точного совпадения (чтобы избежать таймаутов от ILIKE)
    const forms: string[] = [];
    forms.push(cleanNumber);
    forms.push(`+${cleanNumber}`);
    
    // Если номер кыргызский (+996...), добавим варианты с нулем и без кода
    if (cleanNumber.startsWith('996') && cleanNumber.length === 12) {
      const core = cleanNumber.slice(3); // 500201877
      forms.push(core); // 500201877
      forms.push(`0${core}`); // 0500201877
      // Формат со скобками и пробелами: +996 (500) 201 877, +996 500 201 877
      forms.push(`+996 ${core.slice(0,3)} ${core.slice(3,6)} ${core.slice(6)}`);
      forms.push(`996 ${core.slice(0,3)} ${core.slice(3,6)} ${core.slice(6)}`);
    }

    const ctrl = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        console.log("[useOldConclusions] searching for forms:", forms);

        const { data: ocData, error } = await supabase
          .from("old_conclusions")
          .select("*")
          .in("patient_number", forms)
          .order("changed_at", { ascending: false })
          .abortSignal(ctrl.signal);

        console.log("[useOldConclusions] result:", { ocData, error });

        if (error) throw error;

        setData(ocData as OldConclusion[]);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setErrorMsg(err.message || String(err));
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [patientPhone]);

  return { data, loading, errorMsg };
}
