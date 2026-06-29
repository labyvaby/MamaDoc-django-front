// Feature: Employees
// New simplified types for 'Employees' table

/** Minimal role shape stored on EmployesRow in Django mode */
export type DjangoRoleShortLocal = {
  id: number;
  name: string;
  code: string;
};

/** Minimal specialization shape stored on EmployesRow in Django mode */
export type DjangoSpecializationShortLocal = {
  id: number;
  name: string;
};

/** Minimal branch shape stored on EmployesRow in Django mode */
export type DjangoBranchShortLocal = {
  id: number;
  name: string;
};

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
  notes?: string | null;
  salary_rules?: any | null;
  passport_photos?: string[] | null;
  /** Professional type — NOT RBAC role */
  clinicalRole?: "doctor" | "nurse" | "other" | null;

  created_at?: string;
  updated_at?: string;

  /** Django-mode only: full role object from RBAC API */
  _djangoRole?: DjangoRoleShortLocal | null;
  /** Django-mode only: list of specializations */
  _djangoSpecializations?: DjangoSpecializationShortLocal[];
  /** Django-mode only: operational branches */
  _djangoOperationalBranches?: DjangoBranchShortLocal[];
  /** Django-mode only: признак, что подгружены полные детали сотрудника */
  _fullDetailsLoaded?: boolean;
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
