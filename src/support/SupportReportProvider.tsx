import React from "react";

import { usePermissions } from "../hooks/usePermissions";
import { BugFab } from "./BugFab";
import { useSupportAccess } from "./useSupport";
import { buildAutoDescription } from "./autoDescription";
import {
  clearProblem,
  collectDiagnostics,
  getActionsForDescription,
  getPreviousRoute,
  getRecentProblem,
  installRecorder,
  onProblem,
  type Problem,
} from "./diagnosticsRecorder";
import { ReportDialog } from "./ReportDialog";
import { captureScreenshot } from "./screenshot";
import type { OpenReportOptions, ReportSession } from "./types";

interface SupportReportContextValue {
  /**
   * Сделать снимок экрана, собрать технические данные и открыть форму.
   * Снимок делается ДО открытия панели — иначе на нём была бы сама панель.
   */
  openReport: (options?: OpenReportOptions) => Promise<void>;
  /** Идёт подготовка (снимок экрана) — кнопку-триггер стоит заблокировать. */
  preparing: boolean;
  /** Недавний сбой, из-за которого показывается жук. */
  problem: Problem | null;
}

const SupportReportContext = React.createContext<SupportReportContextValue | null>(null);

export const useSupportReport = (): SupportReportContextValue => {
  const ctx = React.useContext(SupportReportContext);
  if (!ctx) throw new Error("useSupportReport must be used within SupportReportProvider");
  return ctx;
};

/**
 * Узел обращений в поддержку внутри авторизованного приложения: слушает сбои
 * (recorder), показывает кнопку-жук и открывает форму с заготовкой.
 */
export const SupportReportProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { role, activeOrganization, activeBranch } = usePermissions();
  const { canCreate } = useSupportAccess();
  const [problem, setProblem] = React.useState<Problem | null>(() => getRecentProblem());
  const [fabVisible, setFabVisible] = React.useState(() => getRecentProblem() !== null);
  const [preparing, setPreparing] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState<ReportSession | null>(null);
  const counter = React.useRef(0);
  const busyRef = React.useRef(false);

  React.useEffect(() => {
    installRecorder();
    // Подгружаем библиотеку снимков заранее, в простое: первое нажатие на жука
    // не должно ждать загрузку чанка (и укладываться в таймаут вместе с ней).
    const warm = window.setTimeout(() => void import("html-to-image"), 3000);
    const off = onProblem((next) => {
      setProblem(next);
      setFabVisible(true);
    });
    return () => {
      window.clearTimeout(warm);
      off();
    };
  }, []);

  const roleName = role?.name;
  const organizationId = activeOrganization?.id;
  const branchId = activeBranch?.id;

  const openReport = React.useCallback(
    async (options: OpenReportOptions = {}) => {
      if (busyRef.current || !canCreate) return;
      busyRef.current = true;
      setPreparing(true);
      try {
        const recent = getRecentProblem();
        const screenshot = await captureScreenshot();
        const current = window.location.pathname;
        // Со страницы «Поддержка» обращение почти всегда про предыдущую страницу.
        const route = current.startsWith("/support") ? getPreviousRoute() || current : current;
        const diagnostics = collectDiagnostics({ role: roleName, organizationId, branchId });
        const auto = buildAutoDescription(recent, route, getActionsForDescription());
        counter.current += 1;
        setSession({
          id: counter.current,
          category: options.category ?? "bug",
          problem: recent,
          screenshot,
          auto,
          diagnostics,
          route,
        });
        setFabVisible(false);
        setOpen(true);
      } finally {
        busyRef.current = false;
        setPreparing(false);
      }
    },
    [roleName, organizationId, branchId, canCreate],
  );

  const value = React.useMemo<SupportReportContextValue>(
    () => ({ openReport, preparing, problem }),
    [openReport, preparing, problem],
  );

  return (
    <SupportReportContext.Provider value={value}>
      {children}
      <BugFab
        visible={canCreate && fabVisible && !open}
        busy={preparing}
        onOpen={() => void openReport({ category: "bug" })}
        onDismiss={() => {
          setFabVisible(false);
          clearProblem();
        }}
      />
      <ReportDialog open={open} session={session} onClose={() => setOpen(false)} />
    </SupportReportContext.Provider>
  );
};

export default SupportReportProvider;
