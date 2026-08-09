/** Shared semester options for edit profile / onboarding. */
export const SEMESTER_OPTIONS = [
  'Fall 2025',
  'Spring 2026',
  'Summer 2026',
  'Fall 2026',
  'School year 2025–26',
  'School year 2026–27',
  'Spring 2027',
  'Fall 2027',
] as const;

export type SemesterOption = (typeof SEMESTER_OPTIONS)[number];
