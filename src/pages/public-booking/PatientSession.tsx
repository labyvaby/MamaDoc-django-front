import React from "react";

import {
  getPatientMe,
  isPatientTokenInvalid,
  logoutPatient,
  type PatientCard,
  type PatientSessionResult,
} from "../../api/publicPatient";
import { useBookingOrgSlug } from "./orgSlug";

/**
 * Сессия пациента на витрине: токен, доступные карты и выбранная карта.
 *
 * Живёт в localStorage, а не в куке: витрина на том же домене, что CRM, и
 * пациентская кука столкнулась бы с сессией сотрудника — врач, открывший /book
 * у себя, получил бы смешанное состояние.
 *
 * Выбранная карта нужна для предзаполнения формы записи. Историю по картам
 * разделить нельзя: бэк не отдаёт привязки записи к карте (тикет
 * `backend_ticket_booking_patient_cabinet_2026-08-05.md` §1) — поэтому «Мои
 * записи» показывают всё, что привязано к номеру.
 */

/**
 * Ключ хранения скоупится клиникой: витрины разных организаций живут на одном
 * домене, а токен пациента выдаётся под конкретную организацию — общий ключ
 * означал бы, что вход в «Мама Доктор» подставляет чужой токен в «Клинику 21»
 * (там он не годится: бэк ответит 401 и молча выкинет пациента).
 */
function storageKey(orgSlug: string): string {
  return `mamadoc:booking:patient-session:${orgSlug}`;
}

interface StoredSession {
  token: string;
  expiresAt: string;
  phone: string;
  patients: PatientCard[];
  selectedPatientId: number | null;
}

interface PatientSessionValue {
  /** null — пациент не вошёл. */
  session: StoredSession | null;
  /** Карта, от лица которой записываемся; null, если карт нет вообще. */
  selectedPatient: PatientCard | null;
  /** Сохранить результат входа (A2) и выбрать карту, если она одна. */
  signIn: (phone: string, result: PatientSessionResult) => void;
  /** Сменить активную карту — без повторного SMS. */
  selectPatient: (patientId: number) => void;
  /** Добавить карту после регистрации (A3) и сделать её активной. */
  addPatient: (patient: PatientCard) => void;
  signOut: () => void;
}

const PatientSessionContext = React.createContext<PatientSessionValue | null>(null);

function readStored(orgSlug: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(storageKey(orgSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token) return null;
    // Токен бэка живёт месяц; просроченный не спрашиваем у сервера — сразу выход.
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(orgSlug: string, session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(storageKey(orgSlug), JSON.stringify(session));
    else localStorage.removeItem(storageKey(orgSlug));
  } catch {
    // приватный режим / переполненное хранилище — сессия останется в памяти
  }
}

export const PatientSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const orgSlug = useBookingOrgSlug();
  const [session, setSession] = React.useState<StoredSession | null>(() => readStored(orgSlug));

  const update = React.useCallback(
    (next: StoredSession | null) => {
      setSession(next);
      writeStored(orgSlug, next);
    },
    [orgSlug],
  );

  // Открыли витрину другой клиники — берём её сессию (обычно её нет: вход
  // в каждой организации свой).
  const knownOrgRef = React.useRef(orgSlug);
  React.useEffect(() => {
    if (knownOrgRef.current === orgSlug) return;
    knownOrgRef.current = orgSlug;
    setSession(readStored(orgSlug));
  }, [orgSlug]);

  // Токен мог быть отозван на бэке (logout с другого устройства, ручной сброс) —
  // проверяем один раз при загрузке и молча выходим, если он больше не годен.
  React.useEffect(() => {
    if (!session) return;
    const ctrl = new AbortController();
    getPatientMe(session.token, ctrl.signal)
      .then((me) => {
        if (ctrl.signal.aborted) return;
        // Карты могли измениться (добавили ребёнка в CRM) — обновляем список.
        if (me.patients.length > 0) {
          setSession((prev) => {
            if (!prev) return prev;
            // Выбор не трогаем, пока он валиден. И не выбираем за пациента:
            // null означает «ещё не выбрал» — тогда показывается экран выбора.
            // Подставляем первую карту только если выбранная исчезла из списка.
            const chosenGone =
              prev.selectedPatientId != null &&
              !me.patients.some((p) => p.id === prev.selectedPatientId);
            const next: StoredSession = {
              ...prev,
              patients: me.patients,
              selectedPatientId: chosenGone ? (me.patients[0]?.id ?? null) : prev.selectedPatientId,
            };
            writeStored(orgSlug, next);
            return next;
          });
        }
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        if (isPatientTokenInvalid(e)) update(null);
      });
    return () => ctrl.abort();
    // Только при монтировании и смене токена: список карт обновлять на каждый
    // рендер незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const value = React.useMemo<PatientSessionValue>(
    () => ({
      session,
      selectedPatient:
        session?.patients.find((p) => p.id === session.selectedPatientId) ?? null,
      signIn: (phone, result) =>
        update({
          token: result.token,
          expiresAt: result.expiresAt,
          phone,
          patients: result.patients,
          // Одна карта — выбираем молча, несколько — спросим на экране выбора.
          selectedPatientId: result.patients.length === 1 ? result.patients[0].id : null,
        }),
      selectPatient: (patientId) =>
        update(session ? { ...session, selectedPatientId: patientId } : null),
      addPatient: (patient) =>
        update(
          session
            ? {
                ...session,
                patients: [...session.patients, patient],
                selectedPatientId: patient.id,
              }
            : null,
        ),
      signOut: () => {
        if (session) void logoutPatient(session.token);
        update(null);
      },
    }),
    [session, update],
  );

  return (
    <PatientSessionContext.Provider value={value}>{children}</PatientSessionContext.Provider>
  );
};

/**
 * Сессия пациента. Вне провайдера возвращает «не вошёл» и no-op — витрина
 * работает и без авторизации, гостевая запись остаётся основным путём.
 */
export function usePatientSession(): PatientSessionValue {
  const ctx = React.useContext(PatientSessionContext);
  return (
    ctx ?? {
      session: null,
      selectedPatient: null,
      signIn: () => {},
      selectPatient: () => {},
      addPatient: () => {},
      signOut: () => {},
    }
  );
}
