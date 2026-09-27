-- =============================================================================
-- Tienda Coqueta Boutique — esquema de base de datos (Supabase / PostgreSQL)
--
-- Ejecutar completo en el SQL Editor de un proyecto nuevo. Es re-ejecutable:
-- usa IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.
--
-- Convenciones:
--  * Todo monto es BIGINT en centavos.
--  * El redondeo es round() sobre numeric (mitad lejos de cero), igual que
--    src/domain/money.ts.
--  * Las operaciones críticas (venta, anulación, caja, stock, productos) solo
--    se hacen por RPC SECURITY DEFINER; las tablas de ventas y caja no tienen
--    políticas de escritura.
--  * Los errores de negocio usan SQLSTATE propios (clase CQ) para que el
--    cliente los traduzca a RepositoryError:
--      CQ400 invalid · CQ401 auth · CQ403 forbidden · CQ404 not_found
--      CQ409 insufficient_stock · CQ410 register_closed · CQ411 register_open
-- =============================================================================

-- Esquema privado para funciones internas (no expuesto por la API REST).
create schema if not exists app_private;
revoke all on schema app_private from public;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  tax_rate_bps integer not null default 1500 check (tax_rate_bps between 0 and 10000),
  prices_include_tax boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'cashier' check (role in ('admin', 'cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (btrim(name) <> ''),
  brand text,
  description text,
  sku_base text not null check (btrim(sku_base) <> ''),
  base_price bigint not null default 0 check (base_price >= 0),
  base_cost bigint not null default 0 check (base_cost >= 0),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique check (btrim(sku) <> ''),
  barcode text not null unique check (btrim(barcode) <> ''),
  size text,
  color text,
  price bigint check (price is null or price >= 0),
  cost bigint check (cost is null or cost >= 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  opening_amount bigint not null check (opening_amount >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  counted_amount bigint check (counted_amount is null or counted_amount >= 0),
  expected_amount bigint,
  difference bigint,
  notes text
);
-- Solo puede existir una caja abierta a la vez.
create unique index if not exists cash_registers_single_open
  on public.cash_registers (status) where status = 'open';

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.cash_registers (id),
  type text not null check (type in ('in', 'out')),
  amount bigint not null check (amount > 0),
  reason text not null check (btrim(reason) <> ''),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create sequence if not exists public.sale_number_seq start with 1001;
create sequence if not exists public.barcode_seq start with 1;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.sale_number_seq'),
  register_id uuid not null references public.cash_registers (id),
  cashier_id uuid not null references public.profiles (id),
  customer_name text,
  subtotal bigint not null check (subtotal >= 0),
  discount_total bigint not null default 0 check (discount_total >= 0),
  tax_total bigint not null default 0 check (tax_total >= 0),
  total bigint not null check (total >= 0),
  payments jsonb not null default '[]'::jsonb check (jsonb_typeof(payments) = 'array'),
  change bigint not null default 0 check (change >= 0),
  status text not null default 'completed' check (status in ('completed', 'voided')),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  check ((status = 'voided') = (voided_at is not null))
);
alter sequence public.sale_number_seq owned by public.sales.number;

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  line_no integer not null default 0,
  variant_id uuid not null references public.product_variants (id),
  product_name text not null,
  variant_label text not null default '',
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  unit_cost bigint not null check (unit_cost >= 0),
  discount bigint not null default 0 check (discount >= 0),
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  type text not null check (type in ('sale', 'void', 'purchase', 'adjustment', 'return', 'initial')),
  quantity integer not null check (quantity <> 0),
  stock_after integer not null,
  reference_id uuid,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------
create index if not exists products_category_idx on public.products (category_id);
create index if not exists product_variants_product_idx on public.product_variants (product_id);
create index if not exists cash_registers_opened_at_idx on public.cash_registers (opened_at desc);
create index if not exists cash_movements_register_idx on public.cash_movements (register_id, created_at desc);
create index if not exists sales_created_at_idx on public.sales (created_at desc);
create index if not exists sales_register_idx on public.sales (register_id);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id, line_no);
create index if not exists sale_items_variant_idx on public.sale_items (variant_id);
create index if not exists inventory_movements_variant_idx on public.inventory_movements (variant_id, created_at desc);
create index if not exists inventory_movements_created_at_idx on public.inventory_movements (created_at desc);

-- -----------------------------------------------------------------------------
-- Funciones internas (app_private)
-- -----------------------------------------------------------------------------

-- Lanza un error de negocio con SQLSTATE propio.
create or replace function app_private.fail(p_kind text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception using
    errcode = case p_kind
      when 'not_found' then 'CQ404'
      when 'insufficient_stock' then 'CQ409'
      when 'register_closed' then 'CQ410'
      when 'register_open' then 'CQ411'
      when 'forbidden' then 'CQ403'
      when 'auth' then 'CQ401'
      else 'CQ400'
    end,
    message = p_message;
end;
$$;

-- Entero JSON estricto: devuelve NULL si no es un número entero.
create or replace function app_private.json_int(p jsonb)
returns bigint
language sql
immutable
as $$
  select case
    when jsonb_typeof(p) = 'number' and (p #>> '{}') ~ '^-?[0-9]{1,18}$'
      then (p #>> '{}')::bigint
  end
$$;

-- Monto opcional en centavos: NULL si falta o es null; error si es inválido.
create or replace function app_private.opt_cents(p jsonb, p_message text)
returns bigint
language plpgsql
immutable
as $$
declare
  v bigint;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  v := app_private.json_int(p);
  if v is null or v < 0 then
    perform app_private.fail('invalid', p_message);
  end if;
  return v;
end;
$$;

-- Perfil activo del usuario de la sesión (o error 'auth').
create or replace function app_private.current_profile()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles;
begin
  if auth.uid() is null then
    perform app_private.fail('auth', 'Sesión no iniciada.');
  end if;
  select * into v from public.profiles where id = auth.uid();
  if not found or not v.active then
    perform app_private.fail('auth', 'Tu usuario no está activo.');
  end if;
  return v;
end;
$$;

create or replace function app_private.require_admin()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles;
begin
  v := app_private.current_profile();
  if v.role <> 'admin' then
    perform app_private.fail('forbidden', 'Solo un administrador puede hacer esto.');
  end if;
  return v;
end;
$$;

-- Igual que resolveDiscount() de src/domain/pricing.ts.
create or replace function app_private.resolve_discount(p_base bigint, p_d jsonb)
returns bigint
language plpgsql
immutable
as $$
declare
  v_kind text;
  v_bps numeric;
  v_raw bigint;
begin
  if p_d is null or jsonb_typeof(p_d) = 'null' or p_base <= 0 then
    return 0;
  end if;
  if jsonb_typeof(p_d) <> 'object' then
    perform app_private.fail('invalid', 'Descuento inválido.');
  end if;
  v_kind := p_d ->> 'kind';
  if v_kind = 'percent' then
    if jsonb_typeof(p_d -> 'bps') is distinct from 'number' then
      perform app_private.fail('invalid', 'Descuento inválido.');
    end if;
    v_bps := least(greatest((p_d ->> 'bps')::numeric, 0), 10000);
    v_raw := round(p_base::numeric * v_bps / 10000)::bigint;
  elsif v_kind = 'amount' then
    v_raw := app_private.json_int(p_d -> 'cents');
    if v_raw is null then
      perform app_private.fail('invalid', 'Descuento inválido.');
    end if;
  else
    perform app_private.fail('invalid', 'Descuento inválido.');
  end if;
  return least(greatest(v_raw, 0), p_base);
end;
$$;

-- Reparto proporcional sin perder centavos (mayor residuo), igual que
-- allocate() de src/domain/money.ts. Aritmética entera exacta.
create or replace function app_private.allocate(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
as $$
declare
  v_sum numeric;
  v_out bigint[];
begin
  if p_weights is null or cardinality(p_weights) = 0 then
    return '{}'::bigint[];
  end if;
  select coalesce(sum(w), 0) into v_sum from unnest(p_weights) as w;
  if v_sum <= 0 then
    v_out := array_fill(0::bigint, array[cardinality(p_weights)]);
    v_out[1] := p_total;
    return v_out;
  end if;
  select array_agg(b.fl + case when b.rn <= p_total - b.tot then 1 else 0 end order by b.idx)
    into v_out
  from (
    select a.idx, a.fl,
           sum(a.fl) over () as tot,
           row_number() over (order by a.md desc, a.idx) as rn
    from (
      select u.idx,
             div(p_total::numeric * u.w, v_sum)::bigint as fl,
             mod(p_total::numeric * u.w, v_sum) as md
      from unnest(p_weights) with ordinality as u(w, idx)
    ) a
  ) b;
  return v_out;
end;
$$;

-- Efectivo esperado en gaveta: igual que summarizeRegister().expectedCash.
create or replace function app_private.expected_cash(p_register_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select r.opening_amount
    + coalesce((
        select sum((p ->> 'amount')::bigint)
        from public.sales s
        cross join lateral jsonb_array_elements(s.payments) as p
        where s.register_id = r.id
          and s.status = 'completed'
          and p ->> 'method' = 'cash'
      ), 0)::bigint
    + coalesce((
        select sum(case when m.type = 'in' then m.amount else -m.amount end)
        from public.cash_movements m
        where m.register_id = r.id
      ), 0)::bigint
  from public.cash_registers r
  where r.id = p_register_id
$$;

-- Venta + líneas como JSON (mismas claves que la tabla, en snake_case).
create or replace function app_private.sale_json(p_sale_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select to_jsonb(s) || jsonb_build_object(
    'sale_items',
    coalesce((
      select jsonb_agg(to_jsonb(i) order by i.line_no, i.id)
      from public.sale_items i
      where i.sale_id = s.id
    ), '[]'::jsonb)
  )
  from public.sales s
  where s.id = p_sale_id
$$;

-- EAN-13 interno con prefijo 20 (igual que internalEan13() de src/domain/codes.ts).
create or replace function app_private.internal_ean13(p_seq bigint, p_prefix text default '20')
returns text
language sql
immutable
as $$
  select b.body || ((10 - (sum(substr(b.body, i, 1)::int * case when i % 2 = 1 then 1 else 3 end) % 10)) % 10)::text
  from (select p_prefix || lpad(right(p_seq::text, 10), 10, '0') as body) b
  cross join generate_series(1, 12) as i
  group by b.body
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function app_private.set_updated_at();

-- Cada línea vendida descuenta stock (con bloqueo de fila) y deja rastro.
create or replace function app_private.on_sale_item_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_sku text;
  v_by uuid;
begin
  select stock, sku into v_stock, v_sku
  from public.product_variants
  where id = new.variant_id
  for update;
  if not found then
    perform app_private.fail('not_found', 'Producto no disponible.');
  end if;
  if v_stock < new.quantity then
    perform app_private.fail('insufficient_stock',
      format('Stock insuficiente de %s (quedan %s).', v_sku, v_stock));
  end if;

  update public.product_variants
     set stock = stock - new.quantity
   where id = new.variant_id
  returning stock into v_stock;

  select cashier_id into v_by from public.sales where id = new.sale_id;

  insert into public.inventory_movements
    (variant_id, type, quantity, stock_after, reference_id, note, created_by)
  values
    (new.variant_id, 'sale', -new.quantity, v_stock, new.sale_id, null, v_by);
  return null;
end;
$$;

drop trigger if exists sale_items_decrement_stock on public.sale_items;
create trigger sale_items_decrement_stock
  after insert on public.sale_items
  for each row execute function app_private.on_sale_item_insert();

-- Perfil automático al registrarse. El primer usuario es administrador.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serializa altas simultáneas para que solo uno sea "el primero".
  perform pg_advisory_xact_lock(hashtext('coqueta.handle_new_user'));
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuario'
    ),
    case when exists (select 1 from public.profiles) then 'cashier' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Si el esquema se ejecuta con usuarios ya creados, se les crea el perfil
-- y el más antiguo pasa a ser administrador si no hay ninguno.
insert into public.profiles (id, full_name, role)
select u.id,
       coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Usuario'),
       'cashier'
from auth.users u
on conflict (id) do nothing;

update public.profiles
   set role = 'admin'
 where id = (
     select p.id from public.profiles p
     join auth.users u on u.id = p.id
     order by u.created_at
     limit 1)
   and not exists (select 1 from public.profiles where role = 'admin');

-- -----------------------------------------------------------------------------
-- Helper para RLS
-- -----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  )
$$;

-- -----------------------------------------------------------------------------
-- RPC: catálogo
-- -----------------------------------------------------------------------------

create or replace function public.save_category(p_id uuid, p_name text, p_sort_order integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat public.categories;
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform app_private.require_admin();
  if v_name = '' then
    perform app_private.fail('invalid', 'El nombre es obligatorio.');
  end if;
  if p_id is not null then
    update public.categories
       set name = v_name, sort_order = coalesce(p_sort_order, 0)
     where id = p_id
    returning * into v_cat;
    if not found then
      perform app_private.fail('not_found', 'Categoría no encontrada.');
    end if;
  else
    insert into public.categories (name, sort_order)
    values (v_name, coalesce(p_sort_order, 0))
    returning * into v_cat;
  end if;
  return to_jsonb(v_cat);
end;
$$;

-- Crea o actualiza producto + variantes. p_draft en snake_case:
-- { id?, category_id, name, brand, description, sku_base, base_price, base_cost,
--   image_url, active, variants: [{ id?, size, color, sku, barcode, price, cost,
--   initial_stock?, min_stock, active }] }
create or replace function public.save_product(p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles;
  v_product public.products;
  v_existing public.product_variants;
  v_new public.product_variants;
  v_found boolean;
  v_v jsonb;
  v_id uuid;
  v_vid uuid;
  v_name text;
  v_sku_base text;
  v_base_price bigint;
  v_base_cost bigint;
  v_sku text;
  v_barcode text;
  v_min_stock bigint;
  v_stock bigint;
  v_clash text;
begin
  v_user := app_private.require_admin();

  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    perform app_private.fail('invalid', 'Datos de producto inválidos.');
  end if;

  v_name := btrim(coalesce(p_draft ->> 'name', ''));
  if v_name = '' then
    perform app_private.fail('invalid', 'El nombre es obligatorio.');
  end if;
  v_sku_base := upper(btrim(coalesce(p_draft ->> 'sku_base', '')));
  if v_sku_base = '' then
    perform app_private.fail('invalid', 'El SKU base es obligatorio.');
  end if;
  v_base_price := app_private.json_int(p_draft -> 'base_price');
  if v_base_price is null or v_base_price < 0 then
    perform app_private.fail('invalid', 'Precio inválido.');
  end if;
  v_base_cost := app_private.json_int(p_draft -> 'base_cost');
  if v_base_cost is null or v_base_cost < 0 then
    perform app_private.fail('invalid', 'Costo inválido.');
  end if;

  if jsonb_typeof(p_draft -> 'variants') is distinct from 'array' then
    perform app_private.fail('invalid', 'Agrega al menos una variante.');
  end if;
  if jsonb_array_length(p_draft -> 'variants') = 0 then
    perform app_private.fail('invalid', 'Agrega al menos una variante.');
  end if;

  for v_v in select value from jsonb_array_elements(p_draft -> 'variants') loop
    if jsonb_typeof(v_v) <> 'object'
       or btrim(coalesce(v_v ->> 'sku', '')) = ''
       or btrim(coalesce(v_v ->> 'barcode', '')) = '' then
      perform app_private.fail('invalid', 'Cada variante necesita SKU y código.');
    end if;
  end loop;

  select s into v_clash
  from (select btrim(value ->> 'sku') as s from jsonb_array_elements(p_draft -> 'variants')) x
  group by s having count(*) > 1 limit 1;
  if found then
    perform app_private.fail('invalid', format('Variante repetida: %s', v_clash));
  end if;
  select b into v_clash
  from (select btrim(value ->> 'barcode') as b from jsonb_array_elements(p_draft -> 'variants')) x
  group by b having count(*) > 1 limit 1;
  if found then
    perform app_private.fail('invalid', format('Código repetido: %s', v_clash));
  end if;

  -- Producto
  v_id := nullif(p_draft ->> 'id', '')::uuid;
  if v_id is not null then
    perform 1 from public.products where id = v_id for update;
    if not found then
      perform app_private.fail('not_found', 'Producto no encontrado.');
    end if;
    update public.products set
      category_id = nullif(p_draft ->> 'category_id', '')::uuid,
      name = v_name,
      brand = nullif(btrim(p_draft ->> 'brand'), ''),
      description = nullif(btrim(p_draft ->> 'description'), ''),
      sku_base = v_sku_base,
      base_price = v_base_price,
      base_cost = v_base_cost,
      image_url = nullif(btrim(p_draft ->> 'image_url'), ''),
      active = coalesce((p_draft ->> 'active')::boolean, true)
    where id = v_id
    returning * into v_product;
  else
    insert into public.products
      (category_id, name, brand, description, sku_base, base_price, base_cost, image_url, active)
    values (
      nullif(p_draft ->> 'category_id', '')::uuid,
      v_name,
      nullif(btrim(p_draft ->> 'brand'), ''),
      nullif(btrim(p_draft ->> 'description'), ''),
      v_sku_base,
      v_base_price,
      v_base_cost,
      nullif(btrim(p_draft ->> 'image_url'), ''),
      coalesce((p_draft ->> 'active')::boolean, true)
    )
    returning * into v_product;
  end if;

  -- Variantes
  for v_v in
    select t.item
    from jsonb_array_elements(p_draft -> 'variants') with ordinality as t(item, idx)
    order by t.idx
  loop
    v_sku := btrim(v_v ->> 'sku');
    v_barcode := btrim(v_v ->> 'barcode');
    v_vid := nullif(v_v ->> 'id', '')::uuid;

    select sku into v_clash
    from public.product_variants
    where (v_vid is null or id <> v_vid)
      and (sku = v_sku or barcode = v_barcode)
    limit 1;
    if found then
      perform app_private.fail('invalid', format('SKU o código repetido: %s', v_clash));
    end if;

    v_min_stock := coalesce(app_private.json_int(v_v -> 'min_stock'), 0);
    if v_min_stock < 0 then
      perform app_private.fail('invalid', 'Stock mínimo inválido.');
    end if;

    v_found := false;
    if v_vid is not null then
      select * into v_existing
      from public.product_variants
      where id = v_vid and product_id = v_product.id
      for update;
      v_found := found;
    end if;

    if v_found then
      update public.product_variants set
        size = nullif(btrim(v_v ->> 'size'), ''),
        color = nullif(btrim(v_v ->> 'color'), ''),
        sku = v_sku,
        barcode = v_barcode,
        price = app_private.opt_cents(v_v -> 'price', 'Precio de variante inválido.'),
        cost = app_private.opt_cents(v_v -> 'cost', 'Costo de variante inválido.'),
        min_stock = v_min_stock,
        active = coalesce((v_v ->> 'active')::boolean, true)
      where id = v_existing.id;
    else
      v_stock := greatest(0, coalesce(app_private.json_int(v_v -> 'initial_stock'), 0));
      insert into public.product_variants
        (product_id, sku, barcode, size, color, price, cost, stock, min_stock, active, created_at)
      values (
        v_product.id,
        v_sku,
        v_barcode,
        nullif(btrim(v_v ->> 'size'), ''),
        nullif(btrim(v_v ->> 'color'), ''),
        app_private.opt_cents(v_v -> 'price', 'Precio de variante inválido.'),
        app_private.opt_cents(v_v -> 'cost', 'Costo de variante inválido.'),
        v_stock,
        v_min_stock,
        coalesce((v_v ->> 'active')::boolean, true),
        clock_timestamp()
      )
      returning * into v_new;
      if v_stock > 0 then
        insert into public.inventory_movements
          (variant_id, type, quantity, stock_after, reference_id, note, created_by)
        values (v_new.id, 'initial', v_stock, v_stock, null, 'Inventario inicial', v_user.id);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'product', to_jsonb(v_product),
    'variants', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.created_at, v.id)
      from public.product_variants v
      where v.product_id = v_product.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Reserva un bloque contiguo de `p_count` números para EAN-13 internos.
-- Devuelve el primero del bloque.
create or replace function public.reserve_barcode_sequence(p_count integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := greatest(1, least(coalesce(p_count, 1), 10000));
  v_start bigint;
begin
  perform app_private.current_profile();
  -- Serializa reservas para que el bloque sea contiguo.
  perform pg_advisory_xact_lock(hashtext('coqueta.barcode_seq'));
  v_start := nextval('public.barcode_seq');
  if v_count > 1 then
    perform setval('public.barcode_seq', v_start + v_count - 1, true);
  end if;
  return v_start;
end;
$$;

create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_delta integer,
  p_type text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles;
  v_variant public.product_variants;
begin
  v_user := app_private.require_admin();
  if p_type is null or p_type not in ('purchase', 'adjustment', 'return') then
    perform app_private.fail('invalid', 'Tipo de movimiento inválido.');
  end if;
  if p_delta is null or p_delta = 0 then
    perform app_private.fail('invalid', 'La cantidad no puede ser cero.');
  end if;

  select * into v_variant from public.product_variants where id = p_variant_id for update;
  if not found then
    perform app_private.fail('not_found', 'Variante no encontrada.');
  end if;
  if v_variant.stock + p_delta < 0 then
    perform app_private.fail('insufficient_stock', 'El stock no puede quedar negativo.');
  end if;

  update public.product_variants
     set stock = stock + p_delta
   where id = p_variant_id
  returning * into v_variant;

  insert into public.inventory_movements
    (variant_id, type, quantity, stock_after, reference_id, note, created_by)
  values
    (p_variant_id, p_type, p_delta, v_variant.stock, null, nullif(btrim(p_note), ''), v_user.id);

  return to_jsonb(v_variant);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: caja
-- -----------------------------------------------------------------------------

create or replace function public.open_register(p_opening_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles;
  v_reg public.cash_registers;
begin
  v_user := app_private.current_profile();
  if p_opening_amount is null or p_opening_amount < 0 then
    perform app_private.fail('invalid', 'Monto de apertura inválido.');
  end if;
  -- Serializa aperturas; el índice único parcial es la última defensa.
  perform pg_advisory_xact_lock(hashtext('coqueta.open_register'));
  if exists (select 1 from public.cash_registers where status = 'open') then
    perform app_private.fail('register_open', 'Ya hay una caja abierta.');
  end if;
  begin
    insert into public.cash_registers (opened_by, opening_amount, status)
    values (v_user.id, p_opening_amount, 'open')
    returning * into v_reg;
  exception when unique_violation then
    perform app_private.fail('register_open', 'Ya hay una caja abierta.');
  end;
  return to_jsonb(v_reg);
end;
$$;

create or replace function public.close_register(
  p_register_id uuid,
  p_counted_amount bigint,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles;
  v_reg public.cash_registers;
  v_expected bigint;
begin
  v_user := app_private.current_profile();
  -- El bloqueo impide que entre una venta o movimiento durante el cierre.
  select * into v_reg from public.cash_registers where id = p_register_id for update;
  if not found then
    perform app_private.fail('not_found', 'Caja no encontrada.');
  end if;
  if v_reg.status <> 'open' then
    perform app_private.fail('register_closed', 'La caja ya está cerrada.');
  end if;
  if p_counted_amount is null or p_counted_amount < 0 then
    perform app_private.fail('invalid', 'Monto contado inválido.');
  end if;

  v_expected := app_private.expected_cash(p_register_id);

  update public.cash_registers set
    status = 'closed',
    closed_by = v_user.id,
    closed_at = now(),
    counted_amount = p_counted_amount,
    expected_amount = v_expected,
    difference = p_counted_amount - v_expected,
    notes = nullif(btrim(p_notes), '')
  where id = p_register_id
  returning * into v_reg;

  return to_jsonb(v_reg);
end;
$$;

create or replace function public.add_cash_movement(
  p_register_id uuid,
  p_type text,
  p_amount bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles;
  v_reg public.cash_registers;
  v_mov public.cash_movements;
begin
  v_user := app_private.current_profile();
  select * into v_reg from public.cash_registers where id = p_register_id for update;
  if not found or v_reg.status <> 'open' then
    perform app_private.fail('register_closed', 'La caja no está abierta.');
  end if;
  if p_type is null or p_type not in ('in', 'out') then
    perform app_private.fail('invalid', 'Tipo de movimiento inválido.');
  end if;
  if p_amount is null or p_amount <= 0 then
    perform app_private.fail('invalid', 'Monto inválido.');
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    perform app_private.fail('invalid', 'Indica el motivo.');
  end if;
  if p_type = 'out' and p_amount > app_private.expected_cash(p_register_id) then
    perform app_private.fail('invalid', 'No hay suficiente efectivo en caja para ese retiro.');
  end if;

  insert into public.cash_movements (register_id, type, amount, reason, created_by)
  values (p_register_id, p_type, p_amount, btrim(p_reason), v_user.id)
  returning * into v_mov;
  return to_jsonb(v_mov);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: ventas
-- -----------------------------------------------------------------------------

-- p_items: [{ variant_id, quantity, discount? }]
-- p_cart_discount / discount: { kind: 'percent', bps } | { kind: 'amount', cents }
-- p_tenders: [{ method: 'cash'|'card'|'transfer', amount, reference? }]
-- Los precios se recalculan aquí; nunca se confía en el cliente.
create or replace function public.create_sale(
  p_register_id uuid,
  p_items jsonb,
  p_cart_discount jsonb default null,
  p_tenders jsonb default '[]'::jsonb,
  p_customer_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles;
  v_reg public.cash_registers;
  v_cfg public.app_settings;
  v_rec record;
  v_line record;
  v_it jsonb;
  v_q bigint;
  v_n integer := 0;
  v_i integer;
  -- líneas (arreglos paralelos, en el orden del carrito)
  a_variant uuid[] := '{}';
  a_qty integer[] := '{}';
  a_price bigint[] := '{}';
  a_cost bigint[] := '{}';
  a_gross bigint[] := '{}';
  a_line_disc bigint[] := '{}';
  a_net bigint[] := '{}';
  a_name text[] := '{}';
  a_label text[] := '{}';
  a_sku text[] := '{}';
  a_share bigint[];
  a_disc bigint[] := '{}';
  a_total bigint[] := '{}';
  v_gross bigint;
  v_ld bigint;
  v_net_sum bigint := 0;
  v_cart_total bigint;
  v_after bigint;
  v_tax bigint;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_discount_total bigint := 0;
  v_tax_total bigint := 0;
  v_total bigint := 0;
  -- cobro
  v_tenders jsonb;
  v_method text;
  v_amount bigint;
  v_non_cash bigint := 0;
  v_cash bigint := 0;
  v_pending bigint;
  v_payments jsonb := '[]'::jsonb;
  v_change bigint := 0;
  v_sale_id uuid;
begin
  v_user := app_private.current_profile();

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    perform app_private.fail('invalid', 'El carrito está vacío.');
  end if;
  if jsonb_array_length(p_items) = 0 then
    perform app_private.fail('invalid', 'El carrito está vacío.');
  end if;
  if jsonb_array_length(p_items) > 500 then
    perform app_private.fail('invalid', 'Demasiadas líneas en el carrito.');
  end if;

  -- Bloquea la caja: serializa ventas y evita cruzarse con el cierre.
  select * into v_reg from public.cash_registers where id = p_register_id for update;
  if not found or v_reg.status <> 'open' then
    perform app_private.fail('register_closed', 'Abre la caja antes de vender.');
  end if;

  -- Validación de forma.
  for v_it in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_it) <> 'object' then
      perform app_private.fail('invalid', 'Línea de venta inválida.');
    end if;
    v_q := app_private.json_int(v_it -> 'quantity');
    if v_q is null or v_q <= 0 or v_q > 100000 then
      perform app_private.fail('invalid', 'Cantidad inválida.');
    end if;
    if coalesce(v_it ->> 'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform app_private.fail('not_found', 'Producto no disponible.');
    end if;
  end loop;

  -- Bloquea las variantes en orden de id (evita interbloqueos).
  perform 1
  from public.product_variants
  where id in (select (x ->> 'variant_id')::uuid from jsonb_array_elements(p_items) as x)
  order by id
  for update;

  -- Resuelve precio y costo con datos del servidor.
  for v_rec in
    select (t.item ->> 'variant_id')::uuid as variant_id,
           (t.item ->> 'quantity')::integer as qty,
           t.item -> 'discount' as disc
    from jsonb_array_elements(p_items) with ordinality as t(item, idx)
    order by t.idx
  loop
    select v.id, v.sku, v.size, v.color,
           coalesce(v.price, p.base_price) as unit_price,
           coalesce(v.cost, p.base_cost) as unit_cost,
           p.name as product_name
      into v_line
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = v_rec.variant_id and v.active and p.active;
    if not found then
      perform app_private.fail('not_found', 'Producto no disponible.');
    end if;

    v_gross := v_rec.qty::bigint * v_line.unit_price;
    v_ld := app_private.resolve_discount(v_gross, v_rec.disc);

    v_n := v_n + 1;
    a_variant := a_variant || v_line.id;
    a_qty := a_qty || v_rec.qty;
    a_price := a_price || v_line.unit_price;
    a_cost := a_cost || v_line.unit_cost;
    a_gross := a_gross || v_gross;
    a_line_disc := a_line_disc || v_ld;
    a_net := a_net || (v_gross - v_ld);
    a_name := a_name || v_line.product_name;
    a_label := a_label || concat_ws(' / ', nullif(v_line.size, ''), nullif(v_line.color, ''));
    a_sku := a_sku || v_line.sku;
    v_net_sum := v_net_sum + (v_gross - v_ld);
  end loop;

  -- Stock sobre el total pedido por variante (líneas repetidas se suman).
  for v_rec in
    select v.sku, v.stock, q.total_qty
    from (
      select (x ->> 'variant_id')::uuid as vid, sum((x ->> 'quantity')::integer) as total_qty
      from jsonb_array_elements(p_items) as x
      group by 1
    ) q
    join public.product_variants v on v.id = q.vid
    order by v.id
  loop
    if v_rec.stock < v_rec.total_qty then
      perform app_private.fail('insufficient_stock',
        format('Stock insuficiente de %s (quedan %s).', v_rec.sku, v_rec.stock));
    end if;
  end loop;

  -- Descuento global prorrateado por monto neto (mayor residuo).
  v_cart_total := app_private.resolve_discount(v_net_sum, p_cart_discount);
  a_share := app_private.allocate(v_cart_total, a_net);

  select * into v_cfg from public.app_settings where id;
  if not found then
    v_cfg.tax_rate_bps := 1500;
    v_cfg.prices_include_tax := true;
  end if;

  for v_i in 1 .. v_n loop
    a_disc := a_disc || (a_line_disc[v_i] + a_share[v_i]);
    v_after := a_gross[v_i] - a_disc[v_i];
    if v_cfg.prices_include_tax then
      v_tax := v_after - round(v_after::numeric * 10000 / (10000 + v_cfg.tax_rate_bps))::bigint;
      v_line_total := v_after;
    else
      v_tax := round(v_after::numeric * v_cfg.tax_rate_bps / 10000)::bigint;
      v_line_total := v_after + v_tax;
    end if;
    a_total := a_total || v_line_total;
    v_subtotal := v_subtotal + a_gross[v_i];
    v_discount_total := v_discount_total + a_disc[v_i];
    v_tax_total := v_tax_total + v_tax;
    v_total := v_total + v_line_total;
  end loop;

  -- Cobro: mismas reglas que settle() de src/domain/payment.ts.
  v_tenders := case when jsonb_typeof(p_tenders) = 'array' then p_tenders else '[]'::jsonb end;
  if v_total > 0 then
    for v_it in
      select t.item from jsonb_array_elements(v_tenders) with ordinality as t(item, idx) order by t.idx
    loop
      if jsonb_typeof(v_it) <> 'object' then
        perform app_private.fail('invalid', 'Pago inválido.');
      end if;
      v_method := v_it ->> 'method';
      if v_method is null or v_method not in ('cash', 'card', 'transfer') then
        perform app_private.fail('invalid', 'Método de pago inválido.');
      end if;
      v_amount := app_private.json_int(v_it -> 'amount');
      if v_amount is null then
        perform app_private.fail('invalid', 'Monto de pago inválido.');
      end if;
      continue when v_amount <= 0;
      if v_method = 'cash' then
        v_cash := v_cash + v_amount;
      else
        v_non_cash := v_non_cash + v_amount;
        v_payments := v_payments || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'method', v_method,
          'amount', v_amount,
          'reference', nullif(btrim(v_it ->> 'reference'), '')
        )));
      end if;
    end loop;

    if v_non_cash > v_total then
      perform app_private.fail('invalid',
        'Tarjeta/transferencia no puede superar el total: no generan vuelto.');
    end if;
    v_pending := v_total - v_non_cash;
    if v_cash < v_pending then
      perform app_private.fail('invalid', 'Monto insuficiente.');
    end if;
    if v_pending > 0 then
      v_payments := v_payments || jsonb_build_array(jsonb_build_object(
        'method', 'cash', 'amount', v_pending, 'tendered', v_cash));
    end if;
    v_change := v_cash - v_pending;
  end if;

  insert into public.sales
    (register_id, cashier_id, customer_name, subtotal, discount_total, tax_total, total,
     payments, change, status)
  values
    (v_reg.id, v_user.id, nullif(btrim(p_customer_name), ''), v_subtotal, v_discount_total,
     v_tax_total, v_total, v_payments, v_change, 'completed')
  returning id into v_sale_id;

  -- El trigger sale_items_decrement_stock descuenta inventario por línea.
  for v_i in 1 .. v_n loop
    insert into public.sale_items
      (sale_id, line_no, variant_id, product_name, variant_label, sku, quantity,
       unit_price, unit_cost, discount, line_total)
    values
      (v_sale_id, v_i, a_variant[v_i], a_name[v_i], a_label[v_i], a_sku[v_i], a_qty[v_i],
       a_price[v_i], a_cost[v_i], a_disc[v_i], a_total[v_i]);
  end loop;

  return app_private.sale_json(v_sale_id);
end;
$$;

-- Anula una venta de la caja abierta y devuelve el stock. Solo admin.
create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles;
  v_register_id uuid;
  v_reg public.cash_registers;
  v_sale public.sales;
  v_item record;
  v_stock integer;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_user := app_private.require_admin();

  select register_id into v_register_id from public.sales where id = p_sale_id;
  if not found then
    perform app_private.fail('not_found', 'Venta no encontrada.');
  end if;

  -- Orden de bloqueo: caja → venta → variantes (igual que create_sale).
  select * into v_reg from public.cash_registers where id = v_register_id for update;
  select * into v_sale from public.sales where id = p_sale_id for update;

  if v_sale.status = 'voided' then
    perform app_private.fail('invalid', 'La venta ya estaba anulada.');
  end if;
  if v_reason = '' then
    perform app_private.fail('invalid', 'Indica el motivo de la anulación.');
  end if;
  if v_reg.id is null or v_reg.status <> 'open' then
    perform app_private.fail('register_closed', 'Solo se pueden anular ventas de la caja abierta.');
  end if;

  update public.sales set
    status = 'voided',
    voided_at = now(),
    voided_by = v_user.id,
    void_reason = v_reason
  where id = p_sale_id;

  for v_item in
    select i.variant_id, i.quantity
    from public.sale_items i
    where i.sale_id = p_sale_id
    order by i.variant_id, i.line_no
  loop
    update public.product_variants
       set stock = stock + v_item.quantity
     where id = v_item.variant_id
    returning stock into v_stock;
    if found then
      insert into public.inventory_movements
        (variant_id, type, quantity, stock_after, reference_id, note, created_by)
      values
        (v_item.variant_id, 'void', v_item.quantity, v_stock, p_sale_id, v_reason, v_user.id);
    end if;
  end loop;

  return app_private.sale_json(p_sale_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de funciones
-- -----------------------------------------------------------------------------

revoke all on all functions in schema app_private from public, anon, authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.save_category(uuid, text, integer) from public, anon;
revoke execute on function public.save_product(jsonb) from public, anon;
revoke execute on function public.reserve_barcode_sequence(integer) from public, anon;
revoke execute on function public.adjust_stock(uuid, integer, text, text) from public, anon;
revoke execute on function public.open_register(bigint) from public, anon;
revoke execute on function public.close_register(uuid, bigint, text) from public, anon;
revoke execute on function public.add_cash_movement(uuid, text, bigint, text) from public, anon;
revoke execute on function public.create_sale(uuid, jsonb, jsonb, jsonb, text) from public, anon;
revoke execute on function public.void_sale(uuid, text) from public, anon;

grant execute on function public.save_category(uuid, text, integer) to authenticated;
grant execute on function public.save_product(jsonb) to authenticated;
grant execute on function public.reserve_barcode_sequence(integer) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated;
grant execute on function public.open_register(bigint) to authenticated;
grant execute on function public.close_register(uuid, bigint, text) to authenticated;
grant execute on function public.add_cash_movement(uuid, text, bigint, text) to authenticated;
grant execute on function public.create_sale(uuid, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;

revoke all on sequence public.sale_number_seq, public.barcode_seq from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Permisos de tablas + Row Level Security
-- -----------------------------------------------------------------------------

-- TRUNCATE ignora RLS: nadie desde la API.
revoke truncate on
  public.app_settings, public.profiles, public.categories, public.products,
  public.product_variants, public.cash_registers, public.cash_movements,
  public.sales, public.sale_items, public.inventory_movements
from anon, authenticated;

-- Anónimos: nada de escritura.
revoke insert, update, delete on
  public.app_settings, public.profiles, public.categories, public.products,
  public.product_variants, public.cash_registers, public.cash_movements,
  public.sales, public.sale_items, public.inventory_movements
from anon;

-- Ventas, caja e inventario solo cambian por RPC.
revoke insert, update, delete on
  public.cash_registers, public.cash_movements, public.sales,
  public.sale_items, public.inventory_movements
from authenticated;

-- Perfiles: se crean por trigger; el admin solo edita nombre, rol y estado.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, role, active) on public.profiles to authenticated;

-- Variantes: el stock solo cambia por RPC (deja movimiento de inventario).
revoke insert, update on public.product_variants from authenticated;
grant insert (id, product_id, sku, barcode, size, color, price, cost, min_stock, active)
  on public.product_variants to authenticated;
grant update (sku, barcode, size, color, price, cost, min_stock, active)
  on public.product_variants to authenticated;

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.cash_registers enable row level security;
alter table public.cash_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.inventory_movements enable row level security;

-- app_settings
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated using (true);
drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Catálogo: lectura para todos los autenticados, escritura solo admin.
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated using (true);
drop policy if exists categories_admin_insert on public.categories;
create policy categories_admin_insert on public.categories
  for insert to authenticated with check (public.is_admin());
drop policy if exists categories_admin_update on public.categories;
create policy categories_admin_update on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists categories_admin_delete on public.categories;
create policy categories_admin_delete on public.categories
  for delete to authenticated using (public.is_admin());

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated using (true);
drop policy if exists products_admin_insert on public.products;
create policy products_admin_insert on public.products
  for insert to authenticated with check (public.is_admin());
drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists products_admin_delete on public.products;
create policy products_admin_delete on public.products
  for delete to authenticated using (public.is_admin());

drop policy if exists product_variants_select on public.product_variants;
create policy product_variants_select on public.product_variants
  for select to authenticated using (true);
drop policy if exists product_variants_admin_insert on public.product_variants;
create policy product_variants_admin_insert on public.product_variants
  for insert to authenticated with check (public.is_admin());
drop policy if exists product_variants_admin_update on public.product_variants;
create policy product_variants_admin_update on public.product_variants
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists product_variants_admin_delete on public.product_variants;
create policy product_variants_admin_delete on public.product_variants
  for delete to authenticated using (public.is_admin());

-- Ventas, caja e inventario: solo lectura (las escrituras van por RPC).
drop policy if exists cash_registers_select on public.cash_registers;
create policy cash_registers_select on public.cash_registers
  for select to authenticated using (true);
drop policy if exists cash_movements_select on public.cash_movements;
create policy cash_movements_select on public.cash_movements
  for select to authenticated using (true);
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales
  for select to authenticated using (true);
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items
  for select to authenticated using (true);
drop policy if exists inventory_movements_select on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Storage: imágenes de productos (lectura pública, escritura admin)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
  for select to public using (bucket_id = 'product-images');
drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());
