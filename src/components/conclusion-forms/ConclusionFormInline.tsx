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
 * Выбор бланка и «Свободный текст» живут в меню «Документ» в шапке дровера
 * (ConclusionDocumentMenu), ручной хвост «Дополнительно» — в секции дровера:
 * здесь остались только строки протокола (редизайн 28.09.2026).
 *
 * Каждая строка несёт `data-conclusion-row` с id поля бланка — по нему дровер
 * ставит курсор в строку из счётчика заполненности и по клику на лист.
 *
 * Что в поток не попадает: обязательные блоки бланка (дата приёма, ФИО и ДР
 * пациента, врач, подпись) — они приходят из приёма, врач их не вводит.
 */
import React from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import UndoOutlined from "@mui/icons-material/UndoOutlined";

import { AiSuggestionBeside } from "./AiAssistControls";
import { aiRowKey } from "./useAiAssist";
import { CollapsibleTextField } from "./CollapsibleTextField";

import type {
  ConclusionFormTemplate,
  FormField,
  FormFieldSlot,
} from "../../api/conclusionForms";

type Props = {
  /** Список бланков ещё грузится — прикреплённого может пока не быть. */
  loading: boolean;
  /** Прикреплённый бланк; null — заключение пишется свободным текстом. */
  form: ConclusionFormTemplate | null;
  values: Record<string, string>;
  onChangeValue: (fieldId: string, value: string) => void;
  /**
   * Готовые контролы для полей, привязанных к колонкам заключения. Строка
   * бланка со `slot` рисуется этим контролом на своём месте в потоке.
   */
  slotNodes: Partial<Record<FormFieldSlot, React.ReactNode>>;
  disabled?: boolean;
  /**
   * Что показать слева от свободной строки бланка — плашку предложения AI.
   * Привязанные строки (`slot`) свою плашку несут в `slotNodes`.
   */
  rowAddon?: (field: FormField) => React.ReactNode;
  /**
   * Нормы строк бланка (значения по умолчанию). Строка, оставшаяся нормой,
   * помечается «норма из бланка — проверьте»; изменённую можно вернуть к норме.
   */
  defaults?: Record<string, string>;
  onResetRow?: (fieldId: string) => void;
};

const fieldSpan = (field: FormField) => (field.width === "half" ? "span 1" : "span 2");

export const ConclusionFormInline: React.FC<Props> = ({
  loading,
  form,
  values,
  onChangeValue,
  slotNodes,
  disabled,
  rowAddon,
  defaults,
  onResetRow,
}) => {
  if (!form) {
    return loading ? (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={22} />
      </Box>
    ) : null;
  }

  if (form.fields.length === 0) {
    return <Alert severity="info">В этом бланке нет полей — он печатается как есть.</Alert>;
  }

  return (
    <Box
      sx={{
        display: "grid",
        // Половинные поля встают парами только на широком экране: в
        // дровере на ноутбуке две колонки по 200px нечитаемы.
        // minmax(0, …) и на одной колонке: у «1fr» минимум равен
        // min-content содержимого, и длинный чип диагноза растягивал
        // колонку до 490px — форма выезжала за край телефона.
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" },
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
            <Box
              key={field.id}
              data-conclusion-row={field.id}
              sx={{ gridColumn: { xs: "span 1", md: "span 2" }, minWidth: 0 }}
            >
              {node}
            </Box>
          ) : null;
        }

        const rowProps = {
          label: field.label || undefined,
          placeholder: field.placeholder,
          size: "small" as const,
          fullWidth: true,
          value: values[field.id] ?? "",
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            onChangeValue(field.id, e.target.value),
          disabled,
        };
        // Многострочная строка бланка сворачивается, как штатные поля:
        // иначе один длинный «Зев» растягивал форму на экран.
        const input =
          field.type === "multiline" ? (
            <CollapsibleTextField {...rowProps} minRows={field.rows ?? 3} />
          ) : (
            <TextField {...rowProps} />
          );
        // Норма строки: нетронутую помечаем (врач подписывает то, чего не
        // читал, — частая жалоба на бланки с нормами), изменённую можно
        // вернуть одним нажатием, не перепечатывая норму по памяти.
        const norm = (defaults?.[field.id] ?? "").trim();
        const value = (values[field.id] ?? "").trim();
        const normNote =
          !disabled && norm ? (
            value === norm ? (
              <Typography variant="caption" color="text.disabled" sx={{ px: 1.5 }}>
                Норма из бланка — проверьте
              </Typography>
            ) : onResetRow ? (
              <Button
                size="small"
                color="inherit"
                startIcon={<UndoOutlined sx={{ fontSize: 14 }} />}
                onClick={() => onResetRow(field.id)}
                sx={{
                  alignSelf: "flex-start",
                  color: "text.secondary",
                  fontSize: 12,
                  py: 0,
                  minHeight: 0,
                }}
              >
                Вернуть норму
              </Button>
            ) : null
          ) : null;
        // Плашка AI встаёт слева от строки; половинная строка на это время
        // занимает всю ширину — две колонки в половине дровера нечитаемы.
        const addon = rowAddon?.(field);
        return (
          <Stack
            key={field.id}
            data-conclusion-row={field.id}
            data-ai-key={aiRowKey(field.id)}
            spacing={0.75}
            sx={{ gridColumn: { xs: "span 1", md: addon ? "span 2" : fieldSpan(field) }, minWidth: 0 }}
          >
            <AiSuggestionBeside suggestion={addon}>
              <Stack spacing={0.75}>
                {input}
                {normNote}
              </Stack>
            </AiSuggestionBeside>
          </Stack>
        );
      })}
    </Box>
  );
};

export default ConclusionFormInline;
