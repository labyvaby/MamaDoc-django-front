import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { djangoQueryKeys } from "../../api/queryKeys";
import { getDjangoEmployee } from "../../api/staff";
import { loadDjangoPrintData } from "../../pages/print/djangoPrintData";
import {
  getConclusionForms,
  renderFilledForm,
  type ConclusionFormTemplate,
  type FormTarget,
} from "../../api/conclusionForms";
import { FormSheet, type SheetContext } from "./FormSheet";
import { generateFormSheetPdf } from "./printFormSheet";

/**
 * Заполнение бланка врачом.
 *
 * Слева — поля выбранного бланка, справа — лист, который обновляется по мере
 * ввода. Дальше два независимых действия: «Печать» отдаёт бумажный бланк в его
 * собственном формате (A5, альбом, подложка — всё как настроено), «Вставить»
 * кладёт собранный текст в поле заключения, чтобы он попал в историю пациента
 * и в обычную печатную форму.
 */

interface FillFormDialogProps {
  open: boolean;
  onClose: () => void;
  appointmentId: number;
  serviceLineId: number;
  /** Врач из строки услуги: по его специализациям сортируются бланки. */
  doctorId?: number | null;
  doctorName: string;
  onApply: (target: FormTarget, text: string) => void;
}

export const FillFormDialog: React.FC<FillFormDialogProps> = ({
  open,
  onClose,
  appointmentId,
  serviceLineId,
  doctorId,
  doctorName,
  onApply,
}) => {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("lg"));
  const orgId = useApiOrgId();
  const { activeOrganization } = usePermissions();

  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [printing, setPrinting] = React.useState(false);
  const [printError, setPrintError] = React.useState<string | null>(null);

  const formsQuery = useQuery({
    queryKey: djangoQueryKeys.conclusionForms.list(orgId ?? null),
    queryFn: ({ signal }) => getConclusionForms(orgId, signal),
    enabled: open,
  });

  // Шапка листа: ФИО пациента, дата рождения и время приёма. Переиспользуем
  // загрузчик печатных страниц — он уже собирает ровно этот набор, включая
  // отдельный запрос за датой рождения (в приёме её нет).
  const printDataQuery = useQuery({
    queryKey: ["django", "conclusion-forms", "print-data", appointmentId, serviceLineId] as const,
    queryFn: () => loadDjangoPrintData(appointmentId, serviceLineId),
    enabled: open,
    retry: false,
  });

  // Специализации врача нужны только чтобы поднять его бланки наверх, поэтому
  // запрос не блокирует диалог: пока он идёт (или упал), список показывается
  // в исходном порядке.
  const doctorQuery = useQuery({
    queryKey: ["django", "staff", "employee", doctorId ?? null] as const,
    queryFn: ({ signal }) => getDjangoEmployee(doctorId as number, signal),
    enabled: open && typeof doctorId === "number",
    retry: false,
  });

  const forms = React.useMemo(() => {
    const all = formsQuery.data ?? [];
    const doctorSpecIds = new Set(
      (doctorQuery.data?.specializations ?? []).map((s) => s.id),
    );
    const matches = (form: ConclusionFormTemplate) =>
      form.specializationIds.length === 0 ||
      form.specializationIds.some((id) => doctorSpecIds.has(id));
    // Подходящие врачу — первыми; остальные остаются доступны, потому что
    // заключение нередко дозаполняет заведующий или администратор.
    return [...all].sort((a, b) => Number(matches(b)) - Number(matches(a)));
  }, [formsQuery.data, doctorQuery.data]);

  const selected = forms.find((f) => f.id === selectedId) ?? null;

  // Значения по умолчанию подставляются ровно один раз на выбранный бланк.
  // Ref, а не зависимость эффекта: без него фоновый рефетч списка бланков
  // (react-query обновляет его при возврате на вкладку) перезаписал бы уже
  // введённый врачом текст значениями по умолчанию.
  const hydratedForRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const next = forms.find((f) => f.id === selectedId) ?? forms[0] ?? null;
    if (!next) return;
    if (next.id !== selectedId) setSelectedId(next.id);
    if (hydratedForRef.current === next.id) return;
    hydratedForRef.current = next.id;
    setValues(
      Object.fromEntries(next.fields.map((f) => [f.id, f.defaultValue ?? ""])),
    );
  }, [open, forms, selectedId]);

  React.useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setValues({});
      setPrintError(null);
      hydratedForRef.current = null;
    }
  }, [open]);

  const printData = printDataQuery.data;
  const context: SheetContext = {
    patientFio: printData?.patientFio ?? "—",
    patientDob: printData?.patientDob ?? "—",
    appointmentDateTime: printData?.appt.scheduledAt
      ? dayjs(printData.appt.scheduledAt).format("DD.MM.YYYY HH:mm")
      : "—",
    doctorFio: printData?.doctorFio ?? doctorName,
    clinicName: activeOrganization?.name ?? "",
    clinicLogoUrl: activeOrganization?.logoUrl,
  };

  const handleApply = () => {
    if (!selected) return;
    onApply(selected.target, renderFilledForm(selected, values));
    onClose();
  };

  const handlePrint = async () => {
    if (!selected) return;
    setPrinting(true);
    setPrintError(null);
    try {
      const blob = await generateFormSheetPdf(selected, context, values);
      // Открываем во вкладке, а не скачиваем: врачу нужен диалог печати, а не
      // файл в загрузках. URL живёт до закрытия вкладки, поэтому не revoke-аем.
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch {
      setPrintError("Не удалось сформировать PDF бланка.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth fullScreen={isNarrow}>
      <DialogTitle sx={{ pr: 6 }}>
        Заполнить по бланку
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: "absolute", right: 12, top: 12 }}
        >
          <CloseOutlined fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {printError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPrintError(null)}>
            {printError}
          </Alert>
        )}

        {formsQuery.isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : forms.length === 0 ? (
          <Alert severity="info">
            Бланков пока нет. Их собирают в «Настройки → Бланки заключений».
          </Alert>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) auto" },
              gap: 3,
              alignItems: "start",
            }}
          >
            <Stack spacing={2} sx={{ minWidth: 0 }}>
              <Select
                size="small"
                fullWidth
                value={selected?.id ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
              >
                {forms.map((form) => (
                  <MenuItem key={form.id} value={form.id}>
                    {form.name}
                  </MenuItem>
                ))}
              </Select>

              <Divider />

              {selected && selected.fields.length === 0 && (
                <Alert severity="info">
                  В этом бланке нет полей — он печатается как есть.
                </Alert>
              )}

              {selected?.fields.map((field) => (
                <TextField
                  key={field.id}
                  label={field.label}
                  size="small"
                  fullWidth
                  multiline={field.type === "multiline"}
                  minRows={field.type === "multiline" ? (field.rows ?? 3) : undefined}
                  value={values[field.id] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                />
              ))}
            </Stack>

            <Box
              sx={{
                position: { lg: "sticky" },
                top: 0,
                justifySelf: { xs: "center", lg: "end" },
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Предпросмотр
              </Typography>
              {selected && (
                <FormSheet
                  template={selected}
                  context={context}
                  values={values}
                  scale={selected.orientation === "landscape" ? 0.42 : 0.55}
                />
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          startIcon={<PrintOutlined />}
          onClick={handlePrint}
          disabled={!selected || printing}
        >
          Печать бланка
        </Button>
        <Button variant="contained" onClick={handleApply} disabled={!selected}>
          Вставить в заключение
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FillFormDialog;
