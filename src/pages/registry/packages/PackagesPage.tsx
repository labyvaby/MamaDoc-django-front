import React from "react";
import { Alert, Box, Chip, Collapse, Link, Paper, Stack, Switch, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";

import { getErrorMessage } from "../../../api/client";
import {
  getProgramPackages,
  getPrograms,
  updateProgramPackage,
  type Program,
  type ProgramPackage,
} from "../../../api/programs";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { AppButton, AppCard, ListLoadingSkeleton } from "../../../components/ui";
import { useActiveScope } from "../../../hooks/useActiveScope";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useT } from "../../../i18n/VerticalProvider";
import { ProgramProductSettings } from "../../patient-program/ProgramProductSettings";
import { formatMoney } from "../registryTabs";
import { PackageDialog } from "./PackageDialog";

/**
 * Пакеты учёта: что продаётся по каждой медицинской программе — цена, срок,
 * семейная скидка, скидка на приёмы, «Что входит» — и настройки учёта
 * программы. Экран управляющего (право programs.manage, маршрут).
 */
const PackagesPage: React.FC = () => {
  const { t } = useT("registry");
  usePageTitle(t("packages.title"));
  const scope = useActiveScope();
  const ready = scope.isReady && scope.orgReady;
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<{ program: Program; pkg: ProgramPackage | null } | null>(null);
  const [settingsFor, setSettingsFor] = React.useState<number | null>(null);

  const programs = useQuery({
    queryKey: djangoQueryKeys.programs.list(scope),
    queryFn: ({ signal }) => getPrograms(scope, signal),
    enabled: ready,
  });
  const packages = useQuery({
    queryKey: djangoQueryKeys.programs.packages(scope, {}),
    queryFn: ({ signal }) => getProgramPackages(scope, {}, signal),
    enabled: ready,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.all });
  };
  const toggle = useMutation({
    mutationFn: (pkg: ProgramPackage) => updateProgramPackage(scope, pkg.id, { isActive: !pkg.isActive }),
    onSuccess: refresh,
  });

  const medical = (programs.data?.results ?? []).filter(
    (program) => program.businessDomain === "medical" && program.status !== "archived",
  );
  const packagesOf = (programId: number) => (packages.data ?? []).filter((pkg) => pkg.programId === programId);
  const error = programs.error ?? packages.error ?? toggle.error;

  return (
    <Box sx={{ px: (theme) => theme.appLayout.page.paddingX, pb: 2 }}>
      <Link
        component={RouterLink}
        to="/registry"
        variant="body2"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mb: 1 }}
      >
        <ArrowBackOutlined fontSize="small" />
        {t("packages.back")}
      </Link>
      <Typography variant="h5" fontWeight={700}>
        {t("packages.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("packages.subtitle")}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(error)}
        </Alert>
      )}
      {programs.isLoading || packages.isLoading ? (
        <ListLoadingSkeleton />
      ) : medical.length === 0 ? (
        <Alert severity="info">{t("packages.noPrograms")}</Alert>
      ) : (
        <Stack gap={2}>
          {medical.map((program) => (
            <AppCard key={program.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ sm: "center" }}
                gap={1}
              >
                <Stack direction="row" alignItems="center" gap={1}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {program.name}
                  </Typography>
                  {(program.status !== "active" || !program.isEnabled) && (
                    <Chip size="small" label={t("packages.programInactive")} />
                  )}
                </Stack>
                <Stack direction="row" gap={1}>
                  <AppButton
                    variant="text"
                    size="small"
                    startIcon={<TuneOutlined />}
                    onClick={() => setSettingsFor(settingsFor === program.id ? null : program.id)}
                  >
                    {t("packages.settings")}
                  </AppButton>
                  <AppButton
                    variant="contained"
                    size="small"
                    startIcon={<AddOutlined />}
                    onClick={() => setEditing({ program, pkg: null })}
                  >
                    {t("packages.new")}
                  </AppButton>
                </Stack>
              </Stack>
              <Collapse in={settingsFor === program.id} unmountOnExit>
                <Box sx={{ mt: 1.5 }}>
                  <ProgramProductSettings program={program} scope={scope} onSaved={refresh} />
                </Box>
              </Collapse>
              <Stack gap={1} sx={{ mt: 1.5 }}>
                {packagesOf(program.id).length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {t("packages.empty")}
                  </Typography>
                )}
                {packagesOf(program.id).map((pkg) => (
                  <Paper key={pkg.id} variant="outlined" sx={{ p: 1.5, opacity: pkg.isActive ? 1 : 0.6 }}>
                    <Stack direction="row" alignItems="center" gap={1.5}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontWeight={600} noWrap>
                          {pkg.name}
                        </Typography>
                        <Typography variant="body2">
                          {formatMoney(pkg.priceAmount)} сом
                          {pkg.listPriceAmount && (
                            <Box component="s" sx={{ color: "text.secondary", ml: 1 }}>
                              {formatMoney(pkg.listPriceAmount)}
                            </Box>
                          )}
                          {` · ${t("packages.months", { n: pkg.termMonths })}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="p">
                          {[
                            pkg.familyDiscountPercent > 0
                              ? t("packages.familyShort", { percent: pkg.familyDiscountPercent })
                              : null,
                            pkg.visitDiscountPercent > 0
                              ? t("packages.visitShort", { percent: pkg.visitDiscountPercent })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Typography>
                      </Box>
                      <Switch
                        size="small"
                        checked={pkg.isActive}
                        onChange={() => toggle.mutate(pkg)}
                        disabled={toggle.isPending}
                        inputProps={{ "aria-label": t("packages.active") }}
                      />
                      <AppButton
                        variant="text"
                        size="small"
                        startIcon={<EditOutlined />}
                        onClick={() => setEditing({ program, pkg })}
                      >
                        {t("packages.change")}
                      </AppButton>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </AppCard>
          ))}
        </Stack>
      )}
      {editing && (
        <PackageDialog
          scope={scope}
          programId={editing.program.id}
          programName={editing.program.name}
          pkg={editing.pkg}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </Box>
  );
};

export default PackagesPage;
