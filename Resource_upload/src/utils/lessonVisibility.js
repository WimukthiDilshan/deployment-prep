const PREPARING_STATUSES = ["queued", "processing", "rebuilding"];
const STUDENT_HIDDEN_STATUSES = ["queued", "processing", "rebuilding", "failed"];

function isLessonReadyForStudents(status) {
  const value = String(status || "ready").trim();
  return !STUDENT_HIDDEN_STATUSES.includes(value);
}

function isLessonPreparing(status) {
  const value = String(status || "").trim();
  return PREPARING_STATUSES.includes(value);
}

function computeEnrollmentOpen(readyLessonCount, preparingLessonCount) {
  return Number(readyLessonCount) > 0 && Number(preparingLessonCount) === 0;
}

module.exports = {
  PREPARING_STATUSES,
  STUDENT_HIDDEN_STATUSES,
  isLessonReadyForStudents,
  isLessonPreparing,
  computeEnrollmentOpen,
};
