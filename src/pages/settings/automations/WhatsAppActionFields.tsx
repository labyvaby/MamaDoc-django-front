import React, { useMemo } from "react";
import {
  Alert,
  Box,
  Chip,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router";

import {
  variableLabel,
  type AutomationCatalogEvent,
  type AutomationWhatsAppCatalog,
  type WhatsAppParameterSourceCode,
} from "../../../api/automations";
import { splitTemplateBody, type WhatsAppTemplate } from "../../../api/whatsapp";
import { useT } from "../../../i18n/VerticalProvider";
import {
  findTemplate,
  fitParameters,
  needsTemplateSetup,
  parameterErrorKey,
  type ActionForm,
  type ParameterForm,
} from "./automationForm";
import { WhatsAppTemplateBody } from "../../../components/whatsapp/WhatsAppTemplateBody";
import { WhatsAppTemplateStatusChip } from "../../../components/whatsapp/WhatsAppTemplateStatusChip";

export interface WhatsAppActionFieldsProps {
  action: ActionForm;
  event: AutomationCatalogEvent | undefined;
  /** Правило по расписанию: данных события нет, параметры — константами. */
  scheduled: boolean;
  whatsapp: AutomationWhatsAppCatalog | undefined;
  /** `errors.actionFields[action.key]` — ошибки этого действия по полям. */
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (patch: Partial<ActionForm>) => void;
}

/** Источники по умолчанию, если каталог их не прислал. */
const FALLBACK_SOURCES: WhatsAppParameterSourceCode[] = ["event", "constant"];

/**
 * Поля WhatsApp-действия: шаблон вместо текста и привязки его параметров.
 *
 * Текст сообщения здесь не редактируется — Meta принимает только одобренный
 * шаблон, и он живёт в WhatsApp Manager. Правило говорит лишь, какой шаблон
 * взять и откуда подставить каждое `{{n}}`: из поля события или константой.
 * Всё, что мешает отправке (подключение, модерация, неподдерживаемая
 * структура), показывается сразу, а не ошибкой в истории через сутки.
 */
export const WhatsAppActionFields: React.FC<WhatsAppActionFieldsProps> = ({
  action,
  event,
  scheduled,
  whatsapp,
  errors,
  disabled,
  onChange,
}) => {
  const { t } = useT("settings");

  const template = findTemplate(whatsapp, action.templateId);
  const legacy = needsTemplateSetup(action);

  // Отправляемые шаблоны первыми: обычно нужен именно такой, а «на
  // модерации» и «отклонён» полезны только черновику.
  const options = useMemo(() => {
    const templates = whatsapp?.templates ?? [];
    return [...templates].sort((a, b) => {
      if (a.sendable !== b.sendable) return a.sendable ? -1 : 1;
      return a.name.localeCompare(b.name) || a.language.localeCompare(b.language);
    });
  }, [whatsapp]);

  const sources = whatsapp?.parameterSources?.length
    ? whatsapp.parameterSources
    : FALLBACK_SOURCES.map((code) => ({
        code,
        label: t(`automations.whatsapp.source.${code}`),
      }));

  const selectTemplate = (templateId: string) => {
    const next = findTemplate(whatsapp, templateId);
    onChange({
      templateId,
      language: next?.language ?? "",
      parameters: fitParameters(action.parameters, next, scheduled),
    });
  };

  const updateParameter = (position: number, patch: Partial<ParameterForm>) => {
    onChange({
      parameters: action.parameters.map((parameter, index) =>
        index === position ? { ...parameter, ...patch } : parameter,
      ),
    });
  };

  const connection = whatsapp?.connection;

  return (
    <Stack spacing={1.5}>
      {!whatsapp ? (
        <Alert severity="warning">{t("automations.whatsapp.catalogUnavailable")}</Alert>
      ) : !connection?.usable ? (
        <Alert severity="warning">
          {connection?.problemLabel || t("automations.whatsapp.notConnected")}{" "}
          <Link component={RouterLink} to="/settings/whatsapp">
            {t("automations.whatsapp.settingsLink")}
          </Link>
        </Alert>
      ) : (
        <Typography variant="caption" color="text.secondary">
          {connection.displayPhoneNumber
            ? t("automations.whatsapp.sender", {
                phone: connection.verifiedName
                  ? `${connection.displayPhoneNumber} (${connection.verifiedName})`
                  : connection.displayPhoneNumber,
              })
            : t("automations.whatsapp.senderUnknown")}
        </Typography>
      )}

      {legacy && (
        <Alert severity="warning">
          <Typography variant="subtitle2">{t("automations.whatsapp.legacyTitle")}</Typography>
          <Typography variant="body2">{t("automations.whatsapp.legacyText")}</Typography>
          <Typography
            variant="body2"
            sx={{ mt: 0.5, whiteSpace: "pre-wrap", fontStyle: "italic", opacity: 0.85 }}
          >
            {action.body}
          </Typography>
        </Alert>
      )}

      <TextField
        required
        select
        size="small"
        label={t("automations.whatsapp.templateLabel")}
        value={action.templateId}
        onChange={(e) => selectTemplate(e.target.value)}
        disabled={disabled || !whatsapp}
        error={Boolean(errors.templateId)}
        helperText={
          errors.templateId ??
          (options.length === 0
            ? t("automations.whatsapp.templateEmpty")
            : t("automations.whatsapp.templateHint"))
        }
        sx={{ maxWidth: 560 }}
        SelectProps={{
          // Подпись выбранного — имя и язык, без второй строки со статусом:
          // статус ниже в карточке, а в поле он не помещается.
          renderValue: (value) => {
            const selected = findTemplate(whatsapp, String(value));
            return selected
              ? `${selected.name} · ${selected.language}`
              : t("automations.whatsapp.templateMissingOption", { id: String(value) });
          },
        }}
      >
        {/* Сохранённый шаблон, которого больше нет в каталоге: пункт нужен,
            чтобы select не оказался в невалидном состоянии, а пользователь
            видел, что именно пропало. */}
        {action.templateId && !template && (
          <MenuItem value={action.templateId} disabled>
            {t("automations.whatsapp.templateMissingOption", { id: action.templateId })}
          </MenuItem>
        )}
        {options.map((item) => (
          <MenuItem
            key={item.id}
            value={item.id}
            // Недоступные и неподдерживаемые выбрать нельзя ни в каком
            // статусе правила; «на модерации» — можно, черновику это нормально.
            disabled={!item.available || !item.supported}
          >
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" noWrap>
                  {item.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.language}
                </Typography>
                <WhatsAppTemplateStatusChip template={item} />
              </Stack>
              {item.problemLabel && (
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "normal" }}>
                  {item.problemLabel}
                </Typography>
              )}
            </Stack>
          </MenuItem>
        ))}
      </TextField>

      {template && (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <WhatsAppTemplateStatusChip template={template} />
              <Typography variant="caption" color="text.secondary">
                {t("automations.whatsapp.language", { language: template.language })}
              </Typography>
              {template.category && (
                <Typography variant="caption" color="text.secondary">
                  {template.category}
                </Typography>
              )}
            </Stack>
            <WhatsAppTemplateBody bodyText={template.bodyText} />
            {template.problemLabel && (
              <Typography variant="caption" color="warning.main">
                {template.problemLabel}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      {template && (
        <Stack spacing={1}>
          <Typography variant="subtitle2">{t("automations.whatsapp.parametersTitle")}</Typography>
          {scheduled && template.parameterCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              {t("automations.whatsapp.scheduleHint")}
            </Typography>
          )}
          {errors.parameters && <Alert severity="error">{errors.parameters}</Alert>}
          {template.parameterCount === 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t("automations.whatsapp.parametersNone")}
            </Typography>
          ) : (
            action.parameters.map((parameter, position) => (
              <ParameterRow
                key={position}
                position={position}
                parameter={parameter}
                event={event}
                sources={sources}
                error={errors[parameterErrorKey(position)]}
                disabled={disabled}
                onChange={(patch) => updateParameter(position, patch)}
              />
            ))
          )}
        </Stack>
      )}

      {template && (
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t("automations.whatsapp.previewTitle")}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {previewText(template, action.parameters, event)}
          </Typography>
        </Box>
      )}
    </Stack>
  );
};

