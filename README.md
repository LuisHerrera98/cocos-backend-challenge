# Cocos Challenge - Backend

API para el challenge de backend de Cocos Capital. Está hecha con NestJS, TypeORM y Postgres.

Tiene tres partes: búsqueda de activos, portfolio de un usuario y envío y cancelación de órdenes.

## Requisitos

- Node 24.9 o superior (hay un `.nvmrc`)
- Docker, para levantar el Postgres local. Es opcional: más abajo está cómo correrlo sin Docker.

## Cómo levantarlo

```bash
npm install
cp .env.example .env
docker compose up -d
npm run start:dev
```

La API queda en `http://localhost:3000`.

`docker compose up -d` levanta un Postgres 18 en el puerto 5433 y carga el `database.sql` del challenge, que está en `db/init/`. Ese script corre solo la primera vez. Para volver a los datos originales:

```bash
docker compose down -v && docker compose up -d
```

### Sin Docker

Docker se usa solo para la base. La app es Node y se conecta al Postgres que diga `DATABASE_URL` en el `.env`, así que alcanza con cambiar esa línea:

```bash
npm install
cp .env.example .env
# editar DATABASE_URL en .env
npm run start:dev
```

Sirve cualquier Postgres que tenga las tablas del challenge:

- La base provista para el challenge. En `.env.example` está comentado el formato de la URL.
- Un Postgres instalado en la máquina. Las tablas y los datos se cargan con `psql "$DATABASE_URL" -f db/init/01-database.sql`.

Si la base es compartida, hay que tener en cuenta que `POST /orders` y la cancelación escriben en ella.

## Tests

```bash
npm test
npm run test:e2e
```

`npm run test:e2e` es el test funcional de las órdenes. Levanta la app y le pega por HTTP contra el Postgres local, así que necesita esa base levantada.

- Usa el usuario 4, que no tiene órdenes en los datos originales. Antes de cada test le borra las órdenes y le carga 10.000 pesos, y al terminar lo deja vacío. No toca a los otros usuarios.
- Si `DATABASE_URL` no apunta a `localhost`, falla sin escribir nada. Es para no correrlo por error contra una base compartida.
- Incluye un caso de concurrencia: cinco compras simultáneas cuando la plata alcanza para una sola.

## Endpoints

### Buscar activos

`GET /instruments?q=texto`

Busca en el ticker y en el nombre, sin distinguir mayúsculas y con coincidencia parcial. Devuelve hasta 20 resultados.

```
GET /instruments?q=ggal
```

```json
[
  {
    "id": 34,
    "ticker": "GGAL",
    "name": "Grupo Financiero Galicia",
    "type": "ACCIONES"
  }
]
```

Si no hay coincidencias devuelve `[]`. Devuelve 400 si `q` falta, está vacío, tiene más de 50 caracteres o tiene caracteres de control.

### Portfolio

`GET /users/:id/portfolio`

Devuelve el valor total de la cuenta, los pesos disponibles para operar y las posiciones del usuario.

```
GET /users/1/portfolio
```

```json
{
  "userId": 1,
  "totalValue": 904784,
  "availableCash": 627500,
  "positions": [
    {
      "instrumentId": 54,
      "ticker": "METR",
      "name": "MetroGAS S.A.",
      "quantity": 500,
      "lastPrice": 229.5,
      "marketValue": 114750,
      "totalReturnPercent": -8.2,
      "dailyReturnPercent": -1.08
    },
    {
      "instrumentId": 47,
      "ticker": "PAMP",
      "name": "Pampa Holding S.A.",
      "quantity": 40,
      "lastPrice": 925.85,
      "marketValue": 37034,
      "totalReturnPercent": -0.45,
      "dailyReturnPercent": 0.44
    }
  ]
}
```

- `totalValue`: los pesos de la cuenta más el valor de mercado de las posiciones.
- `availableCash`: los pesos que se pueden usar para operar.
- `totalReturnPercent`: rendimiento de la posición contra su costo promedio de compra.
- `dailyReturnPercent`: variación del último cierre contra el cierre anterior.

Devuelve 404 si el usuario no existe y 400 si el id no es un entero positivo.

