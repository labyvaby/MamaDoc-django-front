import React from "react";
import {
  Button,
  CircularProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";

import { useT } from "../../i18n/VerticalProvider";
import type { AiAssistFieldState } from "./useAiAssist";

/**
 * Кнопка «Помощь AI» — стоит в строке подписи поля, справа.
 *
 * Не блокируется на пустом поле: пустой текст — это просьба написать
 * черновик с нуля (бэк сам различает режимы по содержимому).
 */
export const AiAssistButton: React.FC<{
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ loading, disabled, onClick }) => {
  const { t } = useT("appointments");
  return (
    <Tooltip title={t("conclusion.aiAssist.tooltip")}>
      <span>
        <Button
          size="small"
          color="inherit"
          onClick={onClick}
          disabled={disabled || loading}
          startIcon={
            loading ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeOutlined />
          }
          sx={{ color: "text.secondary", fontWeight: 600, py: 0, minHeight: 0 }}
        >
          {loading ? t("conclusion.aiAssist.loading") : t("conclusion.aiAssist.button")}
        </Button>
      </span>
    </Tooltip>
  );
};

/**
 * Предложение AI рядом с полем.
 *
 * Главное правило гайда: пока врач не нажал «Применить», в самом поле ничего
 * не меняется — врач обязан вычитать текст. Поэтому это отдельная плашка под
 * полем, а не подмена значения; «Отклонить» просто прячет её.
 */
export const AiAssistSuggestion: React.FC<{
  state: AiAssistFieldState;
  onApply: () => void;
  onDismiss: () => void;
}> = ({ state, onApply, onDismiss }) => {
  const { t } = useT("appointments");
  if (!state.suggestion) return null;
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderColor: "primary.main", bgcolor: "background.default" }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <AutoAwesomeOutlined fontSize="small" color="primary" />
          <Typography variant="body2" fontWeight={600}>
            {t("conclusion.aiAssist.title")}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {state.suggestion}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="contained" disableElevation onClick={onApply}>
            {t("conclusion.aiAssist.apply")}
          </Button>
          <Button size="small" color="inherit" onClick={onDismiss}>
            {t("conclusion.aiAssist.dismiss")}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t("conclusion.aiAssist.reviewHint")}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
};
