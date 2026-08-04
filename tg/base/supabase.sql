-- ===========================================================================
-- Tu Garantía · socios — base para que el cliente vea su historial
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
--     · canjear_invitacion(código, cédula, cel, nombre) → canjea UN código y
--       deja una solicitud de ingreso. No crea ningún socio: eso lo hacés vos.
--     · sincronizar_socios / listar_solicitudes / marcar_solicitud /
--       olvidar_socio / crear_invitaciones / listar_invitaciones /
--       anular_invitacion / listar_registros / marcar_registro
--                                                  → solo con tu clave.
--   La llave anon sola no sirve para sacar la lista de tus clientes, ni la de
--   tus códigos de invitación.
--
--   Y hay un FRENO al que tantea: 8 intentos fallidos por cédula cada 15
--   minutos. Sin eso, adivinar los últimos 4 dígitos del celular de alguien
--   son 10.000 combinaciones, que en paralelo se prueban en minutos. El canje
--   de códigos lleva su propio contador, aparte, por el mismo motivo. Y desde
--   el 2-ago-2026 tu clave también lleva el suyo: 10 intentos cada 15 minutos,
--   contra los millones por día que se podían tirar antes.
--
--   Probado de verdad contra PostgreSQL 17 (22 pruebas), no solo leído. Lo que
--   se agregó el 2-ago-2026 (invitaciones, registros y los dos arreglos de
--   frenos) todavía no: al final del archivo está la lista de lo que hay que
--   probarle.
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

-- --------------------------------------------- invitaciones (2-ago-2026) ---
-- Nadie crea cuenta solo. Joan manda un código y sin ese código no se entra.
-- Un código sirve para UNA persona.
--
-- El código se guarda EXACTAMENTE con la forma que le da el motor:
-- 'TG-XXXX-XXXX', en mayúsculas y con los dos guiones. Una sola forma
-- canónica en los tres lados (motor, Panel y nube), así nunca hay que adivinar
-- si el de la base lleva guiones o no. Lo que teclee el socio —minúsculas, sin
-- guiones, con espacios, la letra O en vez del cero— lo endereza
-- codigo_invitacion_normalizado() antes de comparar, igual que el motor.
create table if not exists public.invitaciones (
  codigo           text primary key,                     -- 'TG-XXXX-XXXX'
  nota             text,                                 -- para quién es, lo escribe Joan
  estado           text        not null default 'nueva', -- nueva | usada | anulada
  creada_en        timestamptz not null default now(),
  vence_en         date,                                 -- null = no vence nunca
  usada_en         timestamptz,
  usada_por_cedula text
);
create index if not exists invitaciones_sin_usar
  on public.invitaciones (creada_en desc) where estado = 'nueva';

-- ------------------------------------------------ registros (2-ago-2026) ---
-- Lo que manda el que canjeó un código. NO es un socio todavía: es una
-- solicitud de ingreso que Joan mira y aprueba a mano en el Panel. Por eso vive
-- aparte de socios_historial: nada de lo que llega de la calle entra derecho a
-- la tabla que después leen los clientes.
create table if not exists public.registros (
  id        bigint generated always as identity primary key,
  codigo    text        not null,                    -- el código que canjeó
  cedula    text        not null,
  nombre    text        not null,
  telefono  text        not null,
  datos     jsonb       not null default '{}'::jsonb,
  estado    text        not null default 'nuevo',    -- nuevo | atendido | descartado
  creado_en timestamptz not null default now()
);
create index if not exists registros_pendientes
  on public.registros (creado_en desc) where estado = 'nuevo';

-- Las dos nuevas, con el mismo cerrojo doble que las otras cuatro: RLS prendido
-- y CERO políticas (nadie entra directo), más el revoke por si Supabase le
-- regala permisos a anon sobre las tablas nuevas del esquema public.
alter table public.invitaciones enable row level security;
alter table public.registros    enable row level security;

revoke all on public.invitaciones from anon, authenticated;
revoke all on public.registros    from anon, authenticated;

