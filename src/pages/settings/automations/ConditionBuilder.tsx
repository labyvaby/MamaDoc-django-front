import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import {
  MAX_CONDITION_DEPTH,
  OPERATORS_WITHOUT_VALUE,
  OPERATORS_WITH_LIST_VALUE,
  type AutomationCatalogEvent,
  type AutomationCatalogField,
} from "../../../api/automations";
import { useT } from "../../../i18n/VerticalProvider";
import {
  makeGroup,
  makeLeaf,
  nodeDepth,
  removeNode,
  replaceNode,
  type ConditionGroupForm,
  type ConditionLeafForm,
  type ConditionNodeForm,
} from "./automationForm";
import { useConditionReferences, type ReferenceOption } from "./useConditionReferences";

export interface ConditionBuilderProps {
  event: AutomationCatalogEvent | undefined;
  groupOperators: string[];
  value: ConditionNodeForm | null;
  onChange: (next: ConditionNodeForm | null) => void;
  /** Ключ узла → текст ошибки (из validateForm). */
  errors: Record<string, string>;
  organizationId: number | undefined;
  disabled?: boolean;
}

/** Есть ли в дереве поле такого типа — по нему гейтим загрузку справочника. */
function usesFieldType(
  node: ConditionNodeForm | null,
  fields: AutomationCatalogField[],
  fieldType: string,
): boolean {
  if (!node) return false;
  if (node.kind === "group") {
    return node.items.some((item) => usesFieldType(item, fields, fieldType));
  }
  return fields.some(
    (field) => field.code === node.field && field.fieldType === fieldType,
  );
}

/**
 * Редактор дерева условий: «поле — оператор — значение», сгруппированные И/ИЛИ.
 *
 * Всё, что можно выбрать, приходит из каталога: список полей, разрешённые
 * операторы конкретного поля и значения select. Захардкоженного списка здесь
 * нет — новое поле на бэке появляется в форме само.
 */
export const ConditionBuilder: React.FC<ConditionBuilderProps> = ({
  event,
  groupOperators,
  value,
  onChange,
  errors,
  organizationId,
  disabled = false,
}) => {
  const { t } = useT("settings");
  const fields = event?.fields ?? [];

  const references = useConditionReferences(organizationId, {
    branch: usesFieldType(value, fields, "branch"),
    service: usesFieldType(value, fields, "service"),
    employee: usesFieldType(value, fields, "employee"),
  });

  const firstField = fields[0];

  const addFirstCondition = () => {
    if (!firstField) return;
    onChange(makeLeaf(firstField.code, firstField.operators[0] ?? "eq"));
  };

  const addFirstGroup = () => {
    if (!firstField) return;
    const group = makeGroup(groupOperators[0] ?? "and");
    group.items = [makeLeaf(firstField.code, firstField.operators[0] ?? "eq")];
    onChange(group);
  };

  if (!event) return null;

  if (!value) {
    return (
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          {t("automations.conditions.none")}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<AddOutlined />}
            onClick={addFirstCondition}
            disabled={disabled || !firstField}
          >
            {t("automations.conditions.addCondition")}
          </Button>
          <Button
            size="small"
            startIcon={<AccountTreeOutlined />}
            onClick={addFirstGroup}
            disabled={disabled || !firstField}
          >
            {t("automations.conditions.addGroup")}
          </Button>
        </Stack>
      </Stack>
    );
  }

  const patch = (key: string, fn: (node: ConditionNodeForm) => ConditionNodeForm) => {
    onChange(replaceNode(value, key, fn));
  };

  const drop = (key: string) => {
    onChange(removeNode(value, key));
  };

  return (
    <Stack spacing={1.5}>
      <ConditionNode
        node={value}
        depth={1}
        fields={fields}
        groupOperators={groupOperators}
        references={references}
        errors={errors}
        disabled={disabled}
        onPatch={patch}
        onRemove={drop}
      />
      <Box>
        <Button size="small" color="inherit" onClick={() => onChange(null)} disabled={disabled}>
          {t("automations.conditions.clear")}
        </Button>
      </Box>
    </Stack>
  );
};

interface NodeProps {
  node: ConditionNodeForm;
  depth: number;
  fields: AutomationCatalogField[];
  groupOperators: string[];
  references: ReturnType<typeof useConditionReferences>;
  errors: Record<string, string>;
  disabled: boolean;
  onPatch: (key: string, fn: (node: ConditionNodeForm) => ConditionNodeForm) => void;
  onRemove: (key: string) => void;
}

const ConditionNode: React.FC<NodeProps> = (props) =>
  props.node.kind === "group" ? (
    <GroupNode {...props} node={props.node} />
  ) : (
    <LeafNode {...props} node={props.node} />
  );

