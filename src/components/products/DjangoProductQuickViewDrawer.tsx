import React from "react";
import {
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import { useQuery } from "@tanstack/react-query";

import { getProducts } from "../../api/warehouse";
import { DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useCan } from "../../hooks/useCan";
import { formatKGS } from "../../utility/format";
import { useT } from "../../i18n/VerticalProvider";

interface Props {
  open: boolean;
  onClose: () => void;
  productId: number | null;
  /** Название из строки приёма — показываем, пока грузится справочник. */
  fallbackName?: string | null;
}

/**
 * Краткая карточка товара по клику из приёма — как у услуги и специалиста.
 *
 * Данные берём из общего списка `/warehouse/products/` (он кэшируется на всю
 * сессию): отдельного эндпоинта карточки товара бэк не подтверждал, а гадать
 * по REST-конвенции нельзя. Гейт по праву — без warehouse.view список не
 * отдадут, поэтому вызывающий не должен делать строку кликабельной.
 */
const DjangoProductQuickViewDrawer: React.FC<Props> = ({
  open,
  onClose,
  productId,
  fallbackName,
}) => {
  const { t } = useT("appointments");
  const orgId = useApiOrgId();
  const canViewWarehouse = useCan("warehouse.view");
  const canViewSales = useCan("warehouse.sales.view");
  const enabled = open && productId != null && (canViewWarehouse || canViewSales);

  const query = useQuery({
    queryKey: ["django", "warehouse", "products", "quick-view", orgId],
    queryFn: ({ signal }) => getProducts(signal, { organizationId: orgId ?? undefined }),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const product = query.data?.find((p) => p.id === productId) ?? null;

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 320, sm: 380 }, p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" fontWeight={700}>
            {t("productQuickView.title")}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          <Avatar
            variant="rounded"
            src={product?.imageUrl ?? undefined}
            sx={{ width: 56, height: 56, bgcolor: "action.selected", color: "text.secondary" }}
          >
            <Inventory2Outlined />
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {product?.name ?? fallbackName ?? "—"}
            </Typography>
            {product?.category && (
              <Typography variant="caption" color="text.secondary">
                {product.category}
              </Typography>
            )}
          </Box>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {query.isLoading ? (
          <Stack spacing={1}>
            <Skeleton height={28} />
            <Skeleton height={28} />
            <Skeleton height={28} />
          </Stack>
        ) : !enabled ? (
          <Typography variant="body2" color="text.secondary">
            {t("productQuickView.noAccess")}
          </Typography>
        ) : !product ? (
          <Typography variant="body2" color="text.secondary">
            {t("productQuickView.notFound")}
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            <Row label={t("productQuickView.price")} value={formatKGS(product.price)} />
            <Row
              label={t("productQuickView.stock")}
              value={
                <Chip
                  size="small"
                  label={`${product.stock} ${product.unit}`}
                  color={product.stock > 0 ? "success" : "default"}
                  sx={{ fontWeight: 700, borderRadius: "7px" }}
                />
              }
            />
            {product.barcode && (
              <Row label={t("productQuickView.barcode")} value={product.barcode} />
            )}
            {product.description && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  {t("productQuickView.description")}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {product.description}
                </Typography>
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    {typeof value === "string" ? (
      <Typography variant="body2" fontWeight={700}>
        {value}
      </Typography>
    ) : (
      value
    )}
  </Stack>
);

export default DjangoProductQuickViewDrawer;
