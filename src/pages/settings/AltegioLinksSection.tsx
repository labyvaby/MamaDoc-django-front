import React from "react";
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAltegioLocations, linkAltegioLocation, type AltegioLocation } from "../../api/altegio";
import type { Service } from "../../api/catalog";
import { getBranches } from "../../api/organization";
import { parseBackendError } from "../../api/appointments";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useT } from "../../i18n/VerticalProvider";
import { AltegioServiceLinks } from "./AltegioServiceLinks";
import { AltegioStaffLinks } from "./AltegioStaffLinks";

type Props = {
  organizationId: number | undefined;
  services: readonly Service[];
};

export const AltegioLinksSection: React.FC<Props> = ({ organizationId, services }) => {
  const { t } = useT("settings");
  const queryClient = useQueryClient();
  const locationsKey = djangoQueryKeys.altegio.locations(organizationId);
  const locationsQuery = useQuery({
    queryKey: locationsKey,
    queryFn: ({ signal }) => getAltegioLocations(signal, { organizationId }),
    staleTime: 0,
    gcTime: 0,
  });
  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, organizationId ?? null],
    queryFn: () => getBranches(organizationId),
  });
  const link = useMutation({
    mutationFn: (location: AltegioLocation) => linkAltegioLocation({ ...location, organizationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationsKey });
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.altegio.settings(organizationId) });
    },
  });
  const [picked, setPicked] = React.useState<number | "">("");

  const locations = locationsQuery.data?.items ?? [];
  const branches = branchesQuery.data ?? [];
  const linked = locations.filter((location) => location.branchId != null);
  // Выбранный филиал могли отвязать — тогда берём первый связанный.
  const pickedIsLinked =
    picked !== "" && linked.some((location) => location.altegioLocationId === picked);
  const current: number | "" = pickedIsLinked
    ? picked
    : linked.length > 0
      ? linked[0].altegioLocationId
      : "";

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle1" fontWeight={600}>
          {t("altegio.linksTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("altegio.linksDescription")}
        </Typography>
      </Box>
      {locationsQuery.isLoading && <CircularProgress size={20} />}
      {locationsQuery.isError && (
        <Alert severity="error">
          {t("altegio.loadError", { error: parseBackendError(locationsQuery.error) })}
        </Alert>
      )}
      {link.isError && <Alert severity="error">{parseBackendError(link.error)}</Alert>}
      <Typography variant="subtitle2">{t("altegio.locationsTitle")}</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("altegio.locationColumn")}</TableCell>
            <TableCell>{t("altegio.branchColumn")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {locations.map((location) => (
            <TableRow key={location.altegioLocationId}>
              <TableCell>{location.title || location.altegioLocationId}</TableCell>
              <TableCell>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={location.branchId ?? ""}
                  disabled={link.isPending}
                  onChange={(e) =>
                    link.mutate({
                      ...location,
                      branchId: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <MenuItem value="">{t("altegio.notLinked")}</MenuItem>
                  {branches.map((branch) => (
                    <MenuItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </MenuItem>
                  ))}
                </TextField>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {current !== "" && (
        <>
          <TextField
            select
            size="small"
            label={t("altegio.locationPicker")}
            value={current}
            sx={{ maxWidth: 360 }}
            onChange={(e) => setPicked(Number(e.target.value))}
          >
            {linked.map((location) => (
              <MenuItem key={location.altegioLocationId} value={location.altegioLocationId}>
                {location.title || location.altegioLocationId}
              </MenuItem>
            ))}
          </TextField>
          <AltegioStaffLinks organizationId={organizationId} altegioLocationId={current} services={services} />
          <AltegioServiceLinks organizationId={organizationId} altegioLocationId={current} services={services} />
        </>
      )}
    </Stack>
  );
};
