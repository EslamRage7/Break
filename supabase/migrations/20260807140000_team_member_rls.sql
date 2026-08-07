-- Restrict employee, attendance, and break data so admins can see everything,
-- team leaders can see only their own team, and employees can see only their own records.
create or replace function public.can_view_team_member(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid()
  or exists (
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

alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.break_sessions enable row level security;
alter table public.break_segments enable row level security;

drop policy if exists "Employees can view own employee row" on public.employees;
drop policy if exists "Managers can view team employee rows" on public.employees;
drop policy if exists "Employees can view own attendance" on public.attendance;
drop policy if exists "Managers can view team attendance" on public.attendance;
drop policy if exists "Employees can insert own attendance" on public.attendance;
drop policy if exists "Employees can update own attendance" on public.attendance;
drop policy if exists "Employees can view own break sessions" on public.break_sessions;
drop policy if exists "Managers can view team break sessions" on public.break_sessions;
drop policy if exists "Employees can view own break segments" on public.break_segments;
drop policy if exists "Managers can view team break segments" on public.break_segments;

create policy "Employees can view own employee row"
on public.employees
for select
to authenticated
using (user_id = auth.uid());

create policy "Managers can view team employee rows"
on public.employees
for select
to authenticated
using (public.can_view_team_member(user_id));

create policy "Employees can view own attendance"
on public.attendance
for select
to authenticated
using (public.can_view_team_member(user_id));

create policy "Managers can view team attendance"
on public.attendance
for select
to authenticated
using (public.can_view_team_member(user_id));

create policy "Employees can insert own attendance"
on public.attendance
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Employees can update own attendance"
on public.attendance
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Employees can view own break sessions"
on public.break_sessions
for select
to authenticated
using (public.can_view_team_member(user_id));

create policy "Managers can view team break sessions"
on public.break_sessions
for select
to authenticated
using (public.can_view_team_member(user_id));

create policy "Employees can view own break segments"
on public.break_segments
for select
to authenticated
using (public.can_view_team_member(user_id));

create policy "Managers can view team break segments"
on public.break_segments
for select
to authenticated
using (public.can_view_team_member(user_id));
