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
 *   el 75% y le sube el cupo rápido. Plata barata o crecer.
 * ---------------------------------------------------------------------------
 * EL CUPO ES LA GARANTÍA, UNO A UNO — 5-ago-2026, pedido de Joan. Es el cambio
 * más grande que se le ha hecho al motor y deroga dos cosas:
 *
 *   1. EL REPARTO pasa de 90/7/3 a 75/10/15. La garantía del socio baja al 75%
 *      del costo, el operativo sube al 10% y el 15% amortiza el cupón regalado.
 *      Pagado tarde el socio sigue recibiendo la mitad (37,5%) y la diferencia
 *      va entera a operativo: 37,5 / 47,5 / 15. El 15% del cupón se cobra
 *      igual, atrasado o no — hay que recuperarlo igual.
 *   2. MUERE FACTOR_CUPO. El cupo era garantía × factor de nivel (1,5 a 3);
 *      ahora es la garantía y nada más, topada por CUPO_MAXIMO. El segundo
 *      crédito de un socio que pidió 100.000 y pagó da 115.000 exactos, no
 *      230.000.
 *
 *   LOS NIVELES SE QUEDAN, y es una decisión explícita: siguen siendo el
 *   reconocimiento del que paga y siguen mandando el tope de prórrogas
 *   (PRORROGAS_POR_NIVEL) y sus requisitos. Lo único que pierden es influencia
 *   sobre el cupo. Y el nivel sigue sin bajar nunca.
 *
 *   POR QUÉ. Con el reparto viejo la exposición de Joan CRECÍA: prestaba
 *   177.000 contra 118.000 de garantía de la cual 100.000 la había puesto él
 *   —arriesgaba 159.000 y subiendo—. Ahora presta 115.000 contra 115.000 y de
 *   eso solo el cupón no está respaldado por lo que el socio pagó: arriesga
 *   97.000 y BAJANDO, porque el 15% de cada costo va amortizando ese cupón.
 *   Al crédito 13 arriesga cero (ver amortizarCupon).
 *
 *   La regla en una frase: cada crédito pagado en fecha te sube el cupo un 15%
 *   (0,20 × 0,75). Duplica en cinco créditos.
 *
 *   Y VA UN FRENO PREPARADO Y APAGADO: el 15% compone, así que el cupo se va a
 *   millones antes del crédito 24. FRENO_INGRESO topa la cuota a una fracción de
 *   la quincena del socio, viene en false y solo lo enciende Joan desde Ajustes
 *   del Panel (ver frenarPorIngreso).
 *
 *   LA PREGUNTA PARA LOS CASOS RAROS que el motor no tiene escritos: ¿esto hace
 *   que la exposición de Joan CREZCA? Si la respuesta es sí, está mal.
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
 * D14. (27-jul-2026, TOPADA el 6-ago-2026) Un referido suma 5.000 SOLO cuando ya
 *     pagó un crédito. Decía "sin tope: traer gente que paga es exactamente lo
 *     que queremos premiar", y eso era cierto del incentivo y falso de la plata:
 *     esos 5.000 son garantía PRESTADA, o sea exposición de Joan, y sin tope un
 *     socio que nunca pagó llegaba a 2.600.000 de cupo con 500 referidos. Ahora
 *     la prestada COMPLETA (cupón + referidos) se topa en CUPON_KYC_MAXIMO y los
 *     referidos tampoco pasan de la garantía ganada del socio. Los dos topes son
 *     configurables: ver TOPE_REFERIDOS.
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

  var GARANTIA_POR_REFERIDO = 5000; // pero solo cuando el referido ya pagó
  var CUPO_MAXIMO = 20000000;       // techo de la plataforma: 20 millones

  /* ==========================================================================
   * EL TOPE DE LOS REFERIDOS — 6-ago-2026, y era el último sitio donde la
   * exposición de Joan todavía crecía.
   *
   * LOS 5.000 DE CADA REFERIDO SON GARANTÍA PRESTADA, no ganada: los pone la
   * plataforma, igual que el cupón por los datos. Y con el cupo uno a uno son
   * 5.000 de cupo puro. Sin tope eso significaba:
   *
   *   MEDIDO. Un socio que NUNCA PAGÓ UN PESO llegaba a 2.600.000 de cupo con
   *   500 referidos (100.000 de cupón + 2.500.000 de referidos), y con 5.000
   *   referidos la PRESTADA daba 25.100.000 — por encima del techo entero de la
   *   plataforma. Y peor: un socio que ya había SALDADO su cupón en el crédito 13
   *   volvía a quedar expuesto con cada referido nuevo, porque el 15% recuperado
   *   ya estaba gastado y los 5.000 nuevos no tenían de dónde amortizarse. La
   *   ganancia libre que muestra el Panel se encogía HACIA ATRÁS: 71.758 → 68.701
   *   con un solo referido, y el socio saldado dejaba de estar saldado (expuesto
   *   1.943, y 196.943 con cuarenta referidos).
   *
   * LA PREGUNTA DE JOAN ("¿esto hace que MI exposición crezca?") tenía acá su
   * última respuesta SÍ. Y no está financiado: el 15% de cada costo amortiza el
   * cupón DEL SOCIO QUE LO PAGA y de nadie más (contabilidadCartera del puente lo
   * dice explícito: "cada socio tiene el suyo"). Los 5.000 que se le regalan al
   * padrino solo los devuelve el padrino, con sus propios pagos futuros; lo que el
   * referido paga ya está comprometido con su propio cupón de 100.000.
   *
   * LO QUE SE ELIGIÓ, Y POR QUÉ. Se topa la PRESTADA COMPLETA en el mismo techo
   * del cupón de datos (100.000). Así la exposición de Joan por socio queda
   * clavada en 100.000 pase lo que pase —que es literalmente lo que pidió— y la
   * promesa "arranca en 97.000 y solo baja hasta cero en el crédito 13" vuelve a
   * ser verdad con cualquier número de referidos.
   *
   * La otra forma sensata era topar los referidos en la garantía GANADA del socio
   * ("solo crece para quien ya demostró que paga"). Respeta mejor el espíritu,
   * pero NO arregla el caso que más dolía: el socio del crédito 13 tiene 600.000
   * de ganada, así que sus referidos podrían meter 600.000 de prestada nueva y
   * volver a abrirle la exposición de cero a medio millón. Con los números en la
   * mano, no alcanza sola.
   *
   * ASÍ QUE VAN LAS DOS, y la segunda no le cuesta nada al que paga: dentro del
   * techo, los referidos tampoco pueden pasar de la garantía ganada. El único al
   * que eso le quita algo es al socio que no ha pagado nunca —exactamente el que
   * no queremos premiar—, y al que sí paga el techo ya se lo dio.
   *
   * LA CONTRA, dicha de frente: con la ficha completa (100.000 de cupón) los
   * referidos dejan de sumar cupo. La app se lo tiene que decir así, y el premio
   * de traer gente que paga hay que pagarlo con algo que no sea plata de Joan.
   *
   * CONFIGURABLE para que Joan lo pueda mover sin tocar una cuenta:
   *   techo_prestada  el techo de toda la garantía prestada. `null` lo apaga.
   *   hasta_la_ganada true = los referidos tampoco pasan de la ganada.
   * Las dos apagadas es el comportamiento viejo, sin tope.
   * ========================================================================*/
  var TOPE_REFERIDOS = {
    techo_prestada: CUPON_KYC_MAXIMO,
    hasta_la_ganada: true
  };

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

  /* §5 — FACTOR_CUPO ESTÁ DEROGADO (5-ago-2026), y no queda como dato muerto a
     propósito: era { bronce: 1,5 · plata: 2,0 · oro: 2,5 · platino: 3,0 } y
     multiplicaba la garantía para dar el cupo. Dejarlo escrito acá habría hecho
     que la próxima pantalla lo volviera a pintar ("×2 tu garantía") y eso ya no
     es verdad: el cupo es la garantía, uno a uno (calcularCupo).
     Lo que la garantía NO es, y por eso el factor era peligroso: no es plata
     depositada, es un puntaje. Con factor 2,5 se le prestaba dos veces y media
     lo que el socio había pagado en toda su historia, y la mitad de esa garantía
     la había puesto la plataforma con el cupón.

     Los niveles SIGUEN EXISTIENDO y siguen mandando acá abajo: el tope de
     prórrogas es hoy lo único material que se gana subiendo, más el
     reconocimiento. */
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
     5-ago-2026: baja de 0,90 a 0,75 (antes había bajado de 1,00 a 0,90 el
     2-ago). El otro 25% no se pierde: es lo que sostiene la plataforma (10% de
     costo operativo) y lo que va devolviendo el cupón de 100.000 que se le
     regaló al socio para arrancar (15%). Eso último es contabilidad interna: el
     socio ve su 75% y nada más.

     El BONO POR PUNTUALIDAD se mantiene tal cual: en fecha suma el factor
     completo, tarde suma la mitad. Con costo 20% y mora 1% diario, el punto
     de equilibrio sigue estando en los 20 días. */
  var FACTOR_GARANTIA = 0.75;        // pagó en la fecha de corte o antes
  var FACTOR_GARANTIA_MORA = 0.375;  // pagó tarde: suma, pero la mitad
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
     5-ago-2026: de 90/7/3 a 75/10/15. El 90/7/3 queda derogado.
     75% garantía del socio · 10% operativo · 15% amortiza el cupón regalado.
     El socio NO ve esto por ningún lado: para él su garantía es el 75% y
     punto. El 15% se deja de cobrar cuando ese socio ya devolvió todo su cupón,
     y desde ahí es ganancia libre (ver amortizarCupon).
     Pagado tarde: 37,5 / 47,5 / 15. El cupón se recupera igual —hay que
     recuperarlo igual— y el bono que el socio no se ganó va entero a operativo,
     que es de donde salió el descuento. */
  var REPARTO_COSTO = { garantia: 0.75, operativo: 0.10, cupon: 0.15 };

  /* ---- EL FRENO POR INGRESO, PREPARADO Y APAGADO (5-ago-2026) ----
     El 15% compone. MEDIDO sobre la escalera de este motor, arrancando con el
     cupón de 100.000 y pagando todo en fecha: al crédito 24 el cupo llega a
     2.489.146 y solo el COSTO de esa quincena es 497.829 —más de lo que un
     asalariado gana en una quincena—, con una cuota total de 2.986.975. El freno
     topa la cuota a una fracción del ingreso quincenal del socio.

     VIENE APAGADO Y ASÍ SE QUEDA hasta que Joan lo encienda desde Ajustes del
     Panel. `activo:false` es la decisión, no un descuido: encenderlo le baja el
     cupo a socios que hoy ya lo tienen, y eso lo decide él.

     La fracción es configurable por la misma razón. 0,30 es el número de
     arranque —tres de cada diez pesos de la quincena— y no está medido contra
     nada todavía. */
  var FRENO_INGRESO = { activo: false, fraccion_quincena: 0.30 };

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
   * §5 — Cupo máximo solicitable = LA GARANTÍA, UNO A UNO (5-ago-2026).
   *
   * El factor de nivel está derogado: multiplicaba la garantía por 1,5 a 3 y
   * con eso la exposición de Joan crecía crédito a crédito. Ahora el socio puede
   * pedir exactamente lo que respalda, y lo único que no está respaldado por
   * plata que él haya pagado es el cupón, que el 15% de cada costo va
   * devolviendo.
   *
   * `nivelSocio` se sigue recibiendo Y SE SIGUE VALIDANDO —un nivel inventado es
   * un error, no un cero silencioso— pero ya no mueve el resultado. Se conserva
   * en la firma porque el nivel sigue existiendo y porque hay llamadores y
   * pruebas que lo pasan; el día que se le quite, se le quita a todos a la vez.
   *
   * Redondea hacia abajo (D8) y no pasa del techo de la plataforma (D13).
   */
  function calcularCupo(garantiaTotal, nivelSocio) {
    var g = numeroNoNegativo(garantiaTotal, 'garantiaTotal');
    normalizarNivel(nivelSocio == null ? 'bronce' : nivelSocio);
    return Math.min(Math.floor(g), CUPO_MAXIMO);
  }

  /** Garantía que hace falta para poder pedir `cupo`. Uno a uno: es el mismo
     número. Se conserva la función porque la calculadora pregunta "cuánto me
     falta" y ese cálculo tiene que salir de un solo lado. */
  function garantiaNecesariaPara(cupo, nivelSocio) {
    var c = numeroNoNegativo(cupo, 'cupo');
    normalizarNivel(nivelSocio == null ? 'bronce' : nivelSocio);
    return Math.ceil(Math.min(c, CUPO_MAXIMO));
  }

  /**
   * QUÉ SE GANA SUBIENDO DE NIVEL, ahora que no es cupo (5-ago-2026).
   *
   * Esta función existía para vender "subí de nivel y pedí más", y eso dejó de
   * ser cierto el día que el cupo pasó a ser la garantía uno a uno: el cupo es
   * EL MISMO en los cuatro niveles y por eso viaja igual en los cuatro, para que
   * ninguna pantalla pueda insinuar una diferencia que no existe. Lo que de
   * verdad cambia por nivel son las PRÓRROGAS —cuántas veces puede aplazar un
   * corte— y el reconocimiento.
   *
   * `factor` ya no viaja: era el número que la UI pintaba como "×2 tu garantía".
   * Si alguna pantalla lo lee, va a leer undefined, y es mejor que siga
   * prometiendo el doble.
   */
  function proyeccionNiveles(garantiaTotal, nivelActual) {
    var g = numeroNoNegativo(garantiaTotal, 'garantiaTotal');
    var actual = nivelActual == null ? null : normalizarNivel(nivelActual, 'nivelActual');
    return NIVELES.map(function (n) {
      return {
        nivel: n,
        // El mismo cupo en los cuatro: el nivel ya no lo mueve.
        cupo: calcularCupo(g, n),
        mueve_el_cupo: false,
        prorrogas: Math.min(PRORROGAS_POR_NIVEL[n], TOPE_DURO_PRORROGAS),
        requisitos: REQUISITOS_NIVEL[n],
        actual: n === actual,
        alcanzado: actual != null && NIVELES.indexOf(n) <= NIVELES.indexOf(actual)
      };
    });
  }

  /* ==========================================================================
   * EL FRENO POR INGRESO — preparado y APAGADO (5-ago-2026, pedido de Joan)
   *
   * El 15% compone y no se detiene solo: 100.000 de cupo en el crédito 1 y
   * 2.489.146 en el 24, donde el costo de la quincena solo ya es 497.829. Un
   * asalariado colombiano no gana eso en una quincena, así que a partir de cierto
   * punto el cupo deja de ser una oportunidad y pasa a ser una trampa — para el
   * socio y para la cartera de Joan.
   *
   * El freno topa el cupo a lo que el socio pueda pagar con su quincena: la
   * CUOTA (capital + el 20% de costo) no puede pasar de una fracción de su
   * ingreso quincenal.
   *
   * VIENE APAGADO. `FRENO_INGRESO.activo` es false y estas funciones no se
   * aplican solas en ningún lado: `cupoQuincenal` solo las llama si quien
   * pregunta le pasa `opciones.freno.activo === true`. Joan lo enciende desde
   * Ajustes del Panel cuando quiera, con la fracción que quiera.
   * ========================================================================*/

  /** Configuración del freno, con los defaults aplicados y validada. */
  function configFreno(opciones) {
    var o = opciones || {};
    var fraccion = o.fraccion_quincena == null
      ? FRENO_INGRESO.fraccion_quincena
      : numeroPositivo(o.fraccion_quincena, 'freno.fraccion_quincena');
    if (fraccion > 1) throw new RangeError('freno.fraccion_quincena: se esperaba decimal (0.30), llegó ' + fraccion);
    return {
      activo: o.activo === true,
      fraccion_quincena: fraccion,
      ingreso_quincenal: o.ingreso_quincenal == null
        ? 0 : numeroNoNegativo(o.ingreso_quincenal, 'freno.ingreso_quincenal')
    };
  }

  /**
   * El capital más grande cuya cuota quincenal (capital + 20%) entra en la
   * fracción del ingreso. Sin ingreso declarado no hay freno posible: devuelve
   * null, que quiere decir "no sé", no "cero".
   */
  function cupoPorIngreso(ingresoQuincenal, opciones) {
    var c = configFreno(opciones);
    var ingreso = ingresoQuincenal == null
      ? c.ingreso_quincenal : numeroNoNegativo(ingresoQuincenal, 'ingresoQuincenal');
    if (!ingreso) return null;
    return Math.floor(ingreso * c.fraccion_quincena / (1 + TASA_CREDITO));
  }

  /**
   * Aplica el freno a un cupo ya calculado. Apagado —o sin ingreso declarado—
   * devuelve el cupo intacto y `aplicado:false`. Nunca sube un cupo: solo topa.
   *
   * @param {number} cupo
   * @param {object} [opciones] {activo, fraccion_quincena, ingreso_quincenal}
   */
  function frenarPorIngreso(cupo, opciones) {
    var c = configFreno(opciones);
    var base = numeroNoNegativo(cupo, 'cupo');
    var tope = c.activo ? cupoPorIngreso(c.ingreso_quincenal, c) : null;
    var final = (tope == null) ? base : Math.min(base, tope);
    return {
      cupo: final,
      cupo_sin_freno: base,
      aplicado: tope != null && final < base,
      activo: c.activo,
      tope_por_ingreso: tope,
      fraccion_quincena: c.fraccion_quincena,
      ingreso_quincenal: c.ingreso_quincenal,
      // calcularCosto revienta con capital cero, y acá el cero es un dato
      // posible (ingreso declarado ínfimo): la cuota se arma a mano.
      cuota_maxima: tope == null ? null : tope + Math.round(tope * TASA_CREDITO)
    };
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
        /* Los centavos salen de la constante y no escritos a mano: cuando el
           factor bajó de 90 a 75 esta frase seguía diciendo 90 y la app le
           prometía al socio un número que el motor ya no daba. */
        texto: 'De cada peso de costo que pagas, ' + Math.round(FACTOR_GARANTIA * 100) +
               ' centavos se te vuelven garantía, y la garantía es tu cupo. Pagando en la ' +
               'fecha suma completo; pagando tarde suma la mitad, pero suma.'
      },
      /* 5-ago-2026 — EL CUPO, dicho de una vez, porque es lo que más se
         preguntó y lo que estaba repartido en dos pantallas: tu cupo es tu
         garantía, uno a uno. Ni factores ni niveles de por medio. */
      cupo: {
        uno_a_uno: true,
        // Redondeado a cuatro decimales porque 0,20 × 0,75 en punto flotante da
        // 0.15000000000000002, y eso terminaba impreso en una pantalla.
        crecimiento_por_credito: Math.round(TASA_CREDITO * FACTOR_GARANTIA * 10000) / 10000,
        texto: 'Tu cupo es tu garantía: puedes pedir exactamente lo que tienes. Y cada ' +
               'crédito que pagas en fecha te lo sube un ' +
               Math.round(TASA_CREDITO * FACTOR_GARANTIA * 100) + '%, así que se te ' +
               'duplica en cinco créditos.'
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
         mismas constantes que hacen la cuenta. El reparto 75/10/15 NO entra
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
      /* 6-ago-2026 — acá decía "cada persona que traigas te suma 5.000" y punto,
         y con el tope nuevo eso ya no es verdad siempre: los referidos comparten
         techo con el cupón de datos. Que la app diga la regla completa, con las
         mismas constantes que hacen la cuenta, en vez de prometer un cupo que
         después no aparece. */
      referidos: {
        por_cada_uno: GARANTIA_POR_REFERIDO,
        tope: TOPE_REFERIDOS,
        texto: 'Cada persona que traigas te suma ' + GARANTIA_POR_REFERIDO.toLocaleString('es-CO') +
               ' de garantía prestada, desde que esa persona pague su crédito' +
               (TOPE_REFERIDOS.hasta_la_ganada ? ' y hasta la garantía que ya te ganaste pagando' : '') +
               (TOPE_REFERIDOS.techo_prestada != null
                 ? '. Lo que te prestamos nosotros —tus datos y tus referidos juntos— llega hasta ' +
                   TOPE_REFERIDOS.techo_prestada.toLocaleString('es-CO') +
                   '; de ahí para arriba el cupo lo construyes pagando.'
                 : '.')
      },
      /* 5-ago-2026 — los niveles se quedan, pero ya no traen `factor`: no
         multiplican nada. Lo que se gana subiendo son prórrogas. Y va la frase
         acá para que ninguna pantalla tenga que inventarla. */
      niveles: NIVELES.map(function (n) {
        return { nivel: n, requisitos: REQUISITOS_NIVEL[n], mueve_el_cupo: false,
                 prorrogas: Math.min(PRORROGAS_POR_NIVEL[n], TOPE_DURO_PRORROGAS) };
      }),
      niveles_texto: 'Los niveles son el reconocimiento de tu historial y te dan más ' +
                     'prórrogas: hasta ' + TOPE_DURO_PRORROGAS + ' aplazamientos por crédito. ' +
                     'El cupo no depende del nivel: depende de tu garantía.',
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
   * EL TOPE de la garantía por referidos, en pesos. Lo que los referidos VALEN
   * lo dice garantiaPorReferidos; lo que se le puede ACREDITAR lo dice esto.
   *
   * @param {number} cupon   la garantía prestada por los datos
   * @param {number} ganada  la garantía que el socio se ganó pagando
   * @param {object} [config] {techo_prestada, hasta_la_ganada}; por defecto
   *        TOPE_REFERIDOS. Ver el comentario de esa constante.
   * @returns {number} Infinity si Joan apagó los dos topes.
   */
  function topeGarantiaPorReferidos(cupon, ganada, config) {
    if (config != null && typeof config !== 'object') {
      throw new TypeError('tope_referidos: se esperaba un objeto, llegó ' + describir(config));
    }
    var c = config || {};
    var techo = c.techo_prestada === undefined ? TOPE_REFERIDOS.techo_prestada : c.techo_prestada;
    var haciaLaGanada = c.hasta_la_ganada === undefined
      ? TOPE_REFERIDOS.hasta_la_ganada : c.hasta_la_ganada;
    var topes = [];
    if (techo != null) {
      topes.push(Math.max(0, numeroNoNegativo(techo, 'tope_referidos.techo_prestada') - cupon));
    }
    if (haciaLaGanada !== false) topes.push(Math.max(0, ganada));
    if (!topes.length) return Infinity;
    return Math.min.apply(null, topes);
  }

  /**
   * LAS PARTES DE LA GARANTÍA, en un solo lugar. `garantiaTotal` y
   * `desglosarGarantia` salen las dos de acá y por eso no pueden divergir: son
   * la misma cuenta mirada con más o menos detalle, no dos cuentas.
   *
   * (6-ago-2026: antes cada una hacía su propia suma y una prueba tenía que
   * vigilar que los totales coincidieran. El tope de los referidos habría sido
   * la tercera cosa que hay que acordarse de escribir en los dos lados.)
   */
  function partesDeGarantia(entrada) {
    if (entrada == null) entrada = {};
    if (typeof entrada !== 'object') throw new TypeError('entrada: se esperaba un objeto');

    var cupon = garantiaPorDatos(entrada.datos).total;
    var valenLosReferidos = garantiaPorReferidos(entrada.referidos);
    var acumulada = numeroNoNegativo(entrada.acumulada == null ? 0 : entrada.acumulada, 'acumulada');
    // Ajuste a mano de Joan al migrar (§13): puede sumar o restar, pero la
    // garantía total nunca queda negativa.
    var ajuste = entrada.ajuste == null ? 0 : numeroFinito(entrada.ajuste, 'ajuste');

    /* El ajuste negativo se come PRIMERO la ganada y recién después la prestada,
       así las dos partes siempre suman el mismo total. */
    var bruto = acumulada + ajuste;
    var ganada = Math.max(0, bruto);
    /* Y acá se topa: lo que los referidos valen no siempre es lo que se puede
       acreditar, porque son plata de Joan (ver TOPE_REFERIDOS). */
    var referidos = Math.min(valenLosReferidos,
                             topeGarantiaPorReferidos(cupon, ganada, entrada.tope_referidos));
    var prestada = Math.max(0, cupon + referidos + Math.min(0, bruto));

    return {
      cupon: cupon,
      referidos: referidos,
      // Cuánto habrían valido sin tope, para que el Panel pueda explicar la resta
      // en vez de que el socio vea un número que no cuadra con "5.000 por cada uno".
      referidos_sin_tope: valenLosReferidos,
      acumulada: acumulada,
      ajuste: ajuste,
      ganada: ganada,
      prestada: prestada,
      total: ganada + prestada
    };
  }

  /**
   * Garantía total del socio, con sus tres fuentes a la vista. Es lo que la
   * app le muestra desglosado para que entienda de dónde le sale cada peso.
   */
  function garantiaTotal(entrada) {
    var g = partesDeGarantia(entrada);
    return {
      cupon: g.cupon,
      referidos: g.referidos,
      acumulada: g.acumulada,
      ajuste: g.ajuste,
      total: g.total
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
   * Lo que cambia (29-jul-2026) es cuánto: en fecha suma el factor completo,
   * tarde la mitad. Es un bono al puntual, no una multa al que se atrasa.
   * 5-ago-2026: el factor pasa de 0,90 a 0,75 (y de 0,45 a 0,375).
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

  /**
   * LA ESCALERA, EN UN SOLO REDONDEO — 5-ago-2026.
   *
   * Cuánto cupo le deja un crédito quincenal del tamaño `capital` pagado en
   * fecha: el 15% del capital (0,20 de costo × 0,75 de garantía).
   *
   * ¿Por qué no `acumularGarantia(calcularCosto(capital))`? Porque encadena dos
   * redondeos y se desvía. Medido en la escalera que Joan fijó: el crédito 4 pide
   * 152.088, el costo redondea 30.417,60 a 30.418 y el 75% de eso redondea otra
   * vez, 22.813,50 a 22.814. Un peso de más, y la escalera prometida
   * (174.901) daba 174.902 desde ahí para siempre. Un solo redondeo sobre el
   * capital da 22.813 y la escalera cierra peso a peso.
   *
   * La regla se dice como un porcentaje del capital —"cada crédito puntual te
   * sube el cupo un 15%"—, así que se calcula como un porcentaje del capital.
   * `acumularGarantia` sigue siendo la regla de la plata YA COBRADA (un costo
   * concreto, una prórroga, un recargo), donde el peso redondeado es el que el
   * socio de verdad pagó.
   *
   * @param {number} capital
   * @param {boolean} [pagoFueATiempo] si se omite, se asume puntual.
   */
  function garantiaQueDejaUnCredito(capital, pagoFueATiempo) {
    var c = numeroPositivo(capital, 'capital');
    if (pagoFueATiempo !== undefined && typeof pagoFueATiempo !== 'boolean') {
      throw new TypeError('pagoFueATiempo: se esperaba true o false, llegó ' + describir(pagoFueATiempo));
    }
    var factor = pagoFueATiempo === false ? FACTOR_GARANTIA_MORA : FACTOR_GARANTIA;
    return Math.round(c * TASA_CREDITO * factor);
  }

  /**
   * §4-bis — EL FACTOR COMPLETO ES DEL QUE NO SE ATRASÓ, Y UNA PRÓRROGA NO SE
   * LO REPONE (5-ago-2026).
   *
   * OJO CON LOS PORCENTAJES DE ESTE BLOQUE: son los de la mañana en que se
   * midió, cuando el factor era 90% en fecha y 45% tarde. Ese mismo día, más
   * tarde, pasaron a 75% y 37,5%. La regla no cambió ni un ápice —el factor
   * COMPLETO contra LA MITAD— y las cifras medidas se dejan como quedaron para
   * no borrar la evidencia de por qué existe esta función.
   *
   * MEDIDO con el código de ayer: socio con 10 quincenas limpias y el crédito
   * 11 de 200.000 vencido desde el 31-mar. Saldar la deuda cuesta 494.000 y
   * acredita el 45% de los 294.000 de costos: 132.300. Prorrogar cuesta 294.000
   * y acredita exactamente lo mismo… pero la prórroga PONE EL RELOJ DE MORA EN
   * CERO, así que la quincena SIGUIENTE se cobra "en fecha" y se acredita al
   * 90%. Encadenando dos prórrogas: 334.000 de plata contra 494.000, garantía
   * 528.300 contra 492.300, 90.000 más de cupo y el capital todavía en la mano.
   * Por peso pagado, no pagar rendía el 50,4% contra el 45% del que salda.
   *
   * LA REGLA JUSTA, y es una sola: el factor completo premia al crédito que
   * NUNCA se atrasó. Desde que un crédito cae en mora, todo lo que se pague
   * sobre él —prórrogas, cuotas del plan de pagos, el saldo final— acredita al
   * 45%, aunque el corte se haya movido y el pago llegue "en fecha" del corte
   * nuevo. La prórroga compra TIEMPO, que es lo que el socio necesita y lo que
   * está pagando; no compra la puntualidad que ya no tuvo.
   *
   * Y NO BORRA NADA. El factor de cada pago se congela el día en que se paga y
   * mira solo lo que YA había pasado: los 132.300 de la prórroga que curó la
   * mora son 132.300 para siempre. Lo que deja de existir es el factor completo
   * del ciclo que vino DESPUÉS de la mora. La promesa sigue entera por los dos lados: no
   * se le quita lo ganado, y atrasarse no puede rendir más que pagar.
   *
   * El dato histórico no lo adivina el motor: quien liquida lo trae en
   * `credito.estuvo_en_mora` (el puente lo saca de la línea de tiempo del
   * crédito, que es la única que sabe qué corte regía cada día). Sin el dato se
   * asume que no hubo mora, que es el crédito recién desembolsado.
   *
   * @param {object} pago {pagado_en_fecha, credito_estuvo_en_mora}
   * @returns {boolean} true → acredita al FACTOR_GARANTIA completo
   */
  function cuentaComoPuntualParaGarantia(pago) {
    if (!pago || typeof pago !== 'object') {
      throw new TypeError('pago: se esperaba el objeto del pago');
    }
    if (pago.pagado_en_fecha !== true) return false;
    return pago.credito_estuvo_en_mora !== true;
  }

  /** Atajo interno: ¿este crédito ya venía de una mora? (§4-bis) */
  function veniaDeMora(credito) {
    return !!credito && credito.estuvo_en_mora === true;
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
    /* §4-bis — el factor completo es del crédito que NUNCA se atrasó. Si este ya
       estuvo en mora (el corte se movió con una prórroga o con un plan), pagar
       "en fecha" del corte nuevo acredita a la mitad: la prórroga compró tiempo,
       no puntualidad. */
    var acredita = cuentaComoPuntualParaGarantia({
      pagado_en_fecha: aTiempo, credito_estuvo_en_mora: veniaDeMora(credito) });

    return {
      fecha_corte: iso(corte),
      fecha_pago: iso(pago),
      dias_mora: diasMora,
      pago_a_tiempo: aTiempo,
      // Llegar en fecha y acreditar el factor completo dejaron de ser lo mismo
      // (§4-bis).
      acredita_en_fecha: acredita,
      tramo: tramoDeMora(dias).tramo,
      capital: capital,
      costo: costo,
      recargo_mora: recargo,
      tasa_mora_diaria: opciones.tasaDiaria != null ? opciones.tasaDiaria : TASA_MORA_DIARIA,
      base_mora: base,
      costo_total_pagado: costoTotal,
      total_a_pagar: capital + costoTotal,
      garantia_generada: acumularGarantia(costoTotal, acredita),
      // Lo que habría ganado pagando en fecha, para poder mostrárselo. Si el
      // crédito ya venía de una mora, el factor completo ya no está disponible ni
      // pagando hoy: el techo honesto es la mitad.
      garantia_si_puntual: acumularGarantia(costo, cuentaComoPuntualParaGarantia({
        pagado_en_fecha: true, credito_estuvo_en_mora: veniaDeMora(credito) })),
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
    // El 15% del capital en un solo redondeo, que es la escalera que se le
    // promete al socio (ver garantiaQueDejaUnCredito). La calculadora y la
    // proyección tienen que dar el MISMO peso.
    var deja = garantiaQueDejaUnCredito(c, true);
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
      var gana = garantiaQueDejaUnCredito(pide, true);
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
    /* 5-ago-2026 §4-bis — las cuotas del plan se acreditaban SIEMPRE al factor
       completo,
       y un plan de pagos existe justamente porque el crédito ya se atrasó: era
       el mismo regalo de la prórroga encadenada por otra puerta. Pagar la cuota
       el día de su corte es lo que se espera del plan; el factor completo es del
       ciclo que nunca se atrasó. */
    var acredita = cuentaComoPuntualParaGarantia({
      pagado_en_fecha: true, credito_estuvo_en_mora: veniaDeMora(credito) });

    for (var i = 0; i < n; i++) {
      // La última cuota absorbe el resto de la división, para no perder pesos.
      var capital = (i === n - 1) ? saldo : cuotaBase;
      var costo = Math.round(saldo * TASA_PLAN_DE_PAGOS);
      var gana = acumularGarantia(costo, acredita);
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
    /* El costo con su factor de puntualidad y el recargo SIEMPRE a la mitad: es
       plata que solo existe porque el corte ya había pasado. Es la misma cuenta
       que hace el puente sobre la prórroga ya guardada, y a propósito.
       5-ago-2026 §4-bis: y el factor del costo mira además si el crédito YA
       venía de una mora. Si viene, esta prórroga acredita a la mitad aunque se
       registre el mismísimo día del corte nuevo — es el ciclo que la prórroga
       anterior le compró, no una quincena limpia. */
    var acredita = cuentaComoPuntualParaGarantia({
      pagado_en_fecha: aTiempo, credito_estuvo_en_mora: veniaDeMora(credito) });
    var garantia = acumularGarantia(costo, acredita) + acumularGarantia(recargo, false);
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
      // Registrarla en fecha y acreditarla al factor completo dejaron de ser lo
      // mismo: un crédito que ya estuvo en mora acredita a la mitad (§4-bis).
      acredita_en_fecha: acredita,
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
      // pueda acreditar a la mitad sin degradar el costo.
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
       cualquier otro pago (§4). Acreditarlo siempre al factor completo, incluso registrado
       con veinte días de atraso, hacía que DEJAR la prórroga dejara más
       garantía que SALDAR la deuda ese mismo día: plata prestada al peor
       pagador y una lección al revés. Lo ya ganado no se toca —el factor se
       congela el día en que se paga y nada posterior lo baja—, pero pagar
       tarde no puede rendir más que pagar a tiempo. */
    var prorrogaATiempo = fechaMovimiento <= iso(corteActual);
    /* 5-ago-2026 §4-bis — y no alcanza con llegar en fecha: si el crédito YA
       venía de una mora, el factor completo ya no está. Encadenar prórrogas se
       acreditaba completo a partir de la segunda, porque la primera le ponía el reloj de
       mora en cero: 334.000 pagados rendían más garantía que saldar 494.000. */
    var prorrogaAcredita = cuentaComoPuntualParaGarantia({
      pagado_en_fecha: prorrogaATiempo, credito_estuvo_en_mora: veniaDeMora(credito) });

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
      // 5-ago-2026: y completo solo si el crédito no venía de una mora (§4-bis)
      garantia_generada: acumularGarantia(costo, prorrogaAcredita),
      prorroga_a_tiempo: prorrogaATiempo,
      prorroga_acredita_en_fecha: prorrogaAcredita,
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
        garantia_generada: acumularGarantia(costo, prorrogaAcredita)
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
    /* Las partes salen de partesDeGarantia —la MISMA cuenta que garantiaTotal—,
       así que el total de acá nunca puede diferir del de allá. Lo único que se
       agrega es la comprometida, que garantiaTotal no necesita saber. */
    var g = partesDeGarantia(entrada);
    var pedida = numeroNoNegativo(
      (entrada && entrada.comprometida) == null ? 0 : entrada.comprometida, 'comprometida');
    // No se puede comprometer más de lo que se ganó: si el dato viene sucio,
    // se recorta en vez de reventar, que es plata que el socio ya ve en pantalla.
    var comprometida = Math.min(pedida, g.ganada);

    return {
      cupon: g.cupon,
      referidos: g.referidos,
      referidos_sin_tope: g.referidos_sin_tope,
      acumulada: g.acumulada,
      ajuste: g.ajuste,
      prestada: g.prestada,
      ganada: g.ganada,
      comprometida: comprometida,
      ganada_libre: g.ganada - comprometida,
      total: g.total,
      base_cupo: Math.max(0, g.total - comprometida)
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
   *
   * 5-ago-2026: el cupo es la base uno a uno —el nivel ya no lo mueve— y `factor`
   * dejó de viajar. Y acá entra el FRENO POR INGRESO, apagado por defecto: solo
   * topa si quien pregunta le pasa `opciones.freno.activo === true`.
   *
   * @param {object} [entrada]  la forma de desglosarGarantia
   * @param {string} [nivelSocio]
   * @param {object} [opciones] {freno:{activo, fraccion_quincena, ingreso_quincenal}}
   */
  function cupoQuincenal(entrada, nivelSocio, opciones) {
    opciones = opciones || {};
    var d = desglosarGarantia(entrada);
    var nivel = normalizarNivel(nivelSocio == null ? 'bronce' : nivelSocio, 'nivelSocio');
    var freno = frenarPorIngreso(calcularCupo(d.base_cupo, nivel), opciones.freno);
    return {
      cupo: freno.cupo,
      base: d.base_cupo,
      total: d.total,
      ganada: d.ganada,
      prestada: d.prestada,
      comprometida: d.comprometida,
      ganada_libre: d.ganada_libre,
      respaldo_disponible: maximoRespaldado(entrada),
      nivel: nivel,
      // El nivel viaja porque sigue existiendo (prórrogas, reconocimiento), no
      // porque mueva este número.
      nivel_mueve_el_cupo: false,
      freno: freno
    };
  }

  /**
   * Garantía que deja un costo pagado del préstamo con garantía: solo el 20%.
   * Es a propósito que sea tan poco. El socio elige entre plata barata y
   * crecer: el quincenal cuesta más pero le sube el cupo casi cuatro veces más
   * rápido por cada peso de costo (0,75 contra 0,20).
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
   * EL REPARTO 75/10/15 — contabilidad de Joan, no del socio (5-ago-2026).
   *
   * Cada peso de costo que entra se parte en tres: 75% se le vuelve garantía al
   * socio, 10% sostiene la plataforma y 15% va amortizando el cupón de 100.000
   * que se le REGALÓ para arrancar. El 90/7/3 queda derogado: con el 3% el cupón
   * tardaba una vida en volver y la exposición de Joan crecía mientras tanto.
   * Con el 15% se salda en el crédito 13 y desde ahí es ganancia.
   *
   * PAGADO TARDE queda 37,5 / 47,5 / 15. El cupón se cobra igual —es plata que
   * hay que recuperar igual— y el bono que el socio no se ganó va entero a
   * operativo, que es de donde salió el descuento.
   *
   * El socio no ve esto por ningún lado: para él su garantía es el 75% y punto.
   * Si esto aparece alguna vez en una pantalla del socio o en lo que sube a la
   * nube, está mal.
   *
   * @param {number} costoPagado
   * @param {object} [opciones] {aTiempo=true, producto='quincenal', cuponPendiente=Infinity}
   * @returns {{total, garantia_socio, amortiza_cupon, operativo,
   *            cupon_nominal, ganancia_cupon}}
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

    /* El 15% se deja de cobrar cuando ese socio ya devolvió todo su cupón. Lo
       que sobra de ese 15% NO desaparece: pasa a ganancia, y va aparte en
       `ganancia_cupon` para que el Panel pueda decir de dónde salió. */
    var nominal = Math.round(total * REPARTO_COSTO.cupon);
    var cupon = Math.min(nominal, Math.max(0, pendiente));
    /* Operativo absorbe TODO el redondeo, para que los tres pedazos sumen el
       costo exacto siempre — con costos feos (1, 7, 13, 99, 101) y en los dos
       casos de puntualidad. */
    var operativo = total - garantia - cupon;
    if (operativo < 0) { cupon = Math.max(0, cupon + operativo); operativo = total - garantia - cupon; }
    if (operativo < 0) operativo = 0;

    return {
      total: total,
      garantia_socio: garantia,
      amortiza_cupon: cupon,
      operativo: operativo,
      // Cuánto habría ido al cupón si quedara algo por recuperar, y cuánto de
      // ese 15% ya es ganancia porque no quedaba. `operativo` los contiene.
      cupon_nominal: nominal,
      ganancia_cupon: Math.min(Math.max(0, nominal - cupon), operativo)
    };
  }

  /**
   * EL CUPÓN AMORTIZADO Y LA GANANCIA LIBRE — 5-ago-2026, contabilidad del Panel.
   *
   * Recorre los costos que un socio YA PAGÓ, en orden, y va descontando el 15%
   * de cada uno del cupón que la plataforma le regaló. Contesta las tres
   * preguntas del Panel: cuánto queda por recuperar, cuánto ya se recuperó y
   * cuánto de lo cobrado es ganancia libre.
   *
   * SE DERIVA, NO SE GUARDA, y es la misma decisión que ya se tomó con el nivel
   * (que es un máximo histórico derivado) y con el costo del ciclo (que se
   * reconstruye del historial): un contador guardado se desincroniza el día que
   * Joan edita un pago, y desde ahí miente para siempre sin que nadie lo note.
   * Acá se vuelve a sumar desde los hechos cada vez que se pregunta.
   *
   * EL ORDEN IMPORTA y por eso la lista se recibe ya ordenada: el 15% del
   * crédito 13 se parte en dos —una parte termina de saldar el cupón y el resto
   * ya es ganancia—, y eso solo se sabe habiendo pasado por los 12 anteriores.
   *
   * @param {Array} costos  [{monto, aTiempo, producto, fecha, tipo}] cronológico.
   *                        `monto` es el costo COBRADO (sin capital).
   * @param {object} [opciones] {cuponPrestado} lo que la plataforma le regaló;
   *                            por defecto CUPON_KYC_MAXIMO.
   */
  function amortizarCupon(costos, opciones) {
    opciones = opciones || {};
    if (costos != null && !Array.isArray(costos)) {
      throw new TypeError('costos: se esperaba una lista, llegó ' + describir(costos));
    }
    var prestado = numeroNoNegativo(
      opciones.cuponPrestado == null ? CUPON_KYC_MAXIMO : opciones.cuponPrestado, 'cuponPrestado');

    var pendiente = prestado, movimientos = [], saldadoEn = null;
    var cobrado = 0, garantia = 0, recuperado = 0, operativo = 0, gananciaCupon = 0;

    (costos || []).forEach(function (c, i) {
      if (!c || typeof c !== 'object') {
        throw new TypeError('costos[' + i + ']: se esperaba un objeto {monto, aTiempo}');
      }
      var r = repartirCosto(c.monto == null ? 0 : c.monto, {
        aTiempo: c.aTiempo !== false,
        producto: c.producto == null ? 'quincenal' : c.producto,
        cuponPendiente: pendiente
      });
      pendiente = Math.max(0, pendiente - r.amortiza_cupon);
      cobrado += r.total;
      garantia += r.garantia_socio;
      recuperado += r.amortiza_cupon;
      operativo += r.operativo;
      gananciaCupon += r.ganancia_cupon;
      if (saldadoEn === null && pendiente === 0) saldadoEn = i;
      movimientos.push({
        indice: i,
        fecha: c.fecha == null ? null : c.fecha,
        tipo: c.tipo == null ? null : c.tipo,
        producto: c.producto == null ? 'quincenal' : c.producto,
        monto: r.total,
        garantia_socio: r.garantia_socio,
        amortiza_cupon: r.amortiza_cupon,
        operativo: r.operativo,
        ganancia_cupon: r.ganancia_cupon,
        cupon_pendiente_despues: pendiente
      });
    });

    return {
      cupon_prestado: prestado,
      cupon_recuperado: recuperado,
      cupon_pendiente: pendiente,
      saldado: pendiente === 0,
      // En qué movimiento quedó saldado (0-based), o null si todavía no.
      saldado_en: saldadoEn,
      cobrado: cobrado,
      garantia_socio: garantia,
      operativo: operativo,
      /* Lo cobrado que ya no es ni garantía del socio ni recuperación de
         capital: es ganancia libre. `operativo` la contiene entera —el 15% que
         se liberó cae ahí— y `ganancia_cupon` dice cuánto de ella viene de ese
         15%, que es el número que Joan pidió ver. */
      ganancia_libre: operativo,
      ganancia_cupon: gananciaCupon,
      // Lo que todavía está en riesgo: el cupón que no se ha recuperado.
      expuesto: pendiente,
      movimientos: movimientos
    };
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
    cuentaComoPuntualParaGarantia: cuentaComoPuntualParaGarantia,

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
    // El tope de los referidos (6-ago-2026): lo que valen vs. lo que se acredita
    topeGarantiaPorReferidos: topeGarantiaPorReferidos,
    partesDeGarantia: partesDeGarantia,
    garantiaTotal: garantiaTotal,
    reglasResumen: reglasResumen,

    // Calculadora y proyecciones
    simularCredito: simularCredito,
    proyectarCrecimiento: proyectarCrecimiento,
    proyeccionNiveles: proyeccionNiveles,
    garantiaNecesariaPara: garantiaNecesariaPara,
    // La escalera del 15%, en un solo redondeo (5-ago-2026)
    garantiaQueDejaUnCredito: garantiaQueDejaUnCredito,
    // El freno por ingreso, APAGADO por defecto (5-ago-2026)
    cupoPorIngreso: cupoPorIngreso,
    frenarPorIngreso: frenarPorIngreso,

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
    /* El tope de la prestada por referidos, para que Joan lo pueda mover desde
       un solo lugar (6-ago-2026). Se puede pasar por entrada.tope_referidos. */
    TOPE_REFERIDOS: TOPE_REFERIDOS,
    CUPO_MAXIMO: CUPO_MAXIMO,
    MONTO_MINIMO: MONTO_MINIMO,
    MONTO_MAXIMO_CALCULADORA: MONTO_MAXIMO_CALCULADORA,
    /* FACTOR_CUPO NO SE EXPORTA MÁS (5-ago-2026): el cupo es la garantía uno a
       uno y ese factor ya no existe. Si una pantalla lo lee va a leer undefined,
       que es infinitamente mejor que seguir pintando "×2 tu garantía". */
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
    // El cupón amortizado y la ganancia libre, DERIVADOS (5-ago-2026)
    amortizarCupon: amortizarCupon,
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
    FRENO_INGRESO: FRENO_INGRESO,
    ALFABETO_CODIGO: ALFABETO_CODIGO,
    LARGO_CODIGO: LARGO_CODIGO,
    PREFIJO_CODIGO: PREFIJO_CODIGO
  };
});
