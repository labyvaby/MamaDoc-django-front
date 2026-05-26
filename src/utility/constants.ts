export const DB_TABLES = {
  EMPLOYEES: "Employees",
  SERVICES: "Services",
  SPECIALIZATIONS: "Specializations",
  EMPLOYEE_SERVICES: "EmployeeServices", // Corrected from "Specializations_Employees" based on DB schema
  EMPLOYEE_SPECIALIZATIONS: "EmployeeSpecializations",
  // Actually, checking AddEmployeeDrawer, it handles linking manually...
  // Wait, the previous task mentioned "Employees", "Services", "Specializations".
  // The user prompt specifically mentioned "Patients" -> "Patients".
  PATIENTS: "Patients",
  APPOINTMENTS: "Appointments",
  PRICES: "Prices",
  ROLES: "roles", // Lowercase based on previous sql execution success "SELECT * FROM roles"
  MEDICAL_CONCLUSIONS: "MedicalConclusions",
  DIAGNOSES: "Diagnoses",
  MEDICAL_CONCLUSION_REVISIONS: "MedicalConclusionRevisions",
  APPOINTMENTS_AGGREGATED: "AppointmentsAggregated",
  APPOINTMENT_SERVICES: "AppointmentServices",
  PATIENT_BALANCES: "PatientBalances",
  PATIENT_BALANCE_TRANSACTIONS: "PatientBalanceTransactions",
};
