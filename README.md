# Cocos Challenge - Backend

API para el challenge de backend de Cocos Capital. Está hecha con NestJS, TypeORM y Postgres.

Estado actual: está implementada la búsqueda de activos. Portfolio y órdenes están en desarrollo.

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

Pendiente.

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

## Postman

En `docs/cocos-challenge.postman_collection.json` hay una colección con ejemplos de cada endpoint. Usa las variables `baseUrl` y `userId`.
