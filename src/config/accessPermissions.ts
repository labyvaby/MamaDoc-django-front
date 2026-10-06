/**
 * Canonical permission requirements for Django pages and navigation.
 *
 * Keep route guards and sidebar visibility on this shared registry.  A user
 * who receives a permission must see the matching entry and be able to open
 * the page regardless of the role code chosen by an organization.
 */
export const PAGE_PERMISSIONS = {
  appointments: "appointments.view",
  // Page-visibility права трёх рабочих пространств приёмов: гейтят только
  // пункт меню и роут. Доступ к данным по-прежнему требует appointments.view,
  // поэтому эти права имеют смысл только вместе с ним.
  appointmentsRegistry: "appointments.registry.view",
  doctorRoom: "appointments.doctor_room.view",
  nurseRoom: "appointments.nurse_room.view",
  // Исторические реестры «Все приёмы» / «Все процедуры» — такие же
  // page-visibility права. По умолчанию не выдаются ни одной роли (ни в
  // шаблонах, ни бэкфиллом): после деплоя разделы по-прежнему видит только
  // суперадминистратор, пока он сам не включит право нужной роли в редакторе.
  allAppointments: "appointments.all_appointments.view",
  allProcedures: "appointments.all_procedures.view",
  patients: "patients.view",
  employees: "staff.view",
  services: "catalog.view",
  expenses: ["finance.view", "finance.expense.view"],
  products: ["warehouse.view", "warehouse.sales.view"],
  warehouses: "warehouse.view",
  sales: ["warehouse.sales.view", "warehouse.view"],
  lab: "lab.view",
  schedule: "schedule.view",
  attendance: "attendance.view",
  attendanceSettings: "attendance.manage",
  cashbox: "finance.view",
  reports: "reports.view",
  // Отчёт раскрывает зарплаты всех врачей — своё право, не reports.view.
  doctorProfit: "reports.doctor_profit.view",
  pnl: "pnl.view",
  // «Нагрузка» — своё право, отдельно от финансовых отчётов. Ни в шаблонах,
  // ни бэкфиллом: после выкладки страницу видит только суперадминистратор,
  // пока право не отметят роли в редакторе.
  load: "reports.load.view",
  // «Сводка» — тоже своё право, никому не выданное: раньше раздел видел
  // только суперадминистратор, теперь его открывают ролям в редакторе.
  dashboard: "reports.dashboard.view",
  payroll: ["payroll.view", "payroll.view_own"],
  notifications: "notifications.page.view",
  reviews: ["reviews.view", "reviews.view_own", "reviews.handle", "reviews.manage"],
  bookings: ["bookings.view", "bookings.manage"],
  // Раздел «Чаты» — встроенный Chatwoot. Право выдаётся ролям в редакторе
  // ролей; сам аккаунт в Chatwoot заводит его администратор отдельно.
  chats: "chatwoot.view",
  tasks: "tasks.list",
  waitlist: ["waitlist.view", "waitlist.manage"],
  // Воронка продаж: смотреть доску даёт deals.list, настраивать — deals.manage.
  deals: ["deals.list", "deals.manage"],
  vaccinations: "vaccinations.view",
  achievements: "achievements.view",
  announcements: ["announcements.view", "announcements.manage"],
  conclusionPrint: "medical.conclusions.print",
  clients: "clients.view",
  pos: "pos.view",
  // Застройщик (AIVIO): бэк пускает в биллинг по treasury.view или realty.view.
  billing: ["treasury.view", "realty.view"],
  // Финансы застройщика (касса, календарь, бюджеты, долги) — /api/v2/treasury/, действия — treasury.manage.
  realtyFinance: "treasury.view",
  // Стройка застройщика: графики, подрядчики, стройконтроль — /api/v2/construction/, кнопки — construction.manage.
  construction: "construction.view",
  // Сметы, снабжение, склад — /api/v2/supply/, кнопки — supply.manage / supply.approve.
  supply: "supply.view",
  // Кадры застройщика: сотрудники и табель — /api/v2/personnel/, кнопки — personnel.manage (+ staff.update).
  personnel: "personnel.view",
  // Ведомость зарплаты застройщика — /api/v2/salary/runs/, кнопки — salary.manage + уровень payroll в матрице.
  estatePayroll: "salary.view",
  // Рабочий стол застройщика: экран и его панели — estate_dashboard.view,
  // остальные панели бэк режет правами своих модулей сам.
  estateDashboard: "estate_dashboard.view",
  // «Мой день» застройщика — задачи CRM `/api/v2/realty/tasks/`, менять — realty.manage.
  realtyToday: "realty.view",
  // Воронка и лиды застройщика — /api/v2/realty/leads/, менять — realty.manage.
  realtySales: "realty.view",
  // «Планы и мотивация» застройщика — /api/v2/salary/motivation/, менять — salary.manage.
  realtyMotivation: "salary.view",
  // ЭДО застройщика: реестр, договоры, шаблоны, архив — edo.view (менять — edo.manage).
  edo: "edo.view",
  // «Документы (CRM)» — файлы сделок модуля продаж.
  salesDocuments: "realty.view",
  // Просмотр истории и незавершённых пересчётов доступен вместе со складом;
  // операции открытия/сканирования/завершения дополнительно проверяет API.
  inventory: "warehouse.view",
  // Накладные (закупки): page-visibility право; данные читает procurement.view,
  // кнопки — свои коды (см. PROCUREMENT_PERMISSIONS в api/procurement.ts).
  // Модуль procurement гейтится через canAccess по префиксу кода.
  procurementInvoices: "procurement.invoices.view",
  ecommerce: "ecommerce.view",
  targets: "targets.view",
  messaging: "messaging.view",
} satisfies Record<string, string | string[]>;

