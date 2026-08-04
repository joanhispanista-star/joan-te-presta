# Tu Garantía

Crédito por quincena para gente asalariada, en Colombia. La idea que lo separa de un
gota a gota: **cada peso de costo que el socio paga se le vuelve garantía**, y esa
garantía le sube el cupo y le abre un préstamo más barato. Su historial es su garantía.

Tres piezas, sin compilar, sin dependencias, sin `npm install`. Se abren y funcionan.

---

## Qué hay aquí

```
index.html              La web pública. Es lo que ve un desconocido.
portada.png             La tarjeta que sale al compartir el enlace por WhatsApp.
sw.js                   Un solo service worker para todo el sitio.

legal/
  terminos.html         Términos y condiciones del servicio.
  privacidad.html       Política de datos personales (Ley 1581 de 2012).

app/                    LA APP DEL SOCIO — la que ve el cliente.
  socio.html            Una sola página. Voz: tuteo colombiano.
  motor.js              El motor de reglas. Puro: sin UI, sin red, sin reloj.
  puente.js             Traduce los datos del Panel a lo que consume la app.
  app.webmanifest       Para instalarla en el celular.
  icono-*.png           La G amarilla sobre laca negra.

panel/                  EL PANEL — el que usa Joan. No se enlaza desde ninguna parte.
  crm.html              Socios, créditos, cobros, invitaciones, plantillas.
  panel.webmanifest
  panel-*.png           La G blanca sobre rojo, para no confundir las dos apps.

base/
  supabase.sql          Tablas, RLS y funciones. Se corre entero en el SQL Editor.

pruebas/
  motor.test.js         330 pruebas del motor de reglas.
```

**`motor.js` y `puente.js` los comparten las dos apps a propósito.** Es lo que evita
que el Panel y la app le muestren números distintos al mismo cliente. Si una regla
cambia, cambia ahí y cambia en los dos lados a la vez.

---

## Cómo correrlo

Las pruebas del motor:

```bash
cd pruebas && node --test motor.test.js
```

El sitio, en el navegador. Hace falta un servidor: con doble clic al archivo no
funcionan el service worker, ni la cámara, ni el GPS, ni se puede instalar.

```bash
npx -y http-server -p 8124 -c-1 .
```

Y ahí: la web en `/`, la app en `/app/socio.html`, el Panel en `/panel/crm.html`
(PIN de fábrica `1234`). La cuenta de prueba de Joan es cédula `79111000`, celular
`2026`.

---

## Las reglas del negocio, en corto

| | Crédito quincenal | Préstamo con garantía |
|---|---|---|
| Costo | 20% plano | 5% mensual plano |
| Plazo | hasta el corte (15 y último) | 1 a 6 meses |
| Tope | garantía × factor de nivel | garantía **ganada**, 1:1 |
| Garantía que deja | 90% del costo (45% si tarde) | 20% (10% si tarde) |

- Mora: **1% diario** sobre el capital.
- Factores de nivel: bronce 1,5 · plata 2,0 · oro 2,5 · platino 3,0.
- Cupón de datos al entrar: hasta **$100.000** de garantía prestada.
- Monto mínimo **$50.000**. La calculadora del socio llega a **$5.000.000**; el techo
  del negocio son **$20.000.000** y de ahí para arriba se habla con Joan.
- El costo se reparte **90 / 7 / 3**: garantía del socio, costos operativos, y
  amortizar el cupón regalado. El socio no ve ese reparto.
- Se entra **solo con código de invitación** (`TG-XXXX-XXXX`).

**La promesa que manda sobre todo lo demás:** *aunque te atrases, sigues siendo socio*.
El nivel no baja, la mora no bloquea pedir de nuevo, y la garantía ganada no se borra
jamás. Pero atrasarse tampoco puede **rendir más** que pagar. Las dos cosas a la vez.

---

## ⚠️ Esto NO está listo para clientes

Auditado el 4 de agosto de 2026. Quedan **cinco defectos abiertos**: cuatro en el
manejo de prórrogas, planes de pago y niveles, y uno de textos. Cuatro están medidos y
reproducidos ejecutando el código real, no son sospechas.

El detalle de cada uno vive en `NOTAS-INTERNAS.md`, **fuera de este repositorio a
propósito**: describirlos con precisión suficiente para arreglarlos es describirlos con
precisión suficiente para aprovecharlos, y uno de ellos lo puede ejecutar cualquier
socio desde su propia pantalla. Cuando estén cerrados, ese archivo se publica.

Lo que **sí** está cerrado y medido: la mora del crédito quincenal se cobra, la misma
garantía no respalda dos créditos a la vez, la migración de los créditos viejos no
inventa garantía, la prórroga aplaza a una fecha futura y pasa por el motor, el modo
oscuro cumple contraste, y las 330 pruebas del motor pasan.

**Nada de la nube está probado**: Supabase no está conectado, así que las funciones
RPC, el RLS y los frenos anti-tanteo no se han ejercitado nunca. Tampoco se ha probado
en un teléfono real.

---

## Lo que le falta a Joan (nadie más puede hacerlo)

- [ ] **Llenar los 7 huecos amarillos** de `legal/` — nombre o razón social, cédula o
      NIT, dirección, correo y celular. Una política de datos que dice `[NOMBRE]` no
      sirve de nada. Y borrar el recuadro rojo de aviso de cada página.
- [ ] **Poner el número de WhatsApp** en `index.html`: busca `57XXXXXXXXXX`. Hoy ese
      botón no lleva a ninguna parte.
- [ ] **Llevar `legal/` a un abogado colombiano.** Ahí se pacta plata.
- [ ] **Cambiar el PIN del Panel**, que sigue en `1234` de fábrica.
- [ ] **Cambiar el nombre del negocio** en Ajustes: sigue diciendo "Joan te presta" y
      las plantillas de WhatsApp lo usan.
- [ ] **Conectar Supabase**: correr `base/supabase.sql` y pegar las tres llaves en
      Ajustes. Sin esto, la app solo muestra datos en el dispositivo de Joan.

---

## Publicar

Cualquier hosting de archivos estáticos sirve. Con GitHub Pages: subir todo, activar
Pages sobre la rama principal, y queda en
`https://<usuario>.github.io/TuGarantia/`.

Dos cuidados:

- **Al cambiar cualquier archivo, subir el número de `CACHE` en `sw.js`.** Si no, los
  teléfonos que ya tienen la app siguen mostrando la versión vieja.
- **Los `id` de los dos `.webmanifest` no se tocan** después de la primera instalación.
  Si cambian, el navegador trata la app como otra distinta y las instalaciones
  existentes se rompen.

## Lo que nunca se sube

Los respaldos del Panel (`respaldo-*.json`) traen los datos reales de los clientes:
cédulas, teléfonos, direcciones, fotos. Este repositorio es público. Ya están en
`.gitignore`, pero conviene saber por qué.
