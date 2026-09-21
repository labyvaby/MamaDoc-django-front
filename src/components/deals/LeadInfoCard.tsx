import React from "react";
import {
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Link,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Link as RouterLink } from "react-router";
import { useQuery } from "@tanstack/react-query";
import AlternateEmailOutlined from "@mui/icons-material/AlternateEmailOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";

import ChannelIcon from "./ChannelIcon";
import { getDealPatientCandidates, type Deal } from "../../api/deals";
import { searchPatients, type DjangoPatient } from "../../api/patients";
import { djangoQueryKeys } from "../../api/queryKeys";
import { orgWide } from "../../api/scope";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useT } from "../../i18n/VerticalProvider";
import { formatPhoneDisplay } from "../../utility/phone";

interface LeadInfoCardProps {
  deal: Deal;
  orgId: number | undefined;
  canUpdate: boolean;
  busy: boolean;
  onLinkPatient: (patientId: number) => void;
  onUnlinkPatient: () => void;
  onNotify: (message: string) => void;
}

/** Профиль в мессенджере по никнейму — только там, где ссылка однозначна. */
function profileUrl(channel: Deal["channel"], username: string): string | null {
  if (!username) return null;
  if (channel === "instagram") return `https://instagram.com/${username}`;
  if (channel === "telegram") return `https://t.me/${username}`;
  return null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Блок «О лиде»: кто написал и как с ним связаться.
 *
 * Имя, никнейм и телефон — всё, что известно об автолиде из Chatwoot; тут же
 * связь с картой клиента. Пока карта не привязана, бэк подсказывает совпадения
 * по телефону (`patient-candidates/`), а рядом — поиск по имени/номеру: лид
 * с чужого номера (мама пишет за ребёнка) привязывается руками.
 */
const LeadInfoCard: React.FC<LeadInfoCardProps> = ({
  deal,
  orgId,
  canUpdate,
  busy,
  onLinkPatient,
  onUnlinkPatient,
  onNotify,
}) => {
  const { t } = useT("deals");
  const [search, setSearch] = React.useState("");
  const debounced = useDebouncedValue(search, 350);
  const linked = deal.patientId != null;

  const candidatesQuery = useQuery({
    queryKey: djangoQueryKeys.deals.patientCandidates(deal.id, orgId),
    queryFn: ({ signal }) => getDealPatientCandidates(deal.id, orgId, signal),
    enabled: !linked && Boolean(deal.phone),
    staleTime: 60_000,
  });

  const searchQuery = useQuery({
    queryKey: ["django", "deals", deal.id, "patient-search", debounced, orgId ?? null],
    queryFn: ({ signal }) => searchPatients(orgWide(orgId), debounced.trim(), 8, signal),
    enabled: !linked && canUpdate && debounced.trim().length >= 2,
  });

  const url = profileUrl(deal.channel, deal.contactUsername);
  const copy = async (text: string) => {
    if (await copyText(text)) onNotify(t("detail.copied"));
  };

  return (
    <Box
      sx={(theme) => ({
        borderRadius: 2,
        px: 1.75,
        py: 1.5,
        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.06 : 0.04),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
      })}
    >
      <Stack gap={1}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, letterSpacing: 1 }}>
          {t("detail.leadInfo")}
        </Typography>

        <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
          <ChannelIcon channel={deal.channel} size={18} />
          <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ minWidth: 0, flex: 1 }}>
            {deal.contactName || "—"}
          </Typography>
        </Stack>

        {deal.contactUsername ? (
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
            <AlternateEmailOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
            {url ? (
              <Link
                href={url}
                target="_blank"
                rel="noopener"
                variant="body2"
                underline="hover"
                noWrap
                sx={{ minWidth: 0 }}
              >
                {deal.contactUsername}
              </Link>
            ) : (
              <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                {deal.contactUsername}
              </Typography>
            )}
            {url ? (
              <Tooltip title={t("detail.usernameOpen")}>
                <IconButton size="small" component="a" href={url} target="_blank" rel="noopener">
                  <OpenInNewOutlined sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        ) : null}

        {deal.phone ? (
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
            <PhoneOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
            <Link href={`tel:${deal.phone}`} variant="body2" underline="hover" noWrap sx={{ minWidth: 0 }}>
              {formatPhoneDisplay(deal.phone)}
            </Link>
            <Tooltip title={t("detail.copyPhone")}>
              <IconButton size="small" onClick={() => void copy(deal.phone)}>
                <ContentCopyOutlined sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : null}

        {/* Связь с картой клиента. */}
        <Stack gap={0.75} sx={{ pt: 0.5, borderTop: 1, borderColor: "divider" }}>
          {linked ? (
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
              <PersonOutlineOutlined sx={{ fontSize: 16, color: "success.main" }} />
              <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1 }}>
                {deal.patientName ?? t("detail.clientLinked")}
              </Typography>
              <Link
                component={RouterLink}
                to={`/patients?patient=${deal.patientId}`}
                variant="caption"
                underline="hover"
                sx={{ whiteSpace: "nowrap" }}
              >
                {t("detail.clientOpen")}
              </Link>
              {canUpdate ? (
                <Tooltip title={t("detail.clientUnlink")}>
                  <span>
                    <IconButton size="small" onClick={onUnlinkPatient} disabled={busy}>
                      <LinkOffOutlined sx={{ fontSize: 15 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              ) : null}
            </Stack>
          ) : (
            <>
              <Stack direction="row" alignItems="center" gap={0.75}>
                <PersonOutlineOutlined sx={{ fontSize: 16, color: "text.disabled" }} />
                <Typography variant="caption" color="text.secondary">
                  {t("detail.clientNone")}
                </Typography>
                {candidatesQuery.isFetching ? <CircularProgress size={12} /> : null}
              </Stack>

              {(candidatesQuery.data?.length ?? 0) > 0 ? (
                <Stack gap={0.5}>
                  <Typography variant="caption" color="text.secondary">
                    {t("detail.clientCandidates")}:
                  </Typography>
                  <Stack direction="row" gap={0.75} flexWrap="wrap">
                    {candidatesQuery.data?.map((candidate) => (
                      <Chip
                        key={candidate.id}
                        size="small"
                        color="primary"
                        variant="outlined"
                        icon={<PersonOutlineOutlined />}
                        label={`${candidate.fullName} · ${formatPhoneDisplay(candidate.phone)}`}
                        onClick={canUpdate ? () => onLinkPatient(candidate.id) : undefined}
                        disabled={busy}
                        sx={{ maxWidth: "100%" }}
                      />
                    ))}
                  </Stack>
                </Stack>
              ) : null}

              {canUpdate ? (
                <Autocomplete<DjangoPatient>
                  size="small"
                  options={searchQuery.data ?? []}
                  loading={searchQuery.isFetching}
                  value={null}
                  inputValue={search}
                  onInputChange={(_e, value, reason) => {
                    if (reason !== "reset") setSearch(value);
                  }}
                  onChange={(_e, patient) => {
                    if (patient) {
                      onLinkPatient(patient.id);
                      setSearch("");
                    }
                  }}
                  getOptionLabel={(p) => p.fullName}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  filterOptions={(options) => options}
                  noOptionsText={debounced.trim().length >= 2 ? "—" : t("detail.clientSearch")}
                  renderOption={(props, patient) => (
                    <li {...props} key={patient.id}>
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {patient.fullName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {formatPhoneDisplay(patient.phone)}
                          {patient.birthDate ? ` · ${patient.birthDate}` : ""}
                        </Typography>
                      </Stack>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={t("detail.clientSearch")}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <PersonSearchOutlined sx={{ fontSize: 18, color: "text.secondary", mr: 0.5 }} />
                        ),
                      }}
                    />
                  )}
                />
              ) : null}
            </>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

export default LeadInfoCard;
