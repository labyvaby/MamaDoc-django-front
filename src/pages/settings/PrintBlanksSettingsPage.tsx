import React from "react";
import { Alert, Box, LinearProgress, Paper, Stack, Switch, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getErrorMessage } from "../../api/client";
import { listPrintTemplates, updatePrintTemplate, type PrintTemplate } from "../../api/printforms";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AppButton } from "../../components/ui";
import { useActiveScope } from "../../hooks/useActiveScope";
import { usePageTitle } from "../../hooks/usePageTitle";
import { BlankEditorDialog } from "./printBlanks/BlankEditorDialog";
import { SettingsLayout } from "./SettingsLayout";

/**
 * Печатные бланки организации: договор, расписка, согласия — текст с
 * подстановками, которые заполняются при печати из мастера постановки на
 * учёт. Экран открывается по праву printforms.manage (маршрут), поэтому
 * отдельных проверок на правку здесь нет. Строки без глоссария, как в
 * настройках продукта программы.
 */
const PrintBlanksSettingsPage: React.FC = () => {
  usePageTitle("Печатные бланки");
  const scope = useActiveScope();
  const ready = scope.isReady && scope.orgReady;
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<PrintTemplate | "new" | null>(null);

  const blanks = useQuery({
    queryKey: djangoQueryKeys.printforms.templates(scope.organizationId, "blank"),
    queryFn: ({ signal }) => listPrintTemplates(scope, "blank", signal),
    enabled: ready,
  });
  // Бланки выбирают мастер постановки и настройки продукта программы — их
  // списки лежат под ключами программ.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.printforms.all });
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.all });
  };
  const toggle = useMutation({
    mutationFn: (template: PrintTemplate) => updatePrintTemplate(scope, template.id, { isActive: !template.isActive }),
    onSuccess: invalidate,
  });

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Печатные бланки
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Договор, расписка и согласия: текст с подстановками, которые заполняются при печати.
            </Typography>
          </Box>
          <AppButton
            variant="contained"
            size="small"
            startIcon={<AddOutlined />}
            onClick={() => setEditing("new")}
            disabled={!ready}
          >
            Новый бланк
          </AppButton>
        </Stack>
        {blanks.isLoading && <LinearProgress />}
        {blanks.error && <Alert severity="error">{getErrorMessage(blanks.error)}</Alert>}
        {toggle.error && <Alert severity="error">{getErrorMessage(toggle.error)}</Alert>}
        {blanks.data?.length === 0 && (
          <Alert severity="info">Бланков пока нет. Создайте первый — например, расписку из образца.</Alert>
        )}
        <Stack gap={1}>
          {(blanks.data ?? []).map((template) => (
            <Paper key={template.id} variant="outlined" sx={{ p: 1.5, opacity: template.isActive ? 1 : 0.6 }}>
              <Stack direction="row" alignItems="center" gap={1.5}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={600} noWrap>
                    {template.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="p">
                    {template.body ? template.body.split("\n")[0] : "Без текста — печатается таблицей полей"}
                  </Typography>
                </Box>
                <Switch
                  size="small"
                  checked={template.isActive}
                  onChange={() => toggle.mutate(template)}
                  disabled={toggle.isPending}
                  inputProps={{ "aria-label": template.isActive ? "Выключить бланк" : "Включить бланк" }}
                />
                <AppButton variant="text" size="small" startIcon={<EditOutlined />} onClick={() => setEditing(template)}>
                  Изменить
                </AppButton>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Stack>
      {editing && (
        <BlankEditorDialog
          scope={scope}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
    </SettingsLayout>
  );
};

export default PrintBlanksSettingsPage;
