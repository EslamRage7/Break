export function canCreateAttendance(attendanceRows = []) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
  }).format(new Date());

  return !attendanceRows.some(
    (row) => row.attendance_date === today && row.check_out === null,
  );
}
