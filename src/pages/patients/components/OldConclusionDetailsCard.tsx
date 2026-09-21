/**
 * OldConclusionDetailsCard.tsx
 * Компонент отображает подробную информацию о старом заключении.
 */
import React, { useEffect, useState } from "react";
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
import { useNotification } from "@refinedev/core";
import type { OldConclusion } from "../useOldConclusions";
import { generateConclusionPDF } from "../../../utility/pdfGenerator";
import dayjs from "dayjs";
import { getMedicalConclusion } from "../../../api/medical";
import { parseConclusionFormData } from "../../../api/conclusionFormData";
import {
    buildConclusionPrintParts,
    formatDiagnoses,
    type ConclusionPrintParts,
} from "../../../utility/conclusionPrintParts";
import { formatQuantity } from "../../../utility/format";
import type { ConclusionFormTemplate } from "../../../api/conclusionForms";
import { ConclusionFormReadView } from "../../../components/conclusion-forms/ConclusionFormReadView";

/**
 * Живое заключение по бланку: сам бланк и его разложение, как на печати.
 *
 * Список `patient-conclusions` отдаёт только колонки, без `formData`, и весь
 * протокол (карта гинеколога) показывался под заголовком «Анамнез» — туда
 * бланк собирает текст. Поэтому открытое заключение догружаем целиком и,
 * если оно заполнено по бланку, показываем строки бланка (21.09.2026).
 */
type FormView = { template: ConclusionFormTemplate; parts: ConclusionPrintParts };

async function loadFormView(id: number): Promise<FormView | null> {
    const c = await getMedicalConclusion(id);
    const parsed = parseConclusionFormData(c.formData);
    if (!parsed?.snapshot) return null;
    const quantity = (value: string | null | undefined) =>
        value == null || value === "" ? "" : formatQuantity(value);
    return {
        template: parsed.snapshot,
        parts: buildConclusionPrintParts({
            template: parsed.snapshot,
            formValues: parsed.values,
            manual: parsed.manual,
            columns: {
                heightCm: quantity(c.heightCm),
                weightKg: quantity(c.weightKg),
                temperature: quantity(c.temperature),
                complaints: c.complaints ?? "",
                diagnosis: formatDiagnoses(c.diagnosisData ?? []),
                anamnesis: c.anamnesis ?? "",
                objective: c.objective ?? "",
                conclusion: c.conclusion ?? "",
            },
        }),
    };
}

type Props = {
    item: OldConclusion | null;
    patientFio: string | null;
    patientDob: string | null;
    onClose: () => void;
};

const OldConclusionDetailsCard: React.FC<Props> = ({ item, patientFio, patientDob, onClose }) => {
    const [isPrinting, setIsPrinting] = useState(false);
    const { open: notify } = useNotification();
    const [formView, setFormView] = useState<FormView | null>(null);

    const liveId =
        item?.source === "current" ? Number(item.id.replace(/^live-/, "")) : null;

    useEffect(() => {
        setFormView(null);
        if (!liveId || !Number.isFinite(liveId)) return;
        let active = true;
        loadFormView(liveId)
            .then((view) => {
                if (active) setFormView(view);
            })
            .catch(() => {
                /* не догрузилось — остаётся обычный вид по колонкам */
            });
        return () => {
            active = false;
        };
    }, [liveId]);

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
        // Живое заключение печатается тем же документом, что из приёма: лист
        // бланка из сохранённых данных. Штатный шаблон ниже положил бы весь
        // протокол под «Анамнез».
        if (item.source === "current" && item.appointment_id && item.service_line_id) {
            window.open(
                `/print/conclusion/${item.appointment_id}?lineId=${item.service_line_id}`,
                "_blank",
                "noopener",
            );
            return;
        }
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
                // Заключение печатаем вместе с рекомендациями: у записей старого
                // MamaDoc основной текст лежит в conclusion, у до-Supabase базы
                // его нет вовсе, там есть только рекомендации.
                conclusion:
                    [item.conclusion, item.recommendations].filter(Boolean).join("\n\n") || "—",
                doctorFio: item.changed_by || "Врач клиники",
            };

            const pdfBlob = await generateConclusionPDF(printData);
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, "_blank");
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            // alert блокирует вкладку целиком — уведомление приложения вместо него.
            notify?.({ type: "error", message: "Ошибка при печати заключения" });
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
                    <Stack direction="column" gap={0.25}>
                        <Typography variant="h6">
                            {item.source === "current" ? "Заключение" : "Старое заключение"} от {dateStr}
                        </Typography>
                        {(item.changed_by || item.branch_name) && (
                            <Typography variant="caption" color="text.secondary">
                                {[
                                    item.changed_by ? `Врач: ${item.changed_by}` : null,
                                    item.branch_name,
                                ].filter(Boolean).join(" • ")}
                            </Typography>
                        )}
                    </Stack>
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
                    {formView ? (
                        <ConclusionFormReadView
                            template={formView.template}
                            values={formView.parts.sheetValues}
                            trailer={formView.parts.trailer}
                        />
                    ) : (
                    <>
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

                    {/* Заключение — есть только у записей старого MamaDoc */}
                    {item.conclusion && (
                        <Box>
                            <Typography variant="subtitle2" color="primary" gutterBottom>
                                Заключение
                            </Typography>
                            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                                {item.conclusion}
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
                    </>
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
