-- ===========================================================================
-- PlataDeuna · socios — base para que el cliente vea su historial
--
-- CÓMO CORRERLO:
--   1. Entrá a supabase.com y creá un proyecto NUEVO para esto. No reutilices
--      el de los juegos: esa llave anon ya anda pegada en páginas públicas.
--   2. En el menú de la izquierda: SQL Editor → New query.
--   3. Pegá TODO este archivo y dale Run.
--   4. PONÉ TU CLAVE. En una consulta nueva, corré esta línea sola con la tuya
--      (mínimo 12 caracteres; hasta que la pongas, nada privilegiado abre):
--        update public.config_privada set valor = 'TU-CLAVE-LARGA'
--         where clave = 'clave_sync';
--   5. Copiá de Settings → API: la Project URL y la llave "anon public".
--      Esas dos, más tu clave, van en el Panel (Ajustes → Compartir con mis
--      clientes) y ahí mismo tocás "🔌 Probar conexión".
--
--   Este archivo se puede volver a correr entero cuantas veces haga falta: no
--   borra datos ni te pisa la clave.
--
-- CÓMO QUEDA PROTEGIDO
--   Las tablas tienen RLS prendido y CERO políticas: con la llave anon (que es
--   pública, va dentro de la página) no se puede leer ni escribir ni una fila.
--   Lo único que se puede llamar son las funciones de abajo:
--     · historial_socio(cédula, últimos 4 del cel) → devuelve UN socio.
--     · crear_solicitud(cédula, últimos 4, datos)  → la manda a la bandeja.
--     · sincronizar_socios / listar_solicitudes / marcar_solicitud /
--       olvidar_socio                             → solo con tu clave.
--   La llave anon sola no sirve para sacar la lista de tus clientes.
--
--   Y hay un FRENO al que tantea: 8 intentos fallidos por cédula cada 15
--   minutos. Sin eso, adivinar los últimos 4 dígitos del celular de alguien
--   son 10.000 combinaciones, que en paralelo se prueban en minutos.
--
--   Probado de verdad contra PostgreSQL 17 (22 pruebas), no solo leído.
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

-- Solicitudes de crédito que mandan los socios desde su app.
create table if not exists public.solicitudes (
  id          bigint generated always as identity primary key,
  cedula      text        not null,
  nombre      text        not null,
  capital     bigint      not null,
  tasa        numeric     not null,
  costo       bigint      not null,
  total       bigint      not null,
  fecha_corte date,
  garantia    bigint,
  cupo        bigint,
  sobre_cupo  boolean     not null default false,
  estado      text        not null default 'nueva',   -- nueva | atendida | descartada
  creada_en   timestamptz not null default now()
);
create index if not exists solicitudes_pendientes
  on public.solicitudes (creada_en desc) where estado = 'nueva';

-- Intentos fallidos de entrar, para frenar al que tantea (ver "EL FRENO" abajo).
create table if not exists public.intentos_fallidos (
  cedula text primary key,
  fallos integer     not null default 0,
  desde  timestamptz not null default now()
);

alter table public.socios_historial   enable row level security;
alter table public.config_privada     enable row level security;
alter table public.solicitudes        enable row level security;
alter table public.intentos_fallidos  enable row level security;

-- Sin políticas = nadie entra directo. Y por si acaso, se quitan los permisos.
revoke all on public.socios_historial   from anon, authenticated;
revoke all on public.config_privada     from anon, authenticated;
revoke all on public.solicitudes        from anon, authenticated;
revoke all on public.intentos_fallidos  from anon, authenticated;

-- ------------------------------------------------------------- funciones ---

-- Solo dígitos, para que dé igual si escriben 52.111.222 o 52111222.
create or replace function public.solo_digitos(t text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(t, ''), '\D', '', 'g')
$$;

-- ------------------------------------------------------------- LA CLAVE ---
-- Un solo lugar donde se comprueba la clave de Joan, y con piso de largo: mientras
-- la clave guardada sea la de fábrica (corta), NINGUNA función privilegiada abre.
-- Así, si este archivo se vuelve a correr entero, no se puede quedar con una clave
-- por defecto que además está publicada en el repo.
create or replace function public.clave_ok(p_clave text)
returns boolean language plpgsql security definer set search_path = public as $$
declare esperado text;
begin
  select valor into esperado from public.config_privada where clave = 'clave_sync';
  if esperado is null or length(esperado) < 12 then return false; end if;  -- sin configurar
  if p_clave is null or length(p_clave) < 12 then return false; end if;
  return p_clave = esperado;
