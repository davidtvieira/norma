import { inlineErrorMessage } from './services/apiErrors';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { KINDS_BY_ID, OPERATION_KIND_IDS } from './components/OperationPanel/kinds/registry';
import { useTheme } from './hooks/useTheme';
import { checkDataset, getModelInputs, getNrmDataset, getNrmInputs, getNrmModel, importDataset, registerModel } from './services/datasetApi';
import type { ModelExportFormat } from './components/SaveModal/SaveModal';
import type { NrmImportStatusPayload } from './types/nrm';
import type { DatasetHandle, DatasetImportStatus, DatasetImportResponse } from './types/dataset';
import { useDatasetSheets } from './hooks/useDatasetSheets';
import type { ColumnPickField, ColumnPickState, RangePickState } from './types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from './types/highlight';
import type { CellRange } from './types/cellRange';
import { getInputSource } from './types/valueSource';
import { buildModelExport, parseModelImport, type SerializableEntry } from './utils/modelSerialization';
import { buildNrmFile, readModelFile } from './utils/nrmSerialization';
import { deleteSessionCacheEntry, listSessionCacheEntries, saveSessionCacheEntry, type SessionCacheEntry } from './utils/sessionCache';
import { downloadTestCase } from './utils/testCaseSerialization';
import { LandingScreen } from './screens/LandingScreen';
import { UtilizeScreen, type UtilizeModel } from './screens/UtilizeScreen';
import { ChooseModelScreen, type ImportedModel } from './screens/ChooseModelScreen';
import { EditorScreen } from './screens/EditorScreen';
import './App.css';

/**
 * Guards every /d/:datasetId* route: the actual dataset only ever lives in App's own state (no
 * backend lookup by id exists, and there's no persistence anyway — see CLAUDE.md), so a URL
 * whose :datasetId doesn't match what's currently loaded — a hard reload, a pasted/bookmarked
 * link, or browser history from a previous session — has nothing to show and bounces to "/"
 * instead (after a reload has had its chance to restore the session from the cache first). children is a render prop (not plain ReactNode) purely so every screen below gets
 * `dataset` narrowed to non-null without re-checking it itself.
 */
function DatasetRoute({
  dataset,
  isRestoring,
  children,
}: {
  dataset: DatasetHandle | null;
  /** A reload is still restoring this URL's session (see App's reload restore) — nothing to show
   * yet, but not a reason to bounce either. */
  isRestoring: boolean;
  children: (dataset: DatasetHandle) => ReactNode;
}) {
  const { datasetId } = useParams<{ datasetId: string }>();
  if (isRestoring) return null;
  if (!dataset || dataset.datasetId !== datasetId) {
    return <Navigate to="/" replace />;
  }
  return <>{children(dataset)}</>;
}

/**
 * Loads the editor's dataset (filename and every sheet) on demand — the only screen that shows
 * the sheets, so the choose and Utilizar screens never download them. children is a render prop so
 * the editor gets the full dataset non-null.
 */
function EditorDataset({
  datasetId,
  nrmId,
  children,
}: {
  datasetId: string;
  nrmId?: string;
  children: (dataset: DatasetImportResponse) => ReactNode;
}) {
  const { dataset, error } = useDatasetSheets(datasetId, nrmId);
  if (error) return <p className="app__create-model-error">{error}</p>;
  if (!dataset) return null;
  return <>{children(dataset)}</>;
}

/** Pulls just the model's name out of a cached session's modelJson, for the landing screen's
 * RecentSessionCard — no need for parseModelImport's full validation here, this is read-only
 * display text, and a model actually being resumed goes through parseModelImport properly
 * anyway. Null for a dataset-only cache, or if the cached JSON is somehow unreadable. */
