/**
 * Нет объекта размещения для текущего контекста — общий экран для всех
 * страниц отеля. Раньше useHotelProperty без выбранного филиала откатывался на
 * первый объект организации, и сотрудник видел (и правил) номера, брони и
 * кухню чужого филиала, не зная об этом. Теперь страница прямо говорит, чего
 * не хватает, и даёт переключиться на филиал с объектом одним кликом — тем же
 * switchContext, что BranchPickerDialog и переключатель в сайдбаре.
 */
import React from "react";
import { Alert, Button, CircularProgress, Stack } from "@mui/material";
import StoreOutlined from "@mui/icons-material/StoreOutlined";

import { usePermissions } from "../hooks/usePermissions";
import { useHotelProperty } from "./useHotelProperty";
import { EmptyState, Surface } from "./hotelUi";

// Автовыбор пробуем один раз на membership за загрузку страницы: если бэк
// отказал, не долбим его повторно при каждом монтировании экрана.
const autoPickTried = new Set<number>();

export const HotelPropertyMissing: React.FC = () => {
  const { missingReason, properties } = useHotelProperty();
  const { activeMembership, activeBranch, switchContext, switching } = usePermissions();
  const [pendingBranchId, setPendingBranchId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Предлагаем только филиалы, в которых у сотрудника есть доступ.
  const memberBranchIds = new Set((activeMembership?.branches ?? []).filter((b) => b.isActive).map((b) => b.id));
  const choices = properties.flatMap((p) =>
    p.branchId != null && memberBranchIds.has(p.branchId) ? [{ id: p.id, name: p.name, branchId: p.branchId }] : [],
  );

  const choose = async (branchId: number) => {
    if (!activeMembership || !switchContext || switching) return;
    setError(null);
    setPendingBranchId(branchId);
    try {
      await switchContext({ membershipId: activeMembership.id, branchId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось переключить филиал");
    } finally {
      setPendingBranchId(null);
    }
  };

  // Единственный доступный филиал с объектом, а филиал ещё не выбран, —
  // выбирать нечего, переключаем сами. Если филиал выбран, но объекта в нём
  // нет, молча уводить человека в другой филиал нельзя — только кнопкой.
  const autoBranchId = activeBranch == null && choices.length === 1 ? choices[0].branchId : null;
  React.useEffect(() => {
    if (autoBranchId == null || !activeMembership || autoPickTried.has(activeMembership.id)) return;
    autoPickTried.add(activeMembership.id);
    void choose(autoBranchId);
    // choose пересоздаётся на каждом рендере; запуск — только по смене условия.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBranchId, activeMembership?.id]);

  return (
    <Surface>
      <EmptyState
        icon={<StoreOutlined />}
        title={missingReason}
        description={
          choices.length > 0
            ? "Данные отеля показываются только по объекту выбранного филиала."
            : "Выберите филиал с объектом размещения в переключателе организации слева."
        }
        action={
          choices.length > 0 ? (
            <Stack gap={1.5} alignItems="center">
              <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="center">
                {choices.map((p) => (
                  <Button
                    key={p.id}
                    variant="outlined"
                    disabled={switching || pendingBranchId != null}
                    startIcon={pendingBranchId === p.branchId ? <CircularProgress size={14} /> : undefined}
                    onClick={() => void choose(p.branchId)}
                  >
                    {p.name}
                  </Button>
                ))}
              </Stack>
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          ) : undefined
        }
      />
    </Surface>
  );
};

export default HotelPropertyMissing;