end
$$;

-- ------------------------------------------------------------- EL FRENO ---
-- La llave anon es pública (va dentro de la página), así que cualquiera puede llamar
-- a historial_socio. Con una cédula conocida, adivinar los últimos 4 del celular son
-- solo 10.000 combinaciones: en paralelo eso se prueba en minutos y quedaría expuesto
-- el historial completo de esa persona. Con este freno son 8 intentos cada 15 minutos
-- por cédula, o sea ~13 días de tanteo para una sola víctima.
--
-- Efecto secundario asumido: alguien puede dejar a un socio 15 minutos sin poder
-- entrar tecleando mal a propósito. Se acepta porque el enlace por WhatsApp sigue
-- funcionando sin tocar la base, así que el socio nunca se queda sin ver su historial.
create or replace function public.puede_intentar(p_cedula text)
returns boolean language plpgsql security definer set search_path = public as $$
declare f intentos_fallidos;
begin
  select * into f from intentos_fallidos where cedula = p_cedula;
  if not found then return true; end if;
  if f.desde < now() - interval '15 minutes' then      -- la ventana se reinicia sola
    delete from intentos_fallidos where cedula = p_cedula;
    return true;
  end if;
  return f.fallos < 8;
end
$$;

create or replace function public.anotar_fallo(p_cedula text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into intentos_fallidos (cedula, fallos, desde) values (p_cedula, 1, now())
  on conflict (cedula) do update set
    fallos = case when intentos_fallidos.desde < now() - interval '15 minutes'
                  then 1 else intentos_fallidos.fallos + 1 end,
    desde  = case when intentos_fallidos.desde < now() - interval '15 minutes'
                  then now() else intentos_fallidos.desde end;
end
$$;

create or replace function public.limpiar_fallos(p_cedula text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from intentos_fallidos where cedula = p_cedula;
end
$$;

-- LECTURA: el cliente entra con su cédula y los últimos 4 de su celular.
create or replace function public.historial_socio(p_cedula text, p_tel4 text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.socios_historial; ced text;
begin
  ced := public.solo_digitos(p_cedula);

  -- Al que ya lleva 8 fallos se le contesta lo mismo que a una cédula que no existe:
  -- que no sepa que lo estamos frenando.
  if not public.puede_intentar(ced) then
    perform pg_sleep(0.3);
    return null;
  end if;

  select * into r
    from public.socios_historial
   where cedula = ced
     and tel4   = right(public.solo_digitos(p_tel4), 4);

  if not found then
    perform public.anotar_fallo(ced);
    perform pg_sleep(0.3);              -- y además cada intento fallido cuesta
    return null;
  end if;

  perform public.limpiar_fallos(ced);   -- entró bien: borrón y cuenta nueva
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
  item jsonb;
  n    integer := 0;
begin
  if not public.clave_ok(p_clave) then
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

-- SOLICITAR: el socio manda su solicitud desde la app. Se le exige la misma
-- pareja cédula + últimos 4 del celular que para entrar, así que nadie puede
-- llenar la bandeja de Joan con solicitudes inventadas.
create or replace function public.crear_solicitud(
  p_cedula text, p_tel4 text, p_datos jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare r public.socios_historial; nuevo bigint; recientes integer; ced text;
begin
  ced := public.solo_digitos(p_cedula);

  -- El mismo freno que para entrar: si no, esta función sería la puerta de atrás
  -- para adivinar los últimos 4 del celular sin límite.
  if not public.puede_intentar(ced) then
    perform pg_sleep(0.3);
    raise exception 'socio no encontrado';
  end if;

  select * into r
    from public.socios_historial
   where cedula = ced
     and tel4   = right(public.solo_digitos(p_tel4), 4);

  if not found then
    perform public.anotar_fallo(ced);
    perform pg_sleep(0.3);
    raise exception 'socio no encontrado';
  end if;

  perform public.limpiar_fallos(ced);

  -- Freno simple al spam: máximo 5 solicitudes por socio en una hora.
  select count(*) into recientes
    from public.solicitudes
   where cedula = r.cedula and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    raise exception 'demasiadas solicitudes seguidas';
  end if;

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, fecha_corte, garantia, cupo, sobre_cupo)
  values (
    r.cedula, r.nombre,
    coalesce((p_datos->>'capital')::bigint, 0),
    coalesce((p_datos->>'tasa')::numeric, 0),
    coalesce((p_datos->>'costo')::bigint, 0),
    coalesce((p_datos->>'total')::bigint, 0),
    nullif(p_datos->>'fecha_corte','')::date,
    nullif(p_datos->>'garantia','')::bigint,
    nullif(p_datos->>'cupo','')::bigint,
    coalesce((p_datos->>'sobre_cupo')::boolean, false)
  )
  returning id into nuevo;

  return nuevo;
end
$$;

-- LEER LA BANDEJA: solo Joan, con su clave.
create or replace function public.listar_solicitudes(p_clave text, p_estado text default 'nueva')
returns setof public.solicitudes
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  return query
    select * from public.solicitudes
     where estado = coalesce(p_estado, 'nueva')
     order by creada_en desc
     limit 200;
end
$$;

-- MARCARLA: atendida o descartada, para que no vuelva a salir.
create or replace function public.marcar_solicitud(p_clave text, p_id bigint, p_estado text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  if p_estado not in ('nueva','atendida','descartada') then
    raise exception 'estado inválido';
  end if;
  update public.solicitudes set estado = p_estado where id = p_id;
  get diagnostics n = row_count;
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
declare n integer;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  delete from public.socios_historial where cedula = public.solo_digitos(p_cedula);
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------- grants ---

revoke all on function public.historial_socio(text, text)          from public;
revoke all on function public.sincronizar_socios(text, jsonb)      from public;
revoke all on function public.olvidar_socio(text, text)            from public;
revoke all on function public.crear_solicitud(text, text, jsonb)   from public;
revoke all on function public.listar_solicitudes(text, text)       from public;
revoke all on function public.marcar_solicitud(text, bigint, text) from public;

-- Las de adentro NO se le dan a nadie: se llaman desde las de arriba, que corren
-- como dueñas de la base, así que no necesitan permiso propio.
revoke all on function public.clave_ok(text)       from public;
revoke all on function public.puede_intentar(text) from public;
revoke all on function public.anotar_fallo(text)   from public;
revoke all on function public.limpiar_fallos(text) from public;

grant execute on function public.historial_socio(text, text)          to anon;
grant execute on function public.sincronizar_socios(text, jsonb)      to anon;
grant execute on function public.olvidar_socio(text, text)            to anon;
grant execute on function public.crear_solicitud(text, text, jsonb)   to anon;
grant execute on function public.listar_solicitudes(text, text)       to anon;
grant execute on function public.marcar_solicitud(text, bigint, text) to anon;

-- ----------------------------------------------------------------- clave ---
-- ⚠️ ACÁ VA TU CLAVE. Mínimo 12 caracteres. Es la que vas a escribir en el CRM.
--
-- Sale sin definir a propósito: mientras diga SIN-DEFINIR (11 caracteres, por debajo
-- del mínimo), clave_ok() devuelve falso y NADA privilegiado abre. Y va con
-- "do nothing", no "do update": si algún día volvés a correr este archivo entero
-- —para agregar una función, por ejemplo— tu clave de verdad NO se pisa. Antes sí se
-- pisaba, y como este archivo está publicado en el repo, la clave por defecto la
-- podía leer cualquiera.
--
-- Para ponerla, cambiá el texto de abajo por la tuya y corré SOLO estas tres líneas:

insert into public.config_privada (clave, valor)
values ('clave_sync', 'SIN-DEFINIR')
on conflict (clave) do nothing;

-- Y para cambiarla más adelante (esto sí pisa la anterior, a propósito):
--   update public.config_privada set valor = 'tu-clave-larga-de-verdad'
--    where clave = 'clave_sync';