interface ParameterRowProps {
  position: number;
  parameter: ParameterForm;
  event: AutomationCatalogEvent | undefined;
  sources: { code: string; label: string }[];
  error?: string;
  disabled: boolean;
  onChange: (patch: Partial<ParameterForm>) => void;
}

const ParameterRow: React.FC<ParameterRowProps> = ({
  position,
  parameter,
  event,
  sources,
  error,
  disabled,
  onChange,
}) => {
  const { t } = useT("settings");
  const index = position + 1;
  const variables = event?.variables ?? [];
  // Сохранённое поле, которого у события нет, показываем отдельным пунктом:
  // иначе select молча подменил бы его первым попавшимся.
  const unknownField =
    parameter.source === "event" && parameter.field && !variables.includes(parameter.field)
      ? parameter.field
      : null;

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "flex-start" }}>
      <Chip
        size="small"
        label={`{{${index}}}`}
        sx={{ fontFamily: "monospace", fontWeight: 600, alignSelf: { md: "center" } }}
      />
      <TextField
        select
        size="small"
        label={t("automations.whatsapp.sourceLabel")}
        value={parameter.source}
        onChange={(e) => onChange({ source: e.target.value as WhatsAppParameterSourceCode })}
        disabled={disabled}
        sx={{ minWidth: 200 }}
      >
        {sources.map((source) => (
          <MenuItem key={source.code} value={source.code}>
            {source.label}
          </MenuItem>
        ))}
      </TextField>
      {parameter.source === "event" ? (
        <TextField
          select
          size="small"
          label={t("automations.whatsapp.fieldLabel")}
          value={parameter.field}
          onChange={(e) => onChange({ field: e.target.value })}
          disabled={disabled}
          error={Boolean(error)}
          helperText={error}
          sx={{ minWidth: 240, flex: 1 }}
        >
          {unknownField && (
            <MenuItem value={unknownField} disabled>
              {unknownField}
            </MenuItem>
          )}
          {variables.map((variable) => (
            <MenuItem key={variable} value={variable}>
              {variableLabel(event, variable)}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <TextField
          size="small"
          label={t("automations.whatsapp.valueLabel")}
          value={parameter.value}
          onChange={(e) => onChange({ value: e.target.value })}
          disabled={disabled}
          error={Boolean(error)}
          helperText={error}
          sx={{ minWidth: 240, flex: 1 }}
        />
      )}
    </Stack>
  );
};

/**
 * Предпросмотр без данных события: поле события показывается его подписью
 * в «кавычках», константа — как есть, незаполненное — многоточием. Точный
 * текст с реальными значениями даёт «Проверка» ниже.
 */
function previewText(
  template: WhatsAppTemplate,
  parameters: ParameterForm[],
  event: AutomationCatalogEvent | undefined,
): string {
  return splitTemplateBody(template.bodyText)
    .map((part) => {
      if (part.kind === "text") return part.text;
      const parameter = parameters[part.index - 1];
      if (!parameter) return "…";
      if (parameter.source === "event") {
        return parameter.field ? `«${variableLabel(event, parameter.field)}»` : "…";
      }
      return parameter.value.trim() || "…";
    })
    .join("");
}

export default WhatsAppActionFields;
