import React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";
import LocalShippingOutlined from "@mui/icons-material/LocalShippingOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";

import { getErrorMessage } from "../../api/client";
import { DJANGO_POLL_INTERVAL_MS } from "../../api/queryKeys";
import {
  acceptWarehouseTransfer,
  getIncomingWarehouseTransfers,
  type WarehouseTransferDocument,
} from "../../api/warehouse";
import { usePermissions } from "../../hooks/usePermissions";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";

/** Право принять перемещение: управление складом целиком или только приёмка. */
const ACCEPT_PERMISSIONS = ["warehouse.manage", "warehouse.transfers.accept"];

/** Сколько отправленных коробок показываем строками; остальное — числом. */
const MAX_ROWS = 3;

const incomingKey = (branchId: number | null) => ["django", "warehouse", "transfers", "incoming", branchId] as const;

const pointOf = (document: WarehouseTransferDocument) => document.fromBranchName ?? document.fromWarehouseName;

const toNumber = (raw: string): number => {
  const n = Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Русское число: plural(3, ["позиция", "позиции", "позиций"]) → «3 позиции». */
function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

const positions = (n: number) => plural(n, ["позиция", "позиции", "позиций"]);

// ── Окно приёмки ─────────────────────────────────────────────────────────────

interface AcceptTransferDialogProps {
  document: WarehouseTransferDocument | null;
  onClose: () => void;
  onAccepted: () => void;
}

/**
 * Приёмка коробки прямо из плашки — без похода на страницу склада, которой у
 * продавца с одним правом приёмки может и не быть. По умолчанию «пришло всё,
 * что отправили»: обычная приёмка — один клик; меньше — вписать факт, и
 * документ станет «Расхождение» с недостачей в строке.
 */
const AcceptTransferDialog: React.FC<AcceptTransferDialogProps> = ({ document, onClose, onAccepted }) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const [received, setReceived] = React.useState<Record<number, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setReceived({});
    setError(null);
  }, [document?.id]);

  if (!document) return null;

  const factOf = (line: WarehouseTransferDocument["lines"][number]) => received[line.productId] ?? String(Number(line.sent));
  const shortLines = document.lines.filter((line) => toNumber(factOf(line)) < toNumber(line.sent));
  const overLines = document.lines.filter((line) => toNumber(factOf(line)) > toNumber(line.sent));

  const handleAccept = async () => {
    if (overLines.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await acceptWarehouseTransfer(
        document.id,
        document.lines.map((line) => ({ productId: line.productId, quantity: String(toNumber(factOf(line))) })),
      );
      notify?.({
        type: "success",
        message:
          result.status === "discrepancy"
            ? `Перемещение №${document.id} принято с недостачей — она записана в документе`
            : `Перемещение №${document.id} принято, товар на складе`,
      });
      onAccepted();
    } catch (e) {
      setError(getErrorMessage(e, "Не удалось принять перемещение"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={isPhone} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Приёмка перемещения №{document.id}
        <Typography variant="body2" color="text.secondary">
          Из «{pointOf(document)}» → «{document.toBranchName ?? document.toWarehouseName}»
          {document.sentAt ? ` · отправлено ${dayjs(document.sentAt).format("DD.MM в HH:mm")}` : ""}
          {document.sentByName ? ` · ${document.sentByName}` : ""}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.25}>
          <Typography variant="body2" color="text.secondary">
            Пересчитайте товар. Если пришло всё — просто нажмите «Принять». Если меньше — впишите, сколько пришло
            на самом деле.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {document.lines.map((line) => {
            const attributes = line.attributes.map((a) => a.value).filter(Boolean).join(" · ");
            const fact = factOf(line);
            const short = toNumber(fact) < toNumber(line.sent);
            const over = toNumber(fact) > toNumber(line.sent);
            return (
              <Stack key={line.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, border: 1, borderColor: short || over ? "warning.main" : "divider", borderRadius: "10px" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {line.productName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {[attributes, line.sku, `отправлено: ${Number(line.sent)}`].filter(Boolean).join(" · ")}
                  </Typography>
                  {short && (
                    <Typography variant="caption" color="warning.main">
                      Недостача: {Number(line.sent) - toNumber(fact)}
                    </Typography>
                  )}
                  {over && (
                    <Typography variant="caption" color="error.main">
                      Больше, чем отправили, принять нельзя
                    </Typography>
                  )}
                </Box>
                <TextField
                  size="small"
                  label="Пришло"
                  value={fact}
                  onChange={(e) => setReceived((prev) => ({ ...prev, [line.productId]: e.target.value }))}
                  inputProps={{ inputMode: "decimal", style: { textAlign: "right" }, "aria-label": `Пришло: ${line.productName}` }}
                  error={over}
                  sx={{ width: 104, flexShrink: 0 }}
                />
              </Stack>
            );
          })}
          {shortLines.length > 0 && overLines.length === 0 && (
            <Alert severity="warning">
              Пришло меньше, чем отправили, в {positions(shortLines.length)}. Перемещение примется со статусом
              «Расхождение», недостача сохранится в документе.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} color="inherit" disabled={busy}>
          Позже
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleAccept()}
          disabled={busy || overLines.length > 0}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlined />}
        >
          {shortLines.length > 0 ? "Принять с недостачей" : "Принять"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Плашка ───────────────────────────────────────────────────────────────────

/**
 * «К вам едет товар» — на любом экране точки-получателя, пока коробку не
 * приняли.
 *
 * Не тост и не объявление: тост исчезает сам, а объявление можно закрыть, —
 * тогда о коробке, которая уже списана у отправителя и числится «в пути»,
 * легко забыть. Плашка висит, пока перемещение не принято. Появляется сразу
 * после отправки (realtime-сигнал по филиалу получателя), без сокета — при
 * очередном опросе.
 *
 * Список «входящих» решает сервер: только отправленное **на эту точку** и
 * только тем, у кого есть право приёмки. Отправитель своей же коробки здесь
 * не видит.
 */
export const IncomingTransfersBanner: React.FC = () => {
  const { canAccess, activeBranch } = usePermissions();
  const queryClient = useQueryClient();
  const allowed = ACCEPT_PERMISSIONS.some((code) => canAccess(code));
  const branchId = activeBranch?.id ?? null;
  const [accepting, setAccepting] = React.useState<WarehouseTransferDocument | null>(null);

  const incoming = useQuery({
    queryKey: incomingKey(branchId),
    queryFn: ({ signal }) => getIncomingWarehouseTransfers(signal),
    enabled: allowed,
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  useRealtimeRefetch({
    entities: ["warehouse_transfer"],
    onEvent: () => void queryClient.invalidateQueries({ queryKey: ["django", "warehouse", "transfers"] }),
  });

  const documents = allowed ? incoming.data ?? [] : [];
  if (documents.length === 0) return null;

  const handleAccepted = () => {
    setAccepting(null);
    void queryClient.invalidateQueries({ queryKey: ["django", "warehouse"] });
  };

  return (
    <Box sx={{ width: "100%", px: 2, pt: 1.5, pb: 0.5 }}>
      <Alert
        severity="info"
        icon={<LocalShippingOutlined fontSize="inherit" />}
        sx={{ borderRadius: "12px", "& .MuiAlert-message": { width: "100%" } }}
      >
        <AlertTitle sx={{ fontWeight: 700 }}>
          {documents.length === 1
            ? "К вам едет товар"
            : `К вам едут ${plural(documents.length, ["перемещение", "перемещения", "перемещений"])} — ждут приёмки`}
        </AlertTitle>
        <Stack spacing={0.75}>
          {documents.slice(0, MAX_ROWS).map((document) => (
            <Stack
              key={document.id}
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              spacing={1}
            >
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                Перемещение №{document.id} из «{pointOf(document)}» — {positions(document.lines.length)}
                {document.sentAt ? `, отправлено ${dayjs(document.sentAt).format("DD.MM в HH:mm")}` : ""}.
              </Typography>
              {document.canAccept && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setAccepting(document)}
                  sx={{ alignSelf: { xs: "flex-start", md: "center" }, whiteSpace: "nowrap" }}
                >
                  Принять
                </Button>
              )}
            </Stack>
          ))}
          {documents.length > MAX_ROWS && (
            <Typography variant="caption" color="text.secondary">
              И ещё {documents.length - MAX_ROWS} — после приёмки этих они появятся здесь.
            </Typography>
          )}
        </Stack>
      </Alert>
      <AcceptTransferDialog document={accepting} onClose={() => setAccepting(null)} onAccepted={handleAccepted} />
    </Box>
  );
};

export default IncomingTransfersBanner;
