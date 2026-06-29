import React from "react";
import {
    Box,
    Card,
    CardContent,
    CardHeader,
    Chip,
    Divider,
    IconButton,
    Stack,
    Typography,
    Paper,
    InputBase,
    Tooltip
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import FilterListOutlined from "@mui/icons-material/FilterListOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";

import { getStatusConfig, getStatusChipSx, APPOINTMENT_STATUSES } from "../../../config/appointmentStatuses";
import { formatKGS } from "../../../utility/format";
import { Appointment } from "../../home/types";

type DoctorAppointmentListProps = {
    loading: boolean;
    items: Appointment[];
    selectedId: string | null;
    onItemClick: (id: string) => void;
    titleDate: string;
    onOpenFilters?: () => void;
};

export const DoctorAppointmentList: React.FC<DoctorAppointmentListProps> = ({
    loading,
    items,
    selectedId,
    onItemClick,
    titleDate,
    onOpenFilters
}) => {
    const [search, setSearch] = React.useState("");

    const filteredItems = React.useMemo(() => {
        if (!search) return items;
        const low = search.toLowerCase();
        return items.filter(i =>
            (i.patient_name || "").toLowerCase().includes(low)
        );
    }, [items, search]);

    return (
        <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <CardHeader
                title={
                    <Stack direction="row" alignItems="center" gap={1}>
                        <Typography variant="subtitle1">Приемы ({titleDate})</Typography>
                        <Chip size="small" label={filteredItems.length} />
                    </Stack>
                }
                action={
                    <Stack direction="row">
                        <IconButton onClick={onOpenFilters} aria-label="Фильтры">
                            <FilterListOutlined />
                        </IconButton>
                    </Stack>
                }
            />
            <Box px={2} pb={2}>
                <Paper
                    component="form"
                    elevation={0}
                    variant="outlined"
                    sx={{
                        p: "2px 4px",
                        display: "flex",
                        alignItems: "center",
                        bgcolor: "action.hover"
                    }}
                >
                    <IconButton sx={{ p: "10px" }} aria-label="search" size="small" disabled>
                        <SearchOutlined fontSize="small" />
                    </IconButton>
                    <InputBase
                        sx={{ ml: 1, flex: 1, fontSize: "0.875rem" }}
                        placeholder="Поиск пациента..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </Paper>
            </Box>
            <Divider />

            <CardContent
                sx={{
                    p: 0,
                    flex: 1,
                    overflowY: "auto",
                    msOverflowStyle: "none",
                    scrollbarWidth: "none",
                    "&::-webkit-scrollbar": {
                        display: "none",
                    },
                }}
            >
                {loading ? (
                    <Typography sx={{ p: 2 }} variant="body2">
                        Загрузка…
                    </Typography>
                ) : filteredItems.length === 0 ? (
                    <Typography sx={{ p: 2 }} variant="body2">
                        Нет записей
                    </Typography>
                ) : (
                    <Stack divider={<Divider flexItem />}>
                        {filteredItems.map((item) => {
                            const isSelected = item.id === selectedId;

                            return (
                                <Box
                                    key={item.id}
                                    onClick={() => onItemClick(item.id)}
                                    sx={{
                                        px: 2,
                                        py: 1.25,
                                        cursor: "pointer",
                                        color: "inherit",
                                        bgcolor: (theme) => isSelected ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.08) : 'transparent',
                                        borderLeft: isSelected ? "4px solid" : "4px solid transparent",
                                        borderLeftColor: isSelected ? "primary.main" : "transparent",
                                        "&:hover": {
                                            bgcolor: (theme) => isSelected ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.24 : 0.12) : theme.palette.action.hover
                                        },
                                    }}
                                >
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                                        <Stack>
                                            <Stack direction="row" alignItems="center" gap={0.5}>
                                                {item.is_night && (
                                                    <Tooltip title="Ночной">
                                                        <NightlightOutlined color="action" fontSize="small" />
                                                    </Tooltip>
                                                )}
                                                <Typography variant="subtitle2">
                                                    {item.formatted_date?.split(" ")[0]}
                                                </Typography>
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary">
                                                Пациент: {item.patient_name || "Без имени"}
                                            </Typography>
                                            {item.service_names && (
                                                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                                    {item.service_names}
                                                </Typography>
                                            )}
                                        </Stack>

                                        <Stack alignItems="flex-end">
                                            <Chip
                                                label={getStatusConfig(item.status).label}
                                                icon={getStatusConfig(item.status).icon}
                                                size="small"
                                                sx={getStatusChipSx(item.status)}
                                            />

                                            {/* Payment Status Logic from AppointmentsList */}
                                            {(() => {
                                                if (item.status === APPOINTMENT_STATUSES.PAID) return null;
                                                const total = Number(item.total_amount || item.total_cost || item.estimated_total || 0);
                                                if (total > 0) {
                                                    const paid = Number(item.paid_cash || 0) + Number(item.paid_card || 0);
                                                    const isPaid = paid >= total;
                                                    if (!isPaid) return null;
                                                    return (
                                                        <Chip
                                                            label={APPOINTMENT_STATUSES.PAID}
                                                            size="small"
                                                            sx={(theme) => ({
                                                                fontWeight: 500,
                                                                bgcolor: alpha(theme.palette.success.main, 0.08),
                                                                color: 'success.main',
                                                                borderColor: 'success.main',
                                                                border: '1px solid',
                                                            })}
                                                        />
                                                    );
                                                }
                                                return null;
                                            })()
                                            }

                                            {
                                                (item.total_amount != null || item.total_cost != null || item.estimated_total != null) && (
                                                    <Typography variant="body2" color="text.secondary" mt={0.5}>
                                                        {formatKGS(Number(item.total_amount || item.total_cost || item.estimated_total || 0))}
                                                    </Typography>
                                                )
                                            }
                                        </Stack >
                                    </Stack >
                                </Box >
                            );
                        })}
                    </Stack >
                )}
            </CardContent >
        </Card >
    );
};
