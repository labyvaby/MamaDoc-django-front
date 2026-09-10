import React from "react";

import { usePortalOrgSlug } from "./orgSlug";

/**
 * Сессия клиента в биллинговом ЛК: токен и id клиента.
 *
 * Хранится в localStorage, а не в куке — по той же причине, что и сессия
 * пациента на витрине записи: кабинет открыт на домене CRM, и кука клиента
 * столкнулась бы с сессией сотрудника, открывшего `/lk` у себя.
 *
 * Ключ скоупится организацией: токен выдаётся под конкретную организацию, и в
 * чужой она ответит 401 — общий ключ означал бы молчаливый выброс из кабинета
 * при переходе по ссылке другой клиники.
 *
 * Срок жизни токена — 30 дней, но бэк его в ответе не отдаёт (в отличие от
 * витрины записи с `expiresAt`), поэтому истечение мы не предугадываем:
 * протухший токен обнаруживается первым же 401 на `/me/`.
 */

function storageKey(orgSlug: string): string {
  return `erkinai:client-portal:session:${orgSlug}`;
}

interface StoredSession {
  token: string;
  clientId: number;
  phone: string;
}

interface PortalSessionValue {
  /** null — клиент не вошёл. */
  session: StoredSession | null;
  signIn: (phone: string, token: string, clientId: number) => void;
  signOut: () => void;
}

const PortalSessionContext = React.createContext<PortalSessionValue | null>(null);

function readStored(orgSlug: string): StoredSession | null {
  if (!orgSlug) return null;
  try {
    const raw = localStorage.getItem(storageKey(orgSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(orgSlug: string, session: StoredSession | null): void {
  if (!orgSlug) return;
  try {
    if (session) localStorage.setItem(storageKey(orgSlug), JSON.stringify(session));
    else localStorage.removeItem(storageKey(orgSlug));
  } catch {
    // приватный режим / переполненное хранилище — сессия останется в памяти
  }
}

export const ClientPortalSessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const orgSlug = usePortalOrgSlug();
  const [session, setSession] = React.useState<StoredSession | null>(() => readStored(orgSlug));

  // Открыли кабинет другой организации — берём её сессию (обычно её нет).
  const knownOrgRef = React.useRef(orgSlug);
  React.useEffect(() => {
    if (knownOrgRef.current === orgSlug) return;
    knownOrgRef.current = orgSlug;
    setSession(readStored(orgSlug));
  }, [orgSlug]);

  const value = React.useMemo<PortalSessionValue>(
    () => ({
      session,
      signIn: (phone, token, clientId) => {
        const next: StoredSession = { token, clientId, phone };
        setSession(next);
        writeStored(orgSlug, next);
      },
      signOut: () => {
        // Ручки отзыва токена у бэка нет — просто забываем его на устройстве.
        setSession(null);
        writeStored(orgSlug, null);
      },
    }),
    [session, orgSlug],
  );

  return (
    <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>
  );
};

/** Сессия клиента. Вне провайдера — «не вошёл» и no-op. */
export function useClientPortalSession(): PortalSessionValue {
  const ctx = React.useContext(PortalSessionContext);
  return ctx ?? { session: null, signIn: () => {}, signOut: () => {} };
}
