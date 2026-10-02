/**
 * «Загрузить гостей из Excel» — перенос базы из старой системы или таблицы:
 * файл (.xlsx / .csv) → сопоставление колонок (угадываются по заголовкам) →
 * проверка (ошибки, повторы в файле, кто уже есть в базе — поиск по телефону
 * и документу) → загрузка с прогрессом → итог и файл с незагруженными
 * строками. Гости создаются тем же POST /hotel/guests/, что и вручную.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import type { CellValue } from "exceljs";

import { getErrorMessage } from "../api/client";
import { createGuest, searchGuests } from "../api/hotel";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import {
  buildGuestRow,
  extractTable,
  GUEST_IMPORT_FIELDS,
  guessMapping,
  markFileDuplicates,
  parseCsv,
  type GuestImportField,
  type GuestImportRow,
  type ImportCell,
  type ImportTable,
  type RawLine,
} from "./hotelGuestImport";
import { downloadGuestImportTemplate, downloadImportReport } from "./hotelGuestsXlsx";
import { StatusPill } from "./hotelUi";

type Step = "file" | "map" | "check" | "import" | "done";
type RowStatus = "ready" | "error" | "exists" | "created" | "failed";

interface CheckedRow extends GuestImportRow {
  status: RowStatus;
  reason: string;
  existingName?: string;
}

const MAX_ROWS = 5000;

function cellValue(v: CellValue): ImportCell {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "object") {
    if ("result" in v) return cellValue((v as { result?: CellValue }).result ?? null);
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
    if ("error" in v) return null;
  }
  return String(v);
}

async function readFile(file: File): Promise<RawLine[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = await file.text();
    return parseCsv(text).map((cells, i) => ({ line: i + 1, cells }));
  }
  if (name.endsWith(".xls")) throw new Error("Формат .xls не поддерживается — сохраните файл как .xlsx или CSV");
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets.find((w) => w.rowCount > 0);
  if (!ws) return [];
  const lines: RawLine[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = (row.values as CellValue[]).slice(1);
    lines.push({ line: rowNumber, cells: values.map(cellValue) });
  });
  return lines;
}

/** Параллельно, но не больше limit запросов разом — бэкенд и лимиты не любят залпы. */
async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>, onTick: () => void, cancelled: () => boolean) {
  let next = 0;
  const run = async () => {
    while (next < items.length && !cancelled()) {
      const i = next++;
      await worker(items[i], i);
      onTick();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

export const GuestImportDialog: React.FC<{ open: boolean; onClose: () => void; onImported: () => void }> = ({ open, onClose, onImported }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [step, setStep] = React.useState<Step>("file");
  const [fileName, setFileName] = React.useState("");
  const [table, setTable] = React.useState<ImportTable | null>(null);
  const [mapping, setMapping] = React.useState<GuestImportField[]>([]);
  const [rows, setRows] = React.useState<CheckedRow[]>([]);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [skipExisting, setSkipExisting] = React.useState(true);
  const [dragOver, setDragOver] = React.useState(false);
  const cancelRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("file");
    setFileName("");
    setTable(null);
    setMapping([]);
    setRows([]);
    setProgress({ done: 0, total: 0 });
    setError(null);
    cancelRef.current = false;
  };
  const busy = step === "import" || (step === "check" && progress.done < progress.total);
  const close = () => {
    if (busy) {
      cancelRef.current = true;
      return;
    }
    if (step === "done") onImported();
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const lines = await readFile(file);
      const t = extractTable(lines);
      if (t.headers.length === 0 || t.rows.length === 0) throw new Error("В файле нет строк с данными");
      if (t.rows.length > MAX_ROWS) throw new Error(`В файле ${t.rows.length} строк — за раз можно до ${MAX_ROWS}. Разбейте файл на части.`);
      setFileName(file.name);
      setTable(t);
      setMapping(guessMapping(t.headers));
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось прочитать файл");
    }
  };

  const mapped = new Set(mapping.filter((m) => m !== "skip"));
  const hasName = mapped.has("fullName") || mapped.has("lastName") || mapped.has("firstName");

  // Проверка: строки → ошибки и повторы в файле → кто уже есть в базе.
  const runCheck = async () => {
    if (!table) return;
    cancelRef.current = false;
    const built = markFileDuplicates(table.rows.map((r) => buildGuestRow(r.cells, mapping, r.line)));
    const checked: CheckedRow[] = built.map((r) => ({ ...r, status: r.data ? "ready" : "error", reason: r.errors.join("; ") }));
    setRows(checked);
    setStep("check");
    const toLookup = checked.filter((r) => r.data && (r.data.phone || r.data.documentNumber));
    setProgress({ done: 0, total: toLookup.length });
    await runPool(
      toLookup,
      4,
      async (r) => {
        const data = r.data!;
        const q = data.phone ? data.phone.replace(/\D/g, "").slice(-9) : data.documentNumber!;
        try {
          const found = await searchGuests(q);
          const match = found.find((g) =>
            data.phone ? g.matchedBy.includes("phone") && g.phone.replace(/\D/g, "").endsWith(q) : g.matchedBy.includes("document"),
          );
          if (match) {
            r.status = "exists";
            r.existingName = match.fullName;
            r.reason = `Уже в базе: ${match.fullName}`;
          }
        } catch {
          // поиск не ответил — не блокируем, бэкенд сам не создаст явный дубль документа
        }
      },
      () => setProgress((p) => ({ ...p, done: p.done + 1 })),
      () => cancelRef.current,
    );
    setRows([...checked]);
  };

  const ready = rows.filter((r) => r.status === "ready" || (!skipExisting && r.status === "exists"));
  const runImport = async () => {
    cancelRef.current = false;
    setStep("import");
    setProgress({ done: 0, total: ready.length });
    await runPool(
      ready,
      3,
      async (r) => {
        try {
          await createGuest(r.data!);
          r.status = "created";
          r.reason = "";
        } catch (err) {
          r.status = "failed";
          r.reason = getErrorMessage(err, "Бэкенд не принял строку");
        }
      },
      () => setProgress((p) => ({ ...p, done: p.done + 1 })),
      () => cancelRef.current,
    );
    setRows((prev) => [...prev]);
    setStep("done");
  };

  const count = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  const warnings = rows.filter((r) => r.data && r.warnings.length > 0).length;

  const downloadReport = () => {
    if (!table) return;
    const byLine = new Map(table.rows.map((r) => [r.line, r.cells]));
    const items = rows
      .filter((r) => r.status !== "created" && !(step !== "done" && r.status === "ready"))
      .map((r) => ({ line: r.line, reason: r.reason || (r.status === "ready" ? "Не загружено" : ""), cells: byLine.get(r.line) ?? [] }));
    void downloadImportReport(table.headers, items);
  };

  const statusPill = (r: CheckedRow) => {
    const map: Record<RowStatus, { color: string; label: string }> = {
      ready: { color: theme.palette.success.main, label: "готово" },
      error: { color: theme.palette.error.main, label: "ошибка" },
      exists: { color: theme.palette.warning.main, label: "уже в базе" },
      created: { color: theme.palette.success.main, label: "загружен" },
      failed: { color: theme.palette.error.main, label: "не принят" },
    };
    return <StatusPill color={map[r.status].color} label={map[r.status].label} />;
  };

  const preview = rows.slice(0, 200);

  return (
    <Dialog open={open} onClose={close} fullScreen={fullScreen} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pr: 7 }}>
        Загрузить гостей из Excel
        <Typography variant="body2" color="text.secondary">
          {step === "file"
            ? "Файл .xlsx или .csv — из старой системы, Google Таблиц или Excel"
            : `${fileName} · ${table?.rows.length ?? 0} строк`}
        </Typography>
        <IconButton onClick={close} sx={{ position: "absolute", right: 12, top: 12 }} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 360 }}>
        {error && (
          <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {step === "file" && (
          <Stack gap={2}>
            <Box
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void onFile(e.dataTransfer.files[0]);
              }}
              onClick={() => inputRef.current?.click()}
              sx={{
                cursor: "pointer",
                p: { xs: 4, md: 6 },
                borderRadius: "16px",
                border: `2px dashed ${dragOver ? theme.palette.primary.main : subtleBorder(theme)}`,
                bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.06) : subtleBg(theme),
                textAlign: "center",
                transition: "border-color .15s, background-color .15s",
              }}
            >
              <UploadFileOutlined sx={{ fontSize: 44, color: "primary.main", mb: 1 }} />
              <Typography sx={{ fontWeight: 700, fontSize: 17 }}>Перетащите файл сюда или нажмите, чтобы выбрать</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Первая строка таблицы — заголовки колонок: «ФИО», «Телефон», «Паспорт»… Колонки сопоставим на следующем шаге.
              </Typography>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,.txt"
                hidden
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={1}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                Нет файла под рукой? Скачайте шаблон с нужными колонками и примером.
              </Typography>
              <Button startIcon={<FileDownloadOutlined />} onClick={() => void downloadGuestImportTemplate()}>
                Шаблон Excel
              </Button>
            </Stack>
          </Stack>
        )}

        {step === "map" && table && (
          <Stack gap={2}>
            <Typography variant="body2" color="text.secondary">
              Проверьте, что куда загрузится. Колонки, которые не нужны, оставьте «Не загружать».
            </Typography>
            {!hasName && (
              <Alert severity="warning" variant="outlined">
                Укажите колонку с ФИО (или фамилию и имя отдельно) — без имени гостя не создать.
              </Alert>
            )}
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Колонка в файле</TableCell>
                    <TableCell>Примеры</TableCell>
                    <TableCell sx={{ width: 260 }}>Куда загрузить</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {table.headers.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontWeight: 700 }}>{h || `Колонка ${i + 1}`}</TableCell>
                      <TableCell sx={{ color: "text.secondary", maxWidth: 320 }}>
                        <Typography variant="body2" noWrap>
                          {table.rows
                            .slice(0, 3)
                            .map((r) => r.cells[i])
                            .filter((c) => c != null && c !== "")
                            .map((c) => (c instanceof Date ? c.toLocaleDateString("ru-RU") : String(c)))
                            .join(" · ") || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={mapping[i] ?? "skip"}
                          onChange={(e) => {
                            const value = e.target.value as GuestImportField;
                            setMapping((m) => m.map((f, j) => (j === i ? value : value !== "skip" && f === value ? "skip" : f)));
                          }}
                        >
                          {GUEST_IMPORT_FIELDS.map((f) => (
                            <MenuItem key={f.key} value={f.key}>
                              {f.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Stack>
        )}

        {(step === "check" || step === "import" || step === "done") && (
          <Stack gap={2}>
            {step === "done" ? (
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ p: 2, borderRadius: "14px", bgcolor: alpha(theme.palette.success.main, 0.08) }}>
                <CheckCircleOutlined sx={{ color: "success.main", fontSize: 32 }} />
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 18 }}>Загружено гостей: {count("created")}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[
                      count("exists") ? `уже были в базе: ${count("exists")}` : "",
                      count("error") ? `с ошибками: ${count("error")}` : "",
                      count("failed") ? `не принял бэкенд: ${count("failed")}` : "",
                      count("ready") ? `остановлено до загрузки: ${count("ready")}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Все строки загружены"}
                  </Typography>
                </Box>
              </Stack>
            ) : (
              <Stack direction="row" gap={1} flexWrap="wrap">
                <StatusPill color={theme.palette.success.main} label={`к загрузке: ${ready.length}`} />
                <StatusPill color={theme.palette.warning.main} label={`уже в базе: ${count("exists")}`} />
                <StatusPill color={theme.palette.error.main} label={`с ошибками: ${count("error")}`} />
                {warnings > 0 && <StatusPill color={theme.palette.info.main} label={`с замечаниями: ${warnings}`} />}
              </Stack>
            )}
            {progress.total > 0 && progress.done < progress.total && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {step === "import" ? "Загружаем" : "Ищем совпадения в базе"}: {progress.done} из {progress.total}
                </Typography>
                <LinearProgress variant="determinate" value={(progress.done / progress.total) * 100} sx={{ height: 6, borderRadius: 3, mt: 0.5 }} />
              </Box>
            )}
            {step === "check" && count("exists") > 0 && (
              <FormControlLabel
                control={<Switch checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />}
                label="Пропустить гостей, которые уже есть в базе"
              />
            )}
            <Box sx={{ overflowX: "auto", border: `1px solid ${subtleBorder(theme)}`, borderRadius: "12px" }}>
              <Table size="small" sx={{ "& td": { verticalAlign: "top" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 64 }}>Строка</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Гость</TableCell>
                    <TableCell>Телефон</TableCell>
                    <TableCell>Документ</TableCell>
                    <TableCell>Замечания</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell sx={{ color: "text.secondary" }}>{r.line}</TableCell>
                      <TableCell>{statusPill(r)}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{r.name || "—"}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{r.phone}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{r.documentNumber}</TableCell>
                      <TableCell sx={{ color: r.status === "error" || r.status === "failed" ? "error.main" : "text.secondary", maxWidth: 360 }}>
                        <Typography variant="caption" component="div">
                          {[r.reason, ...r.warnings].filter(Boolean).join(" · ")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            {rows.length > preview.length && (
              <Typography variant="caption" color="text.secondary">
                Показаны первые {preview.length} строк из {rows.length} — загрузятся все.
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {step === "map" && (
          <>
            <Button onClick={reset}>Другой файл</Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" disableElevation disabled={!hasName} onClick={() => void runCheck()}>
              Проверить строки
            </Button>
          </>
        )}
        {step === "check" && (
          <>
            <Button onClick={() => setStep("map")} disabled={busy}>
              Назад к колонкам
            </Button>
            <Box sx={{ flex: 1 }} />
            {(count("error") > 0 || count("exists") > 0) && (
              <Button startIcon={<FileDownloadOutlined />} onClick={downloadReport} disabled={busy}>
                Проблемные строки
              </Button>
            )}
            <Button variant="contained" disableElevation disabled={busy || ready.length === 0} onClick={() => void runImport()}>
              Загрузить {ready.length} {ready.length === 1 ? "гостя" : "гостей"}
            </Button>
          </>
        )}
        {step === "import" && (
          <>
            <Box sx={{ flex: 1 }} />
            <Button color="inherit" onClick={() => (cancelRef.current = true)}>
              Остановить
            </Button>
          </>
        )}
        {step === "done" && (
          <>
            {rows.some((r) => r.status !== "created") && (
              <Button startIcon={<FileDownloadOutlined />} onClick={downloadReport}>
                Файл с незагруженными
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" disableElevation onClick={close}>
              Готово
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default GuestImportDialog;
