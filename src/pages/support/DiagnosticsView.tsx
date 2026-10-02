import React from "react";
import { Alert, Box, Button, Chip, IconButton, Skeleton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../../api/queryKeys";
import { getSupportDiagnostics } from "../../api/support";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

const copy = (text: string) => {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
};

const statusColor = (status: number): "success" | "warning" | "error" | "default" => {
  if (status === 0 || status >= 500) return "error";
  if (status >= 400) return "warning";
  if (status >= 200) return "success";
  return "default";
};

const Mono: React.FC<React.PropsWithChildren<{ dim?: boolean }>> = ({ children, dim }) => (
  <Box
    component="span"
    sx={{
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "0.76rem",
      color: dim ? "text.secondary" : "text.primary",
      wordBreak: "break-all",
    }}
  >
    {children}
  </Box>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
    {text}
  </Typography>
);

const Line: React.FC<React.PropsWithChildren<{ tone?: "error" | "warning" }>> = ({ children, tone }) => (
  <Box
    sx={(t) => ({
      display: "flex",
      alignItems: "baseline",
      gap: 1,
      py: 0.6,
      px: 1,
      borderRadius: "8px",
      bgcolor: tone ? alpha(t.palette[tone].main, t.palette.mode === "dark" ? 0.14 : 0.08) : "transparent",
      "&:nth-of-type(odd)": !tone ? { bgcolor: alpha(t.palette.text.primary, 0.03) } : undefined,
    })}
  >
    {children}
  </Box>
);

const ago = (value: unknown) => (
  <Box component="span" sx={{ minWidth: 44, color: "text.disabled", fontSize: "0.72rem", flexShrink: 0 }}>
    {typeof value === "number" ? `−${value}с` : ""}
  </Box>
);

/**
 * Технический снимок обращения — только для разработчиков. Автору он не
 * показывается вообще: ему он ничего не скажет, а разработчику нужен целиком.
 */
export const DiagnosticsView: React.FC<{ ticketId: number }> = ({ ticketId }) => {
  const [tab, setTab] = React.useState(0);
  const query = useQuery({
    queryKey: djangoQueryKeys.support.diagnostics(ticketId),
    queryFn: ({ signal }) => getSupportDiagnostics(ticketId, signal),
    staleTime: 5 * 60_000,
  });

  if (query.isLoading) return <Skeleton variant="rounded" height={160} sx={{ borderRadius: 2 }} />;
  if (query.isError || !query.data) {
    return <Alert severity="info">Технических данных у этого обращения нет.</Alert>;
  }

  const diag = query.data;
  const payload = diag.payload;
  const context = (payload.context ?? {}) as Row;
  const frozen = (payload.frozen ?? null) as Row | null;
  const frozenWin = (frozen?.window ?? {}) as Row;
  const network = [...rows(frozenWin.network), ...rows(payload.network)];
  const consoleLines = [...rows(frozenWin.console), ...rows(payload.console)];
  const actions = [...rows(frozenWin.events), ...rows(payload.events)];
  const errors = [...rows(frozenWin.errors), ...rows(payload.errors)];

  const dedupe = (list: Row[]) => {
    const seen = new Set<string>();
    return list.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  return (
    <Box>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
        {diag.appVersion && <Chip size="small" label={`сборка ${diag.appVersion}`} />}
        {diag.screen && <Chip size="small" label={`экран ${diag.screen}`} />}
        {diag.route && <Chip size="small" label={diag.route} />}
        {str(context.role) && <Chip size="small" label={`роль ${str(context.role)}`} />}
        {str(context.network) && <Chip size="small" label={`сеть ${str(context.network)}`} />}
        {context.online === false && <Chip size="small" color="error" label="офлайн" />}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1, wordBreak: "break-all" }}>
        {diag.userAgent}
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, next: number) => setTab(next)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 36, mb: 1, "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
      >
        <Tab label={`Ошибка${frozen ? " •" : ""}`} />
        <Tab label={`Запросы (${network.length})`} />
        <Tab label={`Консоль (${consoleLines.length})`} />
        <Tab label={`Действия (${actions.length})`} />
        <Tab label="JSON" />
      </Tabs>

      <Box sx={{ maxHeight: 360, overflowY: "auto", pr: 0.5 }}>
        {tab === 0 &&
          (frozen ? (
            <Stack spacing={1}>
              <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {str(frozen.kind)} · {frozen.status ? `HTTP ${str(frozen.status)}` : "без статуса"}
                  {frozen.code ? ` · ${str(frozen.code)}` : ""}
                </Typography>
                <Mono>
                  {str(frozen.method)} {str(frozen.endpoint)}
                </Mono>
                <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
                  {str(frozen.message)} · за {str(frozen.ageSec)} с до отправки
                </Typography>
              </Alert>
              {errors.map((error, i) => (
                <Line key={i} tone="error">
                  {ago(error.ago)}
                  <Box sx={{ minWidth: 0 }}>
                    <Mono>{str(error.message)}</Mono>
                    {error.stack ? (
                      <Box component="pre" sx={{ m: 0, mt: 0.5, fontSize: "0.7rem", whiteSpace: "pre-wrap", color: "text.secondary" }}>
                        {str(error.stack)}
                      </Box>
                    ) : null}
                  </Box>
                </Line>
              ))}
            </Stack>
          ) : (
            <Empty text="Сбоя перед обращением не было — человек сообщил сам." />
          ))}

        {tab === 1 &&
          (network.length ? (
            dedupe(network).map((req, i) => (
              <Line key={i} tone={Number(req.status) >= 500 || req.status === 0 ? "error" : undefined}>
                {ago(req.ago)}
                <Chip
                  size="small"
                  color={statusColor(Number(req.status))}
                  label={str(req.status)}
                  sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700, minWidth: 38 }}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Mono>
                    {str(req.method)} {str(req.path)}
                  </Mono>
                  <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
                    {str(req.ms)} мс{req.code ? ` · ${str(req.code)}` : ""}
                  </Typography>
                </Box>
                {req.traceId ? (
                  <Tooltip title="Скопировать trace_id">
                    <Chip
                      size="small"
                      variant="outlined"
                      label={str(req.traceId)}
                      onClick={() => copy(str(req.traceId))}
                      sx={{ height: 20, fontSize: "0.68rem" }}
                    />
                  </Tooltip>
                ) : null}
              </Line>
            ))
          ) : (
            <Empty text="Запросов в окне не было." />
          ))}

        {tab === 2 &&
          (consoleLines.length ? (
            dedupe(consoleLines).map((line, i) => (
              <Line key={i} tone={line.level === "error" ? "error" : "warning"}>
                {ago(line.ago)}
                <Mono>{str(line.message)}</Mono>
              </Line>
            ))
          ) : (
            <Empty text="Консоль молчала." />
          ))}

        {tab === 3 &&
          (actions.length ? (
            dedupe(actions).map((action, i) => (
              <Line key={i}>
                {ago(action.ago)}
                <Chip size="small" label={action.type === "route" ? "страница" : "клик"} sx={{ height: 20, fontSize: "0.68rem" }} />
                <Mono>{str(action.label)}</Mono>
              </Line>
            ))
          ) : (
            <Empty text="Действий в окне нет." />
          ))}

        {tab === 4 && (
          <Box>
            <Button
              size="small"
              startIcon={<ContentCopyRounded />}
              onClick={() => copy(JSON.stringify(diag, null, 2))}
              sx={{ textTransform: "none", mb: 1 }}
            >
              Скопировать JSON
            </Button>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.25,
                borderRadius: 2,
                fontSize: "0.7rem",
                overflow: "auto",
                bgcolor: (t) => alpha(t.palette.text.primary, 0.05),
              }}
            >
              {JSON.stringify(diag, null, 2)}
            </Box>
          </Box>
        )}
      </Box>

      {diag.traceIds.length > 0 && (
        <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            trace_id упавших запросов:
          </Typography>
          {diag.traceIds.map((id) => (
            <Chip
              key={id}
              size="small"
              label={id}
              onClick={() => copy(id)}
              onDelete={() => copy(id)}
              deleteIcon={
                <IconButton size="small" aria-label="Скопировать">
                  <ContentCopyRounded sx={{ fontSize: 13 }} />
                </IconButton>
              }
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};

export default DiagnosticsView;
