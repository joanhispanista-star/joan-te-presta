/* ============================================================================
 * Tu Garantía — Motor de reglas v1
 * Fase 2 del orden de build (§12): motor puro. Sin UI, sin base de datos,
 * sin dependencias externas.
 *
 * Moneda: COP en enteros (sin centavos). Zona horaria de referencia:
 * America/Bogota. Las fechas se manejan como "YYYY-MM-DD" o Date local y
 * NUNCA se convierten a UTC, así que no hay corrimiento de día.
 *
 * Todas las funciones son puras: mismos argumentos → mismo resultado. No leen
 * el reloj ni mutan lo que reciben. Si algo necesita "hoy", se pasa por
 * parámetro.
 *
 * ---------------------------------------------------------------------------
 * CAMBIO DE REGLA — 26-jul-2026, pedido de Joan. MANDA sobre el §1 y el §4 del
 * documento, que quedan desactualizados:
 *
 *   1. La garantía ya NO depende de la puntualidad. Acumula el 90% de TODO
 *      costo que el socio pague: costo del crédito, prórrogas, recargo de mora
 *      y los costos del plan de pagos.
 *   2. Cada día de mora cobra un 1% adicional sobre el capital, y ese recargo
 *      también acumula garantía.
 *
 * ---------------------------------------------------------------------------
 * LA MORA NO CASTIGA — 27-jul-2026, pedido de Joan. Deroga el §5 (la mora baja
 * un nivel), el §9 (suspensión de solicitudes desde el día 1) y suaviza el §4:
 *
 *   El mensaje al socio es "así pagues en mora, Joan siempre te va a prestar".
 *   Por eso: el nivel NUNCA baja, la mora no bloquea pedir de nuevo, y la
 *   garantía ya ganada no se borra jamás.
 *
 *   Lo único que queda es el castigo del §6 para el que a los 90 días no ha
 *   abonado NI UN PESO: ahí el socio queda suspendido y su garantía se
 *   CONGELA (no se pierde) hasta que vuelva a pagar. Un socio que abona algo,
 *   aunque sea tarde y aunque sea poco, nunca cae ahí.
 *
 * Lo que sí sigue premiando la puntualidad es la SUBIDA de nivel: la racha
 * cuenta pagos puntuales seguidos, y sin racha simplemente se sube más lento.
 * Nadie retrocede.
 * ---------------------------------------------------------------------------
 * PRECIO FIJO — 29-jul-2026, pedido de Joan. Deroga el §5 entero:
 *
 *   El costo es SIEMPRE el 20% del capital. Se acabaron los escalones por
 *   cobertura (20/12/5/3%). La garantía ya no fija el PRECIO, solo el CUPO.
 *
 *   Consecuencia que hubo que arreglar en el mismo movimiento: con el precio
 *   clavado y la mora sumando garantía, pagar tarde acumulaba MÁS que pagar en
 *   fecha (el atrasado paga costo + recargo, y todo sumaba igual). La app le
 *   estaba enseñando al socio que atrasarse convenía. Se corrigió con un BONO,
 *   no con un castigo: lo pagado con mora sigue sumando, pero al 50%; lo pagado
 *   en fecha suma al 100%. Nadie pierde garantía ni baja de nivel.
 *
 *   Y para que el cupo crezca rápido: FACTOR_GARANTIA de 0,90 a 1,00, factores
 *   de cupo de 1/1,25/1,5/2 a 1,5/2/2,5/3, y umbrales de nivel de 3/8/20 pagos
 *   a 2/5/10. Un socio que arranca con 200.000 llega al techo de 20 millones en
 *   11 créditos (5,5 meses) en vez de 28 (14 meses).
 * ---------------------------------------------------------------------------
 * DOS PRODUCTOS Y DOS GARANTÍAS — 2-ago-2026, pedido de Joan:
 *
 *   1. Aparece el PRÉSTAMO CON GARANTÍA: 5% mensual plano, de 1 a 6 meses,
 *      hasta el monto de la garantía que el socio YA se ganó pagando, uno a
 *      uno. El crédito quincenal al 20% sigue siendo el producto por defecto.
 *   2. La garantía se parte en dos que no valen lo mismo: la PRESTADA (el
 *      cupón por los datos y los referidos, que se la regala la plataforma) y
 *      la GANADA (la que salió de pagar costos). Las dos suman para el cupo
 *      quincenal; solo la ganada respalda el préstamo con garantía.
 *   3. FACTOR_GARANTIA baja de 1,00 a 0,90 y el cupón de datos de 200.000 a
 *      100.000. El 10% que ya no va a garantía se reparte 7% operativo y 3%
 *      para ir devolviendo el cupón regalado (REPARTO_COSTO). Ese reparto es
 *      contabilidad interna de Joan: el socio ve su 90% y nada más.
 *   4. Entrada solo por invitación: códigos TG-XXXX-XXXX con dígito de
 *      control, uno por persona.
 *
 *   El corazón del producto es que el socio ELIGE: el respaldado cuesta menos
 *   pero deja el 20% del costo de garantía; el quincenal cuesta más pero deja
 *   el 90% y le sube el cupo rápido. Plata barata o crecer.
 * ---------------------------------------------------------------------------
 * DECISIONES tomadas donde el documento no era explícito (revisar con Joan):
 *
 * D1. La ventana mínima de 5 días (§7.3) se mide contra la fecha de corte YA
 *     corrida por domingo/festivo, no contra la nominal. Es la fecha en que el
 *     socio realmente tiene que pagar, y favorece al cliente.
 * D2. "Siguiente día hábil" (§7.1) = saltar domingos y festivos. El SÁBADO se
 *     acepta como día de corte, porque la regla solo dispara con "domingo o
 *     festivo" y en tu operación el sábado se trabaja (8am–3pm en el CRM).
 * D3. RESUELTA el 27-jul-2026: el §5 decía "una mora baja un nivel". Ya no baja
 *     nada. evaluarNivel() acepta un 4º parámetro `nivelAlcanzado` que hace de
 *     piso, y la capa de datos guarda ahí el nivel más alto que el socio haya
 *     tenido.
 * D4. Platino se evalúa literal como dice la tabla (20 pagos + 6 meses sin
 *     mora); no le exige la racha ≥ 4 de Oro. Gana el nivel más alto cuyos
 *     propios requisitos se cumplan.
 * D5. El costo de la prórroga se cobra APARTE (movimiento propio), no se suma
 *     al total_a_pagar del crédito: el socio paga el costo y sigue debiendo el
 *     mismo total en el corte nuevo. Ese movimiento SÍ genera garantía.
 * D6. El crédito prorrogado y pagado en su corte nuevo también acumula, como
 *     cualquier otro pago.
 * D7. El plan de pagos reparte el CAPITAL en 3 cortes (literal §8) y sus costos
 *     del 5% también generan garantía. Qué pasa con el costo original impago
 *     sigue pendiente.
 * D8. calcularCupo redondea hacia abajo (Math.floor): nunca ofrecer más cupo
 *     del que da la fórmula.
 * D9. El 1% diario de mora corre sobre el CAPITAL (igual que la prórroga, §8),
 *     es SIMPLE —no compuesto— y no tiene tope por defecto.
 *     Ojo con el número: 1% diario ≈ 3.678% efectivo anual. Está muy por encima
 *     de la tasa de usura colombiana. El motor lo calcula porque así se pidió;
 *     el tope, si se pone, se decide arriba y se pasa por opciones.topeDias.
 * D10. Los días de mora se cuentan calendario, de la fecha de corte a la fecha
 *     de pago. Pagar el mismo día del corte es puntual: 0 días, 0 recargo.
 * D11. §9 solapa M2 (46–90) con castigo (90+). Acá M2 llega hasta 89 y desde
 *     el día 90 es castigo.
 * D12. (27-jul-2026, actualizada el 2-ago-2026) El §3 queda reemplazado: el
 *     cupón ya no es una tabla de tres niveles de KYC sino un puntaje DATO POR
 *     DATO (DATOS_KYC) que suma 100.000 exactos al completarlo todo. El reparto
 *     por dato es criterio nuestro: pesa más lo que más baja el riesgo (selfie
 *     18.000, fotos de la cédula 10.000 cada una, referencia 10.000) y menos lo
 *     barato de falsear. Si Joan quiere mover un valor, tiene que compensarlo
 *     en otro: hay una prueba que exige que los 15 sumen 100.000 clavados.
 * D13. Techo de la plataforma: CUPO_MAXIMO = 20 millones. calcularCupo nunca
 *     devuelve más, por alta que sea la garantía.
 * D14. Un referido suma 5.000 SOLO cuando ya pagó un crédito. Sin tope: traer
 *     gente que paga es exactamente lo que queremos premiar.
 * ==========================================================================*/

