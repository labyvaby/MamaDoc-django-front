import React from "react";
import {
  Box,
  Typography,
  Divider,
  Stack,
  Skeleton,
  Chip,
  Avatar,
  Card,
  CardHeader,
  CardContent,
  IconButton,
  Tooltip,
  Paper,
  Button,
  Collapse,
} from "@mui/material";
import dayjs from "dayjs";
import { alpha } from "@mui/material/styles";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import MedicalServicesIcon from "@mui/icons-material/MedicalServicesOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTimeOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import {
  getService,
  getServicePriceHistory,
  SERVICE_CATEGORIES_ENABLED,
  SERVICE_CATEGORY_LABELS,
  SERVICE_ONLINE_VISIBILITY_ENABLED,
  SERVICE_PRICE_HISTORY_ENABLED,
  SERVICE_RELATED_PRODUCT_ENABLED,
  SERVICE_RELATED_PRODUCTS_MULTI_ENABLED,
} from "../../api/catalog";
import type { Service, ServicePriceHistoryEntry } from "../../api/catalog";
import { formatKGS, formatQuantity } from "../../utility/format";
import { parseBackendError } from "../../api/appointments";
import { AppButton, InfoTile } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import ServicePerformersSection from "./ServicePerformersSection";
import { computeServiceEconomics } from "./serviceEconomics";
import { tt } from "../../i18n/t";

type Props = {
  serviceId: number | null;
  /** Бампается родителем после редактирования — панель перечитывает услугу. */
  refreshToken?: number;
  onEdit?: (s: Service) => void;
  onDelete?: (s: Service) => void;
  /** Создать копию услуги (кнопка «Дублировать»); без колбэка кнопки нет. */
  onDuplicate?: (s: Service) => void;
};

/** Форматирует длительность из минут в вид «45 мин» / «1 ч 15 мин». */
function formatDuration(min: number): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return tt("services:details.durationMin", { minutes: m });
  if (m === 0) return tt("services:details.durationHour", { hours: h });
  return tt("services:details.durationHourMin", { hours: h, minutes: m });
}

/** Заголовок секции: иконка-акцент + приглушённая подпись (как в карточке сотрудника). */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({
  icon,
  title,
}) => (
  <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
    <Box
      sx={{
        color: "primary.onSurface",
        display: "flex",
        "& .MuiSvgIcon-root": { fontSize: 18 },
      }}
    >
      {icon}
    </Box>
    <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
      {title}
    </Typography>
  </Stack>
);

/**
 * Панель с деталями услуги для правой колонки master-detail макета —
 * в едином стиле с карточкой сотрудника.
 */