export const SETTINGS_TAB_PERMISSIONS = {
  // Витрина модулей: read-only каталог. Право узкое, выдаётся admin-tier ролям
  // (см. rbac backfill 0015). Тумблинг модулей остаётся за платформой.
  modules: "tenancy.catalog.view",
  // Модули подключает только администратор платформы в Django admin. В CRM
  // остаются рабочие настройки подключённого продукта: canAccess проверит
  // одновременно право роли и включённый модуль по префиксу кода.
  store: "pos.manage",
  procurement: "procurement.manage",
  discountKinds: "promotions.view",
  promotions: "promotions.view",
  organization: "organization.view",
  branches: "branches.view",
  // Сайт-визитку настраивает тот же, кто правит организацию: конструктор
  // пишет в её themeConfig, отдельного кода прав на бэке нет.
  site: "organization.view",
  roles: "rbac.roles.view",
  memberships: "rbac.memberships.view",
  specializations: "staff.specializations.view",
  // Banks expose private employee requisites and use this permission in the
  // route/API.  There is no staff.banks.view permission in the registry.
  banks: "staff.private.view",
  insurers: "finance.view",
  cashlessMethods: "finance.view",
  expenseCategories: "finance.expense.manage",
  diagnoses: "medical.diagnoses.manage",
  // Своё право: бланки настраивает администратор, а читают их врачи по праву
  // на заключения (medical.conclusions.view) — отдельного права на чтение нет.
  // Шаблоны ролей выдают этот код там же, где medical.diagnoses.manage, так
  // что доступ у существующих ролей не меняется.
  conclusionForms: "medical.conclusion_forms.manage",
  tasks: "tasks.manage",
  deals: "deals.manage",
  cleaning: "cleaning.manage",
  skud: PAGE_PERMISSIONS.attendanceSettings,
  announcements: PAGE_PERMISSIONS.announcements,
  notifications: PAGE_PERMISSIONS.notifications,
  // «Сбор отзывов»: настройки модуля отзывов (бэк — reviews.manage;
  // canAccess заодно гейтит модуль reviews по префиксу).
  reviews: "reviews.manage",
  notificationGateway: PAGE_PERMISSIONS.notifications,
  // Автоматизации продолжают работать по notifications.manage; отдельное
  // notifications.page.view управляет только доступностью экрана уведомлений.
  automations: "notifications.manage",
  // Подключение WhatsApp и каталог шаблонов: на бэке те же
  // notifications.manage (docs/whatsapp-templates-mvp.md §1.1). Привязка к
  // подключению Raven внутри страницы — только суперадмину, это проверяет
  // сам бэк.
  whatsapp: "notifications.manage",
  productAttributes: "warehouse.manage",
  // Настройки раздела (статусы, раскладка карточки) бэк закрывает clients.update.
  clients: "clients.update",
  // Витрина odoctor.kg. Право своё, а не общее с расписанием: за страницей
  // лежит учётная запись внешнего кабинета — ключ от чужой системы. Читать и
  // менять эти настройки бэк разрешает по одному и тому же коду, поэтому
  // «смотреть, но не править» на странице нет.
  odoctor: "odoctor.manage",
  // Подключение ЛИС: код организации, точки регистрации филиалов.
  lab: "lab.settings.manage",
  // Chatwoot → сделки: приёмник вебхука и карта инбоксов. Право своё
  // (chatwoot.manage), отдельное от chatwoot.view — видеть чаты и
  // настраивать секрет приёмника не одно и то же.
  chatwoot: "chatwoot.manage",
  // Синхронизация с Altegio. Страница новая и закрыта: маршрут под
  // RequireSuperAdmin, API — только суперадмину. Этот код не выдан ни одной
  // роли, поэтому вкладку видит лишь суперадмин (ему can() отвечает «да»
  // на любое право) — пока заказчик отдельно не откроет раздел ролям.
  altegio: "altegio.manage",
} satisfies Record<string, string | string[]>;

export type SettingsTabKey = keyof typeof SETTINGS_TAB_PERMISSIONS;
