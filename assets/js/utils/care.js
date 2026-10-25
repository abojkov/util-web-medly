import { dateLabel } from "./format.js";
export const medicineLabel = (medicine) =>
  [medicine.name, medicine.strength, medicine.form].filter(Boolean).join(" · ");
export const courseDate = (course) => course.startDate || course.createdAt;
export const newestCourses = (courses) =>
  [...courses].sort(
    (a, b) =>
      courseDate(b).localeCompare(courseDate(a)) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
export function medicineChoiceLabel(medicine, data) {
  const courses = newestCourses(
    data.treatments.filter((course) => course.medicationId === medicine.id),
  );
  return [
    medicineLabel(medicine),
    `${courses.length} ${courses.length === 1 ? "course" : "courses"}`,
    courses[0]
      ? `Latest: ${courses[0].startDate ? dateLabel(courses[0].startDate) : "start date unknown"}`
      : "No courses yet",
  ].join(" · ");
}
export function courseLabel(course, data) {
  const visits = data.visits.filter((visit) =>
    visit.treatmentIds?.includes(course.id),
  );
  return [
    course.name,
    course.startDate ? dateLabel(course.startDate) : "Start date unknown",
    course.status,
    course.dosage,
    course.frequency,
    visits[0] ? `${visits[0].reason} (${dateLabel(visits[0].date)})` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
