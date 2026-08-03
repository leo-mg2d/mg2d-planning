-- MG2D Sécurité — schéma Supabase
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin','agent')) default 'agent',
  phone text,
  card_number text,
  card_expiry date,
  qualifications text[] default '{}',
  created_at timestamptz default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  notes text,
  created_at timestamptz default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  note text,
  created_at timestamptz default now()
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  start_date date not null,
  end_date date not null,
  comment text,
  status text not null check (status in ('pending','approved','rejected')) default 'pending',
  admin_comment text,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.shifts enable row level security;
alter table public.leave_requests enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where user_id=auth.uid() and role='admin'); $$;

create policy "profiles own or admin select" on public.profiles
for select to authenticated using (user_id=auth.uid() or public.is_admin());

create policy "sites authenticated read" on public.sites
for select to authenticated using (true);

create policy "sites admin manage" on public.sites
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "shifts own or admin read" on public.shifts
for select to authenticated using (
  public.is_admin() or agent_id=(select id from public.profiles where user_id=auth.uid())
);

create policy "shifts admin manage" on public.shifts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "leave own or admin read" on public.leave_requests
for select to authenticated using (
  public.is_admin() or agent_id=(select id from public.profiles where user_id=auth.uid())
);

create policy "agent creates own leave" on public.leave_requests
for insert to authenticated with check (
  agent_id=(select id from public.profiles where user_id=auth.uid())
);

create policy "admin updates leave" on public.leave_requests
for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Après avoir créé un utilisateur dans Authentication > Users :
-- insert into public.profiles(user_id,full_name,role)
-- values ('UUID_AUTH_USER','Nom Prénom','admin');