-- --------------------------------- el préstamo con garantía (2-ago-2026) ---
-- El producto nuevo viaja en el mismo jsonb del socio (datos->'respaldados'),
-- así que socios_historial NO cambia. Lo único que necesita columnas es la
-- bandeja de solicitudes, para que Joan sepa qué le están pidiendo: si el
-- crédito quincenal de siempre (20% hasta el corte) o el préstamo con garantía
-- (5% al mes, de 1 a 6 meses).
--
-- Van con default y "if not exists" para que se puedan agregar sobre una base
-- que ya tiene solicitudes adentro sin tocar ni una fila vieja: las que ya
-- estaban quedan como 'quincenal', que es lo que efectivamente eran.
alter table public.solicitudes add column if not exists producto    text not null default 'quincenal';
alter table public.solicitudes add column if not exists plazo_meses integer;

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
--
-- ---------------------------------------- EL FRENO DE LA CLAVE (2-ago-2026) ---
-- Esta era la única puerta del archivo sin contador. Tenía un pg_sleep(1) y nada
-- más, y un pg_sleep no frena: retiene UNA conexión un segundo, no pone en fila a
-- las otras. Con la llave anon (pública, va dentro de socio.html) se abren 40
-- conexiones a la vez contra listar_solicitudes probando claves y salen ~40
-- pruebas por segundo, unos 3 millones por día, sin que nada las cuente ni las
-- corte. Y esta es LA puerta: con la clave adentro se leen los nombres y cédulas
-- de todos los clientes, todos los códigos de invitación vivos, y sincronizar_socios
-- deja reescribir el historial de cualquiera.
--
-- POR QUÉ ACÁ NO SIRVE LA TABLA intentos_fallidos QUE USA EL RESTO
-- Porque las nueve funciones privilegiadas hacen lo mismo: si la clave no cierra,
-- lanzan "raise exception 'clave de sincronización incorrecta'". Y una excepción en
-- PostgreSQL cancela la transacción ENTERA y deshace todo lo que se escribió adentro
-- (es exactamente el mismo problema que tenía crear_solicitud, ver el comentario
-- largo allá abajo). Si el fallo se anotara en una tabla, ese mismo raise lo
-- borraría medio segundo después y el contador viviría clavado en cero.
--
-- Allá se pudo arreglar devolviendo null en vez de lanzar. Acá no: si estas
-- funciones dejaran de lanzar el error, el Panel de Joan no tendría cómo saber que
-- la clave está mal (listar_solicitudes devolvería una lista vacía, que es lo mismo
-- que "no hay solicitudes") y el aviso de Ajustes → Probar conexión, que hoy le
-- explica qué corregir, se quedaría mudo.
--
-- LA SOLUCIÓN: UNA SECUENCIA, que es lo único que en PostgreSQL NO se revierte
-- Una secuencia es el contador que usa la base para numerar filas. Está hecha a
-- propósito para que dos pedidos simultáneos nunca se pisen, y para lograrlo vive
-- FUERA de la transacción: lo que le sumás con nextval() queda sumado aunque
-- después todo se cancele. Es justo la propiedad que hace falta acá. Y lo mismo
-- vale para setval(), que es como se la reencuadra y se la vuelve a cero.
--
-- CÓMO SE GUARDA LA VENTANA DE 15 MINUTOS EN UN SOLO NÚMERO
-- Una secuencia guarda un número y nada más: no tiene dónde anotar una fecha. Así
-- que la fecha va DENTRO del número. Se parte el tiempo en casilleros fijos de 15
-- minutos (900 segundos) y se guarda "casillero" y "cuántos intentos van" pegados:
--
--        1984416000000007
--        └casillero┘└intentos┘
--
-- 1984416 es el casillero (los segundos desde 1970 divididos por 900, o sea el
-- cuarto de hora en que estamos) y 7 es el séptimo intento de ese cuarto de hora.
--
-- Cambiar de casillero es cambiar los dígitos de la izquierda, y ahí la cuenta de
-- la derecha arranca sola de nuevo. No hay nada que limpiar ni ningún proceso que
-- tenga que correr: los 15 minutos se cumplen solos porque los mide el reloj.
create sequence if not exists public.freno_clave;

