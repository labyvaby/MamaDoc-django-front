import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";

import type {
  AppointmentPriceOverride,
  AppointmentServiceLine,
} from "../../../../api/appointments";
import { formatKGS } from "../../../../utility/format";
import { formatDateRu } from "../../../../utility/format";
import { useT } from "../../../../i18n/VerticalProvider";

export interface AppointmentPriceHistoryProps {
  overrides: AppointmentPriceOverride[];
  /** Строки приёма — из них берём название услуги для записи истории. */
  services: AppointmentServiceLine[];
}

/**
 * История правок цены услуг приёма.
 *
 * Бэк пишет запись на обоих путях — и на `/price-override/`, и на create/PATCH
 * с `services[].unitPrice` (ответ бэка 19.08.2026). До этого правка через форму
 * меняла цену молча, и на вопрос «кто поставил 500 вместо 1200» ответа не было
 * именно там, где он возникает первым.
 *
 * Блок появляется только при непустой истории: у приёма с ценами из прайса
 * пустой заголовок «Правки цены» читался бы как «правки были, но не показаны».
 */
const AppointmentPriceHistory: React.FC<AppointmentPriceHistoryProps> = ({
  overrides,
  services,
}) => {
  const { t } = useT("appointments");

  if (overrides.length === 0) return null;

  // Строку могли удалить после правки — тогда serviceLineId приходит null и
  // название взять неоткуда.
  const serviceName = (lineId: number | null): string | null => {
    if (lineId == null) return null;
    const line = services.find((sl) => sl.id === lineId);
    return line?.service?.name ?? null;
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
        <HistoryOutlined color="primary" fontSize="small" />
        <Typography variant="subtitle2" color="text.secondary">
          {t("priceHistory.title")}
        </Typography>
      </Stack>

      <Stack spacing={0.5}>
        {overrides.map((o) => {
          const name = serviceName(o.serviceLineId);
          return (
            <Stack
              key={o.id}
              direction="row"
              spacing={1}
              alignItems="baseline"
              flexWrap="wrap"
              useFlexGap
            >
              <Typography variant="body2">
                {name ?? t("priceHistory.deletedLine")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("priceHistory.entry", {
                  old: formatKGS(o.oldUnitPrice),
                  new: formatKGS(o.newUnitPrice),
                })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[o.changedByName, formatDateRu(o.changedAt)].filter(Boolean).join(" · ")}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
};

export default AppointmentPriceHistory;
