/* ============================================================================
 * Joan te presta — Motor de reglas v1
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
 * D12. (27-jul-2026) El §3 queda reemplazado: el cupón ya no es una tabla de
 *     tres niveles de KYC sino un puntaje DATO POR DATO (DATOS_KYC) que suma
 *     200.000 exactos al completarlo todo. El reparto por dato es criterio
 *     nuestro: pesa más lo que más baja el riesgo (selfie 35.000, fotos de la
 *     cédula 20.000 cada una, referencia 20.000) y menos lo barato de falsear.
 *     Si Joan quiere mover un valor, tiene que compensarlo en otro: hay una
 *     prueba que exige que los 15 sumen 200.000 clavados.
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

  // §5 — tasa por cobertura (garantia_total / capital_solicitado)
  var ESCALONES_TASA = [
    { cobertura_min: 2.00, tasa: 0.03 },
    { cobertura_min: 1.00, tasa: 0.05 },
    { cobertura_min: 0.50, tasa: 0.12 },
    { cobertura_min: 0.00, tasa: 0.20 }
  ];

  /* §3 REEMPLAZADO (27-jul-2026): el cupón ya no es una tabla de tres escalones.
     La plataforma presta garantía DATO POR DATO: cada cosa que el socio entrega
     le sube el cupón, y completando todo llega a 200.000 exactos. Así el que
     quiere crédito tiene un motivo concreto para darnos información. */
  var DATOS_KYC = [
    { id: 'nombre', etiqueta: 'Tu nombre completo', ayuda: 'Como aparece en la cédula', tipo: 'texto', valor: 10000 },
    { id: 'cedula', etiqueta: 'Número de cédula', ayuda: 'Solo los números', tipo: 'numero', valor: 15000 },
    { id: 'celular', etiqueta: 'Tu celular', ayuda: 'Al que te podamos escribir', tipo: 'numero', valor: 10000 },
    { id: 'whatsapp', etiqueta: 'Ese celular tiene WhatsApp', ayuda: 'Para avisarte de tus pagos', tipo: 'si', valor: 5000 },
    { id: 'correo', etiqueta: 'Tu correo', ayuda: 'Opcional pero suma', tipo: 'texto', valor: 5000 },
    { id: 'ciudad', etiqueta: 'Ciudad y barrio', ayuda: 'Dónde vivís', tipo: 'texto', valor: 10000 },
    { id: 'direccion', etiqueta: 'Dirección de tu casa', ayuda: 'Calle, carrera y número', tipo: 'texto', valor: 10000 },
    { id: 'vivienda', etiqueta: 'Tipo de vivienda', ayuda: 'Propia, arriendo, familiar…', tipo: 'texto', valor: 10000 },
    { id: 'pago', etiqueta: 'Tu Nequi o llave', ayuda: 'Por donde recibís la plata', tipo: 'texto', valor: 10000 },
    { id: 'celular2', etiqueta: 'Un segundo teléfono', ayuda: 'De la casa o del trabajo', tipo: 'numero', valor: 5000 },
    { id: 'referencia', etiqueta: 'Una referencia', ayuda: 'Nombre y teléfono de alguien que te conozca', tipo: 'texto', valor: 20000 },
    { id: 'ubicacion', etiqueta: 'Tu ubicación en el mapa', ayuda: 'Se toma una sola vez', tipo: 'mapa', valor: 15000 },
    { id: 'foto_cedula_frente', etiqueta: 'Cédula por delante', ayuda: 'Una foto que se lea bien', tipo: 'foto', valor: 20000 },
    { id: 'foto_cedula_reverso', etiqueta: 'Cédula por detrás', ayuda: 'La otra cara', tipo: 'foto', valor: 20000 },
    { id: 'foto_selfie', etiqueta: 'Selfie con tu cédula', ayuda: 'Vos sosteniéndola al lado de tu cara', tipo: 'foto', valor: 35000 }
  ];
  var CUPON_KYC_MAXIMO = 200000;   // suma exacta de los 15 datos de arriba

  var GARANTIA_POR_REFERIDO = 5000; // pero solo cuando el referido paga puntual
  var CUPO_MAXIMO = 20000000;       // techo de la plataforma: 20 millones

  // §5 — factor de cupo y prórrogas por nivel
  var FACTOR_CUPO = { bronce: 1.0, plata: 1.25, oro: 1.5, platino: 2.0 };
  var PRORROGAS_POR_NIVEL = { bronce: 1, plata: 2, oro: 2, platino: 2 };
  var TOPE_DURO_PRORROGAS = 2; // §8, tope duro por encima del nivel

  // §5 — requisitos de nivel
  var REQUISITOS_NIVEL = {
    bronce: { pagos_a_tiempo: 0, racha: 0, meses_sin_mora: 0 },
    plata: { pagos_a_tiempo: 3, racha: 0, meses_sin_mora: 0 },
    oro: { pagos_a_tiempo: 8, racha: 4, meses_sin_mora: 0 },
    platino: { pagos_a_tiempo: 20, racha: 0, meses_sin_mora: 6 }
  };

  var FACTOR_GARANTIA = 0.90;      // 90% de TODO costo pagado (cambio 26-jul-2026)
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
    { tramo: 'castigo', desde: 90, hasta: Infinity, accion: 'veto + garantía a cero', canal: '—' }
  ];

  // Estados desde los que NO tiene sentido prorrogar (§6)
  var ESTADOS_SIN_PRORROGA = ['solicitado', 'aprobado', 'pagado', 'castigado', 'plan_de_pagos'];

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

  /** cobertura = garantia_total / capital_solicitado (§5). */
  function calcularCobertura(garantiaTotal, capitalSolicitado) {
    var g = numeroNoNegativo(garantiaTotal, 'garantiaTotal');
    var c = numeroPositivo(capitalSolicitado, 'capitalSolicitado');
    return g / c;
  }

  /**
   * §5 — Tasa por corte según la cobertura.
   *   < 50%  → 20% | 50–99% → 12% | 100–199% → 5% | ≥ 200% → 3%
   * Los bordes se comparan multiplicando (g >= 2*c) en vez de dividiendo, para
   * que 50/100/200% exactos caigan siempre del lado bueno para el socio.
   *
   * @returns {number} 0.03 | 0.05 | 0.12 | 0.20
   */
  function calcularTasa(garantiaTotal, capitalSolicitado) {
    var g = numeroNoNegativo(garantiaTotal, 'garantiaTotal');
    var c = numeroPositivo(capitalSolicitado, 'capitalSolicitado');
    if (g >= 2 * c) return 0.03;
    if (g >= c) return 0.05;
    if (2 * g >= c) return 0.12;
    return 0.20;
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
   * Garantía que deja un costo pagado: round(costo × 0.90).
   *
   * Desde el 26-jul-2026 acumula TODO costo que el socio pague —crédito,
   * prórroga, recargo de mora, cuotas del plan de pagos—, puntual o no. El §4
   * del documento (donde la mora congelaba la acumulación) quedó derogado.
   *
   * @param {number} costoPagado
   * @param {boolean} [pagoFueATiempo]  se conserva para la auditoría y para no
   *        romper llamadores viejos, pero YA NO cambia el resultado. Quien
   *        necesite distinguir puntualidad, use liquidarCredito().
   * @returns {number} incremento de garantia_acumulada (entero, COP).
   */
  function acumularGarantia(costoPagado, pagoFueATiempo) {
    var costo = numeroNoNegativo(costoPagado, 'costoPagado');
    if (pagoFueATiempo !== undefined && typeof pagoFueATiempo !== 'boolean') {
      throw new TypeError('pagoFueATiempo: se esperaba true o false, llegó ' + describir(pagoFueATiempo));
    }
    return Math.round(costo * FACTOR_GARANTIA);
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
   * Liquida un crédito en la fecha en que el socio paga: días de mora, recargo
   * del 1% diario, total a pagar y garantía generada por todo eso.
   *
   * @param {object} credito   {capital, tasa_aplicada, costo, fecha_corte}
   * @param {Date|string} fechaPago
   * @param {object} [opciones] {baseMora, topeDias, tasaDiaria}
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
    var recargo = recargoPorMora(base, diasMora, opciones);
    var costoTotal = costo + recargo;

    return {
      fecha_corte: iso(corte),
      fecha_pago: iso(pago),
      dias_mora: diasMora,
      pago_a_tiempo: diasMora === 0,
      tramo: tramoDeMora(dias).tramo,
      capital: capital,
      costo: costo,
      recargo_mora: recargo,
      tasa_mora_diaria: opciones.tasaDiaria != null ? opciones.tasaDiaria : TASA_MORA_DIARIA,
      base_mora: base,
      costo_total_pagado: costoTotal,
      total_a_pagar: capital + costoTotal,
      garantia_generada: acumularGarantia(costoTotal),
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

  /** Qué garantía le faltaría para bajar al siguiente escalón de tasa. */
  function siguienteEscalon(capital, garantiaDisponible) {
    var c = numeroPositivo(capital, 'capital');
    var g = numeroNoNegativo(garantiaDisponible, 'garantiaDisponible');
    var metas = [{ cob: 0.5, tasa: 0.12 }, { cob: 1, tasa: 0.05 }, { cob: 2, tasa: 0.03 }];
    for (var i = 0; i < metas.length; i++) {
      var necesaria = metas[i].cob * c;
      if (g < necesaria) {
        return {
          tasa: metas[i].tasa,
          garantia_necesaria: Math.ceil(necesaria),
          falta: Math.ceil(necesaria - g)
        };
      }
    }
    return null; // ya está en la mejor tasa
  }

  /**
   * Simula un crédito: qué paga, qué tasa le toca por su cobertura, cuánto se
   * ahorra frente a no tener garantía, y cuánta garantía le deja el crédito.
   * Es el cálculo que hay detrás de la calculadora de la app.
   */
  function simularCredito(capital, garantiaDisponible, opciones) {
    opciones = opciones || {};
    var c = numeroPositivo(capital, 'capital');
    var g = numeroNoNegativo(garantiaDisponible, 'garantiaDisponible');

    var tasa = calcularTasa(g, c);
    var costo = Math.round(c * tasa);
    var deja = acumularGarantia(costo);

    var tasaSin = calcularTasa(0, c);
    var costoSin = Math.round(c * tasaSin);

    return {
      capital: c,
      tasa: tasa,
      costo: costo,
      total_a_pagar: c + costo,
      cobertura: g / c,
      cubierto: g >= c,                    // la garantía ya solventa el crédito
      garantia_disponible: g,
      garantia_que_deja: deja,
      garantia_despues: g + deja,
      sin_garantia: { tasa: tasaSin, costo: costoSin, total_a_pagar: c + costoSin },
      ahorro: costoSin - costo,            // lo que le ahorra su historial, en pesos
      siguiente_escalon: siguienteEscalon(c, g),
      fecha_corte: opciones.fechaDesembolso ? calcularFechaCorte(opciones.fechaDesembolso) : null
    };
  }

  /**
   * Cómo crece la garantía si el socio repite un crédito del mismo tamaño.
   * Sirve para mostrarle el camino en vez de pedirle que se lo imagine.
   */
  function proyectarCrecimiento(garantiaInicial, capital, vueltas, nivelSocio) {
    var g = numeroNoNegativo(garantiaInicial, 'garantiaInicial');
    var c = numeroPositivo(capital, 'capital');
    var n = enteroNoNegativo(vueltas == null ? 6 : vueltas, 'vueltas');
    var nivel = normalizarNivel(nivelSocio || 'bronce');
    var pasos = [];
    for (var i = 1; i <= n; i++) {
      var tasa = calcularTasa(g, c);
      var costo = Math.round(c * tasa);
      var gana = acumularGarantia(costo);
      g += gana;
      pasos.push({
        credito: i, tasa: tasa, costo: costo,
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
    var fechas = cortesSiguientes(credito.fecha_corte, n);
    var cuotaBase = Math.floor(base / n);
    var cuotas = [], saldo = base, totalCosto = 0, totalPagar = 0, totalGarantia = 0;

    for (var i = 0; i < n; i++) {
      // La última cuota absorbe el resto de la división, para no perder pesos.
      var capital = (i === n - 1) ? saldo : cuotaBase;
      var costo = Math.round(saldo * TASA_PLAN_DE_PAGOS);
      cuotas.push({
        numero: i + 1,
        fecha_corte: fechas[i],
        saldo_insoluto: saldo,
        capital: capital,
        costo: costo,
        total: capital + costo,
        garantia_generada: acumularGarantia(costo)
      });
      totalCosto += costo;
      totalPagar += capital + costo;
      totalGarantia += acumularGarantia(costo);
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
    var tasa = opciones.tasaVigente != null ? opciones.tasaVigente : credito.tasa_aplicada;
    numeroPositivo(tasa, 'credito.tasa_aplicada');
    if (tasa > 1) throw new RangeError('credito.tasa_aplicada: se esperaba decimal (0.20), llegó ' + tasa);

    var nivel = normalizarNivel(
      opciones.nivelSocio || credito.nivel_socio || 'bronce',
      'nivelSocio'
    );
    var usadas = enteroNoNegativo(
      credito.prorrogas_usadas == null ? 0 : credito.prorrogas_usadas,
      'credito.prorrogas_usadas'
    );
    var estado = credito.estado == null ? 'en_corte' : credito.estado;
    if (ESTADOS_SIN_PRORROGA.indexOf(estado) !== -1) {
      throw new Error('No se puede prorrogar un crédito en estado "' + estado + '"');
    }

    var corteActual = aFechaLocal(credito.fecha_corte, 'credito.fecha_corte');
    var permitidas = Math.min(PRORROGAS_POR_NIVEL[nivel], TOPE_DURO_PRORROGAS);

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
    var nuevoCorte = calcularFechaCorte(corteActual);
    var fechaMovimiento = opciones.fecha != null
      ? iso(aFechaLocal(opciones.fecha, 'opciones.fecha'))
      : iso(corteActual);

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
      garantia_generada: acumularGarantia(costo), // cambio 26-jul-2026: sí acumula
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
        garantia_generada: acumularGarantia(costo)
      },
      plan_de_pagos: null
    };
  }

  /* ----------------------------------------------------------- exports */

  return {
    // Fase 2 — las seis del documento (§12)
    calcularFechaCorte: calcularFechaCorte,
    calcularTasa: calcularTasa,
    calcularCupo: calcularCupo,
    acumularGarantia: acumularGarantia,
    evaluarNivel: evaluarNivel,
    aplicarProrroga: aplicarProrroga,

    // Mora: 1% diario (cambio 26-jul-2026) y tramos del §9
    liquidarCredito: liquidarCredito,
    recargoPorMora: recargoPorMora,
    diasDeMora: diasDeMora,
    tramoDeMora: tramoDeMora,

    // La mora no castiga (cambio 27-jul-2026)
    puedeSolicitar: puedeSolicitar,
    evaluarCastigo: evaluarCastigo,

    // §3 nuevo: garantía que se gana entregando datos, y por referidos
    garantiaPorDatos: garantiaPorDatos,
    garantiaPorReferidos: garantiaPorReferidos,
    garantiaTotal: garantiaTotal,

    // Calculadora y proyecciones
    simularCredito: simularCredito,
    siguienteEscalon: siguienteEscalon,
    proyectarCrecimiento: proyectarCrecimiento,
    proyeccionNiveles: proyeccionNiveles,
    garantiaNecesariaPara: garantiaNecesariaPara,

    // Auxiliares que usan las anteriores (y que la UI va a necesitar)
    detalleFechaCorte: detalleFechaCorte,
    cortesSiguientes: cortesSiguientes,
    cortesNominalesDelMes: cortesNominalesDelMes,
    calcularCobertura: calcularCobertura,
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
    ESCALONES_TASA: ESCALONES_TASA,
    DATOS_KYC: DATOS_KYC,
    CUPON_KYC_MAXIMO: CUPON_KYC_MAXIMO,
    GARANTIA_POR_REFERIDO: GARANTIA_POR_REFERIDO,
    CUPO_MAXIMO: CUPO_MAXIMO,
    FACTOR_CUPO: FACTOR_CUPO,
    PRORROGAS_POR_NIVEL: PRORROGAS_POR_NIVEL,
    TOPE_DURO_PRORROGAS: TOPE_DURO_PRORROGAS,
    REQUISITOS_NIVEL: REQUISITOS_NIVEL,
    FACTOR_GARANTIA: FACTOR_GARANTIA,
    DIAS_VENTANA_MINIMA: DIAS_VENTANA_MINIMA,
    CUOTAS_PLAN_DE_PAGOS: CUOTAS_PLAN_DE_PAGOS,
    TASA_PLAN_DE_PAGOS: TASA_PLAN_DE_PAGOS,
    TASA_MORA_DIARIA: TASA_MORA_DIARIA,
    DIAS_CASTIGO: DIAS_CASTIGO,
    TRAMOS_MORA: TRAMOS_MORA,
    ESTADOS_SIN_PRORROGA: ESTADOS_SIN_PRORROGA
  };
});
