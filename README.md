# Cocos Challenge - Backend

API para el challenge de backend de Cocos Capital. Está hecha con NestJS, TypeORM y Postgres.

Estado actual: están implementados la búsqueda de activos y el portfolio. Las órdenes están en desarrollo.

## Requisitos

- Node 24 (hay un `.nvmrc`; funciona desde Node 22)
- Docker, para levantar Postgres

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

### Órdenes

Pendiente.

## Decisiones y supuestos

### Generales

- TypeORM está con `synchronize: false`. El esquema lo define el `database.sql` del challenge y no quiero que el ORM lo modifique por su cuenta.
- La base local se crea con el mismo `database.sql`, sin cambios. Hasta ahora no modifiqué el esquema.
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

## Sobre los datos

Cosas que encontré en el `database.sql` y cómo las traté. No modifiqué los datos.

- Las columnas se crearon sin comillas, así que en Postgres quedan en minúscula (`instrumentid`, `userid`, `previousclose`). Las consultas usan esos nombres.
- En `marketdata` la fecha está en una columna `date`, no `datetime` como dice el enunciado.
- La orden 11 vende 30 BMA cuando el usuario tenía 20, y está `FILLED`. Eso deja una posición de -10. El portfolio no muestra esa posición, pero los pesos de la venta sí están en el saldo, porque la orden figura como ejecutada.
- IRCP y PGR no tienen precios en `marketdata`.

## Postman

En `docs/cocos-challenge.postman_collection.json` hay una colección con ejemplos de cada endpoint. Usa las variables `baseUrl` y `userId`.
