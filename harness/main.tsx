import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { RefineSnackbarProvider } from "@refinedev/mui";
import { BrowserRouter } from "react-router";

import { TitleProvider } from "../src/contexts/title-context";
import { applyMeResponse } from "../src/hooks/usePermissions";
import HotelIntegrationsPage from "../src/dev/HotelIntegrationsPage";
import type { HotelChannexStatus } from "../src/api/hotel";

applyMeResponse({
  user: {
    id: 1,
    username: "owner",
    email: "owner@viva.test",
    firstName: "Влад",
    lastName: "Иванов",
    isStaff: true,
    isSuperuser: true,
  },
  memberships: [],
  activeMembership: null,
  activeOrganization: { id: 1, name: "Viva", slug: "viva", status: "active", vertical: "hotel" },
  activeBranch: { id: 1, name: "Центральный", timezone: "Asia/Bishkek", isActive: true },
  activeEmployee: undefined,
  permissions: ["hotel.channels.manage"],
  enabledModules: ["hotel"],
});

const scenario = new URLSearchParams(location.search).get("scenario") || "active";

const PROPERTY = {
  id: 1,
  branchId: 1,
  name: "Viva Central",
  address: "ул. Тестовая, 1",
  phone: "",
  email: "",
  timezone: "Asia/Bishkek",
  currency: "KGS",
  checkInTime: "14:00",
  checkOutTime: "12:00",
  houseRules: "",
  allowCheckoutWithDebt: false,
};

const LEGACY_CHANNELS = [
  {
    channel: "booking",
    name: "Booking.com",
    description: "Крупнейшая площадка бронирования отелей",
    propertyId: 1,
    isConnected: false,
    connectedAt: null,
    disconnectedAt: null,
    lastSyncAt: null,
  },
  {
    channel: "ostrovok",
    name: "Ostrovok",
    description: "Локальная площадка бронирования",
    propertyId: 1,
    isConnected: true,
    connectedAt: new Date(Date.now() - 86400000).toISOString(),
    disconnectedAt: null,
    lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

const channexState: HotelChannexStatus = {
  propertyId: 1,
  enabled: true,
  connected: scenario !== "disconnected",
  state: scenario === "paused" ? "paused" : scenario === "error" ? "error" : scenario === "disconnected" ? null : "active",
  channexPropertyId: "chx-123",
  lastPushAt: new Date(Date.now() - 15 * 60000).toISOString(),
  fullSyncAt: new Date(Date.now() - 6 * 3600000).toISOString(),
  lastError: scenario === "error" ? "Channex вернул ошибку авторизации API-ключа" : null,
  lastErrorAt: scenario === "error" ? new Date(Date.now() - 20 * 60000).toISOString() : null,
  pendingChanges: scenario === "active" ? 3 : 0,
  mappedRoomTypes: 4,
  mappedRatePlans: 6,
  recentPushes: [
    {
      kind: "ARIUpdate",
      status: "success",
      isFullSync: false,
      valuesCount: 42,
      dateFrom: "2026-09-24",
      dateTo: "2026-10-24",
      taskIds: ["t-1"],
      warningsCount: 0,
      error: null,
      createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    },
    {
      kind: "ARIUpdate",
      status: "warning",
      isFullSync: false,
      valuesCount: 12,
      dateFrom: "2026-09-25",
      dateTo: "2026-09-30",
      taskIds: ["t-2"],
      warningsCount: 2,
      error: null,
      createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
    {
      kind: "FullSync",
      status: "success",
      isFullSync: true,
      valuesCount: 980,
      dateFrom: "2026-09-24",
      dateTo: "2027-03-24",
      taskIds: ["t-3"],
      warningsCount: 0,
      error: null,
      createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    },
  ],
  attention:
    scenario === "attention" || scenario === "error"
      ? [
          {
            id: 501,
            state: "failed",
            status: "error",
            otaName: "Booking.com",
            otaReservationCode: "BDC-88213",
            arrivalDate: "2026-09-28",
            departureDate: "2026-10-02",
            reservationId: 3311,
            reservationNumber: "R-3311",
            message: "Не удалось создать бронь: номер уже занят в Channex",
          },
        ]
      : [],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const errorEnvelope = (code: string, message: string, details: Record<string, unknown> | null = null) =>
  json({ error: { code, message, details, trace_id: "harness-trace" } }, code === "CHANNEX_UNAVAILABLE" ? 502 : 409);

const origFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
  const method = (init?.method || "GET").toUpperCase();

  if (/\/v2\/hotel\/properties\/(\?.*)?$/.test(url) && method === "GET") return json([PROPERTY]);

  if (/\/channex\/channels-session\/?$/.test(url) && method === "POST") {
    if (scenario === "unavailable") return errorEnvelope("CHANNEX_UNAVAILABLE", "Channex временно недоступен");
    return json({ url: "https://example.com/channex-mapping-iframe", expiresAt: new Date(Date.now() + 600000).toISOString() });
  }
  if (/\/channex\/full-sync\/?$/.test(url) && method === "POST") {
    if (scenario === "toofrequent") {
      return errorEnvelope("FULL_SYNC_TOO_OFTEN", "Слишком часто", { availableAt: new Date(Date.now() + 3600000).toISOString() });
    }
    channexState.fullSyncAt = new Date().toISOString();
    return json(channexState);
  }
  if (/\/channex\/pause\/?$/.test(url) && method === "POST") {
    channexState.state = "paused";
    return json(channexState);
  }
  if (/\/channex\/revisions\/\d+\/retry\/?$/.test(url) && method === "POST") {
    return json({});
  }
  if (/\/channex\/connect\/?$/.test(url) && method === "POST") {
    channexState.connected = true;
    channexState.state = "active";
    return json(channexState);
  }
  if (/\/channex\/?(\?.*)?$/.test(url) && method === "GET") {
    if (scenario === "disabled") return errorEnvelope("CHANNEX_DISABLED", "Channex не подключён этому объекту");
    return json(channexState);
  }
  if (url.includes("/v2/hotel/channels/") && method === "GET") return json(LEGACY_CHANNELS);
  const legacyToggle = url.match(/\/v2\/hotel\/channels\/([^/]+)\/(connect|disconnect)\//);
  if (legacyToggle && method === "POST") {
    const [, channel, action] = legacyToggle;
    const found = LEGACY_CHANNELS.find((c) => c.channel === channel);
    if (found) {
      found.isConnected = action === "connect";
      found.connectedAt = action === "connect" ? new Date().toISOString() : found.connectedAt;
      found.disconnectedAt = action === "disconnect" ? new Date().toISOString() : null;
    }
    return json(found);
  }

  return origFetch(input as any, init);
};

const theme = createTheme({ palette: { mode: "light" } });
const queryClient = new QueryClient();

const ScenarioBar: React.FC = () => {
  const scenarios = ["disabled", "active", "paused", "error", "attention", "disconnected", "unavailable", "toofrequent"];
  return (
    <div style={{ padding: 8, display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #ddd", fontFamily: "sans-serif", fontSize: 12 }}>
      {scenarios.map((s) => (
        <a key={s} href={`?scenario=${s}`} style={{ fontWeight: s === scenario ? 700 : 400 }}>
          {s}
        </a>
      ))}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <RefineSnackbarProvider>
          <TitleProvider>
            <BrowserRouter>
              <ScenarioBar />
              <HotelIntegrationsPage />
            </BrowserRouter>
          </TitleProvider>
        </RefineSnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  </QueryClientProvider>,
);
