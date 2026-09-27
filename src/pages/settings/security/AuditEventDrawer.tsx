import React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs from "dayjs";

import type { AuditCatalog, AuditEvent } from "../../../api/audit";
import { TonedChip } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";
import {
  AUTH_METHOD_LABELS,
  OUTCOME_LABELS,
  SOURCE_LABELS,
  actionText,
  actorText,
  categoryText,
  changeLines,
  outcomeTone,
  resourceText,
} from "./auditFormat";

export interface AuditEventDrawerProps {
  event: AuditEvent | null;
  catalog?: AuditCatalog;
  onClose: () => void;
  /** «Все действия этого сотрудника» — фильтр по актору на странице. */
  onFilterByActor?: (userId: number, name: string) => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Stack direction="row" spacing={2} sx={{ py: 0.75 }}>
    <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>
      {label}
    </Typography>
    <Box sx={{ minWidth: 0, flex: 1, typography: "body2", overflowWrap: "anywhere" }}>{children}</Box>
  </Stack>
);

/**
 * Детали события журнала. Технические поля (request id, User-Agent,
 * метаданные) спрятаны под «Дополнительная информация»: они нужны инженеру,
 * а владельцу достаточно «кто, когда, что изменилось».
 */
export const AuditEventDrawer: React.FC<AuditEventDrawerProps> = ({
  event,
  catalog,
  onClose,
  onFilterByActor,
}) => {
  const { t } = useT("settings");
  const lines = event ? changeLines(event.changes) : [];
  const metadata = event ? Object.entries(event.metadata ?? {}) : [];

  return (
    <Drawer
      anchor="right"
      open={event !== null}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480, md: 540 }, maxWidth: "100vw" } }}
    >
      {event && (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary">
                {categoryText(event.category, catalog)}
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ overflowWrap: "anywhere" }}>
                {actionText(event, catalog)}
              </Typography>
            </Box>
            <IconButton aria-label={t("audit.drawer.close")} onClick={onClose}>
              <CloseOutlined />
            </IconButton>
          </Stack>

          <Box sx={{ mt: 1.5 }}>
            <TonedChip label={OUTCOME_LABELS[event.outcome]} toneName={outcomeTone(event.outcome)} />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Row label={t("audit.drawer.who")}>
            <Stack spacing={0.5}>
              <span>{actorText(event)}</span>
              {event.actor.userId != null && onFilterByActor && (
                <Button
                  size="small"
                  sx={{ alignSelf: "flex-start", px: 0 }}
                  onClick={() => onFilterByActor(event.actor.userId as number, actorText(event))}
                >
                  {t("audit.drawer.allByActor")}
                </Button>
              )}
            </Stack>
          </Row>
          <Row label={t("audit.drawer.when")}>{dayjs(event.occurredAt).format("DD.MM.YYYY HH:mm:ss")}</Row>
          <Row label={t("audit.drawer.object")}>{resourceText(event)}</Row>
          {event.branchName && <Row label={t("audit.drawer.branch")}>{event.branchName}</Row>}
          {event.authMethod && (
            <Row label={t("audit.drawer.authMethod")}>
              {AUTH_METHOD_LABELS[event.authMethod] ?? event.authMethod}
            </Row>
          )}
          {event.ipAddress && <Row label={t("audit.drawer.ip")}>{event.ipAddress}</Row>}
          {event.device && <Row label={t("audit.drawer.device")}>{event.device}</Row>}

          {lines.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                {t("audit.drawer.changes")}
              </Typography>
              <Stack spacing={1}>
                {lines.map((line) => (
                  <Box key={line.field}>
                    <Typography variant="body2" color="text.secondary">
                      {line.label}
                    </Typography>
                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                      {line.from === null ? (
                        <em>{t("audit.drawer.valueHidden")}</em>
                      ) : (
                        <>
                          {line.from} → <strong>{line.to}</strong>
                        </>
                      )}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </>
          )}

          <Accordion disableGutters elevation={0} sx={{ mt: 2, "&::before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreOutlined />} sx={{ px: 0 }}>
              <Typography variant="subtitle2">{t("audit.drawer.technical")}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <Row label={t("audit.drawer.source")}>{SOURCE_LABELS[event.source] ?? event.source}</Row>
              <Row label="Request ID">{event.requestId || "—"}</Row>
              <Row label="Trace ID">{event.traceId || "—"}</Row>
              <Row label={t("audit.drawer.code")}>{event.action}</Row>
              {event.httpMethod && event.path && (
                <Row label="HTTP">
                  {event.httpMethod} {event.path}
                </Row>
              )}
              {event.userAgent && <Row label="User-Agent">{event.userAgent}</Row>}
              {metadata.length > 0 && (
                <Row label={t("audit.drawer.metadata")}>
                  <Box
                    component="pre"
                    sx={{ m: 0, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "monospace" }}
                  >
                    {JSON.stringify(event.metadata, null, 2)}
                  </Box>
                </Row>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}
    </Drawer>
  );
};

export default AuditEventDrawer;
