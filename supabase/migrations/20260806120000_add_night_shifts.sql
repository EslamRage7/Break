-- Night shifts use the business day that starts at 03:00 (Africa/Cairo).
-- This migration deliberately leaves existing shift rows in place so current
-- employee assignments are not silently removed.
insert into public.shifts (shift_name, start_time, end_time)
select shift_name, start_time, end_time
from (
  values
    ('4 PM - 12 AM', '16:00:00'::time, '00:00:00'::time),
    ('3 PM - 11 PM', '15:00:00'::time, '23:00:00'::time),
    ('2 PM - 10 PM', '14:00:00'::time, '22:00:00'::time),
    ('12 AM - 8 AM', '00:00:00'::time, '08:00:00'::time)
) as new_shifts(shift_name, start_time, end_time)
where not exists (
  select 1
  from public.shifts existing_shifts
  where existing_shifts.shift_name = new_shifts.shift_name
);