### Enviar una orden

`POST /orders`

```json
{
  "userId": 1,
  "instrumentId": 47,
  "side": "BUY",
  "type": "LIMIT",
  "size": 10,
  "price": 900
}
```

| Campo | Detalle |
| --- | --- |
| `userId` | Usuario que envía la orden. |
| `instrumentId` | Activo a operar. Sale del `id` de la búsqueda. |
| `side` | `BUY` o `SELL`. |
| `type` | `MARKET` o `LIMIT`. |
| `size` | Cantidad de acciones. |
| `amount` | Monto en pesos. Se usa en lugar de `size`. |
| `price` | Precio límite. Obligatorio en `LIMIT`, no se acepta en `MARKET`. |

Hay que mandar `size` o `amount`, no los dos. Con `amount` se compra o vende la mayor cantidad entera de acciones que ese monto permite.

Devuelve 201 con la orden guardada:

```json
{
  "id": 12,
  "userId": 1,
  "instrumentId": 47,
  "side": "BUY",
  "type": "LIMIT",
  "size": 10,
  "price": 900,
  "status": "NEW",
  "datetime": "2026-11-12T18:19:40.311Z"
}
```

El `status` depende de la orden:

- `FILLED`: orden `MARKET` aceptada. Se ejecuta en el momento, al último `close`.
- `NEW`: orden `LIMIT` aceptada. Queda pendiente.
- `REJECTED`: la plata o las acciones no alcanzan. La orden se guarda igual.

Errores, en los que no se guarda nada:

- 400: el body está mal armado, o el instrumento no existe o es ARS.
- 404: el usuario no existe.
- 422: orden `MARKET` sobre un instrumento que no tiene precio en `marketdata`.

### Cancelar una orden

`POST /orders/:id/cancel`

No lleva body. Pasa la orden a `CANCELLED` y la devuelve. Solo se pueden cancelar órdenes `NEW`.

- 404: la orden no existe.
- 409: la orden existe pero no está `NEW`.

## Decisiones y supuestos

### Generales

- TypeORM está con `synchronize: false`. El esquema lo define el `database.sql` del challenge y no quiero que el ORM lo modifique por su cuenta.
- La base local se crea con el mismo `database.sql`, sin cambios. No modifiqué el esquema.
- No hay autenticación, como dice el enunciado. Cualquiera puede operar por cualquier usuario y cancelar cualquier orden.
- Los datos de entrada se validan con un `ValidationPipe` global. Los parámetros que no existen se rechazan con 400 en vez de ignorarse.

### Búsqueda de activos

