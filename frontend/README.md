# Norma Frontend

React + TypeScript + Vite client for the Norma dataset viewer. See the [root README](../README.md) for the full project overview and how to run both services together.

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and adjust `VITE_API_BASE_URL` if the backend runs on a non-default port.

## Structure

- `src/types/dataset.ts` — TypeScript types mirroring the backend JSON contract.
- `src/services/datasetApi.ts` — API client for the dataset import endpoint.
- `src/components/DatasetUploader` — file input that triggers the upload.
- `src/components/SheetViewer` — renders the parsed sheet as an index-addressed grid.
