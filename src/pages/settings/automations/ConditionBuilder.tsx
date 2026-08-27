import React from "react";
import {
  Alert,
  Box,
  Button,
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
import { FieldValueInput } from "./FieldValueInput";
import {
  useConditionReferences,
  type ConditionReferences,
} from "./useConditionReferences";

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

/** Коды полей, уже использованных в дереве условий. */
function usedFieldCodes(node: ConditionNodeForm | null, acc = new Set<string>()): Set<string> {
  if (!node) return acc;
  if (node.kind === "group") {
    node.items.forEach((item) => usedFieldCodes(item, acc));
  } else {
    acc.add(node.field);
  }
  return acc;
}

/**
 * Поля, которые есть смысл предлагать.
 *
 * Поле, у которого нечего выбрать, — тупик: пользователь ставит «Сотрудник
 * равно», а список пуст. Прячем такие: помеченные `hidden` в каталоге,
 * `select` без значений и поля-ссылки с пустым справочником организации.
 * Числа и текст остаются всегда — там значение вводится, а не выбирается.
 *
 * Уже использованное в правиле поле не прячем никогда, даже если справочник
 * опустел: иначе открытие старого правила молча выкинуло бы его условие.
 */
function usableFields(
  fields: AutomationCatalogField[],
  references: ConditionReferences,
  used: Set<string>,
): AutomationCatalogField[] {
  return fields.filter((field) => {
    if (used.has(field.code)) return true;
    // Поля-ссылки на сущности каталог помечает hidden: пользователю нужны
    // читаемые условия, а не выбор «Услуга = 42».
    if (field.hidden) return false;
    switch (field.fieldType) {
      case "select":
        return field.options.length > 0;
      case "branch":
        return !references.loaded.branch || references.branch.length > 0;
      case "service":
        return !references.loaded.service || references.service.length > 0;
      case "employee":
        return !references.loaded.employee || references.employee.length > 0;
      default:
        return true;
    }
  });
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
  const allFields = React.useMemo(() => event?.fields ?? [], [event]);

  // Справочники тянем сразу для всех типов, которые событие вообще может
  // предложить, а не только для уже добавленных условий: без этого нельзя
  // узнать, есть ли что выбирать, и решить, показывать ли поле.
  const references = useConditionReferences(organizationId, {
    branch: allFields.some((f) => f.fieldType === "branch"),
    service: allFields.some((f) => f.fieldType === "service"),
    employee: allFields.some((f) => f.fieldType === "employee"),
  });

  const fields = React.useMemo(
    () => usableFields(allFields, references, usedFieldCodes(value)),
    [allFields, references, value],
  );

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
  references: ConditionReferences;
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
            <FieldValueInput
              spec={spec}
              isList={isList}
              required
              label={
                isList
                  ? t("automations.conditions.valuesLabel")
                  : t("automations.conditions.valueLabel")
              }
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

export default ConditionBuilder;
