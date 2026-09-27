-- =============================================================================
-- Tienda Coqueta Boutique — datos de ejemplo
--
-- Ejecutar DESPUÉS de schema.sql. Es seguro re-ejecutarlo: las categorías
-- usan ids fijos y los productos solo se cargan si el catálogo está vacío.
-- Los códigos de barras son EAN-13 internos (prefijo 20) con dígito
-- verificador válido, tomados de la secuencia barcode_seq para que los
-- códigos generados luego desde la app no choquen.
-- =============================================================================

insert into public.categories (id, name, sort_order) values
  ('0b8c1a2e-0001-4c00-8000-000000000001', 'Blusas y tops', 1),
  ('0b8c1a2e-0001-4c00-8000-000000000002', 'Vestidos', 2),
  ('0b8c1a2e-0001-4c00-8000-000000000003', 'Pantalones y faldas', 3),
  ('0b8c1a2e-0001-4c00-8000-000000000004', 'Jeans', 4),
  ('0b8c1a2e-0001-4c00-8000-000000000005', 'Calzado', 5),
  ('0b8c1a2e-0001-4c00-8000-000000000006', 'Accesorios', 6),
  ('0b8c1a2e-0001-4c00-8000-000000000007', 'Bolsos', 7)
on conflict (id) do nothing;

do $$
declare
  r record;
  v_product_id uuid;
  v_variant_id uuid;
  v_size text;
  v_color text;
  v_sizes text[];
  v_seq bigint;
  v_stock integer;
  v_n integer := 0;
begin
  if exists (select 1 from public.products) then
    raise notice 'El catálogo ya tiene productos: no se cargan ejemplos.';
    return;
  end if;

  for r in
    select * from (values
      -- nombre, categoría, marca, sku_base, precio, costo, tallas, colores
      ('Blusa de lino', 1, 'Coqueta', 'BLU-LIN', 2450, 1100,
        array['XS','S','M','L','XL'], array['Blanco','Beige','Negro']),
      ('Top de tirantes', 1, 'Coqueta', 'TOP-TIR', 1500, 600,
        array['S','M','L'], array['Negro','Rosa']),
      ('Camisa oversize', 1, 'Urbana', 'CAM-OVE', 2890, 1300,
        array['S','M','L','XL'], array['Celeste','Blanco']),
      ('Vestido midi floral', 2, 'Bella', 'VES-MID', 4590, 2100,
        array['S','M','L'], array['Azul','Rosa']),
      ('Vestido satinado', 2, 'Bella', 'VES-SAT', 5490, 2600,
        array['XS','S','M','L'], array['Champán','Negro']),
      ('Pantalón palazzo', 3, 'Bella', 'PAN-PAL', 3490, 1500,
        array['XS','S','M','L','XL'], array['Negro','Beige']),
      ('Falda plisada', 3, 'Coqueta', 'FAL-PLI', 2790, 1150,
        array['S','M','L'], array['Negro','Rosa','Verde']),
      ('Jean wide leg', 4, 'Denim Co', 'JEA-WID', 4290, 1950,
        array['XS','S','M','L','XL'], array['Azul','Negro']),
      ('Aretes dorados', 6, 'Brillo', 'ARE-DOR', 890, 250,
        null::text[], array['Dorado','Plateado']),
      ('Bolso tote', 7, 'Coqueta', 'BOL-TOT', 3990, 1700,
        null::text[], array['Negro','Camel'])
    ) as t(name, cat, brand, sku_base, price, cost, sizes, colors)
  loop
    insert into public.products
      (category_id, name, brand, description, sku_base, base_price, base_cost, active)
    values (
      ('0b8c1a2e-0001-4c00-8000-00000000000' || r.cat)::uuid,
      r.name, r.brand, null, r.sku_base, r.price, r.cost, true
    )
    returning id into v_product_id;

    v_sizes := coalesce(r.sizes, array[null::text]);
    foreach v_size in array v_sizes loop
      foreach v_color in array r.colors loop
        v_n := v_n + 1;
        v_seq := nextval('public.barcode_seq');
        v_stock := 2 + (v_n * 7) % 9;  -- 2..10, determinista
        insert into public.product_variants
          (product_id, sku, barcode, size, color, price, cost, stock, min_stock, active, created_at)
        values (
          v_product_id,
          concat_ws('-', r.sku_base, v_size,
            upper(left(translate(v_color, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'), 3))),
          app_private.internal_ean13(v_seq),
          v_size, v_color, null, null, v_stock, 3, true, clock_timestamp()
        )
        returning id into v_variant_id;

        insert into public.inventory_movements
          (variant_id, type, quantity, stock_after, reference_id, note, created_by)
        values (v_variant_id, 'initial', v_stock, v_stock, null, 'Inventario inicial', null);
      end loop;
    end loop;
  end loop;

  raise notice 'Catálogo de ejemplo cargado: % variantes.', v_n;
end;
$$;
