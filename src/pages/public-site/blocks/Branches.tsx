import React from "react";
import { Box, Button, Link, Skeleton, Stack, Typography } from "@mui/material";
import MapOutlined from "@mui/icons-material/MapOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";

import {
  getBranch,
  idOrSlugRef,
  type BranchDetail,
  type BranchPreview,
} from "../../../api/publicBooking";
import { isAbortError } from "../../../api/client";
import { useT } from "../../../i18n/VerticalProvider";
import { formatPhone, telHref } from "../../public-booking/format";
import { SITE_BORDER, SITE_TILE_RADIUS } from "../theme";
import { SiteSection } from "../shell";
import { EmptyNote } from "./EmptyNote";

/**
 * Адреса: филиал, телефоны и ссылка «Маршрут».
 *
 * Ссылки на карты лежат в деталях филиала (`/branches/<id>/`), а не в списке,
 * поэтому детали добираются отдельно и только когда блок реально показывается.
 * Филиалов у организации единицы, так что это несколько запросов, а не веер.
 * Без ссылок блок всё равно рабочий — просто без кнопки маршрута.
 */
function useBranchMaps(branches: BranchPreview[]): Map<number, BranchDetail> {
  const [details, setDetails] = React.useState<Map<number, BranchDetail>>(new Map());
  const key = branches.map((b) => b.id).join(",");

  React.useEffect(() => {
    if (!key) {
      setDetails(new Map());
      return;
    }
    const controller = new AbortController();
    Promise.all(
      branches.map((branch) =>
        getBranch(idOrSlugRef(branch), controller.signal).catch((e) => {
          if (isAbortError(e)) throw e;
          return null;
        }),
      ),
    )
      .then((list) => {
        const map = new Map<number, BranchDetail>();
        for (const detail of list) if (detail) map.set(detail.id, detail);
        setDetails(map);
      })
      .catch(() => {
        // Уход со страницы — состояние уже никому не нужно.
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return details;
}

/** Первая заполненная ссылка на карты: гостю всё равно, какой сервис. */
function mapUrl(detail: BranchDetail | undefined): string | null {
  if (!detail) return null;
  return detail.twoGisUrl || detail.yandexMapsUrl || detail.googleMapsUrl || null;
}

export const Branches: React.FC<{
  id: string;
  branches: BranchPreview[];
  loading: boolean;
  tinted?: boolean;
}> = ({ id, branches, loading, tinted }) => {
  const { t } = useT("landing");
  const details = useBranchMaps(branches);

  return (
    <SiteSection id={id} title={t("branches.title")} subtitle={t("branches.subtitle")} tinted={tinted}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {loading
          ? Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={170} />
            ))
          : branches.map((branch) => {
              const url = mapUrl(details.get(branch.id));
              return (
                <Stack
                  key={branch.id}
                  spacing={1.5}
                  sx={{
                    p: 2.5,
                    height: "100%",
                    borderRadius: SITE_TILE_RADIUS,
                    border: `1px solid ${SITE_BORDER}`,
                    bgcolor: "background.paper",
                  }}
                >
                  <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{branch.name}</Typography>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <PlaceOutlined sx={{ fontSize: 18, color: "text.secondary", mt: "2px" }} />
                    <Typography sx={{ fontSize: 14 }}>{branch.address}</Typography>
                  </Stack>
                  {branch.phones.filter(Boolean).map((phone) => (
                    <Stack key={phone} direction="row" spacing={1} alignItems="center">
                      <PhoneOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                      <Link
                        href={telHref(phone)}
                        underline="hover"
                        sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}
                      >
                        {formatPhone(phone)}
                      </Link>
                    </Stack>
                  ))}
                  <Box sx={{ flexGrow: 1 }} />
                  {url && (
                    <Button
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      startIcon={<MapOutlined />}
                      variant="outlined"
                      sx={{
                        alignSelf: "flex-start",
                        borderRadius: 99,
                        borderColor: SITE_BORDER,
                        color: "text.primary",
                        fontWeight: 600,
                      }}
                    >
                      {t("branches.route")}
                    </Button>
                  )}
                </Stack>
              );
            })}
      </Box>
      {!loading && branches.length === 0 && <EmptyNote text={t("branches.empty")} />}
    </SiteSection>
  );
};