function cachedNrmName(modelJson: string | null): string | null {
  if (!modelJson) return null;
  try {
    const parsed = JSON.parse(modelJson) as { nrmName?: unknown };
    return typeof parsed.nrmName === 'string' && parsed.nrmName.trim() ? parsed.nrmName.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Not cryptographically unique, just unlikely enough to collide within one session — plain
 * crypto.randomUUID() requires a secure context (HTTPS or localhost), which isn't guaranteed for
 * every way this app gets served in development (same reason OperationPanel's own
 * generateEntryId avoids it). Used as the id for a new cached session (see startNewCachedSession
 * below) instead.
 */
function generateSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dataset, setDataset] = useState<DatasetHandle | null>(null);
  // The raw file behind `dataset` (the originally uploaded spreadsheet, or the one extracted
  // from a .nrm) — kept around purely so "Guardar modelo" can re-zip it into a new .nrm without
  // needing the backend to serve the original bytes back (DatasetStore only keeps the parsed
  // JSON). Always set together with `dataset` — see handleDatasetImportSuccess/
  // handleReadyModelImportSuccess, the only two places `dataset` is ever set to non-null.
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('');
  // The .nrm file's own name (see ExportedModel.nrmName) — what "Sessões recentes" identifies a
  // session by, and what "Exportar modelo" names the downloaded file. Empty until picked.
  const [nrmName, setNrmName] = useState('');
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [columnPick, setColumnPick] = useState<ColumnPickState | null>(null);
  const [rangePick, setRangePick] = useState<RangePickState | null>(null);
  const [columnHighlights, setColumnHighlights] = useState<ColumnHighlight[]>([]);
  const [rangeHighlights, setRangeHighlights] = useState<RangeHighlight[]>([]);
  const [cellHighlight, setCellHighlight] = useState<OperationHighlight | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  // The sheet viewer now lives in an off-canvas panel (more room for the operations list) —
  // closed by default, opened via the "Ver dados" button or automatically whenever a column/
  // range pick starts, since the sheet has to be visible for that.
  const [isSheetPanelOpen, setIsSheetPanelOpen] = useState(false);
  // Mirrors OperationPanel's own entry list (see onEntriesChange) purely so "Guardar modelo" can
  // export it — the panel remains the source of truth while editing.
  const [modelEntries, setModelEntries] = useState<SerializableEntry[]>([]);
  // The model's designated inputs/outputs (see SaveModal) — picked in the save modal rather than
  // while still building the model, so it doesn't compete for attention with the operations
  // themselves. Cleared automatically below if a picked operation stops being eligible. A model
  // can have several of each, each independently toggled on its own node.
  const [modelInputIds, setModelInputIds] = useState<string[]>([]);
  const [modelOutputIds, setModelOutputIds] = useState<string[]>([]);
  // Set right before switching to the editor screen when a model was imported instead of
  // started fresh — consumed once by OperationPanel's initial state on mount.
  const [pendingImportEntries, setPendingImportEntries] = useState<SerializableEntry[] | undefined>(undefined);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  // Set once "Importar Modelo" has loaded a file — the ready screen then offers "Editar Modelo"
  // / "Utilizar Modelo" for this same imported model instead of the initial Criar/Importar choice.
  const [importedModel, setImportedModel] = useState<ImportedModel | null>(null);
  // Set once a model is being utilized (not edited) — switches to the ModelCard screen instead
  // of the full editor for as long as it's non-null.
  const [utilizeModel, setUtilizeModel] = useState<UtilizeModel | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Up to the 4 most recently uploaded/saved .nrm sessions (see utils/sessionCache.ts) — shown on
  // the landing screen as "Sessões recentes", offering to resume any of them rather than silently
  // re-uploading one and jumping straight into its model: the re-upload is a real network call
  // the user hasn't asked for yet, and landing them mid-model with no warning is more surprising
  // than useful.
  const [recentSessions, setRecentSessions] = useState<SessionCacheEntry[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<{ id: string; message: string } | null>(null);
  // Which cached entry's id the *active* dataset/model corresponds to, if any — so continuing to
  // edit (or re-picking a model for it) updates that one entry in place instead of spawning a new
  // one on every autosave. Null whenever there's no active dataset (landing, or just after
  // goHome/handleBackToLanding) — a plain ref since it never needs to trigger a render on its own.
  const currentSessionIdRef = useRef<string | null>(null);

  function refreshRecentSessions() {
    listSessionCacheEntries()
      .then(setRecentSessions)
      .catch((error) => console.warn('Falha ao ler as sessões recentes do IndexedDB.', error));
  }

  // Guarded by a ref rather than an empty dep array alone so React 18 StrictMode's double-invoke
  // in dev doesn't read the list twice.
  const didLoadRecentSessions = useRef(false);
  useEffect(() => {
    if (didLoadRecentSessions.current) return;
    didLoadRecentSessions.current = true;
    refreshRecentSessions();
  }, []);

  /** Starts tracking a brand-new cached entry (a fresh dataset or .nrm upload) under a new id —
   * distinct from cacheCurrentSession, which updates whichever entry is already active. */
  function startNewCachedSession(datasetId: string, datasetFileName: string, datasetBlob: Blob, modelJson: string | null) {
    const id = generateSessionId();
    currentSessionIdRef.current = id;
    saveSessionCacheEntry(id, { datasetId, datasetFileName, datasetBlob, modelJson })
      .then(refreshRecentSessions)
      .catch((error) => console.warn('Falha ao guardar a sessão no IndexedDB.', error));
  }

  /** Updates the currently active entry (see currentSessionIdRef) in place — a no-op if there
   * somehow isn't one, which shouldn't happen whenever `dataset` is set. */
  function cacheCurrentSession(datasetId: string, datasetFileName: string, datasetBlob: Blob, modelJson: string | null) {
    const id = currentSessionIdRef.current;
    if (!id) return;
    saveSessionCacheEntry(id, { datasetId, datasetFileName, datasetBlob, modelJson })
      .then(refreshRecentSessions)
      .catch((error) => console.warn('Falha ao atualizar a sessão no IndexedDB.', error));
  }

  // The model last registered on the backend, so picking Utilizar again for the very same
  // imported model reuses its id instead of registering (and leaving behind) another copy. Keyed
  // by the ImportedModel object itself, so importing or restoring a model anew naturally misses.
  const registeredModelRef = useRef<{ model: ImportedModel; datasetId: string; modelId: string } | null>(null);

  /** Gets a model ready for the Utilizar screen, which only ever sees its inputs (outputs arrive
   * with a run). A model already registered on the backend is only asked for its inputs; otherwise
   * — never registered yet, or the backend restarted and forgot it — it is registered (the one
   * place its operations are sent), and that response carries the inputs. A model with no output
   * has nothing to register — ModelCard shows its "no output" notice from the empty model id. */
  async function prepareUtilize(handle: DatasetHandle, model: ImportedModel): Promise<UtilizeModel> {
    // A model that arrived with an imported .nrm is already registered on the backend, under the
    // .nrm's id, and the browser never parsed it — only its inputs are read. (If the backend
    // forgot it, e.g. after a restart, the .nrm has to be imported again.)
    if (model.nrmId) {
      const { inputs } = await getNrmInputs(model.nrmId);
      return { modelName: model.modelName, modelId: '', nrmId: model.nrmId, inputs };
    }

    const { entries, inputOperationIds, outputOperationIds } = model;
    if (!entries || !inputOperationIds || !outputOperationIds) {
      throw new Error('Modelo sem operações carregadas.');
    }
    if (outputOperationIds.length === 0) {
      return { modelName: model.modelName, modelId: '', inputs: [] };
    }

    // Only a model without its own .nrm (a bare .json imported onto an .nrm's dataset) gets here with
    // a handle whose id is the .nrm's: the dataset endpoints below need the dataset's real id.
    const datasetId = handle.nrmId ? (await getNrmDataset(handle.nrmId)).datasetId : handle.datasetId;

    const known = registeredModelRef.current;
    if (known && known.model === model && known.datasetId === datasetId) {
      try {
        const { inputs } = await getModelInputs(known.modelId, { silent: true });
        return { modelName: model.modelName, modelId: known.modelId, datasetId, inputs };
      } catch {
        registeredModelRef.current = null; // forgotten by the backend — register it again below
      }
    }

    const { modelId, inputs } = await registerModel(
      datasetId,
      model.modelName,
      entries.map((entry) => ({ id: entry.id, kind: entry.kindId, fields: entry.fields, name: entry.name })),
      inputOperationIds,
      outputOperationIds,
    );
    registeredModelRef.current = { model, datasetId, modelId };
    return { modelName: model.modelName, modelId, datasetId, inputs };
  }

  // The actual replay, only run once the user has chosen to resume a given entry (or a page reload
  // is restoring the one its URL belonged to, see below) — a plain re-upload of its cached dataset
  // bytes against whichever backend is up right now (there's no way to ask it for a dataset by id
  // back; see CLAUDE.md), plus its cached model JSON parsed the same way an import would. `target`
  // is the page to land on: by default Utilizar when a model was cached, or the choose screen for a
  // dataset-only entry; a reload passes the page it was on. Resolves to whether it succeeded.
  function resumeSession(
    entry: SessionCacheEntry,
    target: 'editor' | 'utilizar' | 'choose' | null = null,
    knownDatasetId: string | null = null,
  ): Promise<boolean> {
    setResumingId(entry.id);
    setResumeError(null);
    const file = new File([entry.datasetBlob], entry.datasetFileName);
    // A reload already knows its dataset id from the URL: if the backend still has that dataset,
    // fetch it instead of re-uploading, which also keeps the URL exactly as it was. Only when it
    // doesn't (the backend restarted) is the cached file re-imported, getting a fresh id.
    const loadDataset = knownDatasetId
      ? checkDataset(knownDatasetId).catch(() => importDataset(file))
      : importDataset(file);
    return loadDataset
      .then(async (restoredDataset) => {
        setDataset({ datasetId: restoredDataset.datasetId, filename: entry.datasetFileName });
        setDatasetFile(file);
        currentSessionIdRef.current = entry.id;
        const base = `/d/${restoredDataset.datasetId}`;

        if (entry.modelJson) {
          const imported = parseModelImport(entry.modelJson, OPERATION_KIND_IDS);
          const model: ImportedModel = {
            modelName: imported.modelName,
            nrmName: imported.nrmName,
            entries: imported.entries,
            inputOperationIds: imported.inputOperationIds,
            outputOperationIds: imported.outputOperationIds,
          };
          setImportError(null);
          if (target === 'editor') {
            setModelName(imported.modelName);
            setNrmName(imported.nrmName);
            setPendingImportEntries(imported.entries);
            setModelInputIds(imported.inputOperationIds);
            setModelOutputIds(imported.outputOperationIds);
            navigate(`${base}/editor`, { replace: true });
          } else {
            // Kept as the imported model so the choose screen's Editar/Utilizar pair (and "back"
            // from Utilizar) still work.
            setImportedModel(model);
            if (target === 'choose') {
              navigate(base, { replace: true });
            } else {
              setUtilizeModel(await prepareUtilize({ datasetId: restoredDataset.datasetId, filename: entry.datasetFileName }, model));
              navigate(`${base}/utilizar`, { replace: true });
            }
          }
        } else {
          navigate(target === 'editor' ? `${base}/editor` : base, { replace: true });
        }
        // Bumps this entry back to the top of "recent" (same content, fresh savedAt, and the new
        // dataset id) without needing its own separate "touch" call.
        cacheCurrentSession(restoredDataset.datasetId, entry.datasetFileName, entry.datasetBlob, entry.modelJson);
        return true;
      })
      .catch((error) => {
        setResumeError({ id: entry.id, message: inlineErrorMessage(error, 'Falha ao retomar esta sessão.') });
        return false;
      })
      .finally(() => setResumingId(null));
  }

  // A hard reload on /d/:datasetId[/editor|/utilizar] used to bounce to "/" (nothing in memory to
  // show). Instead, find the cached entry that URL's dataset id belonged to and restore it onto the
  // same page. The dataset is fetched back from the backend by the URL's id, so the URL stays
  // untouched; only if the backend no longer has it (it restarted) is the cached file re-imported,
  // which gives it a new id. Falls back to "/" when no entry matches (a bookmarked link from before ids were tracked, etc.).
  const [isRestoring, setIsRestoring] = useState(() => window.location.pathname.startsWith('/d/'));
  const didRestoreFromUrl = useRef(false);
  useEffect(() => {
    if (didRestoreFromUrl.current || !isRestoring) return;
    didRestoreFromUrl.current = true;
    const [, , urlDatasetId, page] = window.location.pathname.split('/');
    const target = page === 'editor' ? 'editor' : page === 'utilizar' ? 'utilizar' : 'choose';
    listSessionCacheEntries()
      .then((entries) => {
        const match = entries.find((entry) => entry.datasetId === urlDatasetId);
        return match ? resumeSession(match, target, urlDatasetId) : false;
      })
      .catch(() => false)
      .then((restored) => {
        if (!restored) navigate('/', { replace: true });
      })
      .finally(() => setIsRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "Limpar tudo" on the recents row — deletes every cached entry; the only way to remove them. */
  function discardAllEntries() {
    currentSessionIdRef.current = null;
    const ids = recentSessions.map((entry) => entry.id);
    setRecentSessions([]);
    ids.forEach((id) =>
      deleteSessionCacheEntry(id).catch((error) => console.warn('Falha ao remover a sessão do IndexedDB.', error)),
    );
  }

  // Only a confirmed operation whose kind has an editable chainable input (see
  // OperationKind.renderInputEditor), and that isn't itself already chained off another
  // operation, can be the model's input — otherwise there'd be nothing literal left for a caller
  // of the model to fill in. Any confirmed operation's result can be the output.
  const modelInputOptions = modelEntries
    .filter((entry) => entry.confirmed && KINDS_BY_ID[entry.kindId].renderInputEditor && getInputSource(entry.fields).type === 'literal')
    .map((entry) => ({ id: entry.id, label: entry.name || 'Operação sem nome' }));
  const modelOutputOptions = modelEntries
    .filter((entry) => entry.confirmed)
    .map((entry) => ({ id: entry.id, label: entry.name || 'Operação sem nome' }));

  // An input is only required to export when there's actually an eligible operation for it —
  // e.g. a model built only from a sum has no literal chainable field anywhere, so it's a fixed
  // model with nothing dynamic for a caller to fill in, and shouldn't need one picked. At least
  // one must be picked once any are eligible — same guard rail as before, just no longer capping
  // it at exactly one. An output is still always required once there's a confirmed operation at
  // all (same "at least one" rule, unconditional rather than gated by eligibility — any confirmed
  // operation can be an output): modelOutputOptions can only be empty when modelEntries has no
  // confirmed entry, which the check below already covers.
  const hasConfirmedEntry = modelEntries.some((entry) => entry.confirmed);
  const isModelInputRequired = modelInputOptions.length > 0;
  const canExportModel = hasConfirmedEntry && (!isModelInputRequired || modelInputIds.length > 0) && modelOutputIds.length > 0;
  const exportHint = !hasConfirmedEntry
    ? 'Conclua pelo menos uma operação antes de exportar.'
    : isModelInputRequired && modelInputIds.length === 0
      ? 'Defina pelo menos um input do modelo (botão "Input" numa operação elegível) antes de exportar.'
      : modelOutputIds.length === 0
        ? 'Defina pelo menos um output do modelo (botão "Output" numa operação) antes de exportar.'
        : null;
  const inputLabels =
    modelInputIds.length > 0
      ? modelInputIds
          .map((id) => modelInputOptions.find((option) => option.id === id)?.label)
          .filter((label): label is string => Boolean(label))
      : isModelInputRequired
        ? null
        : ['nenhum (modelo fixo)'];
  const outputLabels =
    modelOutputIds.length > 0
      ? modelOutputIds
          .map((id) => modelOutputOptions.find((option) => option.id === id)?.label)
          .filter((label): label is string => Boolean(label))
      : null;

  // "Guardar teste" reads the model's designated inputs straight off modelEntries (already
  // mirrored up from OperationPanel via onEntriesChange) rather than needing OperationPanel to
  // expose anything new — same values OperationPanel's own "Importar teste" would read, just
  // computed here instead, since this button now sits next to "Guardar modelo" rather than in the
  // canvas toolbar.
  const testInputEntries = modelInputIds
    .map((id) => modelEntries.find((entry) => entry.id === id && entry.confirmed))
    .filter((entry): entry is SerializableEntry => entry !== undefined)
    .map((entry) => {
      const source = getInputSource(entry.fields);
      return { name: entry.name, value: source.type === 'literal' ? source.value : '' };
    });

  function saveTestCase() {
    downloadTestCase(modelName, testInputEntries);
  }

  // Clears any pick that's no longer valid — the operation was deleted, un-confirmed, or switched
  // to a dynamic/reference value after being picked — instead of silently exporting a model that
  // points at something stale.
  useEffect(() => {
    setModelInputIds((current) => {
      const next = current.filter((id) => modelInputOptions.some((option) => option.id === id));
      return next.length === current.length ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelEntries]);

  useEffect(() => {
    setModelOutputIds((current) => {
      const next = current.filter((id) => modelOutputOptions.some((option) => option.id === id));
      return next.length === current.length ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelEntries]);

  // Keeps the session cache's model half current while actually editing — gated on the editor
  // route (not just `dataset`/`datasetFile` being set) so this never fires while on the choose
  // screen, where modelEntries is still empty because OperationPanel hasn't mounted yet; without
  // that guard this would immediately overwrite the good modelJson handleReadyModelImportSuccess/
  // handleImportModelFile just cached with a premature null. Debounced since every keystroke in a
  // field re-renders with new modelEntries — no need to hit IndexedDB that often.
  useEffect(() => {
    if (!dataset || !datasetFile || !location.pathname.endsWith('/editor')) return;
    const modelJson = hasConfirmedEntry
      ? JSON.stringify(buildModelExport(modelEntries, modelName, dataset.datasetId, modelInputIds, modelOutputIds, nrmName))
      : null;
    const timeoutId = window.setTimeout(() => {
      cacheCurrentSession(dataset.datasetId, datasetFile.name, datasetFile, modelJson);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [dataset, datasetFile, location.pathname, modelEntries, modelName, nrmName, modelInputIds, modelOutputIds, hasConfirmedEntry]);

  // Auto-open the sheet panel whenever a pick starts, wherever it was triggered from (the panel
  // itself, if already open, just keeps showing).
  useEffect(() => {
    if (columnPick || rangePick) {
      setIsSheetPanelOpen(true);
    }
  }, [columnPick, rangePick]);

  // ...and auto-close it once a column pick ends — a single clicked column is unambiguous, so
  // there's nothing left to confirm with the sheet still visible. A range pick is left open on
  // purpose: unlike a column, the selected rectangle isn't obvious at a glance, so closing the
  // moment the drag ends would make it harder to actually check what got selected — the user
  // closes it manually once they've confirmed it (×, backdrop, or Escape). Tracked via a ref
  // rather than derived directly, so opening the panel by hand (the "Ver dados" button, with no
  // pick involved at all) never gets swept up and closed by this effect.
  const wasPickingColumnRef = useRef(false);
  useEffect(() => {
    const isPickingColumn = columnPick !== null;
    if (wasPickingColumnRef.current && !isPickingColumn) {
      setIsSheetPanelOpen(false);
    }
    wasPickingColumnRef.current = isPickingColumn;
  }, [columnPick]);

  // Closing the panel while a pick is in progress cancels it too — there's nothing useful left
  // to pick from once the sheet is hidden.
  function closeSheetPanel() {
    if (columnPick) finishColumnPick();
    if (rangePick) finishRangePick();
    setIsSheetPanelOpen(false);
  }

  useEffect(() => {
    if (!isSheetPanelOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeSheetPanel();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSheetPanelOpen, columnPick, rangePick]);

  function startColumnPick(entryId: string, field: ColumnPickField, sheetIndex: number) {
    setColumnPick({ entryId, field, sheetIndex, column: null });
  }

  function finishColumnPick() {
    setColumnPick(null);
  }

  function pickColumn(columnIndex: number) {
    setColumnPick((current) => (current ? { ...current, column: columnIndex } : current));
  }

  function startRangePick(entryId: string, sheetIndex: number) {
    setRangePick({ entryId, sheetIndex, range: null });
  }

  function finishRangePick() {
    setRangePick(null);
  }

  function pickRange(range: CellRange) {
    setRangePick((current) => (current ? { ...current, range } : current));
  }

  // The click counterpart to OperationPanel's hover-driven sheet tinting (see RevealButton) —
  // hovering only shows a highlight if the panel already happens to be open, so this actually
  // opens it (and switches to the operation's own sheet) instead of just tinting whatever's
  // already visible.
  function revealInSheet(sheetIndex: number) {
    setActiveSheetIndex(sheetIndex);
    setIsSheetPanelOpen(true);
  }

  function goToEditorFresh() {
    if (!dataset) return;
    setPendingImportEntries(undefined);
    setModelInputIds([]);
    setModelOutputIds([]);
    setIsSheetPanelOpen(false);
    navigate(`/d/${dataset.datasetId}/editor`);
  }

  function triggerImportModel() {
    setImportError(null);
    importFileInputRef.current?.click();
  }

  function handleImportModelFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so re-importing the same file path fires onChange again
    if (!file) return;

    readModelFile(file)
      .then((text) => {
        // Not checked against the current dataset's id for now: a fresh page load gets a new
        // dataset id from the server even for the same uploaded file, which would otherwise
        // block re-importing a model exported earlier in the same session.
        const imported = parseModelImport(text, OPERATION_KIND_IDS);
        setImportedModel({
          modelName: imported.modelName,
          nrmName: imported.nrmName,
          entries: imported.entries,
          inputOperationIds: imported.inputOperationIds,
          outputOperationIds: imported.outputOperationIds,
        });
        setImportError(null);
        if (dataset && datasetFile) {
          const modelJson = JSON.stringify(
            buildModelExport(
              imported.entries,
              imported.modelName,
              dataset.datasetId,
              imported.inputOperationIds,
              imported.outputOperationIds,
              imported.nrmName,
            ),
          );
          cacheCurrentSession(dataset.datasetId, datasetFile.name, datasetFile, modelJson);
        }
      })
      .catch((error) => {
        setImportedModel(null);
        setImportError(inlineErrorMessage(error, 'Falha ao importar o modelo.') || null);
      });
  }

  function cancelImportedModel() {
    setImportedModel(null);
    setImportError(null);
    if (dataset && datasetFile) {
      cacheCurrentSession(dataset.datasetId, datasetFile.name, datasetFile, null);
    }
  }

  function handleDatasetImportSuccess(importedDataset: DatasetImportStatus, file: File) {
    setDataset({ datasetId: importedDataset.datasetId, filename: file.name });
    setDatasetFile(file);
    navigate(`/d/${importedDataset.datasetId}`);
    startNewCachedSession(importedDataset.datasetId, file.name, file, null);
  }

  // The .nrm landing uploader's success path: sets both the dataset and the imported model at
  // once, so the very next render already satisfies ChooseModelScreen's "dataset ready" check
  // with importedModel non-null, landing straight on its Editar/Utilizar choice — same place a
  // dataset import followed by a separate "Importar Modelo" would land, just in one step.
  function handleReadyModelImportSuccess(
    importedNrm: NrmImportStatusPayload,
    file: File,
    model: ImportedModel,
    modelText: string,
  ) {
    setImportError(null);
    // The .nrm's id doubles as the session key: its dataset's own id is never handed out.
    setDataset({ datasetId: importedNrm.nrmId, filename: file.name, nrmId: importedNrm.nrmId });
    setDatasetFile(file);
    setImportedModel(model);
    navigate(`/d/${importedNrm.nrmId}`);
    // The model JSON exactly as the .nrm held it (never parsed here) — kept only so a reload or a
    // "recent" entry can bring the session back.
    startNewCachedSession(importedNrm.nrmId, file.name, file, modelText);
  }

  function goToEditorWithImportedModel() {
    if (!importedModel || !dataset) return;
    setImportError(null);
    // A model that stayed on the backend (it arrived with a .nrm) is only fetched now, because
    // editing is the one thing that needs its operations in the browser.
    const loaded: Promise<ImportedModel> = importedModel.nrmId
      ? getNrmModel(importedModel.nrmId).then((text) => {
          const parsed = parseModelImport(text, OPERATION_KIND_IDS);
          return { ...importedModel, ...parsed, nrmName: parsed.nrmName || importedModel.nrmName };
        })
      : Promise.resolve(importedModel);
    loaded
      .then((model) => {
        setModelName(model.modelName);
        setNrmName(model.nrmName);
        setPendingImportEntries(model.entries);
        setModelInputIds(model.inputOperationIds ?? []);
        setModelOutputIds(model.outputOperationIds ?? []);
        setIsSheetPanelOpen(false);
        navigate(`/d/${dataset.datasetId}/editor`);
      })
      .catch((error) => setImportError(inlineErrorMessage(error, 'Falha ao abrir o modelo para edição.')));
  }

  function goToUtilizeWithImportedModel() {
    if (!importedModel || !dataset) return;
    setImportError(null);
    prepareUtilize(dataset, importedModel)
      .then((model) => {
        setUtilizeModel(model);
        navigate(`/d/${dataset.datasetId}/utilizar`);
      })
      .catch((error) => setImportError(inlineErrorMessage(error, 'Falha ao preparar o modelo.')));
  }

  function downloadBlob(blob: Blob, downloadName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    link.click();
    URL.revokeObjectURL(url);
  }

  // "Guardar modelo": the .nrm bundles the model with the dataset's own spreadsheet; the .json is
  // the bare model only (same JSON that sits inside the .nrm), importable later through
  // "Importar Modelo" on a dataset that's already loaded.
  function exportModel(format: ModelExportFormat, includeDataset: boolean) {
    if (!dataset) return;
    const model = buildModelExport(modelEntries, modelName, dataset.datasetId, modelInputIds, modelOutputIds, nrmName);
    const fileName = nrmName.trim() || modelName.trim() || 'modelo';
    if (format === 'json') {
      downloadBlob(new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' }), `${fileName}.json`);
      // The original spreadsheet as its own download, for whoever wants the data next to the bare model.
      if (includeDataset && datasetFile) downloadBlob(datasetFile, datasetFile.name);
      return;
    }
    if (!datasetFile) return;
    buildNrmFile(datasetFile, model, fileName).then((blob) => downloadBlob(blob, `${fileName}.nrm`));
  }

  // The "Norma" footer's always-available way back to the very start, from any screen — resets
  // every piece of state this component owns to its initial value, same as a fresh page load
  // (just without actually reloading the page).
  function goHome() {
    registeredModelRef.current = null;
    setDataset(null);
    setDatasetFile(null);
    setModelName('');
    setNrmName('');
    setActiveSheetIndex(0);
    setColumnPick(null);
    setRangePick(null);
    setColumnHighlights([]);
    setRangeHighlights([]);
    setCellHighlight(null);
    setIsSaveModalOpen(false);
    setIsSheetPanelOpen(false);
    setModelEntries([]);
    setModelInputIds([]);
    setModelOutputIds([]);
    setPendingImportEntries(undefined);
    setImportError(null);
    setImportedModel(null);
    setUtilizeModel(null);
    // Stops live-syncing into whichever entry was active — an explicit "start over" on the
    // user's part, not a reason to delete it from "Sessões recentes" (that stays a deliberate
    // "Limpar tudo", see discardAllEntries).
    currentSessionIdRef.current = null;
    navigate('/');
    refreshRecentSessions();
  }

  function handleBackToLanding() {
    setDataset(null);
    setDatasetFile(null);
    currentSessionIdRef.current = null;
    navigate('/');
    refreshRecentSessions();
  }

  // Three screens, all URL-addressable (see CLAUDE.md's App.tsx screen-flow note — this replaces
  // the plain state-switch it originally described): "/" for the landing upload, "/d/:datasetId"
  // for the create/import choice (also where a .nrm's dataset+model land together, since
  // importedModel is just a sub-state of this same route, not a route of its own), and
  // "/d/:datasetId/editor" / "/d/:datasetId/utilizar" for the two screens reachable from it.
  // Every actual screen component still reads the same lifted state as before — routing only
  // decides which of them is on screen, not where their data lives.
  return (
    <Routes>
      <Route
        path="/"
        element={
          <LandingScreen
            theme={theme}
            onToggleTheme={toggleTheme}
            onImportSuccess={handleDatasetImportSuccess}
            onReadyModelImportSuccess={handleReadyModelImportSuccess}
            onGoHome={goHome}
            onClearRecentSessions={discardAllEntries}
            recentSessions={recentSessions.map((entry) => ({
              id: entry.id,
              datasetFileName: entry.datasetFileName,
              nrmName: cachedNrmName(entry.modelJson),
              hasModel: entry.modelJson !== null,
              isResuming: resumingId === entry.id,
              error: resumeError?.id === entry.id ? resumeError.message : null,
              onResume: () => resumeSession(entry),
            }))}
          />
        }
      />
      <Route
        path="/d/:datasetId"
        element={
          <DatasetRoute dataset={dataset} isRestoring={isRestoring}>
            {(activeDataset) => (
              <ChooseModelScreen
                dataset={activeDataset}
                importedModel={importedModel}
                importError={importError}
                theme={theme}
                onToggleTheme={toggleTheme}
                importFileInputRef={importFileInputRef}
                onCreateFresh={goToEditorFresh}
                onTriggerImportModel={triggerImportModel}
                onImportModelFile={handleImportModelFile}
                onEditImportedModel={goToEditorWithImportedModel}
                onUtilizeImportedModel={goToUtilizeWithImportedModel}
                onCancelImportedModel={cancelImportedModel}
                onBackToLanding={handleBackToLanding}
                onGoHome={goHome}
              />
            )}
          </DatasetRoute>
        }
      />
      <Route
        path="/d/:datasetId/editor"
        element={
          <DatasetRoute dataset={dataset} isRestoring={isRestoring}>
            {(activeDataset) => (
              <EditorDataset datasetId={activeDataset.datasetId} nrmId={activeDataset.nrmId}>
                {(fullDataset) => (
                  <EditorScreen
                    dataset={fullDataset}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    onBackToChoose={() => navigate(`/d/${activeDataset.datasetId}`)}
                    modelName={modelName}
                    onModelNameChange={setModelName}
                    pendingImportEntries={pendingImportEntries}
                    columnPick={columnPick}
                    onStartColumnPick={startColumnPick}
                    onFinishColumnPick={finishColumnPick}
                    onPickColumn={pickColumn}
                    rangePick={rangePick}
                    onStartRangePick={startRangePick}
                    onFinishRangePick={finishRangePick}
                    onPickRange={pickRange}
                    onColumnHighlightsChange={setColumnHighlights}
                    onRangeHighlightsChange={setRangeHighlights}
                    onCellHighlightChange={setCellHighlight}
                    onRevealInSheet={revealInSheet}
                    onEntriesChange={setModelEntries}
                    modelInputIds={modelInputIds}
                    modelOutputIds={modelOutputIds}
                    onModelInputIdsChange={setModelInputIds}
                    onModelOutputIdsChange={setModelOutputIds}
                    isSheetPanelOpen={isSheetPanelOpen}
                    onOpenSheetPanel={() => setIsSheetPanelOpen(true)}
                    onCloseSheetPanel={closeSheetPanel}
                    activeSheetIndex={activeSheetIndex}
                    onActiveSheetIndexChange={setActiveSheetIndex}
                    columnHighlights={columnHighlights}
                    rangeHighlights={rangeHighlights}
                    cellHighlight={cellHighlight}
                    isSaveModalOpen={isSaveModalOpen}
                    onOpenSaveModal={() => setIsSaveModalOpen(true)}
                    onCloseSaveModal={() => setIsSaveModalOpen(false)}
                    onExportModel={exportModel}
                    nrmName={nrmName}
                    onNrmNameChange={setNrmName}
                    canExportModel={canExportModel}
                    exportHint={exportHint}
                    inputLabels={inputLabels}
                    outputLabels={outputLabels}
                    onSaveTestCase={saveTestCase}
                    canSaveTestCase={testInputEntries.length > 0}
                    onGoHome={goHome}
                  />
                )}
              </EditorDataset>
            )}
          </DatasetRoute>
        }
      />
      <Route
        path="/d/:datasetId/utilizar"
        element={
          <DatasetRoute dataset={dataset} isRestoring={isRestoring}>
            {(activeDataset) =>
              utilizeModel ? (
                <UtilizeScreen
                  dataset={activeDataset}
                  utilizeModel={utilizeModel}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  onBack={() => {
                    setUtilizeModel(null);
                    navigate(`/d/${activeDataset.datasetId}`);
                  }}
                  onGoHome={goHome}
                />
              ) : (
                // No model actually loaded to utilize (e.g. a reload landed here directly) —
                // same "nothing to recover" case DatasetRoute itself handles, just one level
                // down: back to the choose screen for this same dataset instead of all the way
                // to "/", since the dataset itself is still perfectly valid.
                <Navigate to={`/d/${activeDataset.datasetId}`} replace />
              )
            }
          </DatasetRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
