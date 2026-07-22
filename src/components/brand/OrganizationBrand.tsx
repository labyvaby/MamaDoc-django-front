import React, { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";

import mamaDoctorLogo from "../../assets/img/logo.png";
import mamaDoctorMark from "../../assets/img/icon_2.png";
import { usePermissions } from "../../hooks/usePermissions";
import AximoLogo from "../auth/AximoLogo";

type Props = {
  height: number;
  compact?: boolean;
};

const isMamaDoctor = (name?: string | null) =>
  /мама\s*доктор|mama\s*doctor/i.test(name ?? "");

/**
 * Бренд активного контекста: сначала логотип филиала/организации, затем
 * встроенный знак Mama Doctor, а для новой организации — её монограмма.
 */
const OrganizationBrand: React.FC<Props> = ({ height, compact = false }) => {
  const { activeOrganization, activeBranch } = usePermissions();
  const logoUrl = activeBranch?.logoUrl ?? activeOrganization?.logoUrl ?? null;
  const displayName = activeBranch?.name ?? activeOrganization?.name ?? "Aximo CRM";
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [logoUrl]);

  if (logoUrl && !broken) {
    return (
      <Box
        component="img"
        src={logoUrl}
        alt={displayName}
        onError={() => setBroken(true)}
        sx={{
          height,
          width: compact ? height : "auto",
          maxWidth: compact ? height : height * 6,
          objectFit: "contain",
          borderRadius: 1,
        }}
      />
    );
  }

  if (activeOrganization && isMamaDoctor(activeOrganization.name)) {
    return (
      <Box
        component="img"
        src={compact ? mamaDoctorMark : mamaDoctorLogo}
        alt="Мама Доктор"
        sx={{
          height,
          width: compact ? height : "auto",
          maxWidth: compact ? height : height * 6,
          objectFit: "contain",
        }}
      />
    );
  }

  if (activeOrganization) {
    const initial = Array.from(displayName.trim())[0]?.toUpperCase() ?? "О";

    return (
      <Box
        aria-label={displayName}
        sx={{
          width: height,
          height,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          borderRadius: Math.max(1, height / 4),
          bgcolor: "primary.main",
          color: "primary.contrastText",
        }}
      >
        <Typography component="span" sx={{ fontSize: height * 0.52, fontWeight: 800, lineHeight: 1 }}>
          {initial}
        </Typography>
      </Box>
    );
  }

  return <AximoLogo iconOnly size={height} />;
};

export default OrganizationBrand;
