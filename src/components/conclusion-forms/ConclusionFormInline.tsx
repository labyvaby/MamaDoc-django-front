/**
 * Поля выбранного бланка прямо в дровере заключения — одним потоком, в том
 * порядке, в котором их выстроил администратор.
 *
 * Раньше бланк заполнялся в модальном окне, а в заключение уезжал готовый
 * текст: врач работал в двух местах и вводил жалобы дважды — в окне и в
 * штатном поле под ним. Теперь порядок задаёт бланк, а поле, привязанное к
 * колонке заключения (`slot`), рисуется тем же контролом, что и штатное, и
 * пишет прямо в неё. Такие контролы приходят готовыми в `slotNodes`: владелец
 * состояния — дровер, здесь только раскладка.
 *
 * Что в поток не попадает: обязательные блоки бланка (дата приёма, ФИО и ДР
 * пациента, врач, подпись) — они приходят из приёма, врач их не вводит.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";

import type {
  ConclusionFormTemplate,
  FormField,
  FormFieldSlot,
} from "../../api/conclusionForms";

type Props = {
  /** Активные бланки организации. */
  forms: ConclusionFormTemplate[];
  loading: boolean;
  /** Прикреплённый бланк; null — врач пишет заключение свободным текстом. */
  form: ConclusionFormTemplate | null;
  /** Значения свободных полей по id. */
  values: Record<string, string>;
  onSelectForm: (formId: number) => void;
  onChangeValue: (fieldId: string, value: string) => void;
  /** Открепить: поля исчезают, собранный текст остаётся в заключении. */
  onDetach: () => void;
  /**
   * Готовые контролы штатных полей заключения — их вставляем на место
   * привязанных полей бланка (жалобы, температура, диагнозы, фото…).
   */
  slotNodes: Partial<Record<FormFieldSlot, React.ReactNode>>;
  /** Свободный хвост: вывод и рекомендации, которых в бланке нет. */
  manual: string;
  onManualChange: (value: string) => void;
  /** Подпись поля, куда уедет собранный текст («Заключение»). */
  targetLabel: string;
  disabled: boolean;
};

const fieldSpan = (field: FormField) => (field.width === "half" ? "span 1" : "span 2");

export const ConclusionFormInline: React.FC<Props> = ({
  forms,
  loading,
  form,
  values,
  onSelectForm,
  onChangeValue,
  onDetach,
  slotNodes,
  manual,
  onManualChange,
  targetLabel,
  disabled,
}) => {
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  // Бланков нет вовсе — секцию не показываем: заключение пишется текстом, как
  // и до бланков. Подсказку про настройки здесь не даём: врач в них не ходит.
  if (forms.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          flexWrap="wrap"
        >
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Бланк
          </Typography>

          {form && !disabled && (
            <Button
              size="small"
              color="inherit"
              startIcon={<LinkOffOutlined sx={{ fontSize: 16 }} />}
              onClick={onDetach}
            >
              Открепить
            </Button>
          )}
        </Stack>

        <TextField
          select
          size="small"
          fullWidth
          value={form?.id ?? ""}
          onChange={(e) => onSelectForm(Number(e.target.value))}
          disabled={disabled}
          // Пустое значение — состояние «откреплён»: в списке его нет, вернуть
          // бланк можно выбором любого из них.
          SelectProps={{
            displayEmpty: true,
            renderValue: (value) =>
              value === "" ? "Без бланка — свободный текст" : form?.name ?? "",
          }}
        >
          {forms.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>

        {form && form.fields.length === 0 && (
          <Alert severity="info">В этом бланке нет полей — он печатается как есть.</Alert>
        )}

        {form && form.fields.length > 0 && (
          <Box
            sx={{
              display: "grid",
              // Половинные поля встают парами только на широком экране: в
              // дровере на ноутбуке две колонки по 200px нечитаемы.
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              gap: 1.5,
            }}
          >
            {form.fields.map((field) => {
              // Привязанное поле — штатный контрол заключения на месте строки
              // бланка. Если контрол не передали (слот появился в бланке, а
              // дровер о нём не знает), поле молча не рисуем: пустая рамка без
              // подписи хуже отсутствия.
              if (field.slot) {
                const node = slotNodes[field.slot];
                return node ? (
                  <Box key={field.id} sx={{ gridColumn: { xs: "span 1", md: "span 2" } }}>
                    {node}
                  </Box>
                ) : null;
              }

              return (
                <TextField
                  key={field.id}
                  label={field.label || undefined}
                  placeholder={field.placeholder}
                  size="small"
                  fullWidth
                  multiline={field.type === "multiline"}
                  minRows={field.type === "multiline" ? field.rows ?? 3 : undefined}
                  value={values[field.id] ?? ""}
                  onChange={(e) => onChangeValue(field.id, e.target.value)}
                  disabled={disabled}
                  sx={{ gridColumn: { xs: "span 1", md: fieldSpan(field) } }}
                />
              );
            })}
          </Box>
        )}

        {form && (
          <>
            <TextField
              label="Дополнительно"
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={manual}
              onChange={(e) => onManualChange(e.target.value)}
              disabled={disabled}
              placeholder="Вывод, рекомендации — то, чего нет в строках бланка"
            />
            <Typography variant="caption" color="text.disabled">
              Текст в поле «{targetLabel}» собирается из строк бланка и этого
              дополнения. Пустые строки в документ не попадают.
            </Typography>
          </>
        )}
      </Stack>
    </Paper>
  );
};

export default ConclusionFormInline;
