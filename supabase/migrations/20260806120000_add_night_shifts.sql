-- Night shifts use the business day that starts at 03:00 (Africa/Cairo).
-- This migration deliberately leaves existing shift rows in place so current
-- employee assignments are not silently removed.
insert into public.shifts (shift_name, start_time, end_time)
values
  ('4 PM - 12 AM', '16:00:00', '00:00:00'),
  ('3 PM - 11 PM', '15:00:00', '23:00:00'),
  ('2 PM - 10 PM', '14:00:00', '22:00:00')
on conflict (shift_name) do update
set
  start_time = excluded.start_time,
  end_time = excluded.end_time;
