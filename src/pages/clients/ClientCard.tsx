/**
 * ClientCard — «Карточка клиента». Тот же визуальный язык, что у карточки
 * пациента (PatientCard): шапка с действием, крупный аватар с телефоном,
 * плитки фактов (дата рождения, адрес) и приглушённые блоки секций.
 */
import React from "react";
import { Alert, AlertTitle, Box, IconButton, LinearProgress, Link, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import dayjs from "dayjs";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import CakeOutlined from "@mui/icons-material/CakeOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";

import { AppCard, InfoTile, ListEmptyState, UserAvatar } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { birthdayCountdownLabel, daysUntilBirthday, formatAgeYears } from "../../utility/age";
import type { ClientMetrics, DjangoClient } from "../../api/clients";
import type { ClientLayoutSettings } from "./clientLayout";

/** Ближайший день рождения подсвечиваем за неделю — время поздравить. */
const BIRTHDAY_SOON_DAYS = 7;

function money(value: string) {
  return `${Number(value || 0).toLocaleString("ru-RU")} сом`;
}

/** «29.09.1996 (30 лет)» — как в карточке пациента. */
function birthDateLabel(dob: string) {
  const age = formatAgeYears(dob);
  return `${dayjs(dob).format("DD.MM.YYYY")}${age ? ` (${age})` : ""}`;
}

/** «12,5» без хвостовых нулей — для процентов уровня. */
function percent(value: string) {
  return `${Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

type Props = {
  client: DjangoClient | null;
  settings: ClientLayoutSettings;
  canUpdate: boolean;
  onEdit: () => void;
  /** Блок «Покупки»: показывается, только если у роли есть clients.crm.view. */
  showPurchases?: boolean;
  metrics?: ClientMetrics | null;
  metricsLoading?: boolean;
  metricsError?: boolean;
};

export default function ClientCard({
  client,
  settings,
  canUpdate,
  onEdit,
  showPurchases = false,
  metrics = null,
  metricsLoading = false,
  metricsError = false,
}: Props) {
  const isCompany = client?.clientType === "company";
  const daysToBirthday = client && !isCompany ? daysUntilBirthday(client.dob) : null;
  const showDob = Boolean(client?.dob) && !isCompany;
  const showAddress = Boolean(client?.address);
  const showEmail = Boolean(client?.email);
  const factCount = [showDob, showAddress, showEmail].filter(Boolean).length;

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppCard
        variant="outlined"
        header={
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Stack direction="row" alignItems="center" gap={1.25} minWidth={0}>
              <PersonOutlineOutlined color="primary" />
              <Typography variant="h6" noWrap>Карточка клиента</Typography>
            </Stack>
            {client && canUpdate && (
              <Tooltip title="Изменить">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={onEdit}
                  aria-label="Изменить клиента"
                  sx={(th) => ({ flexShrink: 0, bgcolor: alpha(th.palette.primary.main, th.palette.mode === "dark" ? 0.2 : 0.12) })}
                >
                  <EditOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        }
        disableContentPadding
        sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0, borderTop: 1, borderColor: "divider" }}>
          {client ? (
            <Stack spacing={1.5} sx={{ p: 2 }}>
              {client.isBlacklisted && (
                <Alert severity="error" variant="outlined" sx={{ borderRadius: "10px" }}>
                  <AlertTitle sx={{ fontWeight: 600 }}>Клиент в чёрном списке</AlertTitle>
                  {client.blacklistReason || "Причина не указана"}
                </Alert>
              )}

              {/* Идентификация: аватар + имя + звонок + статусы */}
              <Stack direction="row" alignItems="center" spacing={2}>
                <UserAvatar src={client.photoUrl} name={client.fullName} size={64} sx={{ borderRadius: "18px", flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.2, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                    {client.fullName || "Без имени"}
                  </Typography>
                  {client.phone ? (
                    <Link
                      href={`tel:${client.phone}`}
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.75,
                        color: "text.secondary",
                        textDecoration: "none",
                        mt: 0.5,
                        "&:hover": { color: "primary.onSurface" },
                      }}
                    >
                      <PhoneInTalkOutlined fontSize="small" sx={{ color: "primary.onSurface" }} />
                      <Typography variant="body2">{client.phone}</Typography>
                    </Link>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>Телефон не указан</Typography>
                  )}
                  <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.75 }}>
                    <SoftChip label={isCompany ? "Компания" : "Физ. лицо"} />
                    {client.customerStatus && <SoftChip label={client.customerStatus.name} color={client.customerStatus.color} />}
                  </Stack>
                </Box>
              </Stack>

              {daysToBirthday != null && daysToBirthday <= BIRTHDAY_SOON_DAYS && (
                <BirthdayBanner days={daysToBirthday} />
              )}

              {/* Дата рождения + адрес + email */}
              {settings.sections.identity && factCount > 0 && (
                <Box
                  sx={{
                    display: "grid",
                    gap: 1,
                    // Ширина колонки карточки не следует за экраном (≈300–460px
                    // на десктопе, весь экран в листе телефона), поэтому
                    // плитки встают в ряд по месту, а не по брейкпоинту.
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  }}
                >
                  {showDob && <InfoTile icon={<CalendarMonthOutlined />} label="Дата рождения" value={birthDateLabel(client.dob as string)} />}
                  {showAddress && <InfoTile icon={<PlaceOutlined />} label="Адрес" value={client.address} />}
                  {showEmail && <InfoTile icon={<EmailOutlined />} label="Email" value={client.email} />}
                </Box>
              )}

              {settings.sections.company && isCompany && (
                <FactBlock icon={<BusinessOutlined />} title="Реквизиты компании">
                  <Stack spacing={1}>
                    <FactRow label="Юридическое название" value={client.legalName} />
                    <FactRow label="ИНН / ОКПО" value={[client.inn, client.okpo].filter(Boolean).join(" / ")} mono />
                    <FactRow label="Юридический адрес" value={client.legalAddress} />
                    <FactRow label="Банк" value={[client.bankName, client.bankAccount, client.bankBik].filter(Boolean).join(" · ")} />
                  </Stack>
                </FactBlock>
              )}

              {showPurchases && (
                <PurchasesBlock metrics={metrics} loading={metricsLoading} error={metricsError} />
              )}

              {settings.sections.finance && (
                <FactBlock icon={<AccountBalanceWalletOutlined />} title="Счёт клиента">
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <AmountTile icon={<AccountBalanceWalletOutlined />} label="Баланс" value={money(client.balance)} tone="success" />
                    <AmountTile icon={<ReceiptLongOutlined />} label="Долг" value={money(client.debt)} tone={Number(client.debt) > 0 ? "error" : "neutral"} />
                  </Stack>
                </FactBlock>
              )}

              {settings.sections.note && client.note && (
                <FactBlock icon={<NotesOutlined />} title="Комментарий">
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{client.note}</Typography>
                </FactBlock>
              )}
            </Stack>
          ) : (
            <ListEmptyState icon={<PersonOutlineOutlined />} title="Клиент не выбран" description="Выберите клиента в списке" />
          )}
        </Box>
      </AppCard>
    </Box>
  );
}

/**
 * «Покупки»: сколько клиент потратил в организации — по этой сумме считается
 * его уровень. Итог включает покупки до перехода в CRM (перенесены из
 * прежней учётной системы), поэтому под ним — из чего он сложен.
 */
function PurchasesBlock({ metrics, loading, error }: { metrics: ClientMetrics | null; loading: boolean; error: boolean }) {
  if (!metrics) {
    return (
      <FactBlock icon={<ShoppingBagOutlined />} title="Покупки">
        <Typography variant="body2" color={error ? "error" : "text.secondary"}>
          {loading ? "Загрузка…" : error ? "Не удалось загрузить покупки" : "Покупок пока нет"}
        </Typography>
      </FactBlock>
    );
  }

  const net = Number(metrics.netTotal || 0);
  const imported = Number(metrics.importedPurchaseTotal || 0);
  // В CRM — то, что прошло через кассу: покупки минус возвраты.
  const inCrm = Number(metrics.purchaseTotal || 0) - Number(metrics.returnTotal || 0);
  const tier = metrics.tier ?? null;
  const nextTier = metrics.nextTier ?? null;
  const nextThreshold = nextTier ? Number(nextTier.threshold || 0) : 0;
  const progress = nextThreshold > 0 ? Math.min(100, Math.max(0, (net / nextThreshold) * 100)) : 100;

  return (
    <FactBlock icon={<ShoppingBagOutlined />} title="Покупки">
      <Stack spacing={1.25}>
        <Box minWidth={0}>
          <Typography variant="caption" color="text.secondary" display="block">Потратил всего</Typography>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.25, overflowWrap: "anywhere" }}>
            {money(String(net))}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ overflowWrap: "anywhere" }}>
            {`в CRM: ${money(String(inCrm))}`}
            {imported > 0 ? ` · до перехода: ${money(String(imported))}` : ""}
          </Typography>
        </Box>

        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))" }}>
          <FactRow label="Покупок" value={metrics.purchaseCount.toLocaleString("ru-RU")} />
          <FactRow label="Средний чек" value={metrics.purchaseCount > 0 ? money(metrics.averageReceipt) : ""} />
          <FactRow label="Последняя покупка" value={metrics.lastPurchaseAt ? dayjs(metrics.lastPurchaseAt).format("DD.MM.YYYY") : ""} />
        </Box>

        {(tier || nextTier) && (
          <Box sx={{ borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "background.paper", p: 1 }}>
            <Stack direction="row" alignItems="center" gap={1} minWidth={0}>
              <WorkspacePremiumOutlined fontSize="small" color={tier ? "primary" : "disabled"} />
              <Box minWidth={0}>
                <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: "anywhere" }}>
                  {tier ? tier.name : "Без уровня"}
                </Typography>
                {tier && (Number(tier.discountPercent) > 0 || Number(tier.cashbackPercent) > 0) && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {[
                      Number(tier.discountPercent) > 0 ? `скидка ${percent(tier.discountPercent)}` : "",
                      Number(tier.cashbackPercent) > 0 ? `кешбэк ${percent(tier.cashbackPercent)}` : "",
                    ].filter(Boolean).join(" · ")}
                  </Typography>
                )}
              </Box>
            </Stack>
            {nextTier ? (
              <Box sx={{ mt: 1 }}>
                <LinearProgress variant="determinate" value={progress} sx={{ height: 6, borderRadius: 3 }} />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
                  {`До уровня «${nextTier.name}» осталось ${money(nextTier.remaining)}`}
                </Typography>
              </Box>
            ) : (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Максимальный уровень
              </Typography>
            )}
          </Box>
        )}
      </Stack>
    </FactBlock>
  );
}

function BirthdayBanner({ days }: { days: number }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.25}
      sx={(t) => ({
        p: 1.25,
        borderRadius: "10px",
        border: 1,
        borderColor: alpha(t.palette.warning.main, 0.35),
        bgcolor: alpha(t.palette.warning.main, t.palette.mode === "dark" ? 0.14 : 0.1),
        color: t.palette.mode === "dark" ? t.palette.warning.light : t.palette.warning.dark,
      })}
    >
      <CakeOutlined fontSize="small" />
      <Typography variant="body2" fontWeight={600}>
        {days === 0 ? "Сегодня день рождения — поздравьте клиента!" : `День рождения ${birthdayCountdownLabel(days)}`}
      </Typography>
    </Stack>
  );
}

/** Чип статуса: цвет статуса — тонкой подложкой с точкой, а не сплошной заливкой. */
function SoftChip({ label, color }: { label: string; color?: string }) {
  return (
    <Box
      component="span"
      sx={(t) => {
        const base = color || t.palette.text.secondary;
        return {
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          height: 22,
          borderRadius: "999px",
          fontSize: "0.72rem",
          fontWeight: 600,
          lineHeight: 1,
          color: color ? base : "text.secondary",
          bgcolor: color ? alpha(base, t.palette.mode === "dark" ? 0.22 : 0.14) : subtleBg(t, true),
          whiteSpace: "nowrap",
          "&::before": color ? { content: '""', width: 6, height: 6, borderRadius: "50%", bgcolor: base } : undefined,
        };
      }}
    >
      {label}
    </Box>
  );
}

/** Приглушённый бордюр-блок с подписью — как FactBlock в карточке пациента. */
function FactBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Box sx={(t) => ({ borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: subtleBg(t), p: 1.5 })}>
      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
        <Box sx={{ color: "text.secondary", display: "flex", "& .MuiSvgIcon-root": { fontSize: 16 } }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{title}</Typography>
      </Stack>
      {children}
    </Box>
  );
}

function FactRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box minWidth={0}>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="body2" fontWeight={500} sx={{ overflowWrap: "anywhere", ...(mono ? { fontFamily: "monospace" } : {}) }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

function AmountTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "success" | "error" | "neutral" }) {
  return (
    <Box sx={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", gap: 1, p: 1, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Box
        sx={(t) => {
          const toneColor = tone === "success" ? t.palette.success : tone === "error" ? t.palette.error : null;
          return {
            width: 32,
            height: 32,
            borderRadius: "8px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: toneColor ? (t.palette.mode === "dark" ? toneColor.light : toneColor.dark) : "text.secondary",
            bgcolor: toneColor ? alpha(toneColor.main, t.palette.mode === "dark" ? 0.2 : 0.14) : subtleBg(t, true),
            "& .MuiSvgIcon-root": { fontSize: 17 },
          };
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.7rem", lineHeight: 1.2 }}>{label}</Typography>
        <Typography variant="body2" fontWeight={700} noWrap color={tone === "error" ? "error.main" : "text.primary"}>{value}</Typography>
      </Box>
    </Box>
  );
}