const ServiceDetailsPanel: React.FC<Props> = ({
  serviceId,
  refreshToken = 0,
  onEdit,
  onDelete,
  onDuplicate,
}) => {
  const { t } = useT("services");
  const [loading, setLoading] = React.useState(false);
  const [service, setService] = React.useState<Service | null>(null);

  React.useEffect(() => {
    if (!serviceId) {
      setService(null);
      return;
    }
    let active = true;
    setLoading(true);
    getService(serviceId)
      .then((s) => {
        if (active) setService(s);
      })
      .catch(() => {
        if (active) setService(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serviceId, refreshToken]);

  // История изменения цены — ленивая подгрузка при раскрытии секции.
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [priceHistory, setPriceHistory] = React.useState<ServicePriceHistoryEntry[]>([]);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setHistoryOpen(false);
    setPriceHistory([]);
    setHistoryError(null);
  }, [serviceId]);

  React.useEffect(() => {
    if (!SERVICE_PRICE_HISTORY_ENABLED || !historyOpen || !service) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError(null);
    getServicePriceHistory(service.id, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setPriceHistory(rows);
      })
      .catch((e) => {
        if (controller.signal.aborted || e?.name === "AbortError") return;
        // 401/403/404 — не пустая история, а сбой доступа/эндпоинта: подмена
        // молчаливым «истории нет» скрыла бы от оператора реальную причину.
        setHistoryError(parseBackendError(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [historyOpen, service]);

  // Сколько платные позиции состава добавят к цене услуги в приёме.
  const billableExtra = React.useMemo(
    () =>
      (service?.relatedProducts ?? []).reduce(
        (sum, p) => (p.billable ? sum + p.price * p.quantity : sum),
        0,
      ),
    [service],
  );

  const economics = React.useMemo(() => computeServiceEconomics(service), [service]);

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" gap={1.25}>
            <Box
              sx={{
                width: 3,
                height: 16,
                borderRadius: 3,
                bgcolor: "primary.main",
              }}
            />
            <Typography variant="subtitle1" fontWeight={600}>
              {t("details.cardTitle")}
            </Typography>
          </Stack>
        }
        action={
          service ? (
            <Stack direction="row" alignItems="center" gap={0.5}>
              {onEdit && (
                <AppButton
                  size="small"
                  startIcon={<EditOutlinedIcon fontSize="small" />}
                  onClick={() => onEdit(service)}
                >
                  {t("details.editButton")}
                </AppButton>
              )}
              {onDuplicate && (
                <Tooltip title={t("details.duplicateTooltip")}>
                  <IconButton size="small" onClick={() => onDuplicate(service)}>
                    <ContentCopyOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {onDelete && (
                <Tooltip title={t("details.deleteTooltip")}>

                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => onDelete(service)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ) : undefined
        }
      />
      <Divider />
      <CardContent sx={{ flex: 1, overflowY: "auto" }}>
        {!serviceId ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 8,
              opacity: 0.6,
            }}
          >
            <MedicalServicesIcon
              sx={{ fontSize: 64, mb: 2, color: "text.secondary" }}
            />
            <Typography variant="body1" color="text.secondary">
              {t("details.emptySelect")}
            </Typography>
          </Box>
        ) : loading ? (
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Skeleton variant="rounded" width={76} height={76} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={32} />
                <Skeleton variant="text" width="40%" />
              </Box>
            </Stack>
            <Skeleton variant="rounded" height={72} />
            <Skeleton variant="rounded" height={72} />
          </Stack>
        ) : service ? (
          <Stack spacing={3}>
            {/* Hero: изображение + название + чипы */}
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Box sx={{ position: "relative", flexShrink: 0 }}>
                <Avatar
                  variant="rounded"
                  src={service.imageUrl ?? undefined}
                  sx={(t) => ({
                    width: 76,
                    height: 76,
                    borderRadius: "18px",
                    color: "primary.onSurface",
                    bgcolor: alpha(
                      t.palette.primary.main,
                      t.palette.mode === "dark" ? 0.16 : 0.1,
                    ),
                  })}
                >
                  <MedicalServicesIcon sx={{ fontSize: 32 }} />
                </Avatar>
                <Box
                  sx={(t) => ({
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `3px solid ${t.palette.background.paper}`,
                    bgcolor: service.isActive
                      ? t.palette.success.main
                      : t.palette.grey[500],
                  })}
                />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  sx={{ letterSpacing: -0.2, lineHeight: 1.2 }}
                >
                  {service.name}
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75 }}
                >
                  <Chip
                    label={t("common.chip")}
                    size="small"
                    sx={(t) => ({
                      fontWeight: 500,
                      height: 24,
                      borderRadius: "7px",
                      color: "primary.onSurface",
                      bgcolor: alpha(
                        t.palette.primary.main,
                        t.palette.mode === "dark" ? 0.18 : 0.1,
                      ),
                    })}
                  />
                  <Chip
                    size="small"
                    label={service.isActive ? t("common.active") : t("common.inactive")}
                    icon={
                      <Box
                        component="span"
                        sx={(t) => ({
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          bgcolor: service.isActive
                            ? t.palette.success.main
                            : t.palette.grey[500],
                          ml: 0.75,
                        })}
                      />
                    }
                    sx={(t) => {
                      const tone = service.isActive ? t.palette.success : null;
                      return {
                        fontWeight: 500,
                        height: 24,
                        borderRadius: "7px",
                        "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
                        color: tone
                          ? t.palette.mode === "dark"
                            ? tone.light
                            : tone.dark
                          : "text.secondary",
                        bgcolor: tone
                          ? alpha(tone.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                          : subtleBg(t, true),
                      };
                    }}
                  />
                  {SERVICE_CATEGORIES_ENABLED && service.category && (
                    <Chip
                      size="small"
                      icon={<CategoryOutlinedIcon />}
                      label={SERVICE_CATEGORY_LABELS[service.category]}
                      variant="outlined"
                      sx={{ height: 24, borderRadius: "7px", fontWeight: 500 }}
                    />
                  )}
                  {/* Видима на витрине по умолчанию — отмечаем только исключение. */}
                  {SERVICE_ONLINE_VISIBILITY_ENABLED && !service.onlineBookingVisible && (
                    <Chip
                      size="small"
                      icon={<VisibilityOffOutlinedIcon />}
                      label={t("details.hiddenOnline")}
                      variant="outlined"
                      color="warning"
                      sx={{ height: 24, borderRadius: "7px", fontWeight: 500 }}
                    />
                  )}
                  {service.allowPriceOverride && (
                    <Tooltip title={t("details.priceOverrideHint")}>
                      <Chip
                        size="small"
                        icon={<EditNoteOutlinedIcon />}
                        label={t("details.priceOverrideChip")}
                        variant="outlined"
                        sx={{ height: 24, borderRadius: "7px", fontWeight: 500 }}
                      />
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            </Stack>

            {/* Основное: стоимость + длительность */}
            <Box>
              <SectionHeader icon={<PaymentsOutlinedIcon />} title={t("details.sectionMain")} />
              <Box
                sx={{
                  display: "grid",
                  gap: 1.25,
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                }}
              >
                <InfoTile
                  icon={<PaymentsOutlinedIcon />}
                  label={t("details.price")}
                  value={
                    service.basePrice
                      ? formatKGS(Number(service.basePrice))
                      : undefined
                  }
                  active={Boolean(service.basePrice)}
                />
                <InfoTile
                  icon={<AccessTimeIcon />}
                  label={t("details.duration")}
                  value={
                    service.durationMinutes > 0
                      ? formatDuration(service.durationMinutes)
                      : undefined
                  }
                  active={service.durationMinutes > 0}
                />
                {/* Экономика — только когда есть из чего считать: без состава
                    себестоимость нулевая, а «маржа = цена» ничего не говорит. */}
                {SERVICE_RELATED_PRODUCT_ENABLED && economics.cost > 0 && (
                  <>
                    <InfoTile
                      icon={<Inventory2OutlinedIcon />}
                      label={t("details.cost")}
                      value={formatKGS(economics.cost)}
                      active
                    />
                    <InfoTile
                      icon={<TrendingUpOutlinedIcon />}
                      label={
                        economics.marginPercent != null
                          ? t("details.marginWithPercent", {
                              percent: Math.round(economics.marginPercent),
                            })
                          : t("details.margin")
                      }
                      value={
                        <Box
                          component="span"
                          sx={{ color: economics.margin < 0 ? "error.main" : undefined }}
                        >
                          {formatKGS(economics.margin)}
                        </Box>
                      }
                      active
                    />
                  </>
                )}
              </Box>
              {economics.outOfStock.length > 0 && (
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  gap={1}
                  sx={(th) => ({
                    mt: 1.25,
                    p: 1.25,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: alpha(th.palette.warning.main, 0.4),
                    bgcolor: alpha(th.palette.warning.main, th.palette.mode === "dark" ? 0.14 : 0.08),
                  })}
                >
                  <WarningAmberOutlinedIcon
                    fontSize="small"
                    sx={{ color: "warning.main", mt: 0.25 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {t("details.stockWarning", {
                      products: economics.outOfStock.map((p) => p.name).join(", "),
                    })}
                  </Typography>
                </Stack>
              )}
              {SERVICE_PRICE_HISTORY_ENABLED && (
                <Box sx={{ mt: 1.25 }}>
                  <Button
                    size="small"
                    startIcon={<HistoryOutlinedIcon fontSize="small" />}
                    onClick={() => setHistoryOpen((v) => !v)}
                    sx={{
                      textTransform: "none",
                      px: 0,
                      "&:hover": { bgcolor: "transparent", textDecoration: "underline" },
                    }}
                    disableRipple
                  >
                    {historyOpen ? t("details.priceHistoryHide") : t("details.priceHistoryShow")}
                  </Button>
                  <Collapse in={historyOpen}>
                    <Paper
                      elevation={0}
                      sx={(th) => ({
                        mt: 1,
                        p: 1.5,
                        borderRadius: "10px",
                        border: 1,
                        borderColor: "divider",
                        bgcolor: subtleBg(th),
                      })}
                    >
                      {historyLoading ? (
                        <Typography variant="body2" color="text.secondary">
                          {t("details.priceHistoryLoading")}
                        </Typography>
                      ) : historyError ? (
                        <Typography variant="body2" color="error">
                          {historyError}
                        </Typography>
                      ) : priceHistory.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          {t("details.priceHistoryEmpty")}
                        </Typography>
                      ) : (
                        <Stack divider={<Divider sx={{ borderStyle: "dashed" }} />} spacing={1}>
                          {priceHistory.map((h, i) => (
                            <Stack
                              key={`${h.changedAt}-${i}`}
                              direction="row"
                              alignItems="center"
                              justifyContent="space-between"
                              spacing={1}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={600}>
                                  {formatKGS(h.price)}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  noWrap
                                  display="block"
                                >
                                  {h.changedByName || t("details.priceHistoryUnknownAuthor")}
                                </Typography>
                              </Box>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ flexShrink: 0 }}
                              >
                                {dayjs(h.changedAt).format("DD.MM.YYYY HH:mm")}
                              </Typography>
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </Paper>
                  </Collapse>
                </Box>
              )}
            </Box>

            {/* Филиалы */}
            {service.branches.length > 0 && (
              <Box>
                <SectionHeader icon={<PlaceOutlinedIcon />} title={t("details.sectionBranches")} />
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {service.branches.map((b) => (
                    <Chip
                      key={b.id}
                      label={b.name}
                      size="small"
                      icon={<PlaceOutlinedIcon />}
                      variant="outlined"
                      sx={{ borderRadius: "7px", height: 30 }}
                    />
                  ))}
                  {service.hasHiddenBranches && (
                    <Chip
                      label="…"
                      size="small"
                      variant="outlined"
                      sx={{ borderRadius: "7px", height: 30 }}
                    />
                  )}
                </Stack>
              </Box>
            )}

            {/* Кто оказывает услугу */}
            <ServicePerformersSection
              serviceId={service.id}
              serviceName={service.name}
              renderHeader={(count) => (
                <SectionHeader
                  icon={<GroupsOutlinedIcon />}
                  title={
                    count == null
                      ? t("details.sectionPerformers")
                      : t("details.sectionPerformersCount", { count })
                  }
                />
              )}
            />

            {/* Состав расходников услуги */}
            {SERVICE_RELATED_PRODUCT_ENABLED && service.relatedProducts.length > 0 && (
              <Box>
                <SectionHeader
                  icon={<Inventory2OutlinedIcon />}
                  title={
                    SERVICE_RELATED_PRODUCTS_MULTI_ENABLED
                      ? t("details.sectionComposition")
                      : t("details.sectionCompositionSingle")
                  }
                />
                {/* Компактный список: одна строка на расходник, разделители
                    вместо отдельных карточек — состав обычно из 1–3 позиций и
                    не должен занимать пол-панели. */}
                <Paper variant="outlined" sx={{ borderRadius: 1.5, overflow: "hidden" }}>
                  {service.relatedProducts.map((p, i) => (
                    <Stack
                      key={p.id}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{
                        px: 1.25,
                        py: 0.75,
                        borderTop: i === 0 ? 0 : 1,
                        borderColor: "divider",
                      }}
                    >
                      <Inventory2OutlinedIcon
                        sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {SERVICE_RELATED_PRODUCTS_MULTI_ENABLED
                            ? `${p.name} × ${formatQuantity(p.quantity)}${p.unit ? ` ${p.unit}` : ""}`
                            : p.name}
                        </Typography>
                        {/* Остаток здесь — по всей организации: в справочнике услуги
                            филиала нет, склад филиала считается в приёме. */}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="div"
                          noWrap
                        >
                          {formatKGS(p.price)} · {t("details.stock", { stock: formatQuantity(p.stock) })}
                        </Typography>
                      </Box>

                      {SERVICE_RELATED_PRODUCTS_MULTI_ENABLED && (
                        <Stack
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                          sx={{ flexShrink: 0 }}
                        >
                          {!p.autoWriteOff && (
                            <Chip
                              label={t("details.noWriteOff")}
                              size="small"
                              variant="outlined"
                              sx={{ borderRadius: "7px", height: 22, fontSize: "0.7rem" }}
                            />
                          )}
                          <Chip
                            label={
                              p.billable
                                ? t("details.extraToPrice", {
                                    amount: formatKGS(p.price * p.quantity),
                                  })
                                : t("details.included")
                            }
                            size="small"
                            color={p.billable ? "primary" : "default"}
                            variant={p.billable ? "filled" : "outlined"}
                            sx={{ borderRadius: "7px", height: 22, fontSize: "0.7rem" }}
                          />
                        </Stack>
                      )}
                    </Stack>
                  ))}
                </Paper>
                {billableExtra > 0 && (
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="baseline"
                    sx={{ mt: 1.25 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {t("details.billableFooter")}
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      + {formatKGS(billableExtra)}
                    </Typography>
                  </Stack>
                )}
              </Box>
            )}

            {/* Описание */}
            {service.description && (
              <Box>
                <SectionHeader icon={<NotesOutlinedIcon />} title={t("details.sectionDescription")} />
                <Box
                  sx={(t) => ({
                    p: 1.75,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: subtleBg(t),
                  })}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ whiteSpace: "pre-wrap" }}
                  >
                    {service.description}
                  </Typography>
                </Box>
              </Box>
            )}
          </Stack>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ py: 4 }}
          >
            {t("common.notFound")}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default ServiceDetailsPanel;
