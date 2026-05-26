import React from "react";
import {
  // Box,
  Card,
  CardContent,
  CardHeader,
  // Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
// import { formatKGS } from "../../../utility/format";

type ServicesListProps = {
  loading: boolean;
  errorMsg: string | null;
  items: Array<Record<string, unknown>>;
};

export const ServicesList: React.FC<ServicesListProps> = ({
  loading,
  errorMsg,
  items,
}) => {
  return (
    <Card variant="outlined">
      <CardHeader
        title={
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="subtitle1">Процедуры</Typography>
            {/* счетчик количество процедур */}
            {/* <Chip size="small" label={items.length} /> */}
          </Stack>
        }
      />
      <Divider />
      <CardContent sx={{ p: 0, maxHeight: "53vh", overflowY: "auto" }}>
        {loading ? (
          <Typography sx={{ p: 2 }} variant="body2">
            Загрузка…
          </Typography>
        ) : errorMsg ? (
          <Typography sx={{ p: 2 }} variant="body2" color="error">
            Ошибка: {errorMsg}
          </Typography>
        ) : items.length === 0 ? (
          <Typography sx={{ p: 2 }} variant="body2">
            Скоро...
          </Typography>
        ) : (
          <Stack divider={<Divider flexItem />}>
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Скоро…
            </Typography>
            {/* {items.map((s, idx) => {
              const name = String(
                s["Название услуги"] ??
                  s["Название"] ??
                  s["Наименование"] ??
                  s["name"] ??
                  s["title"] ??
                  s["service_name"] ??
                  s["id"] ??
                  ""
              );
              const category = String(
                s["Категория"] ?? s["category"] ?? s["group"] ?? s["Сотрудник ID"] ?? ""
              );
              const price = Number(
                s["Стоимость, сом"] ??
                  s["Стоимость"] ??
                  s["price"] ??
                  s["amount"] ??
                  s["cost"] ??
                  0
              );
              const key = String(s["ID"] ?? s["id"] ?? idx);
              const photoUrl = String(s["photo_url"] ?? s["Картинка"] ?? "");

              return (
                <Box
                  key={key}
                  sx={{
                    px: 2,
                    py: 2,
                    "&:hover": { bgcolor: (theme) => theme.palette.action.hover },
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.5}>
                    <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 100,
                          height: 100,
                          overflow: "hidden",
                          borderRadius: 1,
                          flexShrink: 0,
                          bgcolor: photoUrl ? "transparent" : "action.hover",
                        }}
                      >
                        {photoUrl ? (
                          <Box
                            component="img"
                            src={photoUrl}
                            alt=""
                            sx={{ width: 1, height: 1, objectFit: "cover", display: "block" }}
                          />
                        ) : null}
                      </Box>
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>
                          {name || "Без названия"}
                        </Typography>
                        <Stack direction="row" alignItems="center" gap={0.75}>
                          {category ? <Chip size="small" variant="outlined" label={category} /> : null}
                        </Stack>
                      </Stack>
                    </Stack>

                    <Typography variant="subtitle2" color="text.primary" sx={{ whiteSpace: "nowrap" }}>
                      {formatKGS(price)}
                    </Typography>
                  </Stack>
                </Box>
              );
            })} */}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export default ServicesList;
