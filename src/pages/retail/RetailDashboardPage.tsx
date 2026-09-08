import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { getPnlReport, getRetailReceipts, type PnlReport, type RetailReceipt } from "../../api/retail";

export default function RetailDashboardPage() {
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [receipts, setReceipts] = useState<RetailReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getPnlReport(), getRetailReceipts({ limit: 20 })])
      .then(([nextPnl, nextReceipts]) => {
        if (!active) return;
        setPnl(nextPnl);
        setReceipts(nextReceipts);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить retail-данные.");
      });
    return () => { active = false; };
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!pnl) return <CircularProgress />;

  const cards = [
    ["Выручка", pnl.revenue],
    ["Себестоимость", pnl.cost],
    ["Валовая маржа", pnl.grossMargin],
    ["Итог", pnl.netResult],
  ];
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Retail / операционный обзор</Typography>
        <Typography color="text.secondary">{pnl.dateFrom} — {pnl.dateTo}</Typography>
      </Box>
      <Grid container spacing={2}>
        {cards.map(([label, value]) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h5">{value} сом</Typography></CardContent></Card>
          </Grid>
        ))}
      </Grid>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Последние чеки</Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>№</TableCell><TableCell>Статус</TableCell><TableCell>Сумма</TableCell><TableCell>Дата</TableCell></TableRow></TableHead>
            <TableBody>{receipts.map((receipt) => <TableRow key={receipt.id}><TableCell>{receipt.number}</TableCell><TableCell>{receipt.status}</TableCell><TableCell>{receipt.totalAmount} сом</TableCell><TableCell>{new Date(receipt.createdAt).toLocaleString("ru-RU")}</TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
