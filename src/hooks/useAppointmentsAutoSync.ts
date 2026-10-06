import React from "react";
import { getAppointmentsLastUpdate } from "../api/appointments";
import { isAbortError } from "../api/client";
import {
  DJANGO_HEARTBEAT_INTERVAL_MS,
  DJANGO_REALTIME_FALLBACK_INTERVAL_MS,
} from "../api/queryKeys";
import { useChangesSocket } from "./useChangesSocket";

type Options = {
  branchId?: number;
  organizationId?: number;
  enabled?: boolean;
  onChange: () => void;
};

const WS_EVENT_DEBOUNCE_MS = 200;
const HEARTBEAT_REQUEST_TIMEOUT_MS = 15_000;
const HEARTBEAT_ERROR_MAX_INTERVAL_MS = 60_000;

/**
 * WebSocket hints trigger a refresh; MAX(updated_at)+COUNT polling covers lost
 * hints. Hidden-tab events stay pending until the tab becomes visible.
 * Forms do not pause synchronization. One heartbeat runs at a time, with a
 * deadline so a stalled request cannot stop synchronization indefinitely.
 */
export function useAppointmentsAutoSync({
  branchId,
  organizationId,
  enabled = true,
  onChange,
}: Options): void {
  // undefined is an unread baseline; null is a valid empty collection token.
  const lastSeenRef = React.useRef<string | null | undefined>(undefined);
  const pendingRef = React.useRef(false);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const wsEventRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    lastSeenRef.current = undefined;
    pendingRef.current = false;
  }, [branchId, organizationId]);

  const wsConnected = useChangesSocket({
    branchId,
    organizationId,
    enabled: enabled && branchId != null,
    onMessage: (msg) => {
      if (msg.entity === "appointment" || msg.entity === "conclusion") {
        pendingRef.current = true;
        wsEventRef.current?.();
      }
    },
  });

  React.useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;
    let consecutiveFailures = 0;
    const controller = new AbortController();
    let wsDebounce: number | undefined;
    let heartbeatTimer: number | undefined;

    const readLatest = async () => {
      const requestController = new AbortController();
      let deadline: number | undefined;
      let abortRequest: () => void = () => {};
      const bounded = new Promise<never>((_, reject) => {
        abortRequest = () => {
          requestController.abort();
          reject(new DOMException("Synchronization stopped", "AbortError"));
        };
        controller.signal.addEventListener("abort", abortRequest, { once: true });
        deadline = window.setTimeout(() => {
          // Reject before aborting fetch so a deadline counts as a failure.
          reject(new Error("Appointment heartbeat timed out"));
          requestController.abort();
        }, HEARTBEAT_REQUEST_TIMEOUT_MS);
      });
      try {
        return await Promise.race([
          getAppointmentsLastUpdate(branchId, requestController.signal, organizationId),
          bounded,
        ]);
      } finally {
        window.clearTimeout(deadline);
        controller.signal.removeEventListener("abort", abortRequest);
      }
    };

    const flushEvents = () => {
      if (cancelled || document.hidden || !pendingRef.current) return;
      pendingRef.current = false;
      // A committed change must refresh the screen even if last-update hangs.
      onChangeRef.current();
      void check(true);
    };

    const scheduleEventCheck = () => {
      if (cancelled || document.hidden) return;
      window.clearTimeout(wsDebounce);
      wsDebounce = window.setTimeout(flushEvents, WS_EVENT_DEBOUNCE_MS);
    };

    const check = async (alreadyRefreshed = false) => {
      if (cancelled || document.hidden || inFlight) return;
      inFlight = true;
      try {
        const latest = await readLatest();
        if (cancelled) return;
        const changed = lastSeenRef.current === undefined
          ? consecutiveFailures > 0
          : latest !== lastSeenRef.current;
        consecutiveFailures = 0;
        lastSeenRef.current = latest;
        if (changed && !alreadyRefreshed) onChangeRef.current();
      } catch (err) {
        if (cancelled) return;
        if (!isAbortError(err)) consecutiveFailures += 1;
      } finally {
        inFlight = false;
      }
    };
    wsEventRef.current = scheduleEventCheck;
    // Replaying a hidden event also works when the connection changes state.
    if (pendingRef.current) flushEvents();

    const baseIntervalMs = wsConnected
      ? DJANGO_REALTIME_FALLBACK_INTERVAL_MS
      : DJANGO_HEARTBEAT_INTERVAL_MS;
    const scheduleNextCheck = () => {
      if (cancelled) return;
      const interval = Math.min(
        baseIntervalMs * 2 ** Math.min(consecutiveFailures, 3),
        HEARTBEAT_ERROR_MAX_INTERVAL_MS,
      );
      heartbeatTimer = window.setTimeout(async () => {
        await check();
        scheduleNextCheck();
      }, interval);
    };
    void check().finally(scheduleNextCheck);

    const onWake = () => {
      if (document.hidden) return;
      if (pendingRef.current) flushEvents();
      else void check();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    return () => {
      cancelled = true;
      controller.abort();
      wsEventRef.current = null;
      window.clearTimeout(wsDebounce);
      window.clearTimeout(heartbeatTimer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [branchId, organizationId, enabled, wsConnected]);
}
