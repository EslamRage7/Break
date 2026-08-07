-- Employees may read only their own holidays. Admins can manage every record,
-- while team leaders can manage records belonging to their team.
create or replace function public.can_manage_employee_holiday(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees manager
    where manager.user_id = auth.uid()
      and manager.role = 'admin'
  )
  or exists (
    select 1
    from public.employees manager
    join public.employees target on target.user_id = target_user_id
    where manager.user_id = auth.uid()
      and manager.role = 'team_leader'
      and manager.team_id = target.team_id
  );
$$;

alter table public.employee_holidays enable row level security;

drop policy if exists "Employees can view their own holidays" on public.employee_holidays;
drop policy if exists "Managers can view employee holidays" on public.employee_holidays;
drop policy if exists "Managers can add employee holidays" on public.employee_holidays;
drop policy if exists "Managers can update employee holidays" on public.employee_holidays;
drop policy if exists "Managers can delete employee holidays" on public.employee_holidays;

create policy "Employees can view their own holidays"
on public.employee_holidays
for select
to authenticated
using (user_id = auth.uid());

create policy "Managers can view employee holidays"
on public.employee_holidays
for select
to authenticated
using (public.can_manage_employee_holiday(user_id));

create policy "Managers can add employee holidays"
on public.employee_holidays
for insert
to authenticated
with check (public.can_manage_employee_holiday(user_id));

create policy "Managers can update employee holidays"
on public.employee_holidays
for update
to authenticated
using (public.can_manage_employee_holiday(user_id))
with check (public.can_manage_employee_holiday(user_id));

create policy "Managers can delete employee holidays"
on public.employee_holidays
for delete
to authenticated
using (public.can_manage_employee_holiday(user_id));
