import React, { createContext, useContext, useState, useCallback } from "react";

export type ClientPatient = {
  id: string;
  fio: string;
  phone?: string | null;
  birth_date?: string | null;
  photo?: string | null;
};

type ClientSessionContextType = {
  patient: ClientPatient | null;
  setPatient: (p: ClientPatient | null) => void;
  logout: () => void;
};

const SESSION_KEY = "client_patient";

function loadFromSession(): ClientPatient | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ClientPatient) : null;
  } catch {
    return null;
  }
}

const ClientSessionContext = createContext<ClientSessionContextType | null>(null);

export const ClientSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [patient, setPatientState] = useState<ClientPatient | null>(loadFromSession);

  const setPatient = useCallback((p: ClientPatient | null) => {
    setPatientState(p);
    if (p) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(p));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const logout = useCallback(() => setPatient(null), [setPatient]);

  return (
    <ClientSessionContext.Provider value={{ patient, setPatient, logout }}>
      {children}
    </ClientSessionContext.Provider>
  );
};

export function useClientSession() {
  const ctx = useContext(ClientSessionContext);
  if (!ctx) throw new Error("useClientSession must be used inside ClientSessionProvider");
  return ctx;
}
