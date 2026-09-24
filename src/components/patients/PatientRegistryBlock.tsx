import React from "react";
import {
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AssignmentIndOutlined from "@mui/icons-material/AssignmentIndOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FamilyRestroomOutlined from "@mui/icons-material/FamilyRestroomOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import NotificationsOffOutlined from "@mui/icons-material/NotificationsOffOutlined";
import StarOutlined from "@mui/icons-material/StarOutlined";
import StarOutlineOutlined from "@mui/icons-material/StarOutlineOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router";

import { getErrorMessage } from "../../api/client";
import type { DjangoPatient } from "../../api/patients";
import { getProgramEnrollments } from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  addRepresentative,
  getRepresentatives,
  getRepresented,
  removeRepresentative,
  updateRepresentative,
  type Representative,
} from "../../api/registry";
import { AppButton, ConfirmDialog } from "../ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { useT } from "../../i18n/VerticalProvider";
import { newRepresentative, type RepresentativeState } from "../../pages/registry/intake/intakeState";
import { RepresentativeCard } from "../../pages/registry/intake/steps/RepresentativesStep";
import { formatMoney, isChild } from "../../pages/registry/registryTabs";
import { formatPhoneDisplay } from "../../utility/phone";

interface PatientRegistryBlockProps {
  patient: DjangoPatient;
  scope: ActiveScope;
  canManageEnrollments: boolean;
  canEditPatients: boolean;
  canCreatePatients: boolean;
  onIntake?: () => void;
}

const Section: React.FC<{ icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  title,
  action,
  children,
}) => (
  <Box sx={{ borderRadius: "10px", border: 1, borderColor: "divider", p: 1.5 }}>
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
      <Box sx={{ color: "text.secondary", display: "flex", "& .MuiSvgIcon-root": { fontSize: 16 } }}>{icon}</Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, flex: 1 }}>
        {title}
      </Typography>
      {action}
    </Stack>
    {children}
  </Box>
);

