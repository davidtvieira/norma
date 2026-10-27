<img src="frontend/public/favicon.svg" alt="Norma" width="120">

# Norma

Norma turns complicated spreadsheet calculations into easy to use, easy to understand visual representations of
those calculations. Instead of formulas buried in cells and cross-sheet references nobody dares to touch, you see
the calculation as a map of connected steps: each step does one thing (look a value up, sum a range, translate a
code, ...) and feeds the next.

You import an `.xlsx`/`.xls` file, build a **model** on top of it by chaining those steps, mark which ones are the
model's **inputs** and which are its **outputs**, and save it as a `.nrm` file. Anyone can later open that `.nrm`,
type values into the inputs and run the model to get the outputs, or open it in the editor to see exactly how the
result is reached.

## How it works

1. **Import a dataset.** Upload a spreadsheet. The backend parses every sheet and keeps it in memory.
2. **Build a model** (*Criar Modelo*). Add operations on a canvas next to a view of the sheet data:

   | Operation    | What it does                                                                  |
   |--------------|-------------------------------------------------------------------------------|
   | `lookup`     | Finds a value in a search column and returns another column of the same row.  |
   | `find`       | Returns the position (row and column) of the first cell matching a value.     |
   | `sum`        | Sums the numeric cells of a range.                                            |
   | `counter`    | Adds up the results of other operations.                                      |
   | `calc`       | Adds, subtracts, multiplies or divides two values, with optional rounding.    |
   | `node`       | Holds a value, so other operations can reference it.                          |
   | `translator` | Maps a value to another using your own source → target rules.                 |
   | `selector`   | Picks one of its values by position.                                          |
   | `iterator`   | Runs the whole model once per sheet of a range, one result per sheet.         |
   | `page`       | Chooses the sheet that the other operations read from.                        |

   An operation's input can be a typed value or a reference to another operation's result, so operations chain.
3. **Pick the inputs and outputs** and save the model as a **`.nrm`** file. A `.nrm` is a zip with the original
   spreadsheet, the model (`.json`) and an `info.json` holding its name.
4. **Use a model** (*Utilizar Modelo*). Import a `.nrm`, fill in the inputs and press *Correr modelo*. Only the inputs
   are shown beforehand, and the outputs appear after the run. You can also open the model for editing instead.
   While using a model you can:
   - open the dataset (*Ver dados*) in a side panel, which can be widened to the full screen; the eye on an
     output opens it with exactly the columns, ranges and cells that output read highlighted;
   - click an input or output name to read it in full;
   - add any operation of the model to an **analysis** (the arrow on *Correr modelo*, then *Adicionar operações para
     análise*): their values are returned with the next run and shown in a collapsible *Análise* section, where an
     operation's type opens its configuration (read only).

The app has a light and a dark theme, and works on phones.

## Requirements

- Java 21 and Maven 3.6+
- PostgreSQL 14 or newer (Docker is the easy way, see below)
- Node.js (developed on Node 20) and npm

## Running it locally

The library of saved `.nrm` files needs a PostgreSQL database (it only holds each file's name, size and counts,
the files themselves are kept in a folder). Start one with Docker:

```bash
docker compose up -d
```

The backend's defaults match it (`jdbc:postgresql://localhost:5432/norma`, user and password `norma`). To use
another database, or another folder for the files (`./data/nrm` by default), set `NORMA_DB_URL`, `NORMA_DB_USER`,
`NORMA_DB_PASSWORD` and `NORMA_STORAGE_DIR`. The schema is created by Flyway when the backend starts.

Start the backend on port **8081**, which is where the frontend dev server proxies `/api` to:

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8081
```

> `application.yml` defaults to port 8080, so without the override the frontend cannot reach the API.

Then the frontend, in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173 by default). The dev server listens on all interfaces and accepts any
host, so it also works behind a proxy or tunnel. Copy `frontend/.env.example` to `frontend/.env.local` and set
`VITE_API_BASE_URL` only if the backend is served from somewhere else than the dev server's `/api` proxy.

The API documentation (Swagger UI) is at http://localhost:8081/api/swagger once the backend is running.

## Tests and builds

```bash
# backend
cd backend
mvn test              # all tests (the database ones start their own PostgreSQL, nothing to install)
mvn package           # build the jar

# frontend
cd frontend
npm test              # vitest
npm run lint          # oxlint
npm run build         # type-check and production build
```

The backend does not hot-reload: restart it after changing Java code.

## Project layout

- `backend/`: Spring Boot 3 (Java 21) API. Apache POI parses spreadsheets, and imported datasets, registered models and
  `.nrm` files are kept in in-memory stores. Saved `.nrm` files live in a folder, indexed by a PostgreSQL table.
- `frontend/`: React 19 + TypeScript + Vite single-page app. `src/services/datasetApi.ts` is the only place that calls the
  API. Each operation type is a plugin under `src/components/OperationPanel/kinds/`.