(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.MotorReglas = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- reglas */

  var NIVELES = ['bronce', 'plata', 'oro', 'platino'];

  /* §5 DEROGADO (29-jul-2026): ya no hay escalones de tasa por cobertura.
     El costo es SIEMPRE el 20% del capital. La garantía dejó de fijar el
     PRECIO y ahora fija solo el CUPO: cuánto puede pedir. */
  var TASA_CREDITO = 0.20;

  /* §3 REEMPLAZADO (27-jul-2026): el cupón ya no es una tabla de tres escalones.
     La plataforma presta garantía DATO POR DATO: cada cosa que el socio entrega
     le sube el cupón. Así el que quiere crédito tiene un motivo concreto para
     darnos información.

     2-ago-2026: el cupón completo baja de 200.000 a 100.000 exactos. La razón
     es que ahora la garantía tiene dos partes que NO valen lo mismo: la
     PRESTADA (este cupón, que se la regalamos nosotros) y la GANADA (la que
     sale de pagar costos). Solo la ganada respalda el préstamo con garantía,
     porque prestar contra el cupón sería prestar contra plata nuestra. Con el
     cupón en 100.000 el riesgo inicial por socio queda a la mitad y el 3% de
     cada costo lo va devolviendo (ver REPARTO_COSTO).

     El reparto entre los 15 datos sigue el mismo criterio: pesa más lo que más
     baja el riesgo y menos lo barato de falsear. */
  var DATOS_KYC = [
    { id: 'nombre', etiqueta: 'Tu nombre completo', ayuda: 'Como aparece en la cédula', tipo: 'texto', valor: 5000 },
    { id: 'cedula', etiqueta: 'Número de cédula', ayuda: 'Solo los números', tipo: 'numero', valor: 8000 },
    { id: 'celular', etiqueta: 'Tu celular', ayuda: 'Al que te podamos escribir', tipo: 'numero', valor: 5000 },
    { id: 'whatsapp', etiqueta: 'Ese celular tiene WhatsApp', ayuda: 'Para avisarte de tus pagos', tipo: 'si', valor: 2000 },
    { id: 'correo', etiqueta: 'Tu correo', ayuda: 'Opcional pero suma', tipo: 'texto', valor: 2000 },
    { id: 'ciudad', etiqueta: 'Ciudad y barrio', ayuda: 'Dónde vives', tipo: 'texto', valor: 5000 },
    { id: 'direccion', etiqueta: 'Dirección de tu casa', ayuda: 'Calle, carrera y número', tipo: 'texto', valor: 5000 },
    { id: 'vivienda', etiqueta: 'Tipo de vivienda', ayuda: 'Propia, arriendo, familiar…', tipo: 'texto', valor: 5000 },
    { id: 'pago', etiqueta: 'Tu Nequi o llave', ayuda: 'Por donde recibes la plata', tipo: 'texto', valor: 5000 },
    { id: 'celular2', etiqueta: 'Un segundo teléfono', ayuda: 'De la casa o del trabajo', tipo: 'numero', valor: 2000 },
    { id: 'referencia', etiqueta: 'Una referencia', ayuda: 'Nombre y teléfono de alguien que te conozca', tipo: 'texto', valor: 10000 },
    { id: 'ubicacion', etiqueta: 'Tu ubicación en el mapa', ayuda: 'Se toma una sola vez', tipo: 'mapa', valor: 8000 },
    { id: 'foto_cedula_frente', etiqueta: 'Cédula por delante', ayuda: 'Una foto que se lea bien', tipo: 'foto', valor: 10000 },
    { id: 'foto_cedula_reverso', etiqueta: 'Cédula por detrás', ayuda: 'La otra cara', tipo: 'foto', valor: 10000 },
    { id: 'foto_selfie', etiqueta: 'Selfie con tu cédula', ayuda: 'Tú sosteniéndola al lado de tu cara', tipo: 'foto', valor: 18000 }
  ];
  var CUPON_KYC_MAXIMO = 100000;   // suma exacta de los 15 datos de arriba

  var GARANTIA_POR_REFERIDO = 5000; // pero solo cuando el referido paga puntual
  var CUPO_MAXIMO = 20000000;       // techo de la plataforma: 20 millones

  /* 3-ago-2026, pedido de Joan. Dos números que hasta hoy vivían escritos a mano
     dentro de la pantalla de la calculadora, cada producto con el suyo y sin
     ninguna razón: el quincenal pedía un mínimo de 100.000 y el préstamo con
     garantía, 50.000.

     MONTO_MINIMO manda en los DOS productos y también en el Panel: por debajo de
     50.000 el trabajo de desembolsar y cobrar se come la ganancia.

     MONTO_MAXIMO_CALCULADORA es otra cosa y no hay que confundirlos: es hasta
     dónde llega lo que el socio puede pedirse SOLO, desde el teléfono. El techo
     del negocio sigue siendo CUPO_MAXIMO; de 5 millones para arriba se habla con
     Joan. Por eso son dos constantes y no una. */
  var MONTO_MINIMO = 50000;
  var MONTO_MAXIMO_CALCULADORA = 5000000;

  /* §5 — factor de cupo y prórrogas por nivel.
     Subidos el 29-jul-2026 para que el cupo crezca rápido, que es lo que se
     pidió. Ojo con lo que significan: el cupo es garantía × factor, y la
     garantía NO es plata depositada, es un puntaje. Con factor 2,5 le estás
     prestando 2,5 veces lo que el socio te ha pagado en toda su historia. */
  var FACTOR_CUPO = { bronce: 1.5, plata: 2.0, oro: 2.5, platino: 3.0 };
  var PRORROGAS_POR_NIVEL = { bronce: 1, plata: 2, oro: 2, platino: 2 };
  var TOPE_DURO_PRORROGAS = 2; // §8, tope duro por encima del nivel

  // §5 — requisitos de nivel, bajados el 29-jul-2026 para que se suba rápido.
  var REQUISITOS_NIVEL = {
    bronce: { pagos_a_tiempo: 0, racha: 0, meses_sin_mora: 0 },
    plata: { pagos_a_tiempo: 2, racha: 0, meses_sin_mora: 0 },
    oro: { pagos_a_tiempo: 5, racha: 3, meses_sin_mora: 0 },
    platino: { pagos_a_tiempo: 10, racha: 0, meses_sin_mora: 3 }
  };

  /* Cuánta garantía deja cada peso de costo pagado.
     2-ago-2026: baja de 1,00 a 0,90. El otro 10% no se pierde: es lo que
     sostiene la plataforma (7% de costo operativo) y lo que va devolviendo el
     cupón de 100.000 que se le regaló al socio para arrancar (3%). Eso último
     es contabilidad interna: el socio ve su 90% y nada más.

     El BONO POR PUNTUALIDAD se mantiene tal cual: en fecha suma el factor
     completo, tarde suma la mitad. Con costo 20% y mora 1% diario, el punto
     de equilibrio sigue estando en los 20 días. */
  var FACTOR_GARANTIA = 0.90;       // pagó en la fecha de corte o antes
  var FACTOR_GARANTIA_MORA = 0.45;  // pagó tarde: suma, pero la mitad
  var DIAS_VENTANA_MINIMA = 5;     // §7.3
  var DIAS_CORTE_FIJO = 15;        // §7 — día 15 y último del mes
  var CUOTAS_PLAN_DE_PAGOS = 3;    // §8
  var TASA_PLAN_DE_PAGOS = 0.05;   // §8 — costo fijo reducido sobre saldo insoluto
  var TASA_MORA_DIARIA = 0.01;     // 1% diario sobre el capital (cambio 26-jul-2026)
  var DIAS_CASTIGO = 90;           // §6 — en_mora → castigado

  // §9 — tramos de mora. `desde`/`hasta` en días corridos desde la fecha de
  // corte (negativo = todavía falta para el corte). D11: sin solapamiento.
  var TRAMOS_MORA = [
    { tramo: 'vigente', desde: -Infinity, hasta: -3, accion: 'ninguna', canal: '—' },
    { tramo: 'preventivo', desde: -2, hasta: 0, accion: 'recordatorio amable', canal: 'push + WhatsApp' },
    { tramo: 'D1', desde: 1, hasta: 5, accion: 'recordatorio, oferta de prórroga', canal: 'WhatsApp' },
    { tramo: 'D2', desde: 6, hasta: 15, accion: 'contacto directo, oferta de plan de pagos', canal: 'llamada' },
    { tramo: 'M1', desde: 16, hasta: 45, accion: 'gestión con referencias', canal: 'llamada' },
    { tramo: 'M2', desde: 46, hasta: 89, accion: 'última instancia antes de castigo', canal: 'llamada' },
    // La garantía NO se pone en cero: se congela (ver evaluarCastigo).
    { tramo: 'castigo', desde: 90, hasta: Infinity, accion: 'suspender y congelar la garantía', canal: '—' }
  ];

  // Estados desde los que NO tiene sentido prorrogar (§6)
  var ESTADOS_SIN_PRORROGA = ['solicitado', 'aprobado', 'pagado', 'castigado', 'plan_de_pagos'];

  /* ---- Producto 2: préstamo con garantía (2-ago-2026) ----
     5% mensual PLANO sobre el capital original, igual que el 20% quincenal:
     no corre sobre saldo insoluto. De 1 a 6 meses, lo elige el socio.
     Se presta uno a uno contra la garantía GANADA: nunca contra la prestada,
     que sería prestar contra plata que le prestamos nosotros. */
  var TASA_RESPALDADO_MENSUAL = 0.05;
  var PLAZO_RESPALDADO_MIN = 1;
  var PLAZO_RESPALDADO_MAX = 6;
  var FACTOR_GARANTIA_RESPALDADO = 0.20;       // pagó en fecha
  var FACTOR_GARANTIA_RESPALDADO_MORA = 0.10;  // pagó tarde: la mitad
  var CORTES_POR_MES = 2;                      // 15 y último: un mes = dos cortes

  /* ---- El reparto de cada peso de costo (contabilidad de Joan) ----
     90% garantía del socio · 7% operativo · 3% amortiza el cupón regalado.
     El socio NO ve esto por ningún lado: para él su garantía es el 90% y
     punto. El 3% se acumula por socio y deja de cobrarse cuando ese socio
     ya devolvió todo su cupón. */
  var REPARTO_COSTO = { garantia: 0.90, operativo: 0.07, cupon: 0.03 };

  /* ---- Códigos de invitación ----
     Crockford-32 sin confusables (no van I, L, O ni U). 7 al azar + 1 de
     verificación, para que un código mal dictado por WhatsApp se caiga en el
     celular y no le haga perder el tiempo a Joan. */
  var ALFABETO_CODIGO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var LARGO_CODIGO = 8;         // 7 al azar + 1 de verificación
  var PREFIJO_CODIGO = 'TG';    // 'Tu Garantía' (antes 'QNC', de Quincena)

  /* ----------------------------------------------------------- validación */

  function esNumero(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // Admite negativos: solo se usa para el ajuste manual de la migración.
  function numeroFinito(v, nombre) {
    if (!esNumero(v)) throw new TypeError(nombre + ': se esperaba un número, llegó ' + describir(v));
    return v;
  }

  function numeroNoNegativo(v, nombre) {
    if (!esNumero(v)) throw new TypeError(nombre + ': se esperaba un número, llegó ' + describir(v));
    if (v < 0) throw new RangeError(nombre + ': no puede ser negativo (' + v + ')');
    return v;
  }

  function numeroPositivo(v, nombre) {
    numeroNoNegativo(v, nombre);
    if (v === 0) throw new RangeError(nombre + ': debe ser mayor que cero');
    return v;
  }

  function enteroNoNegativo(v, nombre) {
    numeroNoNegativo(v, nombre);
    if (Math.floor(v) !== v) throw new RangeError(nombre + ': debe ser entero (' + v + ')');
    return v;
  }

  function describir(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') return 'la cadena "' + v + '"';
    if (typeof v === 'number') return String(v);
    return typeof v;
  }

  function normalizarNivel(nivel, nombre) {
    nombre = nombre || 'nivelSocio';
    if (typeof nivel !== 'string') throw new TypeError(nombre + ': se esperaba texto, llegó ' + describir(nivel));
    var n = nivel.trim().toLowerCase();
    if (NIVELES.indexOf(n) === -1) {
      throw new RangeError(nombre + ': nivel desconocido "' + nivel + '". Válidos: ' + NIVELES.join(', '));
    }
    return n;
  }

  /* ---------------------------------------------------------------- fechas */

  var RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

  // Acepta Date o "YYYY-MM-DD" y devuelve un Date local a medianoche.
  // Ojo: new Date("2026-07-15") parsea en UTC y en Bogotá cae el día 14; por eso
  // se arma a mano.
  function aFechaLocal(valor, nombre) {
    nombre = nombre || 'fecha';
    if (valor instanceof Date) {
      if (isNaN(valor.getTime())) throw new RangeError(nombre + ': Date inválida');
      return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
    }
    if (typeof valor === 'string') {
      var m = RE_ISO.exec(valor.trim());
      if (!m) throw new TypeError(nombre + ': se esperaba "YYYY-MM-DD" o Date, llegó "' + valor + '"');
      var a = +m[1], mes = +m[2] - 1, d = +m[3];
      var f = new Date(a, mes, d);
      if (f.getFullYear() !== a || f.getMonth() !== mes || f.getDate() !== d) {
        throw new RangeError(nombre + ': esa fecha no existe (' + valor + ')');
      }
      return f;
    }
    throw new TypeError(nombre + ': se esperaba "YYYY-MM-DD" o Date, llegó ' + describir(valor));
  }

  function iso(fecha) {
    var m = fecha.getMonth() + 1, d = fecha.getDate();
    return fecha.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  // Diferencia en días calendario. Se pasa por UTC solo para el cálculo, así el
  // horario de verano de otras zonas no mete medio día de error.
  function diasEntre(desde, hasta) {
    var a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
    var b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
    return Math.round((b - a) / 86400000);
  }

  function sumarDias(fecha, n) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + n);
  }

  function ultimoDiaDelMes(anio, mes) {
    return new Date(anio, mes + 1, 0).getDate(); // día 0 del mes siguiente
  }

  /* ------------------------------------------------- festivos colombianos */
  /* Mismo algoritmo del CRM de cobranzas (§7.2): Ley Emiliani + Pascua. */

  function pascua(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100,
      d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31),
      dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }

  function sigLunes(f) {
    var x = new Date(f.getFullYear(), f.getMonth(), f.getDate()), w = x.getDay();
    if (w !== 1) x.setDate(x.getDate() + ((8 - w) % 7 || 7));
    return x;
  }

  var _cacheFestivos = {};

  // Set con los festivos del año en formato "YYYY-MM-DD".
  function festivosDelAnio(anio) {
    enteroNoNegativo(anio, 'anio');
    if (_cacheFestivos[anio]) return _cacheFestivos[anio];
    var set = {};
    var agregar = function (f) { set[iso(f)] = true; };

    // Fijos: Año Nuevo, Trabajo, Independencia, Boyacá, Inmaculada, Navidad.
    [[0, 1], [4, 1], [6, 20], [7, 7], [11, 8], [11, 25]].forEach(function (p) {
      agregar(new Date(anio, p[0], p[1]));
    });
    // Ley Emiliani (se corren al lunes): Reyes, San José, San Pedro y San Pablo,
    // Asunción, Día de la Raza, Todos los Santos, Independencia de Cartagena.
    [[0, 6], [2, 19], [5, 29], [7, 15], [9, 12], [10, 1], [10, 11]].forEach(function (p) {
      agregar(sigLunes(new Date(anio, p[0], p[1])));
    });
    // Móviles por Pascua: Jueves y Viernes Santo (no se corren) + Ascensión,
    // Corpus Christi y Sagrado Corazón (ya corridos al lunes).
    var p = pascua(anio);
    [-3, -2, 43, 64, 71].forEach(function (n) { agregar(sumarDias(p, n)); });

    _cacheFestivos[anio] = set;
    return set;
  }

  function esFestivo(fecha) {
    var f = aFechaLocal(fecha, 'fecha');
    return festivosDelAnio(f.getFullYear())[iso(f)] === true;
  }

  function esDomingo(fecha) {
    return aFechaLocal(fecha, 'fecha').getDay() === 0;
  }

  // D2: para efectos del corte, hábil = ni domingo ni festivo (sábado sí vale).
  function esDiaHabilDeCorte(fecha) {
    var f = aFechaLocal(fecha, 'fecha');
    return f.getDay() !== 0 && !esFestivo(f);
  }

  function siguienteDiaHabilDeCorte(fecha) {
    var f = aFechaLocal(fecha, 'fecha');
    for (var i = 0; i < 15; i++) {
      if (esDiaHabilDeCorte(f)) return f;
      f = sumarDias(f, 1);
    }
    throw new Error('siguienteDiaHabilDeCorte: 15 días seguidos no hábiles, revisar el calendario');
  }

  /* ------------------------------------------------ §7 calendario de cortes */

  // Cortes nominales de un mes: día 15 y último día (mes 0-based).
  function cortesNominalesDelMes(anio, mes) {
    return [
      new Date(anio, mes, DIAS_CORTE_FIJO),
      new Date(anio, mes, ultimoDiaDelMes(anio, mes))
    ];
  }

  /**
   * §7 — Fecha de corte de un crédito desembolsado en `fechaDesembolso`.
   * Toma el próximo corte fijo (15 o último día), lo corre al siguiente día
   * hábil si cae domingo o festivo, y lo descarta si quedan menos de 5 días
   * calendario (ventana mínima, §7.3), pasando al corte siguiente.
   *
   * @param {Date|string} fechaDesembolso  Date o "YYYY-MM-DD".
   * @returns {string} fecha de corte en "YYYY-MM-DD".
   */
  function calcularFechaCorte(fechaDesembolso) {
    return detalleFechaCorte(fechaDesembolso).fecha_corte;
  }

  /**
   * Igual que calcularFechaCorte pero con el detalle que la pantalla 3
   * necesita mostrar (§10): por qué se corrió y cuántos cortes se saltaron.
   */
  function detalleFechaCorte(fechaDesembolso) {
    var base = aFechaLocal(fechaDesembolso, 'fechaDesembolso');
    var anio = base.getFullYear(), mes = base.getMonth();
    var saltados = [];

    for (var vuelta = 0; vuelta < 24; vuelta++) {
      var candidatos = cortesNominalesDelMes(anio, mes);
      for (var i = 0; i < candidatos.length; i++) {
        var nominal = candidatos[i];
        var efectiva = siguienteDiaHabilDeCorte(nominal);
        var dias = diasEntre(base, efectiva); // D1: contra la fecha ya corrida

        if (dias >= DIAS_VENTANA_MINIMA) {
          var corrido = diasEntre(nominal, efectiva);
          return {
            fecha_corte: iso(efectiva),
            fecha_corte_nominal: iso(nominal),
            dias_corridos: corrido,
            corrido_por: corrido === 0 ? null : (esDomingo(nominal) ? 'domingo' : 'festivo'),
            dias_al_corte: dias,
            cortes_saltados: saltados
          };
        }
        if (dias >= 0) saltados.push(iso(efectiva)); // se saltó por ventana mínima
      }
      mes++;
      if (mes > 11) { mes = 0; anio++; }
    }
    throw new Error('detalleFechaCorte: no se encontró corte válido en 24 meses');
  }

  /** Cortes consecutivos a partir de (y sin incluir) una fecha dada. */
  function cortesSiguientes(fechaBase, cantidad) {
    enteroNoNegativo(cantidad, 'cantidad');
    var fechas = [], cursor = fechaBase;
    for (var i = 0; i < cantidad; i++) {
      cursor = calcularFechaCorte(cursor);
      fechas.push(cursor);
    }
    return fechas;
  }

  /* ------------------------------------------------------ §5 tasa y cupo */

  /**
   * Costo del crédito: SIEMPRE el 20% del capital (cambio 29-jul-2026).
   *
   * Conserva los dos parámetros y sus validaciones porque hay llamadores y
   * pruebas que cuentan con que reviente si el capital es cero o negativo.
   * La garantía ya no influye en el precio: ahora solo abre cupo.
   *
   * @returns {number} siempre 0.20
   */
  function calcularTasa(garantiaTotal, capitalSolicitado) {
    numeroNoNegativo(garantiaTotal == null ? 0 : garantiaTotal, 'garantiaTotal');
    numeroPositivo(capitalSolicitado, 'capitalSolicitado');
    return TASA_CREDITO;
  }

  /** Costo en pesos de un capital, al 20%. */
  function calcularCosto(capital) {
    return Math.round(numeroPositivo(capital, 'capital') * TASA_CREDITO);
  }

  /**
   * §5 — Cupo máximo solicitable = garantia_total × factor_nivel.
   * Redondea hacia abajo (D8) y no pasa del techo de la plataforma (D12).
   */
  function calcularCupo(garantiaTotal, nivelSocio) {
    var g = numeroNoNegativo(garantiaTotal, 'garantiaTotal');
    var nivel = normalizarNivel(nivelSocio);
    return Math.min(Math.floor(g * FACTOR_CUPO[nivel]), CUPO_MAXIMO);
  }

  /** Garantía que hace falta para poder pedir `cupo` estando en `nivel`. */
  function garantiaNecesariaPara(cupo, nivelSocio) {
    var c = numeroNoNegativo(cupo, 'cupo');
    var nivel = normalizarNivel(nivelSocio);
    return Math.ceil(Math.min(c, CUPO_MAXIMO) / FACTOR_CUPO[nivel]);
  }

  /**
   * Cuánto podría pedir el socio en cada nivel con la garantía que tiene hoy.
   * Es lo que deja ver que subir de nivel vale la pena sin tener que subir.
   */
  function proyeccionNiveles(garantiaTotal, nivelActual) {
    var g = numeroNoNegativo(garantiaTotal, 'garantiaTotal');
    var actual = nivelActual == null ? null : normalizarNivel(nivelActual, 'nivelActual');
    return NIVELES.map(function (n) {
      return {
        nivel: n,
        factor: FACTOR_CUPO[n],
        cupo: calcularCupo(g, n),
        prorrogas: Math.min(PRORROGAS_POR_NIVEL[n], TOPE_DURO_PRORROGAS),
        requisitos: REQUISITOS_NIVEL[n],
        actual: n === actual,
        alcanzado: actual != null && NIVELES.indexOf(n) <= NIVELES.indexOf(actual)
      };
    });
  }

  /**
   * Las reglas del acuerdo, en datos, para que la pantalla que se las muestra
   * al socio salga de las MISMAS constantes que hacen las cuentas. Si algún
   * día se cambia un número, la explicación cambia sola: no puede quedar
   * prometiendo una cosa mientras el motor hace otra.
   */
  function reglasResumen() {
    return {
      costo: {
        tasa: TASA_CREDITO,
        texto: 'El costo es siempre el ' + Math.round(TASA_CREDITO * 100) +
               '% de lo que pidas, por quincena. No sube ni baja: ni por tu historial, ni por el monto.'
      },
      garantia: {
        factor_puntual: FACTOR_GARANTIA,
        factor_mora: FACTOR_GARANTIA_MORA,
        texto: 'De cada peso de costo que pagas, 90 centavos se te vuelven garantía, y la ' +
               'garantía es lo que te deja pedir más. Pagando en la fecha suma completo; ' +
               'pagando tarde suma la mitad, pero suma.'
      },
      cupon: {
        maximo: CUPON_KYC_MAXIMO,
        datos: DATOS_KYC.length,
        texto: 'Por cada dato tuyo que tengamos cargado te prestamos garantía. Con los ' +
               DATOS_KYC.length + ' completos son ' + CUPON_KYC_MAXIMO.toLocaleString('es-CO') +
               ' de cupo, sin haber pagado todavía nada.'
      },
      /* El producto 2 (2-ago-2026). Va acá porque esta función es la que
         alimenta las pantallas del socio: lo que se le promete sale de las
         mismas constantes que hacen la cuenta. El reparto 90/7/3 NO entra
         nunca acá: eso es contabilidad de Joan, no una regla del acuerdo. */
      respaldado: {
        tasa_mensual: TASA_RESPALDADO_MENSUAL,
        plazo_max: PLAZO_RESPALDADO_MAX,
        factor_garantia: FACTOR_GARANTIA_RESPALDADO,
        texto: 'Con la garantía que YA te ganaste pagando puedes pedir un préstamo más ' +
               'barato: ' + (TASA_RESPALDADO_MENSUAL * 100) + '% al mes, hasta ' +
               PLAZO_RESPALDADO_MAX + ' meses, hasta el monto de tu garantía ganada. ' +
               'Cuesta menos, pero te hace crecer el cupo mucho más despacio.'
      },
      referidos: {
        por_cada_uno: GARANTIA_POR_REFERIDO,
        texto: 'Cada persona que traigas te suma ' + GARANTIA_POR_REFERIDO.toLocaleString('es-CO') +
               ', desde que esa persona pague su crédito.'
      },
      niveles: NIVELES.map(function (n) {
        return { nivel: n, factor: FACTOR_CUPO[n], requisitos: REQUISITOS_NIVEL[n],
                 prorrogas: Math.min(PRORROGAS_POR_NIVEL[n], TOPE_DURO_PRORROGAS) };
      }),
      tope: {
        cupo: CUPO_MAXIMO,
        texto: 'Lo máximo que se presta son ' + CUPO_MAXIMO.toLocaleString('es-CO') + '.'
      },
      mora: {
        diaria: TASA_MORA_DIARIA,
        dias_castigo: DIAS_CASTIGO,
        texto: 'Si te atrasas se cobra un ' + (TASA_MORA_DIARIA * 100) +
               '% diario sobre el capital. Pero atrasarte NO te baja de nivel, NO te borra la ' +
               'garantía y NO te cierra la puerta: puedes volver a pedir. Lo único que pasa a los ' +
               DIAS_CASTIGO + ' días es si no abonaste ni un peso, y ni ahí se pierde la garantía: ' +
               'se congela hasta que vuelvas.'
      },
      /* 4-ago-2026 — acá decía "se puede aplazar pagando el costo", y ya no es
         verdad: desde que la prórroga dejó de borrar el recargo, lo que se paga
         es el costo de la quincena MÁS el 1% diario que se haya causado hasta
         ese día. Que la app diga lo que de verdad va a pasar, con los mismos
         números que hacen la cuenta. */
      prorroga: {
        texto: 'Si llegado el día no puedes pagar todo, se puede aplazar: pagas el costo de la ' +
               'quincena y, si ya venías atrasado, el ' + (TASA_MORA_DIARIA * 100) +
               '% diario que se haya causado hasta ese día. Con eso tu pago pasa al siguiente ' +
               'corte, que siempre queda adelante en el calendario. También se puede pasar a un ' +
               'plan de pagos en ' + CUOTAS_PLAN_DE_PAGOS + ' cortes con un costo reducido del ' +
               (TASA_PLAN_DE_PAGOS * 100) + '%.'
      }
    };
  }

  /* ------------------------------------------- §3 garantía por tus datos */

  function hayDato(v) {
    if (v == null || v === false) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }

  /**
   * §3 (nueva versión) — Cupón que la plataforma le presta al socio según la
   * información que ya entregó. Completando los 15 datos llega a 200.000.
   *
   * @param {object} datos  claves de DATOS_KYC con lo que el socio haya dado
   * @returns {{total:number, maximo:number, porcentaje:number,
   *            completos:Array, faltantes:Array, siguiente:object|null}}
   */
  function garantiaPorDatos(datos) {
    datos = datos || {};
    if (typeof datos !== 'object') throw new TypeError('datos: se esperaba un objeto');
    var total = 0, completos = [], faltantes = [];
    DATOS_KYC.forEach(function (d) {
      var item = { id: d.id, etiqueta: d.etiqueta, ayuda: d.ayuda, tipo: d.tipo, valor: d.valor };
      if (hayDato(datos[d.id])) { total += d.valor; completos.push(item); }
      else faltantes.push(item);
    });
    // El que más garantía suelta va primero: es el que conviene pedirle.
    var orden = faltantes.slice().sort(function (a, b) { return b.valor - a.valor; });
    return {
      total: total,
      maximo: CUPON_KYC_MAXIMO,
      porcentaje: Math.round(total / CUPON_KYC_MAXIMO * 100),
      completos: completos,
      faltantes: faltantes,
      siguiente: orden.length ? orden[0] : null
    };
  }

  /**
   * Garantía por referidos: 5.000 por cada uno, pero SOLO cuando ese referido
   * ya pagó un crédito. Traer gente que no paga no suma.
   *
   * @param {Array} referidos  [{nombre, pago_puntual|pago}]  o un número de
   *        referidos que ya pagaron.
   */
  function garantiaPorReferidos(referidos) {
    if (esNumero(referidos)) {
      return enteroNoNegativo(referidos, 'referidos') * GARANTIA_POR_REFERIDO;
    }
    if (!Array.isArray(referidos)) {
      if (referidos == null) return 0;
      throw new TypeError('referidos: se esperaba una lista o un número, llegó ' + describir(referidos));
    }
    var cuentan = referidos.filter(function (r) {
      return !!(r && (r.pago_puntual === true || r.pago === true));
    });
    return cuentan.length * GARANTIA_POR_REFERIDO;
  }

  /**
   * Garantía total del socio, con sus tres fuentes a la vista. Es lo que la
   * app le muestra desglosado para que entienda de dónde le sale cada peso.
   */
  function garantiaTotal(entrada) {
    entrada = entrada || {};
    var porDatos = garantiaPorDatos(entrada.datos).total;
    var porReferidos = garantiaPorReferidos(entrada.referidos);
    var acumulada = numeroNoNegativo(entrada.acumulada == null ? 0 : entrada.acumulada, 'acumulada');
    // Ajuste a mano de Joan al migrar (§13): puede sumar o restar, pero la
    // garantía total nunca queda negativa.
    var ajuste = entrada.ajuste == null ? 0 : numeroFinito(entrada.ajuste, 'ajuste');
    var total = Math.max(0, porDatos + porReferidos + acumulada + ajuste);
    return {
      cupon: porDatos,
      referidos: porReferidos,
      acumulada: acumulada,
      ajuste: ajuste,
      total: total
    };
  }

  /* ------------------------------------------------------- §4 garantía */

  /**
   * Garantía que deja un costo pagado.
   *
   * TODO lo que el socio paga suma —crédito, prórroga, recargo de mora, cuotas
   * del plan de pagos—, esté al día o atrasado. El §4 original (donde la mora
   * congelaba la acumulación) sigue derogado: nadie deja de sumar.
   *
   * Lo que cambia (29-jul-2026) es cuánto: en fecha suma el 100% del costo,
   * tarde suma el 50%. Es un bono al puntual, no una multa al que se atrasa.
   *
   * @param {number} costoPagado
   * @param {boolean} [pagoFueATiempo]  si se omite, se asume puntual.
   * @returns {number} incremento de garantia_acumulada (entero, COP).
   */
  function acumularGarantia(costoPagado, pagoFueATiempo) {
    var costo = numeroNoNegativo(costoPagado, 'costoPagado');
    if (pagoFueATiempo !== undefined && typeof pagoFueATiempo !== 'boolean') {
      throw new TypeError('pagoFueATiempo: se esperaba true o false, llegó ' + describir(pagoFueATiempo));
    }
    var factor = pagoFueATiempo === false ? FACTOR_GARANTIA_MORA : FACTOR_GARANTIA;
    return Math.round(costo * factor);
  }

  /* ------------------------------------------------------------ §9 mora */

  /** Días corridos de mora. Negativo = todavía falta para el corte. */
  function diasDeMora(fechaCorte, fechaPago) {
    return diasEntre(
      aFechaLocal(fechaCorte, 'fechaCorte'),
      aFechaLocal(fechaPago, 'fechaPago')
    );
  }

  /** §9 — Tramo de gestión según los días corridos desde el corte. */
  function tramoDeMora(dias) {
    if (!esNumero(dias)) throw new TypeError('dias: se esperaba un número, llegó ' + describir(dias));
    for (var i = TRAMOS_MORA.length - 1; i >= 0; i--) {
      if (dias >= TRAMOS_MORA[i].desde) return TRAMOS_MORA[i];
    }
    return TRAMOS_MORA[0];
  }

  /**
   * Recargo por mora: 1% diario simple sobre la base (por defecto el capital).
   * Días negativos o cero → 0. No compone y no tiene tope propio: el tope, si
   * se quiere, entra por `topeDias` (D9).
   */
  function recargoPorMora(base, dias, opciones) {
    opciones = opciones || {};
    var b = numeroNoNegativo(base, 'base');
    if (!esNumero(dias)) throw new TypeError('dias: se esperaba un número, llegó ' + describir(dias));
    var d = dias;
    if (d <= 0) return 0;
    if (opciones.topeDias != null) d = Math.min(d, numeroNoNegativo(opciones.topeDias, 'topeDias'));
    var tasa = opciones.tasaDiaria != null ? numeroNoNegativo(opciones.tasaDiaria, 'tasaDiaria') : TASA_MORA_DIARIA;
    return Math.round(b * tasa * d);
  }

  /**
   * §9-bis — EL RECARGO YA CAUSADO NO SE RECALCULA (4-ago-2026).
   *
   * El 1% diario se apoya en el capital vigente. Si dentro del ciclo entra un
   * ABONO A CAPITAL, ese capital baja, y recalcular el recargo entero sobre lo
   * que QUEDÓ borra hacia atrás los días que ya corrieron sobre el capital que
   * HABÍA: con 200.000 a 20 días, abonar 199.999 dejaba el recargo en cero
   * (1% × 1 peso × 20 días = 0,2 → 0).
   *
   * Lo causado ya está causado: hasta `diasCausados` vale `recargoCausado`, y
   * de ahí en adelante corre el 1% diario sobre la base que quedó. Es justo en
   * las dos direcciones: no se borra lo corrido, y tampoco se le cobra mora al
   * socio sobre plata que ya devolvió.
   *
   * @param {number} recargoCausado  recargo ya corrido, congelado
   * @param {number} diasCausados    días de mora que ese recargo ya cubre
   * @param {number} base            capital que quedó vigente
   * @param {number} dias            días de mora totales a la fecha de pago
   */
  function recargoPorMoraDesde(recargoCausado, diasCausados, base, dias, opciones) {
    var causado = numeroNoNegativo(recargoCausado, 'recargoCausado');
    var dc = numeroNoNegativo(diasCausados, 'diasCausados');
    if (!esNumero(dias)) throw new TypeError('dias: se esperaba un número, llegó ' + describir(dias));
    return Math.round(causado) + recargoPorMora(base, Math.max(0, dias - dc), opciones);
  }

  /**
   * Liquida un crédito en la fecha en que el socio paga: días de mora, recargo
   * del 1% diario, total a pagar y garantía generada por todo eso.
   *
   * @param {object} credito   {capital, tasa_aplicada, costo, fecha_corte}
   * @param {Date|string} fechaPago
   * @param {object} [opciones] {baseMora, topeDias, tasaDiaria, recargoCausado,
   *   diasCausados}. `recargoCausado`/`diasCausados` son para el crédito que
   *   recibió abonos a capital dentro del ciclo (ver recargoPorMoraDesde).
   */
  function liquidarCredito(credito, fechaPago, opciones) {
    opciones = opciones || {};
    if (!credito || typeof credito !== 'object') {
      throw new TypeError('credito: se esperaba el objeto del crédito');
    }
    var capital = numeroPositivo(credito.capital, 'credito.capital');
    var costo = credito.costo != null
      ? numeroNoNegativo(credito.costo, 'credito.costo')
      : Math.round(capital * numeroPositivo(credito.tasa_aplicada, 'credito.tasa_aplicada'));

    var corte = aFechaLocal(credito.fecha_corte, 'credito.fecha_corte');
    var pago = aFechaLocal(fechaPago, 'fechaPago');
    var dias = diasEntre(corte, pago);
    var diasMora = Math.max(0, dias);

    var base = opciones.baseMora != null
      ? numeroNoNegativo(opciones.baseMora, 'opciones.baseMora')
      : capital; // D9
    var recargo = opciones.recargoCausado != null
      ? recargoPorMoraDesde(opciones.recargoCausado,
          opciones.diasCausados == null ? 0 : opciones.diasCausados, base, diasMora, opciones)
      : recargoPorMora(base, diasMora, opciones);
    var costoTotal = costo + recargo;
    var aTiempo = diasMora === 0;

    return {
      fecha_corte: iso(corte),
      fecha_pago: iso(pago),
      dias_mora: diasMora,
      pago_a_tiempo: aTiempo,
      tramo: tramoDeMora(dias).tramo,
      capital: capital,
      costo: costo,
      recargo_mora: recargo,
      tasa_mora_diaria: opciones.tasaDiaria != null ? opciones.tasaDiaria : TASA_MORA_DIARIA,
      base_mora: base,
      costo_total_pagado: costoTotal,
      total_a_pagar: capital + costoTotal,
      garantia_generada: acumularGarantia(costoTotal, aTiempo),
      // Lo que habría ganado pagando en fecha, para poder mostrárselo.
      garantia_si_puntual: acumularGarantia(costo, true),
      supera_dias_castigo: diasMora >= DIAS_CASTIGO // §6: a los 90 días se castiga
    };
  }

  /* --------------------------------------------------------- §5 niveles */

  /**
   * §5 — Nivel de socio derivado de los contadores. Gana el nivel más alto
   * cuyos propios requisitos se cumplan (D4).
   *
   * EL NIVEL NUNCA BAJA (27-jul-2026): pasá `nivelAlcanzado` —el nivel más alto
   * que el socio haya tenido, guardado en `garantia.nivel_socio`— y funciona
   * como piso. Una mora puede frenar la subida, nunca provocar una caída.
   *
   * @param {string} [nivelAlcanzado] piso; si se omite, se deriva puro.
   * @returns {'bronce'|'plata'|'oro'|'platino'}
   */
  function evaluarNivel(creditosPagadosATiempo, rachaActual, mesesSinMora, nivelAlcanzado) {
    var pagos = enteroNoNegativo(creditosPagadosATiempo, 'creditosPagadosATiempo');
    var racha = enteroNoNegativo(rachaActual, 'rachaActual');
    var meses = numeroNoNegativo(mesesSinMora, 'mesesSinMora');

    var r = REQUISITOS_NIVEL, derivado;
    if (pagos >= r.platino.pagos_a_tiempo && meses >= r.platino.meses_sin_mora) derivado = 'platino';
    else if (pagos >= r.oro.pagos_a_tiempo && racha >= r.oro.racha) derivado = 'oro';
    else if (pagos >= r.plata.pagos_a_tiempo) derivado = 'plata';
    else derivado = 'bronce';

    if (nivelAlcanzado == null) return derivado;
    var piso = normalizarNivel(nivelAlcanzado, 'nivelAlcanzado');
    return NIVELES.indexOf(piso) > NIVELES.indexOf(derivado) ? piso : derivado;
  }

  /**
   * "Así pagues en mora, Joan siempre te va a prestar" (27-jul-2026).
   * Estar en mora YA NO bloquea pedir de nuevo — el §9 queda derogado en ese
   * punto. Lo único que frena es no tener KYC o estar suspendido por castigo.
   *
   * @param {object} socio {nivel_kyc, estado, garantia_total, nivel_socio}
   * @returns {{ok:boolean, motivo:string|null, cupo:number}}
   */
  function puedeSolicitar(socio) {
    if (!socio || typeof socio !== 'object') {
      throw new TypeError('socio: se esperaba el objeto del socio');
    }
    var kyc = enteroNoNegativo(socio.nivel_kyc == null ? 0 : socio.nivel_kyc, 'socio.nivel_kyc');
    var estado = socio.estado == null ? 'activo' : socio.estado;
    var garantia = numeroNoNegativo(socio.garantia_total == null ? 0 : socio.garantia_total, 'socio.garantia_total');
    var nivel = normalizarNivel(socio.nivel_socio || 'bronce', 'socio.nivel_socio');

    if (kyc < 1) {
      return { ok: false, motivo: 'kyc_incompleto', cupo: 0 };
    }
    if (estado === 'suspendido' || estado === 'vetado') {
      return { ok: false, motivo: 'castigo_sin_abonos', cupo: 0 };
    }
    return { ok: true, motivo: null, cupo: calcularCupo(garantia, nivel) };
  }

  /**
   * §6 — Castigo, ya solo para el que NO ha abonado nada a los 90 días.
   * La garantía no se borra nunca: se congela hasta que el socio vuelva.
   *
   * @param {object} credito {capital, fecha_corte, abonado}
   * @param {Date|string} fechaEvaluacion
   */
  function evaluarCastigo(credito, fechaEvaluacion, opciones) {
    opciones = opciones || {};
    if (!credito || typeof credito !== 'object') {
      throw new TypeError('credito: se esperaba el objeto del crédito');
    }
    var dias = Math.max(0, diasDeMora(credito.fecha_corte, fechaEvaluacion));
    var abonado = numeroNoNegativo(credito.abonado == null ? 0 : credito.abonado, 'credito.abonado');
    var topeDias = opciones.diasCastigo != null
      ? numeroNoNegativo(opciones.diasCastigo, 'opciones.diasCastigo') : DIAS_CASTIGO;

    var castigado = dias >= topeDias && abonado === 0;
    return {
      castigado: castigado,
      dias_mora: dias,
      abonado: abonado,
      // Nunca 'a_cero': la garantía ganada es del historial del socio.
      garantia: castigado ? 'congelada' : 'activa',
      estado_sugerido: castigado ? 'suspendido' : (dias > 0 ? 'en_mora' : 'vigente'),
      motivo: castigado
        ? 'Sin ningún abono a los ' + dias + ' días. Garantía congelada, no perdida.'
        : (abonado > 0 && dias >= topeDias
          ? 'Lleva ' + dias + ' días pero ha abonado: no se castiga.'
          : null)
    };
  }

  /* ------------------------------------------------ simulador de crédito */

  /**
   * Simula un crédito. Con el costo fijo en 20% ya no hay tasas que comparar:
   * lo único que la garantía decide es CUÁNTO puede pedir. Así que la
   * simulación responde otra pregunta — ¿le alcanza el cupo?, ¿cuánto le falta
   * de garantía si no?, ¿cuánto le sube el cupo al pagarlo?
   *
   * @param {number} capital            lo que quiere pedir
   * @param {number} garantiaDisponible su garantía de hoy
   * @param {object} [opciones] {nivelSocio, fechaDesembolso}
   */
  function simularCredito(capital, garantiaDisponible, opciones) {
    opciones = opciones || {};
    var c = numeroPositivo(capital, 'capital');
    var g = numeroNoNegativo(garantiaDisponible, 'garantiaDisponible');
    var nivel = normalizarNivel(opciones.nivelSocio || 'bronce', 'opciones.nivelSocio');

    var costo = calcularCosto(c);
    var deja = acumularGarantia(costo, true);
    var cupo = calcularCupo(g, nivel);
    var necesaria = garantiaNecesariaPara(c, nivel);

    return {
      capital: c,
      tasa: TASA_CREDITO,
      costo: costo,
      total_a_pagar: c + costo,
      garantia_disponible: g,
      cupo: cupo,
      dentro_del_cupo: c <= cupo,
      // Si se pasa: cuánta garantía necesitaría para que le alcanzara.
      garantia_necesaria: necesaria,
      falta_garantia: Math.max(0, necesaria - g),
      // Lo que el crédito le devuelve al pagarlo.
      garantia_que_deja: deja,
      garantia_despues: g + deja,
      cupo_despues: calcularCupo(g + deja, nivel),
      fecha_corte: opciones.fechaDesembolso ? calcularFechaCorte(opciones.fechaDesembolso) : null
    };
  }

  /**
   * Cómo crece la garantía si el socio repite un crédito del mismo tamaño.
   * Sirve para mostrarle el camino en vez de pedirle que se lo imagine.
   */
  function proyectarCrecimiento(garantiaInicial, capital, vueltas, nivelSocio, opcionesCrecimiento) {
    opcionesCrecimiento = opcionesCrecimiento || {};
    var g = numeroNoNegativo(garantiaInicial, 'garantiaInicial');
    var c = numeroPositivo(capital, 'capital');
    var n = enteroNoNegativo(vueltas == null ? 6 : vueltas, 'vueltas');
    var nivel = normalizarNivel(nivelSocio || 'bronce');
    var pasos = [];
    for (var i = 1; i <= n; i++) {
      // Cada vuelta pide todo el cupo que tiene en ese momento: así se ve la
      // escalera de verdad, no un crédito del mismo tamaño repetido.
      var pide = opcionesCrecimiento.pideElCupo ? Math.max(c, calcularCupo(g, nivel)) : c;
      var costo = calcularCosto(pide);
      var gana = acumularGarantia(costo, true);
      g += gana;
      pasos.push({
        credito: i, capital: pide, costo: costo,
        garantia_ganada: gana, garantia: g, cupo: calcularCupo(g, nivel)
      });
    }
    return pasos;
  }

  /* ------------------------------------------------------- §8 prórrogas */

  /**
   * §8 — Plan de pagos: el capital repartido en 3 cortes, con costo fijo del
   * 5% sobre el saldo insoluto de cada corte. El primer corte del plan es el
   * siguiente al corte actual del crédito.
   */
  function construirPlanDePagos(credito, opciones) {
    opciones = opciones || {};
    if (!credito || typeof credito !== 'object') {
      throw new TypeError('credito: se esperaba el objeto del crédito');
    }
    var base = opciones.saldoCapital != null ? opciones.saldoCapital
      : (credito.saldo_capital != null ? credito.saldo_capital : credito.capital);
    numeroPositivo(base, 'saldoCapital');

    var n = CUOTAS_PLAN_DE_PAGOS;
    /* 4-ago-2026 — DESDE DÓNDE ARRANCA EL PLAN.
       Las fechas salían siempre del corte del crédito. A un crédito con 35 días
       de mora eso le armaba un plan cuya primera —y a veces segunda— cuota ya
       había vencido: nacía vencido y con recargo corriendo desde el día uno.
       `opciones.desde` deja que quien lo ofrece diga en qué fecha se está
       pactando; sin ella se conserva el comportamiento de siempre. */
    var desde = opciones.desde != null ? opciones.desde : credito.fecha_corte;
    var fechas = cortesSiguientes(desde, n);
    var cuotaBase = Math.floor(base / n);
    var cuotas = [], saldo = base, totalCosto = 0, totalPagar = 0, totalGarantia = 0;

    for (var i = 0; i < n; i++) {
      // La última cuota absorbe el resto de la división, para no perder pesos.
      var capital = (i === n - 1) ? saldo : cuotaBase;
      var costo = Math.round(saldo * TASA_PLAN_DE_PAGOS);
      var gana = acumularGarantia(costo, true);
      cuotas.push({
        numero: i + 1,
        fecha_corte: fechas[i],
        saldo_insoluto: saldo,
        capital: capital,
        costo: costo,
        total: capital + costo,
        garantia_generada: gana
      });
      totalCosto += costo;
      totalPagar += capital + costo;
      totalGarantia += gana;
      saldo -= capital;
    }

    return {
      tasa_por_corte: TASA_PLAN_DE_PAGOS,
      cuotas: cuotas,
      total_capital: base,
      total_costo: totalCosto,
      total_a_pagar: totalPagar,
      genera_garantia: true,          // cambio 26-jul-2026: el plan también acumula
      total_garantia: totalGarantia
    };
  }

  /* --------------------------------------------------------------------------
     4-ago-2026, tarde — LAS TRES PREGUNTAS DE LA PRÓRROGA, EN EL MOTOR.

     El Panel se había escrito su propia versión de esto: su `proximaQuincena`
     no conoce la ventana mínima de 5 días (§7.3) ni el corrimiento por domingo
     o festivo (§7.1). Medido sobre los 24 cortes de 2026 contra los 365 días
     del año: el Panel y el motor daban fechas DISTINTAS en 2.283 de las 8.760
     combinaciones, repartidas en 330 de los 365 días. Y en 92 de esos días la
     prórroga ni siquiera compraba la ventana mínima: registrada un día 14
     cobraba el 20% del capital y compraba UN día.
     Ahora las tres cosas que hay que saber para prorrogar —a qué fecha pasa,
     cuántas le quedan y cuánto se cobra— viven acá, y el Panel las PREGUNTA.
     ------------------------------------------------------------------------ */

  /**
   * §8 — A qué corte pasa un crédito al prorrogarlo.
   *
   * Es el MÁS LEJANO de los dos candidatos: el corte que sigue al corte viejo
   * (para que prorrogar antes de tiempo igual corra el corte) y el que sigue al
   * día en que se registra la prórroga (para que el corte nuevo caiga siempre
   * en el futuro, que es lo único que el socio está comprando). Las dos salen
   * de calcularFechaCorte, así que las dos respetan la ventana mínima, los
   * domingos y los festivos.
   *
   * @param {Date|string} fechaCorteActual
   * @param {Date|string} [fechaProrroga]  si se omite, el propio corte.
   * @returns {string} "YYYY-MM-DD"
   */
  function fechaCorteProrroga(fechaCorteActual, fechaProrroga) {
    var corte = aFechaLocal(fechaCorteActual, 'fechaCorteActual');
    var nuevo = calcularFechaCorte(corte);
    if (fechaProrroga != null) {
      var desdeLaProrroga = calcularFechaCorte(aFechaLocal(fechaProrroga, 'fechaProrroga'));
      if (desdeLaProrroga > nuevo) nuevo = desdeLaProrroga;
    }
    return nuevo;
  }

  /** §5 y §8 — cuántas prórrogas admite un nivel, con el tope duro aplicado. */
  function prorrogasPermitidas(nivelSocio) {
    return Math.min(PRORROGAS_POR_NIVEL[normalizarNivel(nivelSocio)], TOPE_DURO_PRORROGAS);
  }

  /* La tasa y el nivel de una prórroga se resuelven en un solo lugar, para que
     aplicarProrroga y liquidarProrroga no puedan contestar cosas distintas. */
  function tasaDeProrroga(credito, opciones) {
    /* La prórroga cuesta lo mismo que el crédito. Los créditos nuevos van todos
       al 20%; a los que se pactaron con otra tasa se les respeta la suya, que
       para eso se guardó (subirles el precio a mitad de camino sería cambiarles
       las reglas después de haberles prestado). */
    var tasa = opciones.tasaVigente != null ? opciones.tasaVigente
             : (credito.tasa_aplicada != null ? credito.tasa_aplicada : TASA_CREDITO);
    numeroPositivo(tasa, 'credito.tasa_aplicada');
    if (tasa > 1) throw new RangeError('credito.tasa_aplicada: se esperaba decimal (0.20), llegó ' + tasa);
    return tasa;
  }

  function nivelDeProrroga(credito, opciones) {
    return normalizarNivel(opciones.nivelSocio || credito.nivel_socio || 'bronce', 'nivelSocio');
  }

  /**
   * §8 — TODO lo que hay que saber para cobrar una prórroga en una fecha dada.
   *
   * aplicarProrroga contesta qué le pasa al CRÉDITO; esta contesta qué le pasa
   * a la PLATA, que es lo que el Panel tiene que poner en la pantalla y en el
   * mensaje al socio: el costo del ciclo, el recargo del 1% diario ya causado
   * (que la prórroga no borra), el total que se cobra hoy y la garantía que le
   * deja, cada parte con su propio factor de puntualidad (§4).
   *
   * Cuando ya no le quedan prórrogas devuelve ok:false CON las cuentas igual
   * hechas y con el plan de pagos armado desde la fecha en que se está
   * pactando, que es la salida obligatoria del §8.
   *
   * @param {object} credito {capital, tasa_aplicada, costo, fecha_corte, estado,
   *                          prorrogas_usadas, nivel_socio, id}. `costo` manda
   *                          sobre capital × tasa cuando el ciclo ya tenía un
   *                          costo causado (abonos a capital de por medio).
   * @param {Date|string} [fechaProrroga] el día en que se registra; por defecto
   *                                      el propio corte (o sea, puntual).
   * @param {object} [opciones] {tasaVigente, nivelSocio, topeDias, tasaDiaria,
   *                             recargoCausado, diasCausados}
   */
  function liquidarProrroga(credito, fechaProrroga, opciones) {
    opciones = opciones || {};
    if (!credito || typeof credito !== 'object') {
      throw new TypeError('credito: se esperaba el objeto del crédito');
    }
    var capital = numeroPositivo(credito.capital, 'credito.capital');
    var corte = aFechaLocal(credito.fecha_corte, 'credito.fecha_corte');
    var fecha = fechaProrroga != null
      ? aFechaLocal(fechaProrroga, 'fechaProrroga') : corte;

    var opc = {};
    for (var k in opciones) if (Object.prototype.hasOwnProperty.call(opciones, k)) opc[k] = opciones[k];
    opc.fecha = iso(fecha);
    // El plan, si hace falta, arranca en el corte siguiente a la fecha en que
    // se está pactando: nunca en cuotas que ya vencieron.
    if (opc.desde == null) opc.desde = iso(fecha) > iso(corte) ? iso(fecha) : iso(corte);

    var r = aplicarProrroga(credito, opc);

    var tasa = tasaDeProrroga(credito, opciones);
    var nivel = nivelDeProrroga(credito, opciones);
    var usadas = enteroNoNegativo(
      credito.prorrogas_usadas == null ? 0 : credito.prorrogas_usadas, 'credito.prorrogas_usadas');
    var permitidas = prorrogasPermitidas(nivel);

    /* 4-ago-2026 — el costo del ciclo y el recargo pueden venir DADOS, y por la
       misma razón que en liquidarCredito: si dentro del ciclo entró un abono a
       capital, las dos cosas ya estaban causadas y no pueden recalcularse sobre
       el capital que quedó. Sin esto, abonar el capital menos un peso dejaba la
       prórroga en CERO y, al mover el corte, se llevaba por delante el costo y
       la mora del ciclo viejo. */
    var costo = credito.costo != null
      ? Math.round(numeroNoNegativo(credito.costo, 'credito.costo'))
      : Math.round(capital * tasa);
    var dias = Math.max(0, diasEntre(corte, fecha));
    var recargo = opciones.recargoCausado != null
      ? recargoPorMoraDesde(opciones.recargoCausado,
          opciones.diasCausados == null ? 0 : opciones.diasCausados, capital, dias, opciones)
      : recargoPorMora(capital, dias, opciones);
    var aTiempo = dias === 0;
    /* El costo con su factor de puntualidad y el recargo SIEMPRE al 45%: es
       plata que solo existe porque el corte ya había pasado. Es la misma cuenta
       que hace el puente sobre la prórroga ya guardada, y a propósito. */
    var garantia = acumularGarantia(costo, aTiempo) + acumularGarantia(recargo, false);
    var total = costo + recargo;

    return {
      ok: r.ok,
      motivo: r.ok ? null : r.motivo,
      detalle: r.ok ? null : r.detalle,
      capital: capital,
      tasa: tasa,
      nivel_socio: nivel,
      fecha: iso(fecha),
      fecha_corte_anterior: iso(corte),
      fecha_corte_nueva: r.ok ? r.fecha_corte_nueva : null,
      dias_mora: dias,
      a_tiempo: aTiempo,
      costo_prorroga: costo,
      recargo_mora: recargo,
      total_a_pagar: total,
      garantia_generada: garantia,
      prorrogas_usadas: usadas,
      prorrogas_permitidas: permitidas,
      prorrogas_restantes: r.ok ? r.prorrogas_restantes : 0,
      credito: r.credito,
      plan_de_pagos: r.ok ? null : r.plan_de_pagos,
      // El movimiento que se guarda, con el recargo aparte para que después se
      // pueda acreditar al 45% sin degradar el costo.
      movimiento: {
        credito_id: credito.id == null ? null : credito.id,
        tipo: r.ok ? 'costo_prorroga' : 'entrada_plan_de_pagos',
        fecha: iso(fecha),
        ciclo: iso(corte),
        monto: total,
        mora: recargo,
        aTiempo: aTiempo,
        diasMora: dias,
        nuevoCiclo: r.ok ? r.fecha_corte_nueva : null,
        garantia_generada: garantia
      }
    };
  }

  /**
   * §5 — ¿Este crédito cuenta como "pagado a tiempo" para SUBIR DE NIVEL?
   *
   * 4-ago-2026. La prórroga corre el corte al futuro, así que el que pagaba al
   * día siguiente de prorrogar quedaba registrado como PAGADO EN FECHA por muy
   * atrasado que estuviera. Medido: cinco créditos pagados 15 días tarde cada
   * uno, lavados con prórroga, subían al socio de bronce (367.500 de cupo) a
   * ORO (1.062.500). Tres veces más plata en la calle por el mismo
   * comportamiento de pago.
   *
   * La regla separa "no te castigo" de "no te premio", que es justo lo que pide
   * la promesa del producto:
   *   · NO SE LE QUITA NADA — la garantía que pagó suma igual (con su factor de
   *     puntualidad, §4), el nivel no baja nunca y puede volver a pedir.
   *   · NO SE LE REGALA NADA — el premio del que pagó en fecha (el escalón de
   *     nivel) es del que pagó en fecha. Un crédito que necesitó prórroga o
   *     plan de pagos no lo gana.
   *
   * @param {object} credito {pagado_en_fecha, prorrogas_usadas, plan_de_pagos}
   */
  function cuentaComoPuntual(credito) {
    if (!credito || typeof credito !== 'object') {
      throw new TypeError('credito: se esperaba el objeto del crédito');
    }
    var usadas = enteroNoNegativo(
      credito.prorrogas_usadas == null ? 0 : credito.prorrogas_usadas,
      'credito.prorrogas_usadas');
    if (credito.pagado_en_fecha !== true) return false;
    if (usadas > 0) return false;
    return credito.plan_de_pagos !== true;
  }

  /**
   * §8 — Aplica una prórroga a un crédito.
   *
   * Costo = capital × tasa vigente, cobrado aparte (D5) y sin generar
   * garantía. El corte se mueve al siguiente. Máximo por nivel (§5) con tope
   * duro de 2 (§8); al agotarlas devuelve ok:false con el plan de pagos ya
   * armado, que es la salida obligatoria del documento.
   *
   * No muta el crédito recibido: devuelve una copia actualizada.
   *
   * @param {object} credito  {capital, tasa_aplicada, fecha_corte, estado,
   *                           prorrogas_usadas, nivel_socio, id}
   * @param {object} [opciones] {tasaVigente, nivelSocio, fecha}
   * @returns {{ok:boolean}} ok:true  → {credito, movimiento, costo_prorroga, prorrogas_restantes}
   *                         ok:false → {motivo, plan_de_pagos, credito}
   */
  function aplicarProrroga(credito, opciones) {
    opciones = opciones || {};
    if (!credito || typeof credito !== 'object') {
      throw new TypeError('credito: se esperaba el objeto del crédito');
    }

    var capital = numeroPositivo(credito.capital, 'credito.capital');
    var tasa = tasaDeProrroga(credito, opciones);
    var nivel = nivelDeProrroga(credito, opciones);
    var usadas = enteroNoNegativo(
      credito.prorrogas_usadas == null ? 0 : credito.prorrogas_usadas,
      'credito.prorrogas_usadas'
    );
    var estado = credito.estado == null ? 'en_corte' : credito.estado;
    if (ESTADOS_SIN_PRORROGA.indexOf(estado) !== -1) {
      throw new Error('No se puede prorrogar un crédito en estado "' + estado + '"');
    }

    var corteActual = aFechaLocal(credito.fecha_corte, 'credito.fecha_corte');
    var permitidas = prorrogasPermitidas(nivel);

    if (usadas >= permitidas) {
      return {
        ok: false,
        motivo: 'prorrogas_agotadas',
        detalle: 'Nivel ' + nivel + ': ' + permitidas + ' prórroga(s). Pasa a plan de pagos (§8).',
        prorrogas_usadas: usadas,
        prorrogas_permitidas: permitidas,
        credito: credito, // intacto
        plan_de_pagos: construirPlanDePagos(credito, opciones)
      };
    }

    var costo = Math.round(capital * tasa);
    var fechaMovimiento = opciones.fecha != null
      ? iso(aFechaLocal(opciones.fecha, 'opciones.fecha'))
      : iso(corteActual);

    /* 4-ago-2026 — UNA PRÓRROGA TIENE QUE COMPRAR TIEMPO DE VERDAD.
       El corte nuevo salía de calcularFechaCorte(corteActual): el corte
       siguiente al corte VIEJO. Con más de una quincena de atraso ese corte ya
       había pasado, así que el socio pagaba la prórroga y quedaba en mora en el
       mismo instante, con recargo nuevo corriendo sobre días que acababa de
       pagar. Compraba cero días y pagaba dos veces los mismos.
       El corte nuevo es el MÁS LEJANO de los dos candidatos: el que sigue al
       corte viejo y el que sigue al día en que se registra la prórroga. Así
       siempre cae en el futuro (calcularFechaCorte ya respeta la ventana
       mínima) y el recargo nuevo arranca donde terminó el que ya se cobró: ni
       un día repetido, ni un día regalado.
       La regla vive en fechaCorteProrroga, que es la que también consulta el
       Panel: si estuviera escrita acá adentro, el Panel tendría que copiarla. */
    var nuevoCorte = fechaCorteProrroga(corteActual, fechaMovimiento);

    /* 4-ago-2026 — y el costo acredita con el MISMO factor de puntualidad que
       cualquier otro pago (§4). Acreditarlo siempre al 90%, incluso registrado
       con veinte días de atraso, hacía que DEJAR la prórroga dejara más
       garantía que SALDAR la deuda ese mismo día: plata prestada al peor
       pagador y una lección al revés. Lo ya ganado no se toca —el factor se
       congela el día en que se paga y nada posterior lo baja—, pero pagar
       tarde no puede rendir más que pagar a tiempo. */
    var prorrogaATiempo = fechaMovimiento <= iso(corteActual);

    var actualizado = {};
    for (var k in credito) if (Object.prototype.hasOwnProperty.call(credito, k)) actualizado[k] = credito[k];
    actualizado.estado = 'vigente';            // §6: en_corte → prorrogado → vigente
    actualizado.fecha_corte = nuevoCorte;
    actualizado.fecha_corte_anterior = iso(corteActual);
    actualizado.prorrogas_usadas = usadas + 1;

    return {
      ok: true,
      credito: actualizado,
      costo_prorroga: costo,
      // cambio 26-jul-2026: sí acumula · 4-ago-2026: con su factor de puntualidad
      garantia_generada: acumularGarantia(costo, prorrogaATiempo),
      prorroga_a_tiempo: prorrogaATiempo,
      fecha_corte_anterior: iso(corteActual),
      fecha_corte_nueva: nuevoCorte,
      prorrogas_restantes: permitidas - (usadas + 1),
      movimiento: {
        credito_id: credito.id == null ? null : credito.id,
        tipo: 'costo_prorroga',
        monto: costo,
        fecha: fechaMovimiento,
        nota: 'Prórroga ' + (usadas + 1) + '/' + permitidas + ': corte ' +
          iso(corteActual) + ' → ' + nuevoCorte,
        genera_garantia: true,
        garantia_generada: acumularGarantia(costo, prorrogaATiempo)
      },
      plan_de_pagos: null
    };
  }

  /* ==========================================================================
   * PRODUCTO 2 — préstamo con garantía (2-ago-2026, pedido de Joan)
   *
   * La garantía deja de ser un solo número y pasa a tener dos partes que NO
   * valen lo mismo:
   *
   *   PRESTADA  el cupón por los datos y los referidos. Se la presta la
   *             plataforma para que arranque. Sirve para el CUPO quincenal y
   *             para nada más.
   *   GANADA    la que salió de pagar costos. ESTA es la única que respalda un
   *             préstamo con garantía, porque prestar contra la prestada sería
   *             prestar contra plata nuestra.
   *
   * Y aparece una tercera idea: la garantía COMPROMETIDA. Mientras un préstamo
   * con garantía está abierto, esa parte de la ganada está respaldando algo y
   * no puede respaldar dos cosas a la vez: no cuenta para el cupo quincenal ni
   * para pedir otro respaldado. Al terminar de pagarlo se libera sola.
   * ========================================================================*/

  /**
   * Las dos garantías y lo que está comprometido, todo en un solo objeto.
   * Es la fuente única: cupo quincenal, máximo respaldado y las pantallas del
   * socio salen de acá, para que no haya dos verdades sobre el mismo peso.
   *
   * @param {object} [entrada] {datos, referidos, acumulada, ajuste, comprometida}
   */
  function desglosarGarantia(entrada) {
    if (entrada == null) entrada = {};
    if (typeof entrada !== 'object') throw new TypeError('entrada: se esperaba un objeto');

    var cupon = garantiaPorDatos(entrada.datos).total;
    var referidos = garantiaPorReferidos(entrada.referidos);
    var acumulada = numeroNoNegativo(entrada.acumulada == null ? 0 : entrada.acumulada, 'acumulada');
    var ajuste = entrada.ajuste == null ? 0 : numeroFinito(entrada.ajuste, 'ajuste');
    var pedida = numeroNoNegativo(entrada.comprometida == null ? 0 : entrada.comprometida, 'comprometida');

    /* El ajuste negativo se come PRIMERO la ganada y recién después la
       prestada. Así el total de acá nunca difiere del de garantiaTotal(): son
       el mismo número partido en dos, no dos cuentas distintas. */
    var bruto = acumulada + ajuste;
    var ganada = Math.max(0, bruto);
    var prestada = Math.max(0, cupon + referidos + Math.min(0, bruto));
    var total = ganada + prestada;
    // No se puede comprometer más de lo que se ganó: si el dato viene sucio,
    // se recorta en vez de reventar, que es plata que el socio ya ve en pantalla.
    var comprometida = Math.min(pedida, ganada);

    return {
      cupon: cupon,
      referidos: referidos,
      acumulada: acumulada,
      ajuste: ajuste,
      prestada: prestada,
      ganada: ganada,
      comprometida: comprometida,
      ganada_libre: ganada - comprometida,
      total: total,
      base_cupo: Math.max(0, total - comprometida)
    };
  }

  /**
   * Lo máximo que se le puede prestar en un préstamo con garantía: su garantía
   * GANADA libre, uno a uno, sin factor de nivel.
   *
   * REGLA DE ORO: esta es la única función que produce ese número, y nunca
   * recibe `total` ni `base_cupo`. El día que alguien le pase el total, le está
   * prestando al socio contra el cupón que nosotros le regalamos.
   */
  function maximoRespaldado(entrada) {
    var d = desglosarGarantia(entrada);
    return Math.min(Math.floor(d.ganada_libre), CUPO_MAXIMO);
  }

  /**
   * El cupo del crédito quincenal, con la comprometida ya descontada.
   * `calcularCupo` y `garantiaTotal` no cambian su contrato: esta función es la
   * que sabe de las dos garantías y les pasa la base correcta.
   */
  function cupoQuincenal(entrada, nivelSocio) {
    var d = desglosarGarantia(entrada);
    var nivel = normalizarNivel(nivelSocio == null ? 'bronce' : nivelSocio, 'nivelSocio');
    return {
      cupo: calcularCupo(d.base_cupo, nivel),
      base: d.base_cupo,
      total: d.total,
      ganada: d.ganada,
      prestada: d.prestada,
      comprometida: d.comprometida,
      ganada_libre: d.ganada_libre,
      respaldo_disponible: maximoRespaldado(entrada),
      nivel: nivel,
      factor: FACTOR_CUPO[nivel]
    };
  }

  /**
   * Garantía que deja un costo pagado del préstamo con garantía: solo el 20%.
   * Es a propósito que sea tan poco. El socio elige entre plata barata y
   * crecer: el quincenal cuesta más pero le sube el cupo cuatro veces y media
   * más rápido por cada peso de costo.
   *
   * Mismo bono por puntualidad que el quincenal: tarde suma la mitad.
   */
  function acumularGarantiaRespaldada(costoPagado, pagoFueATiempo) {
    var costo = numeroNoNegativo(costoPagado, 'costoPagado');
    if (pagoFueATiempo !== undefined && typeof pagoFueATiempo !== 'boolean') {
      throw new TypeError('pagoFueATiempo: se esperaba true o false, llegó ' + describir(pagoFueATiempo));
    }
    var factor = pagoFueATiempo === false ? FACTOR_GARANTIA_RESPALDADO_MORA : FACTOR_GARANTIA_RESPALDADO;
    return Math.round(costo * factor);
  }

  function plazoRespaldadoValido(v) {
    if (!esNumero(v) || Math.floor(v) !== v || v < PLAZO_RESPALDADO_MIN || v > PLAZO_RESPALDADO_MAX) {
      throw new RangeError('plazoMeses: se esperaba un entero entre ' + PLAZO_RESPALDADO_MIN +
        ' y ' + PLAZO_RESPALDADO_MAX + ' (' + v + ')');
    }
    return v;
  }

  /**
   * Las fechas de las cuotas mensuales de un préstamo con garantía.
   *
   * No se suman 30 días ni se avanza el número del mes: se pide el doble de
   * cortes y se toma uno de cada dos. Así cada cuota cae en un corte REAL —ni
   * domingo ni festivo, y con la ventana mínima de 5 días respetada— y queda a
   * un mes de la anterior, que es cuando al socio le pagan.
   *
   * @returns {string[]} tantas fechas ISO como meses de plazo.
   */
  function calendarioRespaldado(fechaDesembolso, plazoMeses) {
    var n = plazoRespaldadoValido(plazoMeses);
    var todos = cortesSiguientes(fechaDesembolso, n * CORTES_POR_MES);
    var fechas = [];
    for (var i = CORTES_POR_MES - 1; i < todos.length; i += CORTES_POR_MES) fechas.push(todos[i]);
    return fechas;
  }

  /**
   * Simula un préstamo con garantía: cuánto sale, en cuántas cuotas, en qué
   * fechas, cuánta garantía deja y qué pasa con su cupo quincenal mientras lo
   * está pagando.
   *
   * Nunca lanza porque el capital se pase del respaldo: devuelve la simulación
   * igual con `dentro_del_respaldo:false` y cuánta garantía le falta. Al socio
   * hay que mostrarle POR QUÉ no llega, no esconderle el producto.
   *
   * @param {number} capital
   * @param {number} plazoMeses  1 a 6
   * @param {object} [entrada]   la misma forma de desglosarGarantia
   * @param {object} [opciones]  {fechaDesembolso, nivelSocio}
   */
  function simularPrestamoRespaldado(capital, plazoMeses, entrada, opciones) {
    opciones = opciones || {};
    var c = numeroPositivo(capital, 'capital');
    var n = plazoRespaldadoValido(plazoMeses);
    var d = desglosarGarantia(entrada);
    var nivel = normalizarNivel(opciones.nivelSocio || 'bronce', 'opciones.nivelSocio');

    // Plano sobre el capital original, igual que el 20% quincenal: NO corre
    // sobre saldo insoluto. Es más caro de explicar pero mucho más fácil de
    // entender, y el socio tiene que poder verificar la cuenta con la cabeza.
    var costoTotal = Math.round(c * TASA_RESPALDADO_MENSUAL * n);
    var costoMensual = Math.round(c * TASA_RESPALDADO_MENSUAL);
    var capitalCuota = Math.floor(c / n);
    var fechas = opciones.fechaDesembolso ? calendarioRespaldado(opciones.fechaDesembolso, n) : null;

    var cuotas = [], saldo = c, deja = 0;
    for (var i = 0; i < n; i++) {
      var ultima = (i === n - 1);
      // La última cuota absorbe el resto, de capital Y de costo, para que la
      // suma de las cuotas dé exactamente lo prometido arriba. Ni un peso suelto.
      var cap = ultima ? (c - capitalCuota * (n - 1)) : capitalCuota;
      var cos = ultima ? Math.max(0, costoTotal - costoMensual * (n - 1)) : costoMensual;
      var gana = acumularGarantiaRespaldada(cos, true);
      saldo -= cap;
      cuotas.push({
        numero: i + 1,
        fecha_corte: fechas ? fechas[i] : null,
        capital: cap,
        costo: cos,
        total: cap + cos,
        saldo_despues: saldo,
        garantia_generada: gana
      });
      deja += gana;
    }

    var disponible = maximoRespaldado(entrada);
    return {
      producto: 'respaldado',
      capital: c,
      plazo_meses: n,
      tasa_mensual: TASA_RESPALDADO_MENSUAL,
      costo_mensual: costoMensual,
      costo_total: costoTotal,
      total_a_pagar: c + costoTotal,
      cuota_tipica: capitalCuota + costoMensual,
      cuotas: cuotas,
      garantia_que_deja: deja,
      respaldo_disponible: disponible,
      dentro_del_respaldo: c <= disponible,
      falta_garantia_ganada: Math.max(0, c - disponible),
      garantia_comprometida: c,   // al desembolsar se compromete todo el capital
      garantia_despues: d.total + deja,
      /* Ojo con este número: se calcula sobre base_cupo (con la comprometida ya
         restada) MÁS lo que deja el respaldado, porque al terminar de pagarlo la
         comprometida vuelve a cero. Es el cupo del final del camino, y así hay
         que llamarlo en la UI: "cuando lo termines de pagar". */
      cupo_despues: calcularCupo(d.base_cupo + deja, nivel),
      primera_fecha: fechas ? fechas[0] : null,
      ultima_fecha: fechas ? fechas[n - 1] : null
    };
  }

  /**
   * Liquida UNA cuota del préstamo con garantía en la fecha en que el socio
   * paga. Espejo de liquidarCredito, para que el Panel cobre mes a mes con la
   * misma mora y la misma forma de salida.
   *
   * La base de la mora por defecto es la cuota entera (capital + costo), no el
   * capital del préstamo: lo que venció ese día es la cuota.
   *
   * @param {object} cuota {capital, costo, fecha_corte}
   * @param {Date|string} fechaPago
   * @param {object} [opciones] {tasaDiaria, topeDias, baseMora}
   */
  function liquidarCuotaRespaldada(cuota, fechaPago, opciones) {
    opciones = opciones || {};
    if (!cuota || typeof cuota !== 'object') {
      throw new TypeError('cuota: se esperaba el objeto de la cuota');
    }
    var capital = numeroPositivo(cuota.capital, 'cuota.capital');
    var costo = numeroNoNegativo(cuota.costo, 'cuota.costo');
    var corte = aFechaLocal(cuota.fecha_corte, 'cuota.fecha_corte');
    var pago = aFechaLocal(fechaPago, 'fechaPago');
    var dias = diasEntre(corte, pago);
    var diasMora = Math.max(0, dias);

    var base = opciones.baseMora != null
      ? numeroNoNegativo(opciones.baseMora, 'opciones.baseMora')
      : capital + costo;
    var recargo = recargoPorMora(base, diasMora, opciones);
    var costoTotal = costo + recargo;
    var aTiempo = diasMora === 0;

    return {
      fecha_corte: iso(corte),
      fecha_pago: iso(pago),
      dias_mora: diasMora,
      pago_a_tiempo: aTiempo,
      tramo: tramoDeMora(dias).tramo,
      capital: capital,
      costo: costo,
      recargo_mora: recargo,
      base_mora: base,
      tasa_mora_diaria: opciones.tasaDiaria != null ? opciones.tasaDiaria : TASA_MORA_DIARIA,
      costo_total_pagado: costoTotal,
      total_a_pagar: capital + costoTotal,
      garantia_generada: acumularGarantiaRespaldada(costoTotal, aTiempo),
      garantia_si_puntual: acumularGarantiaRespaldada(costo, true)
    };
  }

  /**
   * EL REPARTO 90/7/3 — contabilidad de Joan, no del socio.
   *
   * Cada peso de costo que entra se parte en tres: 90% se le vuelve garantía al
   * socio, 7% sostiene la plataforma y 3% va amortizando el cupón de 100.000
   * que se le REGALÓ para arrancar. La idea es que con el tiempo ese riesgo
   * inicial deje de existir.
   *
   * El socio no ve esto por ningún lado: para él su garantía es el 90% y punto.
   * Si esto aparece alguna vez en una pantalla del socio o en lo que sube a la
   * nube, está mal.
   *
   * @param {number} costoPagado
   * @param {object} [opciones] {aTiempo=true, producto='quincenal', cuponPendiente=Infinity}
   * @returns {{total:number, garantia_socio:number, amortiza_cupon:number, operativo:number}}
   */
  function repartirCosto(costoPagado, opciones) {
    opciones = opciones || {};
    var total = Math.round(numeroNoNegativo(costoPagado, 'costoPagado'));
    var aTiempo = opciones.aTiempo === undefined ? true : opciones.aTiempo;
    var producto = opciones.producto == null ? 'quincenal' : opciones.producto;
    if (producto !== 'quincenal' && producto !== 'respaldado') {
      throw new RangeError('producto: se esperaba "quincenal" o "respaldado", llegó ' + describir(producto));
    }
    var pendiente = opciones.cuponPendiente == null ? Infinity : opciones.cuponPendiente;
    if (pendiente !== Infinity) numeroFinito(pendiente, 'cuponPendiente');

    var garantia = producto === 'respaldado'
      ? acumularGarantiaRespaldada(total, aTiempo)
      : acumularGarantia(total, aTiempo);

    // El 3% se deja de cobrar cuando ese socio ya devolvió todo su cupón.
    var cupon = Math.min(Math.round(total * REPARTO_COSTO.cupon), Math.max(0, pendiente));
    /* Operativo absorbe TODO el redondeo, para que los tres pedazos sumen el
       costo exacto siempre. Con el pago tarde el reparto queda 45/3/52: el 3%
       del cupón se cobra igual y la diferencia del bono se va entera a
       operativo, que es de donde salió el descuento. */
    var operativo = total - garantia - cupon;
    if (operativo < 0) { cupon = Math.max(0, cupon + operativo); operativo = total - garantia - cupon; }
    if (operativo < 0) operativo = 0;

    return { total: total, garantia_socio: garantia, amortiza_cupon: cupon, operativo: operativo };
  }

  /**
   * Los dos productos, lado a lado, por el mismo monto.
   *
   * Es la única fuente de la pieza de comparación de la UI: los dos lados y las
   * dos frases salen de acá, para que no se puedan desincronizar nunca.
   *
   * EL HORIZONTE ES UNO SOLO. Comparar los 64.800 del quincenal contra los
   * 97.200 del respaldado sería comparar quince días contra seis meses. El
   * quincenal cuesta 20% CADA CORTE; para tener la plata los mismos meses hay
   * que renovarlo en cada corte, y ahí el respaldado es mucho más barato. Por
   * eso el bloque `quincenal` trae DOS juegos de números:
   *   - los de una vuelta (`costo`, `garantia_que_deja`, `cupo_despues`), que
   *     son los del producto en sí y sirven para el detalle de cada lado;
   *   - los `*_en_el_plazo`, que son los ÚNICOS comparables contra el
   *     respaldado y los que la UI pone arriba, en grande, de los dos lados.
   * `diferencias` es todo del mismo horizonte: si un número de ahí se leyera
   * contra una cifra de una sola vuelta, la pantalla diría lo contrario de lo
   * que dice el veredicto. Eso ya pasó una vez.
   */
  function compararProductos(capital, plazoMeses, entrada, opciones) {
    opciones = opciones || {};
    var n = plazoRespaldadoValido(plazoMeses);
    var d = desglosarGarantia(entrada);
    var nivel = normalizarNivel(opciones.nivelSocio || 'bronce', 'opciones.nivelSocio');

    var q = simularCredito(capital, d.base_cupo, {
      nivelSocio: nivel, fechaDesembolso: opciones.fechaDesembolso
    });
    var r = simularPrestamoRespaldado(capital, n, entrada, opciones);

    /* Renovarlo corte a corte: se multiplica vuelta por vuelta, no se recalcula
       sobre el total, porque cada vuelta es un crédito y redondea lo suyo. */
    var cortes = CORTES_POR_MES * n;
    var costoEnElPlazo = q.costo * cortes;
    var garantiaEnElPlazo = q.garantia_que_deja * cortes;

    var difCosto = costoEnElPlazo - r.costo_total;
    var difGarantia = garantiaEnElPlazo - r.garantia_que_deja;
    var masBarato = difCosto > 0 ? 'respaldado' : (difCosto < 0 ? 'quincenal' : 'igual');

    return {
      capital: q.capital,
      plazo_meses: n,
      quincenal: {
        costo: q.costo,
        total_a_pagar: q.total_a_pagar,
        garantia_que_deja: q.garantia_que_deja,
        cupo_despues: q.cupo_despues,
        dentro_del_cupo: q.dentro_del_cupo,
        fecha_corte: q.fecha_corte,
        plazo_texto: 'hasta el corte',
        // Renovándolo en cada corte hasta cubrir los mismos n meses.
        cortes_en_el_plazo: cortes,
        costo_en_el_plazo: costoEnElPlazo,
        garantia_en_el_plazo: garantiaEnElPlazo,
        cupo_en_el_plazo: calcularCupo(d.base_cupo + garantiaEnElPlazo, nivel)
      },
      respaldado: {
        costo_total: r.costo_total,
        total_a_pagar: r.total_a_pagar,
        cuota_tipica: r.cuota_tipica,
        garantia_que_deja: r.garantia_que_deja,
        cupo_despues: r.cupo_despues,
        dentro_del_respaldo: r.dentro_del_respaldo,
        ultima_fecha: r.ultima_fecha,
        plazo_texto: n + (n === 1 ? ' mes' : ' meses')
      },
      // Todo esto es del mismo horizonte: los n meses. Ni un número de acá
      // sale de una sola vuelta del quincenal.
      diferencias: {
        costo_extra_quincenal: difCosto,
        garantia_extra_quincenal: difGarantia,
        veces_mas_garantia: r.garantia_que_deja > 0
          ? Math.round(garantiaEnElPlazo / r.garantia_que_deja * 10) / 10 : 0,
        cual_es_mas_barato: masBarato,
        cual_hace_crecer_mas: difGarantia > 0 ? 'quincenal' : (difGarantia < 0 ? 'respaldado' : 'igual')
      }
    };
  }

  /* ------------------------------------------------- códigos de invitación */
  /* Nadie crea cuenta solo: Joan manda un código y sin ese código no se entra.
     Un código sirve para UNA persona. Acá vive solo la FORMA del código —
     generarlo, limpiarlo y verificar el dígito de control—. Si existe y si ya
     se usó lo sabe el Panel o la nube, nunca el motor. */

  var CONFUSABLES_CODIGO = { I: '1', L: '1', O: '0', U: 'V' };

  // El 8º carácter: suma ponderada de los 7 primeros, módulo 32. Con esto un
  // código mal dictado por WhatsApp se cae en el celular del socio y no le
  // hace perder el tiempo a Joan buscándolo en una lista.
  function digitoControlCodigo(cuerpo) {
    var suma = 0;
    for (var i = 0; i < LARGO_CODIGO - 1; i++) {
      suma += ALFABETO_CODIGO.indexOf(cuerpo.charAt(i)) * (i + 1);
    }
    return ALFABETO_CODIGO.charAt(suma % ALFABETO_CODIGO.length);
  }

  function formatearCodigo(cuerpo) {
    return PREFIJO_CODIGO + '-' + cuerpo.slice(0, 4) + '-' + cuerpo.slice(4, LARGO_CODIGO);
  }

  /**
   * @param {function} [azar] función sin argumentos que devuelve [0,1).
   *        El Panel le pasa una basada en crypto.getRandomValues; el motor no
   *        depende de crypto para poder correr en node pelado.
   */
  function generarCodigoInvitacion(azar) {
    var f = typeof azar === 'function' ? azar : Math.random;
    var cuerpo = '';
    for (var i = 0; i < LARGO_CODIGO - 1; i++) {
      var x = f();
      if (!esNumero(x) || x < 0 || x >= 1) {
        throw new RangeError('azar: se esperaba un número en [0,1), llegó ' + describir(x));
      }
      cuerpo += ALFABETO_CODIGO.charAt(Math.floor(x * ALFABETO_CODIGO.length));
    }
    return formatearCodigo(cuerpo + digitoControlCodigo(cuerpo));
  }

  /**
   * Limpia lo que el socio tecleó y lo devuelve como 'TG-XXXX-XXXX', o null si
   * no quedan 8 caracteres. Perdona guiones, espacios, minúsculas, el prefijo
   * escrito o no, y los confusables que la gente igual va a teclear.
   */
  function normalizarCodigoInvitacion(texto) {
    if (typeof texto !== 'string') return null;
    var t = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (t.indexOf(PREFIJO_CODIGO) === 0 && t.length > LARGO_CODIGO) {
      t = t.slice(PREFIJO_CODIGO.length);
    }
    var cuerpo = '';
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (Object.prototype.hasOwnProperty.call(CONFUSABLES_CODIGO, c)) c = CONFUSABLES_CODIGO[c];
      if (ALFABETO_CODIGO.indexOf(c) !== -1) cuerpo += c;
    }
    if (cuerpo.length !== LARGO_CODIGO) return null;
    return formatearCodigo(cuerpo);
  }

  /** Formato + dígito de control. NO dice si el código existe ni si ya se usó. */
  function codigoInvitacionValido(texto) {
    var n = normalizarCodigoInvitacion(texto);
    if (!n) return false;
    // Los cortes salen del largo del prefijo, no de números a mano: 'QNC' medía
    // 3 y 'TG' mide 2, y con los índices fijos el código quedaba corrido.
    var p = PREFIJO_CODIGO.length + 1;                       // saltar 'TG-'
    var cuerpo = n.slice(p, p + 4) + n.slice(p + 5, p + 9);  // y el guión del medio
    return digitoControlCodigo(cuerpo) === cuerpo.charAt(LARGO_CODIGO - 1);
  }

  /* ----------------------------------------------------------- exports */

  return {
    // Fase 2 — las seis del documento (§12)
    calcularFechaCorte: calcularFechaCorte,
    calcularTasa: calcularTasa,
    calcularCosto: calcularCosto,
    calcularCupo: calcularCupo,
    acumularGarantia: acumularGarantia,
    evaluarNivel: evaluarNivel,
    aplicarProrroga: aplicarProrroga,

    // §8 — lo que el Panel PREGUNTA en vez de calcular (4-ago-2026)
    liquidarProrroga: liquidarProrroga,
    fechaCorteProrroga: fechaCorteProrroga,
    prorrogasPermitidas: prorrogasPermitidas,
    cuentaComoPuntual: cuentaComoPuntual,

    // Mora: 1% diario (cambio 26-jul-2026) y tramos del §9
    liquidarCredito: liquidarCredito,
    recargoPorMora: recargoPorMora,
    // El recargo ya causado no se recalcula cuando entra un abono a capital
    recargoPorMoraDesde: recargoPorMoraDesde,
    diasDeMora: diasDeMora,
    tramoDeMora: tramoDeMora,

    // La mora no castiga (cambio 27-jul-2026)
    puedeSolicitar: puedeSolicitar,
    evaluarCastigo: evaluarCastigo,

    // §3 nuevo: garantía que se gana entregando datos, y por referidos
    garantiaPorDatos: garantiaPorDatos,
    garantiaPorReferidos: garantiaPorReferidos,
    garantiaTotal: garantiaTotal,
    reglasResumen: reglasResumen,

    // Calculadora y proyecciones
    simularCredito: simularCredito,
    proyectarCrecimiento: proyectarCrecimiento,
    proyeccionNiveles: proyeccionNiveles,
    garantiaNecesariaPara: garantiaNecesariaPara,

    // Auxiliares que usan las anteriores (y que la UI va a necesitar)
    detalleFechaCorte: detalleFechaCorte,
    cortesSiguientes: cortesSiguientes,
    cortesNominalesDelMes: cortesNominalesDelMes,
    construirPlanDePagos: construirPlanDePagos,

    // Calendario
    festivosDelAnio: festivosDelAnio,
    esFestivo: esFestivo,
    esDiaHabilDeCorte: esDiaHabilDeCorte,
    siguienteDiaHabilDeCorte: siguienteDiaHabilDeCorte,
    pascua: pascua,

    // Utilidades de fecha (sin trampa de UTC)
    aFechaLocal: aFechaLocal,
    iso: iso,
    diasEntre: diasEntre,
    sumarDias: sumarDias,

    // Constantes de negocio, para que la UI no las repita a mano
    NIVELES: NIVELES,
    TASA_CREDITO: TASA_CREDITO,
    DATOS_KYC: DATOS_KYC,
    CUPON_KYC_MAXIMO: CUPON_KYC_MAXIMO,
    GARANTIA_POR_REFERIDO: GARANTIA_POR_REFERIDO,
    CUPO_MAXIMO: CUPO_MAXIMO,
    MONTO_MINIMO: MONTO_MINIMO,
    MONTO_MAXIMO_CALCULADORA: MONTO_MAXIMO_CALCULADORA,
    FACTOR_CUPO: FACTOR_CUPO,
    PRORROGAS_POR_NIVEL: PRORROGAS_POR_NIVEL,
    TOPE_DURO_PRORROGAS: TOPE_DURO_PRORROGAS,
    REQUISITOS_NIVEL: REQUISITOS_NIVEL,
    FACTOR_GARANTIA: FACTOR_GARANTIA,
    FACTOR_GARANTIA_MORA: FACTOR_GARANTIA_MORA,
    DIAS_VENTANA_MINIMA: DIAS_VENTANA_MINIMA,
    CUOTAS_PLAN_DE_PAGOS: CUOTAS_PLAN_DE_PAGOS,
    TASA_PLAN_DE_PAGOS: TASA_PLAN_DE_PAGOS,
    TASA_MORA_DIARIA: TASA_MORA_DIARIA,
    DIAS_CASTIGO: DIAS_CASTIGO,
    TRAMOS_MORA: TRAMOS_MORA,
    ESTADOS_SIN_PRORROGA: ESTADOS_SIN_PRORROGA,

    // Producto 2 y contabilidad interna (2-ago-2026)
    desglosarGarantia: desglosarGarantia,
    maximoRespaldado: maximoRespaldado,
    cupoQuincenal: cupoQuincenal,
    acumularGarantiaRespaldada: acumularGarantiaRespaldada,
    calendarioRespaldado: calendarioRespaldado,
    simularPrestamoRespaldado: simularPrestamoRespaldado,
    liquidarCuotaRespaldada: liquidarCuotaRespaldada,
    repartirCosto: repartirCosto,
    compararProductos: compararProductos,
    generarCodigoInvitacion: generarCodigoInvitacion,
    normalizarCodigoInvitacion: normalizarCodigoInvitacion,
    codigoInvitacionValido: codigoInvitacionValido,
    TASA_RESPALDADO_MENSUAL: TASA_RESPALDADO_MENSUAL,
    PLAZO_RESPALDADO_MIN: PLAZO_RESPALDADO_MIN,
    PLAZO_RESPALDADO_MAX: PLAZO_RESPALDADO_MAX,
    FACTOR_GARANTIA_RESPALDADO: FACTOR_GARANTIA_RESPALDADO,
    FACTOR_GARANTIA_RESPALDADO_MORA: FACTOR_GARANTIA_RESPALDADO_MORA,
    CORTES_POR_MES: CORTES_POR_MES,
    REPARTO_COSTO: REPARTO_COSTO,
    ALFABETO_CODIGO: ALFABETO_CODIGO,
    LARGO_CODIGO: LARGO_CODIGO,
    PREFIJO_CODIGO: PREFIJO_CODIGO
  };
});
