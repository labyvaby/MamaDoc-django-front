/**
 * Сборка запросов приёма анализов из состояния дровера (`LabIntakeDrawer`).
 *
 * Приём — два отдельных вызова (design: «Дозаполнение карты — отдельным
 * вызовом до приёма»): сперва необязательный `PATCH /api/patients/<id>/` с
 * дозаполненными полями, потом `POST /api/lab/orders/`. Сборка тела каждого
 * вызова вынесена сюда, а не оставлена в компоненте, — это ровно та логика,
 * которую в проекте не рендер-тестируют, а проверяют отдельно (см.
 * `labTotals.ts`, `labIntakeGuards.ts`).
 */

import type { DjangoPatient, PatientGender } from "../api/patients";
import type { LabIntakeInput, LabOrderAnswerInput, LabOrderLineInput } from "../api/lab";

/** Локальные правки карты пациента прямо в дровере — до PATCH ничего не сохранено. */
export interface PatientEdits {
  inn: string;
  birthDate: string | null;
  /** Пока не выбран — пустая строка, не "unknown": UI различает «ещё не
   *  трогали» и «явно поставили unknown» (второго тут даже нет — только
   *  male/female доступны в ToggleButtonGroup у PatientSection). */
  gender: string;
}

export interface EffectivePatientInfo {
  inn: string;
  birthDate: string | null;
  gender: PatientGender;
}

/**
 * Данные пациента, какими их увидит приём: значение из карты, если оно там
 * есть, иначе — локальная правка. Карта побеждает всегда, даже если правка
 * содержит другое значение, — `PatientSection` показывает поле правки только
 * когда в карте пусто (`needsInn`/`needsBirthDate`/`needsGender`), так что
 * реальный конфликт не должен возникать, но при пустом пациенте (ещё не
 * выбран) собственного источника истины нет вовсе, и пол в этом случае —
 * `"unknown"`, а не то, что успели ввести до выбора пациента.
 */
export function effectivePatientInfo(
  patient: DjangoPatient | null,
  edits: PatientEdits,
): EffectivePatientInfo {
  const gender: PatientGender =
    patient && patient.gender !== "unknown"
      ? patient.gender
      : edits.gender === "male" || edits.gender === "female"
      ? edits.gender
      : "unknown";
  return {
    inn: patient?.inn || edits.inn.trim(),
    birthDate: patient?.birthDate || edits.birthDate,
    gender,
  };
}

export interface PatientPatch {
  inn?: string;
  birthDate?: string;
  gender?: "male" | "female";
}

/**
 * Что дозаполнить в карте пациента перед приёмом.
 *
 * `null`, если патчить нечего, — тогда `LabIntakeDrawer` пропускает вызов
 * `PATCH` целиком (Task 10: «Одним вызовом нельзя … Если что-то менялось»).
 * В патч попадают только реально недостающие в карте поля, и только если их
 * успели заполнить: пустая правка недостающего поля не должна отправляться
 * как есть — сервер сам скажет об этом через `intakeBlockReason` на кнопке.
 */
export function buildPatientPatch(patient: DjangoPatient, edits: PatientEdits): PatientPatch | null {
  const patch: PatientPatch = {};
  const inn = edits.inn.trim();
  if (!patient.inn && inn) patch.inn = inn;
  if (!patient.birthDate && edits.birthDate) patch.birthDate = edits.birthDate;
  if (patient.gender === "unknown" && (edits.gender === "male" || edits.gender === "female")) {
    patch.gender = edits.gender;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export interface LabIntakeFormValues {
  patientId: number;
  branchId: number;
  lines: LabOrderLineInput[];
  answers: LabOrderAnswerInput[];
  /** Сырой ввод из PaymentSection — строка, возможно с запятой вместо точки. */
  paidCash: string;
  paidCard: string;
  cashlessMethodId: number | null;
  discountPercent: number;
}

/**
 * Строка ввода → десятичная строка для бэкенда.
 *
 * Терпима к запятой (как во всех денежных формах проекта — см.
 * `DjangoAddExpenseDrawer`) и к мусору: и то, и другое даёт `0.00`, а не
 * `NaN`, который `JSON.stringify` превратил бы в `null` и получил бы 422 на
 * ровном месте. Отрицательное значение обрезается до нуля — ввести его через
 * `PaymentSection` нельзя (`inputProps.min = 0`), но функция не должна
 * доверять этому предположению.
 */
function toMoneyString(raw: string): string {
  const parsed = Number.parseFloat(raw.replace(",", "."));
  const safe = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
  return safe.toFixed(2);
}

/**
 * Тело `POST /api/lab/orders/` из состояния формы.
 *
 * `cashlessMethodId` и `discountPercent` — не просто `undefined`, а
 * действительно отсутствуют в результирующем объекте при значении по
 * умолчанию: `LabIntakeInput` объявляет их опциональными (`?`), и
 * `JSON.stringify` уже сам отбросил бы `undefined`, но отправить явный
 * `null` вместо этого — реальный риск (см. историю отладки msgspec-схем в
 * этом проекте, `docs/backend-error-contract.md`), поэтому ключ не
 * добавляется вовсе, а не выставляется в `null`/`undefined`.
 */
export function buildLabIntakeBody(values: LabIntakeFormValues): LabIntakeInput {
  const body: LabIntakeInput = {
    patientId: values.patientId,
    branchId: values.branchId,
    lines: values.lines,
    answers: values.answers,
    paidCash: toMoneyString(values.paidCash),
    paidCard: toMoneyString(values.paidCard),
  };
  if (values.cashlessMethodId != null) body.cashlessMethodId = values.cashlessMethodId;
  if (values.discountPercent > 0) body.discountPercent = values.discountPercent;
  return body;
}
