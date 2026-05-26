/**
 * OldConclusionDetailsCard.tsx
 * Компонент отображает подробную информацию о старом заключении.
 */
import React, { useState } from "react";
import {
    Box,
    Card,
    CardHeader,
    CardContent,
    IconButton,
    Typography,
    Stack,
    Divider,
    CircularProgress,
    Tooltip,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import type { OldConclusion } from "../useOldConclusions";
import { generateConclusionPDF } from "../../../utility/pdfGenerator";
import dayjs from "dayjs";

type Props = {
    item: OldConclusion | null;
    patientFio: string | null;
    patientDob: string | null;
    onClose: () => void;
};

const OldConclusionDetailsCard: React.FC<Props> = ({ item, patientFio, patientDob, onClose }) => {
    const [isPrinting, setIsPrinting] = useState(false);

    if (!item) return null;

    const dateStr = item.changed_at
        ? new Date(item.changed_at).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
        : "Дата неизвестна";

    const handlePrint = async () => {
        setIsPrinting(true);
        try {
            const printData = {
                patientFio: patientFio || "Неизвестно",
                patientDob: patientDob ? dayjs(patientDob).format("DD.MM.YYYY") : "—",
                appointmentDate: item.changed_at ? dayjs(item.changed_at).format("DD.MM.YYYY HH:mm") : "—",
                weight: item.weight_kg ? String(item.weight_kg) : "—",
                height: item.height_cm ? String(item.height_cm) : "—",
                temperature: item.temperature ? String(item.temperature) : "—",
                complaints: item.complaints || "—",
                diagnosis: item.diagnosis || "—",
                anamnesis: item.anamnesis || "",
                objective: item.objective || "",
                recommendations: item.recommendations || "—",
                doctorFio: item.changed_by || "Врач клиники",
            };

            const pdfBlob = await generateConclusionPDF(printData);
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, "_blank");
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            alert("Ошибка при печати заключения");
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <Card
            variant="outlined"
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                bgcolor: "background.paper",
            }}
        >
            <CardHeader
                title={
                    <Typography variant="h6">
                        Старое заключение от {dateStr}
                    </Typography>
                }
                action={
                    <Stack direction="row" spacing={1}>
                        <Tooltip title="Печать">
                            <span>
                                <IconButton onClick={handlePrint} disabled={isPrinting}>
                                    {isPrinting ? <CircularProgress size={24} /> : <PrintOutlined />}
                                </IconButton>
                            </span>
                        </Tooltip>
                        <IconButton onClick={onClose}>
                            <CloseOutlined />
                        </IconButton>
                    </Stack>
                }
            />
            <Divider />
            <CardContent sx={{ flex: 1, overflowY: "auto", p: 3 }}>
                <Stack spacing={3}>
                    {/* Жизненные показатели */}
                    {(!!item.weight_kg || !!item.height_cm || !!item.temperature) && (
                        <Box>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                                Жизненные показатели
                            </Typography>
                            <Stack direction="row" spacing={3}>
                                {!!item.weight_kg && (
                                    <Typography variant="body2">
                                        <strong>Вес:</strong> {item.weight_kg} кг
                                    </Typography>
                                )}
                                {!!item.height_cm && (
                                    <Typography variant="body2">
                                        <strong>Рост:</strong> {item.height_cm} см
                                    </Typography>
                                )}
                                {!!item.temperature && (
                                    <Typography variant="body2">
                                        <strong>Температура:</strong> {item.temperature} °C
                                    </Typography>
                                )}
                            </Stack>
                        </Box>
                    )}

                    {/* Жалобы */}
                    {item.complaints && (
                        <Box>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                                Жалобы
                            </Typography>
                            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                                {item.complaints}
                            </Typography>
                        </Box>
                    )}

                    {/* Анамнез */}
                    {item.anamnesis && (
                        <Box>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                                Анамнез
                            </Typography>
                            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                                {item.anamnesis}
                            </Typography>
                        </Box>
                    )}

                    {/* Объективные данные */}
                    {item.objective && (
                        <Box>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                                Объективные данные
                            </Typography>
                            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                                {item.objective}
                            </Typography>
                        </Box>
                    )}

                    {/* Диагноз */}
                    {item.diagnosis && (
                        <Box>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                                Диагноз
                            </Typography>
                            <Typography variant="body1" fontWeight="medium" sx={{ whiteSpace: "pre-wrap" }}>
                                {item.diagnosis}
                            </Typography>
                        </Box>
                    )}

                    {/* Рекомендации */}
                    {item.recommendations && (
                        <Box>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                                Рекомендации
                            </Typography>
                            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                                {item.recommendations}
                            </Typography>
                        </Box>
                    )}

                    {/* Комментарий врача */}
                    {item.doctor_comment && (
                        <Box>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                                Комментарий врача
                            </Typography>
                            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                                {item.doctor_comment}
                            </Typography>
                        </Box>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

export default OldConclusionDetailsCard;
