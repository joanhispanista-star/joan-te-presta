-- ===========================================================================
-- Joan te presta · socios — base para que el cliente vea su historial
--
-- CÓMO CORRERLO (una sola vez):
--   1. Entrá a supabase.com y creá un proyecto NUEVO para esto. No reutilices
--      el de los juegos: esa llave anon ya anda pegada en páginas públicas.
--   2. En el menú de la izquierda: SQL Editor → New query.
--   3. Pegá TODO este archivo y dale Run.
--   4. Cambiá la clave de sincronización en la última línea (la de verdad,
--      larga, la que solo sabés vos) y volvé a darle Run a esa línea sola.
--   5. Copiá de Settings → API: la Project URL y la llave "anon public".
--      Esas dos van en el CRM (Ajustes → Compartir con mis clientes).
--
-- CÓMO QUEDA PROTEGIDO
--   Las tablas tienen RLS prendido y CERO políticas: con la llave anon (que es
--   pública, va dentro de la página) no se puede leer ni escribir ni una fila.
--   Lo único que se puede llamar son las dos funciones de abajo:
--     · historial_socio(cédula, últimos 4 del cel) → devuelve UN socio.
--     · sincronizar_socios(clave, lote)           → solo con tu clave.
--   La llave anon sola no sirve para sacar la lista de tus clientes.
-- ===========================================================================

-- ---------------------------------------------------------------- tablas ---

create table if not exists public.socios_historial (
  cedula          text primary key,
  tel4            text        not null,   -- últimos 4 dígitos del celular
  nombre          text        not null,
  datos           jsonb       not null,   -- garantía, nivel, créditos, pagos
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.config_privada (
  clave text primary key,
  valor text not null
);

alter table public.socios_historial enable row level security;
alter table public.config_privada  enable row level security;

-- Sin políticas = nadie entra directo. Y por si acaso, se quitan los permisos.
revoke all on public.socios_historial from anon, authenticated;
revoke all on public.config_privada  from anon, authenticated;

-- ------------------------------------------------------------- funciones ---

-- Solo dígitos, para que dé igual si escriben 52.111.222 o 52111222.
create or replace function public.solo_digitos(t text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(t, ''), '\D', '', 'g')
$$;

-- LECTURA: el cliente entra con su cédula y los últimos 4 de su celular.
create or replace function public.historial_socio(p_cedula text, p_tel4 text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.socios_historial;
begin
  select * into r
    from public.socios_historial
   where cedula = public.solo_digitos(p_cedula)
     and tel4   = right(public.solo_digitos(p_tel4), 4);

  if not found then
    -- Freno al tanteo: cada intento fallido cuesta.
    perform pg_sleep(0.3);
    return null;
  end if;

  return jsonb_build_object(
    'nombre',         r.nombre,
    'datos',          r.datos,
    'actualizado_en', r.actualizado_en
  );
end
$$;

-- ESCRITURA: solo desde el CRM de Joan, con su clave.
create or replace function public.sincronizar_socios(p_clave text, p_lote jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  esperado text;
  item     jsonb;
  n        integer := 0;
begin
  select valor into esperado from public.config_privada where clave = 'clave_sync';

  if esperado is null or p_clave is null or length(p_clave) < 12
     or p_clave <> esperado then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  for item in select * from jsonb_array_elements(p_lote) loop
    -- Un socio sin cédula o sin celular no se puede identificar: se salta.
    continue when public.solo_digitos(item->>'cedula') = ''
              or public.solo_digitos(item->>'telefono') = '';

    insert into public.socios_historial (cedula, tel4, nombre, datos, actualizado_en)
    values (
      public.solo_digitos(item->>'cedula'),
      right(public.solo_digitos(item->>'telefono'), 4),
      coalesce(item->>'nombre', 'Socio'),
      coalesce(item->'datos', '{}'::jsonb),
      now()
    )
    on conflict (cedula) do update
      set tel4           = excluded.tel4,
          nombre         = excluded.nombre,
          datos          = excluded.datos,
          actualizado_en = now();

    n := n + 1;
  end loop;

  return n;
end
$$;

-- BORRAR un socio de la nube (si pide que le quiten los datos).
create or replace function public.olvidar_socio(p_clave text, p_cedula text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare esperado text; n integer;
begin
  select valor into esperado from public.config_privada where clave = 'clave_sync';
  if esperado is null or p_clave is null or p_clave <> esperado then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  delete from public.socios_historial where cedula = public.solo_digitos(p_cedula);
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------- grants ---

revoke all on function public.historial_socio(text, text)      from public;
revoke all on function public.sincronizar_socios(text, jsonb)  from public;
revoke all on function public.olvidar_socio(text, text)        from public;

grant execute on function public.historial_socio(text, text)     to anon;
grant execute on function public.sincronizar_socios(text, jsonb) to anon;
grant execute on function public.olvidar_socio(text, text)       to anon;

-- ----------------------------------------------------------------- clave ---
-- ⚠️ CAMBIALA. Mínimo 12 caracteres. Es la que vas a escribir en el CRM.

insert into public.config_privada (clave, valor)
values ('clave_sync', 'CAMBIA-ESTA-CLAVE-YA-2026')
on conflict (clave) do update set valor = excluded.valor;