const GroupNode: React.FC<NodeProps & { node: ConditionGroupForm }> = ({
  node,
  depth,
  fields,
  groupOperators,
  references,
  errors,
  disabled,
  onPatch,
  onRemove,
}) => {
  const { t } = useT("settings");
  const first = fields[0];
  const error = errors[node.key];
  // Глубже MAX_CONDITION_DEPTH бэк отклоняет всё дерево целиком — не даём
  // собрать такую группу вовсе, вместо 400 после «Сохранить».
  const canNest = depth + nodeDepth(node) <= MAX_CONDITION_DEPTH;

  const addChild = (child: ConditionNodeForm) => {
    onPatch(node.key, (current) => ({
      ...(current as ConditionGroupForm),
      items: [...(current as ConditionGroupForm).items, child],
    }));
  };

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover", borderStyle: "dashed" }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={node.operator}
            onChange={(_, next) => {
              if (!next) return;
              onPatch(node.key, (current) => ({ ...current, operator: next }));
            }}
            disabled={disabled}
          >
            {groupOperators.map((operator) => (
              <ToggleButton key={operator} value={operator} sx={{ px: 1.5 }}>
                {operator === "or"
                  ? t("automations.conditions.groupOr")
                  : t("automations.conditions.groupAnd")}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          <IconButton
            size="small"
            onClick={() => onRemove(node.key)}
            disabled={disabled}
            aria-label={t("automations.conditions.remove")}
          >
            <DeleteOutlineOutlined fontSize="small" />
          </IconButton>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <Stack spacing={1.5} sx={{ pl: { xs: 0, sm: 1.5 } }}>
          {node.items.map((item) => (
            <ConditionNode
              key={item.key}
              node={item}
              depth={depth + 1}
              fields={fields}
              groupOperators={groupOperators}
              references={references}
              errors={errors}
              disabled={disabled}
              onPatch={onPatch}
              onRemove={onRemove}
            />
          ))}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            size="small"
            startIcon={<AddOutlined />}
            disabled={disabled || !first}
            onClick={() =>
              first && addChild(makeLeaf(first.code, first.operators[0] ?? "eq"))
            }
          >
            {t("automations.conditions.addCondition")}
          </Button>
          <Tooltip
            title={canNest ? "" : t("automations.conditions.depthLimit", { max: MAX_CONDITION_DEPTH })}
          >
            <span>
              <Button
                size="small"
                startIcon={<AccountTreeOutlined />}
                disabled={disabled || !first || !canNest}
                onClick={() => {
                  if (!first) return;
                  const group = makeGroup(node.operator === "and" ? "or" : "and");
                  group.items = [makeLeaf(first.code, first.operators[0] ?? "eq")];
                  addChild(group);
                }}
              >
                {t("automations.conditions.addGroup")}
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
    </Paper>
  );
};

const LeafNode: React.FC<NodeProps & { node: ConditionLeafForm }> = ({
  node,
  fields,
  references,
  errors,
  disabled,
  onPatch,
  onRemove,
}) => {
  const { t } = useT("settings");
  const spec = fields.find((field) => field.code === node.field);
  const error = errors[node.key];
  const operators = spec?.operators ?? [];
  const isList = OPERATORS_WITH_LIST_VALUE.has(node.operator);
  const needsValue = !OPERATORS_WITHOUT_VALUE.has(node.operator);

  const changeField = (code: string) => {
    const next = fields.find((field) => field.code === code);
    onPatch(node.key, (current) => ({
      ...(current as ConditionLeafForm),
      field: code,
      // Оператор прежнего поля может быть недопустим для нового —
      // берём первый разрешённый из каталога, а значение сбрасываем.
      operator: next?.operators.includes((current as ConditionLeafForm).operator)
        ? (current as ConditionLeafForm).operator
        : next?.operators[0] ?? "eq",
      value: "",
      values: [],
    }));
  };

  const changeOperator = (operator: string) => {
    onPatch(node.key, (current) => {
      const leaf = current as ConditionLeafForm;
      const wasList = OPERATORS_WITH_LIST_VALUE.has(leaf.operator);
      const nowList = OPERATORS_WITH_LIST_VALUE.has(operator);
      if (wasList === nowList) return { ...leaf, operator };
      // Скаляр ↔ список: переносим то, что уже введено, чтобы переключение
      // «равно» → «входит в список» не стирало выбор пользователя.
      return nowList
        ? { ...leaf, operator, values: leaf.value ? [leaf.value] : [], value: "" }
        : { ...leaf, operator, value: leaf.values[0] ?? "", values: [] };
    });
  };

  const setValue = (value: string) => {
    onPatch(node.key, (current) => ({ ...(current as ConditionLeafForm), value }));
  };

  const setValues = (values: string[]) => {
    onPatch(node.key, (current) => ({ ...(current as ConditionLeafForm), values }));
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack spacing={1}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems="flex-start">
          <TextField
            select
            size="small"
            label={t("automations.conditions.fieldLabel")}
            value={fields.some((field) => field.code === node.field) ? node.field : ""}
            onChange={(e) => changeField(e.target.value)}
            disabled={disabled}
            sx={{ minWidth: 200 }}
          >
            {fields.map((field) => (
              <MenuItem key={field.code} value={field.code}>
                {field.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label={t("automations.conditions.operatorLabel")}
            value={operators.includes(node.operator) ? node.operator : ""}
            onChange={(e) => changeOperator(e.target.value)}
            disabled={disabled || operators.length === 0}
            sx={{ minWidth: 190 }}
          >
            {operators.map((operator) => (
              <MenuItem key={operator} value={operator}>
                {t(`automations.operators.${operator}`, { defaultValue: operator })}
              </MenuItem>
            ))}
          </TextField>

          {needsValue && (
            <ConditionValueInput
              spec={spec}
              isList={isList}
              value={node.value}
              values={node.values}
              references={references}
              disabled={disabled}
              onValue={setValue}
              onValues={setValues}
            />
          )}

          <IconButton
            size="small"
            onClick={() => onRemove(node.key)}
            disabled={disabled}
            aria-label={t("automations.conditions.remove")}
            sx={{ mt: { xs: 0, md: 0.5 } }}
          >
            <DeleteOutlineOutlined fontSize="small" />
          </IconButton>
        </Stack>

        {error && (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

interface ValueInputProps {
  spec: AutomationCatalogField | undefined;
  isList: boolean;
  value: string;
  values: string[];
  references: ReturnType<typeof useConditionReferences>;
  disabled: boolean;
  onValue: (value: string) => void;
  onValues: (values: string[]) => void;
}

/**
 * Ввод значения условия по типу поля из каталога.
 *
 * `select` — значения каталога, поля-ссылки — справочники организации,
 * числа — свободный ввод. Тип `client` намеренно остаётся вводом ID: список
 * пациентов слишком велик, чтобы грузить его в выпадающий список.
 */
const ConditionValueInput: React.FC<ValueInputProps> = ({
  spec,
  isList,
  value,
  values,
  references,
  disabled,
  onValue,
  onValues,
}) => {
  const { t } = useT("settings");
  const fieldType = spec?.fieldType ?? "text";

  let options: ReferenceOption[] | null = null;
  if (fieldType === "select") {
    options = (spec?.options ?? []).map((option) => ({
      value: option.value,
      label: option.label,
    }));
  } else if (fieldType === "branch") {
    options = references.branch;
  } else if (fieldType === "service") {
    options = references.service;
  } else if (fieldType === "employee") {
    options = references.employee;
  }

  const numeric = fieldType === "decimal" || fieldType === "integer";

  if (options) {
    if (isList) {
      return (
        <TextField
          select
          size="small"
          label={t("automations.conditions.valuesLabel")}
          value={values}
          onChange={(e) => {
            const next = e.target.value;
            onValues(typeof next === "string" ? next.split(",") : (next as unknown as string[]));
          }}
          disabled={disabled}
          sx={{ minWidth: 240, flex: 1 }}
          SelectProps={{
            multiple: true,
            renderValue: (selected) => (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {(selected as string[]).map((item) => (
                  <Chip
                    key={item}
                    size="small"
                    label={options?.find((o) => o.value === item)?.label ?? item}
                  />
                ))}
              </Box>
            ),
          }}
          helperText={
            references.isLoading ? t("automations.conditions.loadingReference") : undefined
          }
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      );
    }
    return (
      <TextField
        select
        size="small"
        label={t("automations.conditions.valueLabel")}
        value={options.some((option) => option.value === value) ? value : ""}
        onChange={(e) => onValue(e.target.value)}
        disabled={disabled}
        sx={{ minWidth: 220, flex: 1 }}
        helperText={
          references.isLoading ? t("automations.conditions.loadingReference") : undefined
        }
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  if (isList) {
    return (
      <TextField
        size="small"
        label={t("automations.conditions.valuesLabel")}
        // Список произвольных значений вводится через запятую; бэк ждёт массив,
        // разбор делаем здесь, чтобы форма хранила уже готовые элементы.
        value={values.join(", ")}
        onChange={(e) =>
          onValues(
            e.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        disabled={disabled}
        sx={{ minWidth: 240, flex: 1 }}
      />
    );
  }

  return (
    <TextField
      size="small"
      label={t("automations.conditions.valueLabel")}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      disabled={disabled}
      // Деньги уходят на бэк decimal-строкой, поэтому type остаётся text:
      // number-инпут в разных локалях подставляет запятую и ломает разбор.
      inputProps={numeric ? { inputMode: "decimal" } : undefined}
      helperText={numeric ? t("automations.conditions.numericHint") : undefined}
      sx={{ minWidth: 220, flex: 1 }}
    />
  );
};

export default ConditionBuilder;
