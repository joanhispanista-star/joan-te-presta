/* ===========================================================================
 * PUENTE — la única traducción entre el Panel de Joan y la app del socio.
 * 2 de agosto de 2026.
 *
 * El Panel (crm.html) y la app (socios/socio.html) se sirven del MISMO ORIGEN,
 * así que comparten localStorage. La app puede leer la cartera del Panel y
 * mostrarle al socio sus números de verdad, sin nube y sin enlaces.
 *
 * Este archivo existe por UNA razón: que la traducción sea una sola. Si la app
 * se hiciera su propia versión, el día que cambie el cálculo de la racha o del
 * cupón el enlace de WhatsApp y el modo panel mostrarían números distintos para
 * el mismo cliente. Acá hay una sola verdad, y de yapa se puede probar con node.
 *
 * REGLA DE ORO: acá NO hay ni puede haber un setItem ni un removeItem. Estas
 * funciones son puras: reciben el `db` y devuelven objetos nuevos. Los clientes
 * reales de Joan viven en ese localStorage y nada de acá los puede tocar.
 *
 * Y lo que NO viaja al socio, por regla y no por olvido: fotos, ubicación,
 * teléfonos, la nota de riesgo, el motivo del ajuste, la papelera, las
 * gestiones, y todo el reparto 90/7/3 (contabilidad de Joan).
 * ===========================================================================*/
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./motor.js'));
  else raiz.PuenteTuGarantia = fabrica(raiz.MotorReglas);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';

  var LLAVE_PANEL = 'joan_socios_v1';

  /* ------------------------------------------------------------ utilidades */
  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function num(v) { return Number(v) || 0; }
  function lista(v) { return Array.isArray(v) ? v : []; }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }
  function diasEntre(a, b) {
    return Math.max(1, Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000));
  }

  /* ------------------------------------ ¿cuándo se pagó un crédito viejo? --
     3-ago-2026. Antes, a un crédito viejo ya pagado que no traía `fechaPagado`
     la migración le estampaba la fecha de HOY. Como esPuntual() compara
     fechaPagado <= cicloPago, ESO LEÍA COMO PAGADO TARDE todo crédito viejo
     pagado en fecha: garantía al 45% en vez del 90%, y el socio anclado en
     bronce. Un crédito de 200.000 pagado el 15-may daba 18.000 de garantía en
     vez de 36.000 — o sea, a los clientes más antiguos de Joan, los mejores,
     el historial les partía el cupo por la mitad.

     La fecha buena SÍ estaba en los datos y no se usaba. Se toma la mejor
     fuente disponible, en este orden:
       1. el último abono — es la plata que cerró el crédito, la fecha real;
       2. el corte al que se le cargó (cicloPago / cicloActual / fechaPago) —
          de un crédito viejo que quedó pagado y no dejó ninguna huella de
          atraso, lo honrado es leerlo como pagado en su fecha, no castigarlo;
       3. hoy, solo si de verdad no hay ninguna de las dos. Un crédito así no
          tiene ni abonos ni corte: no hay nada que deducir.
     Nunca inventa una fecha posterior a hoy. */
  function fechaFin(iso) {
    if (!iso) return '';
    var s = String(iso).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }
  function ultimoAbonoDe(p) {
    return lista(p && p.abonos).map(function (a) {
      return fechaFin(a && (a.fecha || a.fechaPago));
    }).filter(Boolean).sort().pop() || '';
  }
  /* 3-ago-2026, tercera pasada: el último abono solo sirve de fecha si de
     verdad CERRÓ el crédito (ver abonosCierranElCredito más abajo). Uno
     parcial no dice cuándo se pagó: dice cuándo se abonó. */
  function fechaPagadoDeducida(p, corte) {
    return (abonosCierranElCredito(p) ? ultimoAbonoDe(p) : '') || fechaFin(corte) || hoyISO();
  }

  /* ------------------- la fechaPagado FALSA que dejó el Panel viejo --------
     3-ago-2026, segunda pasada. Lo de arriba llega tarde justo para la
     población que venía a rescatar. El Panel VIEJO (el archivado del 17-jul)
     hacía `p.fechaPagado = isoLocal(new Date())` dentro de su propio cargar(),
     y el primer guardar() que vino después lo dejó grabado. O sea que esos
     créditos HOY traen `pagado:true` y una `fechaPagado` que NO es el día en
     que el cliente pagó: es el día en que Joan abrió el Panel. El arreglo de
     arriba no los toca, porque vive dentro de `if (p.pagado === undefined)` y
     además pregunta `if (!p.fechaPagado)`: las dos puertas están cerradas
     exactamente para ellos. Medido, seguían acreditando 18.000 en vez de
     36.000.

     EL CRITERIO — y vive acá, no en crm.html, para que haya uno solo:

         un crédito no se pudo pagar DESPUÉS del abono que LO CERRÓ.

     El abono que lo cerró es la plata que dejó el crédito en cero. Una
     `fechaPagado` posterior a esa fecha no es "sospechosa": es imposible. La
     única forma de que exista es que se la haya estampado algo que no era el
     pago. Entonces se descarta y se vuelve a deducir con fechaPagadoDeducida().

     ------------------------------------------------------------------------
     3-ago-2026, TERCERA pasada. La segunda dejó esto corriendo como REGLA
     PERMANENTE —en cada carga del Panel y sobre cada crédito pagado— y con eso
     el remedio salió peor que la enfermedad. Se arreglan dos cosas:

     (a) "el abono que lo cerró" no es cualquier abono. En el esquema viejo
         `abonos` guarda TAMBIÉN abonos parciales: por eso normalizar() deduce
         `pagado` sumándolos y comparando la SUMA contra `p.total`. Puede haber
         varios y ninguno cerrar nada.
         Medido: crédito de 200.000 al 20%, corte 15-may, UN abono parcial de
         100.000 el 15-may. Joan lo cobra hoy 3-ago (80 días de mora): 40.000
         de costo + 160.000 de recargo, 90.000 de garantía. Correcto. Cierra el
         Panel, lo vuelve a abrir, y la fecha se reescribía al 15-may: el
         crédito pasaba a PUNTUAL y la garantía saltaba a 180.000 — el doble,
         por un historial que no existe. Y estable: en la tercera carga ya no
         se movía, así que ni Joan ni el socio tenían cómo notarlo, y el cupo,
         el nivel y el máximo respaldado le subían contra plata inventada.
         Ahora el criterio solo se aplica si los abonos SUMAN el total, que es
         la única forma de saber que el último de verdad cerró el crédito.

     (b) esto es una MIGRACIÓN, no una regla. Corre UNA sola vez por crédito y
         deja constancia en `fechaPagadoMigrada` (el día en que corrió). Con la
         marca puesta no se vuelve a mirar nunca más.

     Las tres poblaciones, distinguidas por marcas explícitas y no por
     adivinanza:

       1. COBRADO POR ESTE SISTEMA — pagarTotal() estampa `cobroRegistrado:true`
          desde el 3-ago-2026. Esa fechaPagado la escribió un pago real, con la
          fecha que tecleó Joan. NO SE TOCA, tenga los abonos que tenga: el
          crédito viejo cobrado hoy es justamente el que se corrompía.
       2. YA MIGRADO — trae `fechaPagadoMigrada`. Ya se revisó; no se vuelve.
       3. LEGADO SIN MARCAR — todo lo demás, que es la población del 17-jul. Se
          le aplica el criterio UNA vez y se estampa la marca.

     Dentro del legado siguen saliendo bien las cuatro poblaciones de siempre:
       · viejo pagado EN FECHA, con abonos que suman el total → 17-jul > 15-may
         ⇒ falsa. Se corrige al 15-may y vuelve a ser puntual: 90%, que es lo
         que el socio se ganó.
       · viejo pagado TARDE de verdad → 17-jul > 20-may ⇒ falsa también, pero
         al corregirla queda el 20-may, que SIGUE siendo posterior al corte del
         15-may. Sigue leyéndose tarde y sigue dando 45%. El arreglo no regala
         puntualidad: devuelve la fecha real y deja que esPuntual() decida.
       · nuevo, en fecha o tarde → ni se lo mira. `abonos` es el esquema VIEJO;
         los créditos que abre el Panel de hoy traen `abonosCapital` y nunca
         `abonos`, así que no hay abono con qué comparar y la fecha que traen
         —que es la buena— queda intacta.
       · pagado sin ningún abono, o con abonos que NO cierran → no hay
         evidencia de nada y la fecha se respeta. Deducirla sería inventar
         garantía en vez de rescatarla.

     Lo único que este arreglo no puede rescatar es un crédito viejo que Joan
     ya cobró con el Panel de ayer, antes de que pagarTotal() estampara
     `cobroRegistrado`: no dejó marca y no hay cómo distinguirlo. Para esos
     manda (a): si los abonos no cierran el crédito, la fecha no se toca. */
  function totalAbonos(p) {
    return lista(p && p.abonos).reduce(function (s, a) { return s + num(a && a.monto); }, 0);
  }
  /* La MISMA pregunta con la que normalizar() deduce `pagado` más abajo, y a
     propósito: si un día cambia una, tiene que cambiar la otra. */
  function abonosCierranElCredito(p) {
    return !!(p && p.total && totalAbonos(p) >= num(p.total) - 0.5);
  }
  /* Pura: dice qué fechaPagado le corresponde, sin tocar nada. */
  function fechaPagadoCorregida(p) {
    if (!p || !p.pagado) return p ? p.fechaPagado : null;
    if (p.cobroRegistrado) return p.fechaPagado;      // 1. lo cobró este sistema
    if (p.fechaPagadoMigrada) return p.fechaPagado;   // 2. ya se migró una vez
    var corte = p.cicloPago || p.cicloActual;
    var actual = fechaFin(p.fechaPagado);
    if (!actual) return fechaPagadoDeducida(p, corte);
    if (!abonosCierranElCredito(p)) return p.fechaPagado;
    var ultimo = ultimoAbonoDe(p);
    return (ultimo && actual > ultimo) ? fechaPagadoDeducida(p, corte) : p.fechaPagado;
  }
  /* La migración: aplica el criterio y deja la constancia, para que la próxima
     carga ni se asome. Devuelve true si pasó por este crédito. Es lo único que
     tienen que llamar cargar() del Panel y normalizar() de la app. */
  function migrarFechaPagado(p) {
    if (!p || !p.pagado) return false;
    if (p.cobroRegistrado || p.fechaPagadoMigrada) return false;
    p.fechaPagado = fechaPagadoCorregida(p);
    p.fechaPagadoMigrada = hoyISO();
    return true;
  }

  /* --------------------------------------------------- lectura defensiva --
     La misma migración de cargar() del Panel, pero SIN escribir. Un respaldo
     viejo, un socio en null o un préstamo sin capital no pueden dejar al
     cliente sin ver su cuenta: se saltean y se sigue. */
  function normalizar(crudo) {
    var d = (crudo && typeof crudo === 'object') ? crudo : {};
    var db = {
      socios: lista(d.socios).length ? lista(d.socios) : lista(d.clientes),
      prestamos: lista(d.prestamos),
      respaldados: lista(d.respaldados),
      invitaciones: lista(d.invitaciones),
      config: Object.assign({ negocio: 'Tu Garantía', whatsapp: '' }, d.config || {}),
      contadores: Object.assign({ cliente: 0, credito: 0, respaldado: 0 }, d.contadores || {})
    };

    db.socios = db.socios.filter(Boolean).map(function (s) {
      if (s.gestiones === undefined) s.gestiones = [];
      if (!s.referencia) s.referencia = { nombre: '', telefono: '' };
      if (s.whatsappIgual === undefined) s.whatsappIgual = true;
      if (s.cedulaFrenteFoto === undefined) s.cedulaFrenteFoto = s.cedulaFoto || null;
      if (s.cedulaReversoFoto === undefined) s.cedulaReversoFoto = null;
      if (s.selfieFoto === undefined) s.selfieFoto = null;
      if (s.telefono2 === undefined) s.telefono2 = '';
      if (s.notaRiesgo === undefined) s.notaRiesgo = '';
      if (s.ubicacion === undefined) s.ubicacion = null;
      if (s.ajusteGarantia === undefined) s.ajusteGarantia = 0;
      if (s.ajusteMotivo === undefined) s.ajusteMotivo = '';
      if (s.migracionRevisada === undefined) s.migracionRevisada = null;
      if (s.codigoInvitacion === undefined) s.codigoInvitacion = null;
      return s;
    });

    db.prestamos = db.prestamos.filter(Boolean).map(function (p) {
      if (p.cicloActual === undefined) p.cicloActual = p.fechaPago;
      if (!Array.isArray(p.prorrogas)) p.prorrogas = [];
      if (!Array.isArray(p.abonosCapital)) p.abonosCapital = [];
      if (!Array.isArray(p.comprobantes)) p.comprobantes = [];
      if (p.costoPct === undefined || p.costoPct === null) p.costoPct = 20;
      if (p.pagado === undefined) {
        var ab = lista(p.abonos).reduce(function (s, a) { return s + num(a.monto); }, 0);
        p.pagado = !!(p.total && ab >= p.total - 0.5);
        if (p.pagado) {
          if (!p.cicloPago) p.cicloPago = p.cicloActual;
          if (!p.gananciaPago) p.gananciaPago = num(p.capital) * num(p.costoPct) / 100;
        }
      }
      /* Esta línea va FUERA del `if` de arriba a propósito: los créditos que el
         Panel viejo ya dejó con pagado:true son justamente los que traen la
         fechaPagado falsa, y adentro no se los alcanza nunca. Es la MISMA
         migración que corre el Panel —una sola vez por crédito y con
         constancia—, salvo que acá la marca se queda en memoria: este archivo
         no escribe en el localStorage de Joan ni puede. */
      if (p.pagado) migrarFechaPagado(p);
      return p;
    }).filter(function (p) { return p && p.capital != null; });

    db.respaldados = db.respaldados.filter(Boolean).map(function (r) {
      if (!Array.isArray(r.cuotas)) r.cuotas = [];
      if (r.pagado === undefined) {
        r.pagado = r.cuotas.length > 0 && r.cuotas.every(function (c) { return !!c.pagado; });
      }
      return r;
    });

    return db;
  }

  /* ------------------------------------------------ cuentas de un crédito */
  function capitalActual(p) {
    return Math.max(0, num(p.capital) - lista(p.abonosCapital).reduce(function (s, a) { return s + num(a.monto); }, 0));
  }

  /* ------------------------------------------------------ plan de pagos --
     4-ago-2026. Cuando al socio se le acaban las prórrogas, el §8 manda pasarlo
     a un plan de pagos: el capital repartido en 3 cortes al 5% sobre el saldo
     insoluto. El motor lo arma (construirPlanDePagos) y hasta hoy nadie lo
     registraba: la app del socio le prometía al cliente una salida que el Panel
     no tenía dónde anotar.

     El plan queda MATERIALIZADO en `p.planPagos.cuotas`, igual que las cuotas
     del préstamo con garantía: las fechas y los montos no se recalculan nunca
     después, así el calendario no se mueve solo. Mientras hay plan, el "ciclo"
     del crédito es la cuota que sigue: su capital, su costo y su fecha. Por eso
     el Panel no necesita una segunda pantalla de cobro. */
  function cuotasPlan(p) { return lista(p && p.planPagos && p.planPagos.cuotas); }
  function tienePlan(p) { return cuotasPlan(p).length > 0; }
  function cuotaPlanActual(p) {
    var pend = cuotasPlan(p).filter(function (c) { return !c.pagado; });
    return pend.length ? pend[0] : null;
  }
  /* El capital que se cobra en ESTE ciclo. Sin plan es todo el capital vigente;
     con plan es el de la cuota, que es también la base del 1% diario de mora. */
  function capitalDelCiclo(p) {
    var c = cuotaPlanActual(p);
    return c ? num(c.capital) : capitalActual(p);
  }
  function K(p) {
    var c = cuotaPlanActual(p);
    return c ? num(c.costo) : capitalActual(p) * num(p.costoPct) / 100;
  }
  /* El porcentaje que rige ESTE ciclo, decimal, para que la etiqueta que ve el
     socio ("Costo (5%)") salga del mismo lado que el número y no de una
     suposición de la pantalla. Sigue exactamente la misma bifurcación que K. */
  function tasaDelCiclo(p) {
    if (cuotaPlanActual(p)) {
      var t = num(p.planPagos && p.planPagos.tasa_por_corte);
      return t > 0 ? t : M.TASA_PLAN_DE_PAGOS;
    }
    var pct = num(p && p.costoPct);
    return pct > 0 ? pct / 100 : M.TASA_CREDITO;
  }
  /* Lo cobrado por las cuotas del plan que ya se pagaron (costo + recargo), y
     la entrada: lo que se cobró el día que se pactó (costo del ciclo y el
     recargo ya causado, que el plan tampoco borra). */
  function entradaPlan(p) { return (p && p.planPagos && p.planPagos.entrada) || null; }
  function costoCobradoPlan(p) {
    return cuotasPlan(p).reduce(function (t, c) {
      return t + (c.pagado ? num(c.costo) + num(c.recargo) : 0);
    }, 0) + num(entradaPlan(p) && entradaPlan(p).monto);
  }
  function garantiaGanadaPlan(p) {
    return cuotasPlan(p).reduce(function (t, c) {
      return t + (c.pagado ? num(c.garantiaGenerada) : 0);
    }, 0) + (entradaPlan(p) ? garantiaGanadaProrroga(entradaPlan(p)) : 0);
  }
  /* `pr.monto` es lo que el socio pagó por la prórroga. Desde el 3-ago-2026 el
     Panel le cobra el costo del ciclo MÁS el recargo de mora ya causado, y
     guarda el recargo aparte en `pr.mora` para no perder de vista de qué está
     hecho ese monto. Las prórrogas viejas no traen `mora`: son todas costo. */
  function moraDeProrroga(pr) {
    return Math.min(Math.max(0, num(pr && pr.mora)), Math.max(0, num(pr && pr.monto)));
  }
  function costoDeProrroga(pr) { return Math.max(0, num(pr && pr.monto) - moraDeProrroga(pr)); }
  /* ¿Se registró esta prórroga EN FECHA? Es lo que decide el factor de su costo,
     y se congela el día en que se paga: nada de lo que pase después la mueve.
     El Panel lo graba en `aTiempo` desde el 4-ago-2026. Para todo lo anterior se
     deduce de lo único que quedó guardado: si la prórroga trajo recargo de mora,
     es porque el corte ya había pasado. Las prórrogas viejas no traen `mora`, así
     que se leen como puntuales y conservan el 90% que ya se les acreditó —la
     garantía ya ganada no se borra nunca, ni hacia atrás. */
  function prorrogaFueATiempo(pr) {
    if (pr && typeof pr.aTiempo === 'boolean') return pr.aTiempo;
    return moraDeProrroga(pr) === 0;
  }
  /* La garantía que dejó UNA prórroga, con la misma regla del §4 que usa
     cualquier otro pago: el costo con el factor de puntualidad de la prórroga y
     el recargo de mora siempre al 45%, porque es plata que solo existe porque el
     corte ya había pasado. Es la ÚNICA cuenta: el Panel la muestra en el confirm
     con esta misma función, así que Joan no puede ver un número y el socio otro. */
  function garantiaGanadaProrroga(pr) {
    var aTiempo = prorrogaFueATiempo(pr);
    return M.acumularGarantia(costoDeProrroga(pr), aTiempo) +
           M.acumularGarantia(moraDeProrroga(pr), false);
  }
  function gananciaCobrada(p) {
    return lista(p.prorrogas).reduce(function (s, pr) { return s + num(pr.monto); }, 0) +
           costoCobradoPlan(p) +
           (p.pagado ? num(p.gananciaPago) : 0);
  }
  function capitalRecuperadoDe(p) { return p.pagado ? num(p.capital) : (num(p.capital) - capitalActual(p)); }
  function esPuntual(p) { return !!(p.pagado && p.fechaPagado && p.cicloPago && p.fechaPagado <= p.cicloPago); }

  /* ------------------------------------- puntual PARA SUBIR DE NIVEL -------
     4-ago-2026 — LA PRÓRROGA LAVABA EL HISTORIAL.
     esPuntual() compara la fecha de pago contra el corte, y la prórroga corre
     el corte al FUTURO. O sea que el que prorrogaba y pagaba al día siguiente
     quedaba registrado como PAGADO EN FECHA por muy atrasado que estuviera.
     Medido: cinco créditos pagados 15 días tarde cada uno, lavados con
     prórroga, subían al socio de bronce (367.500 de cupo) a ORO (1.062.500).

     La regla la pone el motor (cuentaComoPuntual) y separa las dos cosas que la
     promesa del producto exige a la vez:
       · NO SE LE QUITA NADA — esPuntual() sigue mandando en la GARANTÍA, así
         que lo que pagó le suma igual, y el nivel no baja nunca.
       · NO SE LE REGALA NADA — el escalón de nivel es el premio del que pagó en
         fecha; un crédito que necesitó prórroga o plan de pagos no lo gana.
     Por eso son dos funciones y no una: acá abajo se decide el NIVEL, y solo
     el nivel. */
  function esPuntualParaNivel(p) {
    return M.cuentaComoPuntual({
      pagado_en_fecha: esPuntual(p),
      prorrogas_usadas: lista(p && p.prorrogas).length,
      plan_de_pagos: tienePlan(p)
    });
  }

  /* ===================== EL NIVEL ES UN MÁXIMO HISTÓRICO ====================
     4-ago-2026 — EL NIVEL BAJABA POR USAR UNA PRÓRROGA PAGADA EN FECHA.

     El arreglo de esta misma mañana (esPuntualParaNivel) cerró bien un agujero
     —la prórroga lavaba el historial y hacía subir al moroso— y abrió el
     contrario: los tres contadores del nivel se recalculan desde CERO en cada
     carga, así que un crédito con prórroga resetea la racha y los meses sin
     mora, y el socio RETROCEDE.

     Medido: 10 créditos de 200.000 pagados todos en fecha → platino, cupo
     1.140.000. Se agrega el crédito 11 con UNA prórroga registrada a tiempo y
     pagado en el corte nuevo: aTiempo 10, racha 0, meses 1 → PLATA, cupo
     904.000. Pagó 40.000 de más y perdió 452.000 de cupo. Dos escalones abajo
     por un pago que hizo puntual. Eso rompe la promesa central del producto.

     El piso que debía impedirlo era `s.nivelSocio`, y ESE CAMPO NO LO ESCRIBE
     NADIE: ni el Panel, ni el puente, ni la app. Solo existía en una prueba que
     se lo ponía a mano. Un piso que hay que acordarse de escribir es un piso que
     no existe: por eso acá no se agrega ningún campo nuevo, se DERIVA.

     LA FORMA. Un nivel que "nunca baja" es, literalmente, el máximo de los
     niveles que el socio tuvo alguna vez. Y el historial ya contiene ese dato:
     se recorren los instantes en que su cuenta cambió —cada pago y cada fecha
     de corte, más hoy—, en cada uno se calculan los tres contadores TAL COMO
     ESTABAN ESE DÍA, y se deriva el nivel de ese día. El nivel de hoy es el más
     alto de todos. El último instante es siempre HOY con el historial completo,
     así que el nivel actual entra en la cuenta como uno más.

     Las dos mitades de la promesa, a la vez:
       · NO SE LE QUITA NADA — cada nivel de la lista es un nivel que el socio
         TUVO de verdad, en una fecha real y con los créditos que ya tenía. No se
         puede caer de él porque no se le está regalando: se le está recordando.
       · NO SE LE REGALA NADA — cada instante usa las mismas reglas de siempre
         (esPuntualParaNivel para pagos y racha), sobre un subconjunto de su
         historia y en una fecha pasada. Un crédito con prórroga NO cuenta en
         ningún instante: no puede hacer subir a nadie, solo puede dejar de
         hacerlo subir. Y como el máximo se toma sobre instantes anteriores, un
         crédito nuevo jamás mejora el pasado — únicamente el presente.

     ¿DE QUÉ FORMA ALGUIEN PUEDE SALIR GANANDO POR NO PAGAR, AHORA?
     Por una sola, y por eso va cerrada acá abajo: `meses_sin_mora` se medía
     desde el último atraso CURADO, sin mirar si el socio está atrasado AHORA.
     Un crédito abierto y vencido no reseteaba nada, así que el contador seguía
     corriendo durante la mora y los meses de atraso empujaban al socio hacia
     platino. Con el máximo histórico eso además quedaría clavado para siempre.
     Ahora, en cada instante, si había un crédito vencido y sin pagar los meses
     SIN MORA valen cero — que es lo que dice el nombre del contador. Lo que ya
     había ganado antes de atrasarse se lo queda igual: está en el máximo. */

  /* El corte que le rige a un crédito. Con plan de pagos el Panel deja
     `cicloActual` apuntando a la cuota vigente, así que sirve para los dos. */
  function corteDelCredito(p) {
    return fechaFin(p && p.cicloActual) || fechaFin(p && p.cicloPago) ||
           fechaFin(p && p.fechaPago) || '';
  }
  /* ¿Estaba ESTE crédito vencido y sin pagar en la fecha `hasta`? En la fecha
     misma del corte todavía no: ese es el día de pagar, no el primero de mora.
     Un crédito pagado sin fecha de pago no se acusa: no hay con qué. */
  function estabaVencido(p, hasta) {
    var corte = corteDelCredito(p);
    if (!corte || !hasta || hasta <= corte) return false;
    if (!p.pagado) return true;
    var fp = fechaFin(p.fechaPagado);
    return !!fp && fp > hasta;
  }
  /* Los tres contadores del nivel TAL COMO ESTABAN en la fecha `hasta`.
     `ps` son todos los créditos del socio ordenados por desembolso. */
  function contadoresDeNivel(ps, hasta) {
    var pagados = ps.filter(function (p) {
      return p.pagado && (fechaFin(p.fechaPagado) || hasta) <= hasta;
    });
    var aTiempo = pagados.filter(esPuntualParaNivel).length;
    var racha = 0;
    for (var i = pagados.length - 1; i >= 0; i--) { if (esPuntualParaNivel(pagados[i])) racha++; else break; }
    var tarde = pagados.filter(function (p) { return !esPuntualParaNivel(p); })
      .map(function (p) { return fechaFin(p.fechaPagado); }).filter(Boolean).sort();
    var desde = tarde.length ? tarde[tarde.length - 1]
              : (ps[0] ? (fechaFin(ps[0].fechaDesembolso) || hasta) : hasta);
    var enMora = ps.some(function (p) { return estabaVencido(p, hasta); });
    var meses = enMora ? 0 : Math.max(0, Math.floor(diasEntre(desde, hasta) / 30));
    return { a_tiempo: aTiempo, racha: racha, meses_sin_mora: meses };
  }
  /* Los instantes en que la cuenta del socio pudo cambiar de nivel: cada pago
     (sube la racha, se cura un atraso), cada corte (hasta ahí llegó limpio, y
     desde ahí empieza la mora del que no pagó) y HOY. Nunca el futuro. */
  function instantesDeNivel(ps, hoy) {
    var vistos = {}, fechas = [];
    function agregar(f) {
      if (f && f <= hoy && !vistos[f]) { vistos[f] = true; fechas.push(f); }
    }
    ps.forEach(function (p) {
      if (p.pagado) agregar(fechaFin(p.fechaPagado));
      agregar(corteDelCredito(p));
    });
    agregar(hoy);
    return fechas.sort();
  }
  /* El nivel del socio: el más alto que haya tenido en cualquiera de esos
     instantes. evaluarNivel ya devuelve el mayor entre lo derivado y el piso
     que se le pase, así que el recorrido va acumulando el máximo solo.
     `piso` es opcional y hoy nadie lo escribe: si algún día el Panel guarda un
     nivel a mano seguirá respetándose, pero el nivel ya NO depende de eso. */
  function nivelDelSocio(ps, hoy, piso) {
    var instantes = instantesDeNivel(ps, hoy);
    /* Un piso que no es un nivel conocido hace lanzar a evaluarNivel, y este
       paquete no puede lanzar nunca: un dato sucio no puede dejar al socio sin
       ver su cuenta. Se ignora y el nivel se deriva igual del historial. */
    var nivel = (M.NIVELES.indexOf(piso) !== -1) ? piso : 'bronce';
    for (var i = 0; i < instantes.length; i++) {
      var c = contadoresDeNivel(ps, instantes[i]);
      nivel = M.evaluarNivel(c.a_tiempo, c.racha, c.meses_sin_mora, nivel);
    }
    return nivel;
  }

  /* --------------- la garantía que dejó un crédito, parte por parte --------
     3-ago-2026. Antes acá se hacía acumularGarantia(gananciaCobrada(p),
     esPuntual(p)): UN solo factor para todo lo cobrado del crédito. Como
     gananciaCobrada() incluye los costos de las prórrogas ya pagadas, una
     prórroga que el socio pagó puntualmente hace meses se le degradaba del 90%
     al 45% el día que el crédito terminaba pagándose tarde. Garantía ya ganada
     que desaparecía hacia atrás, que es exactamente lo contrario de lo que le
     promete el producto: "todo lo que pagues sigue sumando".

     El motor nunca dijo eso: la prórroga se cobra y se acredita el día que se
     paga, y lo que pase después con el crédito no la puede tocar (decisión D6).
     Cada prórroga lleva su propia cuenta, y el pago final la suya.

     4-ago-2026 — la SEGUNDA mitad del mismo arreglo. "Se acredita el día que se
     paga" no quería decir "se acredita siempre al 90%": quería decir que el
     factor se congela ese día. Acá estaba congelado en `true` para todas, y con
     eso una prórroga registrada con veinte días de atraso dejaba MÁS garantía
     que saldar la deuda completa el mismo día. Medido, con los mismos 240.000 de
     costos: dejar la prórroga 162.000, saldar todo 108.000. 54.000 de regalo al
     que no paga, o sea 162.000 más de cupo en platino. Es el mismo agujero que
     el bono por puntualidad vino a cerrar, reabierto por otra puerta.

     Ahora cada prórroga usa su propio factor de puntualidad (§4), el mismo que
     usa cualquier otro pago, y lo ya ganado sigue intacto: las prórrogas viejas
     no traen recargo, se leen puntuales y conservan su 90%. */
  function garantiaGanadaCredito(p) {
    return lista(p && p.prorrogas).reduce(function (t, pr) {
      return t + garantiaGanadaProrroga(pr);
    }, 0) +
      /* Cada cuota del plan de pagos lleva su propio factor, congelado el día
         que se cobró, por la misma razón que las prórrogas: lo ya ganado no se
         puede mover hacia atrás. */
      garantiaGanadaPlan(p) +
      (p && p.pagado ? M.acumularGarantia(Math.max(0, num(p.gananciaPago)), esPuntual(p)) : 0);
  }

  function codCliente(s) { return 'CL-' + String((s && s.numero) || 0).padStart(4, '0'); }
  function codCredito(p) { return 'CR-' + String((p && p.numero) || 0).padStart(4, '0'); }
  function codRespaldado(r) { return 'RG-' + String((r && r.numero) || 0).padStart(4, '0'); }

  /* ------------------------------------------- cuentas de un respaldado --
     El saldo de capital de las cuotas que todavía no pagó ES la garantía
     comprometida: mientras no lo termine, esa plata no respalda nada más. */
  function saldoCapitalRespaldado(r) {
    return lista(r && r.cuotas).reduce(function (t, c) {
      return t + (c.pagado ? 0 : num(c.capital));
    }, 0);
  }
  function garantiaGanadaRespaldado(r) {
    return lista(r && r.cuotas).reduce(function (t, c) {
      return t + (c.pagado ? num(c.garantiaGenerada) : 0);
    }, 0);
  }
  function respaldadosDe(db, s) {
    return lista(db && db.respaldados).filter(function (r) { return r.socioId === (s && s.id); });
  }

  /* La garantía GANADA de un socio: lo que le dejó cada peso de costo que ya
     pagó, en el quincenal y en el de garantía. El factor lo pone el MOTOR
     (0,90 en fecha y 0,45 tarde en el quincenal; 0,20 y 0,10 en el otro). Acá
     no se multiplica nada a mano y tampoco se deja de multiplicar: el costo
     COBRADO no es la garantía, y desde que FACTOR_GARANTIA bajó a 0,90 no hay
     forma de que coincidan. Es una sola cuenta para el paquete del socio y
     para la foto de la comunidad, que es lo que evita que el mismo cliente
     vea dos cifras distintas según por dónde entró. */
  function garantiaGanadaDe(db, s) {
    return lista(db && db.prestamos)
      .filter(function (p) { return p.socioId === (s && s.id); })
      .reduce(function (t, p) {
        return t + garantiaGanadaCredito(p);
      }, 0)
      + respaldadosDe(db, s).reduce(function (t, r) {
        return t + garantiaGanadaRespaldado(r);
      }, 0);
  }

  /* Los datos del cliente en las claves que entiende el motor (DATOS_KYC).
     De acá sale el cupón: cada dato cargado le presta más garantía. */
  function datosKycDe(s) {
    var r = (s && s.referencia) || {};
    return {
      nombre: s.nombre, cedula: s.cedula, celular: s.telefono,
      whatsapp: !!(s.whatsappIgual || s.whatsappNumero),
      correo: s.email, ciudad: [s.ciudad, s.barrio].filter(Boolean).join(' '),
      direccion: s.direccion, vivienda: [s.tipoVivienda, s.numeroVivienda].filter(Boolean).join(' '),
      pago: s.nequi || s.llave, celular2: s.telefono2,
      referencia: (r.nombre && r.telefono) ? (r.nombre + ' ' + r.telefono) : '',
      ubicacion: s.ubicacion,
      foto_cedula_frente: s.cedulaFrenteFoto, foto_cedula_reverso: s.cedulaReversoFoto,
      foto_selfie: s.selfieFoto
    };
  }

  /* Referidos: los que este cliente trajo. Solo suman los que ya pagaron. */
  function referidosDe(db, s) {
    return lista(db && db.socios).filter(function (x) { return x.referidoPor === s.id; }).map(function (x) {
      return {
        nombre: x.nombre,
        pago_puntual: lista(db.prestamos).some(function (p) { return p.socioId === x.id && p.pagado; })
      };
    });
  }

  /* Cifras del grupo, para que cada socio vea que entró a algo colectivo.
     SOLO agregados: ni un nombre, ni un monto de nadie en particular. */
  function fotoComunidad(db) {
    var prestamos = lista(db && db.prestamos);
    var pagados = prestamos.filter(function (p) { return p.pagado; });
    var puntuales = pagados.filter(esPuntual).length;
    var garantia = lista(db && db.socios).reduce(function (t, s) {
      return t + garantiaGanadaDe(db, s);
    }, 0);
    return {
      socios: lista(db && db.socios).length,
      creditos_pagados: pagados.length,
      garantia_construida: garantia,
      prestado: prestamos.reduce(function (t, p) { return t + num(p.capital); }, 0),
      puntualidad: pagados.length ? Math.round(puntuales / pagados.length * 100) : null,
      desde: prestamos.length
        ? prestamos.map(function (p) { return p.fechaDesembolso; }).filter(Boolean).sort()[0]
        : null
    };
  }

  /* La entrada exacta que esperan desglosarGarantia, maximoRespaldado y
     cupoQuincenal. La arma el puente y no cada pantalla: el Panel la usa para el
     cupo y para el máximo del préstamo con garantía, y migrarSocio la usa para
     lo que ve el socio. Una sola cuenta, dos consumidores. */
  function entradaGarantia(db, s) {
    return {
      datos: datosKycDe(s),
      referidos: referidosDe(db, s),
      acumulada: garantiaGanadaDe(db, s),
      ajuste: Number(s && s.ajusteGarantia) || 0,
      comprometida: comprometidaDe(db, s)
    };
  }

  /* Lo que tiene metido en préstamos con garantía todavía abiertos. */
  function comprometidaDe(db, s) {
    return respaldadosDe(db, s).filter(function (r) { return !r.pagado; })
      .reduce(function (t, r) { return t + saldoCapitalRespaldado(r); }, 0);
  }

  /**
   * El paquete que consume la app del socio, tal cual lo espera abrir().
   * No puede lanzar NUNCA: todo Number(x)||0 y todo (arr||[]). Un capital en
   * cero se muestra como cero, no como error.
   */
  function migrarSocio(db, s) {
    var prestamos = lista(db && db.prestamos);
    var ps = prestamos.filter(function (p) { return p.socioId === s.id; })
      .sort(function (a, b) { return String(a.fechaDesembolso).localeCompare(String(b.fechaDesembolso)); });
    var resps = respaldadosDe(db, s);

    var entrada = entradaGarantia(db, s);
    var refs = entrada.referidos;

    var g = M.desglosarGarantia(entrada);
    var kyc = M.garantiaPorDatos(entrada.datos);

    /* Los tres contadores que deciden el NIVEL usan esPuntualParaNivel, no
       esPuntual: un crédito que necesitó prórroga o plan de pagos no gana el
       escalón. La garantía —que sale de garantiaGanadaDe, más arriba— sigue
       usando esPuntual y no se toca: al socio no se le quita nada.
       Los de HOY son los que se le muestran; el NIVEL, en cambio, es el máximo
       de todos los que tuvo (nivelDelSocio), para que no pueda bajar. */
    var hoy = hoyISO();
    var cont = contadoresDeNivel(ps, hoy);
    var aTiempo = cont.a_tiempo, racha = cont.racha, meses = cont.meses_sin_mora;
    var nivel = nivelDelSocio(ps, hoy, s.nivelSocio);

    return {
      // Para que las solicitudes y los datos que mande el cliente le lleguen a
      // Joan y no tenga que buscar el chat.
      negocio: { nombre: (db.config && db.config.negocio) || 'Tu Garantía',
                 whatsapp: digitos(db.config && db.config.whatsapp) },
      comunidad: fotoComunidad(db),
      socio: { codigo: codCliente(s) },
      garantia: {
        // `acumulada` viaja como la GANADA del motor (ya con el ajuste aplicado):
        // es la que respalda el préstamo con garantía, y la app no puede
        // volver a restarle nada.
        total: g.total, acumulada: g.ganada, cupon: g.cupon, referidos: g.referidos,
        nivel: nivel, pagados_a_tiempo: aTiempo, racha: racha, meses_sin_mora: meses,
        creditos_total: ps.length, comprometida: g.comprometida
      },
      // Solo QUÉ dato tiene cargado, nunca su contenido: al cliente le alcanza
      // con ver el chulito, y así no viajan fotos, coordenadas ni teléfonos.
      perfil: {
        datos: kyc.completos.reduce(function (o, d) { o[d.id] = true; return o; }, {}),
        porcentaje: kyc.porcentaje,
        faltan: kyc.faltantes.map(function (d) { return { id: d.id, etiqueta: d.etiqueta, valor: d.valor }; })
      },
      referidos: {
        total: refs.length,
        pagaron: refs.filter(function (r) { return r.pago_puntual; }).length,
        lista: refs.map(function (r) { return { nombre: String(r.nombre || '').split(' ')[0], pago: r.pago_puntual }; })
      },
      /* 4-ago-2026 — LA APP LE MOSTRABA AL SOCIO EL CAPITAL ENTERO CON PLAN.
         `capital` viajaba como capitalActual(p) —todo el capital vigente—
         mientras `costo` ya venía de K(p), que con plan de pagos devuelve el de
         la CUOTA. Dos mitades de dos ciclos distintos en la misma línea. Y como
         la app calcula el 1% diario sobre ese `capital`, la mora salía sobre el
         capital entero: medido, el Panel cobraba 230.000 y la app mostraba
         630.000 del mismo crédito el mismo día; con 10 días de mora, 250.000
         contra 690.000.
         Lo que viaja ahora es el ciclo que se está cobrando, entero y de una
         sola fuente: capitalDelCiclo y K, las MISMAS dos funciones que usa el
         Panel (crm.html las llama línea por línea). `corte` ya apuntaba bien: el
         Panel deja cicloActual en la fecha de la cuota vigente.
         Y van dos datos más para que la app no tenga que deducir nada:
         `saldo_capital`, que es lo que le falta del crédito COMPLETO (la cuota
         no es la deuda), y `tasa`, el porcentaje que de verdad rige este ciclo
         —5% en plan de pagos, el pactado del crédito si no—, que la app pinta
         al lado del costo y hasta hoy adivinaba.

         UN CRÉDITO YA PAGADO NO TIENE CICLO VIGENTE, así que ahí las tres cifras
         son las de su historia: lo que PIDIÓ, lo que le COSTÓ en total (ciclo,
         prórrogas y cuotas del plan, que es de lo que está hecho `abonado`) y
         cero de saldo. Antes viajaba capitalActual, o sea capital menos abonos:
         un crédito de 600.000 terminado con plan de pagos aparecía en el
         historial del socio como un crédito de $0. */
      creditos: ps.slice().reverse().map(function (p) {
        return {
          codigo: codCredito(p),
          capital: p.pagado ? num(p.capital) : capitalDelCiclo(p),
          costo: Math.round(p.pagado ? gananciaCobrada(p) : K(p)),
          saldo_capital: p.pagado ? 0 : capitalActual(p),
          tasa: tasaDelCiclo(p),
          desembolso: p.fechaDesembolso || null, corte: p.cicloActual || null,
          pagado: !!p.pagado, fecha_pagado: p.fechaPagado || null,
          abonado: Math.round(gananciaCobrada(p) + capitalRecuperadoDe(p)),
          garantia: garantiaGanadaCredito(p),
          prorrogas: lista(p.prorrogas).length,
          // Solo el conteo: al socio le alcanza con ver que va por la cuota 2 de 3.
          plan_cuotas: cuotasPlan(p).length,
          plan_cuotas_pagadas: cuotasPlan(p).filter(function (c) { return !!c.pagado; }).length
        };
      }),
      respaldados: resps.map(function (r) {
        return {
          codigo: codRespaldado(r), capital: num(r.capital),
          plazo_meses: num(r.plazoMeses) || lista(r.cuotas).length,
          cuota: lista(r.cuotas)[0] ? num(lista(r.cuotas)[0].total) : 0,
          saldo_capital: saldoCapitalRespaldado(r),
          pagado: !!r.pagado,
          cuotas: lista(r.cuotas).map(function (c) {
            return { n: num(c.n), fecha: c.fecha || null, total: num(c.total), pagado: !!c.pagado };
          })
        };
      }),
      resumen: {
        total_prestado: ps.reduce(function (t, p) { return t + num(p.capital); }, 0),
        primer_credito: ps.length ? (ps[0].fechaDesembolso || null) : null
      }
    };
  }

  /* Entrar sigue costando lo mismo: cédula + los últimos 4 del celular. Sin
     esos dos datos no se puede listar a nadie, ni siquiera en el equipo de
     Joan. Y nunca se dice "la cédula existe pero el celular no": eso volvería
     la app un oráculo de cédulas. */
  function buscarSocio(db, cedula, tel4) {
    var ced = digitos(cedula), t4 = digitos(tel4).slice(-4);
    if (ced.length < 5 || t4.length < 4) return null;
    var socios = lista(db && db.socios);
    for (var i = 0; i < socios.length; i++) {
      var s = socios[i];
      if (digitos(s.cedula) !== ced) continue;
      var tels = [s.telefono, s.whatsappNumero, s.telefono2];
      for (var j = 0; j < tels.length; j++) {
        if (digitos(tels[j]).slice(-4) === t4 && digitos(tels[j]).length >= 4) return s;
      }
    }
    return null;
  }

  return {
    LLAVE_PANEL: LLAVE_PANEL,
    normalizar: normalizar,
    entradaGarantia: entradaGarantia,
    garantiaGanadaDe: garantiaGanadaDe,
    comprometidaDe: comprometidaDe,
    migrarSocio: migrarSocio,
    buscarSocio: buscarSocio,
    datosKycDe: datosKycDe,
    referidosDe: referidosDe,
    fotoComunidad: fotoComunidad,
    esPuntual: esPuntual,
    esPuntualParaNivel: esPuntualParaNivel,
    corteDelCredito: corteDelCredito,
    estabaVencido: estabaVencido,
    contadoresDeNivel: contadoresDeNivel,
    instantesDeNivel: instantesDeNivel,
    nivelDelSocio: nivelDelSocio,
    tasaDelCiclo: tasaDelCiclo,
    cuotasPlan: cuotasPlan,
    tienePlan: tienePlan,
    cuotaPlanActual: cuotaPlanActual,
    capitalDelCiclo: capitalDelCiclo,
    entradaPlan: entradaPlan,
    costoCobradoPlan: costoCobradoPlan,
    garantiaGanadaPlan: garantiaGanadaPlan,
    fechaPagadoDeducida: fechaPagadoDeducida,
    fechaPagadoCorregida: fechaPagadoCorregida,
    abonosCierranElCredito: abonosCierranElCredito,
    migrarFechaPagado: migrarFechaPagado,
    garantiaGanadaCredito: garantiaGanadaCredito,
    garantiaGanadaProrroga: garantiaGanadaProrroga,
    prorrogaFueATiempo: prorrogaFueATiempo,
    costoDeProrroga: costoDeProrroga,
    moraDeProrroga: moraDeProrroga,
    gananciaCobrada: gananciaCobrada,
    capitalActual: capitalActual,
    K: K,
    capitalRecuperadoDe: capitalRecuperadoDe,
    saldoCapitalRespaldado: saldoCapitalRespaldado,
    garantiaGanadaRespaldado: garantiaGanadaRespaldado,
    respaldadosDe: respaldadosDe,
    codCliente: codCliente,
    codCredito: codCredito,
    codRespaldado: codRespaldado
  };
});
