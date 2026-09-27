/**
 * PatientLabOrdersPanel.tsx — история анализов в карточке пациента.
 *
 * Отдельная панель, а не врезка в `PatientHistoryPanel`: та типизирована как
 * `history: DjangoAppointment[]` и рассчитана на приёмы — подмешивать в неё
 * заказы лаборатории означало бы ломать её тип (см. lab-frontend-design.md,
 * «История в карточке пациента»). Панель встаёт рядом с ней и с
 * `PatientVaccinationsPanel` по тому же образцу: `DjangoPatientsPage.tsx`
 * собирает панели по сущностям и передаёт им уже готовые данные.
 *
 * Состав каждого заказа берётся из `titles` — снимка названий на момент
 * продажи, а не живого каталога: анализ мог быть переименован или погашен в
 * ЛИС, а история обязана показывать то, что человек реально сдавал.
 */
import React from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import dayjs from "dayjs";

import { AppButton, AppCard, ListEmptyState, ListLoadingSkeleton } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { formatKGS } from "../../../utility/format";
import { labOrderDispatchStatus } from "../../../utility/labOrderStatus";
import type { LabOrder } from "../../../api/lab";

type Props = {
  selected: boolean;
  loading: boolean;
  error: string | null;
  orders: LabOrder[];
  canViewFinance: boolean;
  onIntake: () => void;
};

const PatientLabOrdersPanel: React.FC<Props> = ({
  selected,
  loading,
  error,
  orders,
  canViewFinance,
  onIntake,
}) => {
  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppCard
        variant="outlined"
        header={
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            gap={1}
            flexWrap="wrap"
            sx={{ px: 2, pt: 2, pb: 1.5 }}
          >
            <Stack direction="row" alignItems="center" gap={1.25}>
              <ScienceOutlined color="primary" />
              <Typography variant="h6">Анализы</Typography>
              {selected && !loading && !error && orders.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {orders.length}
                </Typography>
              )}
            </Stack>
            {/* Тот же жест, что «Сертификат» в PatientVaccinationsPanel — кнопка
                действия в шапке панели, а не в общей шапке карточки пациента. */}
            {selected && (
              <AppButton size="small" variant="outlined" onClick={onIntake}>
                Принять анализы
              </AppButton>
            )}
          </Stack>
        }
        disableContentPadding
        sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <Box sx={{ borderTop: 1, borderColor: "divider", flex: 1, overflowY: "auto", minHeight: 0, p: 1 }}>
          {!selected ? (
            <ListEmptyState
              icon={<ScienceOutlined />}
              title="Пациент не выбран"
              description="Выберите пациента слева, чтобы увидеть его анализы"
            />
          ) : loading ? (
            <ListLoadingSkeleton rows={4} />
          ) : error ? (
            <ListEmptyState icon={<ErrorOutlineOutlined />} title="Не удалось загрузить" description={error} />
          ) : orders.length === 0 ? (
            <ListEmptyState
              icon={<ScienceOutlined />}
              title="Анализов пока нет"
              description="История появится после первого приёма анализов"
            />
          ) : (
            <Stack spacing={0.75}>
              {orders.map((order) => {
                const composition = order.titles.join(", ") || "—";
                const status = labOrderDispatchStatus(order.isDispatched);
                return (
                  <Box
                    key={order.id}
                    sx={(t) => ({
                      p: 1.5,
                      borderRadius: "10px",
                      border: 1,
                      borderColor: "divider",
                      bgcolor: subtleBg(t),
                    })}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {dayjs(order.createdAt).format("DD.MM.YYYY HH:mm")}
                        </Typography>
                        <Tooltip title={composition}>
                          <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 280 }}>
                            {composition}
                          </Typography>
                        </Tooltip>
                        <Typography variant="caption" color="text.secondary">
                          № в ЛИС: {order.lisOrderCode ?? "—"}
                        </Typography>
                      </Stack>
                      <Stack alignItems="flex-end" flexShrink={0} spacing={0.5}>
                        {canViewFinance && (
                          <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {formatKGS(order.totalAmount)}
                          </Typography>
                        )}
                        <Chip
                          size="small"
                          label={status.label}
                          color={status.color}
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      </AppCard>
    </Box>
  );
};

export default PatientLabOrdersPanel;
