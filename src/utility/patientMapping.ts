// Общие helper-функции для нормализации данных пациентов из "грязных" таблиц/представлений.
// Используются на странице приёмов и в поиске пациентов, чтобы не дублировать логику.

export function normalizePatientId(row: Record<string, unknown>): string {
  const id =
    String(
      row["ID"] ??
        row["Пациент ID"] ??
        row["patient_id"] ??
        row["patientId"] ??
        row["id"] ??
        "",
    ) || "";
  return id;
}

export function normalizeFio(row: Record<string, unknown>): string {
  const fio =
    (row["ФИО"] as string) ??
    (row["Пациент ФИО"] as string) ??
    (row["Пациент"] as string) ??
    (row["ФИО пациента"] as string) ??
    (row["full_name"] as string) ??
    (row["Full Name"] as string) ??
    (row["name"] as string) ??
    [
      (row["Фамилия"] as string) ??
        (row["Пациент Фамилия"] as string) ??
        (row["last_name"] as string) ??
        (row["surname"] as string),
      (row["Имя"] as string) ??
        (row["Пациент Имя"] as string) ??
        (row["first_name"] as string) ??
        (row["given_name"] as string),
      (row["Отчество"] as string) ??
        (row["Пациент Отчество"] as string) ??
        (row["middle_name"] as string),
    ]
      .filter(Boolean)
      .join(" ");
  return fio || "";
}

export function normalizePhone(row: Record<string, unknown>): string | undefined {
  const p =
    (row["Телефон"] as string) ??
    (row["phone"] as string) ??
    (row["Номер телефона"] as string) ??
    (row["mobile"] as string) ??
    (row["phone_number"] as string) ??
    (row["mobile_phone"] as string) ??
    (row["tel"] as string) ??
    (row["Телефон 1"] as string) ??
    (row["Телефон пациента"] as string);
  return p || undefined;
}
