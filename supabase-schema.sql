create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('sales_rep','inventory_manager','sales_manager')),
  company_id text not null
);

create table if not exists inventory_items (
  sku text primary key,
  category text not null,
  grade text not null,
  thickness numeric not null,
  width numeric not null,
  length numeric not null,
  finish text not null,
  weight_per_unit numeric not null,
  base_price numeric not null,
  qty_on_hand numeric not null
);

create table if not exists surcharges (
  grade text not null,
  month_year text not null,
  value_per_lb numeric not null,
  primary key (grade, month_year)
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  items_quoted jsonb not null,
  total_price numeric not null,
  status text not null check (status in ('Draft','Sent','Won')),
  created_at timestamptz not null default now()
);
