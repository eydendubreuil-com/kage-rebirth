-- KAGE: REBIRTH : table des sauvegardes. À coller dans Supabase > SQL Editor > Run.
create table if not exists public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
-- chaque joueur ne voit et ne modifie que sa propre sauvegarde
create policy "lire sa sauvegarde" on public.saves for select using (auth.uid() = user_id);
create policy "créer sa sauvegarde" on public.saves for insert with check (auth.uid() = user_id);
create policy "modifier sa sauvegarde" on public.saves for update using (auth.uid() = user_id);
