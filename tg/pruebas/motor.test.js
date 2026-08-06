/* ============================================================================
 * Pruebas del motor de reglas — Tu Garantía v1
 * Sin dependencias: corredor de pruebas nativo de Node.
 *
 *   node --test
 *
 * Las fechas esperadas están calculadas a mano contra el calendario real
 * colombiano (no salieron del propio motor), para que la prueba valga.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/motor.js');

/* ==========================================================================
 * §7 — calcularFechaCorte
 * ======================================================================== */

describe('calcularFechaCorte — cortes fijos (§7)', () => {

  test('corta el 15 cuando hay margen de sobra', () => {
    assert.equal(M.calcularFechaCorte('2026-07-01'), '2026-07-15');
  });

  test('corta el último día del mes si el 15 ya pasó', () => {
    assert.equal(M.calcularFechaCorte('2026-07-16'), '2026-07-31');
  });

  test('acepta Date y "YYYY-MM-DD" indistintamente', () => {
    const conTexto = M.calcularFechaCorte('2026-07-01');
    const conDate = M.calcularFechaCorte(new Date(2026, 6, 1));
    assert.equal(conTexto, conDate);
  });

  test('no se cuelga con la trampa de UTC (new Date("...") caería un día antes)', () => {
    // Si se parseara en UTC, el 2026-07-01 sería 30-jun en Bogotá y el corte
    // seguiría siendo el 15, pero el desembolso del 2026-07-16 daría 2026-07-31
    // por accidente. Este par lo detecta.
    assert.equal(M.calcularFechaCorte('2026-07-10'), '2026-07-15'); // 5 días justos
    assert.equal(M.calcularFechaCorte('2026-07-11'), '2026-07-31'); // 4 días
  });

  test('el corte nominal siempre es un 15 o un último día de mes — barrido de 2026', () => {
    const f = new Date(2026, 0, 1);
    while (f.getFullYear() === 2026) {
      const d = M.detalleFechaCorte(f);
      const n = M.aFechaLocal(d.fecha_corte_nominal);
      const ultimo = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
      assert.ok(n.getDate() === 15 || n.getDate() === ultimo,
        `${M.iso(f)} → nominal ${d.fecha_corte_nominal}, que no es 15 ni fin de mes`);
      f.setDate(f.getDate() + 1);
    }
  });
});

describe('calcularFechaCorte — ventana mínima de 5 días (§7.3)', () => {

  test('5 días exactos: se queda en ese corte', () => {
    const d = M.detalleFechaCorte('2026-07-10');
    assert.equal(d.fecha_corte, '2026-07-15');
    assert.equal(d.dias_al_corte, 5);
    assert.deepEqual(d.cortes_saltados, []);
  });

  test('4 días: se pasa al corte siguiente', () => {
    const d = M.detalleFechaCorte('2026-07-11');
    assert.equal(d.fecha_corte, '2026-07-31');
    assert.equal(d.dias_al_corte, 20);
    assert.deepEqual(d.cortes_saltados, ['2026-07-15']);
  });

  test('desembolso el mismo día del corte: se va al siguiente', () => {
    assert.equal(M.calcularFechaCorte('2026-07-15'), '2026-07-31');
  });

  test('1 día antes del corte: se va al siguiente', () => {
    assert.equal(M.calcularFechaCorte('2026-07-14'), '2026-07-31');
  });

  test('la ventana se mide contra la fecha YA corrida por festivo (D1)', () => {
    // 15-nov-2026 es domingo y el 16 es festivo (Cartagena, Ley Emiliani):
    // el corte real es el martes 17. Del 12 al 17 hay 5 días → se conserva.
    // Si se midiera contra el 15 nominal (3 días) se saltaría al 30.
    const d = M.detalleFechaCorte('2026-11-12');
    assert.equal(d.fecha_corte, '2026-11-17');
    assert.equal(d.dias_al_corte, 5);
  });

  test('nunca devuelve un corte a menos de 5 días — barrido de todo 2026', () => {
    const f = new Date(2026, 0, 1);
    while (f.getFullYear() === 2026) {
      const corte = M.aFechaLocal(M.calcularFechaCorte(f));
      const dias = M.diasEntre(f, corte);
      assert.ok(dias >= 5, `${M.iso(f)} → ${M.iso(corte)} son ${dias} días`);
      assert.notEqual(corte.getDay(), 0, `${M.iso(corte)} cayó domingo`);
      assert.equal(M.esFestivo(corte), false, `${M.iso(corte)} es festivo`);
      f.setDate(f.getDate() + 1);
    }
  });
});

describe('calcularFechaCorte — domingos y festivos (§7.1)', () => {

  test('corte en domingo → lunes siguiente (31-may-2026 es domingo)', () => {
    const d = M.detalleFechaCorte('2026-05-18');
    assert.equal(d.fecha_corte_nominal, '2026-05-31');
    assert.equal(d.fecha_corte, '2026-06-01');
    assert.equal(d.corrido_por, 'domingo');
    assert.equal(d.dias_corridos, 1);
  });

  test('corte en festivo entre semana → día siguiente (Corpus Christi, 31-may-2027, lunes)', () => {
    const d = M.detalleFechaCorte('2027-05-20');
    assert.equal(d.fecha_corte_nominal, '2027-05-31');
    assert.equal(M.esFestivo('2027-05-31'), true);
    assert.equal(d.fecha_corte, '2027-06-01');
    assert.equal(d.corrido_por, 'festivo');
  });

  test('corte en festivo del 15 → 15-ago-2022 fue lunes y festivo (Asunción)', () => {
    const d = M.detalleFechaCorte('2022-08-01');
    assert.equal(d.fecha_corte_nominal, '2022-08-15');
    assert.equal(d.fecha_corte, '2022-08-16');
    assert.equal(d.corrido_por, 'festivo');
  });

  test('domingo + festivo seguidos → salta los dos (15-nov-2026 dom, 16 festivo)', () => {
    const d = M.detalleFechaCorte('2026-11-01');
    assert.equal(d.fecha_corte_nominal, '2026-11-15');
    assert.equal(d.fecha_corte, '2026-11-17');
    assert.equal(d.dias_corridos, 2);
    assert.equal(d.corrido_por, 'domingo');
  });

  test('el sábado SÍ es día de corte, no se corre (D2)', () => {
    const d = M.detalleFechaCorte('2026-02-20');
    assert.equal(d.fecha_corte, '2026-02-28');           // sábado
    assert.equal(M.aFechaLocal('2026-02-28').getDay(), 6);
    assert.equal(d.dias_corridos, 0);
  });

  test('el corte puede empujar al mes (y al año) siguiente: 31-dic-2028 es domingo y el 1-ene es festivo', () => {
    const d = M.detalleFechaCorte('2028-12-18');
    assert.equal(d.fecha_corte_nominal, '2028-12-31');
    assert.equal(d.fecha_corte, '2029-01-02');
    assert.equal(d.dias_corridos, 2);
  });
});

describe('calcularFechaCorte — febrero', () => {

  test('febrero común: el último día es el 28 (2026)', () => {
    assert.equal(M.calcularFechaCorte('2026-02-20'), '2026-02-28');
  });

  test('febrero bisiesto: el último día es el 29 (2028, martes)', () => {
    assert.equal(M.calcularFechaCorte('2028-02-20'), '2028-02-29');
  });

  test('febrero bisiesto: nunca aparece un 30 de febrero', () => {
    for (let dia = 1; dia <= 29; dia++) {
      const corte = M.calcularFechaCorte(new Date(2028, 1, dia));
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(corte));
      assert.doesNotThrow(() => M.aFechaLocal(corte));
    }
  });

  test('febrero + domingo + ventana mínima: 28-feb-2027 es domingo, corre al 1-mar y ya no alcanza', () => {
    const d = M.detalleFechaCorte('2027-02-25');
    assert.equal(d.fecha_corte_nominal, '2027-03-15');
    assert.equal(d.fecha_corte, '2027-03-15');
    assert.deepEqual(d.cortes_saltados, ['2027-03-01']);
  });

  test('febrero corto no rompe el cruce desde enero', () => {
    // 31-ene-2026 queda a 3 días (no alcanza) y el 15-feb es domingo → lunes 16.
    const d = M.detalleFechaCorte('2026-01-28');
    assert.deepEqual(d.cortes_saltados, ['2026-01-31']);
    assert.equal(d.fecha_corte_nominal, '2026-02-15');
    assert.equal(d.fecha_corte, '2026-02-16');
  });

  test('cruce de año: 28-dic no alcanza el 31, se va al 15 de enero', () => {
    const d = M.detalleFechaCorte('2026-12-28');
    assert.equal(d.fecha_corte, '2027-01-15');
    assert.deepEqual(d.cortes_saltados, ['2026-12-31']);
  });
});

describe('calcularFechaCorte — entradas inválidas', () => {
  test('rechaza fechas que no existen', () => {
    assert.throws(() => M.calcularFechaCorte('2026-02-30'), /no existe/);
  });
  test('rechaza formatos raros', () => {
    assert.throws(() => M.calcularFechaCorte('15/07/2026'), /YYYY-MM-DD/);
    assert.throws(() => M.calcularFechaCorte('ayer'), /YYYY-MM-DD/);
    assert.throws(() => M.calcularFechaCorte(20260715), /YYYY-MM-DD/);
    assert.throws(() => M.calcularFechaCorte(null), /YYYY-MM-DD/);
  });
});

/* ==========================================================================
 * Festivos colombianos (§7.2) — validación independiente del calendario
 * ======================================================================== */

describe('festivos colombianos', () => {

  test('2026 tiene los 18 festivos de ley', () => {
    assert.equal(Object.keys(M.festivosDelAnio(2026)).length, 18);
  });

  test('fijos que no se corren', () => {
    ['2026-01-01', '2026-05-01', '2026-07-20', '2026-08-07', '2026-12-08', '2026-12-25']
      .forEach(f => assert.equal(M.esFestivo(f), true, f));
  });

  test('Ley Emiliani: se corren al lunes', () => {
    assert.equal(M.esFestivo('2026-01-06'), false); // martes
    assert.equal(M.esFestivo('2026-01-12'), true);  // Reyes, lunes
    assert.equal(M.esFestivo('2026-03-19'), false); // jueves
    assert.equal(M.esFestivo('2026-03-23'), true);  // San José, lunes
    assert.equal(M.esFestivo('2026-08-15'), false); // sábado
    assert.equal(M.esFestivo('2026-08-17'), true);  // Asunción, lunes
    assert.equal(M.esFestivo('2026-11-16'), true);  // Cartagena, lunes
  });

  test('Ley Emiliani: si ya cae lunes, se queda quieto', () => {
    assert.equal(M.aFechaLocal('2026-06-29').getDay(), 1);
    assert.equal(M.esFestivo('2026-06-29'), true);  // San Pedro
    assert.equal(M.esFestivo('2026-10-12'), true);  // Día de la Raza
  });

  test('Pascua 2026 = 5 de abril, y los móviles que dependen de ella', () => {
    assert.equal(M.iso(M.pascua(2026)), '2026-04-05');
    assert.equal(M.esFestivo('2026-04-02'), true); // Jueves Santo
    assert.equal(M.esFestivo('2026-04-03'), true); // Viernes Santo
    assert.equal(M.esFestivo('2026-05-18'), true); // Ascensión
    assert.equal(M.esFestivo('2026-06-08'), true); // Corpus Christi
    assert.equal(M.esFestivo('2026-06-15'), true); // Sagrado Corazón
    assert.equal(M.esFestivo('2026-04-05'), false); // el domingo de Pascua no es festivo de ley
  });

  test('Pascua 2027 = 28 de marzo', () => {
    assert.equal(M.iso(M.pascua(2027)), '2027-03-28');
    assert.equal(M.esFestivo('2027-03-25'), true); // Jueves Santo
    assert.equal(M.esFestivo('2027-05-31'), true); // Corpus Christi
  });

  test('siguienteDiaHabilDeCorte salta domingos y festivos, no sábados', () => {
    assert.equal(M.iso(M.siguienteDiaHabilDeCorte('2026-11-15')), '2026-11-17');
    assert.equal(M.iso(M.siguienteDiaHabilDeCorte('2026-02-28')), '2026-02-28'); // sábado
  });
});

/* ==========================================================================
 * §5 — calcularTasa
 * ======================================================================== */

describe('calcularTasa — el costo es SIEMPRE 20% (29-jul-2026)', () => {

  test('EL COSTO NO DEPENDE DE NADA: siempre 20%', () => {
    assert.equal(M.TASA_CREDITO, 0.20);
    assert.equal(M.calcularTasa(0, 500000), 0.20);
    assert.equal(M.calcularTasa(250000, 500000), 0.20);
    assert.equal(M.calcularTasa(500000, 500000), 0.20);
    assert.equal(M.calcularTasa(50000000, 500000), 0.20);
  });

  test('por más garantía que tenga, paga lo mismo: la garantía ya no compra precio', () => {
    const capital = 1000000;
    const tasas = [0, 500000, 1000000, 5000000, 99000000].map(g => M.calcularTasa(g, capital));
    assert.equal(new Set(tasas).size, 1, 'una sola tasa para todos');
    assert.equal(tasas[0], 0.20);
  });

  test('calcularCosto da el 20% en pesos, redondeado', () => {
    assert.equal(M.calcularCosto(500000), 100000);
    assert.equal(M.calcularCosto(333333), 66667);   // 66.666,6
    assert.equal(M.calcularCosto(1), 0);            // 0,2 → 0
  });

  test('capital cero o negativo sigue siendo un error, no un cálculo raro', () => {
    assert.throws(() => M.calcularTasa(100000, 0), /mayor que cero/);
    assert.throws(() => M.calcularTasa(100000, -1), /negativo/);
    assert.throws(() => M.calcularTasa(-1, 100000), /negativo/);
    assert.throws(() => M.calcularCosto(0), /mayor que cero/);
  });

  test('los escalones viejos ya no existen ni por accidente', () => {
    assert.equal(M.ESCALONES_TASA, undefined);
    assert.equal(M.siguienteEscalon, undefined);
    assert.equal(M.calcularCobertura, undefined);
  });
});

/* ==========================================================================
 * §5 — calcularCupo
 * ======================================================================== */

describe('calcularCupo — LA GARANTÍA, UNO A UNO (5-ago-2026)', () => {

  /* Esta suite comprobaba los cuatro factores de nivel (1,5 · 2 · 2,5 · 3).
     Ya no hay factores: el cupo es la garantía y nada más, así que lo que
     comprueba ahora es justamente que el nivel NO lo mueva. */
  test('el mismo cupo en los cuatro niveles: el nivel ya no lo multiplica', () => {
    assert.equal(M.calcularCupo(500000, 'bronce'), 500000);
    assert.equal(M.calcularCupo(500000, 'plata'), 500000);
    assert.equal(M.calcularCupo(500000, 'oro'), 500000);
    assert.equal(M.calcularCupo(500000, 'platino'), 500000);
  });

  test('EL FACTOR DE CUPO NO EXISTE MÁS, ni como dato suelto', () => {
    assert.equal(M.FACTOR_CUPO, undefined,
      'exportarlo dejaría a una pantalla pintando "×2 tu garantía"');
  });

  test('puede pedir exactamente lo que respalda, ni un peso más', () => {
    assert.equal(M.calcularCupo(200000, 'bronce'), 200000);
    assert.equal(M.calcularCupo(115000, 'plata'), 115000);
  });

  test('sin garantía no hay cupo', () => {
    assert.equal(M.calcularCupo(0, 'platino'), 0);
  });

  test('redondea hacia abajo, nunca regala pesos (D8)', () => {
    assert.equal(M.calcularCupo(100001, 'plata'), 100001);
    assert.equal(M.calcularCupo(33333.75, 'oro'), 33333);
  });

  test('acepta el nivel con espacios o mayúsculas', () => {
    assert.equal(M.calcularCupo(100000, ' Oro '), 100000);
    assert.equal(M.calcularCupo(100000, 'PLATINO'), 100000);
  });

  test('un nivel inventado sigue siendo error, aunque ya no mueva el cupo', () => {
    assert.throws(() => M.calcularCupo(100000, 'diamante'), /nivel desconocido/);
    assert.throws(() => M.calcularCupo(100000, ''), /nivel desconocido/);
  });

  test('sin nivel funciona: el cupo no depende de él', () => {
    assert.equal(M.calcularCupo(100000), 100000);
    assert.equal(M.calcularCupo(100000, undefined), 100000);
  });

  test('EL SEGUNDO CRÉDITO DA 115.000 EXACTOS, que es el número que pidió Joan', () => {
    // Cupón lleno, 100.000 pedidos y pagados en fecha: 20.000 de costo, 15.000
    // de garantía. Con el factor de plata daba 230.000, y por eso el factor se fue.
    const gana = M.garantiaQueDejaUnCredito(100000, true);
    assert.equal(gana, 15000);
    assert.equal(M.calcularCupo(100000 + gana, 'plata'), 115000);
  });

  test('la plataforma llega hasta 20 millones y ahí se planta', () => {
    assert.equal(M.CUPO_MAXIMO, 20000000);
    assert.equal(M.calcularCupo(20000000, 'platino'), 20000000);
    assert.equal(M.calcularCupo(50000000, 'platino'), 20000000, 'no pasa del techo');
    assert.equal(M.calcularCupo(6000000, 'platino'), 6000000, 'debajo del techo, la fórmula manda');
  });
});

describe('proyeccionNiveles — qué se gana subiendo, ahora que no es cupo', () => {

  test('el cupo es el MISMO en los cuatro niveles', () => {
    const p = M.proyeccionNiveles(1000000, 'plata');
    assert.equal(p.length, 4);
    assert.deepEqual(p.map(x => x.cupo), [1000000, 1000000, 1000000, 1000000]);
    assert.deepEqual(p.map(x => x.nivel), ['bronce', 'plata', 'oro', 'platino']);
    assert.deepEqual(p.map(x => x.mueve_el_cupo), [false, false, false, false]);
  });

  test('`factor` ya no viaja: ninguna pantalla puede prometer un múltiplo', () => {
    M.proyeccionNiveles(1000000, 'plata').forEach(x => {
      assert.equal(x.factor, undefined);
    });
    M.reglasResumen().niveles.forEach(n => assert.equal(n.factor, undefined));
  });

  test('lo que sí cambia por nivel son las prórrogas', () => {
    const p = M.proyeccionNiveles(1000000, 'bronce');
    assert.equal(p[0].prorrogas, 1);
    assert.equal(p[3].prorrogas, 2);
    assert.ok(p[3].prorrogas > p[0].prorrogas, 'subir sirve para algo');
  });

  test('marca en cuál está parado y cuáles ya pasó', () => {
    const p = M.proyeccionNiveles(500000, 'oro');
    assert.deepEqual(p.map(x => x.actual), [false, false, true, false]);
    assert.deepEqual(p.map(x => x.alcanzado), [true, true, true, false]);
  });

  test('trae el requisito de cada nivel, para que el socio sepa qué le falta', () => {
    const p = M.proyeccionNiveles(100000);
    assert.equal(p[1].requisitos.pagos_a_tiempo, 2);
    assert.equal(p[2].requisitos.racha, 3);
    assert.equal(p[3].requisitos.meses_sin_mora, 3);
    assert.equal(p[0].prorrogas, 1);
    assert.equal(p[3].prorrogas, 2);
  });

  test('el camino a los 20 millones: la garantía que hace falta es el cupo mismo', () => {
    assert.equal(M.garantiaNecesariaPara(20000000, 'platino'), 20000000);
    assert.equal(M.garantiaNecesariaPara(20000000, 'bronce'), 20000000);
    assert.equal(M.garantiaNecesariaPara(1000000, 'oro'), 1000000);
    assert.equal(M.calcularCupo(M.garantiaNecesariaPara(20000000, 'platino'), 'platino'), 20000000);
  });
});

describe('el freno por ingreso viene APAGADO (5-ago-2026)', () => {

  test('la constante está en false, y eso es la decisión de Joan', () => {
    assert.equal(M.FRENO_INGRESO.activo, false);
    assert.equal(M.FRENO_INGRESO.fraccion_quincena, 0.30);
  });

  test('apagado no toca nada, tenga el socio el ingreso que tenga', () => {
    const r = M.frenarPorIngreso(1000000, { ingreso_quincenal: 100000 });
    assert.equal(r.cupo, 1000000);
    assert.equal(r.aplicado, false);
    assert.equal(r.activo, false);
    assert.equal(r.tope_por_ingreso, null);
  });

  test('encendido topa la cuota a la fracción de la quincena', () => {
    // Quincena de 2.000.000, fracción 0,30 → cuota máxima 600.000 → capital
    // 500.000, porque la cuota es capital + el 20% de costo.
    const r = M.frenarPorIngreso(1000000, { activo: true, ingreso_quincenal: 2000000 });
    assert.equal(r.tope_por_ingreso, 500000);
    assert.equal(r.cupo, 500000);
    assert.equal(r.aplicado, true);
    assert.equal(r.cuota_maxima, 600000);
    assert.ok(r.cuota_maxima <= 2000000 * 0.30);
  });

  test('encendido nunca SUBE un cupo: solo topa', () => {
    const r = M.frenarPorIngreso(100000, { activo: true, ingreso_quincenal: 5000000 });
    assert.equal(r.cupo, 100000);
    assert.equal(r.aplicado, false);
  });

  test('encendido pero sin ingreso declarado no topa: no se castiga al que no contestó', () => {
    const r = M.frenarPorIngreso(1000000, { activo: true });
    assert.equal(r.cupo, 1000000);
    assert.equal(r.tope_por_ingreso, null);
    assert.equal(M.cupoPorIngreso(0), null);
  });

  test('la fracción se puede mover desde Ajustes', () => {
    assert.equal(M.cupoPorIngreso(1200000, { fraccion_quincena: 0.50 }), 500000);
    assert.throws(() => M.cupoPorIngreso(1200000, { fraccion_quincena: 30 }), /decimal/);
  });

  test('EL FRENO EXISTE PORQUE EL 15% COMPONE: al crédito 24 la cuota es absurda', () => {
    let g = 100000, pide = 0, costo = 0;
    for (let i = 1; i <= 24; i++) {
      pide = M.calcularCupo(g, 'bronce');
      costo = M.calcularCosto(pide);
      g += M.garantiaQueDejaUnCredito(pide, true);
    }
    assert.equal(pide, 2489146);
    assert.equal(costo, 497829, 'solo el costo de la quincena');
    assert.equal(pide + costo, 2986975, 'la cuota entera');
    // Y con el freno encendido para una quincena de 3.000.000 no pasa de ahí.
    const r = M.frenarPorIngreso(pide, { activo: true, ingreso_quincenal: 3000000 });
    assert.equal(r.cupo, 750000);
    assert.equal(r.aplicado, true);
  });
});

/* ==========================================================================
 * §3 nuevo — la garantía se gana dato por dato (27-jul-2026)
 * ======================================================================== */

function datosCompletos() {
  const d = {};
  M.DATOS_KYC.forEach(x => { d[x.id] = x.tipo === 'si' ? true : 'algo'; });
  return d;
}

describe('garantiaPorDatos — el cupón se gana entregando información', () => {

  test('COMPLETAR TODO DA EXACTAMENTE 100.000', () => {
    const r = M.garantiaPorDatos(datosCompletos());
    assert.equal(r.total, 100000);
    assert.equal(r.total, M.CUPON_KYC_MAXIMO);
    assert.equal(r.porcentaje, 100);
    assert.equal(r.faltantes.length, 0);
    assert.equal(r.siguiente, null);
  });

  test('la suma de los 15 datos da 100.000, ni uno de más ni de menos', () => {
    const suma = M.DATOS_KYC.reduce((t, d) => t + d.valor, 0);
    assert.equal(suma, 100000);
    assert.equal(M.DATOS_KYC.length, 15);
  });

  test('sin dar nada, no hay cupón', () => {
    const r = M.garantiaPorDatos({});
    assert.equal(r.total, 0);
    assert.equal(r.porcentaje, 0);
    assert.equal(r.completos.length, 0);
    assert.equal(r.faltantes.length, 15);
  });

  test('cada dato que entrega le sube la garantía, uno por uno', () => {
    const d = {};
    let anterior = 0;
    M.DATOS_KYC.forEach(x => {
      d[x.id] = x.tipo === 'si' ? true : 'algo';
      const r = M.garantiaPorDatos(d);
      assert.ok(r.total > anterior, 'el dato ' + x.id + ' no sumó nada');
      assert.equal(r.total - anterior, x.valor, 'el dato ' + x.id + ' sumó distinto de lo que dice');
      anterior = r.total;
    });
    assert.equal(anterior, 100000);
  });

  test('le sugiere primero el dato que más garantía le suelta', () => {
    const r = M.garantiaPorDatos({});
    assert.equal(r.siguiente.id, 'foto_selfie');
    assert.equal(r.siguiente.valor, 18000);
  });

  test('un dato vacío o en blanco no cuenta como entregado', () => {
    assert.equal(M.garantiaPorDatos({ nombre: '' }).total, 0);
    assert.equal(M.garantiaPorDatos({ nombre: '   ' }).total, 0);
    assert.equal(M.garantiaPorDatos({ nombre: null }).total, 0);
    assert.equal(M.garantiaPorDatos({ whatsapp: false }).total, 0);
    assert.equal(M.garantiaPorDatos({ nombre: 'Ana' }).total, 5000);
  });

  test('la selfie y las fotos son lo que más pesa, que es lo que más baja el riesgo', () => {
    const porId = {};
    M.DATOS_KYC.forEach(d => { porId[d.id] = d.valor; });
    assert.ok(porId.foto_selfie > porId.referencia);
    assert.ok(porId.foto_cedula_frente > porId.correo);
    assert.ok(porId.referencia > porId.celular2);
  });

  test('entradas raras no rompen', () => {
    assert.equal(M.garantiaPorDatos(null).total, 0);
    assert.equal(M.garantiaPorDatos(undefined).total, 0);
    assert.throws(() => M.garantiaPorDatos('hola'), /se esperaba un objeto/);
  });
});

describe('garantiaPorReferidos — 5.000, pero solo si el referido paga', () => {

  test('un referido que ya pagó suma 5.000', () => {
    assert.equal(M.garantiaPorReferidos([{ nombre: 'Luis', pago_puntual: true }]), 5000);
    assert.equal(M.GARANTIA_POR_REFERIDO, 5000);
  });

  test('EL REFERIDO QUE NO HA PAGADO NO SUMA NADA', () => {
    assert.equal(M.garantiaPorReferidos([{ nombre: 'Luis', pago_puntual: false }]), 0);
    assert.equal(M.garantiaPorReferidos([{ nombre: 'Luis' }]), 0);
    assert.equal(M.garantiaPorReferidos([{}, {}, {}]), 0);
  });

  test('cuenta solo los que pagaron, de una lista mezclada', () => {
    const lista = [
      { nombre: 'A', pago_puntual: true }, { nombre: 'B', pago_puntual: false },
      { nombre: 'C', pago_puntual: true }, { nombre: 'D' }
    ];
    assert.equal(M.garantiaPorReferidos(lista), 10000);
  });

  test('traer diez que pagan son 50.000', () => {
    const diez = Array.from({ length: 10 }, (_, i) => ({ nombre: 'R' + i, pago_puntual: true }));
    assert.equal(M.garantiaPorReferidos(diez), 50000);
  });

  test('también acepta que le pasen el número de los que ya pagaron', () => {
    assert.equal(M.garantiaPorReferidos(3), 15000);
    assert.equal(M.garantiaPorReferidos(0), 0);
  });

  test('sin referidos, cero', () => {
    assert.equal(M.garantiaPorReferidos([]), 0);
    assert.equal(M.garantiaPorReferidos(null), 0);
    assert.equal(M.garantiaPorReferidos(undefined), 0);
    assert.throws(() => M.garantiaPorReferidos('dos'), /se esperaba una lista/);
  });
});

describe('garantiaTotal — de dónde sale cada peso', () => {

  test('suma las tres fuentes y las deja separadas', () => {
    /* 6-ago-2026: la ficha va A MEDIAS a propósito. Con la ficha completa el
       cupón ya ocupa todo el techo de la garantía prestada y los referidos no
       tienen dónde entrar (ver el tope, más abajo): este caso mide que las tres
       fuentes se sumen y se muestren por separado, así que necesita el hueco. */
    const g = M.garantiaTotal({
      datos: { nombre: 'Ana', cedula: '123', celular: '300' },   // 18.000
      referidos: [{ pago_puntual: true }, { pago_puntual: true }],
      acumulada: 300000
    });
    assert.deepEqual(g, { cupon: 18000, referidos: 10000, acumulada: 300000, ajuste: 0, total: 328000 });
  });

  test('el socio recién llegado que no ha dado nada arranca en cero', () => {
    assert.equal(M.garantiaTotal({}).total, 0);
  });

  test('el que llena todo el perfil ya puede pedir sin haber pagado nunca', () => {
    const g = M.garantiaTotal({ datos: datosCompletos() });
    assert.equal(g.total, 100000);
    // 5-ago-2026: el cupo es la garantía uno a uno. Con la ficha completa el
    // socio arranca con 100.000 —"todos inician con 100.000", dijo Joan— y no
    // con los 150.000 que le regalaba el factor de bronce.
    assert.equal(M.calcularCupo(g.total, 'bronce'), 100000);
  });

  test('AJUSTE DE MIGRACIÓN: Joan puede reconocerle de más a un cliente viejo (§13)', () => {
    const g = M.garantiaTotal({ acumulada: 100000, ajuste: 250000 });
    assert.equal(g.ajuste, 250000);
    assert.equal(g.total, 350000);
  });

  test('el ajuste también puede restar, si el cálculo quedó generoso', () => {
    const g = M.garantiaTotal({ acumulada: 300000, ajuste: -100000 });
    assert.equal(g.total, 200000);
  });

  test('pero la garantía nunca queda negativa por un ajuste', () => {
    const g = M.garantiaTotal({ acumulada: 50000, ajuste: -900000 });
    assert.equal(g.total, 0);
    assert.equal(g.ajuste, -900000, 'el ajuste queda registrado tal cual, para poder auditarlo');
  });

  test('sin ajuste, todo sigue igual que antes', () => {
    const sin = M.garantiaTotal({ datos: datosCompletos(), acumulada: 100000 });
    const cero = M.garantiaTotal({ datos: datosCompletos(), acumulada: 100000, ajuste: 0 });
    assert.equal(sin.total, cero.total);
    assert.equal(sin.ajuste, 0);
  });

  test('un ajuste que no es número es error, no un cero silencioso', () => {
    assert.throws(() => M.garantiaTotal({ ajuste: 'mucho' }), /se esperaba un número/);
  });
});

/* ==========================================================================
 * §4 — acumularGarantia
 * ======================================================================== */

describe('acumularGarantia — todo suma, y en fecha suma el doble (29-jul-2026)', () => {

  /* 5-ago-2026: el factor pasó de 0,90 a 0,75. El otro 25% no se pierde —es el
     10% operativo y el 15% que amortiza el cupón regalado (repartirCosto)— y la
     regla de la puntualidad no se movió: en fecha completo, tarde la mitad. */
  test('PAGANDO EN FECHA: cada peso de costo deja 75 centavos de cupo', () => {
    assert.equal(M.FACTOR_GARANTIA, 0.75);
    assert.equal(M.acumularGarantia(20000, true), 15000);
    assert.equal(M.acumularGarantia(100000, true), 75000);
    assert.equal(M.acumularGarantia(20000), 15000, 'sin el flag se asume puntual');
  });

  test('PAGANDO TARDE sigue sumando, pero la mitad', () => {
    assert.equal(M.FACTOR_GARANTIA_MORA, 0.375);
    assert.equal(M.acumularGarantia(20000, false), 7500);
    assert.equal(M.acumularGarantia(5000000, false), 1875000);
  });

  test('nadie deja de sumar: la mora no congela ni resta', () => {
    for (const costo of [999, 20000, 123456]) {
      assert.ok(M.acumularGarantia(costo, false) > 0, 'el atrasado igual suma');
      assert.ok(M.acumularGarantia(costo, false) < M.acumularGarantia(costo, true),
        'pero menos que el puntual');
    }
    // con un peso de costo el 45% redondea a cero; el puntual se lleva ese peso
    assert.equal(M.acumularGarantia(1, false), 0);
  });

  test('el puntual acumula el doble que el atrasado, salvo el medio peso del redondeo', () => {
    for (const costo of [20000, 100000]) {
      assert.equal(M.acumularGarantia(costo, true), M.acumularGarantia(costo, false) * 2);
    }
    /* 5-ago-2026 — con el factor en 0,375 hay costos donde la mitad cae justo en
       el medio peso y redondea para arriba: 456.780 deja 342.585 en fecha y
       171.293 tarde, o sea 342.586 al duplicarlo. Un peso a favor del socio y
       nada más; lo que la regla promete es la mitad, no una identidad exacta. */
    for (const costo of [456780, 3, 7, 13, 99, 101, 12345, 999999]) {
      const dif = M.acumularGarantia(costo, false) * 2 - M.acumularGarantia(costo, true);
      assert.ok(Math.abs(dif) <= 1, costo + ' se desvió ' + dif + ' pesos');
    }
  });

  test('nunca devuelve negativo', () => {
    for (const costo of [0, 1, 999, 123456]) {
      assert.ok(M.acumularGarantia(costo) >= 0);
      assert.ok(M.acumularGarantia(costo, false) >= 0);
    }
  });

  test('redondea al peso', () => {
    assert.equal(M.acumularGarantia(15001, false), 5625);   // 5.625,375 → 5.625
    assert.equal(M.acumularGarantia(5, false), 2);          // 1,875 → 2
    assert.equal(M.acumularGarantia(1, false), 0);          // 0,375 → 0
  });

  test('costo cero acumula cero', () => {
    assert.equal(M.acumularGarantia(0, true), 0);
    assert.equal(M.acumularGarantia(0, false), 0);
  });

  test('acumula sobre el costo, no sobre el total del crédito', () => {
    const capital = 300000;
    const costo = M.calcularCosto(capital);
    assert.equal(costo, 60000);
    assert.equal(M.acumularGarantia(costo, true), 45000);
    // Y el 15% del capital, que es la misma cuenta dicha como la dice Joan.
    assert.equal(M.garantiaQueDejaUnCredito(capital, true), 45000);
  });

  test('si se pasa el flag, tiene que ser booleano de verdad', () => {
    assert.throws(() => M.acumularGarantia(20000, 'si'), /true o false/);
    assert.throws(() => M.acumularGarantia(20000, 1), /true o false/);
    assert.doesNotThrow(() => M.acumularGarantia(20000));
    assert.throws(() => M.acumularGarantia(-100), /negativo/);
  });
});

/* ==========================================================================
 * Mora — 1% diario (cambio 26-jul-2026) y tramos del §9
 * ======================================================================== */

describe('recargoPorMora — 1% diario simple sobre el capital', () => {

  test('un día de mora cuesta el 1% del capital', () => {
    assert.equal(M.recargoPorMora(300000, 1), 3000);
  });

  test('es simple, no compuesto: 10 días = 10%', () => {
    assert.equal(M.recargoPorMora(300000, 10), 30000);
    assert.equal(M.recargoPorMora(300000, 10), M.recargoPorMora(300000, 1) * 10);
  });

  test('sin mora no hay recargo, y los días negativos tampoco cobran', () => {
    assert.equal(M.recargoPorMora(300000, 0), 0);
    assert.equal(M.recargoPorMora(300000, -4), 0);
  });

  test('a los 100 días el recargo ya pasó al capital (por eso conviene un tope)', () => {
    assert.equal(M.recargoPorMora(300000, 100), 300000);
    assert.equal(M.recargoPorMora(300000, 100, { topeDias: 90 }), 270000);
  });

  test('se puede cambiar la tasa diaria desde arriba', () => {
    assert.equal(M.recargoPorMora(300000, 10, { tasaDiaria: 0.005 }), 15000);
  });

  test('redondea al peso', () => {
    assert.equal(M.recargoPorMora(33333, 1), 333);          // 333,33
  });

  test('entradas inválidas', () => {
    assert.throws(() => M.recargoPorMora(-1, 5), /negativo/);
    assert.throws(() => M.recargoPorMora(300000, 'cinco'), /se esperaba un número/);
  });
});

describe('tramoDeMora — §9', () => {

  test('los seis tramos por sus bordes exactos', () => {
    const t = d => M.tramoDeMora(d).tramo;
    assert.equal(t(-30), 'vigente');
    assert.equal(t(-3), 'vigente');
    assert.equal(t(-2), 'preventivo');   // recordatorio a -2 días
    assert.equal(t(0), 'preventivo');
    assert.equal(t(1), 'D1');
    assert.equal(t(5), 'D1');
    assert.equal(t(6), 'D2');
    assert.equal(t(15), 'D2');
    assert.equal(t(16), 'M1');
    assert.equal(t(45), 'M1');
    assert.equal(t(46), 'M2');
    assert.equal(t(89), 'M2');
    assert.equal(t(90), 'castigo');      // D11: el 90 es castigo, no M2
    assert.equal(t(500), 'castigo');
  });

  test('trae la acción y el canal del documento', () => {
    assert.equal(M.tramoDeMora(3).canal, 'WhatsApp');
    assert.match(M.tramoDeMora(10).accion, /plan de pagos/);
    assert.equal(M.tramoDeMora(20).canal, 'llamada');
  });

  test('los tramos cubren toda la recta, sin huecos ni solapes', () => {
    for (let d = -10; d <= 120; d++) {
      const t = M.tramoDeMora(d);
      assert.ok(d >= t.desde && d <= t.hasta, `día ${d} cayó en ${t.tramo}`);
    }
    // Contiguos: donde termina uno arranca el siguiente, ni un día de más.
    for (let i = 1; i < M.TRAMOS_MORA.length; i++) {
      assert.equal(M.TRAMOS_MORA[i].desde, M.TRAMOS_MORA[i - 1].hasta + 1,
        `${M.TRAMOS_MORA[i - 1].tramo} y ${M.TRAMOS_MORA[i].tramo} no pegan`);
    }
  });
});

describe('liquidarCredito — cuánto paga y cuánta garantía deja', () => {

  test('pago puntual: sin recargo, y el 75% del costo se vuelve garantía', () => {
    const l = M.liquidarCredito(creditoBase(), '2026-07-15');
    assert.equal(l.dias_mora, 0);
    assert.equal(l.pago_a_tiempo, true);
    assert.equal(l.recargo_mora, 0);
    assert.equal(l.total_a_pagar, 360000);
    assert.equal(l.garantia_generada, 45000);   // 75% de 60.000
    assert.equal(l.tramo, 'preventivo');
  });

  test('pagar antes del corte no cobra mora ni acumula menos', () => {
    const l = M.liquidarCredito(creditoBase(), '2026-07-08');
    assert.equal(l.dias_mora, 0);
    assert.equal(l.recargo_mora, 0);
    assert.equal(l.garantia_generada, 45000);
    assert.equal(l.tramo, 'vigente');
  });

  test('10 días de mora: paga el 1% diario y eso también suma, al 50%', () => {
    const l = M.liquidarCredito(creditoBase(), '2026-07-25');
    assert.equal(l.dias_mora, 10);
    assert.equal(l.recargo_mora, 30000);           // 300.000 × 1% × 10
    assert.equal(l.costo_total_pagado, 90000);     // 60.000 + 30.000
    assert.equal(l.total_a_pagar, 390000);
    assert.equal(l.garantia_generada, 33750);      // 37,5% de 90.000
    assert.equal(l.tramo, 'D2');
  });

  const enDias = d => {
    const f = new Date(2026, 6, 15 + d);
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
  };

  test('EL BUG QUE SE ARREGLÓ: en el atraso normal ya no acumula más que el puntual', () => {
    const puntual = M.liquidarCredito(creditoBase(), '2026-07-15');
    // 1 a 20 días es donde de verdad se atrasa la gente (tramos D1, D2 y M1).
    for (let d = 1; d <= 20; d++) {
      const tarde = M.liquidarCredito(creditoBase(), enDias(d));
      assert.ok(tarde.garantia_generada <= puntual.garantia_generada,
        'a ' + d + ' días acumula ' + tarde.garantia_generada + ' vs ' + puntual.garantia_generada);
      assert.ok(tarde.total_a_pagar > puntual.total_a_pagar, 'y paga más plata');
    }
  });

  test('el punto de equilibrio está en los 20 días, y es a propósito', () => {
    // Con costo 20% y mora 1% diario, el recargo iguala al costo a los 20 días.
    // Desde ahí el atrasado vuelve a acumular más — pero ya pagó el doble.
    const puntual = M.liquidarCredito(creditoBase(), '2026-07-15');
    assert.equal(M.liquidarCredito(creditoBase(), enDias(20)).garantia_generada, puntual.garantia_generada);
    assert.ok(M.liquidarCredito(creditoBase(), enDias(21)).garantia_generada > puntual.garantia_generada);
    // Y a esa altura le costó bastante más plata que pagar en fecha.
    assert.ok(M.liquidarCredito(creditoBase(), enDias(21)).total_a_pagar > puntual.total_a_pagar * 1.15);
  });

  test('le dice cuánto habría ganado pagando en fecha, para poder mostrárselo', () => {
    const l = M.liquidarCredito(creditoBase(), '2026-07-25');
    assert.equal(l.garantia_si_puntual, 45000);
    assert.ok(l.garantia_si_puntual > l.garantia_generada);
  });

  test('la mora corre sobre el capital, no sobre el total (D9)', () => {
    const l = M.liquidarCredito(creditoBase(), '2026-07-25');
    assert.equal(l.base_mora, 300000);
    const otra = M.liquidarCredito(creditoBase(), '2026-07-25', { baseMora: 360000 });
    assert.equal(otra.recargo_mora, 36000);
  });

  test('a 31 días paga mucho más y aun así acumula menos que el puntual', () => {
    const aTiempo = M.liquidarCredito(creditoBase(), '2026-07-15');
    const tarde = M.liquidarCredito(creditoBase(), '2026-08-15');
    assert.equal(tarde.dias_mora, 31);
    assert.equal(tarde.recargo_mora, 93000);
    assert.equal(tarde.garantia_generada, 57375);  // 37,5% de (60.000 + 93.000)
    assert.ok(tarde.total_a_pagar > aTiempo.total_a_pagar * 1.25, 'le costó bastante más');
    assert.ok(tarde.garantia_generada > aTiempo.garantia_generada,
      'con 31 días de recargo sí lo pasa: el bono es del 50%, no un bloqueo');
  });

  test('marca cuándo se cruzó el umbral de castigo de 90 días (§6)', () => {
    const dia89 = M.liquidarCredito(creditoBase(), '2026-10-12');
    assert.equal(dia89.dias_mora, 89);
    assert.equal(dia89.tramo, 'M2');
    assert.equal(dia89.supera_dias_castigo, false);

    const dia90 = M.liquidarCredito(creditoBase(), '2026-10-13');
    assert.equal(dia90.dias_mora, 90);
    assert.equal(dia90.tramo, 'castigo');
    assert.equal(dia90.supera_dias_castigo, true);
  });

  test('si el crédito no trae costo, lo deduce de la tasa', () => {
    const c = creditoBase();
    delete c.costo;
    const l = M.liquidarCredito(c, '2026-07-15');
    assert.equal(l.costo, 60000);
  });

  test('entradas inválidas', () => {
    assert.throws(() => M.liquidarCredito(null, '2026-07-15'), /objeto del crédito/);
    assert.throws(() => M.liquidarCredito(creditoBase(), 'pasado mañana'), /YYYY-MM-DD/);
  });
});

/* ==========================================================================
 * Calculadora: qué paga con garantía y qué pagaría sin ella
 * ======================================================================== */

describe('simularCredito — con precio fijo, la pregunta es el CUPO', () => {

  test('el costo es el 20%, tenga la garantía que tenga', () => {
    const sin = M.simularCredito(500000, 0);
    const con = M.simularCredito(500000, 5000000, { nivelSocio: 'platino' });
    assert.equal(sin.costo, 100000);
    assert.equal(con.costo, 100000);
    assert.equal(sin.total_a_pagar, 600000);
    assert.equal(con.total_a_pagar, 600000);
  });

  test('LO QUE CAMBIA ES SI LE ALCANZA EL CUPO', () => {
    // 5-ago-2026: el cupo es la garantía uno a uno, así que con 250.000 de
    // garantía puede pedir 250.000 —antes bronce le abría 375.000—.
    const alcanza = M.simularCredito(250000, 250000, { nivelSocio: 'bronce' });
    assert.equal(alcanza.cupo, 250000);
    assert.equal(alcanza.dentro_del_cupo, true);
    assert.equal(alcanza.falta_garantia, 0);

    const no = M.simularCredito(300000, 250000, { nivelSocio: 'bronce' });
    assert.equal(no.dentro_del_cupo, false, 'un peso de más que su garantía ya no entra');
    assert.equal(no.falta_garantia, 50000);
  });

  test('dice cuánta garantía le falta para poder pedir ese monto', () => {
    const s = M.simularCredito(1000000, 250000, { nivelSocio: 'bronce' });
    assert.equal(s.garantia_necesaria, M.garantiaNecesariaPara(1000000, 'bronce'));
    assert.equal(s.garantia_necesaria, 1000000, 'lo que hace falta es el monto mismo');
    assert.equal(s.falta_garantia, 1000000 - 250000);
    // y con esa garantía, efectivamente le alcanza
    assert.equal(M.simularCredito(1000000, s.garantia_necesaria, { nivelSocio: 'bronce' }).dentro_del_cupo, true);
  });

  /* Esta prueba comprobaba que "el mismo monto le alcanza antes si sube de
     nivel". Ya no es verdad y era justamente lo que Joan mandó derogar: lo que
     comprueba ahora es que el nivel NO adelante nada. Lo único que adelanta el
     cupo es pagar. */
  test('subir de nivel NO le alcanza para pedir más: solo pagar lo hace', () => {
    const bronce = M.simularCredito(1000000, 400000, { nivelSocio: 'bronce' });
    const oro = M.simularCredito(1000000, 400000, { nivelSocio: 'oro' });
    assert.equal(bronce.dentro_del_cupo, false);
    assert.equal(oro.dentro_del_cupo, false, 'oro no le abre ni un peso más');
    assert.equal(oro.cupo, bronce.cupo);
    assert.equal(oro.falta_garantia, bronce.falta_garantia);
    // Con la garantía ganada sí: 1.000.000 pagados le dejan 150.000 de cupo nuevo.
    assert.equal(bronce.garantia_que_deja, 150000);
  });

  test('muestra cuánta garantía le deja y a cuánto le sube el cupo', () => {
    const s = M.simularCredito(500000, 250000, { nivelSocio: 'bronce' });
    assert.equal(s.garantia_que_deja, 75000);         // el 15% del capital
    assert.equal(s.garantia_despues, 325000);
    assert.equal(s.cupo_despues, 325000);
    assert.ok(s.cupo_despues > s.cupo, 'el cupo sube por pagar');
  });

  test('ya no hay comparación de tasas que mostrar', () => {
    const s = M.simularCredito(500000, 250000);
    assert.equal(s.ahorro, undefined);
    assert.equal(s.sin_garantia, undefined);
    assert.equal(s.siguiente_escalon, undefined);
    assert.equal(s.cubierto, undefined);
  });

  test('puede calcular también la fecha de pago', () => {
    const s = M.simularCredito(300000, 0, { fechaDesembolso: '2026-07-01' });
    assert.equal(s.fecha_corte, '2026-07-15');
  });

  test('sirve para montos grandes, hasta el techo de la plataforma', () => {
    const s = M.simularCredito(20000000, 40000000, { nivelSocio: 'platino' });
    assert.equal(s.costo, 4000000);
    assert.equal(s.total_a_pagar, 24000000);
    assert.equal(s.cupo, M.CUPO_MAXIMO);
    assert.equal(s.dentro_del_cupo, true);
  });

  test('un monto de cero o negativo es error, no un cálculo raro', () => {
    assert.throws(() => M.simularCredito(0, 100000), /mayor que cero/);
    assert.throws(() => M.simularCredito(-5, 100000), /negativo/);
  });
});

describe('proyectarCrecimiento — cómo sube la garantía crédito a crédito', () => {

  test('cada vuelta suma garantía y sube el cupo', () => {
    const p = M.proyectarCrecimiento(200000, 300000, 5, 'bronce');
    assert.equal(p.length, 5);
    for (let i = 1; i < p.length; i++) {
      assert.ok(p[i].garantia > p[i - 1].garantia, 'la garantía sube en la vuelta ' + i);
      assert.ok(p[i].cupo >= p[i - 1].cupo);
    }
  });

  test('LA ESCALERA DE VERDAD: pidiendo todo el cupo cada vuelta', () => {
    const p = M.proyectarCrecimiento(200000, 200000, 6, 'bronce', { pideElCupo: true });
    assert.equal(p[0].capital, 200000, 'pide su cupo, que ahora es su garantía');
    for (let i = 1; i < p.length; i++) {
      assert.ok(p[i].capital > p[i - 1].capital, 'cada vuelta puede pedir más');
    }
    // Un 15% por vuelta duplica en cinco: a la sexta está arriba del doble.
    assert.ok(p[5].cupo > p[0].cupo * 2, 'a la sexta vuelta el cupo se duplicó');
  });

  test('LA ESCALERA DE LA WEB PÚBLICA, PESO A PESO (5-ago-2026)', () => {
    /* La tabla que Joan fijó y que index.html tiene que mostrar. Arranca con el
       cupón de 100.000 completo y paga todo en fecha. Si un solo peso de esta
       tabla se mueve, la web pública queda prometiendo algo que el motor no da. */
    const p = M.proyectarCrecimiento(100000, 100000, 5, 'bronce', { pideElCupo: true });
    const esperado = [
      { capital: 100000, costo: 20000, gana: 15000, garantia: 115000 },
      { capital: 115000, costo: 23000, gana: 17250, garantia: 132250 },
      { capital: 132250, costo: 26450, gana: 19838, garantia: 152088 },
      { capital: 152088, costo: 30418, gana: 22813, garantia: 174901 },
      { capital: 174901, costo: 34980, gana: 26235, garantia: 201136 }
    ];
    p.forEach((paso, i) => {
      assert.equal(paso.capital, esperado[i].capital, 'pide, crédito ' + (i + 1));
      assert.equal(paso.costo, esperado[i].costo, 'costo, crédito ' + (i + 1));
      assert.equal(paso.garantia_ganada, esperado[i].gana, '+garantía, crédito ' + (i + 1));
      assert.equal(paso.garantia, esperado[i].garantia, 'garantía total, crédito ' + (i + 1));
      assert.equal(paso.cupo, esperado[i].garantia, 'ya puede pedir, crédito ' + (i + 1));
    });
    // Y la regla en una frase: el cupo se duplica en cinco créditos.
    assert.ok(p[4].cupo >= 200000);
  });

  test('EL SEGUNDO CRÉDITO DA 115.000, no 230.000', () => {
    const p = M.proyectarCrecimiento(100000, 100000, 2, 'bronce', { pideElCupo: true });
    assert.equal(p[0].cupo, 115000, 'el número con el que Joan pidió el cambio');
    assert.equal(p[1].capital, 115000);
  });

  test('sin pedir el cupo, repite el mismo monto y aun así crece', () => {
    const p = M.proyectarCrecimiento(200000, 300000, 6, 'bronce');
    assert.ok(p.every(x => x.capital === 300000));
    assert.ok(p[5].garantia > p[0].garantia);
  });

  test('la primera vuelta coincide con lo que dice la calculadora', () => {
    const s = M.simularCredito(300000, 200000, { nivelSocio: 'bronce' });
    const p = M.proyectarCrecimiento(200000, 300000, 1, 'bronce')[0];
    assert.equal(p.costo, s.costo);
    assert.equal(p.garantia_ganada, s.garantia_que_deja);
    assert.equal(p.garantia, s.garantia_despues);
    assert.equal(p.cupo, s.cupo_despues);
  });

  test('EL PESO DEL DOBLE REDONDEO: la escalera y el cobro real se rozan en 1', () => {
    /* La escalera promete el 15% del capital en un solo redondeo; lo que se
       acredita el día del cobro sale del costo YA redondeado, y eso puede
       desviarse un peso (152.088 → 22.813 prometidos, 22.814 cobrados). Queda
       escrito como decisión y no como sorpresa: la escalera es la promesa, el
       cobro es la plata, y la diferencia nunca pasa de un peso. */
    for (const cap of [100000, 115000, 132250, 152088, 174901, 17, 99999, 1234567]) {
      const prometido = M.garantiaQueDejaUnCredito(cap, true);
      const cobrado = M.acumularGarantia(M.calcularCosto(cap), true);
      assert.ok(Math.abs(prometido - cobrado) <= 1,
        cap + ': la escalera dice ' + prometido + ' y el cobro deja ' + cobrado);
    }
  });

  test('cero vueltas devuelve una lista vacía, sin reventar', () => {
    assert.deepEqual(M.proyectarCrecimiento(100000, 100000, 0), []);
  });
});

/* ==========================================================================
 * §5 — evaluarNivel
 * ======================================================================== */

describe('evaluarNivel — escalera de socio (§5)', () => {

  test('socio nuevo: bronce', () => {
    assert.equal(M.evaluarNivel(0, 0, 0), 'bronce');
    assert.equal(M.evaluarNivel(1, 1, 24), 'bronce'); // le falta 1 pago para plata
  });

  test('plata a los 2 pagos puntuales', () => {
    assert.equal(M.evaluarNivel(2, 0, 0), 'plata');
    assert.equal(M.evaluarNivel(2, 2, 0), 'plata');
    assert.equal(M.evaluarNivel(4, 20, 20), 'plata'); // le falta 1 pago para oro
  });

  test('oro pide 5 pagos Y racha ≥ 3', () => {
    assert.equal(M.evaluarNivel(5, 3, 0), 'oro');
    assert.equal(M.evaluarNivel(5, 2, 0), 'plata');   // racha corta
    assert.equal(M.evaluarNivel(9, 9, 5), 'oro');     // le falta 1 pago para platino
  });

  test('platino pide 10 pagos Y 3 meses sin mora', () => {
    assert.equal(M.evaluarNivel(10, 10, 3), 'platino');
    assert.equal(M.evaluarNivel(10, 10, 2), 'oro');   // 2 meses no alcanza
    assert.equal(M.evaluarNivel(100, 100, 60), 'platino');
  });

  test('platino se evalúa literal, sin exigir la racha de oro (D4)', () => {
    assert.equal(M.evaluarNivel(10, 1, 3), 'platino');
  });

  test('EL NIVEL NUNCA BAJA: el 4º parámetro es el piso (27-jul-2026)', () => {
    // Sin piso, la racha en 0 derivaría plata. Con el nivel ya alcanzado, se queda en oro.
    assert.equal(M.evaluarNivel(6, 4, 1), 'oro');
    assert.equal(M.evaluarNivel(6, 0, 0), 'plata');
    assert.equal(M.evaluarNivel(6, 0, 0, 'oro'), 'oro');
    assert.equal(M.evaluarNivel(0, 0, 0, 'platino'), 'platino');
  });

  test('el piso no impide seguir subiendo', () => {
    assert.equal(M.evaluarNivel(10, 10, 3, 'plata'), 'platino');
    assert.equal(M.evaluarNivel(5, 3, 0, 'bronce'), 'oro');
  });

  test('ningún socio pierde nivel por más moras que acumule', () => {
    let nivel = 'bronce';
    // Sube a oro pagando puntual...
    nivel = M.evaluarNivel(5, 3, 0, nivel);
    assert.equal(nivel, 'oro');
    // ...y después se atrasa una y otra vez: la racha se cae, el nivel no.
    for (let i = 0; i < 5; i++) {
      nivel = M.evaluarNivel(5, 0, 0, nivel);
      assert.equal(nivel, 'oro');
    }
  });

  test('un piso inventado es error', () => {
    assert.throws(() => M.evaluarNivel(3, 0, 0, 'diamante'), /nivel desconocido/);
  });

  test('bordes exactos de cada requisito', () => {
    assert.equal(M.evaluarNivel(1, 99, 99), 'bronce');
    assert.equal(M.evaluarNivel(2, 99, 0), 'plata');
    assert.equal(M.evaluarNivel(4, 3, 0), 'plata');
    assert.equal(M.evaluarNivel(5, 3, 0), 'oro');
    assert.equal(M.evaluarNivel(9, 3, 99), 'oro');
    assert.equal(M.evaluarNivel(10, 3, 3), 'platino');
  });

  test('siempre devuelve un nivel de la tabla', () => {
    for (let p = 0; p <= 25; p++) {
      for (let r = 0; r <= 6; r += 2) {
        assert.ok(M.NIVELES.includes(M.evaluarNivel(p, r, p > 5 ? 8 : 0)));
      }
    }
  });

  test('contadores inválidos son error', () => {
    assert.throws(() => M.evaluarNivel(-1, 0, 0), /negativo/);
    assert.throws(() => M.evaluarNivel(2.5, 0, 0), /entero/);
    assert.throws(() => M.evaluarNivel('3', 0, 0), /se esperaba un número/);
  });
});

/* ==========================================================================
 * La mora no castiga (27-jul-2026)
 * ======================================================================== */

describe('puedeSolicitar — "así pagues en mora, Joan siempre te va a prestar"', () => {

  test('estar en mora NO bloquea pedir otro crédito (deroga el §9)', () => {
    const r = M.puedeSolicitar({ nivel_kyc: 1, estado: 'en_mora', garantia_total: 200000, nivel_socio: 'plata' });
    assert.equal(r.ok, true);
    assert.equal(r.motivo, null);
    assert.equal(r.cupo, 200000);   // su garantía, uno a uno (5-ago-2026)
  });

  test('el socio al día también, obvio', () => {
    assert.equal(M.puedeSolicitar({ nivel_kyc: 2, garantia_total: 100000 }).ok, true);
  });

  test('lo único que frena: sin KYC, o suspendido por no haber abonado nada', () => {
    assert.deepEqual(
      M.puedeSolicitar({ nivel_kyc: 0, garantia_total: 500000 }),
      { ok: false, motivo: 'kyc_incompleto', cupo: 0 });
    assert.equal(M.puedeSolicitar({ nivel_kyc: 3, estado: 'suspendido', garantia_total: 500000 }).motivo,
      'castigo_sin_abonos');
  });

  /* Se llamaba "el cupo que devuelve es el del nivel alcanzado" y comprobaba el
     ×2,5 de oro. Ahora comprueba lo contrario, que es la regla nueva: el cupo
     que devuelve es la garantía, y el nivel no lo toca. */
  test('el cupo que devuelve es la garantía, en cualquier nivel', () => {
    const oro = M.puedeSolicitar({ nivel_kyc: 1, garantia_total: 400000, nivel_socio: 'oro' });
    const bronce = M.puedeSolicitar({ nivel_kyc: 1, garantia_total: 400000, nivel_socio: 'bronce' });
    assert.equal(oro.cupo, 400000);
    assert.equal(bronce.cupo, 400000);
  });
});

describe('evaluarCastigo — solo para el que no ha abonado nada', () => {

  const enMora = extra => Object.assign({ capital: 300000, fecha_corte: '2026-07-15', abonado: 0 }, extra);

  test('a los 90 días sin un solo abono: suspendido, pero la garantía se CONGELA, no se borra', () => {
    const r = M.evaluarCastigo(enMora(), '2026-10-13');
    assert.equal(r.dias_mora, 90);
    assert.equal(r.castigado, true);
    assert.equal(r.garantia, 'congelada');
    assert.notEqual(r.garantia, 'a_cero');
    assert.equal(r.estado_sugerido, 'suspendido');
  });

  test('con un abono, por chico y tardío que sea, NO se castiga nunca', () => {
    const r = M.evaluarCastigo(enMora({ abonado: 10000 }), '2026-12-31');
    assert.equal(r.dias_mora, 169);
    assert.equal(r.castigado, false);
    assert.equal(r.garantia, 'activa');
    assert.match(r.motivo, /ha abonado/);
  });

  test('antes de los 90 días no hay castigo aunque no haya abonado', () => {
    const r = M.evaluarCastigo(enMora(), '2026-10-12'); // 89 días
    assert.equal(r.castigado, false);
    assert.equal(r.estado_sugerido, 'en_mora');
  });

  test('al día: ni mora ni castigo', () => {
    const r = M.evaluarCastigo(enMora(), '2026-07-15');
    assert.equal(r.dias_mora, 0);
    assert.equal(r.castigado, false);
    assert.equal(r.estado_sugerido, 'vigente');
  });

  test('el umbral de días se puede mover desde arriba', () => {
    assert.equal(M.evaluarCastigo(enMora(), '2026-08-15', { diasCastigo: 30 }).castigado, true);
    assert.equal(M.evaluarCastigo(enMora(), '2026-08-15', { diasCastigo: 120 }).castigado, false);
  });

  test('un socio castigado que vuelve a abonar deja de estarlo', () => {
    assert.equal(M.evaluarCastigo(enMora(), '2027-01-15').castigado, true);
    assert.equal(M.evaluarCastigo(enMora({ abonado: 1 }), '2027-01-15').castigado, false);
  });
});

/* ==========================================================================
 * §8 — aplicarProrroga
 * ======================================================================== */

function creditoBase(extra) {
  return Object.assign({
    id: 'CR-0001',
    cliente_id: 'CL-0001',
    capital: 300000,
    tasa_aplicada: 0.20,
    costo: 60000,
    total_a_pagar: 360000,
    fecha_desembolso: '2026-07-01',
    fecha_corte: '2026-07-15',
    estado: 'en_corte',
    prorrogas_usadas: 0,
    nivel_socio: 'bronce'
  }, extra || {});
}

describe('aplicarProrroga — costo y corrimiento (§8)', () => {

  test('cobra la tasa vigente sobre el capital y mueve el corte al siguiente', () => {
    const r = M.aplicarProrroga(creditoBase());
    assert.equal(r.ok, true);
    assert.equal(r.costo_prorroga, 60000);            // 300.000 × 20%
    assert.equal(r.credito.fecha_corte, '2026-07-31');
    assert.equal(r.credito.fecha_corte_anterior, '2026-07-15');
    assert.equal(r.credito.prorrogas_usadas, 1);
    assert.equal(r.credito.estado, 'vigente');
  });

  test('el costo sigue la tasa del socio, no un 20% fijo', () => {
    assert.equal(M.aplicarProrroga(creditoBase({ tasa_aplicada: 0.05 })).costo_prorroga, 15000);
    assert.equal(M.aplicarProrroga(creditoBase({ tasa_aplicada: 0.03 })).costo_prorroga, 9000);
    assert.equal(M.aplicarProrroga(creditoBase({ tasa_aplicada: 0.12 })).costo_prorroga, 36000);
  });

  test('la prórroga SÍ genera garantía (cambio 26-jul-2026)', () => {
    const r = M.aplicarProrroga(creditoBase());
    assert.equal(r.movimiento.tipo, 'costo_prorroga');
    assert.equal(r.movimiento.monto, 60000);
    assert.equal(r.movimiento.genera_garantia, true);
    assert.equal(r.movimiento.garantia_generada, 45000);   // el 75% del costo
    assert.equal(r.garantia_generada, 45000);
    assert.equal(r.credito.total_a_pagar, 360000, 'el costo de la prórroga se cobra aparte (D5)');
  });

  test('prorrogar dos veces acumula dos veces', () => {
    const uno = M.aplicarProrroga(creditoBase({ nivel_socio: 'plata' }));
    const dos = M.aplicarProrroga(uno.credito);
    assert.equal(uno.garantia_generada + dos.garantia_generada, 90000);
  });

  test('no muta el crédito recibido', () => {
    const original = creditoBase();
    const copia = JSON.parse(JSON.stringify(original));
    M.aplicarProrroga(original);
    assert.deepEqual(original, copia);
  });

  test('el corte nuevo también respeta domingos y festivos', () => {
    // corte 31-oct-2026 → siguiente nominal 15-nov (domingo) → 16 (festivo) → 17
    const r = M.aplicarProrroga(creditoBase({ fecha_corte: '2026-10-31' }));
    assert.equal(r.credito.fecha_corte, '2026-11-17');
  });

  test('el movimiento queda fechado en el corte que se está prorrogando', () => {
    const r = M.aplicarProrroga(creditoBase());
    assert.equal(r.movimiento.fecha, '2026-07-15');
    const r2 = M.aplicarProrroga(creditoBase(), { fecha: '2026-07-16' });
    assert.equal(r2.movimiento.fecha, '2026-07-16');
  });
});

describe('aplicarProrroga — topes por nivel (§5 y §8)', () => {

  test('bronce solo tiene 1 prórroga', () => {
    const primera = M.aplicarProrroga(creditoBase());
    assert.equal(primera.ok, true);
    assert.equal(primera.prorrogas_restantes, 0);

    const segunda = M.aplicarProrroga(primera.credito);
    assert.equal(segunda.ok, false);
    assert.equal(segunda.motivo, 'prorrogas_agotadas');
  });

  test('plata, oro y platino tienen 2', () => {
    for (const nivel of ['plata', 'oro', 'platino']) {
      const uno = M.aplicarProrroga(creditoBase({ nivel_socio: nivel }));
      assert.equal(uno.ok, true, nivel);
      assert.equal(uno.prorrogas_restantes, 1, nivel);

      const dos = M.aplicarProrroga(uno.credito);
      assert.equal(dos.ok, true, nivel);
      assert.equal(dos.prorrogas_restantes, 0, nivel);

      const tres = M.aplicarProrroga(dos.credito);
      assert.equal(tres.ok, false, nivel);
    }
  });

  test('tope duro de 2: ningún nivel pasa de ahí', () => {
    const r = M.aplicarProrroga(creditoBase({ nivel_socio: 'platino', prorrogas_usadas: 2 }));
    assert.equal(r.ok, false);
    assert.equal(r.prorrogas_permitidas, M.TOPE_DURO_PRORROGAS);
  });

  test('al rechazar, el crédito vuelve intacto', () => {
    const c = creditoBase({ prorrogas_usadas: 1 });
    const r = M.aplicarProrroga(c);
    assert.equal(r.ok, false);
    assert.equal(r.credito, c);
    assert.equal(r.credito.prorrogas_usadas, 1);
  });
});

describe('aplicarProrroga — salida obligatoria a plan de pagos (§8)', () => {

  test('al agotar prórrogas devuelve el plan ya armado', () => {
    const r = M.aplicarProrroga(creditoBase({ prorrogas_usadas: 1, fecha_corte: '2026-07-31' }));
    assert.equal(r.ok, false);
    const plan = r.plan_de_pagos;
    assert.equal(plan.cuotas.length, 3);
    assert.equal(plan.tasa_por_corte, 0.05);
    assert.equal(plan.genera_garantia, true); // cambio 26-jul-2026
  });

  test('cada cuota del plan deja de garantía el 75% de su costo', () => {
    const plan = M.construirPlanDePagos(creditoBase({ fecha_corte: '2026-07-31' }));
    assert.deepEqual(plan.cuotas.map(c => c.garantia_generada), [11250, 7500, 3750]);
    assert.equal(plan.total_garantia, 22500);
  });

  test('reparte el capital en 3 cortes con 5% sobre saldo insoluto', () => {
    const plan = M.construirPlanDePagos(creditoBase({ fecha_corte: '2026-07-31' }));
    assert.deepEqual(plan.cuotas.map(c => c.capital), [100000, 100000, 100000]);
    assert.deepEqual(plan.cuotas.map(c => c.saldo_insoluto), [300000, 200000, 100000]);
    assert.deepEqual(plan.cuotas.map(c => c.costo), [15000, 10000, 5000]);
    assert.deepEqual(plan.cuotas.map(c => c.total), [115000, 110000, 105000]);
    assert.equal(plan.total_capital, 300000);
    assert.equal(plan.total_costo, 30000);
    assert.equal(plan.total_a_pagar, 330000);
  });

  test('las 3 cuotas caen en cortes consecutivos y válidos', () => {
    const plan = M.construirPlanDePagos(creditoBase({ fecha_corte: '2026-07-31' }));
    assert.deepEqual(plan.cuotas.map(c => c.fecha_corte),
      ['2026-08-15', '2026-08-31', '2026-09-15']);
  });

  test('la división que no da exacta no pierde ni un peso', () => {
    const plan = M.construirPlanDePagos(creditoBase({ capital: 100000, fecha_corte: '2026-07-31' }));
    assert.deepEqual(plan.cuotas.map(c => c.capital), [33333, 33333, 33334]);
    assert.equal(plan.cuotas.reduce((s, c) => s + c.capital, 0), 100000);
  });

  test('el plan sale más barato que seguir prorrogando (esa es la idea)', () => {
    const c = creditoBase({ fecha_corte: '2026-07-31' });
    const costoTresProrrogas = Math.round(c.capital * c.tasa_aplicada) * 3;
    const plan = M.construirPlanDePagos(c);
    assert.ok(plan.total_costo < costoTresProrrogas,
      `plan ${plan.total_costo} vs prórrogas ${costoTresProrrogas}`);
  });
});

describe('aplicarProrroga — entradas inválidas', () => {

  test('no se prorroga un crédito pagado, castigado o ya en plan', () => {
    for (const estado of M.ESTADOS_SIN_PRORROGA) {
      assert.throws(() => M.aplicarProrroga(creditoBase({ estado: estado })),
        /No se puede prorrogar/, estado);
    }
  });

  test('sí se prorroga en corte, vigente o en mora D1 (§9)', () => {
    for (const estado of ['en_corte', 'vigente', 'en_mora']) {
      assert.equal(M.aplicarProrroga(creditoBase({ estado: estado })).ok, true, estado);
    }
  });

  test('datos incompletos son error, no un cero silencioso', () => {
    assert.throws(() => M.aplicarProrroga(null), /objeto del crédito/);
    assert.throws(() => M.aplicarProrroga(creditoBase({ capital: 0 })), /mayor que cero/);
    assert.throws(() => M.aplicarProrroga(creditoBase({ tasa_aplicada: 20 })), /decimal/);
    assert.throws(() => M.aplicarProrroga(creditoBase({ fecha_corte: 'mañana' })), /YYYY-MM-DD/);
    assert.throws(() => M.aplicarProrroga(creditoBase({ nivel_socio: 'diamante' })), /nivel desconocido/);
  });
});

/* ==========================================================================
 * Recorrido completo: un socio de bronce a oro
 * ======================================================================== */

describe('recorrido de un socio (§1: la garantía solo crece pagando a tiempo)', () => {

  test('LA ESCALERA: de 200.000 al techo de 20 millones, crédito a crédito', () => {
    let garantia = 200000;      // perfil completo (100.000) más un par de créditos ya pagados
    let pagos = 0, racha = 0;
    let nivel = M.evaluarNivel(pagos, racha, 0);
    const paso = [];

    /* 5-ago-2026 — EL CAMINO AL TECHO SE ALARGÓ, Y A PROPÓSITO. Con el factor de
       nivel se llegaba a los 20 millones en 11 créditos: se prestaba tres veces
       lo que el socio había pagado. Ahora el cupo sube 15% por crédito y llegar
       al techo toma unos 34, cinco veces más. Eso NO es un defecto: es lo que
       hace que la exposición de Joan baje en vez de subir. */
    for (let i = 1; i <= 40 && garantia < 20000000; i++) {
      const cupo = M.calcularCupo(garantia, nivel);
      const costo = M.calcularCosto(cupo);
      garantia += M.garantiaQueDejaUnCredito(cupo, true);
      pagos++; racha++;
      nivel = M.evaluarNivel(pagos, racha, Math.floor(i / 2), nivel);
      paso.push({ i, cupo, nivel });
    }

    // Arranca pudiendo pedir exactamente lo que respalda.
    assert.equal(paso[0].cupo, 200000);
    // A los dos pagos ya es plata, a los cinco oro: los niveles siguen ahí.
    assert.equal(paso[2].nivel, 'plata');
    assert.equal(paso[5].nivel, 'oro');
    // Y el cupo crece siempre, un 15% cada vez.
    for (let i = 1; i < paso.length; i++) assert.ok(paso[i].cupo > paso[i - 1].cupo);
    assert.equal(paso[1].cupo, 230000, '200.000 + el 15%');
    // Se duplica en cinco créditos.
    assert.ok(paso[5].cupo >= 400000, 'a los cinco créditos ya duplicó: ' + paso[5].cupo);
    // Y el techo llega, pero despacio.
    assert.ok(paso.length > 25, 'antes llegaba en 11: ' + paso.length);
    assert.ok(paso.length <= 40, 'llegó en ' + paso.length + ' créditos');
    assert.ok(M.calcularCupo(garantia, nivel) >= 15000000, 'quedó cerca del techo');
  });

  test('el precio nunca cambia en toda la escalera', () => {
    [200000, 1000000, 5000000, 20000000].forEach(cap => {
      assert.equal(M.calcularTasa(999999999, cap), 0.20);
      assert.equal(M.calcularCosto(cap), Math.round(cap * 0.20));
    });
  });

  test('el socio que se atrasa no pierde NADA y sigue pudiendo pedir', () => {
    let garantia = 250000;
    const pagos = 5;
    let nivel = M.evaluarNivel(pagos, 3, 12);
    assert.equal(nivel, 'oro');

    const credito = { capital: 300000, tasa_aplicada: M.TASA_CREDITO, fecha_corte: '2026-07-15' };
    const puntual = M.liquidarCredito(credito, '2026-07-15');
    const tarde = M.liquidarCredito(credito, '2026-07-25');

    // Pagó 30.000 de recargo y aun así acumuló menos que el puntual: el bono
    // por pagar en fecha existe, pero no le quita nada al que se atrasó.
    assert.ok(tarde.total_a_pagar > puntual.total_a_pagar);
    assert.ok(tarde.garantia_generada < puntual.garantia_generada);
    assert.ok(tarde.garantia_generada > 0, 'igual suma');

    garantia += tarde.garantia_generada;
    nivel = M.evaluarNivel(pagos, 0, 0, nivel);
    assert.ok(garantia > 250000, 'la garantía subió');
    assert.equal(nivel, 'oro', 'el nivel no se movió');

    const solicitud = M.puedeSolicitar({
      nivel_kyc: 2, estado: 'en_mora', garantia_total: garantia, nivel_socio: nivel
    });
    assert.equal(solicitud.ok, true, 'aunque venga de mora, Joan le presta');
    assert.ok(solicitud.cupo > M.calcularCupo(250000, 'oro'), 'y con más cupo que antes');
    assert.equal(solicitud.cupo, garantia, 'el cupo es su garantía, uno a uno');
  });

  test('el que nunca abona queda suspendido, pero su garantía lo espera', () => {
    const c = { capital: 300000, fecha_corte: '2026-07-15', abonado: 0 };
    const r = M.evaluarCastigo(c, '2026-11-15');
    assert.equal(r.castigado, true);
    assert.equal(r.garantia, 'congelada');

    // Vuelve y abona: deja de estar castigado y recupera el acceso intacto.
    const vuelve = M.evaluarCastigo(Object.assign({}, c, { abonado: 50000 }), '2026-11-15');
    assert.equal(vuelve.castigado, false);
    assert.equal(M.puedeSolicitar({ nivel_kyc: 2, estado: 'en_mora', garantia_total: 300000, nivel_socio: 'oro' }).ok, true);
  });
});

/* ==========================================================================
 * PRODUCTO 2 — préstamo con garantía, y las dos garantías (2-ago-2026)
 * ======================================================================== */

describe('desglosarGarantia — ganada, prestada y comprometida', () => {

  test('perfil completo y cero pagos: TODO lo que tiene es prestado', () => {
    const d = M.desglosarGarantia({ datos: datosCompletos() });
    assert.equal(d.cupon, 100000);
    assert.equal(d.ganada, 0);
    assert.equal(d.prestada, 100000);
    assert.equal(d.total, 100000);
    assert.equal(d.ganada_libre, 0);
  });

  test('LO PRESTADO NO RESPALDA NADA: con el cupón lleno el respaldado sigue en cero', () => {
    // Prestarle contra el cupón sería prestarle contra plata nuestra.
    assert.equal(M.maximoRespaldado({ datos: datosCompletos(), referidos: 2 }), 0);
    assert.equal(M.maximoRespaldado({}), 0);
    /* Y el cupo quincenal sí suma la prestada y la ganada: son cosas distintas.
       6-ago-2026 — ACÁ DECÍA 110.000 (100.000 de cupón + 10.000 de dos referidos)
       y ese era el número del defecto: con la ficha completa el cupón ya ocupa
       todo el techo de la prestada, así que dos referidos no pueden agregar
       10.000 de cupo puro sin subirle la exposición a Joan. Los referidos suman
       dentro del techo y hasta la garantía ganada, no encima. */
    assert.equal(M.cupoQuincenal({ datos: datosCompletos(), referidos: 2 }, 'bronce').cupo, 100000);
    const d = M.desglosarGarantia({ datos: datosCompletos(), referidos: 2 });
    assert.equal(d.referidos, 0, 'no había hueco bajo el techo');
    assert.equal(d.referidos_sin_tope, 10000, 'pero se sabe cuánto valían, para poder explicarlo');
    assert.equal(d.prestada, M.CUPON_KYC_MAXIMO);
  });

  test('pagando costos aparece la garantía GANADA, y esa sí respalda', () => {
    // 400.000 de costos pagados en fecha dejan 300.000 (el 75%).
    const acumulada = M.acumularGarantia(400000, true);
    assert.equal(acumulada, 300000);
    const d = M.desglosarGarantia({ datos: datosCompletos(), acumulada: acumulada });
    assert.equal(d.ganada, 300000);
    assert.equal(d.prestada, 100000);
    assert.equal(d.total, 400000);
    assert.equal(M.maximoRespaldado({ datos: datosCompletos(), acumulada: acumulada }), 300000);
  });

  test('lo comprometido sale del cupo quincenal mientras el respaldado esté abierto', () => {
    const e = { datos: datosCompletos(), acumulada: 360000, comprometida: 100000 };
    const d = M.desglosarGarantia(e);
    assert.equal(d.comprometida, 100000);
    assert.equal(d.ganada_libre, 260000);
    assert.equal(d.base_cupo, d.total - 100000);
    assert.equal(M.maximoRespaldado(e), 260000);
  });

  test('comprometer más de lo ganado se recorta, no revienta', () => {
    const d = M.desglosarGarantia({ acumulada: 50000, comprometida: 900000 });
    assert.equal(d.comprometida, 50000);
    assert.equal(d.ganada_libre, 0);
    assert.equal(d.base_cupo, 0);
  });

  test('EL TOTAL ES SIEMPRE EL MISMO QUE EL DE garantiaTotal: no hay dos verdades', () => {
    const casos = [
      {},
      { datos: datosCompletos() },
      { datos: datosCompletos(), referidos: 3, acumulada: 250000 },
      { acumulada: 300000, ajuste: -100000 },
      { datos: datosCompletos(), acumulada: 50000, ajuste: -900000 },
      { datos: datosCompletos(), referidos: 2, acumulada: 10000, ajuste: -60000 }
    ];
    casos.forEach(c => {
      assert.equal(M.desglosarGarantia(c).total, M.garantiaTotal(c).total, JSON.stringify(c));
    });
  });

  test('el ajuste negativo se come primero la ganada y después la prestada', () => {
    const d = M.desglosarGarantia({ datos: datosCompletos(), acumulada: 10000, ajuste: -60000 });
    assert.equal(d.ganada, 0, 'la ganada se agotó');
    assert.equal(d.prestada, 50000, 'y el resto salió del cupón');
    assert.equal(d.total, 50000);
  });

  test('entradas raras', () => {
    assert.equal(M.desglosarGarantia().total, 0);
    assert.equal(M.desglosarGarantia(null).total, 0);
    assert.throws(() => M.desglosarGarantia('hola'), /se esperaba un objeto/);
    assert.throws(() => M.desglosarGarantia({ comprometida: -1 }), /negativo/);
    assert.throws(() => M.desglosarGarantia({ ajuste: 'mucho' }), /se esperaba un número/);
  });
});

describe('cupoQuincenal — la comprometida no cuenta', () => {

  test('424.000 de garantía dan 424.000 de cupo, en platino y en bronce', () => {
    const c = M.cupoQuincenal({ datos: datosCompletos(), acumulada: 324000 }, 'platino');
    assert.equal(c.total, 424000);
    assert.equal(c.ganada, 324000);
    assert.equal(c.prestada, 100000);
    assert.equal(c.cupo, 424000);
    assert.equal(c.respaldo_disponible, 324000);
    assert.equal(c.factor, undefined, '`factor` ya no viaja: no multiplica nada');
    assert.equal(c.nivel_mueve_el_cupo, false);
    assert.equal(
      M.cupoQuincenal({ datos: datosCompletos(), acumulada: 324000 }, 'bronce').cupo, 424000);
  });

  test('con esos 324.000 comprometidos el cupo baja a lo prestado', () => {
    const c = M.cupoQuincenal(
      { datos: datosCompletos(), acumulada: 324000, comprometida: 324000 }, 'platino');
    assert.equal(c.base, 100000);
    assert.equal(c.cupo, 100000);
    assert.equal(c.respaldo_disponible, 0, 'no puede pedir dos respaldados contra la misma garantía');
    assert.equal(c.total, 424000, 'la garantía no desapareció: está respaldando algo');
  });

  test('sin nivel arranca en bronce, y un nivel inventado es error', () => {
    assert.equal(M.cupoQuincenal({ acumulada: 100000 }).nivel, 'bronce');
    assert.equal(M.cupoQuincenal({ acumulada: 100000 }).cupo, 100000);
    assert.throws(() => M.cupoQuincenal({}, 'diamante'), /nivel desconocido/);
  });

  test('EL FRENO POR INGRESO NO SE APLICA SI NADIE LO PIDE (5-ago-2026)', () => {
    const e = { datos: datosCompletos(), acumulada: 900000 };
    // Sin opciones: el cupo entero, como siempre.
    assert.equal(M.cupoQuincenal(e, 'bronce').cupo, 1000000);
    assert.equal(M.cupoQuincenal(e, 'bronce').freno.activo, false);
    // Con la config de un socio que declaró ingreso, pero el freno apagado:
    // tampoco. Encenderlo es una decisión de Joan y de nadie más.
    assert.equal(M.cupoQuincenal(e, 'bronce', { freno: { ingreso_quincenal: 1000000 } }).cupo, 1000000);
    // Y encendido, topa.
    const con = M.cupoQuincenal(e, 'bronce', {
      freno: { activo: true, ingreso_quincenal: 1000000 } });
    assert.equal(con.cupo, 250000);
    assert.equal(con.freno.aplicado, true);
    assert.equal(con.base, 1000000, 'la garantía no cambia: lo que se topa es el cupo');
  });
});

describe('acumularGarantiaRespaldada — el respaldado deja mucho menos', () => {

  test('solo el 20% del costo, contra el 75% del quincenal', () => {
    assert.equal(M.FACTOR_GARANTIA_RESPALDADO, 0.20);
    assert.equal(M.acumularGarantiaRespaldada(16200, true), 3240);
    assert.equal(M.acumularGarantiaRespaldada(16200), 3240, 'sin el flag se asume puntual');
    assert.ok(M.acumularGarantiaRespaldada(100000, true) < M.acumularGarantia(100000, true));
  });

  test('tarde también suma, la mitad', () => {
    assert.equal(M.FACTOR_GARANTIA_RESPALDADO_MORA, 0.10);
    assert.equal(M.acumularGarantiaRespaldada(16200, false), 1620);
    assert.equal(M.acumularGarantiaRespaldada(20000, true), M.acumularGarantiaRespaldada(20000, false) * 2);
  });

  test('mismas validaciones que la del quincenal', () => {
    assert.equal(M.acumularGarantiaRespaldada(0), 0);
    assert.throws(() => M.acumularGarantiaRespaldada(-1), /negativo/);
    assert.throws(() => M.acumularGarantiaRespaldada(20000, 'si'), /true o false/);
  });
});

describe('calendarioRespaldado — una cuota por mes, siempre en un corte real', () => {

  test('seis meses son seis fechas, una cada mes', () => {
    const f = M.calendarioRespaldado('2026-08-02', 6);
    assert.equal(f.length, 6);
    assert.deepEqual(f, ['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-02-01']);
  });

  test('ninguna cuota cae en domingo ni en festivo, y van creciendo', () => {
    for (const desde of ['2026-01-05', '2026-04-01', '2026-11-10', '2027-02-20']) {
      const f = M.calendarioRespaldado(desde, 6);
      for (let i = 0; i < f.length; i++) {
        assert.notEqual(M.aFechaLocal(f[i]).getDay(), 0, f[i] + ' cayó domingo');
        assert.equal(M.esFestivo(f[i]), false, f[i] + ' es festivo');
        if (i) assert.ok(M.aFechaLocal(f[i]) > M.aFechaLocal(f[i - 1]), 'las fechas no crecen');
      }
      assert.ok(M.diasEntre(M.aFechaLocal(desde), M.aFechaLocal(f[0])) >= M.DIAS_VENTANA_MINIMA);
    }
  });

  test('un mes es una sola fecha, y es el segundo corte (no el de la semana que viene)', () => {
    const uno = M.calendarioRespaldado('2026-08-02', 1);
    assert.equal(uno.length, 1);
    assert.equal(uno[0], '2026-08-31');
  });

  test('el plazo tiene que estar entre 1 y 6', () => {
    assert.throws(() => M.calendarioRespaldado('2026-08-02', 0), /entre 1 y 6/);
    assert.throws(() => M.calendarioRespaldado('2026-08-02', 7), /entre 1 y 6/);
    assert.throws(() => M.calendarioRespaldado('2026-08-02', 2.5), /entre 1 y 6/);
  });
});

describe('simularPrestamoRespaldado', () => {

  test('EL EJEMPLO DE JOAN: 90.000 a 6 meses con la garantía que se ganó', () => {
    const s = M.simularPrestamoRespaldado(90000, 6, { acumulada: 100000 });
    assert.equal(s.producto, 'respaldado');
    assert.equal(s.tasa_mensual, 0.05);
    assert.equal(s.costo_total, 27000);          // 90.000 × 5% × 6
    assert.equal(s.total_a_pagar, 117000);
    assert.equal(s.cuota_tipica, 19500);         // 15.000 de capital + 4.500 de costo
    assert.equal(s.cuotas.length, 6);
    assert.equal(s.garantia_que_deja, 5400);     // el 20% de 27.000, 900 por cuota
    assert.deepEqual(s.cuotas.map(c => c.garantia_generada), [900, 900, 900, 900, 900, 900]);
    assert.equal(s.dentro_del_respaldo, true);
  });

  test('LA CUENTA DEMO: 324.000 a 6 meses', () => {
    const s = M.simularPrestamoRespaldado(324000, 6, { datos: datosCompletos(), acumulada: 324000 });
    assert.equal(s.costo_total, 97200);
    assert.equal(s.cuota_tipica, 70200);         // 54.000 + 16.200
    assert.equal(s.total_a_pagar, 421200);
    assert.equal(s.garantia_que_deja, 19440);
    assert.equal(s.respaldo_disponible, 324000);
    assert.equal(s.garantia_comprometida, 324000, 'al desembolsar se compromete todo');
  });

  test('no se pierde ni un peso: la última cuota absorbe el resto', () => {
    for (const [cap, n] of [[100000, 3], [90000, 6], [333333, 4], [55555, 6], [1000000, 5]]) {
      const s = M.simularPrestamoRespaldado(cap, n, { acumulada: 5000000 });
      assert.equal(s.cuotas.reduce((t, c) => t + c.capital, 0), cap, `capital ${cap}/${n}`);
      assert.equal(s.cuotas.reduce((t, c) => t + c.costo, 0), s.costo_total, `costo ${cap}/${n}`);
      assert.equal(s.cuotas[s.cuotas.length - 1].saldo_despues, 0, 'la última deja saldo cero');
    }
  });

  test('a un mes es una sola cuota y el costo es el 5% pelado', () => {
    const s = M.simularPrestamoRespaldado(200000, 1, { acumulada: 200000 });
    assert.equal(s.cuotas.length, 1);
    assert.equal(s.costo_total, 10000);
    assert.equal(s.cuotas[0].capital, 200000);
    assert.equal(s.cuotas[0].total, 210000);
  });

  test('el plazo va de 1 a 6, nada más', () => {
    assert.throws(() => M.simularPrestamoRespaldado(100000, 0, {}), /entre 1 y 6/);
    assert.throws(() => M.simularPrestamoRespaldado(100000, 7, {}), /entre 1 y 6/);
    assert.throws(() => M.simularPrestamoRespaldado(0, 3, {}), /mayor que cero/);
  });

  test('con fecha de desembolso, las cuotas caen en cortes válidos', () => {
    const s = M.simularPrestamoRespaldado(300000, 4, { acumulada: 400000 },
      { fechaDesembolso: '2026-08-02' });
    assert.equal(s.primera_fecha, s.cuotas[0].fecha_corte);
    assert.equal(s.ultima_fecha, s.cuotas[3].fecha_corte);
    s.cuotas.forEach(c => {
      assert.notEqual(M.aFechaLocal(c.fecha_corte).getDay(), 0);
      assert.equal(M.esFestivo(c.fecha_corte), false);
    });
  });

  test('sin fecha de desembolso no inventa fechas', () => {
    const s = M.simularPrestamoRespaldado(300000, 3, { acumulada: 400000 });
    assert.equal(s.primera_fecha, null);
    assert.equal(s.ultima_fecha, null);
    assert.deepEqual(s.cuotas.map(c => c.fecha_corte), [null, null, null]);
  });

  test('PEDIR MÁS DE LO GANADO NO LANZA: dice cuánto le falta y se lo muestra igual', () => {
    const s = M.simularPrestamoRespaldado(500000, 6, { datos: datosCompletos(), acumulada: 200000 });
    assert.equal(s.respaldo_disponible, 200000);
    assert.equal(s.dentro_del_respaldo, false);
    assert.equal(s.falta_garantia_ganada, 300000);
    assert.equal(s.costo_total, 150000, 'la simulación se calcula igual');
  });

  test('el cupo de después es el del final del camino, con la comprometida ya liberada', () => {
    const e = { datos: datosCompletos(), acumulada: 324000 };
    const s = M.simularPrestamoRespaldado(324000, 6, e, { nivelSocio: 'platino' });
    const d = M.desglosarGarantia(e);
    assert.equal(s.cupo_despues, M.calcularCupo(d.base_cupo + s.garantia_que_deja, 'platino'));
    assert.equal(s.garantia_despues, d.total + s.garantia_que_deja);
  });
});

describe('liquidarCuotaRespaldada — el mes a mes del Panel', () => {

  const cuota = extra => Object.assign(
    { capital: 54000, costo: 16200, fecha_corte: '2026-08-31' }, extra || {});

  test('cuota puntual: sin recargo y deja el 20% del costo', () => {
    const l = M.liquidarCuotaRespaldada(cuota(), '2026-08-31');
    assert.equal(l.dias_mora, 0);
    assert.equal(l.pago_a_tiempo, true);
    assert.equal(l.recargo_mora, 0);
    assert.equal(l.total_a_pagar, 70200);
    assert.equal(l.garantia_generada, 3240);
    assert.equal(l.garantia_si_puntual, 3240);
  });

  test('la mora corre sobre la cuota entera, que es lo que venció ese día', () => {
    const l = M.liquidarCuotaRespaldada(cuota(), '2026-09-10');
    assert.equal(l.dias_mora, 10);
    assert.equal(l.base_mora, 70200);
    assert.equal(l.recargo_mora, 7020);
    assert.equal(l.costo_total_pagado, 23220);
    assert.equal(l.total_a_pagar, 77220);
    assert.equal(l.garantia_generada, 2322);   // 10% de 23.220
    assert.ok(l.garantia_si_puntual > l.garantia_generada);
  });

  test('la base de la mora se puede mover desde arriba', () => {
    assert.equal(M.liquidarCuotaRespaldada(cuota(), '2026-09-10', { baseMora: 54000 }).recargo_mora, 5400);
    assert.equal(M.liquidarCuotaRespaldada(cuota(), '2026-09-10', { tasaDiaria: 0.005 }).recargo_mora, 3510);
  });

  test('entradas inválidas', () => {
    assert.throws(() => M.liquidarCuotaRespaldada(null, '2026-08-31'), /objeto de la cuota/);
    assert.throws(() => M.liquidarCuotaRespaldada(cuota({ capital: 0 }), '2026-08-31'), /mayor que cero/);
    assert.throws(() => M.liquidarCuotaRespaldada(cuota(), 'mañana'), /YYYY-MM-DD/);
  });
});

describe('repartirCosto — 75/10/15, la contabilidad que el socio no ve', () => {

  test('de 20.000 de costo: 15.000 al socio, 3.000 al cupón, 2.000 a la plataforma', () => {
    const r = M.repartirCosto(20000);
    assert.equal(r.total, 20000);
    assert.equal(r.garantia_socio, 15000);
    assert.equal(r.amortiza_cupon, 3000);
    assert.equal(r.operativo, 2000);
    assert.deepEqual(M.REPARTO_COSTO, { garantia: 0.75, operativo: 0.10, cupon: 0.15 });
  });

  test('EL REPARTO SUMA 100% EXACTO, en los dos casos y con costos feos', () => {
    const feos = [0, 1, 3, 7, 13, 99, 101, 999, 12345, 20000, 20001, 123457, 999999, 5000000];
    for (const costo of feos) {
      for (const aTiempo of [true, false]) {
        for (const producto of ['quincenal', 'respaldado']) {
          for (const pendiente of [undefined, 0, 1, 250, 100000]) {
            const r = M.repartirCosto(costo,
              { aTiempo: aTiempo, producto: producto, cuponPendiente: pendiente });
            assert.equal(r.garantia_socio + r.amortiza_cupon + r.operativo, r.total,
              `${costo} ${producto} ${aTiempo} pend=${pendiente}`);
            assert.ok(r.garantia_socio >= 0 && r.amortiza_cupon >= 0 && r.operativo >= 0,
              `${costo} ${producto} ${aTiempo} pend=${pendiente} dio un pedazo negativo`);
          }
        }
      }
    }
  });

  test('BARRIDO: ni un peso perdido ni un pedazo negativo en 3.000 costos seguidos', () => {
    for (let costo = 0; costo <= 3000; costo++) {
      for (const aTiempo of [true, false]) {
        const r = M.repartirCosto(costo, { aTiempo: aTiempo });
        assert.equal(r.garantia_socio + r.amortiza_cupon + r.operativo, costo, costo + ' ' + aTiempo);
        assert.ok(r.operativo >= 0, costo + ' ' + aTiempo);
      }
    }
  });

  test('al socio que ya devolvió su cupón deja de cobrársele el 15%', () => {
    const r = M.repartirCosto(20000, { cuponPendiente: 0 });
    assert.equal(r.amortiza_cupon, 0);
    assert.equal(r.garantia_socio, 15000, 'su garantía no cambia ni un peso');
    assert.equal(r.operativo, 5000, 'el 15% liberado se suma a lo operativo');
    // Y ese 15% liberado ya es GANANCIA, dicho aparte para que el Panel lo vea.
    assert.equal(r.ganancia_cupon, 3000);
    assert.equal(r.cupon_nominal, 3000);
    // Si le quedaba poquito, se cobra solo lo que faltaba y el resto es ganancia.
    const casi = M.repartirCosto(20000, { cuponPendiente: 250 });
    assert.equal(casi.amortiza_cupon, 250);
    assert.equal(casi.ganancia_cupon, 2750);
    assert.equal(casi.garantia_socio + casi.amortiza_cupon + casi.operativo, 20000);
  });

  test('pagando tarde el reparto queda 37,5/47,5/15: el bono sale de lo operativo', () => {
    const r = M.repartirCosto(20000, { aTiempo: false });
    assert.equal(r.garantia_socio, 7500);
    assert.equal(r.amortiza_cupon, 3000, 'el cupón se recupera igual: hay que recuperarlo igual');
    assert.equal(r.operativo, 9500);
    assert.equal(r.garantia_socio + r.amortiza_cupon + r.operativo, 20000);
    // La mitad de la garantía del puntual, y el cupón intacto.
    assert.equal(r.garantia_socio, M.repartirCosto(20000).garantia_socio / 2);
    assert.equal(r.amortiza_cupon, M.repartirCosto(20000).amortiza_cupon);
  });

  test('en el respaldado el socio se lleva el 20% y el resto sostiene la casa', () => {
    const r = M.repartirCosto(16200, { producto: 'respaldado' });
    assert.equal(r.garantia_socio, 3240);
    assert.equal(r.amortiza_cupon, 2430, 'el 15% del cupón se cobra en los dos productos');
    assert.equal(r.operativo, 16200 - 3240 - 2430);
  });

  test('entradas inválidas', () => {
    assert.throws(() => M.repartirCosto(-1), /negativo/);
    assert.throws(() => M.repartirCosto(20000, { producto: 'otro' }), /quincenal/);
    assert.throws(() => M.repartirCosto(20000, { aTiempo: 'si' }), /true o false/);
  });
});

describe('amortizarCupon — el cupón se salda en el crédito 13 (5-ago-2026)', () => {

  /* La escalera normal: cupón de 100.000 completo, pide todo su cupo cada vez y
     paga en fecha. El 15% de cada costo va devolviendo el cupón. */
  function escalera(n) {
    let g = 100000;
    const costos = [];
    for (let i = 1; i <= n; i++) {
      const pide = M.calcularCupo(g, 'bronce');
      costos.push({ monto: M.calcularCosto(pide), aTiempo: true, tipo: 'credito', fecha: null });
      g += M.garantiaQueDejaUnCredito(pide, true);
    }
    return costos;
  }

  test('EL CRÉDITO 13 LO SALDA, y ni uno antes', () => {
    const doce = M.amortizarCupon(escalera(12), { cuponPrestado: 100000 });
    assert.equal(doce.saldado, false);
    assert.ok(doce.cupon_pendiente > 0, 'todavía queda ' + doce.cupon_pendiente);

    const trece = M.amortizarCupon(escalera(13), { cuponPrestado: 100000 });
    assert.equal(trece.saldado, true);
    assert.equal(trece.cupon_pendiente, 0);
    assert.equal(trece.cupon_recuperado, 100000, 'ni un peso más que lo que se regaló');
    assert.equal(trece.saldado_en, 12, 'el movimiento 13, contando desde cero');
  });

  test('DESDE AHÍ EL 15% ES GANANCIA, y se dice de dónde sale', () => {
    const c = M.amortizarCupon(escalera(14), { cuponPrestado: 100000 });
    const m13 = c.movimientos[12], m14 = c.movimientos[13];
    // El 13 se parte en dos: una parte termina de saldar, el resto ya es ganancia.
    assert.ok(m13.amortiza_cupon > 0 && m13.ganancia_cupon > 0);
    assert.equal(m13.amortiza_cupon + m13.ganancia_cupon,
      Math.round(m13.monto * M.REPARTO_COSTO.cupon));
    assert.equal(m13.cupon_pendiente_despues, 0);
    // El 14 ya no amortiza nada: el 15% entero es ganancia.
    assert.equal(m14.amortiza_cupon, 0);
    assert.equal(m14.ganancia_cupon, Math.round(m14.monto * M.REPARTO_COSTO.cupon));
    assert.ok(m14.operativo > m14.ganancia_cupon, 'la ganancia libre contiene ese 15%');
  });

  test('LA EXPOSICIÓN DE JOAN BAJA CRÉDITO A CRÉDITO, nunca sube', () => {
    const c = M.amortizarCupon(escalera(13), { cuponPrestado: 100000 });
    let anterior = 100000;
    c.movimientos.forEach(m => {
      assert.ok(m.cupon_pendiente_despues <= anterior,
        'el pendiente subió en el movimiento ' + m.indice);
      anterior = m.cupon_pendiente_despues;
    });
    assert.equal(c.expuesto, 0, 'al crédito 13 no arriesga nada');
  });

  test('lo cobrado se reparte entero: garantía + cupón + ganancia libre', () => {
    const c = M.amortizarCupon(escalera(13), { cuponPrestado: 100000 });
    assert.equal(c.garantia_socio + c.cupon_recuperado + c.ganancia_libre, c.cobrado);
    assert.ok(c.garantia_socio > 0 && c.ganancia_libre > 0);
  });

  test('pagar tarde no frena la recuperación del cupón', () => {
    const puntual = M.amortizarCupon(escalera(13), { cuponPrestado: 100000 });
    const tarde = M.amortizarCupon(
      escalera(13).map(c => Object.assign({}, c, { aTiempo: false })), { cuponPrestado: 100000 });
    assert.equal(tarde.cupon_recuperado, puntual.cupon_recuperado);
    assert.ok(tarde.garantia_socio < puntual.garantia_socio, 'lo que baja es su garantía');
    assert.ok(tarde.ganancia_libre > puntual.ganancia_libre, 'y la diferencia va a operativo');
  });

  test('sin costos pagados, todo el cupón sigue en la calle', () => {
    const c = M.amortizarCupon([], { cuponPrestado: 100000 });
    assert.equal(c.cupon_pendiente, 100000);
    assert.equal(c.cobrado, 0);
    assert.equal(c.ganancia_libre, 0);
    assert.equal(c.saldado_en, null);
    assert.equal(M.amortizarCupon(null).cupon_prestado, M.CUPON_KYC_MAXIMO);
  });

  test('un socio con la ficha a medias arriesga menos', () => {
    // El cupón es por dato: media ficha es medio riesgo, y con dos créditos ya
    // recuperó una parte mayor de lo que se le regaló.
    const medio = M.amortizarCupon(escalera(2), { cuponPrestado: 50000 });
    const lleno = M.amortizarCupon(escalera(2), { cuponPrestado: 100000 });
    assert.ok(medio.cupon_pendiente < lleno.cupon_pendiente);
  });

  test('entradas inválidas', () => {
    assert.throws(() => M.amortizarCupon('costos'), /se esperaba una lista/);
    assert.throws(() => M.amortizarCupon([1, 2]), /se esperaba un objeto/);
    assert.throws(() => M.amortizarCupon([], { cuponPrestado: -1 }), /negativo/);
  });
});

describe('compararProductos — plata barata o crecer', () => {

  const perfil = { datos: datosCompletos(), acumulada: 324000 };

  test('324.000 a 6 meses: una vuelta y el plazo entero, cada cosa en su lugar', () => {
    const c = M.compararProductos(324000, 6, perfil, { nivelSocio: 'platino' });
    assert.equal(c.capital, 324000);
    assert.equal(c.plazo_meses, 6);
    // Una vuelta: lo que cuesta el producto hasta el corte.
    assert.equal(c.quincenal.costo, 64800);
    assert.equal(c.quincenal.garantia_que_deja, 48600);      // el 15% del capital
    // Los mismos 6 meses: renovándolo en los 12 cortes.
    assert.equal(c.quincenal.cortes_en_el_plazo, 12);
    assert.equal(c.quincenal.costo_en_el_plazo, 777600);     // 64.800 × 12
    assert.equal(c.quincenal.garantia_en_el_plazo, 583200);  // 48.600 × 12
    assert.equal(c.respaldado.costo_total, 97200);
    assert.equal(c.respaldado.cuota_tipica, 70200);
    assert.equal(c.respaldado.garantia_que_deja, 19440);
    // Las diferencias son del plazo entero, nunca de una vuelta contra 6 meses.
    assert.equal(c.diferencias.costo_extra_quincenal, 680400);    // 777.600 − 97.200
    assert.equal(c.diferencias.garantia_extra_quincenal, 563760); // 583.200 − 19.440
    assert.equal(c.diferencias.veces_mas_garantia, 30);           // 583.200 / 19.440
    assert.equal(c.diferencias.cual_es_mas_barato, 'respaldado');
    assert.equal(c.diferencias.cual_hace_crecer_mas, 'quincenal');
    assert.equal(c.respaldado.plazo_texto, '6 meses');
    assert.equal(c.quincenal.plazo_texto, 'hasta el corte');
  });

  /* Esto es lo que se rompió una vez: la pantalla ponía los 64.800 de UNA
     quincena al lado de los 97.200 de seis meses y debajo dictaminaba que el
     de 97.200 era el barato. Cada dato era cierto y el conjunto mentía. */
  test('LA CIFRA QUE SE MUESTRA NUNCA CONTRADICE EL VEREDICTO', () => {
    for (const meses of [1, 2, 3, 4, 5, 6]) {
      for (const monto of [80000, 324000, 900000]) {
        const c = M.compararProductos(monto, meses, perfil, { nivelSocio: 'platino' });
        const q = c.quincenal, r = c.respaldado, d = c.diferencias;
        const donde = monto + ' a ' + meses + ' meses';

        // Los dos números grandes miden el mismo tiempo...
        assert.equal(q.cortes_en_el_plazo, meses * 2, donde);
        assert.equal(q.costo_en_el_plazo, q.costo * meses * 2, donde);
        assert.equal(q.garantia_en_el_plazo, q.garantia_que_deja * meses * 2, donde);

        // ...y restarlos da exactamente lo que dice el veredicto.
        assert.equal(d.costo_extra_quincenal, q.costo_en_el_plazo - r.costo_total, donde);
        assert.equal(d.garantia_extra_quincenal, q.garantia_en_el_plazo - r.garantia_que_deja, donde);
        assert.equal(d.cual_es_mas_barato,
          d.costo_extra_quincenal > 0 ? 'respaldado' : (d.costo_extra_quincenal < 0 ? 'quincenal' : 'igual'), donde);
        assert.equal(d.cual_hace_crecer_mas,
          d.garantia_extra_quincenal > 0 ? 'quincenal' : (d.garantia_extra_quincenal < 0 ? 'respaldado' : 'igual'), donde);

        // Y el más barato es, de verdad, el que menos plata cuesta.
        if (d.cual_es_mas_barato === 'respaldado') {
          assert.ok(r.costo_total < q.costo_en_el_plazo, 'el barato cuesta menos: ' + donde);
        }
      }
    }
  });

  test('el cupo del quincenal también es del plazo entero, no de una vuelta', () => {
    const c = M.compararProductos(324000, 6, perfil, { nivelSocio: 'platino' });
    const base = M.desglosarGarantia(perfil).base_cupo;
    assert.equal(c.quincenal.cupo_despues, M.calcularCupo(base + 48600, 'platino'));
    assert.equal(c.quincenal.cupo_en_el_plazo, M.calcularCupo(base + 583200, 'platino'));
    assert.ok(c.quincenal.cupo_en_el_plazo > c.quincenal.cupo_despues);
  });

  test('a un mes el texto va en singular: se lee dos veces, una por lado', () => {
    assert.equal(M.compararProductos(100000, 1, perfil, { nivelSocio: 'oro' }).respaldado.plazo_texto, '1 mes');
    assert.equal(M.compararProductos(100000, 2, perfil, { nivelSocio: 'oro' }).respaldado.plazo_texto, '2 meses');
  });

  test('LOS DOS LADOS SALEN DE LOS MISMOS SIMULADORES: no se pueden desincronizar', () => {
    const c = M.compararProductos(200000, 3, perfil, { nivelSocio: 'oro', fechaDesembolso: '2026-08-02' });
    const q = M.simularCredito(200000, M.desglosarGarantia(perfil).base_cupo,
      { nivelSocio: 'oro', fechaDesembolso: '2026-08-02' });
    const r = M.simularPrestamoRespaldado(200000, 3, perfil,
      { nivelSocio: 'oro', fechaDesembolso: '2026-08-02' });
    assert.equal(c.quincenal.costo, q.costo);
    assert.equal(c.quincenal.cupo_despues, q.cupo_despues);
    assert.equal(c.quincenal.fecha_corte, q.fecha_corte);
    assert.equal(c.respaldado.total_a_pagar, r.total_a_pagar);
    assert.equal(c.respaldado.ultima_fecha, r.ultima_fecha);
  });

  test('el quincenal SIEMPRE hace crecer más, por caro que parezca', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const c = M.compararProductos(300000, n, perfil, { nivelSocio: 'platino' });
      assert.equal(c.diferencias.cual_hace_crecer_mas, 'quincenal', n + ' meses');
      assert.equal(c.diferencias.cual_es_mas_barato, 'respaldado', n + ' meses');
    }
  });

  test('si no le alcanza la garantía ganada, igual muestra los dos lados', () => {
    const c = M.compararProductos(900000, 6, perfil, { nivelSocio: 'platino' });
    assert.equal(c.respaldado.dentro_del_respaldo, false);
    assert.ok(c.respaldado.costo_total > 0, 'no se esconde el producto');
    // 5-ago-2026: con el cupo uno a uno, 900.000 tampoco entran en el quincenal
    // —el perfil tiene 424.000 de garantía— y los dos lados se muestran igual.
    assert.equal(c.quincenal.dentro_del_cupo, false);
    assert.ok(c.quincenal.costo > 0);
  });
});

describe('códigos de invitación', () => {

  test('200 códigos seguidos: todos con el formato y todos válidos', () => {
    for (let i = 0; i < 200; i++) {
      const c = M.generarCodigoInvitacion();
      assert.match(c, /^TG-[0-9A-Z]{4}-[0-9A-Z]{4}$/, c);
      assert.equal(M.codigoInvitacionValido(c), true, c);
      assert.equal(/[ILOU]/.test(c.slice(3)), false, c + ' trae un confusable');
    }
  });

  test('acepta una fuente de azar propia (el Panel le pasa la de crypto)', () => {
    let n = 0;
    const azar = () => ((n++ * 7) % 32) / 32;
    const a = M.generarCodigoInvitacion(azar);
    n = 0;
    assert.equal(M.generarCodigoInvitacion(azar), a, 'misma semilla, mismo código');
    assert.equal(M.codigoInvitacionValido(a), true);
  });

  test('EL DÍGITO DE CONTROL ATAJA EL CÓDIGO MAL DICTADO', () => {
    assert.equal(M.codigoInvitacionValido('TG-ABCD-EFG8'), true);
    assert.equal(M.codigoInvitacionValido('TG-ABCD-EFG1'), false, 'control cambiado');
    assert.equal(M.codigoInvitacionValido('TG-ABDC-EFG8'), false, 'dos letras al revés');
    assert.equal(M.codigoInvitacionValido('TG-ABCD-EF8'), false, 'le falta una');
  });

  test('perdona guiones, espacios, minúsculas y el prefijo escrito o no', () => {
    const esperado = 'TG-ABCD-EFGH';
    ['tg abcd efgh', 'TGABCDEFGH', 'tg-abcd-efgh', 'ABCDEFGH', '  abcd efgh  ']
      .forEach(t => assert.equal(M.normalizarCodigoInvitacion(t), esperado, t));
  });

  test('mapea los confusables que la gente igual va a teclear', () => {
    assert.equal(M.normalizarCodigoInvitacion('TG-ABCI-LOUD'), 'TG-ABC1-10VD');
    assert.equal(M.normalizarCodigoInvitacion('ABC1EFGH'), 'TG-ABC1-EFGH');
    assert.equal(M.normalizarCodigoInvitacion('ABCIEFGH'), 'TG-ABC1-EFGH', 'la I entra como 1');
    assert.equal(M.normalizarCodigoInvitacion('ABCOEFGH'), 'TG-ABC0-EFGH', 'la O entra como 0');
    assert.equal(M.normalizarCodigoInvitacion('ABCUEFGH'), 'TG-ABCV-EFGH', 'la U entra como V');
  });

  test('lo que no llega a 8 caracteres es null, no un código inventado', () => {
    assert.equal(M.normalizarCodigoInvitacion('hola'), null);
    assert.equal(M.normalizarCodigoInvitacion(''), null);
    assert.equal(M.normalizarCodigoInvitacion('TG-ABC'), null);
    assert.equal(M.normalizarCodigoInvitacion(null), null);
    assert.equal(M.normalizarCodigoInvitacion(12345678), null);
    assert.equal(M.codigoInvitacionValido('hola'), false);
    assert.equal(M.codigoInvitacionValido(undefined), false);
  });
});

/* ==========================================================================
 * Los dos ejemplos con los que Joan explicó el producto (2-ago-2026)
 * ======================================================================== */

describe('las cuentas de Joan, con el motor de verdad', () => {

  test('CINCO CRÉDITOS DE 100.000 DEJAN 75.000 DE GARANTÍA GANADA', () => {
    let ganada = 0, costos = 0;
    for (let i = 0; i < 5; i++) {
      const costo = M.calcularCosto(100000);
      assert.equal(costo, 20000);
      costos += costo;
      ganada += M.acumularGarantia(costo, true);
    }
    assert.equal(costos, 100000, 'pagó 100.000 en costos');
    assert.equal(ganada, 75000, 'el 75% se le volvió garantía');

    // El otro 25% no se pierde: sostiene la plataforma (10%) y devuelve el
    // cupón regalado (15%).
    const reparto = M.repartirCosto(costos);
    assert.equal(reparto.garantia_socio, 75000);
    assert.equal(reparto.amortiza_cupon, 15000);
    assert.equal(reparto.operativo, 10000);
    assert.equal(reparto.amortiza_cupon + reparto.operativo, 25000);

    // Y con esos 75.000 puede pedir un respaldado de hasta 75.000.
    const e = { datos: datosCompletos(), acumulada: ganada };
    assert.equal(M.maximoRespaldado(e), 75000);
    const s = M.simularPrestamoRespaldado(75000, 6, e);
    assert.equal(s.dentro_del_respaldo, true);
    assert.equal(s.costo_total, 22500);
  });

  test('LA CUENTA DEMO: 10 créditos pagados en fecha dan 370.000 y cupo 370.000', () => {
    const montos = [100000, 100000, 100000, 100000, 200000, 200000, 200000, 200000, 300000, 300000];
    let capital = 0, costos = 0, ganada = 0;
    montos.forEach(m => {
      const costo = M.calcularCosto(m);
      capital += m; costos += costo;
      ganada += M.acumularGarantia(costo, true);
    });
    assert.equal(capital, 1800000);
    assert.equal(costos, 360000);
    assert.equal(ganada, 270000);
    // Acreditar crédito por crédito da lo mismo que acreditar el total de una.
    assert.equal(ganada, M.acumularGarantia(costos, true), 'sin arrastre de redondeo');

    const nivel = M.evaluarNivel(10, 10, 6, 'bronce');
    assert.equal(nivel, 'platino');

    const e = { datos: datosCompletos(), acumulada: ganada };
    const c = M.cupoQuincenal(e, nivel);
    assert.equal(c.prestada, 100000, 'el cupón de datos');
    assert.equal(c.ganada, 270000);
    assert.equal(c.total, 370000);
    // 5-ago-2026: platino ya no multiplica. El cupo es la garantía, y el
    // ejemplo de Joan pasa de 1.272.000 a 370.000 —que es exactamente lo que
    // él respalda—.
    assert.equal(c.cupo, 370000);
    assert.equal(c.respaldo_disponible, 270000);

    // Y la comparación que se le muestra en la calculadora.
    const cmp = M.compararProductos(270000, 6, e, { nivelSocio: nivel });
    assert.equal(cmp.quincenal.costo, 54000);
    assert.equal(cmp.respaldado.costo_total, 81000);
    assert.equal(cmp.respaldado.total_a_pagar, 351000);
    // Lo que se le muestra en grande: los mismos 6 meses de los dos lados.
    assert.equal(cmp.quincenal.costo_en_el_plazo, 648000);
    assert.equal(cmp.diferencias.cual_es_mas_barato, 'respaldado');
    assert.equal(cmp.diferencias.veces_mas_garantia, 30);
  });
});

/* ==========================================================================
 * EL PUENTE — una sola verdad entre el Panel y la app del socio
 *
 * El Panel (crm.html) y la app (socio.html) muestran los mismos números del
 * mismo cliente por dos caminos distintos: el enlace de WhatsApp y el modo
 * Panel. Mientras cada uno tuvo su copia de las cuentas, los dos caminos se
 * separaron sin que nadie se enterara. Estas pruebas cierran las dos puertas:
 * que el puente calcule bien, y que el Panel no vuelva a escribir lo mismo.
 * ======================================================================== */

const fs = require('node:fs');
const path = require('node:path');
const P = require('../app/puente.js');

function dbDePrueba() {
  const credito = (id, socioId, capital, fecha, fechaPagado) => ({
    id: id, numero: Number(id.slice(1)), socioId: socioId, capital: capital,
    costoPct: 20, fechaDesembolso: fecha, cicloActual: fecha,
    pagado: !!fechaPagado, fechaPagado: fechaPagado || null,
    cicloPago: fechaPagado ? fecha : null,
    gananciaPago: fechaPagado ? capital * 0.2 : 0,
    prorrogas: [], abonosCapital: [], comprobantes: []
  });
  const datos = datosCompletos();
  return {
    config: { negocio: 'Tu Garantía', whatsapp: '573001112233' },
    socios: [{
      id: 'a', numero: 1, nombre: 'Ana Perez', cedula: '1020304050',
      telefono: '3001112233', whatsappIgual: true, email: datos.correo,
      ciudad: datos.ciudad, direccion: datos.direccion, tipoVivienda: datos.vivienda,
      nequi: datos.pago, telefono2: datos.celular2, ubicacion: datos.ubicacion,
      referencia: { nombre: 'Luz', telefono: '3009998877' },
      cedulaFrenteFoto: 'x', cedulaReversoFoto: 'y', selfieFoto: 'z',
      ajusteGarantia: 0, nivelSocio: 'bronce'
    }],
    prestamos: [
      credito('c1', 'a', 100000, '2026-01-15', '2026-01-15'),
      credito('c2', 'a', 200000, '2026-02-15', '2026-02-15')
    ],
    respaldados: [], invitaciones: [],
    contadores: { cliente: 1, credito: 2, respaldado: 0 }
  };
}

describe('el puente — el Panel y la app no pueden dar dos números', () => {

  test('EL AJUSTE A MANO VIAJA DENTRO DE LA GARANTÍA GANADA DEL SOCIO', () => {
    // El bug: el Panel armaba el paquete con garantiaTotal(), que devuelve la
    // acumulada tal como entró. Con un ajuste de -50.000, el socio veía el
    // total ya descontado pero una "ganada" de 50.000 más, y con esa ganada
    // fantasma se le ofrecía un préstamo con garantía que no tenía respaldo.
    const db = dbDePrueba();
    db.socios[0].ajusteGarantia = -50000;
    const s = db.socios[0];

    const bruta = P.garantiaGanadaDe(db, s);
    assert.equal(bruta, 45000, 'el 75% de los 60.000 de costo');

    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.acumulada, 0, 'la ganada llega con el ajuste puesto, y no baja de cero');
    assert.equal(m.garantia.total, 95000, 'el ajuste se comió la ganada y siguió por el cupón');
    // Y lo que respalda un préstamo con garantía es esa ganada, no la bruta.
    assert.equal(M.maximoRespaldado(P.entradaGarantia(db, s)), 0);
  });

  test('LA GARANTÍA DE LA COMUNIDAD LLEVA EL FACTOR, NO EL COSTO PELADO', () => {
    // El bug: el Panel sumaba gananciaCobrada() a secas. Desde que
    // FACTOR_GARANTIA bajó a 0,90 eso dejó de ser garantía y pasó a ser el
    // costo cobrado: al socio se le anunciaba un 11% más de lo construido.
    const db = dbDePrueba();
    const foto = P.fotoComunidad(db);
    const costoPelado = db.prestamos.reduce((t, p) => t + P.gananciaCobrada(p), 0);
    assert.equal(costoPelado, 60000);
    assert.equal(foto.garantia_construida, 45000, 'el 75%, no los 60.000');
    assert.equal(foto.garantia_construida, P.garantiaGanadaDe(db, db.socios[0]));
  });

  test('los dos caminos dan el mismo número para el mismo cliente', () => {
    const db = dbDePrueba();
    db.socios[0].ajusteGarantia = 15000;
    db.respaldados.push({
      id: 'r1', numero: 1, socioId: 'a', capital: 60000, plazoMeses: 2, pagado: false,
      cuotas: [
        { n: 1, fecha: '2026-05-02', capital: 30000, costo: 3000, total: 33000, pagado: true, garantiaGenerada: 600 },
        { n: 2, fecha: '2026-06-02', capital: 30000, costo: 3000, total: 33000, pagado: false }
      ]
    });
    const s = db.socios[0];
    const entrada = P.entradaGarantia(db, s);   // el camino del Panel
    const m = P.migrarSocio(db, s);             // el camino del socio
    const d = M.desglosarGarantia(entrada);

    assert.equal(m.garantia.total, d.total);
    assert.equal(m.garantia.acumulada, d.ganada);
    assert.equal(m.garantia.comprometida, d.comprometida);
    assert.equal(m.garantia.cupon, d.cupon);
    assert.equal(m.garantia.referidos, d.referidos);
    // El detalle crédito por crédito suma la ganada bruta, sin arrastres.
    const detalle = m.creditos.reduce((t, c) => t + c.garantia, 0)
      + P.respaldadosDe(db, s).reduce((t, r) => t + P.garantiaGanadaRespaldado(r), 0);
    assert.equal(detalle, entrada.acumulada);
  });

  test('un socio nulo o un respaldo viejo no revientan el puente', () => {
    assert.deepEqual(P.respaldadosDe(dbDePrueba(), null), []);
    assert.doesNotThrow(() => P.migrarSocio(P.normalizar(null), { id: 'x', nombre: 'Sin nada' }));
  });
});

/* ==========================================================================
 * LA FECHA DE PAGO FALSA QUE DEJÓ EL PANEL VIEJO
 *
 * El Panel archivado del 17-jul estampaba `p.fechaPagado = isoLocal(new Date())`
 * dentro de su propio cargar(), y el primer guardar() lo persistió. Los créditos
 * viejos de Joan quedaron con pagado:true y una fechaPagado que es el día en que
 * él abrió el Panel, no el día en que el cliente pagó. El arreglo del 3-ago vivía
 * dentro de `if (p.pagado === undefined)` y encima preguntaba `if (!p.fechaPagado)`:
 * las dos puertas cerradas justo para esa población. Las 225 pruebas de entonces
 * pasaban porque ninguna la cubría. Estas cuatro sí.
 * ======================================================================== */

describe('la migración de fechas — la fecha falsa del Panel viejo (3-ago-2026)', () => {

  // El día que Joan abrió el Panel viejo y se le grabó a todo el mundo.
  const DIA_DEL_PANEL = '2026-07-17';
  const CORTE = '2026-05-15';

  // Tal cual quedó un crédito del Panel VIEJO: esquema con `abonos` y `total`,
  // pagado:true ya escrito, y la fechaPagado falsa encima.
  const viejo = (fechaAbono, fechaPagado) => ({
    id: 'v1', numero: 1, socioId: 'a', capital: 200000, costoPct: 20,
    total: 240000, fechaDesembolso: '2026-05-01', cicloActual: CORTE,
    cicloPago: CORTE, pagado: true, fechaPagado: fechaPagado, gananciaPago: 40000,
    abonos: [{ fecha: '2026-05-05', monto: 100000 }, { fecha: fechaAbono, monto: 140000 }],
    prorrogas: [], abonosCapital: [], comprobantes: []
  });

  // Uno del Panel de HOY: nunca trae `abonos` (crea `abonosCapital`), y su
  // fechaPagado la escribió pagarTotal() el día real del pago.
  const nuevo = (fechaPagado) => ({
    id: 'n1', numero: 2, socioId: 'a', capital: 200000, costoPct: 20,
    fechaDesembolso: '2026-05-01', cicloActual: CORTE, cicloPago: CORTE,
    pagado: true, fechaPagado: fechaPagado, gananciaPago: 40000,
    prorrogas: [], abonosCapital: [], comprobantes: []
  });

  const normalizado = p => P.normalizar({ socios: [], prestamos: [p] }).prestamos[0];

  test('VIEJO PAGADO EN FECHA — recupera el factor completo, que es lo que se ganó', () => {
    // Pagó el mismo día del corte; la fecha falsa dice dos meses después.
    const p = normalizado(viejo(CORTE, DIA_DEL_PANEL));
    assert.equal(p.fechaPagado, CORTE, 'la fecha del último abono, no la del Panel');
    assert.equal(P.esPuntual(p), true);
    assert.equal(P.garantiaGanadaCredito(p), 30000, 'el 75% de los 40.000 de costo');
    // El número exacto del defecto: acreditaba la mitad.
    assert.notEqual(P.garantiaGanadaCredito(p), 15000);
  });

  test('VIEJO PAGADO TARDE DE VERDAD — sigue dando la mitad, no se le regala nada', () => {
    // Pagó cinco días después del corte. La fecha falsa también hay que
    // corregirla, pero al corregirla SIGUE siendo posterior al corte.
    const p = normalizado(viejo('2026-05-20', DIA_DEL_PANEL));
    assert.equal(p.fechaPagado, '2026-05-20', 'la fecha real del pago, no la del Panel');
    assert.equal(P.esPuntual(p), false, 'el 20-may sigue siendo después del 15-may');
    assert.equal(P.garantiaGanadaCredito(p), 15000, 'el 37,5%: pagó tarde y eso no cambió');
  });

  test('NUEVO PAGADO EN FECHA — la fecha buena no se toca', () => {
    const p = normalizado(nuevo(CORTE));
    assert.equal(p.fechaPagado, CORTE);
    assert.equal(P.esPuntual(p), true);
    assert.equal(P.garantiaGanadaCredito(p), 30000);
  });

  test('NUEVO PAGADO TARDE — tampoco se toca, y sigue siendo tarde', () => {
    const p = normalizado(nuevo('2026-05-20'));
    assert.equal(p.fechaPagado, '2026-05-20');
    assert.equal(P.esPuntual(p), false);
    assert.equal(P.garantiaGanadaCredito(p), 15000);
  });

  test('el criterio: no se pudo pagar DESPUÉS del abono que lo cerró', () => {
    // Es la única regla, y se puede leer suelta.
    assert.equal(P.fechaPagadoCorregida(viejo(CORTE, DIA_DEL_PANEL)), CORTE);
    assert.equal(P.fechaPagadoCorregida(viejo(CORTE, CORTE)), CORTE, 'ya era buena');
    assert.equal(P.fechaPagadoCorregida(nuevo(DIA_DEL_PANEL)), DIA_DEL_PANEL,
      'sin abonos no hay con qué comparar: se respeta la que trae');
  });

  test('un crédito pagado sin ningún abono no se inventa una fecha', () => {
    // Sin evidencia no se deduce nada: deducirle el corte lo haría puntual de
    // oficio, y eso sería inventar garantía en vez de rescatarla.
    const sinAbonos = nuevo('2026-06-30');
    sinAbonos.abonos = [];
    assert.equal(P.fechaPagadoCorregida(sinAbonos), '2026-06-30');
    assert.equal(P.esPuntual(normalizado(sinAbonos)), false);
  });

  test('el que no trae fechaPagado sigue deduciéndola (el arreglo original)', () => {
    const p = viejo(CORTE, null);
    delete p.pagado;              // como llega de un respaldo viejo de verdad
    delete p.fechaPagado;
    assert.equal(normalizado(p).fechaPagado, CORTE);
  });

  test('el socio ve la fecha corregida, no la del día que Joan abrió el Panel', () => {
    const db = P.normalizar({
      socios: [{ id: 'a', numero: 1, nombre: 'Ana', cedula: '1020304050', telefono: '3001112233' }],
      prestamos: [viejo(CORTE, DIA_DEL_PANEL)]
    });
    const m = P.migrarSocio(db, db.socios[0]);
    assert.equal(m.creditos[0].fecha_pagado, CORTE);
    assert.equal(m.creditos[0].garantia, 30000);
    assert.equal(m.garantia.pagados_a_tiempo, 1, 'y le cuenta para el nivel');
  });
});

/* ==========================================================================
 * LA CORRECCIÓN DE FECHAS NO PUEDE INVENTAR GARANTÍA — 3-ago-2026
 *
 * La segunda pasada del arreglo de arriba sacó la corrección del
 * `if (p.pagado === undefined)` y la dejó corriendo como REGLA PERMANENTE: en
 * cada carga del Panel, sobre cada crédito pagado. El criterio ("un crédito no
 * se pudo pagar después del abono que LO CERRÓ") supone que el último abono
 * cerró el crédito, y en el esquema viejo `abonos` guarda también PARCIALES.
 *
 * Medido, y es el caso que se coló: crédito de 200.000 al 20%, corte 15-may,
 * UN abono parcial de 100.000 el 15-may que no cerró nada. Joan lo cobra hoy,
 * con 80 días de mora: 40.000 de costo + 160.000 de recargo, 90.000 de
 * garantía. Cierra el Panel, lo vuelve a abrir, y la fecha se reescribía al
 * 15-may: el crédito pasaba a PUNTUAL y la garantía saltaba a 180.000, el
 * doble, por un historial que no existe. Y estable: en la tercera carga ya no
 * se movía, así que ni Joan ni el socio tenían cómo notarlo.
 *
 * El arreglo son dos cosas: el criterio solo se aplica si los abonos SUMAN el
 * total (única forma de saber que el último cerró el crédito), y es una
 * MIGRACIÓN —una vez por crédito, con constancia— y no una regla.
 * ======================================================================== */

describe('la migración de fechas corre UNA vez y no inventa garantía', () => {

  const CORTE = '2026-05-15';
  const DIA_DEL_PANEL = '2026-07-17';
  const HOY = '2026-08-03';           // el día que Joan lo cobró, 80 días tarde

  // Crédito VIEJO (esquema con `abonos` y `total`) con UN abono PARCIAL que no
  // cerró nada, cobrado por el Panel de HOY: pagarTotal() le dejó la fecha real
  // que tecleó Joan y la huella `cobroRegistrado`.
  const parcialCobradoHoy = () => ({
    id: 'v1', numero: 1, socioId: 'a', capital: 200000, costoPct: 20,
    total: 240000, fechaDesembolso: '2026-05-01', cicloActual: CORTE,
    cicloPago: CORTE, pagado: true, fechaPagado: HOY, cobroRegistrado: true,
    gananciaPago: 200000, recargoMora: 160000,      // 40.000 de costo + 160.000
    abonos: [{ fecha: CORTE, monto: 100000 }],      // PARCIAL: 100.000 de 240.000
    prorrogas: [], abonosCapital: [], comprobantes: []
  });

  const normalizado = p => P.normalizar({ socios: [], prestamos: [p] }).prestamos[0];

  test('EL NÚMERO DEL DEFECTO: 75.000 de garantía, no 150.000', () => {
    // Lo que le corresponde el día del cobro: pagó, pero pagó tarde.
    const liq = M.liquidarCredito(
      { capital: 200000, costo: 40000, fecha_corte: CORTE }, HOY);
    assert.equal(liq.dias_mora, 80);
    assert.equal(liq.recargo_mora, 160000, '1% diario sobre los 200.000');
    assert.equal(liq.costo_total_pagado, 200000);
    assert.equal(liq.garantia_generada, 75000, 'el 37,5% de 200.000');

    const p = parcialCobradoHoy();
    assert.equal(P.esPuntual(p), false);
    assert.equal(P.garantiaGanadaCredito(p), 75000);
    assert.notEqual(P.garantiaGanadaCredito(p), 150000,
      'el factor completo sobre 200.000 es lo que acreditaba la regresión');
  });

  test('VOLVER A ABRIR EL PANEL NO LE MUEVE LA FECHA NI LA GARANTÍA', () => {
    // La segunda carga es donde se corrompía: acá tiene que quedar igual.
    let p = normalizado(parcialCobradoHoy());
    assert.equal(p.fechaPagado, HOY, 'la fecha que tecleó Joan al cobrar');
    assert.equal(P.esPuntual(p), false);
    assert.equal(P.garantiaGanadaCredito(p), 75000);
    // Y la tercera, y la cuarta: no hay deriva.
    for (let i = 0; i < 3; i++) p = normalizado(parcialCobradoHoy());
    assert.equal(p.fechaPagado, HOY);
    assert.equal(P.garantiaGanadaCredito(p), 75000);
  });

  test('el cobro de este sistema NO se toca, tenga los abonos que tenga', () => {
    const p = parcialCobradoHoy();
    assert.equal(P.migrarFechaPagado(p), false, 'ni se lo mira: trae cobroRegistrado');
    assert.equal(p.fechaPagado, HOY);
    assert.equal(p.fechaPagadoMigrada, undefined, 'no hace falta marcarlo');
    // Ni siquiera cuando los abonos SÍ cierran el crédito: la fecha de un cobro
    // real gana siempre, porque es la que tecleó Joan.
    const cerrado = parcialCobradoHoy();
    cerrado.abonos = [{ fecha: CORTE, monto: 240000 }];
    assert.equal(P.migrarFechaPagado(cerrado), false);
    assert.equal(cerrado.fechaPagado, HOY);
  });

  test('abonos que no cierran el crédito no son evidencia de nada', () => {
    // El mismo crédito SIN la huella del cobro (así quedó lo que Joan cobró con
    // el Panel de ayer). Como los abonos no suman el total, la fecha se respeta:
    // deducirla sería inventar puntualidad.
    const p = parcialCobradoHoy();
    delete p.cobroRegistrado;
    assert.equal(P.abonosCierranElCredito(p), false, '100.000 de 240.000');
    assert.equal(P.fechaPagadoCorregida(p), HOY);
    assert.equal(P.migrarFechaPagado(p), true, 'pasa por la migración…');
    assert.equal(p.fechaPagado, HOY, '…y no le cambia nada');
    assert.equal(P.garantiaGanadaCredito(p), 75000);
  });

  test('varios abonos parciales que tampoco cierran: lo mismo', () => {
    const p = parcialCobradoHoy();
    delete p.cobroRegistrado;
    p.abonos = [{ fecha: '2026-05-05', monto: 60000 },
                { fecha: CORTE, monto: 40000 }];
    assert.equal(P.abonosCierranElCredito(p), false, '100.000 de 240.000, en dos');
    assert.equal(P.fechaPagadoCorregida(p), HOY);
  });

  test('y los abonos que SÍ suman el total siguen rescatando al cliente viejo', () => {
    // Esta es la población que el arreglo vino a salvar y no se puede perder.
    const p = {
      id: 'v2', numero: 2, socioId: 'a', capital: 200000, costoPct: 20,
      total: 240000, fechaDesembolso: '2026-05-01', cicloActual: CORTE,
      cicloPago: CORTE, pagado: true, fechaPagado: DIA_DEL_PANEL,
      gananciaPago: 40000,
      abonos: [{ fecha: '2026-05-05', monto: 100000 },
               { fecha: CORTE, monto: 140000 }],   // 240.000: cierran
      prorrogas: [], abonosCapital: [], comprobantes: []
    };
    assert.equal(P.abonosCierranElCredito(p), true);
    assert.equal(P.migrarFechaPagado(p), true);
    assert.equal(p.fechaPagado, CORTE, 'la fecha del abono que lo cerró');
    assert.equal(P.esPuntual(p), true);
    assert.equal(P.garantiaGanadaCredito(p), 30000, 'el 75% que se ganó');
  });

  test('LA MIGRACIÓN CORRE UNA SOLA VEZ Y DEJA CONSTANCIA', () => {
    const p = {
      id: 'v3', numero: 3, socioId: 'a', capital: 200000, costoPct: 20,
      total: 240000, fechaDesembolso: '2026-05-01', cicloActual: CORTE,
      cicloPago: CORTE, pagado: true, fechaPagado: DIA_DEL_PANEL,
      gananciaPago: 40000,
      abonos: [{ fecha: CORTE, monto: 240000 }],
      prorrogas: [], abonosCapital: [], comprobantes: []
    };
    assert.equal(P.migrarFechaPagado(p), true, 'la primera vez sí');
    assert.match(String(p.fechaPagadoMigrada), /^\d{4}-\d{2}-\d{2}$/,
      'la constancia es el día en que corrió');
    assert.equal(P.migrarFechaPagado(p), false, 'la segunda ya no');

    // Y con la marca puesta, aunque después se le escriba otra fecha —un cobro
    // corregido a mano, un import— la migración no se la vuelve a pisar.
    p.fechaPagado = '2026-06-30';
    assert.equal(P.migrarFechaPagado(p), false);
    assert.equal(p.fechaPagado, '2026-06-30');
    assert.equal(P.fechaPagadoCorregida(p), '2026-06-30');
  });

  test('un crédito abierto ni entra a la migración', () => {
    const p = parcialCobradoHoy();
    p.pagado = false;
    assert.equal(P.migrarFechaPagado(p), false);
  });

  test('el socio ve lo mismo que Joan: 75.000, en las dos pantallas', () => {
    const db = P.normalizar({
      socios: [{ id: 'a', numero: 1, nombre: 'Ana', cedula: '1020304050', telefono: '3001112233' }],
      prestamos: [parcialCobradoHoy()]
    });
    const s = db.socios[0];
    const m = P.migrarSocio(db, s);
    assert.equal(m.creditos[0].fecha_pagado, HOY);
    assert.equal(m.creditos[0].garantia, 75000);
    assert.equal(P.garantiaGanadaDe(db, s), 75000);
    assert.equal(m.garantia.pagados_a_tiempo, 0,
      'no se le regala un pago puntual que no existió: era lo que le subía el nivel');
  });
});

/* ==========================================================================
 * LAS PRÓRROGAS YA COBRADAS NO SE DEGRADAN HACIA ATRÁS
 *
 * garantiaGanadaDe aplicaba esPuntual(p) —que solo mira el pago FINAL— a todo
 * gananciaCobrada(p), que incluye los costos de las prórrogas ya pagadas. Una
 * prórroga pagada puntualmente hace meses caía del 90% al 45% el día que el
 * crédito terminaba pagándose tarde. El motor dice lo contrario: aplicarProrroga
 * acredita con acumularGarantia(costo, true), siempre, y la decisión D6 lo dice
 * explícito.
 * ======================================================================== */

describe('las prórrogas ya cobradas conservan su factor siempre (3-ago-2026)', () => {

  const CORTE = '2026-05-15';
  const conProrroga = (fechaPagado, pagado) => ({
    id: 'p1', numero: 1, socioId: 'a', capital: 200000, costoPct: 20,
    fechaDesembolso: '2026-04-01', cicloActual: CORTE,
    cicloPago: pagado === false ? null : CORTE,
    pagado: pagado !== false, fechaPagado: fechaPagado,
    gananciaPago: pagado === false ? 0 : 40000,
    prorrogas: [{ fecha: '2026-04-30', monto: 40000 }],
    abonosCapital: [], comprobantes: []
  });

  test('EL PAGO FINAL TARDE NO LE BAJA EL FACTOR A LA PRÓRROGA YA PAGADA', () => {
    const p = conProrroga('2026-05-20');
    assert.equal(P.esPuntual(p), false, 'el final sí se pagó tarde');
    // Prórroga 40.000 al 75% = 30.000 · costo final 40.000 al 37,5% = 15.000.
    assert.equal(P.garantiaGanadaCredito(p), 45000);
    // El defecto: 80.000 enteros a la mitad = 30.000. Le comía 15.000 ya ganados.
    assert.notEqual(P.garantiaGanadaCredito(p), 30000);
  });

  test('y la prórroga acredita lo mismo que le acreditó el motor el día que se pagó', () => {
    assert.equal(M.aplicarProrroga({
      capital: 200000, fecha_corte: CORTE, estado: 'en_corte',
      prorrogas_usadas: 0, nivel_socio: 'bronce', id: 'p1'
    }, { fecha: '2026-04-30' }).garantia_generada, M.acumularGarantia(40000, true));
    // 30.000 el día de la prórroga, y 30.000 dos meses después: no se mueve.
    assert.equal(P.garantiaGanadaCredito(conProrroga('2026-05-20')) -
                 M.acumularGarantia(40000, false), 45000 - 15000);
  });

  test('todo puntual: prórroga y costo final, los dos al factor completo', () => {
    assert.equal(P.garantiaGanadaCredito(conProrroga(CORTE)), 60000);
  });

  test('la prórroga ya suma aunque el crédito siga abierto', () => {
    const abierto = conProrroga(null, false);
    assert.equal(abierto.pagado, false);
    assert.equal(P.garantiaGanadaCredito(abierto), 30000, 'solo la prórroga, al 75%');
  });

  test('la garantía del socio y el detalle crédito por crédito no se separan', () => {
    const db = P.normalizar({
      socios: [{ id: 'a', numero: 1, nombre: 'Ana', cedula: '1020304050', telefono: '3001112233' }],
      prestamos: [conProrroga('2026-05-20')]
    });
    const s = db.socios[0];
    assert.equal(P.garantiaGanadaDe(db, s), 45000);
    assert.equal(P.migrarSocio(db, s).creditos[0].garantia, 45000);
    assert.equal(P.fotoComunidad(db).garantia_construida, 45000);
  });

  test('sin prórrogas nada cambia: el crédito de siempre sigue dando lo mismo', () => {
    const db = dbDePrueba();
    assert.equal(P.garantiaGanadaDe(db, db.socios[0]), 45000);
  });
});

describe('el Panel usa el puente, no una copia suya', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');

  test('crm.html carga ../app/puente.js', () => {
    assert.match(CRM, /<script src="\.\.\/app\/puente\.js"><\/script>/,
      'sin esa línea el Panel se queda con su propia copia de las cuentas');
  });

  test('NINGUNA CUENTA DEL PUENTE SE VUELVE A ESCRIBIR EN crm.html', () => {
    // El defecto original: crm.html tenía su propio migrarSocio, datosKycDe,
    // referidosDe, fotoComunidad y esPuntual. Si alguien vuelve a escribir el
    // cuerpo de una de estas en el Panel, esta prueba lo caza el mismo día.
    const compartidas = [
      'codCliente', 'codCredito', 'codRespaldado', 'capitalActual', 'K',
      'gananciaCobrada', 'capitalRecuperadoDe', 'esPuntual', 'respaldadosDe',
      'saldoCapitalRespaldado', 'garantiaGanadaRespaldado', 'comprometidaDe',
      'garantiaGanadaDe', 'datosKycDe', 'referidosDe', 'fotoComunidad', 'migrarSocio'
    ];
    compartidas.forEach(nombre => {
      // cuerpoEnCRM exige además que la declaración sea ÚNICA: ver el porqué en
      // el bloque grande de abajo (la copia nueva se pega al final y gana).
      assert.match(cuerpoEnCRM(nombre), /PUENTE\./,
        nombre + ' volvió a escribirse dentro de crm.html — ahí nacen las dos verdades');
    });

    /* Y la alarma general, para los nombres que no están en ninguna lista: en
       crm.html NINGUNA función se declara dos veces. Un archivo de 3.000 líneas
       con dos `function capitalActual(` no tiene una copia de más: tiene una
       que corre y otra que engaña al que la lee. */
    const re = /(^|[^\w.$])function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    const cuantas = {}; let m;
    while ((m = re.exec(CRM)) !== null) cuantas[m[2]] = (cuantas[m[2]] || 0) + 1;
    const repetidas = Object.keys(cuantas).filter(n => cuantas[n] > 1);
    assert.deepEqual(repetidas, [],
      'crm.html declara dos veces: ' + repetidas.join(', ') + '. Por hoisting corre '
      + 'la ÚLTIMA, así que la de arriba —la que se lee y la que revisan las '
      + 'pruebas— no es la que usa el Panel');
  });

  test('la llave del localStorage también sale del puente', () => {
    assert.equal(P.LLAVE_PANEL, 'joan_socios_v1');
    assert.match(CRM, /const KEY\s*=\s*PUENTE\.LLAVE_PANEL;/,
      'si el Panel y la app apuntan a llaves distintas, la app no ve nada');
  });

  /* ========================================================================
   * 5-ago-2026 — LAS DOCE CUENTAS HISTÓRICAS, Y NINGUNA SE VUELVE A ESCRIBIR
   *
   * La prueba de acá arriba caza las copias por NOMBRE: mira solo la primera
   * línea de la declaración y exige que diga `PUENTE.`. Eso alcanzaba mientras
   * las copias se llamaban igual que la función del puente. Estas doce no: se
   * llaman `diasMora`, `estadoPrestamo`, `tramoDe`, `eventosDia`… y cada una
   * escribía a mano una cuenta que el puente ya sabía hacer —restar
   * `hoy - p.cicloActual`, comparar cortes, partir el monto de una prórroga.
   *
   * `p.cicloActual` es EL PRESENTE. Una prórroga lo corre al futuro y un plan de
   * pagos lo pone en la primera cuota, así que TODA pregunta sobre el pasado
   * contestada con él contesta distinto que el puente. Y dos de las doce salían
   * por WhatsApp al celular del cliente (ver el bloque siguiente).
   *
   * Por eso acá se lee el cuerpo COMPLETO (llaves balanceadas) y se piden dos
   * cosas: que la respuesta la PIDA al puente, y que la cuenta vieja no esté.
   *
   * 5-ago-2026 (noche) — Y LA PRUEBA MIRABA LA PRIMERA; LA QUE CORRE ES LA
   * ÚLTIMA. Esta alarma no sonaba. Comprobado: se pegaron al final de crm.html
   * tres declaraciones nuevas de `estadoPrestamo`, `diasMora` y `tramoDe`, con
   * la cuenta vieja escrita a mano, y las 404 pruebas pasaron en verde mientras
   * el navegador, por hoisting, corría ESAS. La causa es de una línea:
   * `search()` devuelve la PRIMERA coincidencia y JavaScript se queda con la
   * ÚLTIMA declaración del mismo nombre. La copia no hacía falta esconderla:
   * bastaba con pegarla más abajo.
   *
   * Por eso ahora se buscan TODAS las declaraciones del nombre y dos ya es el
   * defecto —aunque las dos digan `PUENTE.`—: en un archivo así, la de arriba
   * es la que se lee y la de abajo la que cobra.
   * ====================================================================== */
  function declaracionesEnCRM(nombre) {
    // El prefijo evita que `obj.function` o un nombre más largo cuenten como
    // declaración; el escaneo es global, de la primera línea a la última.
    const re = new RegExp(String.raw`(^|[^\w.$])function\s+${nombre}\s*\(`, 'g');
    const cuerpos = []; let m;
    while ((m = re.exec(CRM)) !== null) {
      const i = m.index + m[1].length;
      let n = 0;
      for (let k = CRM.indexOf('{', i); k < CRM.length; k++) {
        if (CRM[k] === '{') n++;
        else if (CRM[k] === '}' && --n === 0) { cuerpos.push(CRM.slice(i, k + 1)); break; }
      }
      re.lastIndex = i + 1;
    }
    return cuerpos;
  }
  function cuerpoEnCRM(nombre) {
    const todas = declaracionesEnCRM(nombre);
    assert.ok(todas.length > 0, 'crm.html ya no declara ' + nombre + ': revisá quién lo usa');
    assert.equal(todas.length, 1,
      'crm.html declara ' + nombre + ' ' + todas.length + ' veces. Por hoisting corre '
      + 'la ÚLTIMA: la copia nueva se pega al final del archivo y gana sin tocar '
      + 'una sola línea de la buena');
    return todas[0];
  }

  /* Las doce, con la puerta del puente que tiene que usar cada una y la cuenta
     vieja que no puede volver a aparecer. */
  const LAS_DOCE = [
    // ¿Está vencido? La declara el puente, que recorre la línea de tiempo.
    { f: 'estadoPrestamo', pide: ['PUENTE.estabaVencido', 'PUENTE.corteDelCredito'],
      prohibido: [/86400000/, /v\s*<\s*h/] },
    // Cuántos días de atraso: los del paquete que también cobra la pantalla.
    { f: 'diasMora', pide: ['PUENTE.liquidarCiclo'], prohibido: [/86400000/] },
    // Cuántos faltan: contra el corte que el PUENTE dice que rige.
    { f: 'diasPara', pide: ['PUENTE.corteDelCredito'], prohibido: [] },
    // El tramo del §9, con los días de atraso del puente y no una segunda resta.
    { f: 'tramoDe', pide: ['PUENTE.liquidarCiclo'], prohibido: [/86400000/] },
    // El crédito en idioma del motor: el corte y el §4-bis salen del puente.
    { f: 'creditoMotor', pide: ['PUENTE.corteDelCredito', 'PUENTE.liquidarCiclo',
                                'estuvo_en_mora'], prohibido: [] },
    // A qué corte pasa una prórroga: desde el corte que rige, no desde el campo.
    { f: 'nuevoCicloProrroga', pide: ['PUENTE.corteDelCredito'], prohibido: [] },
    // La garantía de una prórroga, CON el crédito (§4-bis).
    { f: 'garantiaDeProrroga', pide: ['PUENTE.garantiaGanadaProrroga(pr,p)'],
      prohibido: [/acumularGarantia/] },
    // De qué está hecho su monto: lo parte el puente, no una resta de acá.
    { f: 'costoDeProrroga', pide: ['PUENTE.costoDeProrroga'], prohibido: [/monto\s*-/] },
    { f: 'moraDeProrroga', pide: ['PUENTE.moraDeProrroga'], prohibido: [/monto\s*-/] },
    // Qué había en la calle en una quincena PASADA: capital y corte de ese día.
    { f: 'invertidoEnQuincena', pide: ['PUENTE.capitalVigenteEn', 'PUENTE.corteVigenteEn'],
      prohibido: [/capitalActual/] },
    { f: 'porCobrarEnQuincena', pide: ['PUENTE.corteDelCredito'], prohibido: [] },
    // Qué vencía ESE día del calendario, no qué vence hoy.
    { f: 'eventosDia', pide: ['PUENTE.corteVigenteEn'], prohibido: [] }
  ];

  test('LAS DOCE CUENTAS HISTÓRICAS SE PREGUNTAN AL PUENTE, NO SE ESCRIBEN', () => {
    assert.equal(LAS_DOCE.length, 12, 'eran doce: si aparece otra, va a esta lista');
    LAS_DOCE.forEach(c => {
      const cuerpo = cuerpoEnCRM(c.f);
      c.pide.forEach(puerta => {
        assert.ok(cuerpo.replace(/\s+/g, '').indexOf(puerta.replace(/\s+/g, '')) >= 0,
          c.f + ' tiene que preguntarle ' + puerta + ' al puente: si lo calcula acá, '
          + 'el Panel y el celular del socio vuelven a decir dos cosas del mismo crédito');
      });
      c.prohibido.forEach(re => {
        assert.doesNotMatch(cuerpo, re,
          c.f + ' volvió a escribir la cuenta vieja (' + re + ') dentro de crm.html');
      });
      /* Y la regla de fondo, para las doce: ninguna contesta leyendo el corte de
         HOY. `p.cicloActual` es un resumen del presente; el pasado lo tiene la
         línea de tiempo del puente. */
      assert.doesNotMatch(cuerpo, /cicloActual/,
        c.f + ' volvió a leer p.cicloActual — ahí nacen las dos verdades');
    });
  });

  /* Y las dos que YA contestaban distinto, las que salían por WhatsApp. */
  test('el WhatsApp no puede decir un número y la pantalla de cobro otro', () => {
    const vars = cuerpoEnCRM('aplicarVars');
    /* {dias_mora}: salía de una resta contra p.cicloActual. Medido — un crédito
       cobrado el 15-jul (pago EN FECHA), mirado el 5-ago: el mensaje de mora
       decía «Tu pago de $0 sigue pendiente (21 días)» y el puente dice 0. */
    assert.match(vars, /\{dias_mora\}'\s*,\s*p\s*\?\s*String\(diasMora\(p\)\)/,
      '{dias_mora} tiene que salir de diasMora(), que ahora es el puente');
    /* {prorroga}: salía de totalProrroga(p), que devuelve 0 cuando el crédito
       está en PLAN DE PAGOS y devuelve el precio del PLAN cuando ya no le
       quedan prórrogas. El WhatsApp decía «puedes dejar la prórroga de $0»
       mientras la pantalla del mismo crédito decía «de acá no se sale
       prorrogando». Ahora se ofrece solo cuando el motor dice que se puede. */
    assert.doesNotMatch(vars, /totalProrroga/,
      '{prorroga} no puede salir de totalProrroga: contesta 0 con plan de pagos');
    assert.match(vars, /prorrogaOfrecida\(p\)/,
      '{prorroga} sale de prorrogaOfrecida(), que exige el ok del motor');
    assert.match(vars, /of==null\?'—'/,
      'el token nunca puede volver a imprimir $0');
    assert.match(vars, /sinFraseProrroga\(txt\)/,
      'sin prórroga que ofrecer, la frase que la ofrecía se cae del mensaje');
    // {fecha_pago} también: con plan de pagos el corte es la cuota que sigue.
    assert.match(vars, /\{fecha_pago\}'[^\n]*PUENTE\.corteDelCredito\(p\)/,
      '{fecha_pago} tiene que salir del corte que el puente dice que rige');
    const ofrecida = cuerpoEnCRM('prorrogaOfrecida');
    assert.match(ofrecida, /r\s*&&\s*r\.ok/,
      'sin r.ok, el mensaje ofrece una prórroga que el motor ya negó');
    assert.match(ofrecida, /null/,
      'cuando no hay prórroga que ofrecer la respuesta es null, no 0');
  });

  /* Lo que el puente contesta de verdad para el crédito de la medición: si esto
     falla, la copia del Panel no era el único problema. */
  test('el crédito cobrado EN FECHA no tiene ni un día de mora (la medición)', () => {
    const p = { id: 'm1', numero: 1, socioId: 'a', capital: 200000, costoPct: 20,
      fechaDesembolso: '2026-07-03', cicloActual: '2026-07-15', cicloPago: '2026-07-15',
      pagado: true, fechaPagado: '2026-07-15', gananciaPago: 40000, cobroRegistrado: true,
      prorrogas: [], abonosCapital: [], comprobantes: [] };
    assert.equal(P.esPuntual(p), true);
    assert.equal(P.estabaVencido(p, '2026-08-05'), false, 'pagó el día del corte');
    assert.equal(P.liquidarCiclo(p, '2026-08-05').dias_mora, 0, 'la resta decía 21');
    assert.equal(P.liquidarCiclo(p, '2026-08-05').total_a_pagar, 0);
  });

  /* Y el crédito con plan de pagos: el motor NIEGA la prórroga, así que no hay
     número que ofrecer. El Panel decía $0; la pantalla, «de acá no se sale». */
  test('con plan de pagos no hay prórroga que ofrecer (la otra medición)', () => {
    const p = { id: 'm2', numero: 1, socioId: 'a', capital: 200000, costoPct: 20,
      fechaDesembolso: '2026-06-20', cicloActual: '2026-08-15', pagado: false,
      prorrogas: [
        { fecha: '2026-06-30', ciclo: '2026-06-30', monto: 40000, mora: 0,
          aTiempo: true, diasMora: 0, nuevoCiclo: '2026-07-15' },
        { fecha: '2026-07-15', ciclo: '2026-07-15', monto: 40000, mora: 0,
          aTiempo: true, diasMora: 0, nuevoCiclo: '2026-07-31' }
      ],
      planPagos: { creado: '2026-07-31', tasa_por_corte: 0.05,
        entrada: { fecha: '2026-07-31', ciclo: '2026-07-31', monto: 40000, mora: 0,
                   aTiempo: true, diasMora: 0 },
        total_capital: 200000, total_costo: 20000, total_a_pagar: 220000,
        cuotas: [{ n: 1, fecha: '2026-08-15', capital: 66667, costo: 10000, total: 76667,
                   pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 }] },
      abonosCapital: [], comprobantes: [] };
    assert.equal(P.tienePlan(p), true);
    /* El motor NIEGA la pregunta —no contesta ok:false, se niega—, que es por lo
       que liqProrroga devuelve null y calcPago no pinta el botón de prórroga.
       Con null, `totalProrroga` daba 0 y el WhatsApp ofrecía «la prórroga de $0».
       Ahora `prorrogaOfrecida` devuelve null y la frase se cae del mensaje. */
    assert.throws(() => M.liquidarProrroga({ id: p.id, capital: P.capitalActual(p),
      tasa_aplicada: 0.20, costo: Math.round(P.K(p)), fecha_corte: P.corteDelCredito(p),
      estado: 'plan_de_pagos', prorrogas_usadas: 2, nivel_socio: 'oro' }, '2026-08-05'),
      /plan_de_pagos/, 'de un plan de pagos no se sale prorrogando');
    // Y el corte que rige es la cuota que sigue, no el corte que compró el plan.
    assert.equal(P.corteDelCredito(p), '2026-08-15');
  });
});

/* ==========================================================================
 * LA BANDEJA NO DECIDE CON NÚMEROS DEL CELULAR DEL CLIENTE
 *
 * El defecto: crearDesdeSolicitud avisaba "está sobre su cupo" leyendo
 * s.sobre_cupo y s.cupo, y registraba el crédito con s.costo, s.total y
 * s.fecha_corte. Esos cinco números los calcula el celular del socio
 * (socio.html → codigoSolicitud) y viajan en un base64 dentro del texto de
 * WhatsApp, o en el p_datos que la app le manda a crear_solicitud. O sea que
 * fallaban de dos maneras:
 *   (a) el socio edita esa cadena antes de mandarla y el Panel no chista;
 *   (b) sin ninguna mala fe, el número es una foto vieja: pidió el lunes, el
 *       martes le dieron un préstamo con garantía, y el cupo del lunes ya no
 *       existe.
 * El Panel tiene el cliente en la mano y la regla en el motor: tiene que
 * recalcular. Estas pruebas son de fuente, como las del puente de arriba: no
 * hay DOM que correr, pero sí hay una línea que no puede volver.
 * ======================================================================== */

describe('la bandeja de solicitudes recalcula, no le cree al cliente', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const cuerpo = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre + ': revisá quién lo usa');
    // Hasta la próxima función de primer nivel: alcanza y sobra para el cuerpo.
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };

  // Los cinco números que nacen en el celular del socio.
  const DEL_CELULAR = ['sobre_cupo', 'cupo', 'costo', 'total', 'fecha_corte'];

  test('crearDesdeSolicitud no lee ni uno de los números que mandó el celular', () => {
    const f = cuerpo('crearDesdeSolicitud');
    DEL_CELULAR.forEach(campo => {
      assert.ok(!new RegExp(String.raw`\bs\.${campo}\b`).test(f),
        'crearDesdeSolicitud volvió a leer s.' + campo + ' — ese número lo calculó ' +
        'el celular del socio; sacalo de tus datos de hoy');
    });
  });

  test('el aviso de cupo sale de revisarCupo, contra el DB', () => {
    const f = cuerpo('crearDesdeSolicitud');
    assert.match(f, /revisarCupo\(\s*cli\s*,/,
      'el cupo se vuelve a sacar acá, con el cliente real y la garantía de hoy');
    assert.match(f, /textoCupo\(/,
      'y el aviso lo arma el mismo texto que usa el alta a mano: una sola verdad');
  });

  test('el crédito se registra con el costo y el corte que calcula el Panel', () => {
    const f = cuerpo('crearDesdeSolicitud');
    assert.match(f, /costoPct\s*:\s*q\.pct/,
      'la tasa es la fija del motor, no la que venga en la solicitud');
    assert.match(f, /cicloActual\s*:\s*q\.corte/,
      'la fecha de corte se calcula desde hoy: si no, una solicitud del 14 abierta ' +
      'el 16 nace vencida, y una editada a mano se regala plazo');
  });

  test('quincenalDeSolicitud toma el monto y nada más, y el costo sale del motor', () => {
    const f = cuerpo('quincenalDeSolicitud');
    assert.match(f, /MotorReglas\.calcularCosto/,
      'el 20% vive en el motor; si se escribe otra vez acá nacen dos verdades');
    DEL_CELULAR.filter(c => c !== 'cupo').forEach(campo => {
      assert.ok(!new RegExp(String.raw`s\s*&&\s*s\.${campo}\b`).test(f),
        'quincenalDeSolicitud solo puede leer s.capital');
    });
    /* 5-ago-2026: el corte ya no sale de la copia del Panel (`quincenaQueAplica`,
       que no conocía la ventana mínima ni corría domingos y festivos) sino del
       motor, que es el mismo que le mostró la fecha al socio en su celular. */
    assert.match(f, /MotorReglas\.calcularFechaCorte\(\s*hoyISO\(\)\s*\)/,
      'el corte se calcula desde hoy, con la regla del motor: si no, una solicitud '
      + 'abierta un día 14 nace con un día de plazo y el corte puede caer domingo');
  });

  test('la fila de la bandeja muestra lo que el Panel va a registrar', () => {
    const f = cuerpo('renderBandeja');
    assert.ok(!/\bs\.sobre_cupo\b/.test(f),
      'la fila volvió a pintar el aviso con el sobre_cupo del celular');
    assert.match(f, /revisarCupo\(\s*cli\s*,\s*q\.capital\s*\)/,
      'el aviso de la fila y el del confirm tienen que salir del mismo cálculo');
  });
});

/* ==========================================================================
 * EL PANEL COBRA LA MORA — 3-ago-2026
 *
 * El defecto: pagarTotal cobraba totalCiclo(p) = capital + costo, sin mora, y
 * guardaba gananciaPago = K(p), también sin mora. Nunca llamaba al motor. Con
 * 600.000 a 9 días de atraso la app del socio y la cartera por tramo decían
 * 774.000, pero la pantalla de cobro decía 720.000 y el botón "Pagó todo
 * (720.000)". Los 54.000 del recargo no se cobraban, no entraban a la ganancia
 * de Joan y no le dejaban garantía al socio: le tocaban 78.300 (el 45% de los
 * 174.000 de costo total) y se le acreditaban 54.000.
 *
 * El producto principal tiene que liquidar como el préstamo con garantía, que
 * sí lo hacía bien: por el motor, con el desglose a la vista.
 * ======================================================================== */

describe('el quincenal se liquida por el motor, con la mora adentro', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const cuerpoCRM = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre + ': revisá quién lo usa');
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };

  // El caso exacto del defecto, hecho con el motor.
  const liq = M.liquidarCredito(
    { capital: 600000, costo: 120000, fecha_corte: '2026-07-25' }, '2026-08-03');

  test('EL NÚMERO DEL DEFECTO: 774.000, no 720.000', () => {
    assert.equal(liq.dias_mora, 9);
    assert.equal(liq.recargo_mora, 54000, '1% diario sobre los 600.000 de capital');
    assert.equal(liq.total_a_pagar, 774000);
    assert.notEqual(liq.total_a_pagar, 720000, 'eso era lo que decía el botón');
  });

  test('LA GARANTÍA DEL SOCIO SALE DEL COSTO TOTAL, RECARGO INCLUIDO', () => {
    assert.equal(liq.costo_total_pagado, 174000, 'costo + recargo');
    assert.equal(liq.garantia_generada, 65250, 'el 37,5% de 174.000: pagó tarde, pero pagó');
    // Lo que acreditaba el Panel: la mitad del costo pelado. 20.250 menos.
    assert.equal(M.acumularGarantia(120000, false), 45000);
    assert.equal(liq.garantia_generada - M.acumularGarantia(120000, false), 20250);
  });

  test('pagarTotal guarda el costo TOTAL como ganancia, no K(p)', () => {
    const f = cuerpoCRM('pagarTotal');
    assert.match(f, /liqCredito\(/,
      'pagarTotal volvió a cobrar sin pasar por el motor');
    assert.match(f, /p\.gananciaPago\s*=\s*liq\.costo_total_pagado/,
      'la ganancia del ciclo es costo + recargo; con K(p) el recargo se regala ' +
      'dos veces: a Joan y a la garantía del socio');
    assert.ok(!/p\.gananciaPago\s*=\s*K\(p\)/.test(f),
      'volvió el gananciaPago = K(p) sin mora');
    assert.match(f, /p\.fechaPagado\s*=\s*f\b/,
      'la fecha del pago es la que registra Joan: es la que decide si esPuntual()');
  });

  /* 5-ago-2026 — la puerta sigue siendo una, pero ahora es la MISMA que la de
     la app del socio: PUENTE.liquidarCiclo. Mientras el Panel llamaba al motor
     por su cuenta —con el capital y el costo que él mismo armaba— y la app leía
     el paquete del puente, el mismo crédito el mismo día valía dos cosas. */
  test('liqCredito es la única puerta, y es la del puente', () => {
    assert.match(cuerpoCRM('liqCredito'), /PUENTE\.liquidarCiclo\(p,fecha\)/,
      'si el Panel se arma la liquidación por su cuenta, nacen dos verdades');
    assert.ok(!/MotorReglas\.liquidarCredito/.test(CRM),
      'el Panel volvió a liquidar el quincenal por fuera del puente');
    assert.ok(!/MotorReglas\.recargoPorMora/.test(CRM),
      'el recargo se está volviendo a multiplicar a mano en crm.html');
  });

  test('la pantalla de cobro muestra capital, costo y mora, y el botón dice la verdad', () => {
    const f = cuerpoCRM('calcPago');
    assert.match(f, /liq\.recargo_mora/, 'el recargo tiene que estar a la vista');
    assert.match(f, /liq\.dias_mora/, 'y cuántos días son');
    assert.match(f, /Pagó todo \(\$\{COP\(liq\.total_a_pagar\)\}\)/,
      'el botón tiene que decir lo que de verdad se va a cobrar');
    assert.ok(!/Pagó todo \(\$\{COP\(totalCiclo\(p\)\)\}/.test(CRM),
      'el botón volvió a salir de una cuenta que no es la del motor');
  });

  test('totalCiclo lleva la mora: una sola cifra en todo el Panel', () => {
    assert.match(cuerpoCRM('totalCiclo'), /liqCredito\(p\)\.total_a_pagar/,
      'la cola, el KPI de mora y la cartera por tramo tienen que decir lo mismo ' +
      'que la pantalla de cobro y que la app del socio');
    // Ni el total ni el recargo se vuelven a sumar acá: los dos salen del mismo
    // paquete, así que no pueden discrepar ni por un peso ni por un día.
    assert.match(cuerpoCRM('moraDe'), /liqCredito\(p\)\.recargo_mora/);
    assert.ok(!/function\s+moraPorDias\s*\(/.test(CRM),
      'volvió la copia del 1% diario que vivía solo en el Panel');
    assert.ok(!/function\s+causadoDelCiclo\s*\(/.test(CRM),
      'volvió la copia de lo causado que vivía solo en el Panel: es la enfermedad ' +
      'de este proyecto, dos verdades sobre el mismo crédito');
    // Y la cartera por tramo ya no puede sumarlo aparte: sería contarlo dos veces.
    assert.ok(!/totalCiclo\(p\)\s*\+\s*MotorReglas\.recargoPorMora/.test(CRM),
      'la cartera por tramo está sumando el recargo dos veces');
  });
});

/* ==========================================================================
 * LA PRÓRROGA NO BORRA EL RECARGO DE MORA — 3-ago-2026
 *
 * Arreglado el cobro total, quedaba abierta la otra puerta, y es justo por la
 * que paga el socio atrasado: registrarProrroga cobraba solo K(p) —el costo
 * pelado— y acto seguido movía p.cicloActual a la quincena siguiente. Como
 * moraDe() calcula el recargo contra cicloActual, TODO el recargo ya causado
 * se borraba: no se cobraba, no quedaba en ningún campo y no le dejaba
 * garantía al socio. Y la pantalla ya le prometía por escrito lo contrario.
 *
 * Medido: 600.000 de capital, 9 días de mora. Antes la prórroga cobraba
 * 120.000 y se evaporaban 54.000. Ahora cobra 174.000 y el recargo queda
 * guardado aparte para que acredite al 45%, sin degradar el costo, que va al
 * 90%.
 * ======================================================================== */

describe('la prórroga cobra el recargo ya causado (3-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const cuerpoCRM = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre + ': revisá quién lo usa');
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };

  test('EL NÚMERO DEL DEFECTO: 174.000, no 120.000', () => {
    assert.equal(M.recargoPorMora(600000, 9), 54000);
    assert.equal(120000 + M.recargoPorMora(600000, 9), 174000);
  });

  /* 4-ago-2026 (tarde): estas tres miraban el texto de una cuenta escrita a mano
     dentro de crm.html. Esa cuenta ya no existe: la hace el motor. Lo que hay
     que seguir defendiendo no es CÓMO se escribe, es que el recargo se cobre y
     quede guardado aparte — y eso ahora se puede probar ejecutando. */
  test('el motor cobra costo + recargo en una sola respuesta', () => {
    const r = M.liquidarProrroga(
      { id: 'x', capital: 600000, tasa_aplicada: 0.20, fecha_corte: '2026-07-25',
        estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'plata' }, '2026-08-03');
    assert.equal(r.costo_prorroga, 120000);
    assert.equal(r.dias_mora, 9);
    assert.equal(r.recargo_mora, 54000);
    assert.equal(r.total_a_pagar, 174000, 'el costo pelado se llevaba 54.000 puestos');
  });

  test('y el recargo viaja APARTE en el movimiento que el Panel guarda', () => {
    const r = M.liquidarProrroga(
      { id: 'x', capital: 600000, tasa_aplicada: 0.20, fecha_corte: '2026-07-25',
        estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'plata' }, '2026-08-03');
    assert.equal(r.movimiento.monto, 174000);
    assert.equal(r.movimiento.mora, 54000,
      'sin `mora` aparte, el puente acreditaría los 174.000 al 90%: garantía regalada');
    assert.equal(r.movimiento.aTiempo, false);
    assert.equal(r.movimiento.nuevoCiclo, r.fecha_corte_nueva);
    // Y el Panel guarda ESE movimiento, no una copia recalculada.
    const f = cuerpoCRM('registrarProrroga');
    assert.match(f, /monto:\s*r\.total_a_pagar/);
    assert.match(f, /mora:\s*r\.recargo_mora/);
    assert.match(f, /aTiempo:\s*r\.a_tiempo/);
    assert.ok(!/moraDe\(p\)/.test(f),
      'volvió a calcular el recargo por su cuenta dentro de registrarProrroga');
  });

  test('la pantalla le dice a Joan lo que de verdad le van a cobrar', () => {
    const f = cuerpoCRM('registrarProrroga');
    assert.match(f, /Costo del ciclo/, 'el desglose tiene que estar a la vista');
    assert.match(f, /r\.dias_mora/);
    assert.match(f, /Recargo por \$\{r\.dias_mora\}/, 'y cuántos días de recargo son');
  });

  test('EL PUENTE PARTE LA PRÓRROGA: cada parte con su factor', () => {
    const conMora = {
      id: 'x1', numero: 1, socioId: 'a', capital: 600000, costoPct: 20,
      fechaDesembolso: '2026-07-01', cicloActual: '2026-08-15',
      pagado: false, prorrogas: [{ fecha: '2026-08-03', ciclo: '2026-07-25',
                                   monto: 174000, mora: 54000 }],
      abonosCapital: [], comprobantes: []
    };
    /* 4-ago-2026: esta prueba decía el costo al factor COMPLETO aunque la
       prórroga se hubiera dejado con nueve días de atraso. Ese era el defecto nº2
       clavado por escrito. El recargo sigue a la mitad —eso estaba bien—, pero
       el costo también, porque esa prórroga se pagó tarde. */
    assert.equal(P.garantiaGanadaCredito(conMora),
      M.acumularGarantia(120000, false) + M.acumularGarantia(54000, false));
    assert.equal(P.garantiaGanadaCredito(conMora), 65250);
    // Y lo que se regalaba: el costo al factor completo en vez de a la mitad.
    assert.equal(M.acumularGarantia(120000, true) + M.acumularGarantia(54000, false)
      - P.garantiaGanadaCredito(conMora), 45000);
  });

  test('las prórrogas VIEJAS no traen `mora`: son todas costo, al factor completo', () => {
    const vieja = {
      id: 'x2', numero: 2, socioId: 'a', capital: 200000, costoPct: 20,
      fechaDesembolso: '2026-04-01', cicloActual: '2026-05-15',
      pagado: false, prorrogas: [{ fecha: '2026-04-30', monto: 40000 }],
      abonosCapital: [], comprobantes: []
    };
    assert.equal(P.garantiaGanadaCredito(vieja), 30000);
  });

  test('un `mora` imposible no puede acreditar de más', () => {
    // Defensivo: la mora nunca puede pasar del monto ni ser negativa, o el
    // reparto 90/45 dejaría de sumar lo que se cobró.
    const raro = {
      id: 'x3', numero: 3, socioId: 'a', capital: 200000, costoPct: 20,
      fechaDesembolso: '2026-04-01', cicloActual: '2026-05-15', pagado: false,
      prorrogas: [{ fecha: '2026-04-30', monto: 40000, mora: 999999 }],
      abonosCapital: [], comprobantes: []
    };
    assert.equal(P.garantiaGanadaCredito(raro), M.acumularGarantia(40000, false));
    raro.prorrogas[0].mora = -5000;
    assert.equal(P.garantiaGanadaCredito(raro), M.acumularGarantia(40000, true));
  });
});

/* ==========================================================================
 * DECIR QUE NO NO PUEDE REGISTRAR NADA — 3-ago-2026
 *
 * En abonarCapital, cuando el abono cubre todo el capital se pregunta si se
 * marca el ciclo como pagado. Si Joan decía que NO, faltaba el `return` y la
 * ejecución caía igual al push del abono: el crédito quedaba con capitalActual
 * 0 y, como K(p) y moraDe() se calculan sobre el capital vigente, el costo del
 * ciclo y el recargo ya causados se volvían cero y desaparecían. El crédito
 * seguía figurando abierto sin deber nada.
 * ======================================================================== */

describe('abonarCapital: decir que no no registra nada (3-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const F = CRM.slice(CRM.indexOf('function abonarCapital('),
                      CRM.indexOf('/* ===== CONFIG ====='));

  test('EL `return` QUE FALTABA', () => {
    const iPreg = F.indexOf('¿Marcar como pagado el ciclo completo?');
    const iRet = F.indexOf('return;', iPreg);
    const iPush = F.indexOf('abonosCapital.push');
    assert.ok(iPreg >= 0 && iPush > iPreg, 'no encontré las dos líneas');
    assert.ok(iRet >= 0 && iRet < iPush,
      'sin el return, decir que NO igual empuja el abono y el crédito queda ' +
      'abierto sin costo, sin recargo y sin capital');
  });

  test('y se le explica a Joan por qué no se registró', () => {
    assert.match(F, /No registré nada/,
      'un botón que no hace nada y no dice nada se aprieta dos veces');
  });

  test('el costo y el recargo que se borraban salen del capital vigente', () => {
    // Es la razón por la que dejar el capital en cero sin cerrar el crédito
    // borra la deuda: las dos cuentas se apoyan en capitalActual.
    assert.equal(P.K({ capital: 600000, costoPct: 20, abonosCapital: [] }), 120000);
    assert.equal(P.K({ capital: 600000, costoPct: 20,
                       abonosCapital: [{ fecha: '2026-08-03', monto: 600000 }] }), 0);
    assert.equal(M.recargoPorMora(0, 9), 0, 'y el recargo del 1% diario, también');
  });
});

/* ==========================================================================
 * LA MARCA NO HACE DE SUJETO — 3-ago-2026
 *
 * "Te escribe Tu Garantía… tu pago de $480.000" se lee "te escribe TU
 * garantía": el nombre del negocio se confunde con el saldo que el socio
 * construyó, y en la misma frase donde está el saldo. socio.html ya pasó a
 * primera persona del plural ("te escribimos", "lo revisamos"); el Panel manda
 * los mensajes que de verdad le llegan al cliente, así que acá pesa más.
 * ======================================================================== */

describe('las plantillas del Panel no ponen la marca de sujeto (3-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const DEF = CRM.slice(CRM.indexOf('const PLANTILLAS_DEF'),
                        CRM.indexOf('let _fechasMigradas'));

  test('ninguna plantilla recomendada dice "Te escribe Tu Garantía"', () => {
    // Se mira solo dentro de comillas de mensaje: los comentarios que explican
    // el defecto sí citan la frase vieja, y tienen que poder hacerlo.
    const mensajes = DEF.match(/m:'(?:[^'\\]|\\.)*'/g) || [];
    assert.ok(mensajes.length >= 10, 'no encontré las plantillas: cambió el formato');
    mensajes.forEach(m => {
      assert.ok(!/[Tt]e escribe (\{negocio\}|Tu Garantía)/.test(m),
        'la marca volvió a hacer de sujeto: ' + m.slice(0, 90));
    });
  });

  test('tampoco el mensaje de "pedirle datos", que va junto a la garantía', () => {
    // Solo el mensaje: el comentario de al lado cita la frase vieja a propósito.
    const cuerpo = CRM.slice(CRM.indexOf('function pedirDatos('),
                             CRM.indexOf('function exportarSocios('));
    const f = cuerpo.slice(cuerpo.indexOf('const msg='), cuerpo.indexOf('openModal('));
    assert.ok(f.length > 100, 'no encontré el mensaje de pedirDatos');
    assert.ok(!/[Tt]e escribe (\{negocio\}|Tu Garantía)/.test(f),
      '"Te escribe Tu Garantía… llevas $100.000 de garantía" es el peor de todos');
    assert.match(f, /Te escribimos/, 'la primera persona del plural, como socio.html');
  });

  test('y lo que Joan ya tenga GUARDADO también se corrige', () => {
    // Arreglar PLANTILLAS_DEF no alcanza: lo del disco le gana al recomendado,
    // y basta un "Guardar plantillas" viejo para congelar la versión mala.
    const CARGAR = CRM.slice(CRM.indexOf('function cargar()'),
                             CRM.indexOf('function nextNumCliente'));
    assert.match(CARGAR, /e escribe \(\\\{negocio\\\}\|Tu Garantía\)/,
      'las plantillas guardadas se quedan con la frase vieja');
    assert.match(CARGAR, /\$1e escribimos/);

    // Y la corrección es idempotente y quirúrgica: solo esa construcción.
    const arreglar = t => t.replace(/([Tt])e escribe (\{negocio\}|Tu Garantía)/g, '$1e escribimos');
    const antes = 'Hola {nombre}, ¿cómo va todo? Te escribe {negocio} 🙂 Solo para ' +
                  'recordarte que tu pago de {saldo} es el {fecha_pago}.';
    const despues = arreglar(antes);
    assert.match(despues, /Te escribimos 🙂/);
    assert.ok(!/Te escribe/.test(despues));
    assert.equal(arreglar(despues), despues, 'correrla dos veces no cambia nada más');
    // Lo que Joan escribió de su puño y letra no se toca.
    const suyo = 'Hola {nombre}, te escribe Joan del barrio. Tu pago de {saldo}.';
    assert.equal(arreglar(suyo), suyo);
  });
});

/* ==========================================================================
 * LA MISMA GARANTÍA NO RESPALDA DOS CRÉDITOS — 3-ago-2026
 *
 * El defecto: maxRespaldadoDe salía de maximoRespaldado(entradaGarantiaDe(s)),
 * y esa entrada solo descuenta lo comprometido en OTROS préstamos con garantía.
 * El capital QUINCENAL abierto no se descontaba nunca, y guardarRespaldado es un
 * bloqueo duro que Joan cree.
 * Medido con 424.000 de garantía (100.000 de cupón + 324.000 ganada, bronce):
 *   · pidiendo el respaldado primero → 324.000 + 150.000 de cupo, y revisarCupo
 *     avisa si se pasa;
 *   · pidiendo el quincenal primero → 636.000 de cupo Y 324.000 de respaldado
 *     encima, sin un solo aviso en ninguno de los dos pasos.
 * El resultado no puede depender del orden.
 * ======================================================================== */

describe('el respaldo descuenta el quincenal abierto (se pida en el orden que se pida)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const cuerpoCRM = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre + ': revisá quién lo usa');
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };

  const GANADA = 324000, CUPON = 100000, TOTAL = GANADA + CUPON;   // 424.000
  // La entrada del motor, con el cupón ya sumado a mano para no depender del
  // KYC: lo que se prueba acá es la aritmética del cupo, no de dónde sale.
  const entrada = comprometida => ({
    acumulada: GANADA, ajuste: 0, comprometida: comprometida, datos: {}, referidos: []
  });
  const cupoDe = comprometida =>
    M.calcularCupo(Math.max(0, TOTAL - Math.min(comprometida, GANADA)), 'bronce');

  test('ORDEN A — primero el respaldado: consume los 424.000 y ni uno más', () => {
    const respaldado = M.maximoRespaldado(entrada(0));
    assert.equal(respaldado, GANADA, 'se lleva toda la ganada libre');
    const cupo = cupoDe(respaldado);
    assert.equal(cupo, 100000, 'le quedan los 100.000 prestados, uno a uno');
    // Garantía consumida = respaldado (uno a uno) + la que sostiene el quincenal.
    assert.equal(respaldado + M.garantiaNecesariaPara(cupo, 'bronce'), TOTAL);
  });

  test('ORDEN B — primero el quincenal: ya no queda respaldo que dar', () => {
    const cupo = cupoDe(0);
    assert.equal(cupo, 424000, 'los 424.000, uno a uno');
    // ESTA es la cuenta que faltaba: lo que ese quincenal se está comiendo.
    const enUso = M.garantiaNecesariaPara(cupo, 'bronce');
    assert.equal(enUso, TOTAL, 'el cupo apalancado se come la garantía entera');
    assert.equal(M.maximoRespaldado(entrada(enUso)), 0, 'no queda nada libre');
    // Lo que pasaba antes: la entrada sin el quincenal adentro.
    assert.equal(M.maximoRespaldado(entrada(0)), GANADA,
      'sin descontarlo se le prestaban 324.000 contra garantía ya comprometida');
  });

  test('los dos órdenes consumen la MISMA garantía: 424.000', () => {
    const a = M.maximoRespaldado(entrada(0));
    const consumidaA = a + M.garantiaNecesariaPara(cupoDe(a), 'bronce');
    const enUso = M.garantiaNecesariaPara(cupoDe(0), 'bronce');
    const consumidaB = enUso + M.maximoRespaldado(entrada(enUso));
    assert.equal(consumidaA, TOTAL);
    assert.equal(consumidaB, TOTAL);
    assert.equal(consumidaA, consumidaB, 'el límite no puede depender del orden');
  });

  test('el Panel descuenta el quincenal abierto, y con la inversa del motor', () => {
    const f = cuerpoCRM('garantiaEnUsoQuincenal');
    assert.match(f, /MotorReglas\.garantiaNecesariaPara/,
      'el cupo va apalancado: cada peso abierto se come 1/factor de garantía, y ' +
      'esa inversa vive en el motor. Si se divide a mano acá, nacen dos verdades');
    assert.match(f, /!p\.pagado/, 'solo el capital que sigue en la calle');
    assert.match(cuerpoCRM('maxRespaldadoDe'), /entradaRespaldoDe/,
      'maxRespaldadoDe volvió a mirar solo los otros préstamos con garantía');
    assert.match(cuerpoCRM('entradaRespaldoDe'), /garantiaEnUsoQuincenal/);
  });

  test('el bloqueo duro de guardarRespaldado ve lo mismo que el tope', () => {
    assert.match(cuerpoCRM('simRespaldado'),
      /simularPrestamoRespaldado\([^)]*entradaRespaldoDe\(s\)/,
      'dentro_del_respaldo es el bloqueo duro: si simula con la entrada vieja, ' +
      'el tope avisa una cosa y el botón deja pasar otra');
  });

  test('y el cupo quincenal NO descuenta dos veces lo suyo', () => {
    // revisarCupo ya cuenta el quincenal abierto aparte (r.abierto). Si además
    // entradaGarantiaDe lo restara, sería el error simétrico del que arreglamos.
    assert.ok(!/function entradaGarantiaDe[^\n]*garantiaEnUsoQuincenal/.test(CRM),
      'entradaGarantiaDe la usa cupoQuincenal: ahí el quincenal ya se cuenta aparte');
    assert.match(cuerpoCRM('revisarCupo'), /abierto\s*\+\s*cap/);
  });
});

/* ==========================================================================
 * EL PANEL NO SE INVENTA SU PROPIO CRITERIO DE FECHAS — 3-ago-2026
 *
 * El criterio que rescata la fechaPagado falsa del Panel viejo vive en el
 * puente (fechaPagadoCorregida) y está probado más arriba con las cuatro
 * poblaciones. Lo que se cierra acá es la otra mitad: que crm.html lo APLIQUE y
 * no escriba el suyo. Si cada archivo dedujera la fecha a su manera, el Panel y
 * el celular del socio mostrarían dos garantías del mismo cliente el mismo día.
 * ======================================================================== */

describe('el Panel y la app usan el MISMO criterio de fecha', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const CARGAR = CRM.slice(CRM.indexOf('function cargar()'),
                           CRM.indexOf('function nextNumCliente'));

  test('cargar() aplica el criterio del puente', () => {
    assert.match(CARGAR, /PUENTE\.migrarFechaPagado\(p\)/,
      'sin esta línea los créditos del Panel viejo se quedan con la fecha falsa');
    // Y lo aplica como MIGRACIÓN, no escribiendo la fecha a mano: la versión
    // anterior hacía `p.fechaPagado = PUENTE.fechaPagadoCorregida(p)` en cada
    // carga, que es exactamente la regresión del 3-ago (ver el bloque de abajo).
    assert.ok(!/p\.fechaPagado\s*=\s*PUENTE\.fechaPagadoCorregida/.test(CARGAR),
      'volvió la corrección como REGLA PERMANENTE: pisa la fecha en cada carga');
  });

  test('Y LO APLICA FUERA DEL `if (p.pagado === undefined)`', () => {
    // Ahí estaba el defecto original: la población a rescatar ya viene con
    // pagado:true grabado en el disco, así que adentro del `if` no se la
    // alcanza nunca.
    const i = CARGAR.indexOf('if(p.pagado===undefined)');
    const j = CARGAR.indexOf('PUENTE.migrarFechaPagado');
    assert.ok(i >= 0 && j > i, 'no encontré las dos líneas');
    const enMedio = CARGAR.slice(i, j);
    // El bloque del `if` tiene que estar cerrado antes de llegar a la migración.
    assert.equal((enMedio.match(/\{/g) || []).length,
                 (enMedio.match(/\}/g) || []).length,
      'la corrección quedó DENTRO del if: es exactamente la puerta que dejaba ' +
      'afuera a los créditos que el Panel viejo ya marcó como pagados');
    assert.match(CARGAR, /if\(p\.pagado&&PUENTE\.migrarFechaPagado\(p\)\)/);
  });

  test('y la constancia se GRABA en la misma carga que la escribió', () => {
    // Si la marca `fechaPagadoMigrada` se quedara solo en memoria hasta el
    // próximo guardar(), la "migración de una sola vez" volvería a correr en
    // cada apertura del Panel: sería la regla permanente otra vez, con otro
    // nombre.
    assert.match(CRM, /if\(_fechasMigradas\)\s*guardar\(\)/,
      'la constancia de la migración nunca llega al disco');
    assert.match(CARGAR, /_fechasMigradas\s*=\s*0/,
      'el contador tiene que arrancar en cero en cada carga; si no, un import ' +
      'posterior graba por lo que tocó la carga anterior o no graba nada');
    // El import reemplaza el localStorage entero: trae justo la población vieja.
    const IMP = CRM.slice(CRM.indexOf('function importar('),
                          CRM.indexOf('/* ===== NAV / MODAL / PIN'));
    assert.match(IMP, /DB=cargar\(\);\s*if\(_fechasMigradas\)\s*guardar\(\)/,
      'después de importar un respaldo la migración corre y no deja constancia');
  });

  test('y no vuelve a deducir la fecha por su cuenta', () => {
    assert.ok(!/isoLocal\(new Date\(\)\)/.test(CARGAR),
      'esa era la línea del Panel VIEJO: estampaba hoy como fecha de pago');
    assert.ok(!/fechaPagado\s*=\s*hoyISO\(\)/.test(CARGAR),
      'lo mismo escrito de otra manera');
  });
});

/* ==========================================================================
 * LA MARCA DE AGUA DE LA BARRA SE VE — 3-ago-2026
 *
 * Con transform:rotate(-90deg) y transform-origin:left bottom la caja rotada se
 * va ENTERA hacia la izquierda del anclaje. Medido a 1280x800: la barra ocupa
 * x 0..228 con overflow:hidden y la marca de agua ocupaba x −147..−6. Cero
 * píxeles visibles. Se comprueba con getBoundingClientRect —offsetWidth no ve la
 * transformación, y por eso el informe anterior la dio por buena—; ya arreglada
 * quedó medida en x 4..66, y 272..718: dentro de la barra y en una sola línea.
 * Acá se deja clavado que la regla que la escondía no vuelva.
 * ======================================================================== */

describe('la marca de agua del Panel no se sale de la barra', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const REGLA = CRM.slice(CRM.indexOf('.side .marcagua{'),
                          CRM.indexOf('}', CRM.indexOf('.side .marcagua{')));

  test('no vuelve el rotate(-90deg) con origen en la esquina', () => {
    assert.ok(!/transform-origin:\s*left bottom/.test(REGLA),
      'con ese origen la caja rotada se va entera a las x negativas');
    assert.ok(!/rotate\(-90deg\)/.test(REGLA));
  });

  test('el texto se compone vertical y no puede partirse en dos líneas', () => {
    assert.match(REGLA, /writing-mode:\s*vertical-rl/,
      'corre a lo alto de la barra (800px) y no a lo ancho (228px), donde el ' +
      'nombre nuevo mide 339px y partía en dos');
    assert.match(REGLA, /white-space:\s*nowrap/);
  });

  test('queda anclada dentro de la barra, no en x negativa', () => {
    assert.match(REGLA, /left:\s*\d+px/);
    assert.ok(!/left:\s*-/.test(REGLA), 'left negativo la saca de la barra');
  });
});

/* ==========================================================================
 * LA PRÓRROGA TIENE QUE COMPRAR TIEMPO DE VERDAD — 4-ago-2026
 *
 * Arreglado que la prórroga cobrara el recargo (3-ago), quedaron a la vista dos
 * defectos que ese cobro destapó, y los dos pasaban las 280 pruebas:
 *
 *   1. APLAZABA A UNA FECHA QUE YA HABÍA PASADO. El corte nuevo salía de
 *      proximaQuincena(cicloActual): la quincena siguiente al corte VIEJO. Con
 *      más de 16 días de mora esa quincena ya pasó. Medido, hoy 4-ago con corte
 *      del 15-jul y 600.000 de capital: el socio pagaba 240.000, el corte
 *      quedaba en 31-jul —hace cuatro días— y el crédito volvía a figurar en
 *      mora en el mismo instante. Y la mora nueva volvía a correr del 31-jul al
 *      4-ago: días que el socio acababa de pagar, cobrados dos veces.
 *      Pagaba hasta 204.000 por una prórroga que no le compraba un solo día.
 *
 *   2. DEJAR LA PRÓRROGA PAGABA MÁS QUE PAGAR LA DEUDA. El costo acreditaba
 *      siempre al 90%, también con veinte días de atraso. Con los mismos
 *      240.000 de costos: dejar la prórroga 162.000 de garantía, saldar todo
 *      108.000. 54.000 de regalo al que no paga —162.000 más de cupo en
 *      platino— y una lección al revés justo para el socio ahogado.
 * ======================================================================== */

describe('la prórroga aplaza a una fecha del FUTURO (4-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const fnCRM = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre);
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };
  /* La función del Panel se ejecuta DE VERDAD, no se le mira el texto: un
     source-scan no habría cazado ninguno de los dos defectos de arriba.
     4-ago-2026 (tarde): desde que la fecha la contesta el motor, al sandbox hay
     que pasarle MotorReglas. Que HAGA FALTA pasárselo ya es media prueba.
     5-ago-2026: y ahora también PUENTE, porque el corte del que arranca la
     prórroga ya no lo lee del campo `p.cicloActual` sino que se lo pregunta al
     puente. Que haga falta pasárselo es, otra vez, media prueba. */
  const nuevoCicloProrroga = new Function('MotorReglas', 'PUENTE',
    fnCRM('isoLocal') + '\n' + fnCRM('hoyISO') + '\n' +
    fnCRM('proximaQuincena') + '\n' + fnCRM('nuevoCicloProrroga') + '\n' +
    'return nuevoCicloProrroga;')(M, P);

  const HOY = '2026-08-04';
  const conCorte = corte => ({ cicloActual: corte });

  test('EL DEFECTO, EN UNA LÍNEA: la quincena siguiente al corte VIEJO ya pasó', () => {
    // Esto es exactamente lo que hacía registrarProrroga, y por qué dolía.
    const viejo = new Function(fnCRM('isoLocal') + '\n' + fnCRM('proximaQuincena') +
      '\nreturn proximaQuincena;')();
    assert.equal(viejo('2026-07-15'), '2026-07-31');
    assert.ok(viejo('2026-07-15') < HOY, 'aplazaba a cuatro días ATRÁS');
    assert.ok(viejo('2026-06-30') < HOY, 'con 35 días de mora, a veinte días atrás');
  });

  test('3, 20 y 35 días de mora: el corte nuevo SIEMPRE queda adelante de hoy', () => {
    // Los tres cortes de la prueba de navegador, medidos contra el mismo día.
    [['2026-08-01', 3], ['2026-07-15', 20], ['2026-06-30', 35]].forEach(([corte, dias]) => {
      const nuevo = nuevoCicloProrroga(conCorte(corte), HOY);
      assert.ok(nuevo > HOY,
        'con ' + dias + ' días de mora el corte nuevo (' + nuevo + ') no compra un solo día');
      assert.ok(nuevo > corte, 'y tiene que correr el corte, no dejarlo donde estaba');
    });
  });

  test('con 20 y con 35 días compra hasta el 15-ago, no hasta un corte que ya pasó', () => {
    assert.equal(nuevoCicloProrroga(conCorte('2026-07-15'), HOY), '2026-08-15');
    assert.equal(nuevoCicloProrroga(conCorte('2026-06-30'), HOY), '2026-08-15');
  });

  test('NO SE RECOBRAN DÍAS: el recargo nuevo arranca después del que se cobró', () => {
    /* El recargo que cobra la prórroga cubre [corte viejo → hoy]. Si el corte
       nuevo quedara antes de hoy, la mora nueva volvería a correr sobre días ya
       pagados. Como el corte nuevo es posterior a hoy, no se repite ninguno. */
    const CAP = 600000;
    assert.equal(M.recargoPorMora(CAP, 20), 120000, 'lo que se cobra hoy');

    const antes = '2026-07-31';                       // lo que hacía el Panel
    const diasRecobrados = Math.round(
      (new Date(HOY + 'T00:00:00') - new Date(antes + 'T00:00:00')) / 86400000);
    assert.equal(diasRecobrados, 4);
    assert.equal(M.recargoPorMora(CAP, diasRecobrados), 24000,
      '24.000 de recargo nuevo sobre cuatro días que el socio acababa de pagar');

    const ahora = nuevoCicloProrroga(conCorte('2026-07-15'), HOY);
    const diasDesdeElNuevo = Math.round(
      (new Date(HOY + 'T00:00:00') - new Date(ahora + 'T00:00:00')) / 86400000);
    assert.ok(diasDesdeElNuevo < 0, 'el corte nuevo todavía no llega');
    assert.equal(M.recargoPorMora(CAP, Math.max(0, diasDesdeElNuevo)), 0,
      'la prórroga tiene que dejar el crédito SIN recargo corriendo');
  });

  test('sin mora sigue haciendo lo de siempre: corre el corte una quincena', () => {
    // El día del corte (0 días de mora).
    assert.equal(nuevoCicloProrroga(conCorte('2026-08-15'), '2026-08-15'), '2026-08-31');
    // Y anticipada: prorrogar el 10 con corte el 15 tiene que correr igual el
    // corte. Por eso la fecha es la MÁS LEJANA de las dos, no la de hoy a secas.
    assert.equal(nuevoCicloProrroga(conCorte('2026-08-15'), '2026-08-10'), '2026-08-31',
      'con proximaQuincena(hoy) a secas la prórroga anticipada no movía nada');
  });

  test('el Panel usa esa fecha en los tres lugares donde la dice', () => {
    const reg = fnCRM('registrarProrroga');
    assert.match(reg, /p\.cicloActual\s*=\s*r\.fecha_corte_nueva/, 'el corte que se graba');
    assert.match(reg, /pasa a la quincena del \$\{fmtFecha\(r\.fecha_corte_nueva\)\}/,
      'lo que dice el confirm');
    assert.ok(!/proximaQuincena\(p\.cicloActual\)/.test(reg),
      'volvió la quincena siguiente al corte VIEJO');
    assert.match(fnCRM('calcPago'), /fmtFecha\(pr\.fecha_corte_nueva\)/,
      'la pantalla de cobro promete una fecha y el confirm registra otra');
    // Y queda guardado a qué corte pasó de verdad, para el historial.
    assert.match(reg, /nuevoCiclo:\s*r\.fecha_corte_nueva/);
  });

  test('el motor hace lo mismo con su propia prórroga', () => {
    const credito = {
      id: 'CR-9', capital: 600000, tasa_aplicada: 0.20, fecha_corte: '2026-07-15',
      estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'plata'
    };
    const r = M.aplicarProrroga(credito, { fecha: HOY });
    assert.equal(r.ok, true);
    assert.ok(r.credito.fecha_corte > HOY,
      'aplicarProrroga movía el corte al siguiente del VIEJO: ' + r.credito.fecha_corte);
    assert.equal(r.credito.fecha_corte, '2026-08-15');
    // Sin fecha (el caso puntual de siempre) no cambia nada.
    assert.equal(M.aplicarProrroga(credito).credito.fecha_corte, '2026-07-31');
  });
});

describe('dejar la prórroga NO puede rendir más que pagar (4-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const CAP = 600000, COSTO = 120000, DIAS = 20;
  const MORA = M.recargoPorMora(CAP, DIAS);            // 120.000
  const CORTE = '2026-07-15', HOY = '2026-08-04';

  test('EL NÚMERO DEL DEFECTO: 135.000 contra 90.000, por los MISMOS costos', () => {
    assert.equal(MORA, 120000);
    assert.equal(COSTO + MORA, 240000, 'los mismos 240.000 en los dos caminos');
    // Lo que dejaba antes: el costo al factor completo aunque la prórroga fuera
    // tardía. (Con el factor de aquella mañana eran 162.000 contra 108.000.)
    assert.equal(M.acumularGarantia(COSTO, true) + M.acumularGarantia(MORA, false), 135000);
    // Lo que deja saldar todo ese mismo día.
    assert.equal(M.liquidarCredito({ capital: CAP, costo: COSTO, fecha_corte: CORTE }, HOY)
      .garantia_generada, 90000);
    assert.equal(135000 - 90000, 45000, 'el regalo al que no paga');
  });

  test('AHORA LOS DOS CAMINOS DEJAN LO MISMO', () => {
    const prorroga = { fecha: HOY, ciclo: CORTE, monto: COSTO + MORA, mora: MORA,
                       aTiempo: false, diasMora: DIAS };
    const dejarLaProrroga = P.garantiaGanadaProrroga(prorroga);
    const saldarTodo = M.liquidarCredito({ capital: CAP, costo: COSTO, fecha_corte: CORTE }, HOY)
      .garantia_generada;
    assert.equal(dejarLaProrroga, 90000);
    assert.equal(dejarLaProrroga, saldarTodo,
      'el que no paga no puede llevarse más garantía que el que paga');
    assert.ok(dejarLaProrroga <= saldarTodo);
  });

  test('y ninguna de las dos rinde más que haber pagado a tiempo', () => {
    const aTiempo = M.acumularGarantia(COSTO, true);   // 90.000 por 120.000 de costo
    const prorroga = { monto: COSTO + MORA, mora: MORA, aTiempo: false };
    // Pagar tarde deja lo mismo en pesos pero le costó el DOBLE de plata.
    assert.equal(P.garantiaGanadaProrroga(prorroga), aTiempo);
    assert.ok(P.garantiaGanadaProrroga(prorroga) / (COSTO + MORA) <
              aTiempo / COSTO, 'por peso pagado, atrasarse tiene que rendir menos');
  });

  test('LO YA GANADO NO SE BORRA: la prórroga puntual conserva su factor completo', () => {
    const puntual = { fecha: '2026-08-15', ciclo: '2026-08-15', monto: COSTO,
                      mora: 0, aTiempo: true };
    assert.equal(P.garantiaGanadaProrroga(puntual), M.acumularGarantia(COSTO, true));
    // Y sigue valiendo lo mismo aunque el crédito termine pagándose tarde.
    const credito = {
      id: 'z1', numero: 1, socioId: 'a', capital: CAP, costoPct: 20,
      fechaDesembolso: '2026-07-20', cicloActual: '2026-08-31',
      pagado: true, fechaPagado: '2026-09-10', cicloPago: '2026-08-31',
      gananciaPago: COSTO, prorrogas: [puntual], abonosCapital: [], comprobantes: []
    };
    assert.equal(P.garantiaGanadaCredito(credito),
      M.acumularGarantia(COSTO, true) + M.acumularGarantia(COSTO, false));
  });

  test('las prórrogas VIEJAS (sin `mora` ni `aTiempo`) se leen puntuales', () => {
    // No hay dato para decir otra cosa, y quitarles garantía ya acreditada sería
    // romper la promesa por el otro lado.
    assert.equal(P.prorrogaFueATiempo({ fecha: '2026-04-30', monto: 40000 }), true);
    assert.equal(P.garantiaGanadaProrroga({ fecha: '2026-04-30', monto: 40000 }), 30000);
  });

  test('la puntualidad se congela en el dato, no se recalcula', () => {
    // `aTiempo` manda sobre la deducción: si un día cambia cómo se guarda el
    // recargo, la garantía ya acreditada no se mueve.
    assert.equal(P.prorrogaFueATiempo({ monto: 100, mora: 50, aTiempo: true }), true);
    assert.equal(P.prorrogaFueATiempo({ monto: 100, mora: 0, aTiempo: false }), false);
    // Sin el campo, se deduce del recargo: si trajo mora, el corte ya había pasado.
    assert.equal(P.prorrogaFueATiempo({ monto: 100, mora: 50 }), false);
    assert.equal(P.prorrogaFueATiempo({ monto: 100, mora: 0 }), true);
  });

  test('el Panel graba la puntualidad y se la dice a Joan', () => {
    const i = CRM.indexOf('function registrarProrroga(');
    const f = CRM.slice(i, CRM.indexOf('\nfunction ', i + 1));
    assert.match(f, /aTiempo:\s*r\.a_tiempo/,
      'sin esto GRABADO en la prórroga, el puente tiene que adivinar el factor');
    // Punto 3: era el único cobro del Panel que no decía cuánta garantía deja.
    assert.match(f, /Le deja \$\{COP\(r\.garantia_generada\)\} de garantía/,
      'el confirm de la prórroga no le dice a Joan cuánta garantía deja');
    /* 5-ago-2026 §4-bis — la firma cambió: ahora va CON EL CRÉDITO. Sin él el
       puente solo puede mirar la puntualidad congelada en el movimiento, y una
       prórroga registrada en fecha sobre un crédito que YA venía de mora se leía
       al 90%. El número del socio (garantiaGanadaCredito) ya la llamaba así;
       faltaba que el Panel hiciera lo mismo, que es de lo que se trata la
       ronda de crm.html. */
    assert.match(CRM, /function garantiaDeProrroga\(pr,p\)\{ return PUENTE\.garantiaGanadaProrroga\(pr,p\); \}/,
      'la cuenta tiene que salir del puente, o Joan ve un número y el socio otro');
    // Y el número del motor y el del puente tienen que ser EL MISMO: es el que
    // ve Joan en el confirm y el que ve el socio en su celular.
    const r = M.liquidarProrroga(
      { id: 'x', capital: 600000, tasa_aplicada: 0.20, fecha_corte: '2026-07-15',
        estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'plata' }, '2026-08-04');
    assert.equal(P.garantiaGanadaProrroga(r.movimiento), r.garantia_generada);
  });

  test('el motor acredita su prórroga con el mismo criterio', () => {
    const credito = {
      id: 'CR-8', capital: 300000, tasa_aplicada: 0.20, fecha_corte: '2026-07-15',
      estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'plata'
    };
    const tarde = M.aplicarProrroga(credito, { fecha: '2026-08-04' });
    assert.equal(tarde.prorroga_a_tiempo, false);
    assert.equal(tarde.garantia_generada, M.acumularGarantia(60000, false));
    assert.equal(tarde.movimiento.garantia_generada, tarde.garantia_generada);
    const puntual = M.aplicarProrroga(credito, { fecha: '2026-07-15' });
    assert.equal(puntual.prorroga_a_tiempo, true);
    assert.equal(puntual.garantia_generada, M.acumularGarantia(60000, true));
  });
});

/* ==========================================================================
 * LAS DOS PLANTILLAS QUE QUEDARON — 4-ago-2026
 *
 * La corrección del 3-ago solo cazaba "Te escribe {negocio}". Quedaron vivas
 * las dos donde la marca se pega a la garantía del socio o al saldo:
 *   · bienvenida — "gracias por confiar en Tu Garantía… tu primera cuota de
 *     $480.000";
 *   · historial  — "tu historial con Tu Garantía… la garantía que llevas
 *     acumulada", las dos garantías en la misma frase.
 * ======================================================================== */

describe('la marca no se pega a la garantía del socio ni al saldo (4-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const DEF = CRM.slice(CRM.indexOf('const PLANTILLAS_DEF'),
                        CRM.indexOf('let _fechasMigradas'));
  const plantilla = k => {
    const i = DEF.indexOf('\n  ' + k + ':{');
    assert.ok(i >= 0, 'no encontré la plantilla ' + k);
    const m = DEF.slice(i).match(/m:'((?:[^'\\]|\\.)*)'/);
    assert.ok(m, 'no encontré el mensaje de ' + k);
    return m[1];
  };

  test('bienvenida: ni {negocio} ni la marca, y va en primera persona del plural', () => {
    const m = plantilla('bienvenida');
    assert.ok(!/\{negocio\}|Tu Garantía/.test(m),
      '"gracias por confiar en Tu Garantía" + "{monto}" + "{saldo}" en la misma ' +
      'frase: se lee "gracias por confiar en tu garantía"');
    assert.match(m, /\{monto\}/, 'y sigue diciendo lo que tiene que decir');
    assert.match(m, /\{saldo\}/);
    assert.match(m, /te recordamos/, 'primera persona del plural, como las otras');
  });

  test('historial: la garantía del socio no comparte frase con la marca', () => {
    const m = plantilla('historial');
    assert.ok(!/\{negocio\}|Tu Garantía/.test(m),
      '"tu historial con Tu Garantía… la garantía que llevas acumulada"');
    assert.match(m, /la garantía que llevas acumulada/, 'lo suyo se queda');
    assert.match(m, /Te compartimos/);
    assert.match(m, /queremos que tengas claro/);
    assert.match(m, /\{enlace\}/, 'sin el enlace el mensaje no sirve para nada');
  });

  test('NINGUNA plantilla recomendada pone {negocio} junto al saldo o a la garantía', () => {
    const mensajes = DEF.match(/m:'(?:[^'\\]|\\.)*'/g) || [];
    assert.ok(mensajes.length >= 10, 'no encontré las plantillas: cambió el formato');
    mensajes.forEach(m => {
      if (!/\{negocio\}|Tu Garantía/.test(m)) return;
      assert.ok(!/\{saldo\}|garantía/.test(m),
        'la marca vuelve a compartir frase con lo que el socio construyó: ' + m.slice(0, 90));
    });
  });

  test('y lo que Joan ya tenga GUARDADO también se corrige', () => {
    const CARGAR = CRM.slice(CRM.indexOf('function cargar()'),
                             CRM.indexOf('function nextNumCliente'));
    assert.match(CARGAR, /gracias por confiar en/, 'la de bienvenida se queda con la marca');
    assert.match(CARGAR, /historial con/, 'la de historial se queda con la marca');

    // Las tres correcciones, idempotentes y quirúrgicas.
    const arreglar = t => t
      .replace(/([Tt])e escribe (\{negocio\}|Tu Garantía)/g, '$1e escribimos')
      .replace(/gracias por confiar en (\{negocio\}|Tu Garantía)/g, 'gracias por la confianza')
      .replace(/([Tt]u|[Ss]u|[Ee]l) historial con (\{negocio\}|Tu Garantía)/g, '$1 historial de socio');

    const bienv = '¡Hola {nombre}! De corazón, gracias por confiar en {negocio} 🙂 ' +
                  'Ya te quedó entregado tu crédito de {monto}.';
    assert.match(arreglar(bienv), /gracias por la confianza 🙂/);
    assert.ok(!/\{negocio\}/.test(arreglar(bienv)));

    const hist = 'Hola {nombre} 🙂 Te comparto tu historial con Tu Garantía, para que lo veas.';
    assert.match(arreglar(hist), /tu historial de socio, para que lo veas/);
    assert.ok(!/Tu Garantía/.test(arreglar(hist)));

    // Correrlas dos veces no cambia nada más.
    assert.equal(arreglar(arreglar(bienv)), arreglar(bienv));
    assert.equal(arreglar(arreglar(hist)), arreglar(hist));
    // Y lo que Joan escribió de su puño y letra no se toca.
    const suyo = 'Hola {nombre}, gracias por confiar en mí. Tu historial con nosotros es bueno.';
    assert.equal(arreglar(suyo), suyo);
  });
});

/* ==========================================================================
 * LA APP DICE LO QUE DE VERDAD PASA — 4-ago-2026
 *
 * socio.html le seguía prometiendo al socio que la prórroga se aplica "pagando
 * el costo", cuando el Panel cobra costo + recargo desde el 3-ago. El texto sale
 * de reglasResumen(), que es la única fuente de las reglas que ve el socio.
 * ======================================================================== */

describe('la app no le promete al socio una prórroga que no existe', () => {

  const SOCIO = fs.readFileSync(path.join(__dirname, '..', 'app', 'socio.html'), 'utf8');
  const r = M.reglasResumen();

  test('ya no dice "aplazar pagando el costo" a secas', () => {
    assert.ok(!/aplazar pagando el costo/.test(r.prorroga.texto),
      'el Panel cobra costo + recargo: eso era una promesa que ya no se cumple');
  });

  test('dice el recargo, y con el mismo número que hace la cuenta', () => {
    assert.match(r.prorroga.texto,
      new RegExp((M.TASA_MORA_DIARIA * 100) + '% diario'),
      'si un día cambia la tasa, el texto tiene que cambiar solo');
    assert.match(r.prorroga.texto, /costo de la quincena/);
    assert.match(r.prorroga.texto, /siguiente corte/,
      'y que el corte nuevo queda adelante, que es lo que compra la prórroga');
  });

  test('sigue nombrando la salida al plan de pagos', () => {
    assert.match(r.prorroga.texto, new RegExp(M.CUOTAS_PLAN_DE_PAGOS + ' cortes'));
    assert.match(r.prorroga.texto, new RegExp((M.TASA_PLAN_DE_PAGOS * 100) + '%'));
  });

  test('y es la app la que lo muestra, sin escribir su propia versión', () => {
    assert.match(SOCIO, /esc\(r\.prorroga\.texto\)/,
      'si socio.html escribiera el texto a mano, volverían las dos verdades');
    assert.ok(!/aplazar pagando el costo/.test(SOCIO));
  });
});

/* ==========================================================================
 * LA PRÓRROGA DEL PANEL PASA POR EL MOTOR — 4-ago-2026 (tarde)
 *
 * ARREGLO ESTRUCTURAL, no un parche. Era la tercera vez seguida que tocar
 * registrarProrroga a mano abría un agujero nuevo, y la causa fue siempre la
 * misma: crm.html tenía su propia copia de reglas que el motor YA sabía hacer.
 *
 * `proximaQuincena` no conoce la ventana mínima de 5 días (§7.3) ni corre el
 * corte por domingo o festivo (§7.1). Medido sobre los 24 cortes de 2026 contra
 * los 365 días del año (8.760 combinaciones): daban fechas DISTINTAS en 2.283,
 * y esas caían en 330 de los 365 días. En 92 días del año la prórroga del Panel
 * ni siquiera compraba la ventana mínima: con el corte del 31-jul, una prórroga
 * registrada el 14-ago cobraba el 20% del capital y compraba UN día (pasaba al
 * 15-ago); el motor dice 31-ago, diecisiete días.
 *
 * Las 303 pruebas pasaban con esto vivo porque probaban el motor, y el Panel no
 * lo usaba. Por eso estas pruebas EJECUTAN el código del Panel.
 * ======================================================================== */

describe('el Panel pregunta la fecha de la prórroga, no la calcula (4-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const fnCRM = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre + ': revisá quién lo usa');
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };
  /* La función del Panel, ejecutándose de verdad. Desde el 5-ago-2026 el corte
     de partida sale de PUENTE.corteDelCredito y no del campo `p.cicloActual`:
     por eso el sandbox recibe también el puente. */
  const delPanel = new Function('MotorReglas', 'PUENTE',
    fnCRM('isoLocal') + '\n' + fnCRM('hoyISO') + '\n' +
    fnCRM('proximaQuincena') + '\n' + fnCRM('nuevoCicloProrroga') + '\n' +
    'return {nuevoCicloProrroga: nuevoCicloProrroga, proximaQuincena: proximaQuincena};')(M, P);

  // La copia que el Panel tenía: la más lejana de las dos quincenas ingenuas.
  const comoAntes = (corte, hoy) => {
    const a = delPanel.proximaQuincena(corte), b = delPanel.proximaQuincena(hoy);
    return a > b ? a : b;
  };
  const dias = (desde, hasta) =>
    Math.round((new Date(hasta + 'T00:00:00') - new Date(desde + 'T00:00:00')) / 86400000);

  const DIAS_2026 = (() => {
    const out = [], f = new Date(2026, 0, 1);
    while (f.getFullYear() === 2026) { out.push(M.iso(f)); f.setDate(f.getDate() + 1); }
    return out;
  })();

  // Los 24 cortes nominales de 2026 (el 15 y el último día de cada mes).
  const CORTES_2026 = [0,1,2,3,4,5,6,7,8,9,10,11].reduce((acc, m) =>
    acc.concat(M.cortesNominalesDelMes(2026, m).map(M.iso)), []);

  test('LOS 365 DÍAS: el Panel y el motor dan EXACTAMENTE la misma fecha', () => {
    assert.equal(DIAS_2026.length, 365);
    assert.equal(CORTES_2026.length, 24);
    let pares = 0;
    CORTES_2026.forEach(corte => {
      DIAS_2026.forEach(hoy => {
        pares++;
        assert.equal(delPanel.nuevoCicloProrroga({ cicloActual: corte }, hoy),
          M.fechaCorteProrroga(corte, hoy),
          'corte ' + corte + ', prórroga el ' + hoy + ': el Panel volvió a calcular por su cuenta');
      });
    });
    assert.equal(pares, 24 * 365);
  });

  test('LA MEDIDA DEL DEFECTO: 330 de los 365 días daban otra fecha', () => {
    let difieren = 0, total = 0, corto = 0;
    const diasMalos = new Set(), diasCortos = new Set();
    CORTES_2026.forEach(corte => {
      DIAS_2026.forEach(hoy => {
        total++;
        if (comoAntes(corte, hoy) !== M.fechaCorteProrroga(corte, hoy)) {
          difieren++; diasMalos.add(hoy);
        }
        // Y lo que de verdad dolía: prórrogas que no compraban ni la ventana
        // mínima de 5 días, o sea que nacían casi vencidas.
        if (dias(hoy, comoAntes(corte, hoy)) < M.DIAS_VENTANA_MINIMA) {
          corto++; diasCortos.add(hoy);
        }
      });
    });
    assert.equal(total, 8760, 'los 24 cortes de 2026 contra los 365 días');
    assert.equal(difieren, 2283, 'el 26% de los pares (corte, día) daba otra fecha');
    assert.equal(diasMalos.size, 330, 'y tocaba 330 de los 365 días del año');
    assert.equal(corto, 1104);
    assert.equal(diasCortos.size, 92,
      'en 92 días del año la prórroga del Panel compraba menos de la ventana mínima');
    // El motor no deja pasar ninguna de esas.
    CORTES_2026.forEach(corte => DIAS_2026.forEach(hoy =>
      assert.ok(dias(hoy, M.fechaCorteProrroga(corte, hoy)) >= M.DIAS_VENTANA_MINIMA)));
  });

  test('EL CASO QUE DUELE: prorrogar un día 14 compraba UN día', () => {
    // Corte del 31-jul, el socio prorroga el 14-ago: paga el 20% del capital.
    assert.equal(comoAntes('2026-07-31', '2026-08-14'), '2026-08-15');
    assert.equal(dias('2026-08-14', comoAntes('2026-07-31', '2026-08-14')), 1,
      'un día de plazo por el 20% del capital');
    assert.equal(M.fechaCorteProrroga('2026-07-31', '2026-08-14'), '2026-08-31');
    assert.equal(dias('2026-08-14', M.fechaCorteProrroga('2026-07-31', '2026-08-14')), 17);
    // Y el Panel de hoy contesta lo del motor.
    assert.equal(delPanel.nuevoCicloProrroga({ cicloActual: '2026-07-31' }, '2026-08-14'),
      '2026-08-31');
  });

  test('la fecha nueva siempre respeta la ventana mínima y el calendario', () => {
    CORTES_2026.forEach(corte => {
      DIAS_2026.forEach(hoy => {
        const nueva = M.fechaCorteProrroga(corte, hoy);
        assert.ok(nueva > corte, 'no corrió el corte: ' + corte + ' → ' + nueva);
        assert.ok(dias(hoy, nueva) >= M.DIAS_VENTANA_MINIMA,
          'compró menos de ' + M.DIAS_VENTANA_MINIMA + ' días: ' + hoy + ' → ' + nueva);
        assert.ok(M.esDiaHabilDeCorte(nueva), nueva + ' cae domingo o festivo');
      });
    });
  });

  test('y el mismo motor la usa para su propia prórroga: una sola respuesta', () => {
    CORTES_2026.forEach(corte => {
      ['2026-01-07', '2026-04-14', '2026-08-04', '2026-12-29'].forEach(hoy => {
        const r = M.aplicarProrroga(
          { id: 'x', capital: 500000, tasa_aplicada: 0.20, fecha_corte: corte,
            estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'plata' }, { fecha: hoy });
        assert.equal(r.fecha_corte_nueva, M.fechaCorteProrroga(corte, hoy));
        assert.equal(r.credito.fecha_corte,
          delPanel.nuevoCicloProrroga({ cicloActual: corte }, hoy));
      });
    });
  });

  test('crm.html no vuelve a escribir ninguna de las tres cuentas', () => {
    assert.match(fnCRM('nuevoCicloProrroga'), /MotorReglas\.fechaCorteProrroga/,
      'volvió proximaQuincena adentro de la prórroga');
    assert.match(fnCRM('liqProrroga'), /MotorReglas\.liquidarProrroga/);
    assert.match(fnCRM('totalProrroga'), /liqProrroga\(/,
      'el precio de la prórroga volvió a sumarse a mano en el Panel');
    assert.match(fnCRM('registrarProrroga'), /liqProrroga\(p,\s*f\)/,
      'registrarProrroga tiene que preguntar, no calcular');
    // Y el crédito se traduce al idioma del motor en un solo lugar.
    assert.match(fnCRM('creditoMotor'), /prorrogas_usadas/);
    assert.match(fnCRM('creditoMotor'), /nivel_socio/);
  });
});

/* ==========================================================================
 * EL TOPE DE PRÓRROGAS Y LA SALIDA OBLIGATORIA — 4-ago-2026
 *
 * El motor limita las prórrogas a min(PRORROGAS_POR_NIVEL, TOPE_DURO) — 1 en
 * bronce, 2 en el resto — y al agotarlas devuelve ok:false CON el plan de pagos
 * armado. El Panel lo ignoraba: se podían encadenar prórrogas infinitas, y la
 * app del socio le prometía al cliente un plan de pagos que Joan no tenía dónde
 * anotar.
 * ======================================================================== */

describe('el tope de prórrogas por nivel y el plan de pagos (§5 y §8)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const fnCRM = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre);
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };
  const credito = extra => Object.assign({
    id: 'CR-1', capital: 600000, tasa_aplicada: 0.20, fecha_corte: '2026-06-30',
    estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'bronce'
  }, extra);

  test('bronce 1, plata/oro/platino 2 — y el tope duro manda', () => {
    assert.equal(M.prorrogasPermitidas('bronce'), 1);
    assert.equal(M.prorrogasPermitidas('plata'), 2);
    assert.equal(M.prorrogasPermitidas('oro'), 2);
    assert.equal(M.prorrogasPermitidas('platino'), 2);
    M.NIVELES.forEach(n => assert.ok(M.prorrogasPermitidas(n) <= M.TOPE_DURO_PRORROGAS));
  });

  test('la segunda prórroga de un bronce no se registra: se le ofrece el plan', () => {
    const r = M.liquidarProrroga(credito({ prorrogas_usadas: 1 }), '2026-08-04');
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'prorrogas_agotadas');
    assert.equal(r.prorrogas_permitidas, 1);
    assert.equal(r.prorrogas_restantes, 0);
    assert.ok(r.plan_de_pagos, 'el ok:false tiene que traer la salida, no solo el no');
    assert.equal(r.plan_de_pagos.cuotas.length, M.CUOTAS_PLAN_DE_PAGOS);
  });

  test('un plata sí tiene la segunda, y ahí se le acaban', () => {
    const uno = M.liquidarProrroga(credito({ nivel_socio: 'plata', prorrogas_usadas: 1 }), '2026-08-04');
    assert.equal(uno.ok, true);
    assert.equal(uno.prorrogas_restantes, 0);
    const dos = M.liquidarProrroga(credito({ nivel_socio: 'plata', prorrogas_usadas: 2 }), '2026-08-04');
    assert.equal(dos.ok, false);
  });

  test('EL PLAN NO NACE VENCIDO: arranca en el corte siguiente a HOY', () => {
    // Corte del 30-jun y hoy 4-ago: las dos primeras cuotas del plan armado
    // desde el corte (15-jul y 31-jul) ya habían pasado.
    const desdeElCorte = M.construirPlanDePagos({ capital: 600000, fecha_corte: '2026-06-30' });
    assert.deepEqual(desdeElCorte.cuotas.map(c => c.fecha_corte),
      ['2026-07-15', '2026-07-31', '2026-08-15']);
    const r = M.liquidarProrroga(credito({ prorrogas_usadas: 1 }), '2026-08-04');
    r.plan_de_pagos.cuotas.forEach(c =>
      assert.ok(c.fecha_corte > '2026-08-04', 'cuota vencida al nacer: ' + c.fecha_corte));
    assert.deepEqual(r.plan_de_pagos.cuotas.map(c => c.fecha_corte),
      ['2026-08-15', '2026-08-31', '2026-09-15']);
  });

  test('y lo ya causado se cobra al pactarlo: el plan tampoco borra el recargo', () => {
    const r = M.liquidarProrroga(credito({ prorrogas_usadas: 1 }), '2026-08-04');
    assert.equal(r.dias_mora, 35);
    assert.equal(r.costo_prorroga, 120000);
    assert.equal(r.recargo_mora, 210000, '1% diario sobre 600.000 por 35 días');
    assert.equal(r.total_a_pagar, 330000);
    // El plan sale más barato que seguir prorrogando: esa es la idea del §8.
    assert.ok(r.plan_de_pagos.total_costo < r.costo_prorroga);
  });

  test('el Panel ofrece el plan y lo REGISTRA (antes ignoraba el ok:false)', () => {
    const reg = fnCRM('registrarProrroga');
    assert.match(reg, /if\(!r\.ok\)\s*return ofrecerPlanDePagos\(p,r\)/,
      'el Panel volvió a ignorar que se acabaron las prórrogas');
    const ofr = fnCRM('ofrecerPlanDePagos');
    assert.match(ofr, /r\.plan_de_pagos/, 'el plan que se muestra es el del motor');
    assert.match(ofr, /registrarPlanDePagos/, 'y tiene que haber dónde registrarlo');
    const rp = fnCRM('registrarPlanDePagos');
    assert.match(rp, /p\.planPagos=/, 'sin esto el plan sigue sin poder anotarse');
    assert.match(rp, /plan\.cuotas\.map/, 'las cuotas quedan materializadas, no se recalculan');
    assert.match(rp, /entrada:\{/, 'lo cobrado al pactarlo tiene que quedar guardado');
    assert.match(rp, /p\.cicloActual=p\.planPagos\.cuotas\[0\]\.fecha/,
      'el crédito tiene que vencer en la primera cuota del plan');
    // Y de un plan no se sale prorrogando.
    assert.match(fnCRM('creditoMotor'), /plan_de_pagos/);
    assert.ok(M.ESTADOS_SIN_PRORROGA.indexOf('plan_de_pagos') >= 0);
  });

  test('EL PUENTE SABE COBRAR EL PLAN: cada cuota con su propio factor', () => {
    const entrada = { fecha: '2026-08-04', ciclo: '2026-06-30', monto: 330000,
                      mora: 210000, aTiempo: false, diasMora: 35 };
    const p = {
      id: 'pp1', numero: 1, socioId: 'a', capital: 600000, costoPct: 20,
      fechaDesembolso: '2026-06-01', cicloActual: '2026-08-31', pagado: false,
      prorrogas: [{ fecha: '2026-07-10', ciclo: '2026-06-30', monto: 120000, mora: 0, aTiempo: true }],
      abonosCapital: [{ fecha: '2026-08-15', monto: 200000, cuotaPlan: 1 }],
      comprobantes: [],
      planPagos: { creado: '2026-08-04', tasa_por_corte: 0.05, entrada: entrada,
        cuotas: [
          { n: 1, fecha: '2026-08-15', capital: 200000, costo: 30000, total: 230000,
            pagado: true, fechaPagado: '2026-08-15', recargo: 0, garantiaGenerada: 27000 },
          { n: 2, fecha: '2026-08-31', capital: 200000, costo: 20000, total: 220000,
            pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 },
          { n: 3, fecha: '2026-09-15', capital: 200000, costo: 10000, total: 210000,
            pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 }
        ] }
    };
    assert.equal(P.tienePlan(p), true);
    assert.equal(P.cuotaPlanActual(p).n, 2, 'la que sigue es la 2');
    // El "ciclo" del crédito es la cuota, no todo el capital.
    assert.equal(P.capitalDelCiclo(p), 200000);
    assert.equal(P.K(p), 20000, 'el costo del ciclo es el de la cuota, no el 20% del saldo');
    assert.equal(P.capitalActual(p), 400000, 'el saldo sí bajó con la cuota 1');
    // Lo cobrado: la prórroga de antes + la entrada del plan + la cuota pagada.
    assert.equal(P.gananciaCobrada(p), 120000 + 330000 + 30000);
    // Y la garantía, cada parte con su factor congelado.
    /* 5-ago-2026 §4-bis — la cuota 1 se pagó el día de su corte y ANTES daba
       27.000 (el 90%). Pero este crédito estuvo vencido desde el 1-jul: un plan
       de pagos existe porque el crédito ya se atrasó, y el 90% es del ciclo que
       nunca se atrasó. La prórroga de julio conserva su 90%: su puntualidad está
       congelada en su propio dato y esto no la recalcula. */
    assert.equal(P.garantiaGanadaCredito(p),
      M.acumularGarantia(120000, true)                                       // prórroga puntual
      + M.acumularGarantia(120000, false) + M.acumularGarantia(210000, false) // entrada, tardía
      + M.acumularGarantia(30000, false));                                   // cuota 1, al 45%
    assert.equal(P.estuvoEnMora(p, '2026-08-03'), true, 'venía de un mes vencido');
  });

  test('un crédito sin plan no cambia en nada (la regla nueva no se cuela)', () => {
    const p = { capital: 600000, costoPct: 20, abonosCapital: [], prorrogas: [], pagado: false };
    assert.equal(P.tienePlan(p), false);
    assert.equal(P.cuotaPlanActual(p), null);
    assert.equal(P.capitalDelCiclo(p), 600000);
    assert.equal(P.K(p), 120000);
    assert.equal(P.gananciaCobrada(p), 0);
    assert.equal(P.garantiaGanadaCredito(p), 0);
  });
});

/* ==========================================================================
 * LA PRÓRROGA NO LAVA EL HISTORIAL — 4-ago-2026
 *
 * El defecto: la prórroga corre el corte al FUTURO, y esPuntual() compara la
 * fecha de pago contra el corte. O sea que el que prorrogaba y pagaba al día
 * siguiente quedaba registrado como PAGADO EN FECHA por muy atrasado que
 * estuviera. No es un detalle de contabilidad: de ahí salen la racha, los pagos
 * a tiempo y el nivel, y del nivel sale cuánta plata se le presta.
 *
 * MEDIDO — cinco créditos de 200.000 pagados 15 días tarde cada uno, lavados
 * con prórroga: el socio subía a ORO con 893.750 de cupo. Con el mismo
 * comportamiento de pago y sin lavar: bronce, 536.250.
 *
 * LA REGLA: un crédito que necesitó prórroga (o plan de pagos) NO cuenta como
 * "pagado a tiempo" para SUBIR DE NIVEL. Respeta la promesa por los dos lados:
 * no se le quita nada (la garantía que pagó suma igual y el nivel no baja) y no
 * se le regala nada (el premio del puntual es del puntual).
 * ======================================================================== */

describe('la prórroga NO puede lavar el historial (4-ago-2026)', () => {

  test('cuentaComoPuntual: el crédito limpio sí, el prorrogado no', () => {
    assert.equal(M.cuentaComoPuntual({ pagado_en_fecha: true, prorrogas_usadas: 0 }), true);
    assert.equal(M.cuentaComoPuntual({ pagado_en_fecha: true, prorrogas_usadas: 1 }), false);
    assert.equal(M.cuentaComoPuntual({ pagado_en_fecha: true, prorrogas_usadas: 2 }), false);
    assert.equal(M.cuentaComoPuntual({ pagado_en_fecha: false, prorrogas_usadas: 0 }), false);
    // El plan de pagos tampoco: es la misma puerta, un escalón más abajo.
    assert.equal(M.cuentaComoPuntual(
      { pagado_en_fecha: true, prorrogas_usadas: 0, plan_de_pagos: true }), false);
    // Sin datos, no es puntual: no se regala por omisión.
    assert.equal(M.cuentaComoPuntual({}), false);
    assert.throws(() => M.cuentaComoPuntual(null), TypeError);
  });

  const CAP = 200000, COSTO = 40000;
  const socio = () => ({ id: 's1', nombre: 'Ana', cedula: '123456', telefono: '3001112222',
    whatsappIgual: true, referencia: { nombre: '', telefono: '' }, gestiones: [], ajusteGarantia: 0 });
  // Cinco créditos pagados 15 días tarde, lavados con prórroga el día 15 de mora.
  const carteraLavada = () => {
    const s = socio();
    const db = { socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} };
    ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15'].forEach((c, i) => {
      const tarde = M.iso(M.sumarDias(M.aFechaLocal(c), 15));
      const nuevo = M.fechaCorteProrroga(c, tarde);
      const lp = M.liquidarProrroga({ id: 'q' + i, capital: CAP, tasa_aplicada: 0.20,
        fecha_corte: c, estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'bronce' }, tarde);
      db.prestamos.push({ id: 'q' + i, numero: i + 1, socioId: 's1', capital: CAP, costoPct: 20,
        fechaDesembolso: '2026-0' + (i + 1) + '-01', cicloActual: nuevo, cicloPago: nuevo,
        pagado: true, fechaPagado: M.iso(M.sumarDias(M.aFechaLocal(nuevo), -1)),
        gananciaPago: COSTO, prorrogas: [lp.movimiento], abonosCapital: [], comprobantes: [],
        cobroRegistrado: true });
    });
    return { db: db, s: s };
  };

  test('EL NÚMERO DEL DEFECTO: ORO de oficio, pagando 15 días tarde cinco veces', () => {
    const { db, s } = carteraLavada();
    // Los cinco figuran "pagados en fecha": el corte se había movido al futuro.
    assert.equal(db.prestamos.filter(P.esPuntual).length, 5,
      'la prórroga los dejó a todos leyéndose puntuales');
    // Lo que salía con el criterio viejo (esPuntual a secas).
    let racha = 0;
    for (let i = db.prestamos.length - 1; i >= 0; i--) {
      if (P.esPuntual(db.prestamos[i])) racha++; else break;
    }
    const nivelViejo = M.evaluarNivel(5, racha, 6, 'bronce');
    assert.equal(nivelViejo, 'oro');
    /* 5-ago-2026 — EL DEFECTO YA NO SE MIDE EN CUPO, y hay que decir por qué: el
       cupo dejó de depender del nivel (es la garantía, uno a uno), así que subir
       de nivel con trampa ya no abre un peso de crédito. Lo que seguía regalando
       era el ESCALÓN —y con él las prórrogas, que es lo único material que hoy
       da el nivel— y eso es lo que esta prueba fija. */
    assert.equal(M.cupoQuincenal(P.entradaGarantia(db, s), nivelViejo).cupo, 226250);
    assert.equal(M.cupoQuincenal(P.entradaGarantia(db, s), 'bronce').cupo, 226250,
      'con trampa o sin trampa, el cupo es el mismo: el nivel no lo mueve');
    // Lo que sí se regalaba: el doble de prórrogas que un bronce.
    assert.equal(M.prorrogasPermitidas(nivelViejo), 2);
    assert.equal(M.prorrogasPermitidas('bronce'), 1);
  });

  test('AHORA: ninguno cuenta para subir, y el socio se queda en bronce', () => {
    const { db, s } = carteraLavada();
    assert.equal(db.prestamos.filter(P.esPuntualParaNivel).length, 0);
    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.pagados_a_tiempo, 0);
    assert.equal(m.garantia.racha, 0);
    assert.equal(m.garantia.nivel, 'bronce');
    // El cupo es el mismo en los dos niveles: lo que se recupera es el escalón
    // y su prórroga, no plata prestada.
    assert.equal(M.cupoQuincenal(P.entradaGarantia(db, s), m.garantia.nivel).cupo, 226250);
    assert.equal(M.prorrogasPermitidas(m.garantia.nivel), 1,
      'una prórroga, la de bronce: la segunda era el regalo');
  });

  test('NO SE LE QUITA NADA: lo que pagó le sigue sumando, crédito por crédito', () => {
    const { db, s } = carteraLavada();
    /* 5-ago-2026 §4-bis — el pago final de un crédito que se atrasó 15 días y se
       prorrogó NO acredita el factor completo aunque caiga dentro del corte
       nuevo: ese ciclo lo compró la prórroga, no es una quincena limpia. Los tres
       pagos de cada crédito acreditan a la mitad, y siguen acreditando: ni uno
       queda en cero, que es lo que la promesa protege. */
    assert.equal(P.garantiaGanadaDe(db, s), 206250);
    const porCredito = db.prestamos.map(P.garantiaGanadaCredito);
    porCredito.forEach(g => assert.ok(g > 0, 'a un crédito prorrogado no se le borra la garantía'));
    assert.equal(porCredito[0],
      M.acumularGarantia(COSTO, false) + M.acumularGarantia(M.recargoPorMora(CAP, 15), false)
      + M.acumularGarantia(COSTO, false));
    // Y el que NUNCA se atrasó conserva su 90%: la regla mira la mora, no la
    // prórroga. Prorrogar en fecha sigue acreditando entero.
    const c = db.prestamos[0];
    assert.equal(P.estuvoEnMora(c, '2026-01-20'), true, 'este sí estuvo vencido');
    assert.equal(P.prorrogaAcreditaEnFecha({ ciclo: '2026-08-15', fecha: '2026-08-15',
      monto: COSTO, mora: 0, aTiempo: true }, { capital: CAP, cicloActual: '2026-08-31',
      prorrogas: [], abonosCapital: [] }), true);
  });

  /* 4-ago-2026 — ESTA PRUEBA SE INVENTABA EL DATO DE ENTRADA.
     Decía `s.nivelSocio = 'oro'` y comprobaba que el nivel no bajara. Pero
     `nivelSocio` NO LO ESCRIBE NADIE en todo el producto: ni el Panel, ni el
     puente, ni la app. O sea que la prueba pasaba con un campo que en la cartera
     real de Joan no existe, y por eso el defecto —el nivel BAJABA— vivió debajo
     de ella sin que nadie lo viera. Ahora el oro se GANA con historial, que es
     la única forma en que un socio de verdad puede llegar a tenerlo. */
  test('Y EL NIVEL NO BAJA NUNCA: el que ya lo alcanzó se lo queda', () => {
    const s = socio();
    const db = { socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} };
    // Cinco créditos limpios seguidos: 5 pagos a tiempo y racha 5 → ORO (§5).
    ['2026-01-15', '2026-01-31', '2026-02-15', '2026-02-28', '2026-03-15'].forEach((c, i) => {
      db.prestamos.push({ id: 'b' + i, numero: i + 1, socioId: 's1', capital: CAP, costoPct: 20,
        fechaDesembolso: M.iso(M.sumarDias(M.aFechaLocal(c), -12)), cicloActual: c, cicloPago: c,
        pagado: true, fechaPagado: c, gananciaPago: COSTO, prorrogas: [],
        abonosCapital: [], comprobantes: [], cobroRegistrado: true });
    });
    assert.equal(P.migrarSocio(db, s).garantia.nivel, 'oro', 'se lo ganó pagando');
    assert.equal(s.nivelSocio, undefined, 'y sin que nadie le escriba ningún campo');

    // Ahora se atrasa tres veces seguidas: racha 0 y meses sin mora en cero.
    ['2026-03-31', '2026-04-15', '2026-04-30'].forEach((c, i) => {
      db.prestamos.push({ id: 'm' + i, numero: 6 + i, socioId: 's1', capital: CAP, costoPct: 20,
        fechaDesembolso: M.iso(M.sumarDias(M.aFechaLocal(c), -12)), cicloActual: c, cicloPago: c,
        pagado: true, fechaPagado: M.iso(M.sumarDias(M.aFechaLocal(c), 12)),
        gananciaPago: COSTO, prorrogas: [], abonosCapital: [], comprobantes: [],
        cobroRegistrado: true });
    });
    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.racha, 0, 'la racha de hoy sí se rompe');
    assert.equal(m.garantia.nivel, 'oro',
      'la promesa es que nadie retrocede: esto solo frena la SUBIDA');
    assert.equal(s.nivelSocio, undefined, 'el puente no escribe nada: es puro');
  });

  test('el nivel NO puede depender de un campo que nadie escribe', () => {
    // La prueba que faltaba: `nivelSocio` era el piso del nivel y ningún archivo
    // del producto lo escribe jamás. Si alguien vuelve a apoyarse en él, que
    // primero tenga que escribirlo de verdad.
    ['panel/crm.html', 'app/socio.html', 'app/puente.js'].forEach(f => {
      const src = fs.readFileSync(path.join(__dirname, '..', ...f.split('/')), 'utf8');
      assert.ok(!/\.nivelSocio\s*=[^=]/.test(src),
        f + ' escribe nivelSocio: si de verdad se persiste, esta prueba se cambia');
    });
    // Y el nivel sale igual sin él.
    const { db, s } = carteraLavada();
    assert.equal(s.nivelSocio, undefined);
    assert.equal(P.migrarSocio(db, s).garantia.nivel, 'bronce');
  });

  test('el crédito limpio sigue subiendo igual de rápido', () => {
    const s = socio();
    const db = { socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} };
    ['2026-01-15', '2026-02-15'].forEach((c, i) => {
      db.prestamos.push({ id: 'l' + i, numero: i + 1, socioId: 's1', capital: CAP, costoPct: 20,
        fechaDesembolso: '2026-0' + (i + 1) + '-01', cicloActual: c, cicloPago: c,
        pagado: true, fechaPagado: c, gananciaPago: COSTO, prorrogas: [],
        abonosCapital: [], comprobantes: [], cobroRegistrado: true });
    });
    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.pagados_a_tiempo, 2);
    assert.equal(m.garantia.racha, 2);
    assert.equal(m.garantia.nivel, 'plata', 'dos pagos limpios ya son plata (§5)');
  });

  test('la regla vive en el motor y el puente la consulta, no la reescribe', () => {
    const PUENTE_SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'puente.js'), 'utf8');
    const i = PUENTE_SRC.indexOf('function esPuntualParaNivel(');
    assert.ok(i >= 0, 'el puente ya no expone el criterio de nivel');
    const cuerpo = PUENTE_SRC.slice(i, PUENTE_SRC.indexOf('\n  }', i));
    assert.match(cuerpo, /M\.cuentaComoPuntual/,
      'si el puente se escribe su propia versión, vuelven las dos verdades');
    /* Y los TRES contadores del nivel tienen que salir de UNA regla.
       5-ago-2026: hasta hoy esta prueba exigía tres llamadas a
       esPuntualParaNivel dentro de contadoresDeNivel, y eso era justamente la
       forma del defecto: cada contador con su propio criterio, y el guardián de
       la mora puesto en uno solo de los tres (meses_sin_mora), que es por lo que
       la racha y los pagos a tiempo premiaban al que no paga. Ahora la regla es
       estadoParaNivel —'gana' / 'rompe' / 'abierto'— y los tres contadores leen
       ese estado. Lo que se exige acá es eso: que ninguno se escriba su propio
       criterio de puntualidad ni de mora. */
    const j = PUENTE_SRC.indexOf('function contadoresDeNivel(');
    assert.ok(j >= 0, 'el puente ya no tiene un solo lugar donde se cuentan los pagos');
    const cont = PUENTE_SRC.slice(j, PUENTE_SRC.indexOf('\n  }', j));
    assert.match(cont, /estadoParaNivel/, 'los contadores dejaron de salir de la regla única');
    assert.ok(!/esPuntual/.test(cont),
      'un contador se escribió su propio criterio de puntualidad');
    assert.ok(!/estabaVencido/.test(cont),
      'un contador se escribió su propio guardián de mora: eso es el parche por requisito');
    const e = PUENTE_SRC.indexOf('function estadoParaNivel(');
    assert.ok(e >= 0, 'la regla única tiene que existir y tener nombre');
    const est = PUENTE_SRC.slice(e, PUENTE_SRC.indexOf('\n  }', e));
    assert.match(est, /esPuntualParaNivel/, 'la regla única consulta el criterio del motor');
    assert.match(est, /estuvoEnMora/, 'y la mora, que es la mitad que faltaba');
    // Y el nivel se deriva con evaluarNivel del motor, no con una escalera propia.
    const k = PUENTE_SRC.indexOf('function nivelDelSocio(');
    assert.ok(k >= 0);
    assert.match(PUENTE_SRC.slice(k, PUENTE_SRC.indexOf('\n  }', k)), /M\.evaluarNivel/);
  });
});

/* ==========================================================================
 * EL RECIBO QUE LE QUEDA AL SOCIO EN EL CELULAR — 4-ago-2026
 *
 * registrarProrroga movía p.cicloActual y RECIÉN DESPUÉS llamaba a
 * gestionar(id,'prorroga'). La plantilla resuelve {prorroga} con
 * totalProrroga(p) = costo + recargo, y el recargo ya valía cero porque el
 * ciclo se había movido al futuro.
 *
 * MEDIDO: capital 600.000, corte 30-jun, prórroga el 4-ago. El socio entrega
 * 330.000 y le llegaba "Listo Ana, ya registré tu prórroga de $120.000".
 * Faltaban 210.000. El confirm que veía Joan sí traía el número bueno.
 * ======================================================================== */

describe('el WhatsApp de la prórroga dice lo que el socio pagó (4-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const fnCRM = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre);
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };
  const COP = n => '$' + Math.round(n || 0).toLocaleString('es-CO');
  // La función del Panel que decide el monto, ejecutándose de verdad.
  const varsDePlantilla = new Function('COP', 'PUENTE',
    fnCRM('ultimaProrroga') + '\n' + fnCRM('varsDePlantilla') +
    '\nreturn varsDePlantilla;')(COP, P);

  const CAP = 600000, CORTE = '2026-06-30', HOY = '2026-08-04';
  const r = M.liquidarProrroga(
    { id: 'x', capital: CAP, tasa_aplicada: 0.20, fecha_corte: CORTE,
      estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'plata' }, HOY);

  test('EL NÚMERO DEL DEFECTO: 330.000 pagados, 120.000 en el mensaje', () => {
    assert.equal(r.total_a_pagar, 330000, 'lo que el socio entrega');
    assert.equal(r.costo_prorroga, 120000, 'lo que decía el WhatsApp');
    assert.equal(r.recargo_mora, 210000);
    // Después de mover el ciclo, recalcular daba solo el costo: el corte nuevo
    // está en el futuro, así que la mora vale cero.
    assert.equal(M.recargoPorMora(CAP, M.diasDeMora(r.fecha_corte_nueva, HOY)), 0);
    assert.equal(330000 - 120000, 210000, 'lo que el mensaje se comía');
  });

  test('el monto sale de la prórroga GRABADA, no de recalcularla', () => {
    const p = { prorrogas: [r.movimiento], cicloActual: r.fecha_corte_nueva };
    assert.deepEqual(varsDePlantilla(p, 'prorroga'), { prorroga: COP(330000) });
    // Y sigue diciendo la verdad mañana, o cuando Joan reabra la gestión.
    assert.equal(varsDePlantilla(p, 'prorroga').prorroga, '$330.000');
  });

  test('en los OTROS mensajes {prorroga} sigue siendo lo que costaría prorrogar', () => {
    const p = { prorrogas: [r.movimiento], cicloActual: r.fecha_corte_nueva };
    assert.deepEqual(varsDePlantilla(p, 'venceHoy'), {},
      '"si no alcanzas, puedes dejar la prórroga de X" habla del futuro, no del pasado');
    assert.deepEqual(varsDePlantilla(p, 'moraTemprana'), {});
  });

  test('si se pasó a plan de pagos, el mensaje cita la entrada del plan', () => {
    const p = { prorrogas: [],
      planPagos: { entrada: { monto: 330000, mora: 210000, aTiempo: false }, cuotas: [] } };
    assert.equal(varsDePlantilla(p, 'prorroga').prorroga, '$330.000');
  });

  test('y un crédito sin prórrogas no inventa ningún monto', () => {
    assert.deepEqual(varsDePlantilla({ prorrogas: [] }, 'prorroga'), {});
    assert.deepEqual(varsDePlantilla(null, 'prorroga'), {});
  });

  test('aplicarVars respeta el monto que le llega, y gestionar se lo pasa', () => {
    const av = fnCRM('aplicarVars');
    assert.match(av, /e\.prorroga!=null\?e\.prorroga:/,
      'volvió a recalcular {prorroga} ignorando lo que se cobró');
    assert.match(fnCRM('gestionar'), /varsDePlantilla\(p,plantKey\)/,
      'el mensaje que se manda no está pidiendo el monto real');
    assert.match(fnCRM('recalcGestion'), /varsDePlantilla\(p,k\)/,
      'al cambiar de plantilla en el desplegable volvía el número viejo');
  });
});

/* ==========================================================================
 * ABONAR EL CAPITAL MENOS UN PESO BORRABA TODA LA DEUDA — 4-ago-2026
 *
 * El costo de la quincena (PUENTE.K) y el recargo del 1% diario salen los dos
 * del capital VIGENTE. Un abono a capital baja ese capital, y con él bajaban
 * las dos cuentas HACIA ATRÁS.
 *
 * MEDIDO: 200.000 de capital, corte 15-jul, cobro el 4-ago (20 días de mora).
 * Costo 40.000 + recargo 40.000 = 80.000 de ganancia. Abonando 199.999 el
 * capital queda en 1 peso: el costo pasa a 1 × 20% = 0,2 → 0 y el recargo a
 * 1% × 1 × 20 = 0,2 → 0. El crédito seguía ABIERTO y ya no debía nada. Joan
 * pasaba de cobrar 80.000 a cobrar CERO. Y el alert de la propia pantalla
 * decía "abona un peso menos": el defecto venía con instrucciones.
 *
 * El arreglo no prohíbe el abono: cada abono CONGELA lo ya causado (costo del
 * ciclo, recargo corrido y a qué corte pertenecen). Lo causado ya está causado.
 * ======================================================================== */

describe('lo causado no depende de cuánto capital quede después (4-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const fnCRM = nombre => {
    const i = CRM.indexOf('function ' + nombre + '(');
    assert.ok(i >= 0, 'crm.html ya no declara ' + nombre + ': revisá quién lo usa');
    const j = CRM.indexOf('\nfunction ', i + 1);
    return CRM.slice(i, j < 0 ? CRM.length : j);
  };
  /* Las funciones del Panel, ejecutándose de verdad contra el motor y el puente.
     5-ago-2026: la lista se acortó porque el Panel dejó de tener copia propia de
     causadoDelCiclo y moraPorDias. Ahora todo entra por liqCredito, que es
     PUENTE.liquidarCiclo — la misma cuenta que la app le muestra al socio. */
  const panel = new Function('MotorReglas', 'PUENTE',
    ['isoLocal', 'hoy0', 'hoyISO', 'capitalActual', 'K',
     'capitalDelCiclo', 'cuotasPlan', 'cuotaPlan', 'tienePlan',
     'moraDe', 'totalCiclo', 'diasMora', 'liqCredito']
      .map(fnCRM).join('\n') +
    '\nreturn {K:K, moraDe:moraDe, totalCiclo:totalCiclo,' +
    ' liqCredito:liqCredito, capitalActual:capitalActual};')(M, P);

  const CAP = 200000, CORTE = '2026-07-15', COBRO = '2026-08-04';   // 20 días
  const dia = n => M.iso(new Date(2026, 6, 15 + n));   // n días después del corte
  const credito = () => ({ id: 'x', socioId: 'a', capital: CAP, costoPct: 20,
    fechaDesembolso: '2026-07-01', cicloActual: CORTE, pagado: false,
    prorrogas: [], abonosCapital: [], comprobantes: [] });

  /* El abono tal como lo graba abonarCapital: una sola liquidación, la del
     puente, congelada ANTES de tocar el capital. `dias` son los días de mora
     que llevaba el crédito ese día, y el abono queda fechado ESE día — que es
     lo que hace el Panel de verdad, y lo que después recorre moraDelCiclo. */
  const abonar = (p, monto, dias) => {
    const f = dia(dias), liq = panel.liqCredito(p, f);
    p.abonosCapital.push({ fecha: f, monto: monto, ciclo: p.cicloActual,
      costoCausado: liq.costo, moraCausada: liq.recargo_mora,
      diasMoraCausada: liq.dias_mora });
    return p;
  };

  test('EL NÚMERO DEL DEFECTO: 80.000 de ganancia contra 0', () => {
    assert.equal(M.diasDeMora(CORTE, COBRO), 20);
    const limpio = panel.liqCredito(credito(), COBRO);
    assert.equal(limpio.costo, 40000, 'el 20% de la quincena');
    assert.equal(limpio.recargo_mora, 40000, '1% diario × 20 días');
    assert.equal(limpio.costo_total_pagado, 80000, 'la ganancia de Joan');
    assert.equal(limpio.total_a_pagar, 280000);

    // Cómo quedaba ANTES: el capital en 1 peso arrastraba las dos cuentas.
    assert.equal(M.recargoPorMora(1, 20), 0, '1% × 1 peso × 20 días redondea a 0');
    assert.equal(Math.round(1 * 20 / 100), 0, 'y el 20% de 1 peso, también');
    /* 5-ago-2026 — acá esta prueba certificaba el defecto: P.K devolvía 0,2.
       El costo del ciclo se causó el día que el ciclo empezó, sobre el capital
       que se debía ESE día, y ningún abono posterior lo puede bajar. */
    const conAbono = credito();
    conAbono.abonosCapital.push({ fecha: COBRO, monto: CAP - 1 });
    assert.equal(P.K(conAbono), 40000,
      'el costo del ciclo ya no sale del capital que QUEDA');
    assert.equal(P.capitalActual(conAbono), 1, 'y el capital sí baja, como debe');
  });

  test('ABONANDO EL CAPITAL MENOS UN PESO ya no se borra nada', () => {
    const p = abonar(credito(), CAP - 1, 20);
    assert.equal(panel.capitalActual(p), 1, 'el capital sí baja: eso está bien');
    const liq = panel.liqCredito(p, COBRO);
    assert.equal(liq.capital, 1);
    assert.equal(liq.costo, 40000, 'el costo de la quincena ya estaba causado');
    assert.equal(liq.recargo_mora, 40000, 'y los 20 días de recargo, también');
    assert.equal(liq.costo_total_pagado, 80000, 'Joan cobra sus 80.000');
    assert.equal(liq.total_a_pagar, 80001);
    // Y la cuenta cierra: el abono más lo que queda es la deuda entera.
    assert.equal((CAP - 1) + liq.total_a_pagar, 280000);
  });

  test('el crédito abierto tampoco MUESTRA cero: la cola dice lo mismo', () => {
    const p = abonar(credito(), CAP - 1, 20);
    assert.equal(panel.K(p), 40000);
    assert.equal(panel.liqCredito(p, COBRO).recargo_mora, 40000);
    assert.equal(panel.liqCredito(p, COBRO).total_a_pagar, 80001);
    // Y la cifra que pinta la cola sale del mismo paquete, no de otra suma.
    assert.equal(panel.totalCiclo(p), panel.liqCredito(p).total_a_pagar);
    assert.equal(panel.moraDe(p), panel.liqCredito(p).recargo_mora);
  });

  test('un abono PARCIAL: no borra lo corrido y no cobra mora sobre lo devuelto', () => {
    // Abona 100.000 el día 20 y salda el día 30.
    const p = abonar(credito(), 100000, 20);
    const liq = panel.liqCredito(p, '2026-08-14');
    assert.equal(liq.dias_mora, 30);
    assert.equal(liq.costo, 40000, 'el costo del ciclo no baja al bajar el capital');
    assert.equal(liq.recargo_mora, 50000,
      '40.000 congelados + 1% × 100.000 × los 10 días que faltaban');
    assert.equal(liq.total_a_pagar, 190000);
    // Sin abonar habría debido 300.000 el día 30. Pagando 100.000 el día 20
    // paga 290.000 en total: los 10.000 que se ahorró son EXACTAMENTE la mora
    // de esos 100.000 durante los 10 días que ya no los debía.
    assert.equal(panel.liqCredito(credito(), '2026-08-14').total_a_pagar, 300000);
    assert.equal(100000 + liq.total_a_pagar, 290000);
    assert.equal(300000 - 290000, M.recargoPorMora(100000, 10));
  });

  test('LA PREGUNTA DE ORO: ¿se puede salir ganando por no pagar?', () => {
    // Barrido: cualquier abono, cualquier día del abono, cualquier día de cobro.
    // Pagar antes NUNCA puede salir más caro que no pagar, y un abono NUNCA
    // puede dejar cobrado menos que lo ya causado el día en que se abonó.
    let pares = 0;
    for (let abono = 1000; abono < CAP; abono += 1000) {
      for (let dAbono = 0; dAbono <= 30; dAbono += 5) {
        const p = abonar(credito(), abono, dAbono);
        const causado = CAP + 40000 + M.recargoPorMora(CAP, dAbono);
        for (let dCobro = dAbono; dCobro <= 60; dCobro += 5) {
          const f = M.iso(new Date(2026, 6, 15 + dCobro));
          const conAbono = abono + panel.liqCredito(p, f).total_a_pagar;
          const sinAbono = panel.liqCredito(credito(), f).total_a_pagar;
          pares++;
          assert.ok(conAbono <= sinAbono + 1,
            'abonar salía más caro que no abonar (' + abono + ' el día ' + dAbono + ')');
          assert.ok(conAbono >= causado - 1,
            'abonando ' + abono + ' el día ' + dAbono + ' se borró parte de lo ya causado');
        }
      }
    }
    assert.ok(pares > 5000, 'el barrido se quedó corto: ' + pares);
  });

  test('la ganancia de Joan nunca baja de la que ya estaba causada', () => {
    [1, 100, 5000, 50000, 100000, 150000, 199000, 199998, 199999].forEach(abono => {
      const p = abonar(credito(), abono, 20);
      assert.ok(panel.liqCredito(p, COBRO).costo_total_pagado >= 80000,
        'abonando ' + abono + ' se evaporó parte de los 80.000');
    });
  });

  test('cuando el ciclo se mueve, lo congelado se queda en el corte viejo', () => {
    // La prórroga ya cobró costo + recargo de ese corte: arrastrarlo al corte
    // nuevo sería cobrarlo dos veces.
    const p = abonar(credito(), 100000, 20);
    assert.equal(panel.K(p), 40000, 'mientras el corte es el viejo, manda lo causado');
    /* 5-ago-2026 — el ciclo se mueve REGISTRANDO LA PRÓRROGA, que es lo que
       hace registrarProrroga(): mover `cicloActual` a mano y no dejar el hecho
       escrito era un estado que la cartera real nunca tiene, y ahora el costo
       del ciclo nuevo se deduce de CUÁNDO empezó ese ciclo. */
    p.prorrogas.push({ fecha: COBRO, ciclo: CORTE, monto: 80000, mora: 40000,
                       aTiempo: false, diasMora: 20, nuevoCiclo: '2026-08-15' });
    p.cicloActual = '2026-08-15';
    assert.equal(P.causadoDelCiclo(p).tiene, false);
    assert.equal(panel.K(p), 20000, 'el corte nuevo cuesta el 20% de lo que queda');
    assert.equal(panel.liqCredito(p, '2026-08-20').recargo_mora,
      M.recargoPorMora(100000, 5), 'el 1% del corte NUEVO, sobre lo que quedó');
  });

  /* 5-ago-2026 — LA DIVERGENCIA QUE FALTABA CERRAR.
     Un abono VIEJO (sin costoCausado/moraCausada) no tiene nada congelado, así
     que hasta ayer el Panel corría el 1% diario sobre el capital que QUEDÓ desde
     el día cero: 100.000 × 1% × 20 = 20.000, y le regalaba 5.000 al día. La app
     del socio, que ya preguntaba al puente, decía 25.000. Ahora los dos dicen
     25.000, que es lo que de verdad corrió: 200.000 durante los 5 días que se
     debían enteros, y 100.000 durante los 15 que siguieron.
     No se le quita nada al socio (el costo del ciclo no se mueve) y no se le
     regala nada (los días que corrieron sobre el capital entero, corrieron). */
  test('los abonos VIEJOS: el recargo se recorre tramo por tramo', () => {
    const p = credito();
    p.abonosCapital.push({ fecha: '2026-07-20', monto: 100000 });
    assert.equal(P.causadoDelCiclo(p).tiene, false, 'no hay nada congelado');
    assert.equal(panel.K(p), 40000, 'el costo del ciclo no depende del abono');
    assert.equal(panel.liqCredito(p, COBRO).recargo_mora, 25000,
      '1% × 200.000 × 5 días + 1% × 100.000 × 15 días');
    assert.equal(M.recargoPorMora(CAP, 5) + M.recargoPorMora(100000, 15), 25000);
    // Lo que decía el Panel viejo, y por qué era un regalo de 5.000.
    assert.equal(M.recargoPorMora(100000, 20), 20000);
    // Y las cuotas del plan de pagos, que también empujan a abonosCapital, no
    // se cuelan: no traen `ciclo`.
    const q = credito();
    q.abonosCapital.push({ fecha: '2026-07-20', monto: 50000, cuotaPlan: 1 });
    assert.equal(P.causadoDelCiclo(q).tiene, false);
    // Un crédito legado tiene que CARGAR, no reventar: sin abonos, sin
    // prórrogas y sin plan, la cuenta es la de siempre.
    const viejo = { id: 'v', capital: CAP, costoPct: 20, cicloActual: CORTE,
                    fechaDesembolso: '2026-07-01', pagado: false };
    assert.equal(panel.liqCredito(viejo, COBRO).total_a_pagar, 280000);
  });

  test('con el capital en cero (dato sucio) lo causado se sigue debiendo', () => {
    // Con el capital en cero no queda capital que liquidar, pero lo YA CAUSADO
    // se sigue debiendo; antes esta rama devolvía CEROS y borraba la deuda de
    // un crédito abierto.
    const p = credito();
    p.abonosCapital.push({ fecha: COBRO, monto: CAP, ciclo: CORTE,
      costoCausado: 40000, moraCausada: 40000, diasMoraCausada: 20 });
    const liq = panel.liqCredito(p, COBRO);
    assert.equal(liq.capital, 0);
    assert.equal(liq.costo, 40000);
    assert.equal(liq.recargo_mora, 40000);
    assert.equal(liq.total_a_pagar, 80000);
    assert.equal(liq.garantia_generada, M.acumularGarantia(80000, false),
      'y le deja garantía al socio: pagó tarde, pero pagó');
  });

  test('EL MOTOR: el recargo ya causado no se recalcula', () => {
    assert.equal(typeof M.recargoPorMoraDesde, 'function',
      'la regla vive en el motor, no en una multiplicación del Panel');
    assert.equal(M.recargoPorMoraDesde(40000, 20, 1, 20), 40000, 'nada nuevo corrió');
    assert.equal(M.recargoPorMoraDesde(40000, 20, 100000, 30), 50000);
    assert.equal(M.recargoPorMoraDesde(0, 0, CAP, 20), M.recargoPorMora(CAP, 20),
      'sin nada causado es el 1% diario de siempre');
    assert.equal(M.recargoPorMoraDesde(40000, 20, 100000, 10), 40000,
      'cobrar antes del día del abono no descuenta lo causado');
    // Y entra por liquidarCredito, que es por donde cobra el Panel.
    const liq = M.liquidarCredito({ capital: 1, costo: 40000, fecha_corte: CORTE },
      COBRO, { recargoCausado: 40000, diasCausados: 20 });
    assert.equal(liq.recargo_mora, 40000);
    assert.equal(liq.total_a_pagar, 80001);
    // Sin las opciones, el motor sigue contestando como siempre.
    assert.equal(M.liquidarCredito({ capital: 1, costo: 0, fecha_corte: CORTE }, COBRO)
      .total_a_pagar, 1);
  });

  /* ------------------------------------------------------------------------
     LA PUERTA DE AL LADO. Tapar el cobro no alcanzaba: la PRÓRROGA cobraba
     capital × tasa y 1% × capital, o sea CERO sobre el peso que quedaba, y al
     correr el corte lo congelado dejaba de aplicar (pertenece al corte viejo).
     Abonar 199.999 → prorrogar por $0 → los 80.000 desaparecían igual, un
     movimiento más allá. Es exactamente el patrón que ya pasó cuatro veces en
     este archivo: se cierra un camino por donde se pierde plata y se abre otro
     por donde se regala. -------------------------------------------------- */

  test('LA PUERTA DE AL LADO: la prórroga tampoco puede costar $0', () => {
    const panelPr = new Function('MotorReglas', 'PUENTE', 'DB',
      ['isoLocal', 'hoy0', 'hoyISO', 'capitalActual', 'K', 'liqCredito',
       'capitalDelCiclo', 'cuotasPlan', 'cuotaPlan', 'tienePlan',
       'moraDe', 'diasMora', 'migrarSocio', 'creditoMotor', 'liqProrroga']
        .map(fnCRM).join('\n') +
      '\nreturn liqProrroga;')(M, P,
        { socios: [{ id: 'a', nombre: 'Ana' }], prestamos: [], respaldados: [] });

    const p = abonar(credito(), CAP - 1, 20);
    const pr = panelPr(p, COBRO);
    assert.equal(pr.costo_prorroga, 40000, 'el costo del ciclo ya estaba causado');
    assert.equal(pr.recargo_mora, 40000, 'y los 20 días de recargo, también');
    assert.equal(pr.total_a_pagar, 80000, 'antes eran $0 y el corte se movía gratis');
    assert.ok(pr.fecha_corte_nueva > CORTE, 'y sí mueve el corte, como siempre');
    assert.equal(pr.garantia_generada,
      M.acumularGarantia(40000, false) + M.acumularGarantia(40000, false),
      'todo al 45%: se pagó, pero se pagó tarde');
    // Sin abonos de por medio, la prórroga contesta lo de siempre.
    assert.equal(panelPr(credito(), COBRO).total_a_pagar, 80000);
  });

  test('EL MOTOR: liquidarProrroga acepta el costo y el recargo ya causados', () => {
    const base = { id: 'x', capital: 1, tasa_aplicada: 0.20, fecha_corte: CORTE,
      estado: 'en_mora', prorrogas_usadas: 0, nivel_socio: 'plata' };
    const sin = M.liquidarProrroga(base, COBRO);
    assert.equal(sin.total_a_pagar, 0, 'la cuenta cruda sobre 1 peso: cero');
    const con = M.liquidarProrroga(Object.assign({}, base, { costo: 40000 }), COBRO,
      { recargoCausado: 40000, diasCausados: 20 });
    assert.equal(con.costo_prorroga, 40000);
    assert.equal(con.recargo_mora, 40000);
    assert.equal(con.total_a_pagar, 80000);
    assert.equal(con.movimiento.monto, 80000, 'y así queda grabado el movimiento');
    assert.equal(con.movimiento.mora, 40000, 'con el recargo aparte, como siempre');
    // El costo dado no cambia nada cuando no hay abonos: capital × tasa.
    assert.equal(M.liquidarProrroga(Object.assign({}, base,
      { capital: CAP, costo: 40000 }), COBRO).total_a_pagar,
      M.liquidarProrroga(Object.assign({}, base, { capital: CAP }), COBRO).total_a_pagar);
  });

  test('abonarCapital congela ANTES de empujar el abono', () => {
    const F = fnCRM('abonarCapital');
    const iCongela = F.indexOf('costoCausado');
    const iPush = F.indexOf('abonosCapital.push');
    assert.ok(iCongela > iPush, 'el congelado va dentro del propio push');
    assert.match(F, /ciclo:p\.cicloActual/, 'sin el corte no se sabe a qué ciclo pertenece');
    /* 5-ago-2026 — los tres congelados salen de UNA sola liquidación del
       puente. Calculados por separado podían caer en dos días distintos y
       guardar un recargo que no correspondía a los días guardados. */
    assert.match(F, /const hoy=hoyISO\(\),\s*liq=liqCredito\(p,hoy\)/);
    assert.match(F, /costoCausado:liq\.costo/);
    assert.match(F, /moraCausada:liq\.recargo_mora/);
    assert.match(F, /diasMoraCausada:liq\.dias_mora/);
    // Y sigue en pie el `return` del 3-ago.
    const iRet = F.indexOf('return;', F.indexOf('¿Marcar como pagado el ciclo completo?'));
    assert.ok(iRet >= 0 && iRet < iPush);
  });

  test('EL ALERT YA NO ENSEÑA LA JUGADA', () => {
    const F = fnCRM('abonarCapital');
    assert.ok(!/un peso menos/.test(F),
      'el aviso le explicaba al usuario cómo borrar la deuda');
    assert.ok(!/borraría el costo del ciclo/.test(F),
      'y describía el premio de hacerlo');
    assert.match(F, /No registré nada/, 'pero sigue diciendo por qué no pasó nada');
    assert.match(F, /Pagó todo/, 'y por dónde es');
    // En todo el Panel, no solo en esta función.
    assert.ok(!/abona un peso menos/i.test(CRM));
  });
});

/* ==========================================================================
 * UNA SOLA VOZ EN LAS DOCE PLANTILLAS — 4-ago-2026
 *
 * Cinco hablaban en plural y siete en singular, y no son grupos separados: se
 * entrelazan dentro del mismo crédito. En 48 horas al socio le llegaba
 * "Te escribimos 🙂 tu pago es el 15" → "espero que estés muy bien… me avisas
 * y entre los dos lo cuadramos" → "Te recuerdo que hoy es tu pago". Tres
 * mensajes, dos remitentes.
 *
 * Queda el PLURAL: es lo que ya eligieron las correcciones del 3 y 4 de agosto
 * y lo que habla socio.html, y es lo único que sigue siendo verdad el día que
 * conteste alguien que no sea Joan. Y "Tu obligación de $X" se va: es jerga de
 * cobranza bancaria, justo lo que este producto no quiere sonar.
 * ======================================================================== */

describe('las doce plantillas hablan con una sola voz (4-ago-2026)', () => {

  const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
  const DEF = CRM.slice(CRM.indexOf('const PLANTILLAS_DEF'),
                        CRM.indexOf('let _fechasMigradas'));
  const mensajes = () => (DEF.match(/m:'((?:[^'\\]|\\.)*)'/g) || [])
    .map(s => s.slice(3, -1));
  const plantilla = k => {
    const i = DEF.indexOf('\n  ' + k + ':{');
    assert.ok(i >= 0, 'no encontré la plantilla ' + k);
    return DEF.slice(i).match(/m:'((?:[^'\\]|\\.)*)'/)[1];
  };
  const VOZ = new Function(CRM.slice(CRM.indexOf('const VOZ_UNICA=['),
                                     CRM.indexOf('const PLANTILLAS_DEF')) +
                           '\nreturn VOZ_UNICA;')();
  const migrar = t => VOZ.reduce((s, r) => s.replace(r[0], r[1]), t);

  test('son doce y ninguna dice "obligación"', () => {
    assert.equal(mensajes().length, 12, 'cambió el número de plantillas: revisá la voz');
    // En ninguna plantilla recomendada, y en ningún texto que le llegue al
    // socio. La palabra solo puede quedar viva en la regla que la borra.
    mensajes().forEach(m => assert.ok(!/obligaci[oó]n/i.test(m),
      'jerga de cobranza bancaria: en la app del socio se dice "tu pago" — ' + m.slice(0, 60)));
    assert.equal(migrar('Tu obligación de {saldo} sigue pendiente'),
      'Tu pago de {saldo} sigue pendiente', 'y la guardada también se corrige');
    assert.match(plantilla('mora'), /Tu pago de \{saldo\} sigue pendiente/);
  });

  test('NINGUNA de las doce habla en singular', () => {
    // Las construcciones exactas que traían las siete plantillas en singular.
    const singular = [
      /\bespero que est[ée]s\b/i, /\bme avisas y entre los dos\b/i,
      /\bte recuerdo que\b/i, /\bquer[ií]a saber c[óo]mo va\b/i,
      /\baqu[íi] estoy para apoyarte\b/i, /\bquiero ayudarte\b/i,
      /\bcu[ée]ntame\b/i, /\baqu[íi] me tienes\b/i, /\bregistr[ée] tu\b/i,
      /\bavisarme\b/i, /\bme cuentas\b/i, /\bte aviso cuando\b/i,
      /\bquedo pendiente\b/i
    ];
    mensajes().forEach(m => singular.forEach(re => {
      assert.ok(!re.test(m), 'volvió el singular (' + re + '): ' + m.slice(0, 80));
    }));
  });

  test('y las doce tienen a "nosotros" de remitente', () => {
    mensajes().forEach(m => {
      assert.ok(/(?:amos|emos|imos)\b|\bnos\b|\bnuestr/i.test(m),
        'esta no dice quién escribe: ' + m.slice(0, 80));
    });
  });

  test('las que ya estaban en plural no se tocaron', () => {
    assert.match(plantilla('recordatorio2'), /Te escribimos/);
    assert.match(plantilla('bienvenida'), /te recordamos/);
    assert.match(plantilla('historial'), /Te compartimos/);
    assert.match(plantilla('invitacion'), /te escribimos/);
    assert.match(plantilla('recordatorioRespaldado'), /Te escribimos/);
  });

  test('LO QUE JOAN TENGA GUARDADO: la migración lo lleva al mismo texto', () => {
    const VIEJAS = {
      recordatorio1: 'Hola {nombre}, espero que estés muy bien. Mañana {fecha_pago} es tu pago de {saldo}. Si necesitas algo, me avisas y entre los dos lo cuadramos con gusto.',
      venceHoy: 'Hola {nombre}, ¿cómo estás hoy? Te recuerdo que hoy es tu pago de {saldo}. Si no alcanzas a cubrir todo, no te preocupes: puedes dejar la prórroga de {prorroga} y seguimos en la otra quincena. Quedo pendiente para lo que necesites.',
      moraTemprana: 'Hola {nombre}, espero que estés bien. Tu pago de {saldo} quedó pendiente desde el {fecha_pago} y quería saber cómo va todo por allá. ¿Lo coordinamos hoy con calma? Si te sirve, también puedes dejar la prórroga de {prorroga}. Aquí estoy para apoyarte.',
      mora: 'Hola {nombre}, ¿cómo has estado? Tu obligación de {saldo} sigue pendiente ({dias_mora} días) y de verdad quiero ayudarte a resolverlo. Cuéntame cómo está tu situación y buscamos juntos un acuerdo que te sirva. Lo importante eres tú.',
      recibo: '¡Recibido, {nombre}! Tu pago quedó registrado. De corazón, muchas gracias por tu cumplimiento y por la confianza. Cuando necesites, aquí me tienes 🙂',
      prorroga: 'Listo {nombre}, ya registré tu prórroga de {prorroga}, no te preocupes por nada. Tu pago de {saldo} pasa tranquilo para la quincena del {fecha_pago}. Gracias por avisarme; cualquier cosa me cuentas.',
      reciboRespaldado: '¡Recibido, {nombre}! Ya quedó registrada tu cuota {n} de {plazo} por {cuota}. Gracias por tu cumplimiento 🙂 Te aviso cuando se acerque la siguiente.'
    };
    Object.keys(VIEJAS).forEach(k => {
      assert.equal(migrar(VIEJAS[k]), plantilla(k),
        'la plantilla guardada de ' + k + ' no llega al texto nuevo');
      assert.equal(migrar(migrar(VIEJAS[k])), migrar(VIEJAS[k]),
        'la migración de ' + k + ' no es idempotente: cada carga la volvería a tocar');
      assert.equal(migrar(plantilla(k)), plantilla(k),
        'correrla sobre el texto nuevo lo cambia otra vez');
    });
  });

  test('y lo que Joan escribió DE SU PUÑO Y LETRA no se pisa', () => {
    const suyas = [
      'Hola {nombre}, paso el martes por tu casa. Me avisas si no estás.',
      'Vecino, espero que te sirva la platica. Cualquier cosa por acá.',
      'Don {nombre}, le recuerdo el favor que quedamos.',
      '{nombre}, ya registré la consignación que me mandó.'
    ];
    suyas.forEach(t => assert.equal(migrar(t), t, 'le pisó un texto suyo: ' + t));
  });

  test('la migración corre en cargar(), donde ya corren las otras tres', () => {
    const CARGAR = CRM.slice(CRM.indexOf('function cargar()'),
                             CRM.indexOf('function nextNumCliente'));
    assert.match(CARGAR, /VOZ_UNICA\.forEach/,
      'arreglar PLANTILLAS_DEF no alcanza: lo del disco le gana a lo recomendado');
  });
});

/* ==========================================================================
 * EL NIVEL BAJABA — y el nivel no puede bajar nunca (4-ago-2026)
 *
 * migrarSocio recalculaba los tres contadores desde cero en cada carga con
 * esPuntualParaNivel, que excluye todo crédito con prórroga o plan de pagos.
 * Un solo crédito con UNA prórroga —pagada en fecha— reseteaba la racha y los
 * meses sin mora, y el socio RETROCEDÍA. El piso que debía impedirlo era
 * `s.nivelSocio`, un campo que NO ESCRIBE NADIE en todo el producto: existía
 * únicamente dentro de una prueba que se lo ponía a mano.
 *
 * MEDIDO: 10 créditos de 200.000 pagados todos en fecha → platino, garantía
 * 360.000, cupo 1.140.000. Se agrega el crédito 11 con UNA prórroga registrada
 * a tiempo y pagado en el corte nuevo: aTiempo 10, racha 0, meses 1 → PLATA,
 * cupo 904.000. El socio pagó 40.000 de más y perdió 452.000 de cupo.
 *
 * El arreglo: el nivel es el MÁXIMO HISTÓRICO, derivado del propio historial.
 * Se recorren los instantes en que la cuenta pudo cambiar —cada pago, cada
 * corte y hoy— y en cada uno se derivan los contadores como estaban ese día.
 * Nadie tiene que acordarse de escribir nada.
 * ======================================================================== */

describe('el nivel es un máximo histórico y nunca baja (4-ago-2026)', () => {

  const CAP = 200000, COSTO = 40000;
  const socio = () => ({ id: 's1', numero: 1, nombre: 'Ana', cedula: '123456',
    telefono: '3001112222', whatsappIgual: true, referencia: { nombre: '', telefono: '' },
    gestiones: [], ajusteGarantia: 0 });
  const dbVacia = s => ({ socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} });
  // Un crédito quincenal cerrado: `pagado` dice en qué fecha se pagó.
  const cerrado = (id, n, corte, pagado, extra) => Object.assign({
    id: id, numero: n, socioId: 's1', capital: CAP, costoPct: 20,
    fechaDesembolso: M.iso(M.sumarDias(M.aFechaLocal(corte), -12)),
    cicloActual: corte, cicloPago: corte, pagado: true, fechaPagado: pagado || corte,
    gananciaPago: COSTO, prorrogas: [], abonosCapital: [], comprobantes: [],
    cobroRegistrado: true }, extra || {});
  // Diez quincenas seguidas, todas pagadas el día del corte.
  const diezLimpios = () => {
    const s = socio(), db = dbVacia(s), cortes = [];
    let d = M.aFechaLocal('2026-01-15');
    for (let i = 0; i < 10; i++) { cortes.push(M.iso(d)); d = M.aFechaLocal(M.calcularFechaCorte(d)); }
    cortes.forEach((c, i) => db.prestamos.push(cerrado('q' + i, i + 1, c)));
    return { db, s, cortes };
  };

  test('EL NÚMERO DEL DEFECTO: platino, y una prórroga PUNTUAL lo bajaba a plata', () => {
    const { db, s, cortes } = diezLimpios();
    const antes = P.migrarSocio(db, s);
    assert.equal(antes.garantia.nivel, 'platino');
    /* 5-ago-2026 — el defecto se medía en cupo (1.140.000 contra 904.000) y ya no
       se puede: el cupo es la garantía y el nivel no lo toca. Lo que se caía —y
       sigue sin poder caerse— es el NIVEL, que es el reconocimiento del socio y
       lo que le da sus prórrogas. */
    assert.equal(M.cupoQuincenal(P.entradaGarantia(db, s), antes.garantia.nivel).cupo, 320000);

    // Crédito 11: una prórroga registrada EL DÍA DEL CORTE (a tiempo, sin mora)
    // y pagado el día del corte nuevo. No se atrasó ni un día.
    const c11 = M.calcularFechaCorte(M.aFechaLocal(cortes[9]));
    const lp = M.liquidarProrroga({ id: 'q10', capital: CAP, tasa_aplicada: 0.20,
      fecha_corte: c11, estado: 'en_corte', prorrogas_usadas: 0, nivel_socio: 'platino' }, c11);
    assert.equal(lp.movimiento.aTiempo, true, 'la prórroga se pagó en fecha');
    assert.equal(lp.movimiento.mora, 0, 'y sin un peso de recargo');
    db.prestamos.push(cerrado('q10', 11, lp.fecha_corte_nueva, lp.fecha_corte_nueva,
      { prorrogas: [lp.movimiento] }));

    // Los contadores de HOY sí caen: eso es lo correcto, un crédito con prórroga
    // no gana el escalón. Lo que no puede pasar es que se lleven el nivel puesto.
    // (Se miran en una fecha fija para que la prueba no dependa del calendario.)
    const DIA = '2026-08-04';
    const cont = P.contadoresDeNivel(db.prestamos, DIA);
    assert.deepEqual(cont, { a_tiempo: 10, racha: 0, meses_sin_mora: 1 });
    assert.equal(M.evaluarNivel(cont.a_tiempo, cont.racha, cont.meses_sin_mora), 'plata',
      'lo que salía antes, y era el defecto: dos escalones abajo');
    assert.equal(P.nivelDelSocio(db.prestamos, DIA), 'platino',
      'el máximo histórico se acuerda del día en que sí los tenía');

    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.pagados_a_tiempo, 10);
    assert.equal(m.garantia.racha, 0);
    assert.equal(m.garantia.nivel, 'platino', 'el nivel NO baja');
    // Y el cupo sube por lo que pagó, no por el nivel: los mismos 380.000 dijera
    // platino o dijera plata. Lo que el defecto le quitaba hoy es el escalón.
    assert.equal(M.cupoQuincenal(P.entradaGarantia(db, s), m.garantia.nivel).cupo, 380000);
    assert.equal(M.cupoQuincenal(P.entradaGarantia(db, s), 'plata').cupo, 380000);
  });

  test('y usar la prórroga sigue sin RENDIR: no lo sube ni un escalón', () => {
    // Mismo socio, misma plata, pero los 10 con prórroga: no llega a platino.
    const s = socio(), db = dbVacia(s);
    let d = M.aFechaLocal('2026-01-15');
    for (let i = 0; i < 10; i++) {
      const c = M.iso(d);
      const lp = M.liquidarProrroga({ id: 'p' + i, capital: CAP, tasa_aplicada: 0.20,
        fecha_corte: c, estado: 'en_corte', prorrogas_usadas: 0, nivel_socio: 'bronce' }, c);
      db.prestamos.push(cerrado('p' + i, i + 1, lp.fecha_corte_nueva, lp.fecha_corte_nueva,
        { prorrogas: [lp.movimiento] }));
      d = M.aFechaLocal(M.calcularFechaCorte(M.aFechaLocal(lp.fecha_corte_nueva)));
    }
    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.pagados_a_tiempo, 0, 'ninguno gana el escalón');
    assert.equal(m.garantia.nivel, 'bronce');
    // Y la garantía que pagó no se le toca: prórroga puntual al 90% + pago al 90%.
    assert.equal(P.garantiaGanadaDe(db, s), 10 * (M.acumularGarantia(COSTO, true) * 2));
  });

  test('un crédito nuevo no puede mejorar el pasado, solo el presente', () => {
    // El máximo histórico se toma sobre INSTANTES: un socio con una sola quincena
    // limpia no se fabrica un oro agregando créditos con prórroga.
    const s = socio(), db = dbVacia(s);
    db.prestamos.push(cerrado('u1', 1, '2026-01-15'));
    assert.equal(P.migrarSocio(db, s).garantia.nivel, 'bronce');
    for (let i = 0; i < 8; i++) {
      const c = M.iso(M.sumarDias(M.aFechaLocal('2026-02-15'), i * 15));
      const lp = M.liquidarProrroga({ id: 'z' + i, capital: CAP, tasa_aplicada: 0.20,
        fecha_corte: c, estado: 'en_corte', prorrogas_usadas: 0, nivel_socio: 'bronce' }, c);
      db.prestamos.push(cerrado('z' + i, 2 + i, lp.fecha_corte_nueva, lp.fecha_corte_nueva,
        { prorrogas: [lp.movimiento] }));
    }
    assert.equal(P.migrarSocio(db, s).garantia.nivel, 'bronce',
      'nueve créditos y ni uno gana escalón: sigue en bronce');
  });

  test('ESTAR EN MORA NO FABRICA "meses sin mora" — el agujero que abriría el máximo', () => {
    /* Antes, `meses_sin_mora` se medía desde el último atraso CURADO y no miraba
       si el socio está atrasado AHORA: un crédito abierto y vencido no reseteaba
       nada, así que los meses de mora empujaban al socio hacia arriba. Con el
       máximo histórico eso además quedaría clavado para siempre. */
    const s = socio(), db = dbVacia(s);
    db.prestamos.push(cerrado('a1', 1, '2026-01-15'));
    db.prestamos.push(cerrado('a2', 2, '2026-01-31'));
    assert.ok(P.migrarSocio(db, s).garantia.meses_sin_mora > 0, 'al día, el contador corre');

    // Ahora tiene un crédito abierto y vencido hace rato.
    db.prestamos.push({ id: 'a3', numero: 3, socioId: 's1', capital: CAP, costoPct: 20,
      fechaDesembolso: '2026-02-15', cicloActual: '2026-02-28', pagado: false,
      prorrogas: [], abonosCapital: [], comprobantes: [] });
    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.meses_sin_mora, 0, 'está en mora: los meses sin mora son cero');
    assert.equal(m.garantia.pagados_a_tiempo, 2, 'y lo que pagó le sigue contando');
    assert.equal(m.garantia.nivel, 'plata', 'el nivel que se ganó no se toca');
    assert.equal(P.estabaVencido(db.prestamos[2], '2026-02-28'), false, 'el día del corte no es mora');
    assert.equal(P.estabaVencido(db.prestamos[2], '2026-03-01'), true);
  });

  test('el crédito que estaba vencido cuando se pagó otro tampoco regala meses', () => {
    const s = socio(), db = dbVacia(s);
    // Uno se atrasó de enero a mayo; otro se pagó puntual en el medio.
    db.prestamos.push(cerrado('v1', 1, '2026-01-15', '2026-05-15'));
    db.prestamos.push(cerrado('v2', 2, '2026-03-15'));
    assert.equal(P.estabaVencido(db.prestamos[0], '2026-03-15'), true,
      'en marzo el primero seguía vencido y sin pagar');
    assert.equal(P.contadoresDeNivel(db.prestamos, '2026-03-15').meses_sin_mora, 0);
  });

  test('los instantes son los pagos, los cortes y hoy — y nunca el futuro', () => {
    const s = socio(), db = dbVacia(s);
    db.prestamos.push(cerrado('i1', 1, '2026-01-15'));
    db.prestamos.push({ id: 'i2', numero: 2, socioId: 's1', capital: CAP, costoPct: 20,
      fechaDesembolso: '2026-02-15', cicloActual: '2099-12-31', pagado: false,
      prorrogas: [], abonosCapital: [], comprobantes: [] });
    const inst = P.instantesDeNivel(db.prestamos, '2026-08-04');
    assert.ok(inst.includes('2026-01-15'), 'el pago');
    assert.ok(inst.includes('2026-08-04'), 'y hoy, siempre el último');
    assert.ok(!inst.includes('2099-12-31'), 'un corte futuro no es un instante evaluable');
    assert.deepEqual(inst, inst.slice().sort(), 'van en orden');
    assert.equal(inst[inst.length - 1], '2026-08-04');
  });

  test('LOS MESES DE MORA NO COMPRAN PLATINO, y los meses limpios sí', () => {
    /* El agujero que el máximo histórico podía volver permanente: platino pide
       10 pagos y 3 meses sin mora. Diez créditos apretados en mes y medio no
       llegan a los 3 meses; si el contador siguiera corriendo durante la mora,
       el socio llegaría a platino JUSTAMENTE por no pagar, y ahí se quedaría
       para siempre. Los mismos diez créditos, al día, sí llegan con el tiempo. */
    const apretados = () => {
      const s = socio(), db = dbVacia(s);
      for (let i = 0; i < 10; i++) {
        db.prestamos.push(cerrado('g' + i, i + 1,
          M.iso(M.sumarDias(M.aFechaLocal('2026-01-05'), i * 5))));
      }
      return { db, s };
    };
    const limpio = apretados();
    assert.equal(P.migrarSocio(limpio.db, limpio.s).garantia.nivel, 'platino',
      'sin mora, los meses corren y el socio llega solo');

    const enMora = apretados();
    enMora.db.prestamos.push({ id: 'g10', numero: 11, socioId: 's1', capital: CAP,
      costoPct: 20, fechaDesembolso: '2026-02-20', cicloActual: '2026-02-28',
      pagado: false, prorrogas: [], abonosCapital: [], comprobantes: [] });
    const m = P.migrarSocio(enMora.db, enMora.s);
    assert.equal(m.garantia.pagados_a_tiempo, 10, 'los diez pagos le siguen contando');
    assert.equal(m.garantia.nivel, 'oro',
      'no llegó a los 3 meses sin mora antes de atrasarse: la mora no se los da');
  });

  test('y tener un crédito abierto en mora no le BAJA el platino al que ya lo tenía', () => {
    const { db, s } = diezLimpios();
    assert.equal(P.migrarSocio(db, s).garantia.nivel, 'platino');
    db.prestamos.push({ id: 'e11', numero: 11, socioId: 's1', capital: CAP, costoPct: 20,
      fechaDesembolso: '2026-06-05', cicloActual: '2026-06-15', pagado: false,
      prorrogas: [], abonosCapital: [], comprobantes: [] });
    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.meses_sin_mora, 0, 'hoy está en mora y el contador dice la verdad');
    assert.equal(m.garantia.nivel, 'platino', 'pero lo que ya se ganó no se le quita');
  });

  test('el socio sin nada no revienta y arranca en bronce', () => {
    const s = socio(), db = dbVacia(s);
    const m = P.migrarSocio(db, s);
    assert.equal(m.garantia.nivel, 'bronce');
    assert.equal(m.garantia.meses_sin_mora, 0);
    assert.equal(P.nivelDelSocio([], '2026-08-04'), 'bronce');
  });
});

/* ==========================================================================
 * CON PLAN DE PAGOS, LA APP LE MOSTRABA AL SOCIO EL CAPITAL ENTERO (4-ago-2026)
 *
 * migrarSocio mandaba `capital: capitalActual(p)` —todo el capital vigente—
 * mientras `costo` ya salía de K(p), que con plan devuelve el de la CUOTA. Dos
 * mitades de dos ciclos distintos en la misma línea. Y como la app calcula el
 * 1% diario sobre ese `capital`, la mora salía sobre el capital entero.
 *
 * MEDIDO: capital 600.000, plan de 3 cuotas. El Panel cobra 230.000 y la app
 * mostraba 630.000 del mismo crédito el mismo día. Con 10 días de mora sobre la
 * cuota: Panel 250.000, app 690.000.
 * ======================================================================== */

describe('el plan de pagos: el Panel y la app cobran lo mismo (4-ago-2026)', () => {

  const CAP = 600000, CORTE = '2026-06-30', PACTADO = '2026-08-04';
  const socio = () => ({ id: 's1', numero: 1, nombre: 'Ana', cedula: '123456',
    telefono: '3001112222', whatsappIgual: true, referencia: { nombre: '', telefono: '' },
    gestiones: [], ajusteGarantia: 0 });

  // Un crédito pasado a plan de pagos, con la MISMA forma que graba crm.html.
  function conPlan() {
    const s = socio();
    const db = { socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} };
    const r = M.liquidarProrroga({ id: 'p1', capital: CAP, tasa_aplicada: 0.20,
      fecha_corte: CORTE, estado: 'en_mora', prorrogas_usadas: 2, nivel_socio: 'oro' }, PACTADO);
    assert.equal(r.ok, false, 'sin prórrogas: la salida es el plan');
    const plan = r.plan_de_pagos;
    const p = { id: 'p1', numero: 1, socioId: 's1', capital: CAP, costoPct: 20,
      fechaDesembolso: '2026-06-16', cicloActual: plan.cuotas[0].fecha_corte, pagado: false,
      prorrogas: [], abonosCapital: [], comprobantes: [],
      planPagos: { creado: PACTADO, tasa_por_corte: plan.tasa_por_corte,
        entrada: { fecha: PACTADO, ciclo: CORTE, monto: r.total_a_pagar,
                   mora: r.recargo_mora, aTiempo: r.a_tiempo, diasMora: r.dias_mora },
        total_capital: plan.total_capital, total_costo: plan.total_costo,
        total_a_pagar: plan.total_a_pagar,
        cuotas: plan.cuotas.map(q => ({ n: q.numero, fecha: q.fecha_corte, capital: q.capital,
          costo: q.costo, total: q.total, pagado: false, fechaPagado: null,
          recargo: 0, garantiaGenerada: 0 })) } };
    db.prestamos.push(p);
    return { db, s, p, plan };
  }

  // Lo que cobra el Panel: capitalDelCiclo + K + 1% diario sobre el capital del
  // ciclo (crm.html: moraDe / totalCiclo, línea por línea).
  const totalPanel = (p, dias) =>
    P.capitalDelCiclo(p) + P.K(p) + M.recargoPorMora(P.capitalDelCiclo(p), dias || 0);
  // Lo que muestra la app: lo hace el motor con lo que le llega en el paquete
  // (socio.html: liquidacion()).
  const totalApp = (c, dias) =>
    Number(c.capital) + Number(c.costo) + M.recargoPorMora(Number(c.capital), dias || 0);

  test('EL NÚMERO DEL DEFECTO: 230.000 en el Panel, 630.000 en la app', () => {
    const { db, s, p } = conPlan();
    const c = P.migrarSocio(db, s).creditos[0];
    assert.equal(totalPanel(p, 0), 230000, 'la cuota 1: 200.000 de capital + 30.000 de costo');
    assert.equal(totalApp(c, 0), 230000, 'y la app dice lo mismo');
    assert.equal(600000 + 30000, 630000, 'lo que mostraba antes: capital entero + costo de la cuota');
    // Con 10 días de mora, la base del 1% es la CUOTA, no el capital entero.
    assert.equal(totalPanel(p, 10), 250000);
    assert.equal(totalApp(c, 10), 250000);
    assert.equal(600000 + 30000 + M.recargoPorMora(600000, 10), 690000, 'lo que mostraba antes');
  });

  test('viaja la cuota vigente entera: capital, costo, fecha y tasa', () => {
    const { db, s, p } = conPlan();
    const c = P.migrarSocio(db, s).creditos[0];
    const cuota = P.cuotaPlanActual(p);
    assert.equal(c.capital, cuota.capital);
    assert.equal(c.costo, cuota.costo);
    assert.equal(c.corte, cuota.fecha, 'el corte que rige es el de la cuota');
    assert.equal(c.tasa, M.TASA_PLAN_DE_PAGOS, '5% sobre el saldo, no el 20% del quincenal');
    assert.equal(c.plan_cuotas, 3);
    assert.equal(c.plan_cuotas_pagadas, 0);
    // Y lo que le falta del crédito COMPLETO va aparte: la cuota no es la deuda.
    assert.equal(c.saldo_capital, CAP);
  });

  test('al pagar una cuota, la app pasa a la siguiente sin que nadie recalcule', () => {
    const { db, s, p } = conPlan();
    const c1 = P.cuotaPlanActual(p);
    // Lo mismo que hace cobrarCuotaDelPlan() en el Panel.
    c1.pagado = true; c1.fechaPagado = c1.fecha; c1.recargo = 0;
    c1.garantiaGenerada = M.acumularGarantia(c1.costo, true);
    p.abonosCapital.push({ fecha: c1.fecha, monto: c1.capital, cuotaPlan: c1.n });
    p.cicloActual = P.cuotaPlanActual(p).fecha;

    const c = P.migrarSocio(db, s).creditos[0];
    const cuota2 = P.cuotaPlanActual(p);
    assert.equal(cuota2.n, 2);
    assert.equal(c.capital, cuota2.capital);
    assert.equal(c.costo, cuota2.costo, '5% del saldo, que ya bajó');
    assert.equal(c.saldo_capital, CAP - c1.capital);
    assert.equal(totalApp(c, 0), totalPanel(p, 0));
    assert.equal(c.plan_cuotas_pagadas, 1);
  });

  test('un crédito SIN plan no cambia ni un peso', () => {
    const s = socio();
    const db = { socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} };
    const p = { id: 'n1', numero: 1, socioId: 's1', capital: 300000, costoPct: 20,
      fechaDesembolso: '2026-07-20', cicloActual: '2026-07-31', pagado: false,
      prorrogas: [], abonosCapital: [], comprobantes: [] };
    db.prestamos.push(p);
    const c = P.migrarSocio(db, s).creditos[0];
    assert.equal(c.capital, 300000);
    assert.equal(c.costo, 60000);
    assert.equal(c.saldo_capital, 300000);
    assert.equal(c.tasa, M.TASA_CREDITO);
    assert.equal(totalApp(c, 0), totalPanel(p, 0));
    assert.equal(totalApp(c, 7), totalPanel(p, 7));
  });

  test('con abono a capital, la mora corre sobre lo que DE VERDAD se debe hoy', () => {
    const s = socio();
    const db = { socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} };
    const p = { id: 'n2', numero: 1, socioId: 's1', capital: 400000, costoPct: 20,
      fechaDesembolso: '2026-07-05', cicloActual: '2026-07-15', pagado: false,
      prorrogas: [], abonosCapital: [{ fecha: '2026-07-15', monto: 150000 }], comprobantes: [] };
    db.prestamos.push(p);
    const c = P.migrarSocio(db, s).creditos[0];
    assert.equal(c.capital, 250000, 'lo que queda, no lo que pidió');
    assert.equal(totalApp(c, 20), totalPanel(p, 20));
  });

  test('un crédito ya pagado cuenta su historia, no un ciclo que ya no existe', () => {
    const { db, s, p } = conPlan();
    let cobrado = 0;
    P.cuotasPlan(p).forEach(q => {
      q.pagado = true; q.fechaPagado = q.fecha; q.recargo = 0;
      q.garantiaGenerada = M.acumularGarantia(q.costo, true);
      p.abonosCapital.push({ fecha: q.fecha, monto: q.capital, cuotaPlan: q.n });
      cobrado += q.costo;
    });
    p.pagado = true; p.fechaPagado = P.cuotasPlan(p)[2].fecha;
    p.cicloPago = p.fechaPagado; p.cobroRegistrado = true; p.gananciaPago = 0;

    const c = P.migrarSocio(db, s).creditos[0];
    assert.equal(c.capital, CAP,
      'antes viajaba capital menos abonos: un crédito de 600.000 aparecía como $0');
    assert.equal(c.saldo_capital, 0);
    assert.equal(c.costo, Math.round(cobrado + p.planPagos.entrada.monto),
      'lo que le costó: las tres cuotas más la entrada del plan');
    assert.equal(c.abonado, Math.round(P.gananciaCobrada(p) + CAP));
    assert.equal(c.garantia, P.garantiaGanadaCredito(p), 'la garantía no la toca nadie');
  });
});

/* ==========================================================================
 * LAS PREGUNTAS DEL PASADO SE CONTESTAN CON EL PASADO — 5-ago-2026
 *
 * Seis rondas de arreglos sobre el mismo sitio, y siempre el mismo defecto de
 * diseño debajo: las cuentas preguntaban por el PASADO y buscaban la respuesta
 * en el PRESENTE. `estabaVencido` leía `cicloActual`, que la prórroga mueve al
 * futuro; `K` leía `capitalActual`, que el abono baja. Un campo que se
 * sobrescribe no puede contestar una pregunta sobre el pasado.
 *
 * Estas pruebas no miran un síntoma: exigen la propiedad. Una respuesta sobre
 * una fecha pasada NO PUEDE CAMBIAR por algo que se registre después.
 * ======================================================================== */

describe('estabaVencido no cambia de respuesta por lo que pase después (5-ago-2026)', () => {

  const CAP = 200000;
  const abierto = () => ({ id: 'x1', numero: 1, socioId: 's1', capital: CAP, costoPct: 20,
    fechaDesembolso: '2026-03-20', cicloActual: '2026-03-31', pagado: false,
    prorrogas: [], abonosCapital: [], comprobantes: [] });
  // Lo que graba registrarProrroga(), tal cual.
  const prorrogar = (p, fecha) => {
    const r = M.liquidarProrroga({ id: p.id, capital: P.capitalActual(p), tasa_aplicada: 0.20,
      costo: Math.round(P.K(p)), fecha_corte: p.cicloActual, estado: 'en_corte',
      prorrogas_usadas: p.prorrogas.length, nivel_socio: 'oro' }, fecha);
    assert.ok(r.ok, 'la prórroga se pudo registrar');
    p.prorrogas.push({ fecha: r.fecha, ciclo: r.fecha_corte_anterior, monto: r.total_a_pagar,
      mora: r.recargo_mora, aTiempo: r.a_tiempo, diasMora: r.dias_mora,
      nuevoCiclo: r.fecha_corte_nueva });
    p.cicloActual = r.fecha_corte_nueva;
    return r;
  };

  // Las fechas que se preguntan: antes del corte, el día del corte y toda la mora.
  const INSTANTES = ['2026-03-15', '2026-03-31', '2026-04-01', '2026-05-01',
                     '2026-06-01', '2026-07-15', '2026-08-04'];

  test('EL NÚMERO DEL DEFECTO: la prórroga borraba la mora hacia atrás', () => {
    const p = abierto();
    assert.equal(P.estabaVencido(p, '2026-06-01'), true, 'el 1-jun estaba vencido');
    prorrogar(p, '2026-08-05');
    assert.equal(p.cicloActual, '2026-08-15', 'el corte se fue al futuro, como debe');
    assert.equal(P.estabaVencido(p, '2026-06-01'), true,
      'ANTES pasaba a false: la mora del 1-jun se borraba por algo hecho en agosto');
  });

  test('ninguno de los instantes cambia de respuesta al registrar la prórroga', () => {
    const p = abierto();
    const antes = INSTANTES.map(i => P.estabaVencido(p, i));
    prorrogar(p, '2026-08-05');
    assert.deepEqual(INSTANTES.map(i => P.estabaVencido(p, i)), antes,
      'una prórroga de agosto no puede reescribir marzo, abril, mayo ni junio');
    // Y el presente sí se mueve: eso es lo que el socio compró.
    assert.equal(P.estabaVencido(p, '2026-08-05'), false, 'hoy ya no está vencido');
  });

  test('tampoco cambia con DOS prórrogas encadenadas', () => {
    const p = abierto();
    const antes = INSTANTES.map(i => P.estabaVencido(p, i));
    prorrogar(p, '2026-08-05');
    prorrogar(p, '2026-08-15');
    assert.deepEqual(INSTANTES.map(i => P.estabaVencido(p, i)), antes);
    assert.equal(P.cortesDelCredito(p).length, 3, 'los tres cortes que tuvo');
  });

  test('ni al pasar a plan de pagos, ni al ir pagando sus cuotas', () => {
    const p = abierto();
    const antes = INSTANTES.map(i => P.estabaVencido(p, i));
    const PACTADO = '2026-08-05';
    const r = M.liquidarProrroga({ id: p.id, capital: CAP, tasa_aplicada: 0.20,
      fecha_corte: p.cicloActual, estado: 'en_mora', prorrogas_usadas: 2,
      nivel_socio: 'oro' }, PACTADO);
    assert.equal(r.ok, false);
    const plan = r.plan_de_pagos;
    p.planPagos = { creado: PACTADO, tasa_por_corte: plan.tasa_por_corte,
      entrada: { fecha: PACTADO, ciclo: r.fecha_corte_anterior, monto: r.total_a_pagar,
                 mora: r.recargo_mora, aTiempo: r.a_tiempo, diasMora: r.dias_mora },
      total_capital: plan.total_capital, total_costo: plan.total_costo,
      total_a_pagar: plan.total_a_pagar,
      cuotas: plan.cuotas.map(q => ({ n: q.numero, fecha: q.fecha_corte, capital: q.capital,
        costo: q.costo, total: q.total, pagado: false, fechaPagado: null,
        recargo: 0, garantiaGenerada: 0 })) };
    p.cicloActual = p.planPagos.cuotas[0].fecha;
    assert.deepEqual(INSTANTES.map(i => P.estabaVencido(p, i)), antes,
      'el plan tampoco reescribe la mora que ya había corrido');

    // Y cobrando la primera cuota, igual (cobrarCuotaDelPlan del Panel).
    const c1 = P.cuotaPlanActual(p);
    c1.pagado = true; c1.fechaPagado = c1.fecha; c1.recargo = 0;
    p.abonosCapital.push({ fecha: c1.fecha, monto: c1.capital, cuotaPlan: c1.n });
    p.cicloActual = P.cuotaPlanActual(p).fecha;
    assert.deepEqual(INSTANTES.map(i => P.estabaVencido(p, i)), antes);
  });

  test('la línea de tiempo dice qué corte regía en cada momento', () => {
    const p = abierto();
    prorrogar(p, '2026-08-05');
    assert.equal(P.corteOriginal(p), '2026-03-31', 'el corte con el que nació');
    assert.equal(P.corteVigenteEn(p, '2026-06-01'), '2026-03-31');
    assert.equal(P.corteVigenteEn(p, '2026-08-04'), '2026-03-31');
    assert.equal(P.corteVigenteEn(p, '2026-08-05'), '2026-08-15', 'desde el día que se pactó');
    assert.equal(P.corteDelCredito(p), '2026-08-15', 'y el resumen de hoy sigue siendo hoy');
  });

  test('una prórroga VIEJA sin `nuevoCiclo` igual reconstruye la historia', () => {
    // El Panel del 17-jul no guardaba a qué corte pasaba: el dato está en el
    // `ciclo` del cambio siguiente, y en el último, en el corte de hoy.
    const p = abierto();
    p.prorrogas.push({ fecha: '2026-05-04', ciclo: '2026-03-31', monto: 40000 });
    p.prorrogas.push({ fecha: '2026-06-05', ciclo: '2026-05-15', monto: 40000 });
    p.cicloActual = '2026-06-30';
    assert.deepEqual(P.cortesDelCredito(p), [
      { desde: '', corte: '2026-03-31' },
      { desde: '2026-05-04', corte: '2026-05-15' },
      { desde: '2026-06-05', corte: '2026-06-30' }
    ]);
    assert.equal(P.estabaVencido(p, '2026-04-20'), true);
    assert.equal(P.estabaVencido(p, '2026-05-10'), false, 'esos días los había comprado');
    assert.equal(P.estabaVencido(p, '2026-05-20'), true);
  });

  test('el crédito sin prórrogas ni plan se lee igual que siempre', () => {
    const p = abierto();
    assert.deepEqual(P.cortesDelCredito(p), [{ desde: '', corte: '2026-03-31' }]);
    assert.equal(P.estabaVencido(p, '2026-03-31'), false, 'el día del corte no es mora');
    assert.equal(P.estabaVencido(p, '2026-04-01'), true);
    p.pagado = true; p.fechaPagado = '2026-04-10'; p.cicloPago = '2026-03-31';
    assert.equal(P.estabaVencido(p, '2026-04-05'), true, 'el 5-abr todavía no había pagado');
    assert.equal(P.estabaVencido(p, '2026-04-10'), false, 'el día que pagó, ya no');
  });

  test('meses_sin_mora: la mora tapada con prórroga sí dejó huella', () => {
    /* El agujero de fondo: `meses_sin_mora` se medía desde el último atraso
       CURADO POR UN PAGO. Cuatro meses de mora tapados con una prórroga no
       reseteaban nada, así que esos meses de atraso EMPUJABAN al socio hacia
       platino. Una mora termina el día en que el corte se mueve, y eso también
       es un hecho guardado. */
    const p = abierto();
    prorrogar(p, '2026-08-05');
    assert.equal(P.ultimoDiaDeMora(p, '2026-08-05'), '2026-08-04',
      'estuvo vencido hasta el día anterior a la prórroga');
    assert.equal(P.contadoresDeNivel([p], '2026-08-05').meses_sin_mora, 0);
    // Y el que nunca se atrasó no arrastra ningún hito.
    const limpio = abierto();
    limpio.pagado = true; limpio.fechaPagado = '2026-03-31'; limpio.cicloPago = '2026-03-31';
    assert.equal(P.ultimoDiaDeMora(limpio, '2026-08-05'), '');
  });
});

/* ==========================================================================
 * DEJAR LA PRÓRROGA NO PUEDE RENDIR MÁS QUE SALDAR LA DEUDA — 5-ago-2026
 *
 * MEDIDO con el código de ayer: socio con 10 créditos limpios y el crédito 11
 * de 200.000 vencido desde el 31-mar. Pagando TODO quedaba en oro con 1.280.750
 * de cupo; dejando solo la prórroga —quedándose los 200.000 de capital— saltaba
 * a PLATINO con 1.536.900. Misma plata cobrada, misma garantía: 256.150 más de
 * cupo por no devolver el capital.
 * ======================================================================== */

describe('pagar no puede rendir menos que no pagar (5-ago-2026)', () => {

  const HOY = '2026-08-05', CAP = 200000;
  const socio = () => ({ id: 's1', numero: 1, nombre: 'Ana', cedula: '123456',
    telefono: '3001112222', whatsappIgual: true, referencia: { nombre: '', telefono: '' },
    gestiones: [], ajusteGarantia: 0 });

  // Diez quincenas limpias (2-ene a 15-mar) y el crédito 11 vencido el 31-mar.
  function partida() {
    const s = socio();
    const db = { socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} };
    ['2026-01-02', '2026-01-09', '2026-01-16', '2026-01-23', '2026-01-30',
     '2026-02-06', '2026-02-13', '2026-02-20', '2026-02-27', '2026-03-15']
      .forEach((f, i) => {
        const c = M.calcularFechaCorte(f);
        db.prestamos.push({ id: 'q' + i, numero: i + 1, socioId: 's1', capital: CAP,
          costoPct: 20, fechaDesembolso: f, cicloActual: c, cicloPago: c, pagado: true,
          fechaPagado: c, gananciaPago: 40000, cobroRegistrado: true,
          prorrogas: [], abonosCapital: [], comprobantes: [] });
      });
    const p11 = { id: 'q10', numero: 11, socioId: 's1', capital: CAP, costoPct: 20,
      fechaDesembolso: '2026-03-20', cicloActual: '2026-03-31', pagado: false,
      prorrogas: [], abonosCapital: [], comprobantes: [] };
    db.prestamos.push(p11);
    return { db, s, p11 };
  }
  const foto = (db, s) => {
    const m = P.migrarSocio(db, s);
    const q = M.cupoQuincenal(P.entradaGarantia(db, s), m.garantia.nivel);
    return { nivel: m.garantia.nivel, cupo: q.cupo, garantia: q.total,
             cont: { a_tiempo: m.garantia.pagados_a_tiempo, racha: m.garantia.racha,
                     meses: m.garantia.meses_sin_mora } };
  };

  // pagarTotal() del Panel: cobra la liquidación del ciclo y cierra el crédito.
  function pagarTodo(p) {
    const l = P.liquidarCiclo(p, HOY);
    p.pagado = true; p.fechaPagado = HOY; p.cicloPago = p.cicloActual;
    p.cobroRegistrado = true; p.gananciaPago = l.costo_total_pagado;
    p.recargoMora = l.recargo_mora;
    return l;
  }
  // registrarProrroga() del Panel: cobra lo mismo de costos y NO devuelve capital.
  function dejarProrroga(p, fecha) {
    const r = M.liquidarProrroga({ id: p.id, capital: P.capitalActual(p), tasa_aplicada: 0.20,
      costo: Math.round(P.K(p)), fecha_corte: p.cicloActual, estado: 'en_corte',
      prorrogas_usadas: p.prorrogas.length, nivel_socio: 'oro' }, fecha || HOY);
    assert.ok(r.ok);
    p.prorrogas.push({ fecha: r.fecha, ciclo: r.fecha_corte_anterior, monto: r.total_a_pagar,
      mora: r.recargo_mora, aTiempo: r.a_tiempo, diasMora: r.dias_mora,
      nuevoCiclo: r.fecha_corte_nueva });
    p.cicloActual = r.fecha_corte_nueva;
    return r;
  }

  test('LOS DOS CAMINOS COBRAN LA MISMA PLATA DE COSTOS', () => {
    const a = partida(), b = partida();
    const pago = pagarTodo(a.p11);
    const pro = dejarProrroga(b.p11);
    assert.equal(pago.costo_total_pagado, pro.total_a_pagar,
      'el mismo costo y el mismo recargo: lo único distinto es el capital');
    assert.equal(pago.total_a_pagar, pro.total_a_pagar + CAP,
      'el que paga todo devuelve además los 200.000');
  });

  test('EL DEFECTO: platino y 256.150 de cupo de más por no devolver el capital', () => {
    const a = partida(), b = partida();
    pagarTodo(a.p11);
    dejarProrroga(b.p11);
    const paga = foto(a.db, a.s), deja = foto(b.db, b.s);

    assert.equal(paga.garantia, deja.garantia, 'la garantía es la misma en los dos caminos');
    assert.equal(deja.cont.meses, 0,
      'ANTES daba 7: la prórroga borraba la mora y el contador corría por encima');
    assert.notEqual(deja.nivel, 'platino', 'ANTES saltaba a platino por no pagar');
    assert.equal(paga.nivel, deja.nivel);
    assert.equal(paga.cupo, deja.cupo);
    assert.ok(paga.cupo >= deja.cupo, 'pagar no puede rendir MENOS que no pagar');
  });

  test('con DOS prórrogas más plan de pagos tampoco rinde más', () => {
    const a = partida(), b = partida();
    pagarTodo(a.p11);

    const p = b.p11;
    let cobradoDeja = 0;
    cobradoDeja += dejarProrroga(p, '2026-08-05').total_a_pagar;
    cobradoDeja += dejarProrroga(p, '2026-08-15').total_a_pagar;
    const r = M.liquidarProrroga({ id: p.id, capital: CAP, tasa_aplicada: 0.20,
      fecha_corte: p.cicloActual, estado: 'en_mora', prorrogas_usadas: 2,
      nivel_socio: 'oro' }, '2026-08-31');
    assert.equal(r.ok, false, 'se le acabaron: la salida es el plan de pagos');
    cobradoDeja += r.total_a_pagar;
    const plan = r.plan_de_pagos;
    p.planPagos = { creado: '2026-08-31', tasa_por_corte: plan.tasa_por_corte,
      entrada: { fecha: '2026-08-31', ciclo: r.fecha_corte_anterior, monto: r.total_a_pagar,
                 mora: r.recargo_mora, aTiempo: r.a_tiempo, diasMora: r.dias_mora },
      total_capital: plan.total_capital, total_costo: plan.total_costo,
      total_a_pagar: plan.total_a_pagar,
      cuotas: plan.cuotas.map(q => ({ n: q.numero, fecha: q.fecha_corte, capital: q.capital,
        costo: q.costo, total: q.total, pagado: false, fechaPagado: null,
        recargo: 0, garantiaGenerada: 0 })) };
    p.cicloActual = p.planPagos.cuotas[0].fecha;

    const paga = foto(a.db, a.s), deja = foto(b.db, b.s);
    // El NIVEL es lo que no se puede comprar encadenando plazo: ANTES la cadena
    // lo dejaba en platino sin haber devuelto un peso de capital.
    assert.equal(deja.nivel, paga.nivel, 'encadenar plazo no le compra un escalón');
    assert.notEqual(deja.nivel, 'platino');
    assert.equal(deja.cont.meses, 0, 'y los meses sin mora siguen en cero');
    /* El cupo del que encadena sí queda más alto, y tiene que ser así: pagó
       374.000 de costos contra 294.000, o sea 80.000 MÁS de plata, y toda plata
       pagada suma garantía. Lo que no puede pasar —y es la regla— es que ese
       cupo extra sea un regalo: POR CADA PESO PAGADO, saldar tiene que rendir
       más que encadenar. */
    assert.ok(cobradoDeja > 294000, 'el que encadena pagó más plata, no menos');
    assert.ok(paga.cupo / 294000 > deja.cupo / cobradoDeja,
      'por peso pagado, encadenar prórrogas rinde MENOS que saldar');
  });

  test('y el que paga EN FECHA sí gana el escalón: no se premia atrasarse', () => {
    // Mismo socio, pero el crédito 11 se paga puntual el día del corte.
    const c = partida();
    c.p11.pagado = true; c.p11.fechaPagado = '2026-03-31';
    c.p11.cicloPago = '2026-03-31'; c.p11.gananciaPago = 40000; c.p11.cobroRegistrado = true;
    const puntual = foto(c.db, c.s);
    const a = partida(); const l = pagarTodo(a.p11);
    const tarde = foto(a.db, a.s);
    assert.equal(puntual.cont.a_tiempo, 11, 'los once escalones');
    assert.equal(tarde.cont.a_tiempo, 10, 'el que pagó tarde no gana el suyo');
    assert.equal(puntual.nivel, 'platino', 'el puntual sí llega');
    assert.equal(tarde.nivel, 'oro', 'el atrasado se queda un escalón abajo');
    /* Y por peso pagado no hay comparación: el puntual llegó a platino pagando
       40.000; el atrasado pagó 294.000 para quedarse en oro. */
    assert.ok(puntual.cupo / 40000 > tarde.cupo / l.costo_total_pagado,
      'por peso pagado, atrasarse tiene que rendir menos');
  });
});

/* ==========================================================================
 * LO CAUSADO NO BAJA AL ABONAR, Y HAY UNA SOLA CUENTA — 5-ago-2026
 *
 * `K` y `capitalDelCiclo` salían del capital VIGENTE, así que el paquete que
 * viaja a la app se armaba con cifras que ya se habían borrado. MEDIDO: 200.000
 * a 20 días, abono de 199.999 → el Panel cobraba 80.001 y la app mostraba
 * "Total para saldar hoy $1". Con la mitad abonada: Panel 180.000, app 140.000.
 *
 * Y el congelado que sí funcionaba vivía SOLO en crm.html: dos verdades otra
 * vez. La cuenta es ahora PUENTE.liquidarCiclo, una sola, y el paquete la trae
 * hecha.
 * ======================================================================== */

describe('lo causado no se evapora al abonar, y la cuenta es una sola (5-ago-2026)', () => {

  const CAP = 200000, CORTE = '2026-07-15', COBRO = '2026-08-04';   // 20 días
  const credito = () => ({ id: 'x', numero: 1, socioId: 's1', capital: CAP, costoPct: 20,
    fechaDesembolso: '2026-07-01', cicloActual: CORTE, pagado: false,
    prorrogas: [], abonosCapital: [], comprobantes: [] });
  // Un abono LEGADO: sin ninguno de los campos congelados del Panel.
  const abonarViejo = (p, monto, fecha) => {
    p.abonosCapital.push({ fecha: fecha || COBRO, monto: monto });
    return p;
  };

  test('EL NÚMERO DEL DEFECTO: el Panel cobraba 80.001 y la app decía $1', () => {
    const p = abonarViejo(credito(), CAP - 1);
    assert.equal(P.capitalActual(p), 1, 'el capital sí baja: eso está bien');
    const l = P.liquidarCiclo(p, COBRO);
    assert.equal(l.costo, 40000, 'el costo del ciclo se causó sobre los 200.000');
    assert.equal(l.recargo_mora, 40000, 'y los 20 días corrieron sobre los 200.000');
    assert.equal(l.total_a_pagar, 80001, 'lo mismo que cobra el Panel');
    // Lo que salía antes, con el capital vigente de base:
    assert.equal(Math.round(1 * 20 / 100), 0);
    assert.equal(M.recargoPorMora(1, 20), 0);
  });

  test('con la mitad abonada: 180.000, no 140.000', () => {
    const p = abonarViejo(credito(), 100000);
    const l = P.liquidarCiclo(p, COBRO);
    assert.equal(l.capital, 100000);
    assert.equal(l.costo, 40000);
    assert.equal(l.recargo_mora, 40000, 'los 20 días ya habían corrido sobre 200.000');
    assert.equal(l.total_a_pagar, 180000);
  });

  test('con el capital entero cubierto, lo causado se sigue debiendo', () => {
    const p = abonarViejo(credito(), CAP);
    const l = P.liquidarCiclo(p, COBRO);
    assert.equal(l.capital, 0);
    assert.equal(l.total_a_pagar, 80000, 'ANTES la app mostraba $0');
    assert.equal(l.garantia_generada, M.acumularGarantia(80000, false));
  });

  test('el abono posterior tampoco baja el recargo del día en que se abonó', () => {
    // Abona 100.000 el día 20 y salda el día 30: los 20 primeros días corrieron
    // sobre 200.000 y los 10 siguientes sobre los 100.000 que quedaron.
    const p = abonarViejo(credito(), 100000, COBRO);
    const l = P.liquidarCiclo(p, '2026-08-14');
    assert.equal(l.dias_mora, 30);
    assert.equal(l.recargo_mora, 50000, '40.000 corridos + 1% × 100.000 × 10 días');
    assert.equal(l.total_a_pagar, 190000);
    // Y no se le cobra mora sobre plata que ya devolvió: sin abonar habría
    // debido 300.000 el día 30, y los 10.000 de diferencia son exactamente la
    // mora de esos 100.000 durante los 10 días que ya no los debía.
    assert.equal(P.liquidarCiclo(credito(), '2026-08-14').total_a_pagar, 300000);
    assert.equal(100000 + l.total_a_pagar, 290000);
    assert.equal(300000 - 290000, M.recargoPorMora(100000, 10));
  });

  test('BARRIDO: ningún abono, en ningún día, borra un peso de lo ya causado', () => {
    let pares = 0;
    for (let abono = 1000; abono < CAP; abono += 1000) {
      for (let dAbono = 0; dAbono <= 30; dAbono += 5) {
        const f = M.iso(new Date(2026, 6, 15 + dAbono));
        const p = abonarViejo(credito(), abono, f);
        // Lo que ya estaba causado el día del abono: costo del ciclo + el 1%
        // diario corrido sobre el capital que había hasta ese día.
        const causado = 40000 + M.recargoPorMora(CAP, dAbono);
        for (let dCobro = dAbono; dCobro <= 60; dCobro += 5) {
          const g = M.iso(new Date(2026, 6, 15 + dCobro));
          const liq = P.liquidarCiclo(p, g);
          const conAbono = abono + liq.total_a_pagar;
          const sinAbono = P.liquidarCiclo(credito(), g).total_a_pagar;
          pares++;
          assert.ok(liq.costo_total_pagado >= causado - 1,
            'abonando ' + abono + ' el día ' + dAbono + ' se borró lo ya causado');
          assert.ok(conAbono <= sinAbono + 1,
            'abonar salía más caro que no abonar (' + abono + ' el día ' + dAbono + ')');
        }
      }
    }
    assert.ok(pares > 5000, 'el barrido se quedó corto: ' + pares);
  });

  test('el costo del ciclo NUEVO sí sale del capital que quedó', () => {
    // Lo contrario también tiene que valer: una vez que el ciclo se movió, lo
    // del corte viejo ya se cobró y el ciclo nuevo cuesta el 20% de lo que hay.
    const p = abonarViejo(credito(), 100000);
    assert.equal(P.K(p), 40000, 'mientras el corte es el viejo, manda lo causado');
    p.prorrogas.push({ fecha: COBRO, ciclo: CORTE, monto: 80000, mora: 40000,
                       aTiempo: false, diasMora: 20, nuevoCiclo: '2026-08-15' });
    p.cicloActual = '2026-08-15';
    assert.equal(P.inicioDelCiclo(p), COBRO, 'el ciclo nuevo empezó el día de la prórroga');
    assert.equal(P.capitalBaseDelCiclo(p), 100000);
    assert.equal(P.K(p), 20000, 'el 20% de lo que queda');
    assert.equal(P.moraDelCiclo(p, '2026-08-20'), M.recargoPorMora(100000, 5));
  });

  test('EL PANEL Y LA APP PREGUNTAN LA MISMA CUENTA, NO CADA UNO LA SUYA', () => {
    /* El paquete que viaja a la app trae la liquidación YA HECHA. Antes traía
       capital y costo sueltos y la app volvía a sumar capital + costo + 1% ×
       capital por su lado: con un abono de por medio, dos totales distintos del
       mismo crédito el mismo día. */
    const s = { id: 's1', numero: 1, nombre: 'Ana', cedula: '123456', telefono: '3001112222',
      whatsappIgual: true, referencia: { nombre: '', telefono: '' }, gestiones: [],
      ajusteGarantia: 0 };
    const hoy = M.iso(new Date());
    const corte = M.iso(M.sumarDias(M.aFechaLocal(hoy), -20));
    const p = { id: 'z', numero: 1, socioId: 's1', capital: CAP, costoPct: 20,
      fechaDesembolso: M.iso(M.sumarDias(M.aFechaLocal(corte), -10)),
      cicloActual: corte, pagado: false,
      prorrogas: [], abonosCapital: [{ fecha: hoy, monto: CAP - 1 }], comprobantes: [] };
    const db = { socios: [s], prestamos: [p], respaldados: [], config: {}, contadores: {} };

    const panel = P.liquidarCiclo(p, hoy);
    const c = P.migrarSocio(db, s).creditos[0];
    assert.equal(c.capital, panel.capital);
    assert.equal(c.costo, panel.costo);
    assert.equal(c.mora, panel.recargo_mora);
    assert.equal(c.dias_mora, panel.dias_mora);
    assert.equal(c.total_hoy, panel.total_a_pagar, 'un solo total para los dos');
    assert.equal(c.total_hoy, 80001, 'y es el que cobra el Panel, no $1');
    // Y con `causado` la app puede liquidar en OTRO día sin recalcular el 1%
    // desde cero: se lo pasa al motor tal cual.
    const dentroDeCinco = M.iso(M.sumarDias(M.aFechaLocal(hoy), 5));
    assert.equal(
      M.liquidarCredito({ capital: c.capital, costo: c.costo, fecha_corte: c.corte },
        dentroDeCinco, { recargoCausado: c.causado.mora, diasCausados: c.causado.dias })
        .total_a_pagar,
      P.liquidarCiclo(p, dentroDeCinco).total_a_pagar);
  });

  test('la cuenta vive en el puente, no en una copia de cada pantalla', () => {
    ['liquidarCiclo', 'moraDelCiclo', 'causadoDelCiclo', 'capitalBaseDelCiclo',
     'cortesDelCredito', 'corteVigenteEn', 'ultimoDiaDeMora', 'inicioDelCiclo']
      .forEach(f => assert.equal(typeof P[f], 'function',
        'el puente tiene que exportar ' + f + ': si no, cada pantalla se la reescribe'));
  });

  test('un crédito sin abonos no se mueve ni un peso', () => {
    const l = P.liquidarCiclo(credito(), COBRO);
    assert.equal(l.costo, 40000);
    assert.equal(l.recargo_mora, 40000);
    assert.equal(l.total_a_pagar, 280000);
    assert.equal(P.liquidarCiclo(credito(), CORTE).recargo_mora, 0, 'el día del corte, cero');
    assert.equal(P.liquidarCiclo(credito(), CORTE).pago_a_tiempo, true);
  });
});

/* ==========================================================================
 * EL NIVEL PREMIABA AL QUE NO PAGA — 5-ago-2026
 *
 * `contadoresDeNivel` calculaba la racha y los pagos a tiempo recorriendo SOLO
 * LOS CRÉDITOS PAGADOS. Un crédito vencido y sin pagar no está en esa lista, así
 * que no podía romper nada; uno pagado tarde sí.
 *
 * MEDIDO — socio con 10 quincenas limpias y el crédito 11 de 200.000 vencido
 * desde el 31-mar (127 días). Pagando los 494.000: racha 0. Dejando la prórroga
 * y quedándose el capital (294.000): racha 10. Las cuatro salidas (garantía,
 * nivel, cupo, respaldado) eran IDÉNTICAS: devolver 200.000 de capital no
 * compraba un peso, y en la racha dejaba PEOR al que paga.
 *
 * Y el nivel entero se daba vuelta: 4 puntuales + el 5 vencido + 2 puntuales
 * después. Pagando el 5 → racha 2 → PLATA. Prorrogándolo → racha 6 → ORO: un
 * escalón y 162.100 de cupo por NO devolver el capital.
 *
 * El guardián que había (`enMora`) apagaba solo `meses_sin_mora` —requisito de
 * platino— y no tocaba `racha` (oro) ni `a_tiempo`: un parche por requisito, y
 * por eso tapaba uno de los tres y dejaba dos. Ahora hay UNA regla
 * (estadoParaNivel) y los tres contadores salen de ella.
 *
 * Y la segunda mitad: la prórroga ponía el reloj de mora en cero, así que el
 * ciclo SIGUIENTE se acreditaba al 90% mientras que saldar la deuda vencida
 * acredita al 45%. Encadenar prórrogas rendía 50,4% por peso pagado contra el
 * 45% de saldar. El §4-bis del motor lo cierra: el 90% es del crédito que nunca
 * se atrasó.
 * ======================================================================== */

describe('el nivel no puede premiar al que no paga (5-ago-2026)', () => {

  const CAP = 200000;
  const socio = () => ({ id: 's1', numero: 1, nombre: 'Ana', cedula: '123456',
    telefono: '3001112222', whatsappIgual: true, referencia: { nombre: '', telefono: '' },
    gestiones: [], ajusteGarantia: 0 });
  const menos12 = c => M.iso(M.sumarDias(M.aFechaLocal(c), -12));
  const limpio = (id, n, corte) => ({ id: id, numero: n, socioId: 's1', capital: CAP,
    costoPct: 20, fechaDesembolso: menos12(corte), cicloActual: corte, cicloPago: corte,
    pagado: true, fechaPagado: corte, gananciaPago: 40000, cobroRegistrado: true,
    prorrogas: [], abonosCapital: [], comprobantes: [] });
  const abierto = (id, n, corte) => ({ id: id, numero: n, socioId: 's1', capital: CAP,
    costoPct: 20, fechaDesembolso: menos12(corte), cicloActual: corte, pagado: false,
    prorrogas: [], abonosCapital: [], comprobantes: [] });

  /* La cartera de la decisión: `antes` quincenas limpias, después el crédito que
     se vence, y `despues` quincenas limpias posteriores al día de la decisión.
     Devuelve el crédito vencido y el día en que hay que decidir. */
  function partida(antes, diasMora, despues) {
    const s = socio();
    const db = { socios: [s], prestamos: [], respaldados: [], config: {}, contadores: {} };
    let d = M.aFechaLocal('2026-01-15');
    for (let i = 0; i < antes; i++) {
      db.prestamos.push(limpio('a' + i, i + 1, M.iso(d)));
      d = M.aFechaLocal(M.calcularFechaCorte(d));
    }
    const corte = M.iso(d);
    const p = abierto('x', antes + 1, corte);
    db.prestamos.push(p);
    const dia = M.iso(M.sumarDias(M.aFechaLocal(corte), diasMora));
    return { db: db, s: s, p: p, corte: corte, dia: dia,
      /* Las quincenas limpias de después se agregan CUANDO ya se decidió, para
         que los dos caminos tengan exactamente la misma cartera posterior. */
      seguir: function () {
        let e = M.aFechaLocal(M.calcularFechaCorte(M.aFechaLocal(dia)));
        for (let i = 0; i < despues; i++) {
          db.prestamos.push(limpio('z' + i, antes + 2 + i, M.iso(e)));
          e = M.aFechaLocal(M.calcularFechaCorte(e));
        }
      } };
  }

  // Las cuatro salidas que ve el socio, más la racha, en un solo objeto.
  function foto(db, s) {
    const m = P.migrarSocio(db, s);
    const e = P.entradaGarantia(db, s);
    const q = M.cupoQuincenal(e, m.garantia.nivel);
    return { garantia: P.garantiaGanadaDe(db, s), nivel: m.garantia.nivel,
      cupo: q.cupo, respaldado: M.maximoRespaldado(e),
      racha: m.garantia.racha, a_tiempo: m.garantia.pagados_a_tiempo,
      meses: m.garantia.meses_sin_mora };
  }
  const escalon = n => M.NIVELES.indexOf(n);

  /* Los cuatro caminos, cada uno devolviendo la plata de COSTOS que le cobra al
     socio: el capital que devuelve no es costo y nunca generó garantía. */
  function pagarTodo(t) {
    const l = P.liquidarCiclo(t.p, t.dia);
    t.p.pagado = true; t.p.fechaPagado = t.dia; t.p.cicloPago = t.p.cicloActual;
    t.p.cobroRegistrado = true; t.p.gananciaPago = l.costo_total_pagado;
    t.p.recargoMora = l.recargo_mora;
    return l.costo_total_pagado;
  }
  function prorrogar(t, fecha) {
    const r = M.liquidarProrroga({ id: t.p.id, capital: P.capitalActual(t.p),
      tasa_aplicada: 0.20, costo: Math.round(P.K(t.p)), fecha_corte: t.p.cicloActual,
      estado: 'en_corte', prorrogas_usadas: t.p.prorrogas.length,
      nivel_socio: 'oro' }, fecha || t.dia);
    assert.ok(r.ok, 'la prórroga tenía que poderse registrar');
    t.p.prorrogas.push({ fecha: r.fecha, ciclo: r.fecha_corte_anterior, monto: r.total_a_pagar,
      mora: r.recargo_mora, aTiempo: r.a_tiempo, diasMora: r.dias_mora,
      nuevoCiclo: r.fecha_corte_nueva });
    t.p.cicloActual = r.fecha_corte_nueva;
    return r.total_a_pagar;
  }
  function pasarAPlan(t, fecha) {
    const r = M.liquidarProrroga({ id: t.p.id, capital: P.capitalActual(t.p),
      tasa_aplicada: 0.20, costo: Math.round(P.K(t.p)), fecha_corte: t.p.cicloActual,
      estado: 'en_mora', prorrogas_usadas: 2, nivel_socio: 'oro' }, fecha || t.dia);
    assert.equal(r.ok, false, 'con dos usadas la salida es el plan');
    const plan = r.plan_de_pagos;
    t.p.planPagos = { creado: r.fecha, tasa_por_corte: plan.tasa_por_corte,
      entrada: { fecha: r.fecha, ciclo: r.fecha_corte_anterior, monto: r.total_a_pagar,
                 mora: r.recargo_mora, aTiempo: r.a_tiempo, diasMora: r.dias_mora },
      total_capital: plan.total_capital, total_costo: plan.total_costo,
      total_a_pagar: plan.total_a_pagar,
      cuotas: plan.cuotas.map(q => ({ n: q.numero, fecha: q.fecha_corte, capital: q.capital,
        costo: q.costo, total: q.total, pagado: false, fechaPagado: null,
        recargo: 0, garantiaGenerada: 0 })) };
    t.p.cicloActual = t.p.planPagos.cuotas[0].fecha;
    return r.total_a_pagar;
  }

  test('EL NÚMERO DEL DEFECTO: la racha premiaba al que se queda el capital', () => {
    // 10 limpias y el 11 vencido 127 días: pagar dejaba racha 0, prorrogar 10.
    const a = partida(10, 127, 0), b = partida(10, 127, 0);
    const cobradoPaga = pagarTodo(a);
    const cobradoDeja = prorrogar(b);
    assert.equal(cobradoPaga, cobradoDeja, 'la misma plata de costos en los dos');
    const paga = foto(a.db, a.s), deja = foto(b.db, b.s);

    /* Las cuatro salidas eran (y siguen siendo) idénticas: el capital devuelto
       no compra garantía. Lo que estaba al revés era la racha. */
    assert.equal(paga.garantia, deja.garantia);
    assert.equal(paga.nivel, deja.nivel);
    assert.equal(paga.cupo, deja.cupo);
    assert.equal(paga.respaldado, deja.respaldado);
    assert.equal(deja.racha, 0, 'ANTES daba 10: el vencido sin pagar no rompía nada');
    assert.equal(paga.racha, deja.racha, 'y pagar no puede dejar la racha PEOR');
  });

  test('EL CASO DEL ESCALÓN: pagar dejaba un nivel abajo y menos cupo', () => {
    // 4 puntuales, el 5 vencido, y 2 puntuales después.
    const a = partida(4, 78, 2), b = partida(4, 78, 2);
    pagarTodo(a); a.seguir();
    prorrogar(b); b.seguir();
    const paga = foto(a.db, a.s), deja = foto(b.db, b.s);
    assert.equal(paga.a_tiempo, 6); assert.equal(deja.a_tiempo, 6);
    assert.equal(deja.racha, 2, 'ANTES daba 6: los 4 de antes se pegaban con los 2 de después');
    assert.equal(deja.nivel, 'plata', 'ANTES era ORO, por no haber pagado');
    assert.equal(paga.nivel, deja.nivel);
    assert.equal(paga.cupo, deja.cupo, 'ANTES: 648.400 pagando contra 810.500 prorrogando');
    assert.ok(paga.cupo >= deja.cupo);
  });

  test('BARRIDO: pagar no deja PEOR en ninguna de las cuatro salidas, ni en la racha', () => {
    let casos = 0;
    const peores = [];
    [0, 1, 2, 3, 4, 10].forEach(antes => {
      // `0` es el caso sin un día de atraso: prorrogar EN FECHA tampoco puede
      // dejar mejor que pagar. Los demás son moras de 1 día a 127.
      [0, 1, 5, 20, 60, 127].forEach(dias => {
        [0, 1, 2].forEach(despues => {
          // PAGA: entrega capital + costos y cierra el crédito.
          const a = partida(antes, dias, despues);
          pagarTodo(a); a.seguir();
          const paga = foto(a.db, a.s);
          // NO PAGA, tres formas: dejarlo vencido, prorrogar, pasar a plan.
          const otros = {};
          const b = partida(antes, dias, despues); b.seguir();
          otros.vencido = foto(b.db, b.s);
          const c = partida(antes, dias, despues);
          prorrogar(c); c.seguir();
          otros.prorroga = foto(c.db, c.s);
          const d = partida(antes, dias, despues);
          pasarAPlan(d); d.seguir();
          otros.plan = foto(d.db, d.s);

          Object.keys(otros).forEach(k => {
            const otro = otros[k];
            casos++;
            const donde = antes + '/' + dias + '/' + despues + ' vs ' + k + ': ';
            if (paga.garantia < otro.garantia) peores.push(donde + 'garantía');
            if (escalon(paga.nivel) < escalon(otro.nivel)) peores.push(donde + 'nivel');
            if (paga.cupo < otro.cupo) peores.push(donde + 'cupo');
            if (paga.respaldado < otro.respaldado) peores.push(donde + 'respaldado');
            if (paga.racha < otro.racha) peores.push(donde + 'racha');
            if (paga.meses < otro.meses) peores.push(donde + 'meses sin mora');
          });
        });
      });
    });
    assert.equal(casos, 324, 'el barrido se quedó corto: ' + casos);
    assert.deepEqual(peores, [], 'pagar quedó peor que no pagar en ' + peores.length +
      ' salidas: ' + peores.join(' · '));
  });

  test('BARRIDO: encadenar prórrogas nunca DOMINA a saldar la deuda', () => {
    /* La comparación honesta es POR PESO DE COSTO, porque el que encadena sigue
       pagando ciclos: si cada peso rindiera lo mismo, pagar más ciclos daría más
       garantía y eso es correcto. Lo que no puede pasar —y era lo que pasaba— es
       que el peso del que NO paga rinda MÁS: la primera prórroga ponía el reloj
       de mora en cero y la segunda cobraba el 90% del que nunca se atrasó (50,4%
       por peso pagado contra el 45% del que salda). */
    let casos = 0;
    [0, 2, 5, 10].forEach(antes => {
      // Con y sin atraso: encadenar en fecha tampoco puede rendir más por peso.
      [0, 1, 20, 60, 127].forEach(dias => {
        const a = partida(antes, dias, 0);
        const cobradoPaga = pagarTodo(a);
        const paga = foto(a.db, a.s);

        const b = partida(antes, dias, 0);
        let cobradoCadena = prorrogar(b);
        cobradoCadena += prorrogar(b, b.p.cicloActual);      // la segunda, EN FECHA
        const cadena = foto(b.db, b.s);

        // Con el plan de pagos encima, lo mismo.
        const c = partida(antes, dias, 0);
        let cobradoPlan = prorrogar(c);
        cobradoPlan += prorrogar(c, c.p.cicloActual);
        cobradoPlan += pasarAPlan(c, c.p.cicloActual);
        const plan = foto(c.db, c.s);

        casos++;
        const donde = antes + '/' + dias + ': ';
        assert.ok(cobradoCadena > cobradoPaga, donde + 'la cadena pagó más ciclos, no menos');
        assert.ok(paga.garantia / cobradoPaga >= cadena.garantia / cobradoCadena - 1e-9,
          donde + 'por peso pagado, encadenar rinde MÁS que saldar');
        assert.ok(paga.garantia / cobradoPaga >= plan.garantia / cobradoPlan - 1e-9,
          donde + 'por peso pagado, el plan rinde MÁS que saldar');
        // Y ni la cadena ni el plan compran escalón ni racha.
        assert.ok(escalon(paga.nivel) >= escalon(cadena.nivel), donde + 'la cadena compró nivel');
        assert.ok(escalon(paga.nivel) >= escalon(plan.nivel), donde + 'el plan compró nivel');
        assert.ok(paga.racha >= cadena.racha, donde + 'la cadena compró racha');
      });
    });
    assert.equal(casos, 20);
  });

  test('EL NÚMERO DE LA CADENA: 425.250 con 334.000 pagados contra 410.250 con 494.000', () => {
    const a = partida(10, 127, 0);
    assert.equal(pagarTodo(a), 294000, 'costo 40.000 + 127 días de recargo');
    assert.equal(foto(a.db, a.s).garantia, 410250);

    const b = partida(10, 127, 0);
    let cadena = prorrogar(b);
    cadena += prorrogar(b, b.p.cicloActual);
    assert.equal(cadena, 334000, 'los 294.000 y un ciclo más de 40.000');
    /* El ciclo que compró la prórroga acredita A LA MITAD, no completo. Con los
       factores de la mañana del 5-ago esto se medía 528.300 contra 492.300; el
       cambio de reparto de esa tarde lo baja a 425.250 contra 410.250 y la
       relación es la misma: encadenar paga menos por peso. */
    assert.equal(foto(b.db, b.s).garantia, 425250, 'el ciclo que compró la prórroga va a la mitad');
    assert.equal(425250 - 410250, M.acumularGarantia(40000, false),
      'la mitad de los 40.000 del ciclo nuevo, no el factor completo');
  });

  test('Y EL NIVEL SIGUE SIN BAJAR NUNCA, en los cuatro caminos', () => {
    let casos = 0;
    [2, 5, 10].forEach(antes => {
      [1, 20, 127].forEach(dias => {
        [0, 2].forEach(despues => {
          const base = partida(antes, dias, despues);
          // El nivel que ya tenía el día de la decisión, con lo que tenía ese día.
          const antesDeDecidir = P.nivelDelSocio(base.db.prestamos, base.dia);
          [pagarTodo, t => prorrogar(t), t => pasarAPlan(t), () => 0].forEach(camino => {
            const t = partida(antes, dias, despues);
            camino(t); t.seguir();
            const despuesDeDecidir = P.migrarSocio(t.db, t.s).garantia.nivel;
            casos++;
            assert.ok(escalon(despuesDeDecidir) >= escalon(antesDeDecidir),
              'el nivel BAJÓ (' + antes + '/' + dias + '/' + despues + '): ' +
              antesDeDecidir + ' → ' + despuesDeDecidir);
          });
        });
      });
    });
    assert.equal(casos, 72);
  });

  test('LA REGLA ES UNA SOLA: el vencido sin pagar rompe igual que el pagado tarde', () => {
    const t = partida(3, 40, 0);
    // Vencido y sin pagar: rompe.
    assert.equal(P.estadoParaNivel(t.p, t.dia), 'rompe');
    assert.equal(P.contadoresDeNivel(t.db.prestamos, t.dia).racha, 0);
    // Y los tres de antes siguen ganando su escalón: no se le quita nada.
    assert.equal(P.contadoresDeNivel(t.db.prestamos, t.dia).a_tiempo, 3);
    // El mismo crédito pagado TARDE rompe exactamente igual, ni más ni menos.
    const u = partida(3, 40, 0);
    pagarTodo(u);
    assert.equal(P.estadoParaNivel(u.p, u.dia), 'rompe');
    assert.deepEqual(P.contadoresDeNivel(u.db.prestamos, u.dia),
                     P.contadoresDeNivel(t.db.prestamos, t.dia));
  });

  test('un crédito al día no le rompe la racha a nadie', () => {
    const t = partida(3, 0, 0);          // el día del corte todavía no es mora
    assert.equal(P.estadoParaNivel(t.p, t.corte), 'abierto');
    assert.equal(P.contadoresDeNivel(t.db.prestamos, t.corte).racha, 3,
      'un crédito al día no puede costarle la racha al que viene pagando');
    // Al día siguiente del corte sí: ahí ya debe.
    const uno = M.iso(M.sumarDias(M.aFechaLocal(t.corte), 1));
    assert.equal(P.estadoParaNivel(t.p, uno), 'rompe');
    assert.equal(P.contadoresDeNivel(t.db.prestamos, uno).racha, 0);
  });

  test('la mora tapada con una prórroga sigue rompiendo: no se cura sola', () => {
    /* El agujero que quedaría si la regla mirara solo el instante: la prórroga
       corre el corte al futuro, así que al día siguiente el crédito volvía a
       estar "al día" y la racha se recomponía sola. */
    const t = partida(3, 40, 0);
    prorrogar(t);
    const despues = M.iso(M.sumarDias(M.aFechaLocal(t.p.cicloActual), -1));
    assert.equal(P.estabaVencido(t.p, despues), false, 'ese día ya no debía: lo compró');
    assert.equal(P.estuvoEnMora(t.p, despues), true, 'pero estuvo vencido 40 días');
    assert.equal(P.estadoParaNivel(t.p, despues), 'rompe');
    assert.equal(P.contadoresDeNivel(t.db.prestamos, despues).racha, 0);
  });

  test('prorrogar EN FECHA no se castiga con la garantía: la mora es la que cuenta', () => {
    /* El §4-bis mira la MORA, no la prórroga: sin un día de atraso la prórroga
       sigue acreditando al 90%, igual que antes. */
    const t = partida(2, 0, 0);
    assert.equal(prorrogar(t, t.corte), 40000, 'sin recargo: se registró el día del corte');
    assert.equal(P.garantiaGanadaCredito(t.p), M.acumularGarantia(40000, true));
    // Pero el escalón no lo gana: esa es la regla del 4-ago y sigue en pie.
    assert.equal(P.estadoParaNivel(t.p, t.corte), 'rompe');
  });

  test('en el plan de pagos, una cuota tarde no le devuelve el 90% a la siguiente', () => {
    /* El plan tiene su propio calendario, y cada cuota que vence es un corte
       nuevo: sin el §4-bis, atrasarse en la cuota 1 y pagar la 2 en fecha volvía
       a cobrar el 90%, que es el mismo reloj de mora puesto en cero. */
    const p = { id: 'q', numero: 1, socioId: 's1', capital: 600000, costoPct: 20,
      fechaDesembolso: '2026-06-01', cicloActual: '2026-08-31', pagado: false,
      prorrogas: [], abonosCapital: [], comprobantes: [],
      planPagos: { creado: '2026-06-30', tasa_por_corte: 0.05,
        // Pactado EN FECHA: la entrada conserva su 90%, no hubo mora antes.
        entrada: { fecha: '2026-06-30', ciclo: '2026-06-30', monto: 120000,
                   mora: 0, aTiempo: true },
        cuotas: [
          { n: 1, fecha: '2026-07-15', capital: 200000, costo: 30000, total: 230000,
            pagado: true, fechaPagado: '2026-07-25', recargo: 20000, garantiaGenerada: 22500 },
          { n: 2, fecha: '2026-07-31', capital: 200000, costo: 20000, total: 220000,
            pagado: true, fechaPagado: '2026-07-31', recargo: 0, garantiaGenerada: 18000 },
          { n: 3, fecha: '2026-08-31', capital: 200000, costo: 10000, total: 210000,
            pagado: false, fechaPagado: null, recargo: 0, garantiaGenerada: 0 }
        ] } };
    assert.equal(P.prorrogaAcreditaEnFecha(p.planPagos.entrada, p), true,
      'el plan se pactó sin un día de mora: la entrada conserva su 90%');
    assert.equal(P.estuvoEnMora(p, '2026-07-30'), true, 'la cuota 1 se pagó 10 días tarde');
    assert.equal(P.garantiaGanadaCredito(p),
      M.acumularGarantia(120000, true)                                        // entrada
      + M.acumularGarantia(30000, false) + M.acumularGarantia(20000, false)   // cuota 1, tarde
      + M.acumularGarantia(20000, false));                                    // cuota 2, ANTES al 90%
  });

  test('LA REGLA DEL 90% VIVE EN EL MOTOR, y el dato histórico lo trae el puente', () => {
    // El motor no adivina la historia: la recibe. Sin el dato, el crédito nuevo.
    assert.equal(M.cuentaComoPuntualParaGarantia({ pagado_en_fecha: true }), true);
    assert.equal(M.cuentaComoPuntualParaGarantia(
      { pagado_en_fecha: true, credito_estuvo_en_mora: true }), false);
    assert.equal(M.cuentaComoPuntualParaGarantia(
      { pagado_en_fecha: false, credito_estuvo_en_mora: false }), false);
    assert.throws(() => M.cuentaComoPuntualParaGarantia(null), TypeError);
    // Y el motor lo lee de `credito.estuvo_en_mora` en sus tres liquidaciones.
    const c = { capital: 200000, costo: 40000, fecha_corte: '2026-08-15' };
    const limpia = M.liquidarCredito(c, '2026-08-15');
    const conMora = M.liquidarCredito(Object.assign({ estuvo_en_mora: true }, c), '2026-08-15');
    assert.equal(limpia.acredita_en_fecha, true);
    assert.equal(conMora.acredita_en_fecha, false);
    assert.equal(limpia.garantia_generada, M.acumularGarantia(40000, true));
    assert.equal(conMora.garantia_generada, M.acumularGarantia(40000, false));
    const pr = { id: 'y', capital: 200000, tasa_aplicada: 0.20, fecha_corte: '2026-08-15',
      estado: 'en_corte', prorrogas_usadas: 0, nivel_socio: 'oro' };
    assert.equal(M.liquidarProrroga(pr, '2026-08-15').garantia_generada,
                 M.acumularGarantia(40000, true));
    assert.equal(M.liquidarProrroga(Object.assign({ estuvo_en_mora: true }, pr), '2026-08-15')
                 .garantia_generada, M.acumularGarantia(40000, false));
    assert.equal(M.aplicarProrroga(pr, { fecha: '2026-08-15' }).prorroga_acredita_en_fecha, true);
    assert.equal(M.aplicarProrroga(Object.assign({ estuvo_en_mora: true }, pr),
                 { fecha: '2026-08-15' }).prorroga_acredita_en_fecha, false);

    /* Y el puente lo publica ya calculado, para que las dos pantallas puedan
       preguntarlo en vez de deducirlo. Lo que falta —y es la ronda siguiente,
       porque hoy no se tocan crm.html ni socio.html:
         · crm.html: `creditoMotor(p)` tiene que pasar estuvo_en_mora, y
           `garantiaDeProrroga(pr)` tiene que llamar PUENTE.garantiaGanadaProrroga(pr, p).
         · socio.html: su `liquidacion()` tiene que pasarle c.estuvo_en_mora al motor.
       Hasta entonces el número del socio (que sale del puente) es el bueno y el
       del confirm del Panel puede quedar optimista en el caso de la mora tapada. */
    assert.equal(typeof P.estuvoEnMora, 'function');
    assert.equal(typeof P.prorrogaAcreditaEnFecha, 'function');
    const t = partida(1, 40, 0);
    prorrogar(t);
    const liq = P.liquidarCiclo(t.p, t.p.cicloActual);
    assert.equal(liq.estuvo_en_mora, true, 'el paquete tiene que traer el dato');
    assert.equal(liq.acredita_en_fecha, false, 'y el factor ya resuelto');
    assert.equal(liq.garantia_generada, M.acumularGarantia(liq.costo_total_pagado, false));
    const enviado = P.migrarSocio(t.db, t.s).creditos[0];
    assert.equal(enviado.estuvo_en_mora, true, 'y la app tiene que recibirlo');
  });
});

/* ==========================================================================
 * LA APP DEL SOCIO NO SOLO RECIBE EL §4-bis: LO LEE — 5-ago-2026
 *
 * EL DEFECTO. `liquidacion()` de socio.html nunca leía `c.estuvo_en_mora`,
 * aunque el puente se lo mandaba hecho desde el 5-ago
 * (migrarSocio(...).creditos[].estuvo_en_mora). Sus tres salidas daban el 90%
 * incondicional: dos lo tenían escrito a mano —M.acumularGarantia(costo, true)—
 * y la del medio llamaba a M.liquidarCredito sin el dato, así que el motor
 * asumía el crédito recién desembolsado.
 *
 * MEDIDO: crédito de 200.000 que estuvo en mora, prorrogado, pagado EN FECHA
 * del corte nuevo. El Panel y el puente acreditan 18.000. La tarjeta del socio
 * y el recordatorio del calendario decían 36.000. EL DOBLE, y del lado
 * optimista: el socio paga creyendo una cosa y le entra otra.
 *
 * POR QUÉ LAS 404 PRUEBAS PASABAN CON ESTO VIVO: la prueba de la ronda anterior
 * comprobaba que el dato VIAJARA (liq.estuvo_en_mora, enviado.estuvo_en_mora),
 * no que alguien lo leyera del otro lado. Por eso estas EJECUTAN la función de
 * socio.html, igual que las del Panel ejecutan la suya.
 * ======================================================================== */

describe('socio.html liquida con el §4-bis, no contra él (5-ago-2026)', () => {

  const SOCIO = fs.readFileSync(path.join(__dirname, '..', 'app', 'socio.html'), 'utf8');
  const fnSocio = nombre => {
    const i = SOCIO.indexOf('\nfunction ' + nombre + '(');
    assert.ok(i >= 0, 'socio.html ya no declara ' + nombre + ': revisá quién lo usa');
    const j = SOCIO.indexOf('\nfunction ', i + 1);
    return SOCIO.slice(i, j < 0 ? SOCIO.length : j);
  };
  /* La función de la app, ejecutándose de verdad. Solo necesita el motor: todo
     lo demás que toca son sus dos ayudas de fecha. */
  const app = new Function('M',
    fnSocio('hoyISO') + '\n' + fnSocio('fechaRel') + '\n' + fnSocio('liquidacion') +
    '\nreturn { liquidacion: liquidacion, hoyISO: hoyISO };')(M);

  const CAP = 200000, COSTO = 40000;
  /* Los nombres quedaron de cuando los factores eran 90% y 45%. Los números son
     los de hoy (75% y 37,5%) y salen del motor, no escritos a mano: lo que la
     prueba fija es la RELACIÓN —el completo es el doble de la mitad—, que es el
     error que la app cometía. */
  const NOVENTA = M.acumularGarantia(COSTO, true);   // 30.000
  const CUARENTA = M.acumularGarantia(COSTO, false); // 15.000

  test('los dos números del reclamo son los del enunciado', () => {
    assert.equal(NOVENTA, 30000);
    assert.equal(CUARENTA, 15000);
    assert.equal(NOVENTA, CUARENTA * 2, 'el error era exactamente el doble');
  });

  /* --- ruta 1: HOY, con el paquete al día (la que pinta la tarjeta) --- */
  test('RUTA "hoy": la tarjeta del socio no promete el 90% de un crédito que se atrasó', () => {
    const hoy = app.hoyISO();
    const paquete = mora => ({ capital: CAP, costo: COSTO, corte: hoy,
      causado: { costo: COSTO, mora: 0, dias: 0 }, dias_mora: 0, mora: 0,
      total_hoy: CAP + COSTO, estuvo_en_mora: mora });

    const sucio = app.liquidacion(paquete(true));
    const limpio = app.liquidacion(paquete(false));
    // `tramo` solo lo devuelve el motor: si no está, esta ES la ruta corta.
    assert.equal(sucio.tramo, undefined, 'no estoy probando la ruta que creo');
    assert.equal(limpio.tramo, undefined);

    assert.equal(sucio.pago_a_tiempo, true, 'el pago SÍ llega dentro del corte');
    assert.equal(sucio.acredita_en_fecha, false, 'pero no acredita al 90% (§4-bis)');
    assert.equal(sucio.garantia_generada, CUARENTA);
    assert.equal(sucio.garantia_si_puntual, CUARENTA,
      'ni pagando hoy en fecha vuelve el 90%: el techo honesto es el 45%');

    assert.equal(limpio.acredita_en_fecha, true);
    assert.equal(limpio.garantia_generada, NOVENTA);
    assert.equal(limpio.garantia_si_puntual, NOVENTA);
  });

  /* --- ruta 2: otra fecha, con capital vigente (la del motor) --- */
  test('RUTA "otra fecha": el dato entra al motor DENTRO del crédito', () => {
    const CORTE = '2026-08-15';
    const paquete = mora => ({ capital: CAP, costo: COSTO, corte: CORTE,
      causado: { costo: COSTO, mora: 0, dias: 0 }, dias_mora: 0, mora: 0,
      total_hoy: CAP + COSTO, estuvo_en_mora: mora });

    const sucio = app.liquidacion(paquete(true), CORTE);
    const limpio = app.liquidacion(paquete(false), CORTE);
    assert.equal(sucio.tramo, M.tramoDeMora(0).tramo, 'esta sí tiene que ser la del motor');

    assert.equal(sucio.dias_mora, 0);
    assert.equal(sucio.acredita_en_fecha, false);
    assert.equal(sucio.garantia_generada, CUARENTA);
    assert.equal(sucio.garantia_si_puntual, CUARENTA);
    assert.equal(limpio.garantia_generada, NOVENTA);
    assert.equal(limpio.garantia_si_puntual, NOVENTA);

    // Y con mora encima el 45% no cambia por venir de otra mora: ya era 45%.
    const tarde = app.liquidacion(paquete(true), '2026-08-25');
    assert.equal(tarde.dias_mora, 10);
    assert.equal(tarde.garantia_generada,
      M.acumularGarantia(COSTO + tarde.recargo_mora, false));
  });

  /* --- ruta 3: sin capital vigente (todo abonado) o sin corte --- */
  test('RUTA "sin capital": el crédito con el capital ya abonado tampoco vuelve al 90%', () => {
    const paquete = mora => ({ capital: 0, costo: COSTO, corte: '2026-08-15',
      estuvo_en_mora: mora });
    const sucio = app.liquidacion(paquete(true), '2026-08-15');
    const limpio = app.liquidacion(paquete(false), '2026-08-15');
    assert.equal(sucio.tramo, undefined, 'no estoy probando la ruta que creo');
    assert.equal(sucio.pago_a_tiempo, true);
    assert.equal(sucio.acredita_en_fecha, false);
    assert.equal(sucio.garantia_generada, CUARENTA);
    assert.equal(sucio.garantia_si_puntual, CUARENTA);
    assert.equal(limpio.garantia_generada, NOVENTA);
    assert.equal(limpio.garantia_si_puntual, NOVENTA);
  });

  test('LAS TRES RUTAS contestan lo mismo que M.cuentaComoPuntualParaGarantia', () => {
    const hoy = app.hoyISO();
    [true, false].forEach(mora => {
      const esperado = M.cuentaComoPuntualParaGarantia(
        { pagado_en_fecha: true, credito_estuvo_en_mora: mora });
      const rutas = [
        app.liquidacion({ capital: CAP, costo: COSTO, corte: hoy, dias_mora: 0, mora: 0,
          causado: { costo: COSTO, mora: 0, dias: 0 }, total_hoy: CAP + COSTO,
          estuvo_en_mora: mora }),
        app.liquidacion({ capital: CAP, costo: COSTO, corte: '2026-08-15',
          estuvo_en_mora: mora }, '2026-08-15'),
        app.liquidacion({ capital: 0, costo: COSTO, corte: '2026-08-15',
          estuvo_en_mora: mora }, '2026-08-15')
      ];
      rutas.forEach((q, i) => {
        assert.equal(q.acredita_en_fecha, esperado, 'ruta ' + (i + 1));
        assert.equal(q.garantia_si_puntual, M.acumularGarantia(COSTO, esperado),
          'ruta ' + (i + 1) + ' con estuvo_en_mora=' + mora);
      });
    });
  });

  test('sin el dato —paquete viejo— se sigue asumiendo el crédito limpio', () => {
    // La misma regla que el motor: sin `estuvo_en_mora` no se inventa una mora.
    const q = app.liquidacion({ capital: CAP, costo: COSTO, corte: '2026-08-15' }, '2026-08-15');
    assert.equal(q.acredita_en_fecha, true);
    assert.equal(q.garantia_si_puntual, NOVENTA);
  });

  /* ---------- EL CASO DEL RECLAMO, de punta a punta ---------- */
  test('EL PANEL Y EL CELULAR DICEN LA MISMA GARANTÍA (la mora tapada por una prórroga)', () => {
    const p = { id: 'x', numero: 1, socioId: 's1', capital: CAP, costoPct: 20,
      fechaDesembolso: '2026-07-20', cicloActual: '2026-08-15', pagado: false,
      abonosCapital: [], comprobantes: [],
      // Prorrogado con 5 días de atraso encima: el corte se movió, la mora no.
      prorrogas: [{ fecha: '2026-08-05', ciclo: '2026-07-31', monto: 50000, mora: 10000,
                    aTiempo: false, diasMora: 5, nuevoCiclo: '2026-08-15' }] };

    // Lo que el Panel y el puente acreditan pagando EN FECHA del corte nuevo.
    const liq = P.liquidarCiclo(p, '2026-08-15');
    assert.equal(liq.estuvo_en_mora, true);
    assert.equal(liq.pago_a_tiempo, true, 'el 15-ago es su corte: el pago llega en fecha');
    assert.equal(liq.acredita_en_fecha, false, 'y aun así acredita al 45% (§4-bis)');
    assert.equal(liq.garantia_generada, CUARENTA);

    // El paquete tal como viaja a la app (migrarSocio arma estos mismos campos).
    const c = { capital: liq.capital, costo: liq.costo, corte: liq.corte,
      dias_mora: liq.dias_mora, mora: liq.recargo_mora, total_hoy: liq.total_a_pagar,
      causado: liq.causado, estuvo_en_mora: liq.estuvo_en_mora };

    const q = app.liquidacion(c, '2026-08-15');
    assert.equal(q.garantia_generada, liq.garantia_generada,
      'la app y el Panel no pueden acreditar dos garantías del mismo pago');
    assert.equal(q.garantia_si_puntual, CUARENTA,
      'y la tarjeta no puede prometer 36.000 cuando van a entrar 18.000');
    assert.notEqual(q.garantia_si_puntual, NOVENTA);
  });

  test('el defecto no puede volver: las tres salidas dejaron de tener el 90% escrito a mano', () => {
    const cuerpo = fnSocio('liquidacion');
    assert.match(cuerpo, /c\.estuvo_en_mora/,
      'si liquidacion() no lee el dato, vuelve a prometer el doble');
    assert.ok(!/acumularGarantia\(costo,\s*true\)/.test(cuerpo),
      'el 90% incondicional volvió a escribirse a mano en socio.html');
    assert.ok(!/acumularGarantia\([^()]*,\s*dias(Causados)?\s*===\s*0\)/.test(cuerpo),
      'el factor no puede salir de los días: sale de cuentaComoPuntualParaGarantia');
    assert.match(cuerpo, /cuentaComoPuntualParaGarantia/,
      'la regla vive en el motor; la app la pregunta');
  });
});

/* ==========================================================================
 * Y LA APP LO DICE — el texto que dejó de ser cierto (5-ago-2026)
 *
 * "Si pagas en fecha, sumas el doble" es verdad del crédito que nunca se
 * atrasó. Con el §4-bis, el que ya se atrasó suma el 45% aunque el corte nuevo
 * se pague puntual. Un número correcto debajo de una frase falsa sigue siendo
 * un reclamo: el socio lee la frase.
 * ======================================================================== */

describe('la app no promete el doble sin la excepción (5-ago-2026)', () => {

  const SOCIO = fs.readFileSync(path.join(__dirname, '..', 'app', 'socio.html'), 'utf8');
  const cuerpoEnSocio = nombre => {
    const i = SOCIO.indexOf('\nfunction ' + nombre + '(');
    assert.ok(i >= 0, 'socio.html ya no declara ' + nombre);
    const j = SOCIO.indexOf('\nfunction ', i + 1);
    return SOCIO.slice(i, j < 0 ? SOCIO.length : j);
  };

  test('la promesa vieja ya no está en ninguna pantalla', () => {
    assert.ok(!/Si pagas en fecha, sumas el doble/.test(SOCIO),
      'esa frase le promete el 90% a un crédito que puede venir de una mora');
    assert.ok(!/Si te atrasas igual suma, pero la mitad\./.test(SOCIO),
      'el remate viejo cerraba la idea sin nombrar la excepción');
  });

  test('la tarjeta del crédito tiene DOS textos, y elige con el mismo dato que la cifra', () => {
    const cuerpo = cuerpoEnSocio('tarjetaActivo');
    assert.match(cuerpo, /q\.credito_estuvo_en_mora/,
      'el texto sale de la misma liquidación que la cifra, o vuelven a decir cosas distintas');
    assert.match(cuerpo, /ya se atrasó una vez/,
      'al crédito que viene de mora hay que decírselo de frente');
    assert.match(cuerpo, /puntualidad se premia desde el primer día/,
      'y al que nunca se atrasó, que la puntualidad se premia desde el principio');
    assert.match(cuerpo, /no la puntualidad|compra tiempo|compró tiempo/,
      'la prórroga compra tiempo, no puntualidad: esa es la idea que cierra el reclamo');
  });

  test('el recordatorio del calendario dice lo mismo que la tarjeta', () => {
    const cuerpo = cuerpoEnSocio('armarICS');
    assert.match(cuerpo, /q\.credito_estuvo_en_mora/,
      'el ICS sale de liquidacion(): tiene que ramificar con el mismo dato');
    assert.match(cuerpo, /el doble de lo que sube pagando tarde/);
    assert.match(cuerpo, /ya se atrasó una vez/);
  });

  test('la pantalla de las reglas explica la excepción con los números del motor', () => {
    const cuerpo = cuerpoEnSocio('verReglas');
    assert.match(cuerpo, /r\.garantia\.factor_puntual/,
      'el 90% del texto tiene que salir del motor, no escribirse a mano');
    assert.match(cuerpo, /r\.garantia\.factor_mora/,
      'y el 45% también: si un día cambian, la pantalla cambia sola');
    assert.match(cuerpo, /nunca<\/b> se atrasó/);
    assert.match(cuerpo, /no se borra aplazando/,
      'la regla se dice de frente: aplazar no limpia el atraso');
    assert.ok(!/\b90%|\b45%/.test(cuerpo),
      'ningún porcentaje escrito a mano en la pantalla del acuerdo');
  });

  test('donde se ofrece el préstamo con garantía tampoco se promete el 90% a secas', () => {
    const cuerpo = cuerpoEnSocio('setModo');
    assert.match(cuerpo, /M\.FACTOR_GARANTIA_MORA/,
      'decía "cada crédito que pagas te deja el 90%", sin decir a cambio de qué');
    assert.match(cuerpo, /pagando en fecha/);
  });

  test('el plan de pagos ya no dice "igual que cualquier otro pago"', () => {
    // Un crédito que llega al plan casi siempre venía atrasado: sus cuotas
    // acreditan al 45%. Suma —eso es lo que importa ahí— pero no el doble.
    assert.ok(!/igual que cualquier otro pago/.test(SOCIO));
    assert.match(cuerpoEnSocio('bloquePlanDePagos'), /M\.FACTOR_GARANTIA_MORA/);
  });

  test('y la prórroga se ofrece diciendo lo que NO hace', () => {
    const cuerpo = cuerpoEnSocio('verReglas');
    assert.match(cuerpo, /no<\/b> hace es borrar el atraso/,
      'la prórroga se decide en esa pantalla: ahí tiene que estar la letra');
  });
});

/* ==========================================================================
 * EL CAMBIO DE REGLAS DEL 5-ago-2026, VISTO DESDE ARRIBA
 *
 * Las cifras exactas que Joan pidió y la contabilidad que sale de ellas. Si una
 * sola de estas se mueve, el cambio de reglas dejó de estar hecho.
 * ======================================================================== */

describe('LA CUENTA DE PRUEBA (79111000 / 2026) con las reglas nuevas', () => {

  const SOCIO = fs.readFileSync(path.join(__dirname, '..', 'app', 'socio.html'), 'utf8');

  /* La cuenta demo de socio.html: 3 créditos de 100.000, todos en fecha, y la
     ficha de KYC completa. Se rearma acá con el motor —que es de donde socio.html
     saca sus cifras— para poder fijar los números peso a peso. */
  function cuentaDePrueba() {
    const montos = [100000, 100000, 100000];
    let ganada = 0, costos = 0;
    montos.forEach(m => {
      const costo = M.calcularCosto(m);
      costos += costo;
      ganada += M.acumularGarantia(costo, true);
    });
    return { ganada, costos, montos };
  }

  test('45.000 de garantía ganada, cupón 100.000, total 145.000, cupo 145.000', () => {
    const { ganada, costos } = cuentaDePrueba();
    assert.equal(costos, 60000, '3 créditos de 100.000 al 20%');
    assert.equal(ganada, 45000, 'el 75% de los 60.000');

    const e = { datos: datosCompletos(), acumulada: ganada };
    const c = M.cupoQuincenal(e, 'plata');
    assert.equal(c.cupon, undefined, 'cupoQuincenal no publica `cupon`: eso es del desglose');
    assert.equal(M.desglosarGarantia(e).cupon, 100000);
    assert.equal(c.ganada, 45000);
    assert.equal(c.total, 145000);
    assert.equal(c.cupo, 145000);
    assert.equal(c.respaldo_disponible, 45000, 'el respaldado se apoya solo en la ganada');
  });

  test('LO QUE DABA ANTES, para que se vea el tamaño del cambio', () => {
    // Con 90/7/3 y el factor de plata: 54.000 / 154.000 / 308.000 / 54.000.
    const { ganada } = cuentaDePrueba();
    assert.notEqual(ganada, 54000);
    assert.equal(Math.round(60000 * 0.90), 54000, 'el 90% de entonces');
    assert.equal(Math.round(60000 * 0.75), 45000, 'el 75% de ahora');
    // Y el cupo ya no se multiplica por 2: 145.000, no 308.000.
    assert.equal(M.calcularCupo(145000, 'plata'), 145000);
  });

  test('socio.html sigue sacando esas cifras del motor, no escritas a mano', () => {
    // Si un día alguien las clava en la app, esta prueba deja de tener sentido y
    // la cuenta demo empieza a mentirle al que la abre para probar.
    assert.match(SOCIO, /M\.acumularGarantia\(costoJ, true\)/,
      'la garantía de la cuenta demo tiene que salir del motor');
    assert.match(SOCIO, /M\.calcularCosto\(capJ\)/);
    assert.match(SOCIO, /var montosJoan = \[100000, 100000, 100000\]/,
      'los tres créditos de 100.000 del enunciado');
  });
});

describe('el puente le cuenta a Joan el cupón y la ganancia (5-ago-2026)', () => {

  const CORTE = '2026-01-15';
  // Un socio con la ficha completa (cupón 100.000) y n créditos de 100.000
  // pagados en fecha, como los registra el Panel.
  function dbCon(n, tarde) {
    const d = datosCompletos();
    const s = { id: 'a', numero: 1, nombre: 'Ana Perez', cedula: '1020304050',
      telefono: '3001112233', whatsappIgual: true, email: d.correo, ciudad: d.ciudad,
      direccion: d.direccion, tipoVivienda: d.vivienda, nequi: d.pago,
      telefono2: d.celular2, ubicacion: d.ubicacion,
      referencia: { nombre: 'Luz', telefono: '3009998877' },
      cedulaFrenteFoto: 'x', cedulaReversoFoto: 'y', selfieFoto: 'z', ajusteGarantia: 0 };
    const db = P.normalizar({ socios: [s], prestamos: [], respaldados: [],
      config: { negocio: 'Tu Garantía', whatsapp: '' } });
    for (let i = 0; i < n; i++) {
      const corte = M.iso(M.sumarDias(M.aFechaLocal(CORTE), 15 * i));
      db.prestamos.push({ id: 'c' + i, numero: i + 1, socioId: 'a', capital: 100000,
        costoPct: 20, fechaDesembolso: M.iso(M.sumarDias(M.aFechaLocal(corte), -12)),
        cicloActual: corte, cicloPago: corte, pagado: true,
        fechaPagado: tarde ? M.iso(M.sumarDias(M.aFechaLocal(corte), 5)) : corte,
        gananciaPago: 20000, cobroRegistrado: true,
        prorrogas: [], abonosCapital: [], comprobantes: [] });
    }
    return { db, s };
  }

  test('LA GARANTÍA QUE VE EL SOCIO Y EL REPARTO DE JOAN SON LA MISMA PLATA', () => {
    const { db, s } = dbCon(3);
    const c = P.contabilidadCupon(db, s);
    // El mismo número por los dos caminos: si se separan, uno de los dos miente.
    assert.equal(c.garantia_socio, P.garantiaGanadaDe(db, s));
    assert.equal(c.garantia_socio, 45000);
    assert.equal(c.cobrado, 60000, 'los 60.000 de costos que pagó');
    assert.equal(c.garantia_socio + c.cupon_recuperado + c.ganancia_libre, c.cobrado);
  });

  test('tres créditos devuelven 9.000 del cupón y quedan 91.000 en la calle', () => {
    const { db, s } = dbCon(3);
    const c = P.contabilidadCupon(db, s);
    assert.equal(c.cupon_prestado, 100000, 'la ficha completa');
    assert.equal(c.cupon_recuperado, 9000, 'el 15% de los 60.000');
    assert.equal(c.cupon_pendiente, 91000);
    assert.equal(c.expuesto, 91000, 'lo único que Joan tiene de verdad en riesgo');
    assert.equal(c.saldado, false);
    assert.equal(c.ganancia_libre, 6000, 'el 10% operativo');
    assert.equal(c.ganancia_cupon, 0, 'todavía no hay 15% liberado');
  });

  test('LA EXPOSICIÓN BAJA CRÉDITO A CRÉDITO', () => {
    let anterior = 100001;
    for (let n = 0; n <= 6; n++) {
      const { db, s } = dbCon(n);
      const c = P.contabilidadCupon(db, s);
      assert.ok(c.expuesto < anterior, 'con ' + n + ' créditos subió la exposición');
      anterior = c.expuesto;
    }
  });

  test('pagar TARDE no frena la recuperación del cupón, y la ganancia sube', () => {
    const puntualDb = dbCon(3);
    const puntual = P.contabilidadCupon(puntualDb.db, puntualDb.s);
    const tardeDb = dbCon(3, true);
    const tarde = P.contabilidadCupon(tardeDb.db, tardeDb.s);
    assert.equal(tarde.cupon_recuperado, puntual.cupon_recuperado);
    assert.ok(tarde.garantia_socio < puntual.garantia_socio);
    assert.ok(tarde.ganancia_libre > puntual.ganancia_libre);
  });

  test('SE DERIVA DE LOS PAGOS: borrar un pago cambia la cuenta, no la desincroniza', () => {
    const { db, s } = dbCon(3);
    const antes = P.contabilidadCupon(db, s);
    // Joan corrige un cobro que no era: el crédito vuelve a estar abierto.
    db.prestamos[2].pagado = false;
    db.prestamos[2].gananciaPago = 0;
    const despues = P.contabilidadCupon(db, s);
    assert.ok(despues.cupon_recuperado < antes.cupon_recuperado,
      'un contador guardado se habría quedado con los 9.000 para siempre');
    assert.equal(despues.cupon_recuperado, 6000);
    assert.equal(despues.garantia_socio, P.garantiaGanadaDe(db, s));
  });

  test('la cartera es la suma socio por socio, no una bolsa común', () => {
    const { db, s } = dbCon(3);
    // Un segundo socio sin créditos: su cupón entero sigue en riesgo.
    db.socios.push({ id: 'b', numero: 2, nombre: 'Beto', cedula: '9080706050',
      telefono: '3004445566', whatsappIgual: true, ajusteGarantia: 0,
      referencia: { nombre: '', telefono: '' } });
    const t = P.contabilidadCartera(db);
    assert.equal(t.socios, 2);
    assert.equal(t.por_socio.length, 2);
    assert.equal(t.cupon_recuperado, 9000, 'lo que pagó Ana no devuelve el cupón de Beto');
    assert.equal(t.cupon_prestado, P.contabilidadCupon(db, s).cupon_prestado
      + P.contabilidadCupon(db, db.socios[1]).cupon_prestado);
    assert.equal(t.socios_saldados, 0);
  });

  test('el paquete del socio NO lleva ni una palabra de esto', () => {
    const { db, s } = dbCon(3);
    const m = P.migrarSocio(db, s);
    const texto = JSON.stringify(m);
    ['cupon_pendiente', 'cupon_recuperado', 'ganancia', 'operativo', 'amortiza']
      .forEach(k => assert.ok(texto.indexOf(k) === -1, 'al socio le viajó "' + k + '"'));
    // Su cupón sí viaja —es su garantía prestada—, pero no lo que se recuperó.
    assert.equal(m.garantia.cupon, 100000);
  });

  test('un socio sin nada no revienta la contabilidad', () => {
    const db = P.normalizar({ socios: [{ id: 'z', numero: 9, nombre: 'Nadie' }] });
    assert.doesNotThrow(() => P.contabilidadCupon(db, db.socios[0]));
    const c = P.contabilidadCupon(db, db.socios[0]);
    /* 7.000: los 5.000 del nombre y los 2.000 del WhatsApp que normalizar() da
       por sentado. El cupón es DATO POR DATO, así que una ficha casi vacía
       arriesga casi nada —que es exactamente para lo que sirve. */
    assert.equal(c.cupon_prestado, 7000, 'lo poco que da una ficha vacía');
    assert.equal(c.cobrado, 0);
    assert.doesNotThrow(() => P.contabilidadCartera(P.normalizar(null)));
  });
});

describe('el freno por ingreso, expuesto y apagado en el puente (5-ago-2026)', () => {

  function dbConIngreso(ingreso, freno) {
    const d = datosCompletos();
    const s = { id: 'a', numero: 1, nombre: 'Ana', cedula: '1020304050',
      telefono: '3001112233', whatsappIgual: true, email: d.correo, ciudad: d.ciudad,
      direccion: d.direccion, tipoVivienda: d.vivienda, nequi: d.pago,
      telefono2: d.celular2, ubicacion: d.ubicacion,
      referencia: { nombre: 'Luz', telefono: '3009998877' },
      cedulaFrenteFoto: 'x', cedulaReversoFoto: 'y', selfieFoto: 'z',
      ajusteGarantia: 0, ingresoQuincenal: ingreso };
    const config = { negocio: 'Tu Garantía', whatsapp: '' };
    if (freno) config.freno = freno;
    return P.normalizar({ socios: [s], prestamos: [], respaldados: [], config: config });
  }

  test('normalizar deja la casilla de Ajustes lista y APAGADA', () => {
    const db = dbConIngreso(0);
    assert.equal(db.config.freno.activo, false);
    assert.equal(db.config.freno.fraccion_quincena, M.FRENO_INGRESO.fraccion_quincena);
    assert.equal(db.socios[0].ingresoQuincenal, 0);
  });

  test('APAGADO el cupo no se mueve, aunque el socio haya declarado su quincena', () => {
    const db = dbConIngreso(500000);
    assert.equal(P.frenoDe(db, db.socios[0]).activo, false);
    assert.equal(P.cupoDelSocio(db, db.socios[0], 'bronce').cupo, 100000,
      'el cupón completo, sin topar');
  });

  test('ENCENDIDO topa la cuota a la fracción de la quincena', () => {
    const db = dbConIngreso(200000, { activo: true, fraccion_quincena: 0.30 });
    const c = P.cupoDelSocio(db, db.socios[0], 'bronce');
    assert.equal(c.freno.activo, true);
    assert.equal(c.freno.tope_por_ingreso, 50000, '60.000 de cuota máxima / 1,20');
    assert.equal(c.cupo, 50000);
    assert.equal(c.base, 100000, 'la garantía no se toca: lo que se topa es el cupo');
  });

  test('ENCENDIDO pero sin ingreso declarado no le baja el cupo a nadie', () => {
    const db = dbConIngreso(0, { activo: true });
    const c = P.cupoDelSocio(db, db.socios[0], 'bronce');
    assert.equal(c.cupo, 100000);
    assert.equal(c.freno.aplicado, false);
  });

  test('lo enciende Joan, no el motor: nadie más puede prenderlo por accidente', () => {
    // Ni migrarSocio ni el cupo del socio lo activan solos.
    const db = dbConIngreso(200000);
    assert.equal(P.cupoDelSocio(db, db.socios[0]).freno.activo, false);
    assert.equal(M.cupoQuincenal({ acumulada: 500000 }, 'bronce').freno.activo, false);
    assert.equal(M.FRENO_INGRESO.activo, false, 'la constante manda, y está en false');
  });
});

/* ==========================================================================
 * EL PUNTO CIEGO DE UN DÍA — 6-ago-2026
 *
 * `estuvoEnMora` era solo `!!ultimoDiaDeMora`, y la línea de tiempo NO PUEDE VER
 * el tramo vencido cuando la prórroga se registra el mismo día en que la mora
 * arranca: el día del corte no es mora y el día siguiente ya rige el corte
 * nuevo, así que el tramo queda vacío —aunque el socio haya pagado el 1% de ese
 * día.
 *
 * Ese punto ciego YA ESTABA TAPADO para el factor de la garantía (veniaDeMora
 * sumaba `moraYaCobrada`) y ABIERTO para los contadores del nivel, que solo
 * llamaban a estuvoEnMora / ultimoDiaDeMora. Dos caminos para la misma pregunta,
 * y el que había que acordarse de mantener igual se quedó atrás.
 *
 * MEDIDO. Socio con un crédito sucio inicial, 9 quincenas limpias, y el crédito
 * de la decisión con UN día de mora. Pagar cuesta 42.000 y devolver 200.000 de
 * capital → meses_sin_mora 1, ORO. Prorrogar cuesta LOS MISMOS 42.000 y se queda
 * los 200.000 → PLATINO en la primera quincena limpia de después, en vez de en la
 * sexta. Con DOS días de mora se cerraba solo, y eso es justo lo que prueba que
 * era un defecto y no una política. Y como el nivel nunca baja, la ventaja era
 * permanente.
 * ======================================================================== */

describe('un día de mora se comporta igual que dos (6-ago-2026)', () => {

  const CAP = 200000, PCT = 20, COSTO = CAP * PCT / 100;
  const corteDe = f => M.calcularFechaCorte(f);
  const mas = (f, n) => M.iso(M.sumarDias(M.aFechaLocal(f), n));

  const socioBase = () => ({ id: 'S1', numero: 1, nombre: 'Ana', cedula: '123456',
    telefono: '3001112222', whatsappIgual: true, referencia: { nombre: '', telefono: '' },
    gestiones: [], ajusteGarantia: 0 });
  const credito = (id, desembolso, corte) => ({ id: id, numero: 1, socioId: 'S1',
    capital: CAP, costoPct: PCT, fechaDesembolso: desembolso, cicloActual: corte,
    pagado: false, prorrogas: [], abonosCapital: [], comprobantes: [] });

  /* Los dos caminos, con los MISMOS campos que graba crm.html: pagarTotal() y
     registrarProrroga(). */
  function pagar(p, f) {
    const mora = P.moraDelCiclo(p, f);
    p.pagado = true; p.fechaPagado = f; p.cicloPago = P.corteDelCredito(p);
    p.cobroRegistrado = true; p.gananciaPago = COSTO + mora; p.recargoMora = mora;
    return COSTO + mora;
  }
  function prorrogar(p, f) {
    const r = M.liquidarProrroga({ id: p.id, capital: P.capitalActual(p), tasa_aplicada: 0.20,
      costo: Math.round(P.K(p)), fecha_corte: p.cicloActual, estado: 'en_corte',
      prorrogas_usadas: p.prorrogas.length, nivel_socio: 'oro' }, f);
    assert.ok(r.ok, 'la prórroga se tenía que poder registrar');
    p.prorrogas.push({ fecha: r.fecha, ciclo: r.fecha_corte_anterior, monto: r.total_a_pagar,
      mora: r.recargo_mora, aTiempo: r.a_tiempo, diasMora: r.dias_mora,
      nuevoCiclo: r.fecha_corte_nueva });
    p.cicloActual = r.fecha_corte_nueva;
    return r.total_a_pagar;
  }

  /* La cartera de la decisión: un crédito pagado TARDE (para que el reloj de
     meses tenga de dónde arrancar), `limpias` quincenas puntuales, y el crédito
     de la decisión con `dias` de mora. Después, ocho quincenas limpias que se
     agregan de a una para poder mirar el nivel en cada instante posterior. */
  function partida(limpias, dias, modo) {
    const ps = [];
    let f = '2026-01-05';
    const sucio = credito('P0', f, corteDe(f));
    pagar(sucio, mas(sucio.cicloActual, 3));
    ps.push(sucio);
    f = mas(sucio.fechaPagado, 1);
    for (let i = 1; i <= limpias; i++) {
      const c = credito('P' + i, f, corteDe(f));
      pagar(c, c.cicloActual);
      ps.push(c);
      f = mas(c.cicloActual, 1);
    }
    const d = credito('PD', f, corteDe(f));
    const dia = mas(d.cicloActual, dias);
    const cobrado = modo === 'paga' ? pagar(d, dia)
                  : modo === 'prorroga' ? prorrogar(d, dia) : 0;
    ps.push(d);
    // Las quincenas de después son IDÉNTICAS en los dos caminos.
    const post = [];
    let g = mas(dia, 1);
    for (let n = 1; n <= 8; n++) {
      const c = credito('PN' + n, g, corteDe(g));
      pagar(c, c.cicloActual);
      post.push(c);
      g = mas(c.cicloActual, 1);
    }
    return { ps: ps, post: post, decision: d, dia: dia, cobrado: cobrado };
  }
  const escalon = n => M.NIVELES.indexOf(n);
  /* La foto en un instante: los contadores y el nivel con los créditos que el
     socio tenía ESE día. `n` es cuántas quincenas limpias posteriores pasaron. */
  function foto(e, n) {
    const ps = e.ps.concat(e.post.slice(0, n));
    const hoy = n === 0 ? mas(e.dia, 1) : e.post[n - 1].fechaPagado;
    return { hoy: hoy, cont: P.contadoresDeNivel(ps, hoy), nivel: P.nivelDelSocio(ps, hoy),
             garantia: ps.reduce((t, p) => t + P.garantiaGanadaCredito(p), 0) };
  }

  test('EL NÚMERO DEL DEFECTO: con UN día, prorrogar compraba platino y pagar no', () => {
    const paga = partida(9, 1, 'paga'), deja = partida(9, 1, 'prorroga');
    assert.equal(paga.cobrado, 42000, 'costo 40.000 + un día de recargo');
    assert.equal(deja.cobrado, 42000, 'la prórroga cuesta exactamente lo mismo…');
    // …y el que prorroga se queda además con los 200.000 de capital.
    assert.equal(paga.decision.pagado, true);
    assert.equal(deja.decision.pagado, false);
    assert.equal(P.capitalActual(deja.decision), CAP);

    // La mora de ese único día existe, está cobrada, y ahora las DOS preguntas
    // la ven: la de la garantía y la del nivel.
    assert.equal(P.moraDeProrroga(deja.decision.prorrogas[0]), 2000);
    assert.equal(P.estuvoEnMora(deja.decision, mas(deja.dia, 1)), true,
      'ANTES daba false: el tramo vencido de un solo día no se veía');
    assert.equal(P.ultimoDiaDeMora(deja.decision, mas(deja.dia, 1)), deja.dia,
      'el único día que pudo ser mora es el día en que se prorrogó');
    assert.equal(P.veniaDeMora(deja.decision, deja.decision.cicloActual), true,
      'y el §4-bis la seguía viendo, como antes');

    /* El nivel, quincena limpia por quincena limpia. ANTES: el que prorrogó
       llegaba a PLATINO en la primera (meses_sin_mora se había quedado en 5) y el
       que pagó recién en la sexta. */
    const compro = [];
    for (let n = 0; n <= 8; n++) {
      const a = foto(paga, n), b = foto(deja, n);
      if (escalon(b.nivel) > escalon(a.nivel)) compro.push('N=' + n + ' ' + b.nivel + '>' + a.nivel);
      assert.ok(b.cont.meses_sin_mora <= a.cont.meses_sin_mora,
        'N=' + n + ': prorrogar dejó el reloj de meses MÁS alto que pagar');
    }
    assert.deepEqual(compro, [], 'prorrogar compró nivel antes que pagar: ' + compro.join(' · '));
    assert.equal(foto(paga, 1).nivel, 'oro', 'el que pagó todavía está en oro');
    assert.equal(foto(deja, 1).nivel, 'oro', 'ANTES acá el que prorrogó ya era PLATINO');
    assert.equal(foto(paga, 6).nivel, 'platino', 'y el que pagó llega en la sexta');
  });

  test('UN día y DOS días se comportan igual: la trayectoria del nivel es la misma', () => {
    /* Que el defecto se cerrara solo con 2 días es lo que probaba que era un
       defecto. Ahora las dos trayectorias del que prorroga son idénticas. */
    const trayectoria = e => {
      const t = [];
      for (let n = 0; n <= 8; n++) t.push(foto(e, n).nivel);
      return t;
    };
    const uno = trayectoria(partida(9, 1, 'prorroga'));
    assert.deepEqual(uno, trayectoria(partida(9, 2, 'prorroga')));
    assert.deepEqual(uno, ['oro', 'oro', 'oro', 'oro', 'oro', 'oro', 'oro', 'oro', 'oro']);
    // Y el que pagó sí llega, en los dos casos, y en el mismo instante.
    assert.deepEqual(trayectoria(partida(9, 1, 'paga')), trayectoria(partida(9, 2, 'paga')));
  });

  test('prorrogar EN FECHA sigue sin ser mora: no se castiga al que no se atrasó', () => {
    const t = partida(9, 0, 'prorroga');
    assert.equal(t.cobrado, 40000, 'sin un peso de recargo');
    assert.equal(P.estuvoEnMora(t.decision, mas(t.dia, 5)), false,
      'no hubo mora, así que el arreglo no puede inventarla');
    assert.equal(P.garantiaGanadaCredito(t.decision), M.acumularGarantia(40000, true),
      'y la garantía se le acredita al factor completo, como siempre');
  });

  test('BARRIDO GRANDE DE INCENTIVOS: cero inversiones, y ahora también con 1 día', () => {
    /* La comparación es contra los caminos de NO pagar y en TODOS los instantes
       posteriores, que es donde vivía el defecto: mirando solo el día de la
       decisión los dos caminos daban lo mismo y el barrido pasaba. */
    let comparaciones = 0;
    const peores = [];
    [0, 1, 2, 4, 9, 10].forEach(limpias => {
      [0, 1, 2, 3, 4, 5, 10, 20, 60, 127].forEach(dias => {
        const paga = partida(limpias, dias, 'paga');
        const otros = { vencido: partida(limpias, dias, 'vencido'),
                        prorroga: partida(limpias, dias, 'prorroga') };
        for (let n = 0; n <= 8; n++) {
          const a = foto(paga, n);
          Object.keys(otros).forEach(k => {
            const b = foto(otros[k], n);
            const donde = limpias + '/' + dias + '/N=' + n + ' vs ' + k + ': ';
            comparaciones += 4;
            if (escalon(b.nivel) > escalon(a.nivel)) peores.push(donde + 'nivel');
            if (b.cont.meses_sin_mora > a.cont.meses_sin_mora) peores.push(donde + 'meses');
            if (b.cont.racha > a.cont.racha) peores.push(donde + 'racha');
            if (b.cont.a_tiempo > a.cont.a_tiempo) peores.push(donde + 'a_tiempo');
            // Y por peso de costo pagado, no pagar nunca puede rendir más.
            if (otros[k].cobrado > 0) {
              comparaciones++;
              if (b.garantia / otros[k].cobrado > a.garantia / paga.cobrado + 1e-9) {
                peores.push(donde + 'garantía por peso');
              }
            }
          });
        }
      });
    });
    /* 4.860 = 6 historiales × 10 moras × 9 instantes × 2 caminos de no pagar × 4
       salidas, más una comparación de garantía por peso en el camino que sí paga
       algo (la prórroga). Si el barrido se encoge, esta cuenta lo dice. */
    assert.equal(comparaciones, 4860, 'el barrido se quedó corto: ' + comparaciones);
    assert.deepEqual(peores, [], 'no pagar quedó MEJOR que pagar en ' + peores.length +
      ' salidas: ' + peores.slice(0, 12).join(' · '));
  });

  test('LA MORA ES UNA SOLA VERDAD: no quedan dos caminos que mantener iguales', () => {
    const PUENTE_SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'puente.js'), 'utf8');
    const i = PUENTE_SRC.indexOf('function ultimoDiaDeMora(');
    assert.ok(i >= 0, 'la verdad única tiene que existir y tener nombre');
    const cuerpo = PUENTE_SRC.slice(i, PUENTE_SRC.indexOf('\n  }', i));
    assert.match(cuerpo, /ultimoDiaDeMoraEnLaLinea/, 'le falta la línea de tiempo');
    assert.match(cuerpo, /ultimoDiaDeMoraCobrada/, 'le falta el recargo ya cobrado');
    // Y el §4-bis pregunta lo mismo que el nivel, sin sumarle nada aparte.
    const j = PUENTE_SRC.indexOf('function veniaDeMora(');
    assert.ok(j >= 0);
    const venia = PUENTE_SRC.slice(j, PUENTE_SRC.indexOf('\n  }', j));
    assert.match(venia, /estuvoEnMora/, 'el §4-bis se escribió su propia versión de la mora');
    assert.ok(!/\|\|/.test(venia),
      'el §4-bis volvió a sumarle una segunda prueba con un ||: esa era la forma del defecto');
    assert.ok(!/function\s+moraYaCobrada/.test(PUENTE_SRC),
      'el segundo camino tiene que haber desaparecido, no quedar al lado');
    ['ultimoDiaDeMora', 'ultimoDiaDeMoraCobrada', 'estuvoEnMora', 'veniaDeMora',
     'estadoParaNivel', 'contadoresDeNivel'].forEach(f =>
      assert.equal(typeof P[f], 'function', 'el puente tiene que exportar ' + f));
  });
});

/* ==========================================================================
 * LOS REFERIDOS NO TENÍAN TOPE — 6-ago-2026
 *
 * Cada referido son 5.000 de garantía PRESTADA (no ganada), y con el cupo uno a
 * uno eso son 5.000 de cupo puro que pone Joan.
 *
 * MEDIDO. Un socio que NUNCA PAGÓ UN PESO llegaba a 2.600.000 de cupo con 500
 * referidos, y a 25.100.000 de prestada con 5.000 —por encima del techo entero de
 * la plataforma—. Y un socio que ya había SALDADO su cupón en el crédito 13 volvía
 * a quedar expuesto con cada referido nuevo (1.943 con uno, 196.943 con cuarenta),
 * y la ganancia libre que muestra el Panel se encogía HACIA ATRÁS: 71.758 → 68.701.
 *
 * Y NO ESTABA FINANCIADO: el 15% de cada costo amortiza el cupón DEL SOCIO QUE LO
 * PAGA y de nadie más, así que los 5.000 del padrino solo los devuelve el padrino.
 * ======================================================================== */

describe('los referidos no pueden subirle la exposición a Joan (6-ago-2026)', () => {

  const refs = n => Array.from({ length: n }, (_, i) => ({ nombre: 'R' + i, pago_puntual: true }));
  const CANTIDADES = [0, 1, 2, 5, 13, 40, 100, 500, 5000];

  /* La escalera de un socio que paga en fecha y siempre pide todo su cupo: es la
     misma con la que se midió que el cupón se salda en el crédito 13. */
  function escalera(nCreditos, referidos) {
    let ganada = 0;
    const costos = [];
    for (let i = 0; i < nCreditos; i++) {
      const e = { datos: datosCompletos(), referidos: referidos, acumulada: ganada };
      const capital = Math.max(M.MONTO_MINIMO, M.cupoQuincenal(e, 'bronce').cupo);
      costos.push({ monto: M.calcularCosto(capital), aTiempo: true, producto: 'quincenal',
        fecha: '2026-01-' + String(i + 1).padStart(2, '0'), tipo: 'costo_credito' });
      ganada += M.garantiaQueDejaUnCredito(capital, true);
    }
    return { costos: costos, ganada: ganada };
  }
  // Lo que Joan tiene de verdad en riesgo por un socio: el cupón que no volvió.
  function expuesto(entrada, costos) {
    const d = M.desglosarGarantia(entrada);
    return M.amortizarCupon(costos || [], { cuponPrestado: d.prestada });
  }

  test('EL NÚMERO DEL DEFECTO: 500 referidos daban 2.600.000 de cupo sin pagar nada', () => {
    const con500 = { datos: datosCompletos(), referidos: 500, acumulada: 0 };
    assert.equal(M.garantiaPorReferidos(500), 2500000, 'valen 2.500.000…');
    assert.equal(M.desglosarGarantia(con500).referidos, 0,
      '…pero no se le acreditan: el cupón ya ocupa todo el techo de la prestada');
    assert.equal(M.desglosarGarantia(con500).referidos_sin_tope, 2500000,
      'y el Panel puede explicar la resta, en vez de mostrar un número que no cuadra');
    assert.equal(M.cupoQuincenal(con500, 'bronce').cupo, 100000, 'ANTES: 2.600.000');
    assert.equal(expuesto(con500).expuesto, 100000, 'ANTES: 2.600.000 de exposición');
  });

  test('EL SOCIO QUE NO HA PAGADO NADA: la exposición no se mueve con ningún número', () => {
    let peores = [];
    CANTIDADES.forEach(n => {
      const e = { datos: datosCompletos(), referidos: n, acumulada: 0 };
      const x = expuesto(e);
      if (x.expuesto !== M.CUPON_KYC_MAXIMO) peores.push(n + ' → ' + x.expuesto);
      if (M.cupoQuincenal(e, 'bronce').cupo !== M.CUPON_KYC_MAXIMO) peores.push(n + ' cupo');
      // Y la prestada nunca pasa del techo: es la invariante que pidió Joan.
      if (M.desglosarGarantia(e).prestada > M.CUPON_KYC_MAXIMO) peores.push(n + ' prestada');
    });
    assert.deepEqual(peores, [], 'la exposición se movió: ' + peores.join(' · '));
    // Con la ficha a medias tampoco se pasa del techo, aunque ahí sí puede subir
    // hasta él: ese riesgo Joan ya lo aceptó, y es el mismo del cupón por datos.
    CANTIDADES.forEach(n => {
      const e = { datos: { nombre: 'Ana' }, referidos: n, acumulada: 0 };
      assert.ok(M.desglosarGarantia(e).prestada <= M.CUPON_KYC_MAXIMO, 'n=' + n);
      assert.equal(M.desglosarGarantia(e).referidos, 0,
        'y sin un peso ganado los referidos no suman nada: n=' + n);
    });
  });

  test('EL SOCIO QUE YA SALDÓ EL CUPÓN sigue saldado, con cualquier número', () => {
    const base = escalera(13, 0);
    const cero = expuesto({ datos: datosCompletos(), referidos: 0, acumulada: base.ganada },
                          base.costos);
    assert.equal(cero.expuesto, 0, 'en el crédito 13 el cupón volvió entero');
    assert.equal(cero.saldado, true);
    assert.equal(cero.ganancia_libre, 71758, 'la ganancia libre que muestra el Panel');

    const peores = [];
    CANTIDADES.forEach(n => {
      const x = expuesto({ datos: datosCompletos(), referidos: n, acumulada: base.ganada },
                         base.costos);
      if (x.expuesto !== 0) peores.push(n + ' → expuesto ' + x.expuesto);
      if (!x.saldado) peores.push(n + ' → dejó de estar saldado');
      // Y la ganancia libre no se encoge HACIA ATRÁS: era 71.758 → 68.701.
      if (x.ganancia_libre !== cero.ganancia_libre) {
        peores.push(n + ' → ganancia libre ' + x.ganancia_libre);
      }
    });
    assert.deepEqual(peores, [], 'volvió a quedar expuesto: ' + peores.join(' · '));
  });

  test('BARRIDO: la exposición NUNCA crece por un referido, en ninguna historia', () => {
    let casos = 0;
    const peores = [];
    [0, 1, 5, 13, 20].forEach(nCreditos => {
      const base = escalera(nCreditos, 0);
      const sinReferidos = expuesto(
        { datos: datosCompletos(), referidos: 0, acumulada: base.ganada }, base.costos);
      CANTIDADES.forEach(n => {
        const x = expuesto(
          { datos: datosCompletos(), referidos: n, acumulada: base.ganada }, base.costos);
        casos++;
        if (x.expuesto > sinReferidos.expuesto) {
          peores.push(nCreditos + ' créditos + ' + n + ' referidos: ' +
                      sinReferidos.expuesto + ' → ' + x.expuesto);
        }
        if (x.ganancia_libre < sinReferidos.ganancia_libre) {
          peores.push(nCreditos + ' créditos + ' + n + ' referidos: ganancia libre bajó');
        }
        if (x.cupon_prestado > M.CUPON_KYC_MAXIMO) peores.push('prestada por encima del techo');
      });
    });
    assert.equal(casos, 45);
    assert.deepEqual(peores, [], 'la exposición creció: ' + peores.join(' · '));
  });

  test('el referido que ya pagó SÍ suma, cuando hay hueco bajo el techo', () => {
    /* El tope no mata el premio: al socio con ficha a medias que ya viene pagando,
       cada referido le sigue sumando 5.000 hasta llenar el techo. */
    const e = n => ({ datos: { nombre: 'Ana', cedula: '1', celular: '3' },   // 18.000
                      referidos: n, acumulada: 300000 });
    assert.equal(M.desglosarGarantia(e(0)).referidos, 0);
    assert.equal(M.desglosarGarantia(e(1)).referidos, 5000);
    assert.equal(M.desglosarGarantia(e(4)).referidos, 20000);
    assert.equal(M.desglosarGarantia(e(100)).referidos, 82000, 'hasta llenar el techo');
    assert.equal(M.desglosarGarantia(e(100)).prestada, M.CUPON_KYC_MAXIMO);
    // Y la garantía GANADA nunca se toca: el tope es de la prestada.
    assert.equal(M.desglosarGarantia(e(100)).ganada, 300000);
    assert.equal(M.maximoRespaldado(e(100)), 300000);
  });

  test('el que NO ha pagado no llega a ningún lado, aunque tenga hueco', () => {
    // El segundo tope: dentro del techo, los referidos no pasan de la ganada.
    const e = ganada => ({ datos: { nombre: 'Ana' }, referidos: 100, acumulada: ganada });
    assert.equal(M.desglosarGarantia(e(0)).referidos, 0);
    assert.equal(M.desglosarGarantia(e(3000)).referidos, 3000, 'hasta lo que se ganó');
    assert.equal(M.desglosarGarantia(e(1000000)).referidos, 95000, 'y hasta el techo');
  });

  test('EL TOPE ES CONFIGURABLE: Joan lo puede mover sin tocar una cuenta', () => {
    const e = extra => Object.assign({ datos: datosCompletos(), referidos: 10,
                                       acumulada: 500000 }, extra);
    // Por defecto: los dos topes puestos, y el techo es el del cupón de datos.
    assert.deepEqual(M.TOPE_REFERIDOS,
      { techo_prestada: M.CUPON_KYC_MAXIMO, hasta_la_ganada: true });
    assert.equal(M.desglosarGarantia(e()).referidos, 0);
    // Sin techo compartido queda la otra forma sensata: hasta la garantía ganada.
    assert.equal(M.desglosarGarantia(e({ tope_referidos: { techo_prestada: null } })).referidos,
      50000, 'los 10 referidos completos, porque ya se ganó medio millón');
    // Y sin ninguno de los dos, el comportamiento viejo, para poder compararlo.
    assert.equal(M.desglosarGarantia(
      e({ tope_referidos: { techo_prestada: null, hasta_la_ganada: false } })).referidos, 50000);
    assert.equal(M.desglosarGarantia(
      e({ referidos: 500, tope_referidos: { techo_prestada: null, hasta_la_ganada: false } })
    ).referidos, 2500000, 'sin tope vuelve el defecto: por eso el defecto era el tope');
    // Un techo más alto que el cupón deja entrar referidos con la ficha completa.
    assert.equal(M.desglosarGarantia(e({ tope_referidos: { techo_prestada: 130000 } })).referidos,
      30000);
    assert.throws(() => M.desglosarGarantia(e({ tope_referidos: 'mucho' })),
      /se esperaba un objeto/);
    assert.throws(() => M.desglosarGarantia(e({ tope_referidos: { techo_prestada: -1 } })),
      /negativo/);
  });

  test('LA CUENTA ES UNA SOLA: garantiaTotal y desglosarGarantia no pueden divergir', () => {
    const casos = [
      {}, { datos: datosCompletos() },
      { datos: datosCompletos(), referidos: 3, acumulada: 250000 },
      { datos: { nombre: 'A' }, referidos: 40, acumulada: 0 },
      { datos: { nombre: 'A' }, referidos: 40, acumulada: 12000 },
      { datos: datosCompletos(), referidos: 500, acumulada: 800000, ajuste: -900000 },
      { referidos: 9, acumulada: 30000, tope_referidos: { techo_prestada: null } }
    ];
    casos.forEach(c => {
      const t = M.garantiaTotal(c), d = M.desglosarGarantia(c);
      assert.equal(t.total, d.total, JSON.stringify(c));
      assert.equal(t.referidos, d.referidos, 'el tope se aplica en las dos: ' + JSON.stringify(c));
      assert.equal(t.cupon, d.cupon);
    });
    // Y las dos salen de la misma función, no de dos sumas parecidas.
    const MOTOR_SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'motor.js'), 'utf8');
    const src = MOTOR_SRC.slice(MOTOR_SRC.indexOf('function garantiaTotal('));
    assert.match(src.slice(0, src.indexOf('\n  }')), /partesDeGarantia/,
      'garantiaTotal se volvió a escribir su propia suma');
  });

  test('EL PUENTE LO PASA, para que Joan lo pueda mover desde Ajustes', () => {
    const d = datosCompletos();
    const s = { id: 'a', numero: 1, nombre: 'Ana', cedula: '1020304050',
      telefono: '3001112233', whatsappIgual: true, email: d.correo, ciudad: d.ciudad,
      direccion: d.direccion, tipoVivienda: d.vivienda, nequi: d.pago,
      telefono2: d.celular2, ubicacion: d.ubicacion,
      referencia: { nombre: 'Luz', telefono: '3009998877' },
      cedulaFrenteFoto: 'x', cedulaReversoFoto: 'y', selfieFoto: 'z', ajusteGarantia: 0 };
    const ahijados = [1, 2, 3].map(i => ({ id: 'r' + i, numero: 10 + i, nombre: 'Ref' + i,
      cedula: '90' + i, telefono: '300', referidoPor: 'a' }));
    const prestamos = ahijados.map((r, i) => ({ id: 'p' + i, numero: 1, socioId: r.id,
      capital: 200000, costoPct: 20, fechaDesembolso: '2026-01-05', cicloActual: '2026-01-15',
      cicloPago: '2026-01-15', pagado: true, fechaPagado: '2026-01-15', gananciaPago: 40000,
      prorrogas: [], abonosCapital: [] }));
    const db = P.normalizar({ socios: [s].concat(ahijados), prestamos: prestamos,
      respaldados: [], config: {} });

    assert.equal(P.referidosDe(db, db.socios[0]).length, 3, 'los tres ahijados');
    assert.equal(P.topeReferidosDe(db), undefined, 'sin dato en Ajustes manda el motor');
    // Ficha completa y cero pagos propios: los tres referidos no le suben el cupo.
    assert.equal(P.cupoDelSocio(db, db.socios[0], 'bronce').cupo, 100000);
    assert.equal(P.contabilidadCupon(db, db.socios[0]).expuesto, 100000);
    // Joan mueve el tope en Ajustes y la cuenta lo respeta, en el Panel y en la app.
    db.config.topeReferidos = { techo_prestada: null, hasta_la_ganada: false };
    assert.deepEqual(P.topeReferidosDe(db), db.config.topeReferidos);
    assert.equal(P.cupoDelSocio(db, db.socios[0], 'bronce').cupo, 115000);
    assert.equal(P.migrarSocio(db, db.socios[0]).garantia.referidos, 15000);
  });
});
