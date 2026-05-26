// Feature: Employees
// New simplified types for 'Employees' table

export type Employee = {
  id: string;
  full_name: string;
  phone?: string | null;
  role_id?: string | null;
  employee_type_id?: string | null;
  birth_date?: string | null;
  photo_url?: string | null;
  telegram_id?: string | null;
  bank_account_number?: string | null;
  inn?: string | null;
  email?: string | null;
  status?: string | null;
  auth_user_id?: string | null;
  specialization_id?: string | null;
  nickname?: string | null;
  salary_rules?: any | null;
  passport_photos?: string[] | null;

  created_at?: string;

  updated_at?: string;
};

export type Specialization = {
  id: string;
  name: string;
};

// Re-export old name for compatibility during refactor, but mark deprecated
export type EmployesRow = Employee; 

export type ServiceRow = {
  id: string;
  name?: string;
  price?: number;
  [key: string]: unknown;
};

export type EmployeeServiceLink = {
  employee_id: string;
  service_id: string;
};

export type LoadMoreFn = () => Promise<void> | void;