/** Учёт в карточке пациента: подключение, представители ребёнка или дети взрослого. */
export const PatientRegistryBlock: React.FC<PatientRegistryBlockProps> = ({
  patient,
  scope,
  canManageEnrollments,
  canEditPatients,
  canCreatePatients,
  onIntake,
}) => {
  const { t } = useT("registry");
  const queryClient = useQueryClient();
  const child = isChild(patient.birthDate);
  const ready = scope.isReady && scope.orgReady;
  const [adding, setAdding] = React.useState<RepresentativeState | null>(null);
  const [removing, setRemoving] = React.useState<Representative | null>(null);

  const enrollments = useQuery({
    queryKey: djangoQueryKeys.programs.enrollments(patient.id, scope),
    queryFn: ({ signal }) => getProgramEnrollments(scope, { patientId: patient.id, limit: 50 }, signal),
    enabled: ready,
  });
  const onRegistry = (enrollments.data?.results ?? []).filter(
    (row) => row.status !== "cancelled" && row.terms?.length,
  );

  const repsKey = djangoQueryKeys.patients.representatives(patient.id);
  const representatives = useQuery({
    queryKey: repsKey,
    queryFn: ({ signal }) => getRepresentatives(patient.id, signal),
    enabled: ready && child,
  });
  const represented = useQuery({
    queryKey: djangoQueryKeys.patients.represented(patient.id),
    queryFn: ({ signal }) => getRepresented(patient.id, signal),
    enabled: ready && !child,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: repsKey });
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.detail(patient.id) });
  };
  const update = useMutation({
    mutationFn: ({ link, patch }: { link: Representative; patch: Parameters<typeof updateRepresentative>[2] }) =>
      updateRepresentative(patient.id, link.id, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (link: Representative) => removeRepresentative(patient.id, link.id),
    onSuccess: () => {
      setRemoving(null);
      refresh();
    },
  });
  const add = useMutation({
    mutationFn: (rep: RepresentativeState) =>
      addRepresentative(patient.id, {
        relation: rep.relation,
        ...(rep.mode === "existing" && rep.existing
          ? { representativeId: rep.existing.id }
          : { newRepresentative: { fullName: rep.fullName.trim(), phone: rep.phone.trim() } }),
        isLegalRepresentative: rep.isLegalRepresentative,
        isPrimaryContact: rep.isPrimaryContact,
        receivesNotifications: rep.receivesNotifications,
        joinFamily: rep.joinFamily,
      }),
    onSuccess: () => {
      setAdding(null);
      refresh();
    },
  });

  const error = update.error ?? remove.error ?? add.error;
  const links = representatives.data?.results ?? [];

  return (
    <Stack spacing={1.5}>
      {onRegistry.map((row) => (
        <Section key={row.id} icon={<AssignmentIndOutlined />} title={t("card.onRegistry", { program: row.program.name })}>
          <Stack gap={0.25}>
            {row.expiresAt && (
              <Typography variant="body2">{t("card.until", { date: dayjs(row.expiresAt).subtract(1, "day").format("DD.MM.YYYY") })}</Typography>
            )}
            {row.responsibleEmployee && (
              <Typography variant="body2" color="text.secondary">
                {t("card.doctor", { name: row.responsibleEmployee.fullName })}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {t(`payment.${row.paymentState}`)}
              {row.currentTerm && Number(row.currentTerm.priceAmount) > Number(row.currentTerm.paidAmount)
                ? ` · ${t("payment.due", {
                    amount: formatMoney(Number(row.currentTerm.priceAmount) - Number(row.currentTerm.paidAmount)),
                  })}`
                : ""}
            </Typography>
            <Link component={RouterLink} to="/registry" variant="body2">
              {t("card.openRegistry")}
            </Link>
          </Stack>
        </Section>
      ))}

      {child && !onRegistry.length && onIntake && canManageEnrollments && enrollments.isSuccess && (
        <AppButton variant="outlined" startIcon={<AssignmentIndOutlined />} onClick={onIntake}>
          {t("card.intake")}
        </AppButton>
      )}

      {child ? (
        <Section
          icon={<FamilyRestroomOutlined />}
          title={t("card.representatives")}
          action={
            canEditPatients ? (
              <Tooltip title={t("card.addRepresentative")}>
                <IconButton
                  size="small"
                  aria-label={t("card.addRepresentative")}
                  onClick={() => setAdding(newRepresentative({ isPrimaryContact: links.length === 0 }))}
                >
                  <AddOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : undefined
          }
        >
          {links.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("card.emptyRepresentatives")}
            </Typography>
          ) : (
            <Stack gap={0.75}>
              {links.map((link) => (
                <Stack key={link.id} direction="row" alignItems="center" gap={0.5}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {t(`relations.${link.relation}`)} · {link.representative.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatPhoneDisplay(link.representative.phone)}
                      {link.isLegalRepresentative ? ` · ${t("card.legal")}` : ""}
                    </Typography>
                  </Box>
                  <Tooltip title={link.isPrimaryContact ? t("card.primary") : t("card.makePrimary")}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canEditPatients || link.isPrimaryContact || update.isPending}
                        onClick={() => update.mutate({ link, patch: { isPrimaryContact: true } })}
                      >
                        {link.isPrimaryContact ? (
                          <StarOutlined fontSize="small" color="warning" />
                        ) : (
                          <StarOutlineOutlined fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={link.receivesNotifications ? t("card.notifyOn") : t("card.notifyOff")}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canEditPatients || update.isPending}
                        onClick={() =>
                          update.mutate({ link, patch: { receivesNotifications: !link.receivesNotifications } })
                        }
                      >
                        {link.receivesNotifications ? (
                          <NotificationsActiveOutlined fontSize="small" />
                        ) : (
                          <NotificationsOffOutlined fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                  {canEditPatients && (
                    <Tooltip title={t("card.remove")}>
                      <IconButton size="small" onClick={() => setRemoving(link)}>
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </Section>
      ) : (
        (represented.data?.results.length ?? 0) > 0 && (
          <Section icon={<FamilyRestroomOutlined />} title={t("card.children")}>
            <Stack gap={0.5}>
              {represented.data!.results.map((link) => (
                <Link
                  key={link.id}
                  component={RouterLink}
                  to={`/patients?patient=${link.patient.id}`}
                  variant="body2"
                >
                  {link.patient.fullName} · {t(`relations.${link.relation}`)}
                </Link>
              ))}
            </Stack>
          </Section>
        )
      )}

      {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}

      <Dialog open={adding != null} onClose={add.isPending ? undefined : () => setAdding(null)} fullWidth maxWidth="sm">
        <DialogTitle>{t("wizard.representatives.add")}</DialogTitle>
        <DialogContent>
          {adding && (
            <Box sx={{ mt: 0.5 }}>
              <RepresentativeCard
                scope={scope}
                value={adding}
                canRemove={false}
                excludeIds={[patient.id, ...links.map((link) => link.representative.id)]}
                onChange={setAdding}
                onMakePrimary={() => setAdding({ ...adding, isPrimaryContact: !adding.isPrimaryContact })}
                onRemove={() => setAdding(null)}
              />
            </Box>
          )}
          {add.error && <Alert severity="error" sx={{ mt: 1.5 }}>{getErrorMessage(add.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <AppButton variant="text" onClick={() => setAdding(null)} disabled={add.isPending}>
            {t("wizard.close")}
          </AppButton>
          <AppButton
            variant="contained"
            disabled={
              add.isPending
              || !adding
              || (adding.mode === "existing" ? !adding.existing : !adding.fullName.trim() || !adding.phone.trim())
              || (adding.mode === "new" && !canCreatePatients)
            }
            onClick={() => adding && add.mutate(adding)}
          >
            {t("card.addRepresentative")}
          </AppButton>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={removing != null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        title={t("card.remove")}
        message={removing ? t("card.removeConfirm", { name: removing.representative.fullName }) : ""}
        loading={remove.isPending}
        variant="warning"
      />
    </Stack>
  );
};
