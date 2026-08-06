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
 * OJO CON LOS PORCENTAJES DE LOS BLOQUES FECHADOS: cada uno trae los factores
 * que regían el día en que se midió (90% en fecha y 45% tarde hasta el
 * 5-ago-2026; 75% y 37,5% desde entonces). Las reglas no cambiaron —factor completo contra la
 * mitad— y las cifras medidas se dejan como quedaron para no borrar la evidencia.
 *
 * Y lo que NO viaja al socio, por regla y no por olvido: fotos, ubicación,
 * teléfonos, la nota de riesgo, el motivo del ajuste, la papelera, las
 * gestiones, y todo el reparto 75/10/15 con el cupón amortizado y la ganancia
 * (contabilidad de Joan: contabilidadCupon y contabilidadCartera, que el
 * paquete del socio no toca ni de refilón).
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
      /* `freno` es la casilla donde Ajustes del Panel enciende el tope por
         ingreso (5-ago-2026). Viene APAGADA y con la fracción de arranque del
         motor; si Joan no la toca, nada cambia. Los defaults viven en el motor,
         no escritos a mano acá. */
      config: Object.assign({
        negocio: 'Tu Garantía', whatsapp: '',
        freno: { activo: M.FRENO_INGRESO.activo,
                 fraccion_quincena: M.FRENO_INGRESO.fraccion_quincena }
      }, d.config || {}),
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
      // Lo que el socio gana por quincena. Solo lo usa el freno por ingreso, que
      // está apagado: en cero el freno no puede topar nada (ver frenoDe).
      if (s.ingresoQuincenal === undefined) s.ingresoQuincenal = 0;
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
  /* `capitalActual` y `cicloActual` son EL RESUMEN DE HOY, y nada más que eso.
     Sirven para pintar la pantalla del ciclo abierto. NINGUNA pregunta sobre el
     pasado se contesta con ellos: para eso están las funciones de la sección
     "LA LÍNEA DE TIEMPO", más abajo. Ver el comentario grande del 5-ago-2026. */
  function capitalActual(p) {
    return Math.max(0, num(p.capital) - lista(p.abonosCapital).reduce(function (s, a) { return s + num(a.monto); }, 0));
  }

  /* Los días calendario del MOTOR, no los de acá arriba: `diasEntre` de este
     archivo hace Math.max(1,…) para que la E.A. no divida por cero, y una
     cuenta de plata que use eso cobra un día que no existió. */
  function diasCal(desde, hasta) {
    try { return M.diasEntre(M.aFechaLocal(desde), M.aFechaLocal(hasta)); }
    catch (e) { return 0; }
  }
  function diaAntes(f) {
    try { return M.iso(M.sumarDias(M.aFechaLocal(f), -1)); } catch (e) { return ''; }
  }
  function diaDespues(f) {
    try { return M.iso(M.sumarDias(M.aFechaLocal(f), 1)); } catch (e) { return ''; }
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
  /* El capital que TODAVÍA SE DEBE en este ciclo. Sin plan es el capital
     vigente; con plan es el de la cuota. Es lo que falta por entregar, así que
     acá sí manda el presente: al socio no se le cobra capital que ya devolvió.
     Lo que NO sale de acá es cuánto se CAUSÓ (ver K y moraDelCiclo). */
  function capitalDelCiclo(p) {
    var c = cuotaPlanActual(p);
    return c ? num(c.capital) : capitalActual(p);
  }
  /* El costo del ciclo. Se CAUSÓ el día que el ciclo empezó, sobre el capital
     que se debía ESE día, y por eso no puede salir de `capitalActual`: un abono
     posterior lo borraba hacia atrás (200.000 a 20 días, abono de 199.999 → el
     costo de 40.000 quedaba en 0,2). Se reconstruye del historial; lo que el
     Panel haya congelado en el abono sirve de piso y nunca de techo. */
  function K(p) {
    var c = cuotaPlanActual(p);
    if (c) return num(c.costo);
    return Math.max(capitalBaseDelCiclo(p) * num(p && p.costoPct) / 100,
                    causadoDelCiclo(p).costo);
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

  /* ==========================================================================
   * LA LÍNEA DE TIEMPO DE UN CRÉDITO — 5-ago-2026.
   *
   * LA CAUSA DE SEIS RONDAS DE PARCHES, DICHA DE UNA VEZ:
   *
   *     las cuentas preguntaban por el PASADO y buscaban la respuesta en el
   *     PRESENTE.
   *
   *   · `estabaVencido(p, instante)` quiere saber si el crédito estaba en mora
   *     en una fecha pasada, y lo resolvía leyendo `p.cicloActual` — un campo
   *     que la prórroga y el plan de pagos MUEVEN AL FUTURO. Registrar una
   *     prórroga hoy hacía que `estabaVencido(p,'2026-06-01')` pasara de true a
   *     false: la mora se borraba hacia atrás, el instante desaparecía de la
   *     lista del nivel, y DEJAR la prórroga terminaba rindiendo 256.150 más de
   *     cupo que devolver el capital. La misma operación grababa `aTiempo:false`
   *     para la garantía y "no hubo mora" para el nivel, el mismo día y sobre el
   *     mismo crédito.
   *   · `K(p)` quiere saber cuánto costo se había CAUSADO, y lo resolvía leyendo
   *     `capitalActual(p)` — un campo que el abono BAJA. Abonar el capital menos
   *     un peso dejaba el costo del ciclo en cero.
   *
   * Un campo que se sobrescribe no puede contestar una pregunta sobre el
   * pasado. Da igual cuántos parches se le pongan encima: siempre va a haber
   * otra pregunta histórica que falle. Así que las preguntas del pasado se
   * contestan RECORRIENDO LOS HECHOS, que ya estaban todos guardados:
   *
   *     p.fechaDesembolso · p.prorrogas[] (fecha, ciclo viejo, ciclo nuevo)
   *     p.planPagos.entrada y sus cuotas · p.abonosCapital[] (fecha y monto)
   *     p.fechaPagado · p.cicloPago
   *
   * `cicloActual` y `capitalActual` quedan en lo que de verdad son: el resumen
   * de HOY, cómodo para pintar pantallas. Dejan de ser la fuente de la verdad
   * histórica.
   *
   * EL CONTRATO, para el que venga detrás: si tu pregunta lleva una fecha
   * adentro, la contesta una función de esta sección. No mires `cicloActual` ni
   * `capitalActual` para nada histórico.
   * ========================================================================*/

  /* Los cambios de corte que DE VERDAD ocurrieron, cada uno con el día en que
     ocurrió. Salen de los hechos: cada prórroga (de qué corte a cuál, y qué día
     se registró), el día en que se pactó el plan y cada cuota del plan que se
     fue pagando. */
  function cambiosDeCorte(p) {
    var cambios = [];
    lista(p && p.prorrogas).forEach(function (pr) {
      cambios.push({ desde: fechaFin(pr && pr.fecha),
                     de: fechaFin(pr && pr.ciclo),
                     a: fechaFin(pr && pr.nuevoCiclo) });
    });
    var e = entradaPlan(p), cuotas = cuotasPlan(p);
    if (cuotas.length) {
      cambios.push({ desde: fechaFin((e && e.fecha) || (p.planPagos && p.planPagos.creado)),
                     de: fechaFin(e && e.ciclo),
                     a: fechaFin(cuotas[0] && cuotas[0].fecha) });
      for (var i = 0; i < cuotas.length - 1; i++) {
        if (!cuotas[i].pagado) continue;
        cambios.push({ desde: fechaFin(cuotas[i].fechaPagado) || fechaFin(cuotas[i].fecha),
                       de: fechaFin(cuotas[i].fecha),
                       a: fechaFin(cuotas[i + 1] && cuotas[i + 1].fecha) });
      }
    }
    return cambios.filter(function (c) { return c.desde || c.de || c.a; })
      .sort(function (x, y) { return String(x.desde).localeCompare(String(y.desde)); });
  }

  /* El corte ORIGINAL: el que le tocó al desembolsarse, antes de que nada lo
     moviera. La primera prórroga guarda de qué corte salió (`ciclo`), y el plan
     también; si no hubo ninguno de los dos, el corte de hoy nunca se movió. */
  function corteOriginal(p) {
    var cambios = cambiosDeCorte(p);
    for (var i = 0; i < cambios.length; i++) if (cambios[i].de) return cambios[i].de;
    return fechaFin(p && p.cicloPago) || fechaFin(p && p.cicloActual) ||
           fechaFin(p && p.fechaPago) || '';
  }

  /**
   * TODOS los cortes que este crédito tuvo, en orden, cada uno con el día DESDE
   * el que rigió. El primero rige desde siempre (`desde:''`).
   *
   * @returns {Array<{desde:string, corte:string}>}
   */
  function cortesDelCredito(p) {
    var cambios = cambiosDeCorte(p);
    var origen = corteOriginal(p);
    var hoyCorte = fechaFin(p && p.cicloActual);
    var linea = origen ? [{ desde: '', corte: origen }] : [];
    var actual = origen;
    cambios.forEach(function (c, i) {
      /* Una prórroga vieja puede no haber guardado a qué corte pasó. El dato
         igual está: es de dónde salió el cambio siguiente, y si es el último,
         el corte de hoy. */
      var destino = c.a || (cambios[i + 1] && cambios[i + 1].de) || hoyCorte || '';
      if (!destino || destino === actual) return;
      linea.push({ desde: c.desde || destino, corte: destino });
      actual = destino;
    });
    if (hoyCorte && hoyCorte !== actual) {
      // El resumen de hoy no cuadra con lo reconstruido: manda el resumen, pero
      // solo de la última fecha conocida en adelante. El pasado no se reescribe.
      var ultima = cambios.length ? cambios[cambios.length - 1].desde : '';
      linea.push({ desde: ultima || '', corte: hoyCorte });
    }
    return linea.length ? linea : [{ desde: '', corte: '' }];
  }

  /** El corte que REGÍA en una fecha dada. Nada de lo que pase después lo mueve. */
  function corteVigenteEn(p, instante) {
    var h = fechaFin(instante), linea = cortesDelCredito(p), corte = '';
    for (var i = 0; i < linea.length; i++) {
      if (!linea[i].desde || !h || linea[i].desde <= h) corte = linea[i].corte;
      else break;
    }
    return corte;
  }

  /** El día en que empezó el ciclo ABIERTO: el desembolso, o el del último
     cambio de corte. De acá sale sobre qué capital se causó el costo de hoy. */
  function inicioDelCiclo(p) {
    var linea = cortesDelCredito(p);
    var d = linea.length ? linea[linea.length - 1].desde : '';
    return d || fechaFin(p && p.fechaDesembolso) || '';
  }

  /** El capital que se debía en una fecha: el pedido menos los abonos hasta ese
     día. Un abono sin fecha se cuenta siempre (es un hecho de fecha perdida, y
     descontarlo es lo que ya hace `capitalActual`). */
  function capitalVigenteEn(p, fecha) {
    var hasta = fechaFin(fecha);
    var usado = lista(p && p.abonosCapital).reduce(function (s, a) {
      var f = fechaFin(a && a.fecha);
      return (!f || !hasta || f <= hasta) ? s + num(a && a.monto) : s;
    }, 0);
    return Math.max(0, num(p && p.capital) - usado);
  }

  /** El capital sobre el que se causó el costo del ciclo abierto. */
  function capitalBaseDelCiclo(p) {
    return capitalVigenteEn(p, inicioDelCiclo(p));
  }

  /* Lo que el Panel congeló en el abono cuando lo registró (costo del ciclo y
     recargo corrido hasta ese día). Vale solo para el corte al que pertenece:
     cuando el ciclo se mueve, ese congelado ya se cobró con el corte viejo.
     Los abonos viejos no traen estos campos y devuelven `tiene:false`. */
  function causadoDelCiclo(p) {
    var ciclo = fechaFin(p && p.cicloActual);
    var c = { tiene: false, costo: 0, mora: 0, dias: 0, ciclo: ciclo };
    lista(p && p.abonosCapital).forEach(function (a) {
      if (!a || !ciclo || fechaFin(a.ciclo) !== ciclo) return;
      if (a.costoCausado == null && a.moraCausada == null) return;
      c.tiene = true;
      c.costo = Math.max(c.costo, num(a.costoCausado));
      c.mora = Math.max(c.mora, num(a.moraCausada));
      c.dias = Math.max(c.dias, num(a.diasMoraCausada));
    });
    return c;
  }

  /**
   * El recargo del 1% diario del ciclo abierto a una fecha, RECORRIDO DÍA A DÍA
   * sobre el capital que se debía cada día: los tramos anteriores a un abono
   * corren sobre el capital que HABÍA, y los posteriores sobre el que QUEDÓ.
   * Es justo en las dos direcciones — no se borra lo corrido, y tampoco se le
   * cobra mora al socio sobre plata que ya devolvió.
   */
  function moraDelCiclo(p, hasta) {
    if (!p || p.pagado) return 0;
    var corte = corteDelCredito(p), fin = fechaFin(hasta) || hoyISO();
    if (!corte || fin <= corte) return 0;
    var cuota = cuotaPlanActual(p);
    if (cuota) return M.recargoPorMora(num(cuota.capital), diasCal(corte, fin));

    var base = capitalVigenteEn(p, corte), cursor = corte, total = 0;
    lista(p.abonosCapital).map(function (a) {
      return { f: fechaFin(a && a.fecha), m: num(a && a.monto) };
    }).filter(function (a) {
      return a.f && a.f > corte && a.f <= fin;
    }).sort(function (x, y) {
      return x.f.localeCompare(y.f);
    }).forEach(function (a) {
      total += M.recargoPorMora(base, diasCal(cursor, a.f));
      base = Math.max(0, base - a.m);
      cursor = a.f;
    });
    total += M.recargoPorMora(base, diasCal(cursor, fin));

    /* Y lo que el Panel congeló manda como PISO: si un día se guardó un recargo
       mayor del que sale del recorrido, lo ya causado no se baja. */
    var c = causadoDelCiclo(p);
    if (c.tiene) {
      total = Math.max(total, M.recargoPorMoraDesde(c.mora, c.dias, capitalDelCiclo(p),
                                                    diasCal(corte, fin)));
    }
    return total;
  }

  /**
   * LA CUENTA DEL CICLO, EN UN SOLO SITIO. El Panel y la app preguntan ESTO;
   * ninguno de los dos vuelve a sumar capital + costo + recargo por su cuenta,
   * que es lo que los tenía diciendo 80.001 y "$1" del mismo crédito el mismo
   * día.
   *
   * @param {object} p       el crédito del Panel
   * @param {string} [fecha] el día en que se cobra; por defecto hoy
   * @returns {{corte, fecha, capital, costo, tasa, dias_mora, recargo_mora,
   *            pago_a_tiempo, costo_total_pagado, total_a_pagar,
   *            garantia_generada, causado:{costo,mora,dias}}}
   */
  function liquidarCiclo(p, fecha) {
    var f = fechaFin(fecha) || hoyISO();
    var corte = corteDelCredito(p);
    if (!p || p.pagado) {
      return { corte: corte || null, fecha: f, capital: 0, costo: 0, tasa: tasaDelCiclo(p),
        dias_mora: 0, recargo_mora: 0, pago_a_tiempo: true, costo_total_pagado: 0,
        total_a_pagar: 0, garantia_generada: 0, causado: { costo: 0, mora: 0, dias: 0 } };
    }
    var capital = capitalDelCiclo(p);
    var costo = Math.round(K(p));
    var mora = Math.round(moraDelCiclo(p, f));
    var dias = (corte && f > corte) ? diasCal(corte, f) : 0;
    /* 5-ago-2026 §4-bis — llegar en fecha y acreditar el factor completo dejaron
       de ser lo mismo. Si este crédito YA estuvo en mora, el corte que se está cumpliendo
       es uno que compró una prórroga: acredita a la mitad. `pago_a_tiempo` sigue
       siendo lo que dice —el pago llega dentro del corte— porque de él salen el
       recargo y las pantallas; el factor de la garantía es otra pregunta. */
    var vieneDeMora = veniaDeMora(p, corte);
    var acredita = M.cuentaComoPuntualParaGarantia({
      pagado_en_fecha: dias === 0, credito_estuvo_en_mora: vieneDeMora });
    return {
      corte: corte || null,
      fecha: f,
      capital: capital,
      costo: costo,
      tasa: tasaDelCiclo(p),
      dias_mora: dias,
      recargo_mora: mora,
      pago_a_tiempo: dias === 0,
      // Para que el Panel y la app puedan preguntarlo en vez de deducirlo: el
      // motor lo recibe como `credito.estuvo_en_mora` (§4-bis).
      estuvo_en_mora: vieneDeMora,
      acredita_en_fecha: acredita,
      costo_total_pagado: costo + mora,
      total_a_pagar: capital + costo + mora,
      garantia_generada: M.acumularGarantia(costo + mora, acredita),
      /* Lo ya causado a esta fecha, para que quien quiera liquidar en OTRO día
         se lo pase a MotorReglas.liquidarCredito como {recargoCausado,
         diasCausados} y no vuelva a recalcular el 1% desde cero. */
      causado: { costo: costo, mora: mora, dias: dias }
    };
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
  /**
   * La garantía que dejó el plan de pagos: la entrada (que se acredita como una
   * prórroga, porque es lo mismo: costo del ciclo + el recargo ya causado) y
   * cada cuota ya pagada.
   *
   * 5-ago-2026 §4-bis — LA CUOTA DEL PLAN NO SE ACREDITA AL FACTOR COMPLETO. Un
   * plan de pagos existe justamente porque el crédito ya se atrasó y se le acabaron las
   * prórrogas: acreditarle a sus cuotas el factor del que nunca se atrasó era el
   * mismo regalo de la prórroga encadenada por otra puerta (medido: 374.000
   * pagados dejaban 564.300 de garantía contra los 492.300 de saldar 494.000).
   * La cuenta se rehace desde los HECHOS de la cuota —su costo, su recargo y el
   * día en que se pagó—, que es lo mismo que hace liquidarCiclo cuando el Panel
   * la cobra. Una cuota vieja que no guardó su costo conserva lo que se le
   * acreditó: sin el dato no hay nada que recalcular.
   */
  function garantiaGanadaCuotaPlan(p, c) {
    if (!c || !c.pagado) return 0;
    if (c.costo == null) return num(c.garantiaGenerada);
    var f = fechaFin(c.fechaPagado), corte = fechaFin(c.fecha);
    var enFecha = num(c.recargo) === 0 && (!f || !corte || f <= corte);
    return M.acumularGarantia(num(c.costo), M.cuentaComoPuntualParaGarantia({
             pagado_en_fecha: enFecha,
             credito_estuvo_en_mora: veniaDeMora(p, corte)
           })) +
           M.acumularGarantia(num(c.recargo), false);
  }
  function garantiaGanadaPlan(p) {
    return cuotasPlan(p).reduce(function (t, c) {
      return t + garantiaGanadaCuotaPlan(p, c);
    }, 0) + (entradaPlan(p) ? garantiaGanadaProrroga(entradaPlan(p), p) : 0);
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
     que se leen como puntuales y conservan el factor completo que ya se les
     acreditó —la garantía ya ganada no se borra nunca, ni hacia atrás. */
  function prorrogaFueATiempo(pr) {
    if (pr && typeof pr.aTiempo === 'boolean') return pr.aTiempo;
    return moraDeProrroga(pr) === 0;
  }
  /**
   * ¿Esta prórroga acredita al factor completo? (§4-bis del motor, 5-ago-2026)
   *
   * Llegar en fecha ya no alcanza: si el crédito YA estuvo en mora antes de esta
   * prórroga, el ciclo que se está pagando es el que la prórroga ANTERIOR le
   * compró, no una quincena limpia, y acredita a la mitad. Ahí estaba el negocio
   * de encadenar plazo: la primera prórroga ponía el reloj de mora en cero y la
   * segunda cobraba el factor completo del que nunca se atrasó.
   *
   * El crédito es OPCIONAL a propósito: sin él la respuesta es la de siempre (la
   * puntualidad congelada en el dato). Así el Panel —que hoy llama con la
   * prórroga sola— sigue funcionando sin tocarlo, y la garantía del socio, que
   * sale de garantiaGanadaCredito y sí tiene el crédito en la mano, ya sale con
   * la regla nueva. Cuando crm.html pase el crédito, las dos pantallas dirán
   * exactamente el mismo número otra vez.
   */
  function prorrogaAcreditaEnFecha(pr, credito) {
    return M.cuentaComoPuntualParaGarantia({
      pagado_en_fecha: prorrogaFueATiempo(pr),
      // El ciclo que esta prórroga está pagando es el que termina en `pr.ciclo`.
      credito_estuvo_en_mora: !!credito && veniaDeMora(credito, pr && pr.ciclo)
    });
  }
  /* La garantía que dejó UNA prórroga, con la misma regla del §4 que usa
     cualquier otro pago: el costo con el factor de puntualidad de la prórroga y
     el recargo de mora siempre a la mitad, porque es plata que solo existe porque
     el corte ya había pasado. Es la ÚNICA cuenta: el Panel la muestra en el confirm
     con esta misma función, así que Joan no puede ver un número y el socio otro. */
  function garantiaGanadaProrroga(pr, credito) {
    return M.acumularGarantia(costoDeProrroga(pr), prorrogaAcreditaEnFecha(pr, credito)) +
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
  /* Las prórrogas y el plan que YA EXISTÍAN en una fecha. `p.prorrogas` es la
     lista de HOY, y preguntarle por el pasado es exactamente el error que esta
     sección vino a cerrar: una prórroga registrada en julio no puede cambiar lo
     que el socio tenía en mayo. Sin fecha (dato viejo) se cuenta siempre, que es
     lo que ya hace capitalVigenteEn con los abonos. */
  function prorrogasHasta(p, hasta) {
    var h = fechaFin(hasta);
    return lista(p && p.prorrogas).filter(function (pr) {
      var f = fechaFin(pr && pr.fecha);
      return !h || !f || f <= h;
    });
  }
  function tienePlanHasta(p, hasta) {
    if (!tienePlan(p)) return false;
    var h = fechaFin(hasta), e = entradaPlan(p);
    var f = fechaFin((e && e.fecha) || (p.planPagos && p.planPagos.creado));
    return !h || !f || f <= h;
  }
  /** @param {string} [hasta] el instante en que se pregunta; sin él, hoy. */
  function esPuntualParaNivel(p, hasta) {
    return M.cuentaComoPuntual({
      pagado_en_fecha: esPuntual(p),
      prorrogas_usadas: prorrogasHasta(p, hasta).length,
      plan_de_pagos: tienePlanHasta(p, hasta)
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

  /* El corte que le rige HOY a un crédito. Es el resumen del presente y solo
     sirve para el presente: para cualquier fecha pasada se pregunta
     corteVigenteEn(p, instante), que recorre la línea de tiempo. */
  function corteDelCredito(p) {
    return fechaFin(p && p.cicloActual) || fechaFin(p && p.cicloPago) ||
           fechaFin(p && p.fechaPago) || '';
  }
  /**
   * ¿Estaba ESTE crédito vencido y sin pagar en la fecha `hasta`?
   *
   * CONTRATO: la respuesta NO CAMBIA NUNCA por algo que pase después. Una
   * prórroga registrada hoy mueve el corte de hoy en adelante y ni toca lo que
   * pasó en junio. Antes leía `p.cicloActual` y por eso la prórroga borraba la
   * mora hacia atrás — el agujero por el que dejar la deuda rendía más que
   * pagarla.
   *
   * En la fecha misma del corte todavía no hay mora: ese es el día de pagar, no
   * el primero de atraso. Un crédito pagado sin fecha de pago no se acusa.
   */
  function estabaVencido(p, hasta) {
    var h = fechaFin(hasta);
    if (!h) return false;
    var corte = corteVigenteEn(p, h);
    if (!corte || h <= corte) return false;
    if (!p.pagado) return true;
    var fp = fechaFin(p.fechaPagado);
    return !!fp && fp > h;
  }
  /* La mora que la LÍNEA DE TIEMPO alcanza a ver: el último día, hasta `hasta`,
     en que `estabaVencido` dice que sí. Una mora termina el día en que el corte
     se mueve o el día en que se paga —los dos son hechos guardados—, así que los
     únicos días que hay que probar son el día anterior a cada uno de esos hechos
     y `hasta` mismo. */
  function ultimoDiaDeMoraEnLaLinea(p, h) {
    var cand = [h];
    cortesDelCredito(p).forEach(function (t) { if (t.desde) cand.push(diaAntes(t.desde)); });
    if (p && p.pagado) {
      var fp = fechaFin(p.fechaPagado);
      if (fp) cand.push(diaAntes(fp));
    }
    cand = cand.filter(function (d) { return d && d <= h; }).sort();
    for (var i = cand.length - 1; i >= 0; i--) if (estabaVencido(p, cand[i])) return cand[i];
    return '';
  }

  /* Todo movimiento que pudo traer recargo de mora, con los dos hechos que
     importan: de qué corte venía (`ciclo`) y qué día lo curó (`fecha`). Es la
     misma lista para las dos preguntas —¿hubo mora? ¿cuándo terminó?—, así que
     se arma una sola vez y en un solo lugar. */
  function movimientosConMora(p) {
    var movs = lista(p && p.prorrogas).map(function (pr) {
      return { ciclo: fechaFin(pr && pr.ciclo), fecha: fechaFin(pr && pr.fecha),
               mora: moraDeProrroga(pr), aTiempo: pr && pr.aTiempo };
    });
    var e = entradaPlan(p);
    if (e) {
      movs.push({ ciclo: fechaFin(e.ciclo),
                  fecha: fechaFin(e.fecha) || fechaFin(p.planPagos && p.planPagos.creado),
                  mora: moraDeProrroga(e), aTiempo: e.aTiempo });
    }
    /* Una cuota del plan pagada con recargo también es mora cobrada. El recargo
       va con su `monto` porque moraDeProrroga lo topa contra el monto: sin él se
       leería como cero y la prueba se perdería. */
    cuotasPlan(p).forEach(function (q) {
      if (!q || !q.pagado) return;
      movs.push({ ciclo: fechaFin(q.fecha), fecha: fechaFin(q.fechaPagado),
                  mora: moraDeProrroga({ mora: num(q.recargo),
                                         monto: num(q.costo) + num(q.recargo) }) });
    });
    /* Y el pago final del crédito: si el Panel le cobró recargo, hubo mora. Es
       el mismo hecho que los de arriba, guardado en otro campo. */
    if (p && p.pagado && num(p.recargoMora) > 0) {
      movs.push({ ciclo: fechaFin(p.cicloPago), fecha: fechaFin(p.fechaPagado),
                  mora: num(p.recargoMora) });
    }
    return movs.filter(function (m) { return m.mora > 0 || m.aTiempo === false; });
  }

  /**
   * EL PUNTO CIEGO DE UN DÍA, tapado donde tenía que estar tapado — 6-ago-2026.
   *
   * La línea de tiempo NO PUEDE VER el tramo vencido cuando el movimiento que lo
   * cura se registra el mismo día en que la mora arranca: el día del corte no es
   * mora y el día siguiente ya rige el corte nuevo, así que el tramo queda vacío
   * —aunque el socio haya pagado el 1% de ese día.
   *
   * Ese día existe y está guardado: si se cobró un recargo, hubo mora. El último
   * día en que la hubo es el anterior al que la curó, y nunca antes del primer
   * día de mora (`ciclo` + 1) — que es justo el caso de un solo día, donde los
   * dos son el mismo día y la línea de tiempo se queda con las manos vacías.
   *
   * @returns {string} '' si no hay ningún recargo cobrado hasta `hasta`.
   */
  function ultimoDiaDeMoraCobrada(p, hasta) {
    var h = fechaFin(hasta);
    if (!h) return '';
    var ultimo = '';
    movimientosConMora(p).forEach(function (m) {
      var primero = m.ciclo ? diaDespues(m.ciclo) : '';
      var curo = m.fecha ? diaAntes(m.fecha) : '';
      var dia = curo > primero ? curo : primero;
      if (dia && dia <= h && dia > ultimo) ultimo = dia;
    });
    return ultimo;
  }

  /**
   * El ÚLTIMO día, hasta `hasta`, en que este crédito estuvo en mora. '' si
   * nunca lo estuvo. ES LA ÚNICA VERDAD SOBRE LA MORA de este archivo: la usan
   * los tres consumidores (el factor de la garantía por el §4-bis, el estado
   * para el nivel y los hitos de meses_sin_mora), y por eso junta las DOS
   * pruebas que existen y se queda con la más reciente.
   *
   * Es lo que le faltaba a `meses_sin_mora` para significar lo que dice su
   * nombre: se medía desde el último atraso CURADO POR UN PAGO, así que una
   * mora de cuatro meses tapada con una prórroga no reseteaba nada y los meses
   * de atraso empujaban al socio hacia platino.
   *
   * 6-ago-2026 — Y LE FALTABA LA SEGUNDA PRUEBA. Hasta hoy había dos caminos:
   * el factor de la garantía preguntaba `estuvoEnMora() || moraYaCobrada()` y
   * los contadores del nivel solo `estuvoEnMora()`. O sea que el punto ciego de
   * un día estaba tapado para la garantía y abierto para el nivel: MEDIDO, con
   * 1 solo día de mora, prorrogar (42.000, y se queda los 200.000 de capital)
   * compraba PLATINO dos meses antes que pagar (los mismos 42.000 más devolver
   * el capital), y como el nivel no baja la ventaja era permanente. Con 2 días
   * de mora no pasaba: eso es lo que prueba que era un defecto y no una
   * política. Dos caminos que hay que acordarse de mantener iguales terminan
   * siempre así, y este proyecto ya lo pagó tres veces. Ahora hay uno.
   */
  function ultimoDiaDeMora(p, hasta) {
    var h = fechaFin(hasta);
    if (!h) return '';
    var enLaLinea = ultimoDiaDeMoraEnLaLinea(p, h);
    var cobrada = ultimoDiaDeMoraCobrada(p, h);
    return cobrada > enLaLinea ? cobrada : enLaLinea;
  }

  /* =================== LA REGLA ÚNICA DE LA MORA — 5-ago-2026 ===============
   * EL NIVEL PREMIABA AL QUE NO PAGA, Y ERA POR UNA LÍNEA.
   *
   * `contadoresDeNivel` calculaba la racha y los pagos a tiempo recorriendo
   * SOLO LOS CRÉDITOS PAGADOS. Un crédito vencido y sin pagar no está en esa
   * lista, así que no podía romper nada; uno pagado tarde sí. De ahí salía toda
   * la inversión del incentivo:
   *
   *   MEDIDO. Socio con 10 quincenas limpias y el crédito 11 de 200.000 vencido
   *   desde el 31-mar (127 días). Pagando los 494.000: racha 0. Dejando la
   *   prórroga y quedándose el capital (294.000): racha 10. Devolver 200.000 de
   *   capital no compraba un peso de garantía, de cupo ni de respaldo, y en la
   *   racha dejaba PEOR al que paga.
   *
   *   Y con esto el nivel entero se daba vuelta: 4 puntuales + el 5 vencido + 2
   *   puntuales después. Pagando el 5 (364.000) → a_tiempo 6, racha 2 → PLATA,
   *   cupo 619.600. Prorrogándolo (164.000) → a_tiempo 6, racha 6 → ORO, cupo
   *   774.500. Misma garantía: pagó 200.000 más y quedó un escalón abajo. Pasaba
   *   en 12 de 20 combinaciones barridas.
   *
   * EL GUARDIÁN QUE HABÍA ERA UN PARCHE POR REQUISITO. `enMora` apagaba solo
   * `meses_sin_mora` —requisito de platino— y no tocaba `racha` (requisito de
   * oro) ni `a_tiempo`. Tapaba uno de los tres y por eso dejaba dos abiertos.
   * Agregar dos guardianes más habría sido repetir el error.
   *
   * ASÍ QUE HAY UNA SOLA REGLA, ES ESTA, Y LOS TRES CONTADORES SALEN DE ELLA:
   * ¿cómo estaba ESTE crédito, para el nivel, en tal instante? Tres respuestas
   * posibles y nada más. El dato que faltaba ya existía —`estabaVencido` y
   * `ultimoDiaDeMora` recorren la línea de tiempo y no se mueven cuando se
   * registra una prórroga después—: los contadores simplemente nunca le
   * preguntaban por los créditos NO PAGADOS.
   *
   * 6-ago-2026 — Y LA MORA TENÍA QUE SER UNA SOLA VERDAD TAMBIÉN. La regla única
   * quedó bien pero se apoyaba en una mora que se preguntaba de dos formas: el
   * factor de la garantía sumaba la línea de tiempo MÁS los recargos ya cobrados,
   * y el nivel solo la línea de tiempo. El punto ciego de un día quedó tapado en
   * uno y abierto en el otro (ver ultimoDiaDeMora). Ahora las dos pruebas viven
   * dentro de `ultimoDiaDeMora` y los tres consumidores preguntan lo mismo: no
   * queda ningún camino que haya que acordarse de mantener igual.
   * ========================================================================*/

  /**
   * ¿Este crédito estuvo en mora en algún momento hasta `hasta`? La versión
   * "alguna vez" de `estabaVencido`, y la que necesita el nivel: una mora que
   * se tapó con una prórroga sigue habiendo existido. `ultimoDiaDeMora` es la
   * verdad única —línea de tiempo Y recargos cobrados—, así que devuelve '' solo
   * si nunca la hubo.
   */
  function estuvoEnMora(p, hasta) {
    return !!ultimoDiaDeMora(p, hasta);
  }

  /**
   * ¿Este crédito YA venía de una mora cuando arrancó el ciclo que termina en
   * `corte`? Es la pregunta del §4-bis del motor —la que decide si un pago
   * acredita completo o a la mitad— y se mide JUSTO ANTES de ese corte, no el día
   * del pago, por una razón que ya costó una ronda:
   *
   *   la puntualidad del propio ciclo la sigue decidiendo su dato CONGELADO
   *   (`pr.aTiempo`, el recargo de la cuota, esPuntual del pago final).
   *
   * Si esto mirara hasta el día del pago, estaría recalculando esa misma
   * puntualidad desde la línea de tiempo y le pasaría por encima al dato
   * guardado —justo lo que el 4-ago se decidió no hacer para no borrar garantía
   * ya acreditada. Acá se agrega SOLO lo que pasó antes: la mora de un ciclo
   * ANTERIOR, la que la prórroga tapó y el reloj de mora había puesto en cero.
   *
   * 6-ago-2026 — Y ES UNA SOLA PREGUNTA, no dos sumadas con un `||`: esa era la
   * forma del defecto. `estuvoEnMora` ya trae las dos pruebas adentro. El ciclo
   * PROPIO queda afuera solo, sin excepción escrita a mano, porque su mora no
   * puede haberse curado antes de su propio corte: su hito cae siempre después
   * del límite.
   */
  function veniaDeMora(p, corte) {
    return estuvoEnMora(p, diaAntes(fechaFin(corte)));
  }

  /**
   * EL ESTADO DE UN CRÉDITO PARA EL NIVEL en un instante. Es la regla única.
   *
   *   'gana'    pagado, en fecha, sin prórroga ni plan y sin haber estado nunca
   *             en mora: suma un pago a tiempo y suma a la racha.
   *   'rompe'   estuvo en mora, o pagó tarde, o necesitó prórroga o plan de
   *             pagos. No suma y ROMPE la racha, esté pagado o no: deber la
   *             plata no puede valer menos que haberla pagado tarde.
   *   'abierto' todavía no le llegó el corte y no le pasó nada: ni suma ni
   *             rompe. Un crédito recién desembolsado no le borra la racha a
   *             nadie.
   *
   * Que 'rompe' no se cure NUNCA es la mitad que faltaba: la prórroga mueve el
   * corte al futuro, así que sin el "alguna vez" el crédito volvía a 'abierto'
   * al día siguiente y la racha se recomponía sola. Lo que no se cura es el
   * escalón; la garantía ya ganada sigue intacta y el nivel sigue sin bajar
   * (nivelDelSocio toma el máximo histórico).
   */
  function estadoParaNivel(p, hasta) {
    var pagado = !!(p && p.pagado) && (fechaFin(p.fechaPagado) || hasta) <= hasta;
    if (estuvoEnMora(p, hasta)) return 'rompe';
    if (pagado) return esPuntualParaNivel(p, hasta) ? 'gana' : 'rompe';
    // Sin pagar y sin mora: si ya necesitó prórroga o plan, tampoco gana el
    // escalón —y no puede esperar a estar pagado para dejar de ganarlo, o
    // prorrogar volvería a rendir más que pagar mientras el crédito esté abierto.
    if (prorrogasHasta(p, hasta).length || tienePlanHasta(p, hasta)) return 'rompe';
    return 'abierto';
  }

  /* Los tres contadores del nivel TAL COMO ESTABAN en la fecha `hasta`, los tres
     derivados del estado de cada crédito y de nada más.
     `ps` son todos los créditos del socio ordenados por desembolso. */
  function contadoresDeNivel(ps, hasta) {
    var estados = ps.map(function (p) { return estadoParaNivel(p, hasta); });
    var aTiempo = 0;
    for (var i = 0; i < estados.length; i++) if (estados[i] === 'gana') aTiempo++;
    /* La racha: los últimos seguidos que ganaron. Los abiertos se saltan (no
       hay nada que juzgar todavía) y el primer 'rompe' la corta —el vencido sin
       pagar igual que el pagado tarde. */
    var racha = 0;
    for (var j = estados.length - 1; j >= 0; j--) {
      if (estados[j] === 'abierto') continue;
      if (estados[j] !== 'gana') break;
      racha++;
    }
    /* Desde cuándo lleva sin mora: desde el último hito de los créditos que
       rompieron. El hito es el último día en que el crédito estuvo vencido —una
       mora termina el día en que el corte se mueve o el día en que se paga— y,
       para el que no llegó a estar vencido pero tampoco ganó el escalón, el día
       en que se pagó. Si HOY hay uno en mora, `ultimoDiaDeMora` devuelve el
       propio `hasta` y los meses quedan en cero solos: no hace falta ningún
       guardián aparte, que es lo que antes tapaba un requisito y dejaba dos.

       6-ago-2026: el hito sale de `ultimoDiaDeMora`, que ahora es la MISMA
       verdad que usa el factor de la garantía —línea de tiempo y recargos ya
       cobrados—. Antes este contador solo veía la línea de tiempo, y por eso una
       mora de UN día tapada con una prórroga el mismo día no reseteaba nada: el
       reloj seguía corriendo y prorrogar compraba platino antes que pagar. */
    var hitos = [];
    ps.forEach(function (p, k) {
      var m = ultimoDiaDeMora(p, hasta);
      if (m) { hitos.push(m); return; }
      if (estados[k] === 'rompe' && p.pagado) {
        var f = fechaFin(p.fechaPagado);
        if (f && f <= hasta) hitos.push(f);
      }
    });
    hitos = hitos.filter(Boolean).sort();
    var desde = hitos.length ? hitos[hitos.length - 1]
              : (ps[0] ? (fechaFin(ps[0].fechaDesembolso) || hasta) : hasta);
    var meses = Math.max(0, Math.floor(diasEntre(desde, hasta) / 30));
    return { a_tiempo: aTiempo, racha: racha, meses_sin_mora: meses };
  }
  /* Los instantes en que la cuenta del socio pudo cambiar de nivel: cada pago
     (sube la racha, se cura un atraso), CADA CORTE QUE TUVO CADA CRÉDITO —no
     solo el de hoy: el corte viejo que la prórroga dejó atrás es justamente el
     que abrió la mora— cada día en que un corte se movió, y HOY. Nunca el
     futuro. */
  function instantesDeNivel(ps, hoy) {
    var vistos = {}, fechas = [];
    function agregar(f) {
      if (f && f <= hoy && !vistos[f]) { vistos[f] = true; fechas.push(f); }
    }
    ps.forEach(function (p) {
      if (p.pagado) agregar(fechaFin(p.fechaPagado));
      cortesDelCredito(p).forEach(function (t) { agregar(t.corte); agregar(t.desde); });
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
     prórroga que el socio pagó puntualmente hace meses se le degradaba del factor
     completo a la mitad el día que el crédito terminaba pagándose tarde. Garantía
     ya ganada que desaparecía hacia atrás, que es exactamente lo contrario de lo que le
     promete el producto: "todo lo que pagues sigue sumando".

     El motor nunca dijo eso: la prórroga se cobra y se acredita el día que se
     paga, y lo que pase después con el crédito no la puede tocar (decisión D6).
     Cada prórroga lleva su propia cuenta, y el pago final la suya.

     4-ago-2026 — la SEGUNDA mitad del mismo arreglo. "Se acredita el día que se
     paga" no quería decir "se acredita siempre al factor completo": quería decir
     que el factor se congela ese día. Acá estaba congelado en `true` para todas, y con
     eso una prórroga registrada con veinte días de atraso dejaba MÁS garantía
     que saldar la deuda completa el mismo día. Medido, con los mismos 240.000 de
     costos: dejar la prórroga 162.000, saldar todo 108.000. 54.000 de regalo al
     que no paga, o sea 162.000 más de cupo en platino. Es el mismo agujero que
     el bono por puntualidad vino a cerrar, reabierto por otra puerta.

     Ahora cada prórroga usa su propio factor de puntualidad (§4), el mismo que
     usa cualquier otro pago, y lo ya ganado sigue intacto: las prórrogas viejas
     no traen recargo, se leen puntuales y conservan su factor completo. */
  function garantiaGanadaCredito(p) {
    return lista(p && p.prorrogas).reduce(function (t, pr) {
      return t + garantiaGanadaProrroga(pr, p);
    }, 0) +
      /* Cada cuota del plan de pagos lleva su propio factor, congelado el día
         que se cobró, por la misma razón que las prórrogas: lo ya ganado no se
         puede mover hacia atrás. */
      garantiaGanadaPlan(p) +
      /* 5-ago-2026 §4-bis — y el pago final tampoco. `esPuntual` compara la
         fecha de pago contra el corte, y la prórroga corre el corte al futuro:
         el que se atrasaba 127 días, prorrogaba y pagaba dentro del corte nuevo
         cobraba el factor completo del que nunca se atrasó. El factor mira las
         dos cosas: llegó en fecha Y el crédito no venía de una mora. */
      (p && p.pagado
        ? M.acumularGarantia(Math.max(0, num(p.gananciaPago)),
            M.cuentaComoPuntualParaGarantia({
              pagado_en_fecha: esPuntual(p),
              credito_estuvo_en_mora: veniaDeMora(p, p.cicloPago)
            }))
        : 0);
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
     (0,75 en fecha y 0,375 tarde en el quincenal; 0,20 y 0,10 en el otro). Acá
     no se multiplica nada a mano y tampoco se deja de multiplicar: el costo
     COBRADO no es la garantía, y desde que FACTOR_GARANTIA dejó de ser 1,00 no
     hay forma de que coincidan. Es una sola cuenta para el paquete del socio y
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

  /* ==========================================================================
   * LA CONTABILIDAD DEL CUPÓN — 5-ago-2026, solo para el Panel.
   *
   * Con el reparto 75/10/15, el 15% de cada costo cobrado va devolviéndole a la
   * plataforma el cupón que le REGALÓ al socio para arrancar. Cuando ese cupón
   * queda saldado —el crédito 13 en la escalera normal— ese mismo 15% deja de
   * ser recuperación de capital y pasa a ser ganancia. El Panel necesita las
   * tres cifras: cuánto queda por recuperar, cuánto ya se recuperó y cuánto de
   * lo cobrado es ganancia libre.
   *
   * SE DERIVA DE LOS COSTOS COBRADOS, NO DE UN CONTADOR GUARDADO, y es la misma
   * decisión que ya se tomó dos veces en este archivo: el nivel es un máximo
   * histórico derivado y el costo del ciclo se reconstruye de los hechos. Un
   * contador guardado se desincroniza el día que Joan edita o borra un pago, y
   * desde ahí miente para siempre sin que nadie lo note.
   *
   * NADA DE ESTO VIAJA AL SOCIO. migrarSocio no lo llama ni lo puede llamar:
   * para el socio su garantía es el 75% y no existe ningún cupón que devolver.
   * ========================================================================*/

  /**
   * Los costos que un socio YA PAGÓ, uno por uno y en orden, con el factor de
   * puntualidad de cada uno. Es EXACTAMENTE la misma partición que hace
   * garantiaGanadaCredito —cada prórroga con su factor, el recargo siempre a la
   * mitad, cada cuota del plan por separado, el pago final aparte— así que la
   * suma de las garantías de estos movimientos da la garantía del socio. Si un
   * día una de las dos cambia, la otra tiene que cambiar con ella.
   *
   * @returns {Array<{fecha, tipo, monto, aTiempo, producto}>}
   */
  function movimientosCobradosCredito(p) {
    var movs = [];
    function empujar(fecha, tipo, monto, aTiempo, producto) {
      if (num(monto) <= 0) return;
      movs.push({ fecha: fechaFin(fecha) || null, tipo: tipo, monto: num(monto),
                  aTiempo: aTiempo !== false, producto: producto || 'quincenal' });
    }
    lista(p && p.prorrogas).forEach(function (pr) {
      empujar(pr && pr.fecha, 'costo_prorroga', costoDeProrroga(pr), prorrogaAcreditaEnFecha(pr, p));
      empujar(pr && pr.fecha, 'recargo_mora', moraDeProrroga(pr), false);
    });
    var e = entradaPlan(p);
    if (e) {
      empujar(e.fecha, 'entrada_plan', costoDeProrroga(e), prorrogaAcreditaEnFecha(e, p));
      empujar(e.fecha, 'recargo_mora', moraDeProrroga(e), false);
    }
    cuotasPlan(p).forEach(function (c) {
      /* Una cuota vieja que no guardó su costo conserva la garantía que se le
         acreditó (garantiaGanadaCuotaPlan) pero no puede entrar al reparto: no
         se sabe de qué costo salió, y repartir un número inventado sería peor
         que no repartirlo. */
      if (!c || !c.pagado || c.costo == null) return;
      var f = fechaFin(c.fechaPagado), corte = fechaFin(c.fecha);
      var enFecha = num(c.recargo) === 0 && (!f || !corte || f <= corte);
      empujar(c.fechaPagado || c.fecha, 'cuota_plan', num(c.costo),
        M.cuentaComoPuntualParaGarantia({
          pagado_en_fecha: enFecha, credito_estuvo_en_mora: veniaDeMora(p, corte) }));
      empujar(c.fechaPagado || c.fecha, 'recargo_mora', num(c.recargo), false);
    });
    if (p && p.pagado) {
      /* El pago final va con costo y recargo en un solo movimiento porque así lo
         guarda el Panel (`gananciaPago` es el costo TOTAL cobrado) y así lo
         acredita garantiaGanadaCredito. Partirlo acá daría otra garantía. */
      empujar(p.fechaPagado, 'pago_final', Math.max(0, num(p.gananciaPago)),
        M.cuentaComoPuntualParaGarantia({
          pagado_en_fecha: esPuntual(p), credito_estuvo_en_mora: veniaDeMora(p, p.cicloPago) }));
    }
    return movs;
  }

  /* Las cuotas ya pagadas de un préstamo con garantía. Costo y recargo van
     JUNTOS y con un solo factor, que es como los acredita el motor
     (liquidarCuotaRespaldada), no como los acredita el quincenal. */
  function movimientosCobradosRespaldado(r) {
    return lista(r && r.cuotas).filter(function (c) { return c && c.pagado; })
      .map(function (c) {
        return { fecha: fechaFin(c.fechaPagado) || fechaFin(c.fecha) || null,
                 tipo: 'cuota_respaldado', producto: 'respaldado',
                 monto: num(c.costo) + num(c.recargo), aTiempo: num(c.recargo) === 0 };
      }).filter(function (m) { return m.monto > 0; });
  }

  /** Todo lo que un socio pagó de costos, de los dos productos, cronológico.
     El orden IMPORTA: el 15% del movimiento que salda el cupón se parte en dos
     (una parte lo termina de saldar, el resto ya es ganancia). */
  function movimientosCobradosDe(db, s) {
    var movs = lista(db && db.prestamos)
      .filter(function (p) { return p.socioId === (s && s.id); })
      .reduce(function (t, p) { return t.concat(movimientosCobradosCredito(p)); }, [])
      .concat(respaldadosDe(db, s).reduce(function (t, r) {
        return t.concat(movimientosCobradosRespaldado(r));
      }, []));
    // Sin fecha van al final: son datos viejos y no pueden colarse antes de un
    // hecho fechado para adelantar la amortización.
    return movs.sort(function (a, b) {
      return String(a.fecha || '9999-12-31').localeCompare(String(b.fecha || '9999-12-31'));
    });
  }

  /**
   * La contabilidad del cupón de UN socio. Lo que el Panel pone en su ficha.
   *
   * El cupón que hay que recuperar es toda la garantía PRESTADA: el cupón por
   * los datos y los 5.000 de cada referido. Las dos son plata que puso la
   * plataforma para que el socio pudiera pedir sin haber pagado nada, y las dos
   * son exposición de Joan mientras no vuelvan.
   */
  function contabilidadCupon(db, s) {
    var g = M.desglosarGarantia(entradaGarantia(db, s));
    var c = M.amortizarCupon(movimientosCobradosDe(db, s), { cuponPrestado: g.prestada });
    c.socio_id = s && s.id;
    c.garantia_prestada = g.prestada;
    c.garantia_ganada = g.ganada;
    /* Lo que Joan tiene de verdad en riesgo por este socio: el cupón que todavía
       no volvió. Lo demás que el socio puede pedir está respaldado por costos
       que él ya pagó. */
    c.expuesto = c.cupon_pendiente;
    return c;
  }

  /** La misma cuenta para toda la cartera, socio por socio y sumada. El cupón
     NO se puede amortizar en una sola bolsa: cada socio tiene el suyo y el
     15% que paga solo devuelve el que se le regaló A ÉL. */
  function contabilidadCartera(db) {
    var porSocio = lista(db && db.socios).filter(Boolean).map(function (s) {
      return contabilidadCupon(db, s);
    });
    var t = {
      socios: porSocio.length,
      cupon_prestado: 0, cupon_recuperado: 0, cupon_pendiente: 0,
      cobrado: 0, garantia_socio: 0, operativo: 0,
      ganancia_libre: 0, ganancia_cupon: 0,
      socios_saldados: 0, por_socio: porSocio
    };
    porSocio.forEach(function (c) {
      t.cupon_prestado += c.cupon_prestado;
      t.cupon_recuperado += c.cupon_recuperado;
      t.cupon_pendiente += c.cupon_pendiente;
      t.cobrado += c.cobrado;
      t.garantia_socio += c.garantia_socio;
      t.operativo += c.operativo;
      t.ganancia_libre += c.ganancia_libre;
      t.ganancia_cupon += c.ganancia_cupon;
      if (c.saldado) t.socios_saldados += 1;
    });
    t.expuesto = t.cupon_pendiente;
    return t;
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
      comprometida: comprometidaDe(db, s),
      /* El tope de los referidos, si Joan lo movió desde Ajustes. Sin dato en el
         Panel viaja undefined y manda el del motor (M.TOPE_REFERIDOS), que es
         donde vive el valor por defecto: acá no se repite ningún número. */
      tope_referidos: topeReferidosDe(db)
    };
  }
  /* La mitad de Joan del tope de los referidos: vive en Ajustes, igual que el
     freno por ingreso. Si la clave no está —hoy no está: crm.html todavía no la
     escribe— devuelve undefined y el motor usa su propio valor. */
  function topeReferidosDe(db) {
    var c = db && db.config && db.config.topeReferidos;
    return (c && typeof c === 'object') ? c : undefined;
  }

  /**
   * EL FRENO POR INGRESO, LISTO PARA QUE EL PANEL LO ENCIENDA (5-ago-2026).
   *
   * Junta las dos mitades del dato: la configuración, que es de Joan y vive en
   * Ajustes (`db.config.freno`), y el ingreso quincenal, que es de cada socio.
   * Viene APAGADO —`activo:false`— y así se queda hasta que Joan lo prenda; y
   * aunque lo prenda, un socio sin ingreso declarado no se topa, porque topar
   * contra un dato que no tenemos sería bajarle el cupo por no haber contestado.
   */
  function frenoDe(db, s) {
    var c = (db && db.config && db.config.freno) || {};
    return {
      activo: c.activo === true,
      fraccion_quincena: num(c.fraccion_quincena) > 0
        ? num(c.fraccion_quincena) : M.FRENO_INGRESO.fraccion_quincena,
      ingreso_quincenal: Math.max(0, num(s && s.ingresoQuincenal))
    };
  }

  /** El cupo quincenal de un socio, con el freno ya consultado. Es la función
     que el Panel y la app tienen que preguntar: si cada uno arma la entrada y
     las opciones por su lado, el día que Joan encienda el freno una de las dos
     pantallas va a seguir mostrando el cupo viejo. */
  function cupoDelSocio(db, s, nivel) {
    return M.cupoQuincenal(entradaGarantia(db, s), nivel || 'bronce',
                           { freno: frenoDe(db, s) });
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
        /* 5-ago-2026 — LA MORA VIAJA HECHA, NO PARA QUE LA APP LA REHAGA.
           La app sumaba capital + costo + 1% × capital por su cuenta, y con un
           abono de por medio le daba otra cosa que al Panel: 200.000 a 20 días
           con 199.999 abonados, el Panel cobraba 80.001 y la app decía "Total
           para saldar hoy $1". Ahora la cuenta la hace liquidarCiclo, una sola
           vez y en un solo sitio, y acá viaja YA HECHA. */
        var liq = liquidarCiclo(p, hoy);
        return {
          codigo: codCredito(p),
          capital: p.pagado ? num(p.capital) : liq.capital,
          costo: Math.round(p.pagado ? gananciaCobrada(p) : liq.costo),
          saldo_capital: p.pagado ? 0 : capitalActual(p),
          tasa: tasaDelCiclo(p),
          desembolso: p.fechaDesembolso || null, corte: p.cicloActual || null,
          pagado: !!p.pagado, fecha_pagado: p.fechaPagado || null,
          abonado: Math.round(gananciaCobrada(p) + capitalRecuperadoDe(p)),
          garantia: garantiaGanadaCredito(p),
          prorrogas: lista(p.prorrogas).length,
          // Solo el conteo: al socio le alcanza con ver que va por la cuota 2 de 3.
          plan_cuotas: cuotasPlan(p).length,
          plan_cuotas_pagadas: cuotasPlan(p).filter(function (c) { return !!c.pagado; }).length,
          /* Lo que la app tiene que PINTAR, sin recalcular nada: el recargo de
             hoy, los días que lo causaron y el total para saldar. Y `causado`
             para el día que quiera liquidar en otra fecha: se lo pasa a
             MotorReglas.liquidarCredito como {recargoCausado, diasCausados}. */
          dias_mora: liq.dias_mora,
          mora: liq.recargo_mora,
          total_hoy: liq.total_a_pagar,
          causado: liq.causado,
          /* Y el dato del §4-bis, para que la app no lo deduzca: un crédito que
             ya estuvo en mora acredita a la mitad aunque pague dentro del corte que
             le compró la prórroga. Viaja para pasárselo al motor tal cual
             (`credito.estuvo_en_mora`). */
          estuvo_en_mora: liq.estuvo_en_mora
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
    /* La contabilidad del cupón (5-ago-2026). SOLO para el Panel: no entra al
       paquete del socio por ningún lado. */
    movimientosCobradosCredito: movimientosCobradosCredito,
    movimientosCobradosRespaldado: movimientosCobradosRespaldado,
    movimientosCobradosDe: movimientosCobradosDe,
    contabilidadCupon: contabilidadCupon,
    contabilidadCartera: contabilidadCartera,
    // El freno por ingreso, apagado, para que el Panel lo pueda encender
    frenoDe: frenoDe,
    // El tope de los referidos, para que el Panel lo pueda mover (6-ago-2026)
    topeReferidosDe: topeReferidosDe,
    cupoDelSocio: cupoDelSocio,
    migrarSocio: migrarSocio,
    buscarSocio: buscarSocio,
    datosKycDe: datosKycDe,
    referidosDe: referidosDe,
    fotoComunidad: fotoComunidad,
    esPuntual: esPuntual,
    esPuntualParaNivel: esPuntualParaNivel,
    corteDelCredito: corteDelCredito,
    // La línea de tiempo: TODA pregunta con una fecha adentro sale de acá.
    cambiosDeCorte: cambiosDeCorte,
    corteOriginal: corteOriginal,
    cortesDelCredito: cortesDelCredito,
    corteVigenteEn: corteVigenteEn,
    inicioDelCiclo: inicioDelCiclo,
    capitalVigenteEn: capitalVigenteEn,
    capitalBaseDelCiclo: capitalBaseDelCiclo,
    causadoDelCiclo: causadoDelCiclo,
    moraDelCiclo: moraDelCiclo,
    liquidarCiclo: liquidarCiclo,
    ultimoDiaDeMora: ultimoDiaDeMora,
    estabaVencido: estabaVencido,
    // La regla única de la mora, y el estado que sale de ella (5-ago-2026).
    // `ultimoDiaDeMoraCobrada` y `veniaDeMora` van expuestas desde el 6-ago-2026:
    // son las dos mitades de esa verdad única y las pantallas tienen que poder
    // preguntarlas en vez de deducirlas.
    ultimoDiaDeMoraCobrada: ultimoDiaDeMoraCobrada,
    veniaDeMora: veniaDeMora,
    estuvoEnMora: estuvoEnMora,
    estadoParaNivel: estadoParaNivel,
    prorrogaAcreditaEnFecha: prorrogaAcreditaEnFecha,
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