- Un solo parámetro `q` busca en ticker y en nombre a la vez. Lo pensé como el buscador de la app: el que escribe no sabe ni le importa si está poniendo el ticker o el nombre.
- No devuelve el instrumento ARS (tipo `MONEDA`). Es el cash de la cuenta, no un activo que se pueda comprar o vender.
- El orden es: ticker exacto, ticker que empieza con el texto, nombre que empieza con el texto y después el resto. Dentro de cada grupo va por ticker. Prioricé el ticker porque es con lo que se opera.
- Como último criterio ordena por `id`. La columna `ticker` no tiene restricción de único, y sin ese desempate el orden podría cambiar entre una llamada y otra.
- El límite es de 20 y no hay paginación. Está pensado como un autocompletado y hoy hay 65 activos. Si la lista creciera agregaría `limit` y `offset`.
- Los caracteres `%`, `_` y `\` del texto se escapan antes de armar el `ILIKE`. Sin eso, buscar `%` devuelve todos los activos.
- Los caracteres de control se rechazan con 400. Postgres no acepta el byte nulo en un texto y la consulta terminaba en un 500.
- La respuesta sale de un DTO y no de la entidad, para que un cambio en la tabla no cambie la API sin querer.

Limitaciones que conozco:

- No ignora acentos: `compania` no encuentra "Compañía Introductora de Buenos Aires S.A.". Se resuelve con la extensión `unaccent`, pero no quise tocar la base por esto.
- El `ILIKE '%texto%'` no usa índices. Con 66 filas no hace diferencia. Con muchos más activos usaría `pg_trgm` con un índice GIN.
- En la base, `ticker`, `name` y `type` aceptan NULL. La entidad los trata como obligatorios porque todos los registros los tienen.

### Portfolio

- No hay una tabla de saldos: los pesos y las posiciones se calculan desde `orders`, tomando solo las órdenes `FILLED`. En `CASH_IN` y `CASH_OUT` el monto es `size`. En compras y ventas es `size * price`.
- Las cuentas están en SQL y no con el ORM. Son agregaciones, y escritas a mano se ve exactamente qué se suma y qué se resta.
- Las compras en estado `NEW` reservan plata. Se restan del disponible, pero no del total: esa plata sigue siendo del usuario hasta que la orden se ejecute. Si la sacara del total, la cuenta valdría menos por mandar una orden límite y volvería a valer lo mismo al cancelarla, sin que haya pasado nada.
- El precio de cada posición es el `close` de la fecha más reciente en `marketdata`.
- El rendimiento total se calcula contra el costo promedio: lo pagado en las compras `FILLED` dividido por las acciones compradas. Vender no cambia el promedio. La alternativa era FIFO, pero la descarté porque agrega bastante complejidad para un dato que es informativo.
- Las posiciones con cantidad cero o negativa no se muestran.
- Si un instrumento no tiene precio en `marketdata`, la posición se muestra con precio, valor y rendimiento en `null` y no suma al total.
- Para la plata no uso float. Postgres hace las cuentas con `NUMERIC`, que es exacto, y el driver lo devuelve como string. En Node hay una sola suma y la hago en centavos enteros. Los porcentajes se redondean a 2 decimales al final, no en los pasos intermedios.
- Las consultas del portfolio corren dentro de una transacción `REPEATABLE READ`, para que el saldo y las posiciones salgan de la misma foto de la base. Con el nivel por defecto (`READ COMMITTED`) cada consulta ve los datos confirmados hasta ese momento, y una orden que entra justo entre las dos podía aparecer en las posiciones y no en el saldo.

### Órdenes

- Separé dos casos. Una orden mal armada (sin precio en una `LIMIT`, con `size` y `amount` a la vez, sobre un instrumento que no existe) devuelve 400 y no se guarda: nunca llegó a ser una orden. Una orden bien armada que no se puede cumplir se guarda como `REJECTED`, porque es un intento real del usuario y tiene que quedar en el historial.
- Una orden `REJECTED` devuelve 201 y no un error. El request se procesó bien y la orden quedó registrada. El rechazo es el resultado, y está en el `status`.
- Las `MARKET` se ejecutan al último `close` y quedan `FILLED`. Las `LIMIT` quedan `NEW` y no se ejecutan nunca, porque el enunciado dice que no hay que simular el mercado.
- Una `MARKET` con `price` se rechaza con 400 en vez de ignorar el precio. Prefiero avisar que el cliente mandó algo que no se va a usar.
- Si el instrumento no tiene precio en `marketdata`, una `MARKET` devuelve 422 y no se guarda. Sin precio no puedo completar ni el `price` ni, si mandaron `amount`, el `size`. Una `LIMIT` sobre ese instrumento sí se acepta, porque el precio lo pone el usuario.
- Con `amount`, la cantidad es `floor(amount / precio)`, calculada en centavos enteros. Si no alcanza para una acción, la orden queda `REJECTED` con `size` 0.
- Las órdenes `NEW` reservan. Una compra pendiente reserva su costo (`size * price`) y una venta pendiente reserva sus acciones. Sin eso se podría mandar varias órdenes límite por la misma plata o las mismas acciones. Al cancelar no hay que devolver nada: la orden deja de estar `NEW` y deja de contar.
- El saldo que valida una orden sale de la misma consulta que usa el portfolio. Si fueran dos consultas distintas, tarde o temprano el portfolio mostraría un disponible y las órdenes validarían contra otro.
- `POST /orders` solo acepta `BUY` y `SELL`. Los depósitos y retiros (`CASH_IN`, `CASH_OUT`) se leen para calcular el saldo, pero no se pueden crear por la API. Lo tomé como fuera del alcance.
- Cancelar es `POST /orders/:id/cancel` y no un `DELETE`, porque la orden no se borra. Las órdenes son el historial de la cuenta: se agregan y cambian de estado, pero no se eliminan.

Concurrencia:

- El riesgo es el doble gasto: dos órdenes del mismo usuario que llegan juntas, las dos leen el mismo saldo y las dos pasan.
- Cada orden se procesa en una transacción que empieza con `SELECT ... FROM users WHERE id = $1 FOR UPDATE`. La segunda orden del mismo usuario espera en esa línea hasta que la primera termina, y recién ahí lee el saldo.
- Bloqueo la fila del usuario porque el saldo no está guardado en ninguna fila, se calcula desde `orders`. No hay otra cosa que bloquear.
- La transacción usa el nivel por defecto, `READ COMMITTED`, a propósito. Después de esperar el candado, las consultas siguientes ven lo que confirmó la orden anterior. Con `REPEATABLE READ` seguirían viendo los datos de antes de esperar.
- No puede haber deadlocks: cada orden pide un solo candado, y siempre es el de su usuario. Órdenes de usuarios distintos no se esperan entre sí.
- Para cancelar no bloqueo al usuario. El chequeo del estado va dentro del `UPDATE` (`WHERE id = $1 AND status = 'NEW'`), así que de dos cancelaciones simultáneas solo una encuentra la orden en `NEW`.
- Otras formas que evalué: guardar el saldo en una columna y descontarlo con un `UPDATE ... WHERE saldo >= monto`, bloqueo optimista con una columna de versión, un lock en Redis o una cola por usuario. Las dos primeras piden cambiar el esquema y las otras dos suman infraestructura. Para este tamaño, el candado en la fila del usuario es lo más simple que resuelve el problema.

## Qué mejoraría

- Idempotencia. Si el cliente reintenta un `POST /orders` por un timeout o un doble clic, hoy se crean dos órdenes. Lo resolvería con un header `Idempotency-Key` guardado con restricción de único: ante la misma clave se devuelve la orden original.
- Un `lock_timeout` en la transacción de las órdenes, para que una orden no espere indefinidamente si otra quedó colgada.
- Un índice en `orders (userid, status)`. Todas las consultas de saldo y posiciones filtran por usuario. Con 11 filas no cambia nada y por eso no toqué el esquema.
- Guardar el motivo del rechazo. Hoy una orden `REJECTED` no dice si fue por plata o por acciones.
- Aceptar `CASH_IN` y `CASH_OUT` en la API. Serviría para cargarle plata a un usuario y probar con cuentas que hoy están en cero.
- Paginación en la búsqueda y búsqueda sin acentos.
- Documentación con Swagger (OpenAPI). Hoy los ejemplos de uso están en la colección de Postman.

## Sobre los datos

Cosas que encontré en el `database.sql` y cómo las traté. No modifiqué los datos.

- Las columnas se crearon sin comillas, así que en Postgres quedan en minúscula (`instrumentid`, `userid`, `previousclose`). Las consultas usan esos nombres.
- En `marketdata` la fecha está en una columna `date`, no `datetime` como dice el enunciado.
- La orden 11 vende 30 BMA cuando el usuario tenía 20, y está `FILLED`. Eso deja una posición de -10. El portfolio no muestra esa posición, pero los pesos de la venta sí están en el saldo, porque la orden figura como ejecutada. La API no deja llegar a ese estado: valida las acciones disponibles antes de vender.
- La orden 9 es una `LIMIT` que está `FILLED`. En esta API las `LIMIT` nunca pasan a `FILLED`, pero el saldo y las posiciones se calculan por el `status`, así que se cuenta como cualquier orden ejecutada.
- IRCP y PGR no tienen precios en `marketdata`.

## Postman

En `docs/cocos-challenge.postman_collection.json` hay una colección con ejemplos de cada endpoint, incluidos los casos de error.

Usa tres variables: `baseUrl`, `userId` y `orderId`. `orderId` vale 5, que en los datos originales es una orden `NEW` y se puede cancelar.

Las requests de la carpeta Orders modifican la base. Para volver a los datos originales está el comando de más arriba.