create or replace function public.clave_ok(p_clave text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  esperado text;
  casillero bigint;
  marca     bigint;
  intentos  bigint;
begin
  -- En qué casillero de 15 minutos estamos. Va con clock_timestamp() —la hora de
  -- verdad del reloj— y NO con now(), que en PostgreSQL es la hora en que arrancó
  -- la transacción y queda congelada mientras dure. Con now(), alguien que abriera
  -- una sola transacción larga se quedaría para siempre en el casillero viejo y
  -- reencuadraría el contador a 1 en cada tiro: el freno no frenaría nada.
  casillero := floor(extract(epoch from clock_timestamp()) / 900)::bigint;

  -- Este intento se anota ANTES de mirar la clave, y se anota acá, donde ninguna
  -- excepción posterior lo puede borrar.
  marca := nextval('public.freno_clave');
  if marca / 1000000000 <> casillero then
    -- Venimos de un casillero viejo (o es el primer intento de la vida): se
    -- reencuadra y la cuenta empieza en 1. setval tampoco se revierte.
    marca := casillero * 1000000000 + 1;
    perform setval('public.freno_clave', marca);
  end if;
  intentos := marca % 1000000000;   -- mil millones de intentos en 15 minutos no
                                    -- los hace nadie: el casillero nunca se desborda

  -- Pasado el tope no se mira ni la clave. 10 y no 8 como el resto del archivo
  -- porque una sola pantalla del Panel puede pedir dos o tres cosas seguidas, y
  -- con 8 un par de refrescos con la clave mal tecleada ya lo dejaban afuera.
  if intentos > 10 then
    return false;
  end if;

  select valor into esperado from public.config_privada where clave = 'clave_sync';
  if esperado is null or length(esperado) < 12 then return false; end if;  -- sin configurar
  if p_clave is null or length(p_clave) < 12 then return false; end if;
  if p_clave <> esperado then return false; end if;

  -- Clave buena: el mostrador vuelve a cero, así que Joan trabajando normal nunca
  -- se acerca al tope. Solo se acumulan los intentos que no aciertan.
  perform setval('public.freno_clave', casillero * 1000000000);
  return true;
end
$$;

-- Lo que se acepta a cambio, igual que en los otros dos frenos: alguien que tire
-- 11 claves inventadas cada 15 minutos deja a Joan sin nube mientras lo haga. Se
-- banca por dos razones. Una, el Panel corre entero en el navegador de Joan: la
-- nube es solo el espejo que leen los socios, así que él sigue registrando
-- créditos y cobros como siempre y la sincronización se pone al día después. Y
-- dos, la alternativa es dejar la puerta abierta a 3 millones de pruebas por día
-- contra la clave que abre TODO. Entre quedarse sin espejo un rato y que le lean
-- la lista de clientes, no hay discusión.

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
--
-- 2-ago-2026: suma dos parámetros al final, producto y plazo, los dos CON
-- DEFAULT, para que una app vieja que llame con tres argumentos siga andando.
--
-- OJO con este drop, que parece de más y no lo es: "create or replace" con una
-- lista de argumentos distinta NO reemplaza nada, crea una función aparte. Si
-- quedaran las dos —la de 3 argumentos y la de 5 con defaults—, llamarla con 3
-- se cae con "function is not unique", porque PostgreSQL no sabe cuál querés.
-- Se tira la vieja y queda una sola. No borra ni una fila: una función no
-- guarda datos, y los permisos se vuelven a dar abajo, en la sección de grants.
drop function if exists public.crear_solicitud(text, text, jsonb);

create or replace function public.crear_solicitud(
  p_cedula text, p_tel4 text, p_datos jsonb,
  p_producto text default 'quincenal', p_plazo integer default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare r public.socios_historial; nuevo bigint; recientes integer; ced text;
        prod text; plazo integer;
begin
  -- Los dos productos y nada más. Si llega otra cosa es un error de la app, no
  -- del socio: se corta acá y no se escribe nada.
  prod := coalesce(p_producto, 'quincenal');
  if prod not in ('quincenal', 'respaldado') then
    raise exception 'producto desconocido';
  end if;
  if prod = 'respaldado' then
    -- El préstamo con garantía es de 1 a 6 meses, lo elige el socio.
    if p_plazo is null or p_plazo < 1 or p_plazo > 6 then
      raise exception 'plazo inválido';
    end if;
    plazo := p_plazo;
  else
    plazo := null;              -- el quincenal va hasta el corte: no tiene plazo
  end if;

  ced := public.solo_digitos(p_cedula);

  -- El mismo freno que para entrar: si no, esta función sería la puerta de atrás
  -- para adivinar los últimos 4 del celular sin límite.
  --
  -- ⚠️ POR QUÉ ACÁ SE DEVUELVE NULL Y NO SE LANZA UN ERROR (arreglado 2-ago-2026)
  -- Esto estaba mal y era el peor agujero de todo el proyecto. Antes decía
  -- "anotar el fallo" y en la línea siguiente "raise exception". El problema es
  -- cómo funciona PostgreSQL: cada llamada a una función es UNA transacción, y
  -- una excepción no cancela solo esa línea, cancela la transacción ENTERA y
  -- deshace todo lo que se escribió adentro. O sea que el fallo se anotaba y el
  -- error, medio segundo después, lo borraba. El contador volvía a cero solo, en
  -- cada intento, para siempre: el freno de 8 cada 15 minutos que promete el
  -- comentario de arriba, en esta función NO EXISTÍA.
  --
  -- Lo que eso le costaba a Joan: la llave anon es pública (va escrita dentro de
  -- socio.html). Con la cédula de un cliente —que va impresa en la cédula física
  -- y en cualquier recibo— se podían tirar los 10.000 números posibles de los
  -- últimos 4 dígitos del celular sin que nada los contara, y el que contestara
  -- distinto delataba el par correcto. Con ese par se abre historial_socio y
  -- sale el historial completo de esa persona.
  --
  -- El arreglo es devolver null en vez de lanzar, exactamente como ya hacía
  -- historial_socio (que por eso sí frenaba). Sin excepción no hay cancelación,
  -- la transacción termina bien y el fallo anotado QUEDA ESCRITO. Devolver null
  -- no le cambia nada a la app: socio.html manda esta solicitud y ni siquiera
  -- mira la respuesta (socio.html:1613, un .catch vacío y sin .then), porque el
  -- camino de verdad es el mensaje de WhatsApp. Y hacia afuera null se ve igual
  -- que el "no encontrado" de antes: el que tantea no aprende nada.
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
    perform pg_sleep(0.3);
    return null;                        -- null, NO raise: si no, se borra el fallo
  end if;

  -- Freno simple al spam: máximo 5 solicitudes por socio en una hora.
  --
  -- Este chequeo va ANTES de limpiar los fallos, y es a propósito: cuenta filas
  -- que ya están guardadas de antes, así que no escribe nada y su excepción no
  -- puede borrar ningún contador. Si estuviera al revés —limpiar y después
  -- lanzar— el borrón se desharía igual, y el código estaría diciendo una cosa
  -- y haciendo otra.
  select count(*) into recientes
    from public.solicitudes
   where cedula = r.cedula and creada_en > now() - interval '1 hour';
  if recientes >= 5 then
    raise exception 'demasiadas solicitudes seguidas';
  end if;

  perform public.limpiar_fallos(ced);   -- entró bien: borrón y cuenta nueva

  insert into public.solicitudes
    (cedula, nombre, capital, tasa, costo, total, fecha_corte, garantia, cupo, sobre_cupo,
     producto, plazo_meses)
  values (
    r.cedula, r.nombre,
    coalesce((p_datos->>'capital')::bigint, 0),
    coalesce((p_datos->>'tasa')::numeric, 0),
    coalesce((p_datos->>'costo')::bigint, 0),
    coalesce((p_datos->>'total')::bigint, 0),
    nullif(p_datos->>'fecha_corte','')::date,
    nullif(p_datos->>'garantia','')::bigint,
    nullif(p_datos->>'cupo','')::bigint,
    coalesce((p_datos->>'sobre_cupo')::boolean, false),
    prod, plazo
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

-- --------------------------------------------- LOS CÓDIGOS DE INVITACIÓN ---
-- Un código, una persona. Tiene la forma 'TG-XXXX-XXXX': los 8 caracteres del
-- cuerpo salen del alfabeto Crockford sin confusables (no van la I, la L, la O
-- ni la U, que se confunden con 1, 1, 0 y V cuando alguien dicta el código por
-- WhatsApp). Los 7 primeros son al azar y el 8º es de verificación.
--
-- Esta normalización es la MISMA que la de motor.js (normalizarCodigoInvitacion,
-- L1533), paso por paso y en el mismo orden. Si algún día cambia allá, cambia
-- acá: son las dos mitades de la misma cerradura.
create or replace function public.codigo_invitacion_normalizado(t text)
returns text language sql immutable as $$
  with limpio as (
    -- mayúsculas y afuera todo lo que no sea letra o número (guiones, espacios)
    select regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9]', '', 'g') as x
  ), sin_prefijo as (
    -- el prefijo se saca solo si sobra: un cuerpo que EMPIEZA con TG mide 8 y
    -- se queda entero, uno con prefijo mide 10 y pierde los dos de adelante
    select case when x like 'TG%' and length(x) > 8 then substr(x, 3) else x end as x
      from limpio
  ), cuerpo as (
    -- los confusables que la gente igual va a teclear, y afuera lo que no exista
    -- en el alfabeto (I, L, O y U ya fueron traducidas arriba)
    select regexp_replace(translate(x, 'ILOU', '110V'),
                          '[^0-9A-HJKMNP-TVWXYZ]', '', 'g') as x
      from sin_prefijo
  )
  select case when length(x) = 8
              then 'TG-' || substr(x, 1, 4) || '-' || substr(x, 5, 4) end
    from cuerpo
$$;

-- Un código nuevo. INTERNA: no se le da a nadie, ni siquiera con clave, porque
-- la única forma legítima de pedir códigos es crear_invitaciones(), que además
-- los guarda. Un generador suelto en la puerta solo sirve para hacer ruido.
create or replace function public.codigo_invitacion_nuevo()
returns text language plpgsql security definer set search_path = public as $$
declare
  alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes    bytea;
  cuerpo   text := '';
  i        integer;
  idx      integer;
  suma     integer := 0;
begin
  -- 16 bytes de azar de verdad (gen_random_uuid es criptográfico, random() no).
  bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');

  for i in 0..6 loop
    -- Un byte va de 0 a 255 y 256 es múltiplo exacto de 32, así que este resto
    -- no favorece a ninguna letra: las 32 salen con la misma probabilidad.
    idx    := get_byte(bytes, i) % 32;
    cuerpo := cuerpo || substr(alfabeto, idx + 1, 1);
    suma   := suma + idx * (i + 1);     -- el mismo peso que digitoControlCodigo
  end loop;

  -- El 8º carácter: suma ponderada de los 7 primeros, módulo 32. Es la cuenta
  -- idéntica a la de motor.js L1498; si no diera igual, el celular del socio
  -- rechazaría códigos que la base considera buenos.
  return 'TG-' || substr(cuerpo, 1, 4) || '-' || substr(cuerpo, 5, 3)
                || substr(alfabeto, (suma % 32) + 1, 1);
end
$$;

-- El mismo freno de arriba, pero con el tope a pedido. Es copia de
-- puede_intentar() a propósito: esa está probada y no se toca. Para qué hace
-- falta, en el comentario de canjear_invitacion, punto 1.
create or replace function public.puede_intentar_tope(p_cedula text, p_tope integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare f intentos_fallidos;
begin
  select * into f from intentos_fallidos where cedula = p_cedula;
  if not found then return true; end if;
  if f.desde < now() - interval '15 minutes' then      -- la ventana se reinicia sola
    delete from intentos_fallidos where cedula = p_cedula;
    return true;
  end if;
  return f.fallos < coalesce(p_tope, 8);   -- sin tope, el de siempre
end
$$;

-- CANJEAR: la llama el celular del que se quiere anotar, sin clave. Es la
-- tercera puerta abierta de esta base (con historial_socio y crear_solicitud),
-- así que lleva las mismas dos trabas:
--
--   1. EL FRENO AL QUE TANTEA, y acá hace falta EN DOS NIVELES.
--
--      Un código tiene 32^7 cuerpos posibles, pero eso solo protege si el que
--      prueba paga por cada error. Sin freno, la llave anon es pública y esto
--      sería una máquina de probar códigos a mil por segundo hasta pegarle a
--      uno vivo.
--
--      El primer nivel son los mismos 8 intentos cada 15 minutos del resto del
--      archivo, contados aparte con la cédula prefijada 'inv:'. Aparte porque
--      si compartieran contador, alguien tanteando códigos dejaría al socio 15
--      minutos sin poder ver su historial: son dos puertas distintas y cada una
--      lleva su cuenta.
--
--      Pero por cédula, acá solo, NO alcanza, y es una diferencia con
--      historial_socio que conviene tener clarísima: ahí lo que se adivina son
--      los 4 dígitos DE UNA CÉDULA CONCRETA, así que el que tantea no puede
--      cambiar de cédula sin cambiar de víctima. Acá lo que se adivina es el
--      código, y la cédula la escribe él: le bastaría inventarse una cédula
--      nueva cada 8 tiros para no toparse nunca con el freno. Por eso va el
--      segundo nivel: un contador ÚNICO para todos los canjes, 'inv:*', con el
--      tope mucho más alto (60 cada 15 minutos, o sea ~5.760 por día). Ningún
--      canje de verdad se acerca a ese número —el socio llega con su código
--      bien escrito y entra a la primera—, y el que tantea queda clavado ahí.
--
--      Lo que se acepta a cambio: alguien puede tirar 60 códigos inventados
--      cada 15 minutos y dejar el canje cerrado para todos mientras lo haga.
--      Es la misma contrapartida que ya se aceptó en el freno de entrar, y se
--      banca por lo mismo: la app cae sola al camino de WhatsApp y Joan le abre
--      la cuenta a mano, así que nadie se queda afuera de verdad.
--
--      Y una cosa que acá se hizo bien desde el principio y conviene no romper
--      nunca: ninguna de las salidas de abajo lanza un error. Todas devuelven un
--      jsonb con 'ok' en falso. Tiene que ser así: una excepción en PostgreSQL
--      cancela la transacción ENTERA, o sea que borraría los mismos fallos que
--      se acaban de anotar dos líneas antes y el contador viviría en cero. Es
--      exactamente el agujero que tenía crear_solicitud hasta el 2-ago-2026. Si
--      algún día se toca esta función: se sale devolviendo, nunca lanzando.
--
--   2. QUE UN CÓDIGO NO SE PUEDA USAR DOS VECES, ni con dos pedidos que lleguen
--      en el mismo instante. Eso lo resuelve el update de abajo y nada más: el
--      "where estado = 'nueva'" viaja DENTRO del update, así que Postgres traba
--      la fila y, cuando el segundo pedido consigue el turno, vuelve a mirar la
--      fila ya cambiada, ve que dice 'usada' y actualiza cero filas. El segundo
--      se va con motivo 'usada' sin haber tocado nada. Si en vez de eso se
--      hiciera "select ... si está nueva → update", entre el select y el update
--      cabe el otro pedido y el código se usa dos veces.
create or replace function public.canjear_invitacion(
  p_codigo text, p_cedula text, p_telefono text, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cod   text; ced text; tel text; freno text;
  ok    text; est text; vence date; nuevo bigint;
begin
  cod := public.codigo_invitacion_normalizado(p_codigo);
  ced := public.solo_digitos(p_cedula);
  tel := public.solo_digitos(p_telefono);

  -- Contador propio, separado del de entrar. Si ni siquiera mandó cédula, todos
  -- esos intentos caen en el mismo casillero '?': tantear sin identificarse se
  -- acaba a los 8 tiros.
  freno := 'inv:' || coalesce(nullif(ced, ''), '?');

  -- Al que ya está frenado —por su cédula o por el contador de todos— se le
  -- contesta lo mismo que a un código que no existe: que no sepa que lo estamos
  -- frenando ni cuántos le quedan.
  if not public.puede_intentar(freno)
     or not public.puede_intentar_tope('inv:*', 60) then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  -- Sin cédula ni celular de verdad no hay nada que hacer con el canje: el
  -- código se quemaría y Joan no tendría a quién escribirle. Esto no cuenta
  -- para el contador de todos: no es un tiro contra un código, es un formulario
  -- a medio llenar.
  if length(ced) < 5 or length(tel) < 7 then
    perform public.anotar_fallo(freno);
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;

  -- Formato roto (o dígito de control que no cierra, que acá se cae solo porque
  -- ese código no está en la tabla): cuenta como intento en los dos contadores.
  -- Es el caso más común del que tantea, y es justo el que hay que hacer caro.
  if cod is null then
    perform public.anotar_fallo(freno);
    perform public.anotar_fallo('inv:*');
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  -- EL MARCADO ATÓMICO. Esta sola instrucción busca, verifica y quema el código.
  update public.invitaciones
     set estado = 'usada', usada_en = now(), usada_por_cedula = ced
   where codigo = cod
     and estado = 'nueva'
     and (vence_en is null or vence_en >= current_date)
  returning codigo into ok;

  if ok is null then
    perform public.anotar_fallo(freno);
    perform public.anotar_fallo('inv:*');
    perform pg_sleep(0.3);

    -- Recién ahora, y solo para elegir el mensaje, se mira cómo estaba. A quien
    -- tiene un código de verdad le sirve saber si ya lo usaron o si venció; que
    -- no exista y que esté anulado comparten respuesta A PROPÓSITO: si se
    -- distinguieran, esto sería un oráculo para saber qué códigos existen.
    select i.estado, i.vence_en into est, vence
      from public.invitaciones i where i.codigo = cod;

    if est = 'usada' then
      return jsonb_build_object('ok', false, 'motivo', 'usada');
    elsif est = 'nueva' and vence is not null and vence < current_date then
      return jsonb_build_object('ok', false, 'motivo', 'vencida');
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  -- Canjeó bien: borrón y cuenta nueva PARA ÉL. El contador de todos ('inv:*')
  -- NO se limpia: si se limpiara, al que tiene un código de verdad le alcanzaría
  -- con canjearlo para dejar el mostrador en cero. Ese se vacía solo a los 15
  -- minutos y a nadie le estorba, porque el que entra bien ni lo mira.
  perform public.limpiar_fallos(freno);

  -- Y esto NO lo vuelve socio: queda en la bandeja de registros hasta que Joan
  -- lo mire y le abra la cuenta a mano desde el Panel.
  insert into public.registros (codigo, cedula, nombre, telefono)
  values (cod, ced,
          coalesce(nullif(trim(coalesce(p_nombre, '')), ''), 'Socio nuevo'),
          tel)
  returning id into nuevo;

  return jsonb_build_object('ok', true, 'registro', nuevo);
end
$$;

-- CREAR CÓDIGOS: solo Joan, con su clave.
create or replace function public.crear_invitaciones(
  p_clave text, p_cantidad integer, p_nota text default null)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  cuantas integer; cod text; puesto text; vueltas integer := 0; hechas integer := 0;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;

  cuantas := least(greatest(coalesce(p_cantidad, 1), 1), 50);   -- de 1 a 50 por vez

  -- Con 32^7 cuerpos posibles, pegarle a uno que ya existe es rarísimo; si pasa,
  -- el "do nothing" no inserta y se sortea otro. El tope de vueltas es para que
  -- un error tonto no deje la consulta girando para siempre.
  while hechas < cuantas and vueltas < cuantas * 20 loop
    vueltas := vueltas + 1;
    puesto  := null;             -- que no quede el de la vuelta anterior si el
                                 -- "do nothing" no inserta nada
    cod     := public.codigo_invitacion_nuevo();

    insert into public.invitaciones (codigo, nota)
    values (cod, nullif(trim(coalesce(p_nota, '')), ''))
    on conflict (codigo) do nothing
    returning codigo into puesto;

    if puesto is not null then
      hechas := hechas + 1;
      return next puesto;
    end if;
  end loop;
  return;
end
$$;

-- VER LOS CÓDIGOS: solo Joan, con su clave. Sin clave esto sería la lista de
-- todos los códigos vivos, o sea la puerta abierta de par en par.
create or replace function public.listar_invitaciones(p_clave text, p_estado text default null)
returns setof public.invitaciones
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
    select * from public.invitaciones
     where p_estado is null or estado = p_estado
     order by creada_en desc
     limit 500;
end
$$;

-- ANULAR un código que se filtró o que ya no va a usar.
create or replace function public.anular_invitacion(p_clave text, p_codigo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer; cod text;
begin
  if not public.clave_ok(p_clave) then
    perform pg_sleep(1);
    raise exception 'clave de sincronización incorrecta';
  end if;
  cod := public.codigo_invitacion_normalizado(p_codigo);
  if cod is null then return 0; end if;
  -- Solo los que están sin usar: uno ya usado se queda 'usada' para siempre,
  -- que es el rastro de quién entró con qué.
  update public.invitaciones set estado = 'anulada'
   where codigo = cod and estado = 'nueva';
  get diagnostics n = row_count;
  return n;
end
$$;

-- LEER LA BANDEJA DE REGISTROS: los que canjearon un código y esperan cuenta.
create or replace function public.listar_registros(p_clave text, p_estado text default 'nuevo')
returns setof public.registros
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
    select * from public.registros
     where estado = coalesce(p_estado, 'nuevo')
     order by creado_en desc
     limit 200;
end
$$;

-- MARCARLO: atendido o descartado, para que no vuelva a salir.
create or replace function public.marcar_registro(p_clave text, p_id bigint, p_estado text)
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
  if p_estado not in ('nuevo','atendido','descartado') then
    raise exception 'estado inválido';
  end if;
  update public.registros set estado = p_estado where id = p_id;
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------------------------------------------------------------- grants ---

revoke all on function public.historial_socio(text, text)                       from public;
revoke all on function public.sincronizar_socios(text, jsonb)                   from public;
revoke all on function public.olvidar_socio(text, text)                         from public;
revoke all on function public.crear_solicitud(text, text, jsonb, text, integer) from public;
revoke all on function public.listar_solicitudes(text, text)                    from public;
revoke all on function public.marcar_solicitud(text, bigint, text)              from public;
revoke all on function public.canjear_invitacion(text, text, text, text)        from public;
revoke all on function public.crear_invitaciones(text, integer, text)           from public;
revoke all on function public.listar_invitaciones(text, text)                   from public;
revoke all on function public.anular_invitacion(text, text)                     from public;
revoke all on function public.listar_registros(text, text)                      from public;
revoke all on function public.marcar_registro(text, bigint, text)               from public;

-- Las de adentro NO se le dan a nadie: se llaman desde las de arriba, que corren
-- como dueñas de la base, así que no necesitan permiso propio.
revoke all on function public.clave_ok(text)                       from public;
revoke all on function public.puede_intentar(text)                 from public;
revoke all on function public.puede_intentar_tope(text, integer)   from public;
revoke all on function public.anotar_fallo(text)                   from public;
revoke all on function public.limpiar_fallos(text)                 from public;
revoke all on function public.codigo_invitacion_nuevo()            from public;
revoke all on function public.codigo_invitacion_normalizado(text)  from public;
-- Y este era un agujerito que estaba abierto desde el primer día: PostgreSQL le
-- da EXECUTE a todo el mundo por defecto, así que solo_digitos se podía llamar
-- desde afuera. No filtra nada (es una cuenta pura, no mira ninguna tabla),
-- pero toda función de public sin revoke queda publicada, y esa costumbre es la
-- que un día deja pasar una que sí importa.
revoke all on function public.solo_digitos(text)                   from public;

-- Y la secuencia del freno de la clave. Las tablas se cierran con RLS, pero una
-- secuencia no tiene RLS: se cierra quitándole el permiso, y hay que quitárselo a
-- mano porque Supabase le regala permisos a anon sobre lo que aparece en public.
-- Si quedara abierta, el que tantea la clave podría ponerle el contador en cero
-- después de cada tanda y el freno no serviría de nada. Las funciones de acá
-- adentro la siguen usando igual: corren como dueñas de la base (security
-- definer), así que no necesitan permiso propio.
revoke all on sequence public.freno_clave from anon, authenticated, public;

grant execute on function public.historial_socio(text, text)                       to anon;
grant execute on function public.sincronizar_socios(text, jsonb)                   to anon;
grant execute on function public.olvidar_socio(text, text)                         to anon;
grant execute on function public.crear_solicitud(text, text, jsonb, text, integer) to anon;
grant execute on function public.listar_solicitudes(text, text)                    to anon;
grant execute on function public.marcar_solicitud(text, bigint, text)              to anon;

-- Las de invitaciones. La primera es la única sin clave: la llama el celular del
-- que se quiere anotar, y por eso lleva el freno adentro. Las otras cinco piden
-- la clave de config_privada en la primera línea, como todas las de Joan.
grant execute on function public.canjear_invitacion(text, text, text, text)        to anon;
grant execute on function public.crear_invitaciones(text, integer, text)           to anon;
grant execute on function public.listar_invitaciones(text, text)                   to anon;
grant execute on function public.anular_invitacion(text, text)                     to anon;
grant execute on function public.listar_registros(text, text)                      to anon;
grant execute on function public.marcar_registro(text, bigint, text)               to anon;

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

-- ------------------------------------------------------ qué falta probar ---
-- Lo de arriba de la línea de invitaciones está probado contra PostgreSQL 17
-- (22 pruebas). LO DE INVITACIONES Y REGISTROS NO: está revisado a mano contra
-- el resto del archivo, y la cuenta del dígito de control sí se comprobó contra
-- motor.js (5.000 códigos generados con el mismo algoritmo, los 5.000 los da por
-- buenos el motor, y las 19 formas de teclear un código dan lo mismo de los dos
-- lados). Falta correrlo contra una base de verdad. Esto es lo que hay que
-- probar, en este orden:
--
-- IDEMPOTENCIA
--   1. Correr el archivo entero DOS VECES seguidas en una base limpia: la
--      segunda no puede tirar error ni borrar nada.
--   2. Correrlo sobre la base vieja (la que ya tiene socios y solicitudes):
--      las solicitudes que ya estaban quedan con producto = 'quincenal' y
--      plazo_meses nulo, y no se pierde ni una fila.
--   3. Poner una clave de verdad, volver a correr el archivo entero, y que la
--      clave siga siendo la tuya.
--
-- QUE LA LLAVE ANON SIGA SIN SERVIR PARA NADA
--   4. Con la llave anon: select sobre invitaciones y sobre registros → las dos
--      tienen que dar vacío o error de permiso. Nunca una fila.
--   5. Con la llave anon: crear_invitaciones, listar_invitaciones,
--      anular_invitacion, listar_registros y marcar_registro SIN clave y con
--      clave equivocada → las cinco tienen que tirar 'clave de sincronización
--      incorrecta'. Y con la clave sin definir ('SIN-DEFINIR'), también.
--   6. rpc/codigo_invitacion_nuevo y rpc/codigo_invitacion_normalizado con la
--      llave anon → tienen que dar error de permiso (son internas).
--   7. rpc/solo_digitos con la llave anon → ahora también tiene que dar error
--      (antes contestaba; ver el revoke nuevo).
--
-- EL CANJE
--   8. Código bien escrito y sin usar → {ok:true, registro:N}, la invitación
--      queda 'usada' con usada_en y usada_por_cedula, y aparece UNA fila en
--      registros.
--   9. El MISMO código otra vez → {ok:false, motivo:'usada'} y NO se agrega otra
--      fila en registros.
--  10. DOBLE USO SIMULTÁNEO, que es la prueba que de verdad importa: dos
--      sesiones psql, las dos con "begin", las dos con el mismo código nuevo.
--      La primera hace el update y la segunda se queda esperando. Al hacer
--      commit la primera, la segunda tiene que actualizar CERO filas y devolver
--      'usada'. Un solo registro insertado. (Probarlo también con los dos
--      commits al revés, y con la primera haciendo rollback: ahí la segunda SÍ
--      tiene que poder canjear.)
--  11. Código inventado → 'no_existe'. Código anulado → 'no_existe' TAMBIÉN
--      (mismo texto: si se distinguieran, sería un oráculo).
--  12. Código con vence_en de ayer → 'vencida'. Con vence_en de mañana → entra.
--      Con vence_en nulo → entra.
--  13. El mismo código escrito de todas las formas: 'tg a3f7 k92m',
--      'TGA3F7K92M', 'a3f7-k92m', con la letra O en vez del cero, con I en vez
--      del 1 → los seis tienen que canjear el mismo código.
--  14. Cédula de 3 dígitos o teléfono de 4 → 'datos', y NO se quema el código.
--
-- EL FRENO
--  15. 8 canjes fallidos con la misma cédula → el 9º ya contesta 'no_existe' sin
--      mirar la tabla. Esperar 15 minutos (o mover 'desde' a mano) → vuelve a
--      dejar probar.
--  16. Que el freno del canje NO frene el de entrar: 8 canjes fallidos con la
--      cédula de un socio y después historial_socio con esa misma cédula bien
--      escrita → tiene que entrar igual. (Y al revés.)
--  17. El contador de todos: 60 fallidos rotando la cédula en cada intento → el
--      61 tiene que salir 'no_existe' aunque la cédula sea nueva. Sin esto, ese
--      giro de cédulas daría intentos infinitos.
--  18. Canjear bien limpia el contador de esa cédula y NO el de todos ('inv:*').
--
-- LO DEMÁS
--  19. crear_invitaciones con clave buena: 5, 0, -3, 999 → tiene que devolver
--      5, 1, 1 y 50, todos distintos, todos con la forma TG-XXXX-XXXX, y
--      cada uno tiene que pasar codigoInvitacionValido() del motor.
--  20. anular_invitacion con un código ya usado → devuelve 0 y no lo toca.
--  21. crear_solicitud con los 3 argumentos de siempre (como la llamaba la app
--      vieja) → tiene que seguir andando y guardar producto='quincenal'.
--  22. crear_solicitud con producto='respaldado' y plazo 0, 7 o nulo → error
--      'plazo inválido'. Con plazo 1..6 → guarda bien.
--  23. crear_solicitud con producto='otracosa' → 'producto desconocido'.
--  24. Después de correr esto, en Supabase hay que refrescar el esquema de la
--      API (Settings → API → Reload schema) o las funciones nuevas contestan
--      404 aunque estén creadas.
--
-- ------------------------- QUE EL FRENO DE crear_solicitud AHORA SÍ CUENTE ---
-- Esto es lo más importante de esta tanda, porque era el agujero más grande que
-- tenía el proyecto y porque el arreglo es de los que "se ven bien" leyéndolos
-- aunque no funcionen. La prueba que lo decide es la 26: NO alcanza con mirar la
-- respuesta de la función, hay que mirar la TABLA del contador. Antes del arreglo
-- la función contestaba exactamente lo mismo y la tabla se quedaba vacía.
--
--  25. Punto de partida limpio, en el SQL Editor:
--        delete from public.intentos_fallidos where cedula = '52111222';
--        select * from public.intentos_fallidos where cedula = '52111222';
--      → cero filas.
--
--  26. LA PRUEBA QUE DECIDE. Un solo intento fallido, con una cédula que SÍ
--      existe en socios_historial y unos últimos 4 que no son los suyos:
--        select public.crear_solicitud('52111222', '0000', '{"capital":100000}'::jsonb);
--      → tiene que devolver NULL (una fila con la columna vacía), no un error
--        rojo "socio no encontrado". Si sale el error, el arreglo no se aplicó.
--      Y acto seguido, en la MISMA sesión pero en una consulta aparte:
--        select cedula, fallos, desde from public.intentos_fallidos
--         where cedula = '52111222';
--      → tiene que salir UNA fila con fallos = 1. Ese 1 es todo el arreglo.
--        Antes acá no había ninguna fila, porque el error borraba el conteo.
--
--  27. Que sume de verdad: repetir la llamada de la 26 siete veces más y volver a
--      mirar la tabla → fallos = 8. (Antes se quedaba en cero para siempre, por
--      muchas veces que se llamara.)
--
--  28. Que el tope corte: el 9º intento. Se le da la cédula bien Y LOS ÚLTIMOS 4
--      CORRECTOS, o sea una llamada que debería funcionar:
--        select public.crear_solicitud('52111222', '2233', '{"capital":100000}'::jsonb);
--      → tiene que devolver NULL igual, y en public.solicitudes NO puede aparecer
--        ninguna fila nueva. Frenado es frenado, aunque acierte.
--
--  29. Que la ventana se abra sola. Mover el reloj del contador 16 minutos atrás:
--        update public.intentos_fallidos set desde = now() - interval '16 minutes'
--         where cedula = '52111222';
--      y repetir la llamada buena de la 28 → ahora sí tiene que devolver un
--      número (el id de la solicitud) y aparecer la fila en public.solicitudes.
--
--  30. Que entrar bien limpie la cuenta: después de la 29,
--        select * from public.intentos_fallidos where cedula = '52111222';
--      → cero filas.
--
--  31. Desde afuera, que es como lo va a ver el atacante. Con la llave anon,
--      contra /rest/v1/rpc/crear_solicitud y una cédula que existe:
--        for i in 0000 0001 0002 0003 0004 0005 0006 0007 0008 0009; do
--          curl -s -X POST "$URL/rest/v1/rpc/crear_solicitud" \
--            -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--            -H "Content-Type: application/json" \
--            -d "{\"p_cedula\":\"52111222\",\"p_tel4\":\"$i\",\"p_datos\":{}}"; echo; done
--      → las diez contestan HTTP 200 con el cuerpo "null" (antes eran HTTP 400
--        con el texto del error), y en la base intentos_fallidos tiene que quedar
--        con fallos = 8, NO más: del 9º en adelante ya ni miran la tabla de
--        socios. Ese 8 clavado es la prueba de que la puerta se cerró.
--
--  32. Que el freno de crear_solicitud y el de entrar sean el MISMO contador (a
--      propósito: son la misma pareja cédula + 4 dígitos). Después de la 31,
--      historial_socio('52111222','2233') con los datos CORRECTOS → null,
--      porque la cédula está frenada. Es el efecto secundario asumido de
--      siempre; el socio entra igual por el enlace de WhatsApp, que no toca la
--      base.
--
-- --------------------------------- EL FRENO NUEVO DE LA CLAVE (clave_ok) ---
-- Acá el contador no vive en una tabla sino en la secuencia public.freno_clave,
-- así que se mira distinto:
--     select last_value from public.freno_clave;
-- El número de la izquierda es el casillero de 15 minutos y los nueve dígitos de
-- la derecha son los intentos. Para leerlo cómodo:
--     select last_value / 1000000000 as casillero,
--            last_value % 1000000000 as intentos
--       from public.freno_clave;
--
--  33. Con la clave BUENA: llamar listar_solicitudes('TU-CLAVE') tres veces →
--      las tres devuelven la lista, e intentos queda en 0 después de cada una
--      (cada acierto pone el mostrador en cero).
--
--  34. Con la clave MAL: llamarla cuatro veces con 'ClaveEquivocadaLarga' → las
--      cuatro tiran 'clave de sincronización incorrecta', y intentos tiene que
--      ir 1, 2, 3, 4. ESTE ES EL PUNTO: el error se lanza igual que siempre y el
--      contador sube igual. Si subiera y volviera a cero, la secuencia no estaría
--      haciendo su trabajo.
--
--  35. El tope: seguir hasta 11 intentos malos. El 11º y los siguientes tienen
--      que seguir tirando el mismo error, y ahora también lo tiene que tirar la
--      clave BUENA (probar listar_solicitudes con la clave de verdad → error).
--      Pasado el tope no se mira ni la clave.
--
--  36. Que la ventana se abra sola sin tocar nada: llevar el casillero uno para
--      atrás a mano,
--        select setval('public.freno_clave',
--                      (last_value / 1000000000 - 1) * 1000000000 + 500)
--          from public.freno_clave;
--      y volver a llamar con la clave buena → tiene que entrar, y el contador
--      queda reencuadrado en el casillero de ahora.
--
--  37. Que el paralelo no la saltee, que es lo que el pg_sleep(1) no hacía. 40
--      llamadas simultáneas con la clave mal:
--        seq 40 | xargs -P 40 -I{} curl -s -X POST \
--          "$URL/rest/v1/rpc/listar_solicitudes" \
--          -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--          -H "Content-Type: application/json" \
--          -d '{"p_clave":"ClaveEquivocadaLarga"}' -o /dev/null
--      → después, intentos tiene que valer 40 (nextval no se pierde ni un tiro
--        aunque lleguen todas juntas), y las 40 respuestas tienen que ser error.
--        Antes de esto, las 40 pasaban a comparar la clave sin que nada contara.
--
--  38. Que la secuencia esté cerrada por fuera: con la llave anon,
--      POST /rest/v1/rpc/setval y /rest/v1/rpc/nextval → 404 (no son funciones
--      de public, PostgREST no las publica). Y en psql como rol anon:
--        select nextval('public.freno_clave');
--      → 'permission denied for sequence freno_clave'. Si esto contestara, el
--        que tantea podría poner el contador en cero cuando quisiera.
--
--  39. Idempotencia de lo nuevo: correr el archivo entero otra vez con el
--      contador a la mitad (por ejemplo en 5) → 'create sequence if not exists'
--      no la toca y el contador sigue en 5. La secuencia no se reinicia sola al
--      volver a correr el archivo.
