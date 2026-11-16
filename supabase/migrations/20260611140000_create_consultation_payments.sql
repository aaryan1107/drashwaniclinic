create table if not exists public.consultation_payments (
  id uuid primary key default gen_random_uuid(),
  razorpay_order_id text unique not null,
  razorpay_payment_id text unique,
  amount integer not null,
  currency text not null default 'INR',
  payment_method text,
  payment_status text not null default 'ORDER_CREATED',
  patient jsonb not null default '{}'::jsonb,
  clinic jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consultation_payments enable row level security;

create index if not exists consultation_payments_status_idx
  on public.consultation_payments (payment_status, created_at desc);

create or replace function public.set_consultation_payments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists consultation_payments_updated_at on public.consultation_payments;
create trigger consultation_payments_updated_at
before update on public.consultation_payments
for each row
execute function public.set_consultation_payments_updated_at();
