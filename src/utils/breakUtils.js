export const DEFAULT_BREAK_LIMIT = 45;

const CALL_CENTER_DEPARTMENT_NAMES = new Set([
  "cs",
  "callcenter",
  "call center",
  "call-center",
  "call_center",
]);

const normalizeDepartment = (department) =>
  `${department || ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export const getBreakLimitForDepartment = (department) => {
  const normalized = normalizeDepartment(department);
  if (CALL_CENTER_DEPARTMENT_NAMES.has(normalized)) return 60;
  return DEFAULT_BREAK_LIMIT;
};
