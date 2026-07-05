import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const [key, ...rest] = line.split('=');
  if (!key) return acc;
  acc[key.trim()] = rest.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const main = async () => {
  console.log('Fetching recent attendance rows...');
  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select('id,user_id,attendance_date,check_in,check_out,shift_name,status')
    .order('attendance_date', { ascending: false })
    .limit(50);
  if (attendanceError) {
    console.error('Attendance error:', attendanceError);
    process.exit(1);
  }
  console.log('attendance rows:', attendance.length);
  console.log(JSON.stringify(attendance, null, 2));

  console.log('Fetching employee rows...');
  const { data: employees, error: employeesError } = await supabase
    .from('employees')
    .select('user_id,email,first_name,last_name,role,department')
    .limit(50);
  if (employeesError) {
    console.error('Employees error:', employeesError);
    process.exit(1);
  }
  console.log('employee rows:', employees.length);
  console.log(JSON.stringify(employees, null, 2));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});