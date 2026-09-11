import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../../types/highlight';
import { useOperationTypes } from '../../hooks/useOperationTypes';
import { getDependencyChain, getDependents, resolveOperationInputs } from '../../utils/resolveOperationInputs';
import { getInputSource, getInputSources, literalSource, remapValueSourceReferences } from '../../types/valueSource';
import type { SerializableEntry } from '../../utils/modelSerialization';
import { parseTestCaseFile } from '../../utils/testCaseSerialization';
import type { OperationFields, ReferenceOption } from './operationKind';
import { KINDS, KINDS_BY_ID } from './kinds/registry';
import { AddOperationModal } from '../AddOperationModal/AddOperationModal';
import { TestValuesModal } from '../TestValuesModal/TestValuesModal';
import { useCanvasViewport, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from './useCanvasViewport';
import type { NodePosition } from './useCanvasViewport';
import './OperationPanel.css';

/**
 * The operation canvas: a freeform, pannable surface where each operation is an independently
 * draggable node instead of a fixed list item. A node whose input dynamically references another
 * operation's result (see types/valueSource.ts) gets a connecting line drawn between the two
 * nodes (see the `edges` computation in the orchestrator at the bottom of this file) rather than
 * being nested inside the source node's DOM — every confirmed operation is its own independent,
 * draggable node either way. The draft/edit card chrome (name + cancel, a type-specific config
 * area, confirm/delete) and the confirmed-card chrome (name + edit + model input/output toggles,
 * hover) are shared; anything type-specific is delegated to whichever "kind" (see
 * operationKind.ts) an entry was created as.
 */

/** Fixed node width used both for layout (inline style) and edge-anchor math. */
const NODE_WIDTH = 300;
/** The dotted background grid's dot spacing at 100% zoom, in screen pixels — see the viewport's
 * inline backgroundSize style, which scales this by the current zoom to match. Must match the
 * 22px baked into OperationPanel.css's own background-size (kept there as the un-zoomed default,
 * so the grid still looks right for the split second before the first render's inline style
 * applies). */
const GRID_SIZE = 22;
/** Vertical offset from a node's top to its header's center — where edges attach — constant
 * regardless of how tall the node's body grows (result text, expanded info, ...). */
const NODE_HEADER_ANCHOR_Y = 28;
const NODES_PER_ROW = 3;
const NODE_COLUMN_GAP = 340;
const NODE_ROW_GAP = 240;

/** How far apart "Testar modelo" staggers each confirmed operation's own live-result request
 * (see runModelTest) — small enough that testing a model still feels close to instant, big
 * enough that a model with many operations sends the API a trickle of requests instead of a
 * burst all in the same instant. */
const TEST_STAGGER_DELAY_MS = 120;
/** How long the progress bar (see runModelTest/testProgress) stays visible at 100% once the
 * stagger itself has finished, before fading away on its own — just long enough to actually
 * register as "done" rather than the bar vanishing the instant it fills. */
const TEST_PROGRESS_LINGER_MS = 500;

/** Simple cascading grid placement for a node restored without a saved position (see
 * initialEntries) — anchored at a fixed canvas-local origin regardless of the current pan/zoom,
 * since there's no "current viewport" the entries being restored are meaningfully tied to (they
 * arrive all at once, before the user has looked at the canvas at all). A freshly added operation
 * uses viewportPlacementFor below instead, which *is* anchored to what's currently on screen. */
function placementFor(index: number): NodePosition {
  const column = index % NODES_PER_ROW;
  const row = Math.floor(index / NODES_PER_ROW);
  return { x: 40 + column * NODE_COLUMN_GAP, y: 40 + row * NODE_ROW_GAP };
}

/** Same cascading grid as placementFor, but anchored just inside the top-left corner of whatever
 * part of the canvas is currently visible (converting a fixed screen-space padding back to
 * canvas-local coordinates via the surface's own pan/zoom — the inverse of the transform applied
 * in the JSX below) instead of a fixed canvas-local origin — so a newly added operation lands
 * right where the user's already looking and can be dragged immediately, instead of needing to be
 * hunted down after panning/zooming away from wherever entries.length happened to place it. */
function viewportPlacementFor(viewOffset: NodePosition, zoom: number, index: number): NodePosition {
  const screenPadding = 40;
  const anchorX = (screenPadding - viewOffset.x) / zoom;
  const anchorY = (screenPadding - viewOffset.y) / zoom;
  const column = index % NODES_PER_ROW;
  const row = Math.floor(index / NODES_PER_ROW);
  return { x: anchorX + column * NODE_COLUMN_GAP, y: anchorY + row * NODE_ROW_GAP };
}

interface DraftOperationCardProps {
  name: string;
  onNameChange: (name: string) => void;
  canConfirm: boolean;
  /** "Atualizar operação" for one reopened via "Editar" — undefined while staging a new-operation
   * batch, where there's no per-card confirm at all (see renderDraftCard's 'stage' mode and
   * OperationPanel's confirmAllStaged/renderConfigPanel's own "+", the batch's shared controls
   * instead). */
  confirmLabel?: string;
  onConfirm?: () => void;
  children: ReactNode;
}

/**
 * An operation being built, staged, or edited: name, then whatever type-specific config the kind
 * renders as `children`, then a confirm button ("Atualizar operação") while editing an existing
 * one — a staged (not yet confirmed) card has no button of its own at all; adding another to the
 * batch and confirming the whole batch are both controls shared across every staged card at once
 * (see renderConfigPanel's own "+" and its batch-confirm button below the staged list), not
 * per-card. Always
 * shown inside the config panel (see OperationPanel's renderConfigPanel), whose own × already
 * cancels — reverting an edit back to its confirmed state, or discarding a staged batch — so
 * there's no separate delete button here; deleting an already-confirmed operation outright is the
 * canvas selection bar's job now (select it, then "Eliminar" — see the select tool).
 */
function DraftOperationCard({ name, onNameChange, canConfirm, confirmLabel, onConfirm, children }: DraftOperationCardProps) {
  return (
    <div className="operation-entry">
      <input
        type="text"
        className="operation-entry__name-input"
        value={name}
        placeholder="Nome da operação"
        onChange={(event) => onNameChange(event.target.value)}
      />

      {children}

      {canConfirm && onConfirm && confirmLabel && (
        <div className="operation-entry__confirm-row">
          <button type="button" className="operation-entry__confirm-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}

interface EditButtonProps {
  onEdit: () => void;
  disabled: boolean;
}

function EditButton({ onEdit, disabled }: EditButtonProps) {
  return (
    <button
      type="button"
      className="operation-card__edit"
      onClick={onEdit}
      disabled={disabled}
      aria-label="Editar operação"
      title={disabled ? 'Termine a operação em curso antes de editar outra.' : undefined}
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

interface RevealButtonProps {
  onReveal: () => void;
}

/**
 * Opens (or brings to front) the off-canvas sheet panel showing this operation's table, with its
 * columns/range tinted — the config/edit panel already shows every other detail (which table,
 * which columns, the range), so this is just a shortcut to actually see the affected cells
 * instead of duplicating that detail on the card itself.
 */
function RevealButton({ onReveal }: RevealButtonProps) {
  return (
    <button type="button" className="operation-card__reveal" onClick={onReveal} aria-label="Ver na folha de dados" title="Ver na folha de dados">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}

interface TestUpToHereButtonProps {
  onTest: () => void;
  /** Whether this operation's own testSignal has fired at least once (same value the card's own
   * border — see .operation-card--tested — already reflects), not whether a stagger is currently
   * mid-run — "has this chain already been tested, with its own edges still colored from that"
   * is what swaps this button over to a stop/clear icon (see onClear), independent of whether
   * anything is actively running right now. */
  isTested: boolean;
  /** Clears just this operation's own dependency chain back to not-tested — its testSignals,
   * results, and whichever of its own outgoing edges (see activeEdgeKeys) that chain lit up —
   * without touching any other operation's own test state, unlike the toolbar's "Limpar teste"
   * (see clearChainTest). */
  onClear: () => void;
}

/**
 * Runs "Testar modelo" scoped to just this operation's own dependency chain — itself and every
 * operation it (transitively) reads its input from (see getDependencyChain), not every confirmed
 * operation on the canvas — so checking one operation's result doesn't also wait on, or spend API
 * calls testing, unrelated ones elsewhere in the model. Once that chain has actually been tested
 * (see isTested), this same button becomes a way to clear just that chain's own test state
 * instead of running it again.
 */
function TestUpToHereButton({ onTest, isTested, onClear }: TestUpToHereButtonProps) {
  if (isTested) {
    return (
      <button type="button" className="operation-card__test operation-card__test--stop" onClick={onClear} aria-label="Limpar teste desta operação" title="Limpar teste desta operação">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
        </svg>
      </button>
    );
  }
  return (
    <button type="button" className="operation-card__test" onClick={onTest} aria-label="Testar até aqui" title="Testar até aqui">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </button>
  );
}

interface IoToggleProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}

/** Marks/clears this node as the model's designated input or output (see ConfirmedOperationCard). */
function IoToggle({ label, active, onToggle }: IoToggleProps) {
  return (
    <button
      type="button"
      className={active ? 'operation-card__io-toggle operation-card__io-toggle--active' : 'operation-card__io-toggle'}
      onClick={onToggle}
      aria-pressed={active}
      title={active ? `Remover como ${label.toLowerCase()} do modelo` : `Definir como ${label.toLowerCase()} do modelo`}
    >
      {label}
    </button>
  );
}

interface ConfirmedOperationCardProps {
  name: string;
  /** e.g. "Pesquisa aninhada"/"Somar" — shown in the footer, always visible (see
   * ConfirmedOperationCard's own note on why this stays out of the collapsible section). */
  kindLabel: string;
  /** The "which table/columns/range" detail (see operationKind.ts's renderSummary) — shown next
   * to kindLabel in the footer. */
  summary: ReactNode;
  onEdit: () => void;
  editDisabled: boolean;
  /** Whether the canvas is currently in "Editar" mode — the pencil is only shown at all while
   * this is true; editing an operation, like moving one, is off-limits outside that mode. */
  isEditMode: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Whether this operation's own testSignal has fired at least once — draws a primary-color
   * border on the card, regardless of whether the result itself was a success, an error, or no
   * match (see .operation-card--tested), and doubles as TestUpToHereButton's own isTested (its
   * play icon becomes a "clear this chain's test" icon once this is true). */
  isTested: boolean;
  /** Runs "Testar modelo" scoped to just this operation's own dependency chain — see
   * TestUpToHereButton/runModelTest(upToEntryId). */
  onTestUpToHere: () => void;
  /** Clears just this operation's own dependency chain's test state — see TestUpToHereButton's
   * own onClear/clearChainTest. */
  onClearTest: () => void;
  onReveal: () => void;
  /** Whether this operation actually has a sheet location to reveal — false for kinds that never
   * highlight any column/range (see sheetIndexForEntry) — so the reveal button doesn't sit there
   * as a dead click. */
  isRevealEligible: boolean;
  children: ReactNode;
  isModelInput: boolean;
  isModelInputEligible: boolean;
  onToggleModelInput: () => void;
  isModelOutput: boolean;
  onToggleModelOutput: () => void;
  /** Whether this card's detail modal (its editable field(s) + live result — see `children`) is
   * currently open. Owned by OperationPanel (modalEntryId) rather than local state so it isn't
   * lost if this card unmounts and remounts (e.g. entries reordering), and so opening one card's
   * modal can close whichever other one was open. */
  /** Opening is triggered by OperationPanel itself, not by an onClick here — a plain click (not a
   * drag) on the node already has to be distinguished from an actual reposition drag in its own
   * mousedown/mouseup handling (see startNodeDrag/handleMouseUp), so that's also where it decides
   * a click should open this card's modal instead. */
  isModalOpen: boolean;
  onCloseModal: () => void;
}

/**
 * A confirmed operation node: name + model input/output toggles + reveal-in-sheet + edit
 * (pencil, reopens it as a draft) in the header, then a footer naming its kind and which
 * table/columns/range it's set up against ("the affected fields") — both always visible, enough
 * on their own to identify which operation a card is at a glance. Only its live result (always
 * visible, see below) and its type-specific editable field(s) need an actual click to reach —
 * clicking the card opens `children` (the kind's editable fields + live result, i.e.
 * kind.renderBody's output) in a modal instead of expanding it inline, since the canvas can be
 * panned/zoomed (via a CSS transform on an ancestor — see the surface's own transform in this
 * file) and a `position: fixed` dialog would otherwise inherit that transform instead of actually
 * centering on the real viewport.
 *
 * `children` is portaled into one of two places — never rendered twice, so a kind's live result
 * component (its own fetch-dedup/in-flight state — see e.g. LookupResult's notes) is never
 * duplicated or remounted (which would both re-fire its request and, worse, wipe the result this
 * card reports into the reference chain for "Testar modelo") just from opening/closing the modal:
 * `inlineSlot` sits inside this card itself, showing only the live result (every kind ends
 * `children` with one .operation-entry__result, by convention — see .operation-card__details in
 * OperationPanel.css) while the modal's closed; `modalSlot` sits inside the modal, showing
 * everything, while it's open. Both are plain DOM nodes created once up front (not discovered via
 * a ref callback on rendered JSX) specifically so the portal always has a valid target to move
 * `children` into — if there were ever a render with nowhere to put it, React would unmount it
 * instead of relocating it, which is exactly the state loss/duplicate-fetch problem this avoids.
 */
function ConfirmedOperationCard({
  name,
  kindLabel,
  summary,
  onEdit,
  editDisabled,
  isEditMode,
  onMouseEnter,
  onMouseLeave,
  isTested,
  onTestUpToHere,
  onClearTest,
  onReveal,
  isRevealEligible,
  children,
  isModelInput,
  isModelInputEligible,
  onToggleModelInput,
  isModelOutput,
  onToggleModelOutput,
  isModalOpen,
  onCloseModal,
}: ConfirmedOperationCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const modalPlaceholderRef = useRef<HTMLDivElement>(null);
  const [inlineSlot] = useState(() => {
    const node = document.createElement('div');
    node.className = 'operation-card__details operation-card__details--collapsed';
    return node;
  });
  const [modalSlot] = useState(() => {
    const node = document.createElement('div');
    node.className = 'operation-card-modal__body';
    return node;
  });

  // Attaches inlineSlot right after the footer, once, for this card's whole lifetime — its own
  // position never changes; only whether it currently *hosts* `children` (vs. the modal doing so
  // instead) does, via the portal below.
  useLayoutEffect(() => {
    cardRef.current?.appendChild(inlineSlot);
    return () => {
      inlineSlot.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attaches modalSlot inside the modal's own DOM (portaled to document.body below) only while
  // it's open — the modal chrome itself (backdrop, title, close button) is plain JSX and free to
  // remount on every open/close; it holds no state worth preserving, unlike `children`.
  useLayoutEffect(() => {
    if (!isModalOpen) return;
    modalPlaceholderRef.current?.appendChild(modalSlot);
    return () => {
      modalSlot.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseModal();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isModalOpen, onCloseModal]);

  return (
    <div
      className={[
        'operation-card',
        isTested ? 'operation-card--tested' : '',
        // Clicking the card no longer opens its modal while editing (see OperationPanel's own
        // onNodeClick) — this drops the pointer cursor .operation-card otherwise hints that with,
        // so hovering it in "Editar" mode shows the same grab cursor dragging it already does
        // (inherited from .operation-canvas__node) instead of promising a click that won't do
        // anything.
        isEditMode ? 'operation-card--edit-mode' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="operation-card__header">
        <h3 className="operation-card__name">{name || 'Operação sem nome'}</h3>
        <div className="operation-card__actions">
          {/* "Editar" mode and every other card interaction are mutually exclusive: while editing,
              the pencil is the only thing this card does at all (see isEditMode below and this
              card's own onClick in the canvas, which drops the click entirely in that mode
              instead of opening the modal) — moving/editing operations shouldn't also be testing,
              revealing, or toggling model input/output out from under whatever's being
              rearranged. Outside "Editar", it's the reverse: every one of these is available, and
              the pencil itself is the one hidden (see its own render below). */}
          {!isEditMode && (
            <>
              {isModelInputEligible && <IoToggle label="Input" active={isModelInput} onToggle={onToggleModelInput} />}
              <IoToggle label="Output" active={isModelOutput} onToggle={onToggleModelOutput} />
              <TestUpToHereButton onTest={onTestUpToHere} isTested={isTested} onClear={onClearTest} />
              {isRevealEligible && <RevealButton onReveal={onReveal} />}
            </>
          )}
          {isEditMode && <EditButton onEdit={onEdit} disabled={editDisabled} />}
        </div>
      </div>

      <div className="operation-card__footer">
        <span className="operation-card__kind">{kindLabel}</span>
        <span className="operation-card__summary">{summary}</span>
      </div>

      {createPortal(children, isModalOpen ? modalSlot : inlineSlot)}

      {isModalOpen &&
        createPortal(
          <div className="operation-card-modal__overlay" onClick={onCloseModal}>
            <div
              className="operation-card-modal"
              role="dialog"
              aria-modal="true"
              aria-label={name || 'Operação sem nome'}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="operation-card-modal__header">
                <div>
                  <h3 className="operation-card-modal__name">{name || 'Operação sem nome'}</h3>
                  <div className="operation-card-modal__meta">
                    <span className="operation-card__kind">{kindLabel}</span>
                    <span className="operation-card__summary">{summary}</span>
                  </div>
                </div>
                <button type="button" className="operation-card-modal__close" onClick={onCloseModal} aria-label="Fechar">
                  ×
                </button>
              </div>

              <div ref={modalPlaceholderRef} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// Overrides the API's (English) labels with their Portuguese display names — the id is still
// what's sent to/matched against the API, only the label shown in the UI is translated here.
const KIND_LABELS: Record<string, string> = {
  lookup: 'Pesquisa aninhada',
  sum: 'Somar',
  counter: 'Contador',
  node: 'Nó',
  find: 'Localizar',
  translator: 'Tradutor',
};

interface OperationEntryState {
  id: string;
  name: string;
  kindId: string;
  confirmed: boolean;
  fields: OperationFields;
  position: NodePosition;
}

/** "Desfazer"/"Refazer" (see undoEditMode/redoEditMode) within a single "Editar" session — every
 * committed step (see the effect that appends to `steps`) plus which one `entries` currently
 * matches. Bundled into one state, not two, so undoing/redoing can move `index` and hand `entries`
 * the step at that new index in the same update instead of risking a render where they briefly
 * disagree. */
interface EditHistoryState {
  steps: OperationEntryState[][];
  index: number;
}

/**
 * Not cryptographically unique, just unlikely enough to collide within one session — plain
 * crypto.randomUUID() requires a secure context (HTTPS or localhost), which isn't guaranteed
 * for every way this app gets served in development.
 */
function generateEntryId(): string {
  return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Pure by design: React 18 StrictMode invokes functional setState updaters twice in
 * development to catch impure ones, so this must not rely on shared mutable state.
 */
function createEntry(id: string, kindId: string, name: string, dataset: DatasetImportResponse, position: NodePosition): OperationEntryState {
  return {
    id,
    name,
    kindId,
    confirmed: false,
    fields: KINDS_BY_ID[kindId].createFields(dataset),
    position,
  };
}

interface OperationPanelProps {
  dataset: DatasetImportResponse;
  /** The model's own name and its own operation count — rendered at the start of the canvas
   * toolbar (see below), on the same line as "Importar teste"/"Testar modelo", rather than in
   * EditorScreen above the canvas — owned by App.tsx same as everything else this component
   * doesn't hold itself. */
  modelName: string;
  onModelNameChange: (name: string) => void;
  /** Seeds the entry list on mount (e.g. a model just imported on the previous screen). Restores
   * each entry's saved canvas position (see modelSerialization's own EntryPosition) — only an
   * entry from a model exported before positions were saved falls back to the usual cascading
   * placement (see placementFor). */
  initialEntries?: SerializableEntry[];
  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
  rangePick: RangePickState | null;
  onStartRangePick: (entryId: string, sheetIndex: number) => void;
  onFinishRangePick: () => void;
  onColumnHighlightsChange: (highlights: ColumnHighlight[]) => void;
  onRangeHighlightsChange: (highlights: RangeHighlight[]) => void;
  onCellHighlightChange: (highlight: OperationHighlight | null) => void;
  /** Opens the off-canvas sheet panel to the given sheet (see RevealButton/App.tsx) — the click
   * counterpart to hovering a card, which only tints the sheet if the panel already happens to
   * be open. */
  onRevealInSheet: (sheetIndex: number) => void;
  /** Closes that sheet panel — called once an operation is confirmed (see renderDraftCard's
   * onConfirm), since picking a column/range keeps it open for exactly as long as it's needed to
   * build/edit that operation, and there's nothing left to do with it once that's done. */
  onOperationConfirmed: () => void;
  /** Whether that sheet panel is currently open — used only to clear the "revealed" operation
   * once it closes (see the effect below), so reopening it later some other way (e.g. "Ver
   * dados") doesn't show a stale highlight left over from whatever was last revealed. */
  isSheetPanelOpen: boolean;
  /** Reports the current entry list up so App.tsx can export it (see the "Guardar modelo" flow). */
  onEntriesChange: (entries: SerializableEntry[]) => void;
  /** The model's designated inputs/outputs — picked directly on a node's toggles below (see
   * ConfirmedOperationCard) instead of in the save modal. Owned by App.tsx, same as the
   * column/range pick state above, since it has to survive an operation being deleted/edited. A
   * model can have several of each, independently toggled. */
  modelInputIds: string[];
  modelOutputIds: string[];
  onModelInputIdsChange: (ids: string[]) => void;
  onModelOutputIdsChange: (ids: string[]) => void;
}

interface Edge {
  fromId: string;
  toId: string;
  from: NodePosition;
  to: NodePosition;
}

/** A smooth left-to-right connector between a "from" node's right edge and a "to" node's left
 * edge, both anchored at the header's vertical center (see NODE_HEADER_ANCHOR_Y). */
function edgePath({ from, to }: Edge): string {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEADER_ANCHOR_Y;
  const endX = to.x;
  const endY = to.y + NODE_HEADER_ANCHOR_Y;
  const controlOffset = Math.max(60, Math.abs(endX - startX) / 2);
  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
}

/**
 * Operation canvas. Both adding a new operation and editing an existing one are configured in
 * the left-docked panel (see renderConfigPanel), not on the canvas itself — a confirmed node on
 * the canvas only shows its name, model input/output toggles, and its live input/result;
 * whatever table/columns/range it's set up against is visible in that panel (see the pencil) or
 * by revealing it in the sheet (see RevealButton), not on the card. From there each kind renders
 * its own config and input/result, but the surrounding node chrome — name/cancel/edit/confirm/
 * delete, model input/output toggles, and hover behavior — is all shared.
 */
export function OperationPanel({
  dataset,
  modelName,
  onModelNameChange,
  initialEntries,
  columnPick,
  onStartColumnPick,
  onFinishColumnPick,
  rangePick,
  onStartRangePick,
  onFinishRangePick,
  onColumnHighlightsChange,
  onRangeHighlightsChange,
  onCellHighlightChange,
  onRevealInSheet,
  onOperationConfirmed,
  isSheetPanelOpen,
  onEntriesChange,
  modelInputIds,
  modelOutputIds,
  onModelInputIdsChange,
  onModelOutputIdsChange,
}: OperationPanelProps) {
  const [entries, setEntries] = useState<OperationEntryState[]>(() =>
    (initialEntries ?? []).map((entry, index) => ({ ...entry, position: entry.position ?? placementFor(index) })),
  );
  // The model name shows as plain text (with a pencil to start editing — see startNameEdit) until
  // that pencil is clicked, same "nothing looks editable until you ask it to be" idea as an
  // operation's own pencil (see editEntry) reopening its config panel. While editing, typing no
  // longer commits straight to onModelNameChange on every keystroke either — nameDraft holds it
  // until "✓"/"✗" (see confirmNameEdit/cancelNameEdit) explicitly commit or discard it. Seeded
  // once from the modelName prop rather than kept in sync with it via an effect — that prop only
  // ever changes from outside this component before it mounts at all (an imported model's name,
  // set just before the screen switches to this one), never while it's already mounted, so
  // there's nothing external for a later render to reconcile against.
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(modelName);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Measures nameDraft's actual rendered width (see the hidden mirror span and the layout effect
  // below) rather than sizing the input by character count (the <input> "size" attribute) — size
  // approximates every character as the same width, which for a proportional font leaves a gap
  // between the text and the field's own edge that grows or shrinks with which letters happen to
  // be in the name, instead of hugging it.
  const [nameInputWidth, setNameInputWidth] = useState<number | null>(null);
  const nameMirrorRef = useRef<HTMLSpanElement>(null);
  const operationTypes = useOperationTypes();
  // Snapshot of an operation's confirmed state, taken when it enters edit mode — lets the ×
  // cancel the edit (restore the snapshot) instead of deleting an already-confirmed operation.
  const [editSnapshots, setEditSnapshots] = useState<Record<string, OperationEntryState>>({});
  // The confirmed operation card currently under the mouse, if any.
  const [hoveredOperationId, setHoveredOperationId] = useState<string | null>(null);
  // The confirmed operation last "revealed" (see RevealButton) — unlike hover, this sticks
  // around after the mouse leaves the card, so its sheet highlight stays visible while looking
  // at the panel that was just opened for it. Hovering a different card still shows that one's
  // highlight in the meantime (see activeHighlightId below); leaving it falls back to this one.
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const activeHighlightId = hoveredOperationId ?? selectedOperationId;
  // Which confirmed card, if any, currently has its detail modal open (its editable fields +
  // live result — see ConfirmedOperationCard) — at most one at a time, so opening a different
  // card's modal replaces whichever was open rather than stacking.
  const [modalEntryId, setModalEntryId] = useState<string | null>(null);

  // Clears the pinned highlight once the sheet panel it was shown in closes — otherwise
  // reopening the panel later some other way (e.g. "Ver dados", unrelated to any particular
  // operation) would still show whatever was last revealed, which by then may no longer match
  // what's being worked on.
  useEffect(() => {
    if (!isSheetPanelOpen) {
      setSelectedOperationId(null);
    }
  }, [isSheetPanelOpen]);
  // The row each operation's query currently matches (if any) — only meaningful for kinds
  // that implement getCellHighlight (currently just lookup).
  const [matchedRows, setMatchedRows] = useState<Record<string, number | null>>({});
  // Bumped by "Testar modelo" (see runModelTest below) — passed through to each entry's own
  // renderBody (see operationKind.ts) as the one signal that should make it actually call its
  // endpoint, instead of every result live-fetching as soon as its inputs are ready. Keyed by
  // entry id (rather than one number shared by every entry) so runModelTest can stagger *when*
  // each entry's own bump actually lands — a model with many operations would otherwise fire
  // every one of their live-result requests against the API in the very same instant.
  const [testSignals, setTestSignals] = useState<Record<string, number>>({});
  // Whether "Testar modelo" has fired at least once — the counterpart of testSignal's own "=== 0"
  // check before testSignal became per-entry (see "Limpar teste"'s disabled/title logic below),
  // which needed a single shared value to compare against 0 in the first place.
  const [hasTested, setHasTested] = useState(false);
  // Bumped per-entry by "Limpar teste" (every confirmed entry at once) and clearChainTest (just
  // the ids it's clearing) — the counterpart to testSignals: dropping an entry's own testSignal
  // back to 0 on its own only stops it from being staggered *again* (see each kind's own
  // renderBody), it doesn't itself clear what's already shown — every kind's own reset effect
  // watches this instead, specifically because it needs to fire even when nothing else about that
  // entry changed. Keyed by entry id (not one shared counter) so clearChainTest can reset just one
  // chain's own displayed results without touching every other operation's, the same reasoning
  // testSignals itself is per-entry rather than a single shared value.
  const [resetSignals, setResetSignals] = useState<Record<string, number>>({});
  // How far a "Testar modelo" run has staggered through the confirmed operations so far — null
  // whenever one isn't in progress (nothing to show a bar for). Drives the progress bar at the
  // top of the canvas (see below); purely observational, doesn't gate anything itself.
  const [testProgress, setTestProgress] = useState<{ done: number; total: number } | null>(null);
  // Pending runModelTest timeouts (see below), so a fresh "Testar modelo" click — or "Limpar
  // teste" — can cancel whatever's left of a previous stagger instead of letting it keep firing
  // requests for a test that's already been superseded or cleared.
  const testStaggerTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const timeoutId of testStaggerTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  function cancelPendingTestStagger() {
    for (const timeoutId of testStaggerTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    testStaggerTimeoutsRef.current = [];
    setTestProgress(null);
  }

  /**
   * "Testar modelo" itself: bumps every confirmed operation's own testSignal, one at a time in
   * canvas order, each TEST_STAGGER_DELAY_MS after the last — instead of bumping one signal
   * every operation would react to at once, which is exactly what would otherwise turn "test a
   * model with a lot of operations" into a burst of simultaneous requests against the API. A
   * chained operation still effectively waits on top of this for its own reference to resolve
   * (see resolveOperationInputs), same as before; this only changes when an *independent*
   * operation's own request actually goes out. testProgress is bumped alongside each signal
   * purely so the progress bar shown on the button has something to show; it fades away shortly
   * after the last one fires rather than lingering at 100% indefinitely.
   *
   * `upToEntryId`, if given, narrows the run to just that operation's own dependency chain (see
   * getDependencyChain) — itself and everything it (transitively) reads its input from — instead
   * of every confirmed operation on the canvas. This is what each card's own "Testar até aqui"
   * button (see ConfirmedOperationCard) uses: check one operation's result without waiting on
   * (or spending API calls testing) unrelated ones elsewhere in the model.
   *
   * Either way, every operation the run actually touches (the whole model's for a full run, just
   * the chain's for a scoped one) that has a single chainable field (see renderInputEditor — the
   * same "is it eligible to be a model input" test used elsewhere) must have a real, non-blank
   * value first *if* that field is currently a literal — not just the ones actually toggled on as
   * a designated model input: an operation someone chains off (e.g. a node) can have an empty
   * literal value whether or not its own author ever marked it as a model input, and either way
   * that operation (and everything chained past it) would otherwise silently sit there doing
   * nothing — no request, no result, no error — while its testSignal still ticks over and its
   * card still shows as "tested". A field currently set to a *reference* is never flagged here —
   * whether that resolves in time is what resolveOperationInputs' own pending/ready/missing/cycle
   * states already track, not a blank-value problem. "Empty" covers both a field that was simply
   * never touched and one that was typed into and then left as just whitespace; trimming treats
   * them the same. Reported as a warning (see granularTestWarning) and the run doesn't start at
   * all, rather than silently producing nothing. Returns whether the run actually started, so a
   * caller (see runTestFromModal) can tell a blocked attempt apart from one that proceeded.
   */
  function runModelTest(upToEntryId?: string): boolean {
    const chain = upToEntryId ? getDependencyChain(upToEntryId, entries) : null;
    const relevantEntries = entries.filter((entry) => entry.confirmed && (!chain || chain.has(entry.id)));

    const emptyInputNames = relevantEntries
      .filter((entry) => {
        if (!KINDS_BY_ID[entry.kindId].renderInputEditor) return false;
        const source = getInputSource(entry.fields);
        return source.type === 'literal' && source.value.trim() === '';
      })
      .map((entry) => entry.name || 'Operação sem nome');

    if (emptyInputNames.length > 0) {
      setGranularTestWarning(
        emptyInputNames.length === 1
          ? `Não é possível testar: a operação "${emptyInputNames[0]}" não tem um valor definido.`
          : `Não é possível testar: as operações ${emptyInputNames.map((name) => `"${name}"`).join(', ')} não têm um valor definido.`,
      );
      return false;
    }
    setGranularTestWarning(null);

    cancelPendingTestStagger();
    setHasTested(true);

    // Scoped run ("Testar até aqui"): every entry actually being (re-)tested is about to get a
    // fresh testSignal below, but anything downstream of *those* that isn't itself part of this
    // chain (see getDependents) still has a cached "tested" result computed against the chain's
    // *previous* values — invalidate it now rather than leaving it looking validly tested against
    // data that's about to change out from under it.
    if (chain) {
      const staleDependents = new Set<string>();
      for (const id of chain) {
        for (const dependentId of getDependents(id, entries)) {
          if (!chain.has(dependentId)) staleDependents.add(dependentId);
        }
      }
      clearTestStateForIds(staleDependents);
    }

    const confirmedIds = entries.filter((entry) => entry.confirmed && (!chain || chain.has(entry.id))).map((entry) => entry.id);
    if (confirmedIds.length === 0) return true;

    setTestProgress({ done: 0, total: confirmedIds.length });
    confirmedIds.forEach((id, index) => {
      const timeoutId = window.setTimeout(() => {
        setTestSignals((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
        setTestProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
      }, index * TEST_STAGGER_DELAY_MS);
      testStaggerTimeoutsRef.current.push(timeoutId);
    });

    const clearProgressTimeoutId = window.setTimeout(() => {
      setTestProgress(null);
    }, confirmedIds.length * TEST_STAGGER_DELAY_MS + TEST_PROGRESS_LINGER_MS);
    testStaggerTimeoutsRef.current.push(clearProgressTimeoutId);
    return true;
  }
  // Set when a test attempt (granular, via "Testar até aqui", or the full model, via "Testar
  // modelo"/"Correr teste") is blocked because a designated input it actually depends on is
  // currently empty — cleared on the next test that actually runs (see runModelTest) or on
  // "Limpar teste".
  const [granularTestWarning, setGranularTestWarning] = useState<string | null>(null);
  // Set when "Importar teste" (inside TestValuesModal) fails to parse a file — cleared on the
  // next successful load.
  const [testLoadError, setTestLoadError] = useState<string | null>(null);
  const testFileInputRef = useRef<HTMLInputElement>(null);
  // Whether the test-values modal (see TestValuesModal) is open — only reachable when the model
  // has at least one designated input; with none, "Testar modelo" runs immediately since there's
  // nothing to review first.
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // The existing (already-confirmed) operation currently reopened for editing in the left-docked
  // config panel (see renderConfigPanel and editEntry) — mutually exclusive with stagingEntryIds
  // below, never both at once. Cleared once that entry resolves — reverted or re-confirmed (see
  // the effect below).
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  // Brand-new operations being prepared together as a batch in the same panel (see
  // renderConfigPanel) — a kind picked from "+ Adicionar operação" starts this list with one
  // entry; the panel's own "+" below the staged list (see addToStaging) appends another of that
  // same kind to it, without confirming any of them yet. Nothing in the batch actually joins the
  // canvas until its batch-confirm button ("Adicionar operador"/"Adicionar N operadores" — see
  // confirmAllStaged) confirms the whole list at once — that's the entire point of staging
  // several before committing, rather than confirming (and closing the panel) one at a time the
  // way editing still does.
  const [stagingEntryIds, setStagingEntryIds] = useState<string[]>([]);
  // Each confirmed operation's latest computed result (as a string), keyed by entry id — the
  // frontend-only stand-in for a chain: another operation's "input" field can reference an id
  // here instead of a typed value. Null means "no value yet" (loading, error, or not found).
  const [results, setResults] = useState<Record<string, string | null>>({});
  const resolvedInputsByEntry = resolveOperationInputs(entries, results);
  // Which edges (see the `edges` computation below, keyed the same way — "fromId-toId") are lit
  // up as data has flowed through them — lit by flashEdgesFrom the moment the operation an edge
  // starts *from* reports a new result (see each renderBody's own onResultChange below), whether
  // that's from a full "Testar modelo" run, a scoped "Testar até aqui", or "Correr teste" — same
  // one signal covers all three, since it's tied to a result actually landing rather than to any
  // particular button. Accumulates across runs rather than resetting at the start of each one —
  // running one operation, then a different one, keeps the first one's own edges lit alongside
  // the second's, rather than the second run wiping out a path that's still just as true as it
  // was. Only "Limpar teste" (see clearTest) clears it, the same as everything else a test
  // touched.
  const [activeEdgeKeys, setActiveEdgeKeys] = useState<Set<string>>(new Set());

  // "select" is "Editar" mode (see the pencil toggle below) — the only state operations can be
  // dragged to a new position in, and the only state clicking a node selects it (see onNodeClick)
  // rather than opening its detail modal. Dragging empty canvas background is always a marquee
  // select while this is on (see handleViewportMouseDown) — there's no separate "Selecionar"
  // sub-toggle any more, selecting is just what "Editar" itself does; panning while editing is a
  // middle-mouse-button drag instead (see handleViewportMouseDown), same as a left-button drag
  // still pans outside "Editar". Switching away from "select" drops whatever was selected/copied —
  // a leftover selection or clipboard would otherwise linger, invisible, back in "pan" mode.
  const [tool, setTool] = useState<'pan' | 'select'>('pan');
  // Snapshot of every entry (positions included) taken the moment "Editar" turns on (see
  // enterEditMode) — what "Cancelar" (see cancelEditMode) restores, discarding every move/
  // copy/paste/delete made during this editing session at once, same as editEntry's own
  // editSnapshots does for a single operation's fields. State, not a ref, since hasEditModeChanges
  // below reads it during render to decide what the canvas shows for leaving "Editar" — a ref
  // read there wouldn't be reactive (React wouldn't know to re-render when it's written).
  const [editModeSnapshot, setEditModeSnapshot] = useState<OperationEntryState[] | null>(null);
  // "Desfazer"/"Refazer" within the current "Editar" session (see EditHistoryState/
  // undoEditMode/redoEditMode) — null outside "Editar" (nothing to step through), reset to a
  // single starting step by enterEditMode. Committed to by the effect just below this component's
  // own state declarations, not by every individual mutation site (drag/copy/paste/delete/a
  // per-operation edit confirmed) — same reasoning as hasEditModeChanges' own deep-equality check
  // over tracking each one separately.
  const [editHistory, setEditHistory] = useState<EditHistoryState | null>(null);
  // Which nodes are selected while "Editar" is on (see onNodeClick: a plain click replaces this
  // with just that one id, a shift/ctrl/cmd-click toggles it in or out of whatever's already
  // selected, and a marquee drag over the background replaces it with everything the marquee
  // overlapped — see handleViewportMouseDown/useCanvasViewport's own onMarqueeSelect). Reset to
  // empty whenever "Editar" itself turns off, same as clipboard.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Set right when a drag starts (see beginNodeDrag) on one of several currently-selected nodes —
  // every selected node's own position at that exact moment, so the whole group can be dragged
  // together (see onDragEntry below, which reads this to move every other selected node by the
  // same delta the dragged one just moved). Null outside that specific case (dragging a single,
  // non-multi-selected node), which is the far more common one and needs no such bookkeeping. A
  // plain ref, not state: it's write-once per drag and never itself drives a render.
  const multiDragOriginsRef = useRef<{ draggedId: string; origins: Record<string, NodePosition> } | null>(null);
  // Copied operations, kept purely in memory (nothing persisted, same as everything else on this
  // canvas) — see copySelection/pasteClipboardAt. Cleared only by copying again, never by pasting,
  // so the same copy can be pasted more than once.
  const [clipboard, setClipboard] = useState<OperationEntryState[] | null>(null);
  // True once "Colar" has been clicked and is waiting for the placement click on the canvas (see
  // handleViewportClick) — lets the user choose where the pasted copy lands instead of it always
  // dropping on top of the original, which would bury it under (or overlapping) the rest of the
  // model.
  const [pendingPaste, setPendingPaste] = useState(false);

  // The canvas' own pan/zoom/marquee-select/node-drag mechanics — see useCanvasViewport for why
  // this is split out rather than living directly here: none of it needs to know what an
  // operation entry actually is, only its id and on-screen box.
  const {
    viewOffset,
    zoom,
    pan,
    dragNode,
    marqueeRect,
    viewportRef,
    nodeRefs,
    nodeZIndex,
    startPan,
    startMarquee,
    startNodeDrag,
    zoomBy,
    handleViewportWheel,
  } = useCanvasViewport({
      entries,
      // Repositioning only actually applies in "Editar" mode (see its own button/comment below)
      // — the hook itself still tracks the drag either way (so its own click-vs-drag distance
      // check, and therefore onNodeClick, still works outside "Editar" mode too), this just
      // drops the position update on the floor the rest of the time.
      onDragEntry: (id, position) => {
        if (tool !== 'select') return;
        // Multi-move: dragging one of several currently-selected nodes (see beginNodeDrag/
        // multiDragOriginsRef) moves the whole group by the same delta instead of just the one
        // node actually under the cursor. Applying the delta to every id in `origins` (draggedId
        // included) rather than special-casing the dragged node itself and updating the rest
        // separately — origin + delta for the dragged node's own id always works out to exactly
        // `position` anyway, so one loop covers it too.
        const multiDrag = multiDragOriginsRef.current;
        if (multiDrag && multiDrag.draggedId === id) {
          const origin = multiDrag.origins[id];
          const deltaX = position.x - origin.x;
          const deltaY = position.y - origin.y;
          for (const [otherId, otherOrigin] of Object.entries(multiDrag.origins)) {
            updateEntry(otherId, { position: { x: otherOrigin.x + deltaX, y: otherOrigin.y + deltaY } });
          }
          return;
        }
        updateEntry(id, { position });
      },
      // A click (not a drag) on a node: in "Editar" mode, clicking an already-selected node always
      // removes just it from the selection — no modifier needed, whether it's the only one
      // selected or one of several — while clicking one that isn't yet selected either replaces
      // the selection with just it (a plain click) or adds it alongside whatever's already
      // selected (shift/ctrl/cmd-click, multi-select). In plain "pan" mode (not editing at all) a
      // click opens that node's detail modal instead — the card's own interactions (test/reveal/
      // IO toggles/opening the modal) are all off-limits while editing, same as its
      // ConfirmedOperationCard render (see isEditMode there) already hides them for. Dragging a
      // node to reposition it still works in every case (see onDragEntry above), only what a
      // plain click does changes.
      onNodeClick: (id, event) => {
        if (tool === 'select') {
          const additive = event.shiftKey || event.metaKey || event.ctrlKey;
          setSelectedIds((current) => {
            if (current.includes(id)) return current.filter((existing) => existing !== id);
            return additive ? [...current, id] : [id];
          });
        } else {
          setModalEntryId(id);
        }
      },
      onMarqueeSelect: setSelectedIds,
    });

  // Wraps startNodeDrag so a drag on a node that's part of a multi-node selection (more than one
  // id selected, this node among them) moves the whole group instead of just the one node under
  // the cursor — populates multiDragOriginsRef with every selected node's position right as the
  // drag begins, for onDragEntry (above) to apply the same delta to each. Any other drag (single
  // node, or a node outside the current selection) clears the ref so onDragEntry falls back to
  // its plain single-node behavior.
  function beginNodeDrag(entry: OperationEntryState) {
    // Curried the same way startNodeDrag itself is (called once per entry on every render, but
    // its side effects only happen when the mousedown it returns actually fires) — populating
    // multiDragOriginsRef here at render time, rather than inside the returned handler, would
    // have every entry's render overwrite it in turn, leaving whichever entry rendered last as
    // the ref's contents regardless of which node is actually dragged.
    const handleMouseDown = startNodeDrag(entry.id, entry.position);
    return (event: ReactMouseEvent<HTMLDivElement>) => {
      if (selectedIds.length > 1 && selectedIds.includes(entry.id)) {
        const origins: Record<string, NodePosition> = {};
        for (const id of selectedIds) {
          const selectedEntry = entries.find((candidate) => candidate.id === id);
          if (selectedEntry) origins[id] = selectedEntry.position;
        }
        multiDragOriginsRef.current = { draggedId: entry.id, origins };
      } else {
        multiDragOriginsRef.current = null;
      }
      handleMouseDown(event);
    };
  }

  // Lets App.tsx export the model (see the "Guardar modelo" flow) without entries living there.
  useEffect(() => {
    onEntriesChange(entries);
  }, [entries, onEntriesChange]);

  // Focuses (and selects, so typing straight away replaces rather than appends to) the model name
  // input the moment editing it starts (see startNameEdit) — otherwise the pencil click would
  // swap the text for an input the cursor isn't actually in yet, one extra click away from typing.
  useEffect(() => {
    if (!isEditingName) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isEditingName]);

  // Re-measures the hidden mirror span (see its own render, just below the input) on every
  // keystroke while editing the model name — before paint (useLayoutEffect, not useEffect), so
  // the input's own width never visibly lags a character behind what's actually been typed.
  useLayoutEffect(() => {
    if (!isEditingName) return;
    setNameInputWidth(nameMirrorRef.current?.offsetWidth ?? null);
  }, [isEditingName, nameDraft]);

  // Commits a new "Desfazer"/"Refazer" step (see EditHistoryState) whenever `entries` actually
  // settles on something new during "Editar" — skipped mid-drag (dragNode still set: onDragEntry
  // fires on every single mousemove, so committing here too would turn one drag into dozens of
  // undo steps instead of the one it should read as), skipped while any entry is unconfirmed
  // (a staged batch or a single operation reopened for editing — see hasDraftInProgress below;
  // committing mid-edit would let "Desfazer" land on a half-finished edit with no open panel left
  // to finish it in, since editingEntryId/stagingEntryIds aren't themselves part of this history),
  // and skipped again if undo/redo itself was what just changed `entries` (its own setEditHistory
  // already moved `index` to match, so the step comparison below finds nothing new to append). A
  // fresh change made after undoing drops every step past the current one — the redo branch that
  // was undone away is gone the moment editing continues down a different path, same as most
  // editors' own undo stacks.
  useEffect(() => {
    if (tool !== 'select' || !editHistory || dragNode) return;
    if (entries.some((entry) => !entry.confirmed)) return;
    const currentStep = editHistory.steps[editHistory.index];
    if (JSON.stringify(currentStep) === JSON.stringify(entries)) return;
    const steps = [...editHistory.steps.slice(0, editHistory.index + 1), structuredClone(entries)];
    setEditHistory({ steps, index: steps.length - 1 });
    // editHistory is deliberately left out — this effect only reacts to entries/dragNode settling
    // on something new, not to editHistory's own writes (which never touch entries themselves).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, dragNode, tool]);

  // Closes the edit panel once the entry it was editing resolves — reverted (× cancels back to
  // its confirmed snapshot — see cancelEntry) or, in principle, confirmed some other way. Driven
  // by `entries` rather than the panel's own × so every way that entry can resolve is covered by
  // one place. Staging has no equivalent effect: confirmAllStaged and removeFromStaging both
  // already update stagingEntryIds themselves, directly, since nothing else can change a staged
  // entry's confirmed status out from under them (staged entries are hidden from the canvas —
  // see the entries.map filter below — so the select tool's bulk delete can't touch them either).
  useEffect(() => {
    if (!editingEntryId) return;
    const entry = entries.find((item) => item.id === editingEntryId);
    if (!entry || entry.confirmed) {
      setEditingEntryId(null);
    }
  }, [entries, editingEntryId]);

  // Sheet column/range tints: every operation being built/edited shows what it's picked, and so
  // does the active (hovered, or last revealed — see activeHighlightId) confirmed operation —
  // regardless of whether its kind also has an exact-cell highlight to show (e.g. lookup, once
  // it has a match): that's a separate, more precise overlay drawn on top (see the effect below),
  // not a replacement, since a lookup with no match yet (or not typed into) would otherwise show
  // no highlight at all despite still having a definite search/result column.
  useEffect(() => {
    const columns: ColumnHighlight[] = [];
    const ranges: RangeHighlight[] = [];
    for (const entry of entries) {
      const kind = KINDS_BY_ID[entry.kindId];
      const isActive = entry.confirmed ? entry.id === activeHighlightId : true;
      if (isActive) {
        columns.push(...kind.getColumnHighlights(entry.fields));
        ranges.push(...(kind.getRangeHighlights?.(entry.fields) ?? []));
      }
    }
    onColumnHighlightsChange(columns);
    onRangeHighlightsChange(ranges);
  }, [entries, activeHighlightId, onColumnHighlightsChange, onRangeHighlightsChange]);

  // Exact input/output cell highlight: only for the active confirmed operation whose kind
  // supports that precision, and only once it actually has a match.
  useEffect(() => {
    const entry = entries.find((item) => item.id === activeHighlightId && item.confirmed);
    const kind = entry ? KINDS_BY_ID[entry.kindId] : null;
    if (!entry || !kind?.getCellHighlight) {
      onCellHighlightChange(null);
      return;
    }
    onCellHighlightChange(kind.getCellHighlight(entry.fields, matchedRows[entry.id] ?? null));
  }, [entries, activeHighlightId, matchedRows, onCellHighlightChange]);

  // Mousedown on empty canvas background: places a pending paste (see handleViewportClick, which
  // does the actual placing on the following click), starts a marquee drag while "Editar" is on
  // (there's no separate "Selecionar" toggle any more — selecting is just what a left-button
  // background drag does throughout "Editar"), or pans the canvas otherwise — whichever's active,
  // never more than one at a time. The middle mouse button always pans instead, in either mode
  // (button === 1), since a left-button drag is spoken for by marquee-select while editing.
  function handleViewportMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (pendingPaste) return;
    if (event.button === 1) {
      startPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (tool === 'select') {
      startMarquee(event);
      return;
    }
    startPan(event);
  }

  // The companion click handler for a pending paste (see "Colar" in the toolbar) — fires after
  // handleViewportMouseDown above declines to pan/marquee-select while one's pending, so this is
  // the only thing a click on the canvas does in that state: place the clipboard at wherever was
  // clicked, converting the click's screen position back to the same canvas-local coordinate
  // space node positions already live in (undoing the viewport's own offset and the surface's pan
  // transform — see the JSX below).
  function handleViewportClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!pendingPaste) return;
    // Ignore a click that landed on an existing node (it still bubbles up here) — pasting
    // straight on top of it is exactly the overlap this whole placement step exists to avoid;
    // pendingPaste stays on so the very next click on actual empty canvas still places it.
    if ((event.target as HTMLElement).closest('.operation-canvas__node, .operation-canvas__floating-toolbar')) return;
    const viewportBox = viewportRef.current?.getBoundingClientRect();
    if (!viewportBox) return;
    pasteClipboardAt({
      x: (event.clientX - viewportBox.left - viewOffset.x) / zoom,
      y: (event.clientY - viewportBox.top - viewOffset.y) / zoom,
    });
  }

  function updateEntry(id: string, patch: Partial<OperationEntryState>) {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function updateEntryFields(id: string, patch: OperationFields) {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, fields: { ...entry.fields, ...patch } } : entry)),
    );
  }

  function removeEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setEditSnapshots((current) => {
      if (!(id in current)) return current;
      const { [id]: _discarded, ...rest } = current;
      return rest;
    });
    setResults((current) => {
      if (!(id in current)) return current;
      const { [id]: _discarded, ...rest } = current;
      return rest;
    });
    setModalEntryId((current) => (current === id ? null : current));
    // Its nodeRefs entry (owned by useCanvasViewport) is left in place rather than deleted here —
    // harmless: nothing looks a deleted id up again once it's gone from `entries` (see that
    // hook's own note on why).
  }

  // "Editar": clears any run (see clearTest — same as clicking "Limpar teste" by hand), since
  // editing (moving/copying/deleting operations) can easily invalidate a test's own results
  // without anything re-running to catch it. Snapshots every entry (see editModeSnapshot) so
  // "Cancelar" has something to restore — still the *pre*-clear values despite clearTest being
  // called first: its own field-blanking (see updateTestValue) goes through React state updates
  // that haven't actually landed on `entries` yet by the time this line reads it, so "Cancelar"
  // later still restores this exact pre-edit state, run and all, rather than leaving it cleared.
  // Also closes whatever detail modal happened to be open (its test/reveal/IO-toggle controls are
  // exactly what this mode locks out — see ConfirmedOperationCard's own isEditMode), and switches
  // into "select" mode.
  function enterEditMode() {
    clearTest();
    const snapshot = structuredClone(entries);
    setEditModeSnapshot(snapshot);
    setEditHistory({ steps: [snapshot], index: 0 });
    setModalEntryId(null);
    setTool('select');
  }

  // Shared by both "Guardar" and "Cancelar" — leaving "Editar" always drops whatever's
  // copied/selected within it, regardless of which one exits it: a leftover selection/clipboard
  // would otherwise linger, invisible, back in "pan" mode. Also discards any per-operation edit or
  // new-operation batch still open in the left panel (cancelEntry/cancelStaging, same as their own
  // ×) rather than leaving it open (and, for a staged batch, its never-confirmed drafts orphaned)
  // once the whole editing session it lives inside of ends — "+ Adicionar operação"/the pencil
  // that start either are only reachable in "Editar" to begin with, so neither could have been in
  // progress before this session started.
  function exitEditMode() {
    if (editingEntryId) cancelEntry(editingEntryId);
    if (stagingEntryIds.length > 0) cancelStaging();
    setTool('pan');
    setEditModeSnapshot(null);
    setEditHistory(null);
    setSelectedIds([]);
    setClipboard(null);
    setPendingPaste(false);
  }

  // "Cancelar" (only shown while editing — see its own button): restores every entry to how it
  // looked the moment "Editar" turned on, undoing every move/copy/paste/delete made since, then
  // exits the same way "Guardar" does. editModeSnapshot is never null in practice here — it's
  // always written by enterEditMode just before this becomes reachable at all.
  function cancelEditMode() {
    if (editModeSnapshot) {
      setEntries(editModeSnapshot);
    }
    exitEditMode();
  }

  // "Desfazer"/"Refazer" (see their own buttons, and the effect above that builds editHistory up
  // in the first place) — step `entries` to the previous/next committed step without touching
  // `index` and `entries` in two separate renders, so they can never briefly disagree (which would
  // otherwise re-trigger that same effect and misread the step change as a fresh edit). Both are
  // no-ops at either end of the history (nothing before the first step, nothing past the last)
  // rather than wrapping around — mirrored by their own buttons' disabled state.
  function undoEditMode() {
    if (!editHistory || editHistory.index <= 0) return;
    const index = editHistory.index - 1;
    setEntries(editHistory.steps[index]);
    setEditHistory({ ...editHistory, index });
  }

  function redoEditMode() {
    if (!editHistory || editHistory.index >= editHistory.steps.length - 1) return;
    const index = editHistory.index + 1;
    setEntries(editHistory.steps[index]);
    setEditHistory({ ...editHistory, index });
  }

  // "Copiar" in the selection bar (see the toolbar below) — snapshots the selected entries as
  // plain data (structuredClone, so later edits to the originals can't leak into the clipboard or
  // vice versa) without touching the canvas. Kept until the next copy, not the next paste — the
  // same clipboard can seed more than one paste.
  function copySelection() {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    setClipboard(entries.filter((entry) => selectedSet.has(entry.id)).map((entry) => structuredClone(entry)));
  }

  // "Eliminar" in the selection bar — same per-entry cleanup as a single removeEntry, just for
  // every selected id at once.
  function deleteSelection() {
    if (selectedIds.length === 0) return;
    for (const id of selectedIds) {
      removeEntry(id);
    }
    setSelectedIds([]);
  }

  // Places whatever's in the clipboard at `position` (already converted to the same canvas-local
  // coordinate space node positions live in — see handleViewportClick), preserving the copied
  // group's own relative layout: its bounding box's top-left lands exactly at `position`, and
  // every other copied node keeps its original offset from that corner. Every copied id gets a
  // fresh one, and any reference between two operations that were copied together is rewritten to
  // point at its own new copy (see remapValueSourceReferences) rather than the original — a
  // reference to an operation outside the copied group is left pointing at that original, since
  // it's still there on the canvas. The pasted copy becomes the new selection, mirroring what
  // copying-then-pasting does in most other canvas tools.
  function pasteClipboardAt(position: NodePosition) {
    if (!clipboard || clipboard.length === 0) {
      setPendingPaste(false);
      return;
    }

    const idMap: Record<string, string> = {};
    for (const entry of clipboard) {
      idMap[entry.id] = generateEntryId();
    }
    const minX = Math.min(...clipboard.map((entry) => entry.position.x));
    const minY = Math.min(...clipboard.map((entry) => entry.position.y));

    const pasted = clipboard.map((entry) => ({
      ...entry,
      id: idMap[entry.id],
      name: entry.name ? `${entry.name} (cópia)` : entry.name,
      fields: remapValueSourceReferences(entry.fields, idMap),
      position: { x: position.x + (entry.position.x - minX), y: position.y + (entry.position.y - minY) },
    }));

    setEntries((current) => [...current, ...pasted]);
    setSelectedIds(pasted.map((entry) => entry.id));
    setPendingPaste(false);
  }

  function labelForEntry(id: string): string {
    return entries.find((entry) => entry.id === id)?.name || 'Operação sem nome';
  }

  // What a given operation's "input" field can reference: every other confirmed operation,
  // except ones that (transitively) already read their own input from this one — offering those
  // would let the user wire up a cycle from the picker itself.
  function referenceOptionsFor(entryId: string): ReferenceOption[] {
    const dependents = getDependents(entryId, entries);
    return entries
      .filter((entry) => entry.confirmed && entry.id !== entryId && !dependents.has(entry.id))
      .map((entry) => ({ operationId: entry.id, label: labelForEntry(entry.id) }));
  }

  function editEntry(id: string) {
    // Belt-and-suspenders: the pencil that calls this is only rendered in "Editar" mode to begin
    // with (see ConfirmedOperationCard's own isEditMode), but this still guards the actual state
    // change in case that ever changes without this being updated to match.
    if (tool !== 'select') return;
    if (entries.some((entry) => !entry.confirmed)) return;
    const entry = entries.find((item) => item.id === id);
    if (entry) {
      setEditSnapshots((current) => ({ ...current, [id]: entry }));
    }
    updateEntry(id, { confirmed: false });
    // Opens the same left-docked config panel used for adding a new operation — the node itself
    // stays on the canvas throughout (see the entries.map render below), still showing its
    // confirmed look and live position/edges, so its own detail modal (if open) would now be
    // redundant with the docked panel doing the actual editing.
    setModalEntryId((current) => (current === id ? null : current));
    setEditingEntryId(id);
  }

  // × in the draft toolbar's edit panel: discards the in-progress changes and restores the
  // operation to how it looked before editing started, instead of deleting it — editEntry always
  // snapshots first, so this is only ever reached with one already there.
  function cancelEntry(id: string) {
    const snapshot = editSnapshots[id];
    if (!snapshot) {
      removeEntry(id);
      return;
    }

    setEntries((current) => current.map((entry) => (entry.id === id ? snapshot : entry)));
    setEditSnapshots((current) => {
      const { [id]: _discarded, ...rest } = current;
      return rest;
    });
  }

  function labelForKind(kindId: string): string {
    return KIND_LABELS[kindId] ?? operationTypes.find((type) => type.id === kindId)?.label ?? kindId;
  }

  // One row per designated input, always reflecting whatever's currently set for it (typed
  // directly on its own node, or loaded via the toolbar's "Importar teste") — feeds
  // TestValuesModal (already filled in, not starting blank) and decides where a loaded file's
  // entries land by name (see loadTestCase). App.tsx computes its own
  // equivalent list for "Guardar teste", which now lives next to "Guardar modelo" instead of in
  // this toolbar. Always a literal (see isModelInputEligible below), same invariant ModelCard's
  // own input fields rely on.
  const testInputEntries = modelInputIds
    .map((id) => entries.find((entry) => entry.id === id && entry.confirmed))
    .filter((entry): entry is OperationEntryState => entry !== undefined)
    .map((entry) => {
      const source = getInputSource(entry.fields);
      return { id: entry.id, name: entry.name, value: source.type === 'literal' ? source.value : '' };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  // Whether there's actually anything for "Limpar teste" to blank out — keeps it enabled even
  // before "Testar modelo" has ever run, as long as some input already has a typed/imported value
  // sitting in it (hasTested alone would otherwise leave that value stuck with no way to clear it).
  const hasAnyTestInputValue = testInputEntries.some((entry) => entry.value.trim() !== '');

  function updateTestValue(id: string, value: string) {
    updateEntryFields(id, { input: literalSource(value) });
  }

  // "Limpar teste": clears every card's own shown result/"tested" border (see
  // isTested/operation-card--tested) and re-disables this same action — nothing's actually been
  // tested any more once its results are cleared. Also blanks every designated input's own typed
  // value, not just the shown results — otherwise a value typed by hand, or loaded via "Importar
  // teste", stayed sitting in the field after clearing, leaving the canvas looking like a model
  // that's still been partly filled in rather than back to how it looked before any of that.
  function clearTest() {
    cancelPendingTestStagger();
    // Bumps every entry's own resetSignals slot at once, not just the ones with a testSignal/
    // result currently set — a kind can have something worth clearing (e.g. a typed-but-never-
    // tested literal shown mid-flight) without either of those, so this errs toward clearing
    // everything rather than trying to compute exactly who needs it.
    setResetSignals((current) => {
      const next = { ...current };
      for (const entry of entries) {
        next[entry.id] = (next[entry.id] ?? 0) + 1;
      }
      return next;
    });
    setTestSignals({});
    setHasTested(false);
    setActiveEdgeKeys(new Set());
    for (const id of modelInputIds) {
      updateTestValue(id, '');
    }
    setGranularTestWarning(null);
  }

  // Wipes testSignals/results/activeEdgeKeys for exactly the given ids (a no-op for any id that
  // wasn't set in the first place) and bumps each one's own resetSignals entry — shared by
  // clearChainTest below (an explicit "clear" click) and runModelTest's own downstream-
  // invalidation (a *fresh* run of an upstream chain, which makes every downstream dependent's
  // still-cached test state stale even though nothing asked to clear those specifically).
  // Dropping testSignals back to 0 alone doesn't make a kind's own already-shown result go blank
  // — only resetSignals actually does that (see each kind's own reset effect) — so both need
  // bumping together here, not just the one.
  function clearTestStateForIds(ids: Set<string>) {
    if (ids.size === 0) return;
    setTestSignals((current) => {
      const next = { ...current };
      let changed = false;
      for (const id of ids) {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setResults((current) => {
      const next = { ...current };
      let changed = false;
      for (const id of ids) {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setActiveEdgeKeys((current) => {
      const next = new Set(current);
      let changed = false;
      for (const edge of edges) {
        if (ids.has(edge.fromId) && next.delete(`${edge.fromId}-${edge.toId}`)) changed = true;
      }
      return changed ? next : current;
    });
    setResetSignals((current) => {
      const next = { ...current };
      for (const id of ids) {
        next[id] = (next[id] ?? 0) + 1;
      }
      return next;
    });
  }

  // TestUpToHereButton's own "clear" click (see its own onClear) once a chain's already been
  // tested — undoes that dependency chain's own test state, and cascades forward to every entry
  // that (transitively) depends on any of them (see getDependents) — an operation can't still
  // count as "tested" once something it actually reads its own input from just had its test state
  // wiped, the same way a downstream operation was never able to resolve *past* an upstream one
  // that hadn't been tested yet in the first place. Leaves every operation outside that whole
  // up-and-downstream neighborhood untouched, unlike "Limpar teste" (see clearTest above), which
  // resets the entire canvas at once.
  function clearChainTest(entryId: string) {
    const upstreamChain = getDependencyChain(entryId, entries);
    const toClear = new Set(upstreamChain);
    for (const id of upstreamChain) {
      for (const dependentId of getDependents(id, entries)) {
        toClear.add(dependentId);
      }
    }
    clearTestStateForIds(toClear);
  }

  // "Testar modelo" itself when the model has no designated input (nothing to review — runs
  // immediately); otherwise opens TestValuesModal so the values can be checked/adjusted first,
  // pre-filled from testInputEntries above rather than starting blank.
  function openTestModal() {
    setIsTestModalOpen(true);
  }

  // Only closes the modal once the run actually starts — if it's blocked (see runModelTest's own
  // empty-input check), the modal stays open with the warning showing right where the user can
  // still fix the offending field, instead of closing and leaving them to go find it again.
  function runTestFromModal() {
    if (runModelTest()) {
      setIsTestModalOpen(false);
    }
  }

  function triggerImportTest() {
    setTestLoadError(null);
    testFileInputRef.current?.click();
  }

  // Matches each saved value against a currently-present input by exact name (see
  // testCaseSerialization.ts for why name, not id) — a name from the file with no match on the
  // canvas today is silently skipped, and a current input not mentioned in the file is left
  // exactly as it was. Only fills the input fields, same as typing the values in by hand — it
  // does NOT run the model itself; "Testar modelo" is a separate, explicit click.
  function loadTestCase(file: File) {
    parseTestCaseFile(file)
      .then((parsed) => {
        setTestLoadError(null);
        for (const input of parsed.inputs) {
          const matched = testInputEntries.find((entry) => entry.name === input.name);
          if (matched) {
            updateTestValue(matched.id, input.value);
          }
        }
      })
      .catch((error) => {
        setTestLoadError(error instanceof Error ? error.message : 'Falha ao carregar o teste.');
      });
  }

  // Picking a kind in the add modal (starting a fresh batch) or clicking a staged card's own "+"
  // (see DraftOperationCard's onAddAnotherOfSameKind, adding another of the same kind to the
  // current one) both add to the same staging batch — the new draft doesn't appear on the canvas
  // until the whole batch is confirmed at once (see confirmAllStaged below), unlike editEntry's
  // single entry, which confirms (and closes the panel) on its own.
  function addToStaging(kindId: string) {
    const label = labelForKind(kindId);
    const id = generateEntryId();
    // Cascades by how many are already in *this* staging batch, not by the canvas' total entry
    // count — anchored to wherever the viewport currently is (see viewportPlacementFor), so a
    // batch of several added at once fans out near each other and near the user, regardless of
    // how many other operations already exist elsewhere on the canvas.
    const position = viewportPlacementFor(viewOffset, zoom, stagingEntryIds.length);
    setEntries((current) => {
      const order = current.filter((entry) => entry.kindId === kindId).length + 1;
      return [...current, createEntry(id, kindId, `${label} ${order}`, dataset, position)];
    });
    setStagingEntryIds((current) => [...current, id]);
  }

  // A staged card's own × (see renderConfigPanel) — drops just that one operation out of the
  // batch, leaving the rest of it exactly as it was; unlike cancelStaging below, which discards
  // the whole batch at once.
  function removeFromStaging(id: string) {
    removeEntry(id);
    setStagingEntryIds((current) => current.filter((entryId) => entryId !== id));
  }

  // The panel's own × while staging (see renderConfigPanel) — discards every operation in the
  // batch; none of them were ever confirmed onto the canvas, so there's nothing to revert (unlike
  // cancelEntry's single edited operation, which always has a snapshot to fall back to instead).
  function cancelStaging() {
    for (const id of stagingEntryIds) {
      removeEntry(id);
    }
    setStagingEntryIds([]);
  }

  // The staging batch's confirm button ("Adicionar operador"/"Adicionar N operadores" — see
  // renderConfigPanel) — the one point where staging actually adds anything to the canvas/model:
  // every operation prepared in the batch is confirmed at once, together, instead of one at a
  // time the way editing (or the old single-draft flow) used to.
  function confirmAllStaged() {
    const staged = new Set(stagingEntryIds);
    setEntries((current) => current.map((entry) => (staged.has(entry.id) ? { ...entry, confirmed: true } : entry)));
    onOperationConfirmed();
    setStagingEntryIds([]);
  }

  const hasDraftInProgress = entries.some((entry) => !entry.confirmed);
  const confirmedCount = entries.filter((entry) => entry.confirmed).length;
  // Gate which of the "Editar"-only buttons are disabled once they're rendered at all — see their
  // own render below (next to the pencil toggle), gated on tool === 'select' ("Editar" mode)
  // first. Neither hasClipboard nor hasSelection gate whether their buttons *appear* — only
  // whether each is disabled (Colar/Copiar/Eliminar/Cancelar seleção are all always rendered).
  const hasSelection = tool === 'select' && selectedIds.length > 0;
  const hasClipboard = !!clipboard && clipboard.length > 0;
  // Whether anything's actually changed since "Editar" turned on (see editModeSnapshot) — a
  // plain deep-equality check against the snapshot rather than tracking every mutation site
  // (drag, copy/paste, delete, a per-operation edit confirmed, ...) separately. Drives which
  // button(s) the canvas shows for leaving "Editar" (see that render below): "Guardar"/"Cancelar"
  // only once this is true, plain "Editar" (nothing to commit or discard yet) otherwise.
  const hasEditModeChanges = tool === 'select' && JSON.stringify(entries) !== JSON.stringify(editModeSnapshot);

  // Every confirmed operation whose input dynamically references another one's result — drawn
  // as a connecting line between the two nodes (see edgePath) instead of nesting one inside the
  // other's DOM, since both need to stay independently draggable on the canvas.
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const edges: Edge[] = entries.flatMap((entry) => {
    if (!entry.confirmed) return [];
    return getInputSources(entry.fields).flatMap((source) => {
      if (source.type !== 'reference') return [];
      const from = entriesById.get(source.operationId);
      if (!from) return [];
      return [{ fromId: from.id, toId: entry.id, from: from.position, to: entry.position }];
    });
  });

  // Lights up every edge leading *out of* fromEntryId (see activeEdgeKeys) — called from that
  // entry's own onResultChange (see renderConfirmedCard below) the moment its live result
  // actually changes, which is what "data passing through the wire" means here: the edge a
  // downstream operation's reference chain resolves along lights up right as the value it's
  // chained off of becomes available, not on any fixed schedule of its own.
  function flashEdgesFrom(fromEntryId: string) {
    const keys = edges.filter((edge) => edge.fromId === fromEntryId).map((edge) => `${edge.fromId}-${edge.toId}`);
    if (keys.length === 0) return;
    setActiveEdgeKeys((current) => new Set([...current, ...keys]));
  }

  // The edit panel's own confirm ("Atualizar operação" — see renderDraftCard's 'edit' mode) —
  // pins the entry's highlight so it's what shows next time the sheet panel opens (a reveal
  // click, or "Ver dados") without needing to hover first, and reports the confirm so App.tsx can
  // close the sheet panel. Staging has no equivalent per-card confirm — see confirmAllStaged.
  function confirmEdit(entry: OperationEntryState) {
    updateEntry(entry.id, { confirmed: true });
    setSelectedOperationId(entry.id);
    onOperationConfirmed();
  }

  /**
   * 'edit' (reopened via "Editar" — see editEntry) gets its own confirm button ("Atualizar
   * operação"), since it's editing one single already-existing operation on its own. 'stage' (a
   * batch being prepared before "Adicionar todos os operadores" — see renderConfigPanel) has no
   * per-card button at all — adding another to the batch and confirming the whole batch are both
   * controls shared across every staged card, rendered once by renderConfigPanel itself rather
   * than duplicated on each one.
   */
  function renderDraftCard(entry: OperationEntryState, mode: 'edit' | 'stage') {
    const kind = KINDS_BY_ID[entry.kindId];
    return (
      <DraftOperationCard
        name={entry.name}
        onNameChange={(name) => updateEntry(entry.id, { name })}
        canConfirm={kind.canConfirm(entry.fields)}
        confirmLabel={mode === 'edit' ? 'Atualizar operação' : undefined}
        onConfirm={mode === 'edit' ? () => confirmEdit(entry) : undefined}
      >
        {kind.renderDraftConfig({
          dataset,
          entryId: entry.id,
          fields: entry.fields,
          updateFields: (patch) => updateEntryFields(entry.id, patch),
          columnPick,
          onStartColumnPick,
          onFinishColumnPick,
          rangePick,
          onStartRangePick,
          onFinishRangePick,
        })}
      </DraftOperationCard>
    );
  }

  // Which sheet a confirmed entry's own highlight lives on — read off whichever highlight kind
  // it actually produces, since kinds don't expose a "sheetIndex" field directly (see
  // operationKind.ts). Always defined once an entry can be confirmed at all (both kinds require
  // a table to be picked before a column/range can be).
  function sheetIndexForEntry(entry: OperationEntryState): number | null {
    const kind = KINDS_BY_ID[entry.kindId];
    const [firstColumn] = kind.getColumnHighlights(entry.fields);
    if (firstColumn) return firstColumn.sheetIndex;
    const [firstRange] = kind.getRangeHighlights?.(entry.fields) ?? [];
    return firstRange ? firstRange.sheetIndex : null;
  }

  function revealEntry(entry: OperationEntryState) {
    setSelectedOperationId(entry.id);
    const sheetIndex = sheetIndexForEntry(entry);
    if (sheetIndex !== null) {
      onRevealInSheet(sheetIndex);
    }
  }

  function renderConfirmedCard(entry: OperationEntryState) {
    const kind = KINDS_BY_ID[entry.kindId];
    const isModelInputEligible = Boolean(kind.renderInputEditor) && getInputSource(entry.fields).type === 'literal';

    return (
      <ConfirmedOperationCard
        name={entry.name}
        kindLabel={labelForKind(entry.kindId)}
        summary={kind.renderSummary(entry.fields, dataset)}
        onEdit={() => editEntry(entry.id)}
        editDisabled={hasDraftInProgress}
        isEditMode={tool === 'select'}
        onMouseEnter={() => setHoveredOperationId(entry.id)}
        onMouseLeave={() => setHoveredOperationId((current) => (current === entry.id ? null : current))}
        isTested={(testSignals[entry.id] ?? 0) > 0}
        onTestUpToHere={() => runModelTest(entry.id)}
        onClearTest={() => clearChainTest(entry.id)}
        onReveal={() => revealEntry(entry)}
        isRevealEligible={sheetIndexForEntry(entry) !== null}
        isModelInput={modelInputIds.includes(entry.id)}
        isModelInputEligible={isModelInputEligible}
        onToggleModelInput={() => {
          const turningOn = !modelInputIds.includes(entry.id);
          onModelInputIdsChange(
            turningOn ? [...modelInputIds, entry.id] : modelInputIds.filter((id) => id !== entry.id),
          );
          // Clears whatever literal value was typed in while just testing this operation locally
          // (see ValueSourceField's disabled note) — otherwise that leftover value would still be
          // exported with the model and show up pre-filled the next time it's utilized, instead
          // of the blank field a caller is meant to fill in themselves (see ModelCard).
          if (turningOn) {
            updateEntryFields(entry.id, { input: literalSource('') });
          }
        }}
        isModelOutput={modelOutputIds.includes(entry.id)}
        onToggleModelOutput={() =>
          onModelOutputIdsChange(
            modelOutputIds.includes(entry.id) ? modelOutputIds.filter((id) => id !== entry.id) : [...modelOutputIds, entry.id],
          )
        }
        isModalOpen={modalEntryId === entry.id}
        onCloseModal={() => setModalEntryId((current) => (current === entry.id ? null : current))}
      >
        {kind.renderBody({
          fields: entry.fields,
          updateFields: (patch) => updateEntryFields(entry.id, patch),
          datasetId: dataset.datasetId,
          onMatchChange: (rowIndex) => setMatchedRows((current) => ({ ...current, [entry.id]: rowIndex })),
          resolvedInput: resolvedInputsByEntry[entry.id][0],
          resolvedInputs: resolvedInputsByEntry[entry.id],
          referenceOptions: referenceOptionsFor(entry.id),
          onResultChange: (value) => {
            setResults((current) => ({ ...current, [entry.id]: value }));
            // Only an actual value passing through counts as "data flowed" — onResultChange also
            // fires with null for every reset/no-op case (clearing an input, "Limpar teste",
            // opening "Editar", or just nothing resolved yet), which used to flash every edge
            // regardless, lighting up the whole canvas for reasons that had nothing to do with a
            // test actually running.
            if (value !== null) flashEdgesFrom(entry.id);
          },
          testSignal: testSignals[entry.id] ?? 0,
          resetSignal: resetSignals[entry.id] ?? 0,
        })}
      </ConfirmedOperationCard>
    );
  }

  // Building a new operation ("+ Adicionar operação") and editing an existing one (the pencil on
  // a confirmed node) both go through the same two steps: for a new operation, pick a kind first
  // (a small centered modal, see AddOperationModal); either way, the draft config itself (name,
  // table, columns/range, confirm/delete/cancel — the same DraftOperationCard rendered on the
  // canvas before this change) is hosted in a panel docked to the left, not on the canvas and not
  // a centered/blocking dialog — picking a column/range auto-opens the off-canvas sheet panel on
  // the right (see App.tsx), and a full-screen backdrop would sit on top of it, making the sheet
  // unreachable.
  function renderConfigPanel(): ReactNode {
    if (editingEntryId) {
      const editingEntry = entries.find((entry) => entry.id === editingEntryId);
      if (!editingEntry) return null;

      return (
        <div className="add-operation-panel" role="dialog" aria-modal="true" aria-labelledby="add-operation-panel-title">
          <div className="add-operation-panel__header">
            <h2 id="add-operation-panel-title" className="add-operation-panel__title">
              Editar operação
            </h2>
            <button
              type="button"
              className="add-operation-panel__close"
              onClick={() => cancelEntry(editingEntry.id)}
              aria-label="Cancelar"
            >
              ×
            </button>
          </div>
          <div className="add-operation-panel__body">{renderDraftCard(editingEntry, 'edit')}</div>
        </div>
      );
    }

    if (stagingEntryIds.length > 0) {
      // Same order they were added in (stagingEntryIds), not entries' own order — entries also
      // holds every already-confirmed operation, interleaved however addToStaging's own
      // current.length-based placement (see createEntry) happened to land them. A batch is always
      // a single kind — the kind picked to start it (see the fallback branch below) — so every
      // staged entry here shares stagingEntries[0]'s own kindId.
      const stagingEntries = stagingEntryIds
        .map((id) => entries.find((entry) => entry.id === id))
        .filter((entry): entry is OperationEntryState => entry !== undefined);
      const canConfirmAllStaged = stagingEntries.every((entry) => KINDS_BY_ID[entry.kindId].canConfirm(entry.fields));
      const stagingKindId = stagingEntries[0]?.kindId;

      return (
        <div className="add-operation-panel" role="dialog" aria-modal="true" aria-labelledby="add-operation-panel-title">
          <div className="add-operation-panel__header">
            <h2 id="add-operation-panel-title" className="add-operation-panel__title">
              {stagingKindId ? `Novas operações: ${labelForKind(stagingKindId)}` : 'Novas operações'}
            </h2>
            <button type="button" className="add-operation-panel__close" onClick={cancelStaging} aria-label="Cancelar">
              ×
            </button>
          </div>
          <div className="add-operation-panel__body">
            {/* Each staged card gets its own × to drop just that one from the batch (see
                removeFromStaging) — separate from the panel's own × above, which discards the
                whole batch. None of them have their own confirm button (see renderDraftCard's
                'stage' mode) — adding to the batch and confirming it are both shared across every
                staged card at once (the "+" right after them, and the footer below), not
                duplicated on each one. */}
            {stagingEntries.map((entry) => (
              <div key={entry.id} className="add-operation-panel__staged-card">
                <button
                  type="button"
                  className="add-operation-panel__staged-card-remove"
                  onClick={() => removeFromStaging(entry.id)}
                  aria-label="Remover esta operação do lote"
                  title="Remover esta operação do lote"
                >
                  ×
                </button>
                {renderDraftCard(entry, 'stage')}
              </div>
            ))}
            {/* Adds another of the same kind the batch was started with, right after the ones
                already chosen — a batch is always one kind (see stagingKindId above), so this
                skips the kind picker entirely rather than asking again for something already
                decided. */}
            {stagingKindId && (
              <button
                type="button"
                className="add-operation-panel__add-more"
                onClick={() => addToStaging(stagingKindId)}
                aria-label={`Adicionar outra operação ${labelForKind(stagingKindId)}`}
                title={`Adicionar outra operação ${labelForKind(stagingKindId)}`}
              >
                +
              </button>
            )}
          </div>
          <div className="add-operation-panel__footer">
            <button
              type="button"
              className="add-operation-panel__confirm-all"
              onClick={confirmAllStaged}
              disabled={!canConfirmAllStaged}
              title={canConfirmAllStaged ? undefined : 'Complete todas as operações antes de as adicionar.'}
            >
              {stagingEntries.length === 1 ? 'Adicionar operador' : `Adicionar ${stagingEntries.length} operadores`}
            </button>
          </div>
        </div>
      );
    }

    return (
      <AddOperationModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        kinds={KINDS.map((kind) => ({ id: kind.id, label: labelForKind(kind.id) }))}
        onPick={addToStaging}
      />
    );
  }

  // The pencil next to the plain-text model name — swaps it for the editable input, seeded with
  // whatever the name currently is.
  function startNameEdit() {
    setNameDraft(modelName);
    setIsEditingName(true);
  }

  // "✓" next to the model name input — commits nameDraft up to App.tsx and swaps back to plain
  // text.
  function confirmNameEdit() {
    onModelNameChange(nameDraft);
    setIsEditingName(false);
  }

  // "✗" next to the model name input — discards nameDraft (onModelNameChange was never called,
  // so nothing to undo there) and swaps back to plain text.
  function cancelNameEdit() {
    setNameDraft(modelName);
    setIsEditingName(false);
  }

  return (
    <div className="operation-canvas">
      <div className="operation-canvas__toolbar">
        {/* The model's own name + operation count — same line as "Importar teste"/"Testar
            modelo" (see .operation-canvas__toolbar-actions' own margin-left: auto, which pushes
            those to the opposite end of this same row) rather than a separate line above the
            canvas. */}
        <div className="operation-canvas__model-name-row">
          {isEditingName ? (
            <>
              <input
                ref={nameInputRef}
                type="text"
                className="operation-canvas__model-name-input"
                placeholder="Nome do modelo"
                value={nameDraft}
                // Grows/shrinks with the typed name itself, pixel-accurate (see nameInputWidth/
                // the mirror span just below) rather than sitting at one fixed width regardless
                // of how short or long the name is. Falls back to the CSS min-width for the one
                // frame before the mirror's first measurement lands.
                style={nameInputWidth !== null ? { width: nameInputWidth } : undefined}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') confirmNameEdit();
                  if (event.key === 'Escape') cancelNameEdit();
                }}
              />
              {/* Invisible, same font as the input — exists purely so nameInputWidth (see the
                  layout effect above) can measure how wide nameDraft actually renders, character
                  widths and all, instead of approximating via the input's own "size" attribute
                  (a plain character count, which for a proportional font leaves an uneven gap
                  between the text and the field's edge). Falls back to the placeholder text so
                  an empty field still measures out to something legible rather than collapsing. */}
              <span ref={nameMirrorRef} className="operation-canvas__model-name-mirror" aria-hidden="true">
                {nameDraft || 'Nome do modelo'}
              </span>
              <div className="operation-canvas__model-name-actions">
                <button
                  type="button"
                  className="operation-canvas__model-name-confirm"
                  onClick={confirmNameEdit}
                  aria-label="Confirmar nome"
                  title="Confirmar nome"
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="operation-canvas__model-name-cancel"
                  onClick={cancelNameEdit}
                  aria-label="Cancelar edição do nome"
                  title="Cancelar edição do nome"
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="operation-canvas__model-name-text">{modelName || 'Nome do modelo'}</span>
              <button
                type="button"
                className="operation-canvas__model-name-edit"
                onClick={startNameEdit}
                aria-label="Editar nome"
                title="Editar nome"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path
                    d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}
          <span
            className="operation-panel__count"
            title={confirmedCount === 1 ? '1 operação' : `${confirmedCount} operações`}
          >
            {confirmedCount}
          </span>
        </div>
        <div className="operation-canvas__toolbar-actions">
          {/* One button, not two: "Importar teste" for as long as there's nothing yet to clear,
              switching to "Limpar teste" the moment there is (a value typed by hand, one loaded
              via import, or an actual test run — see hasTested/hasAnyTestInputValue). This is the
              only place either lives — TestValuesModal (opened by "Testar modelo" below) is
              review-only, with no import/clear of its own. Only disabled in the one combination
              where "Importar teste" would be a dead click: nothing to clear yet *and* no
              designated input for it to import a value into in the first place. */}
          <button
            type="button"
            className="operation-canvas__reset-button"
            onClick={hasTested || hasAnyTestInputValue ? clearTest : triggerImportTest}
            disabled={!hasTested && !hasAnyTestInputValue && testInputEntries.length === 0}
            title={
              hasTested || hasAnyTestInputValue
                ? 'Limpa os resultados do último teste e os valores introduzidos nos inputs.'
                : testInputEntries.length === 0
                  ? 'O modelo não tem nenhum input definido.'
                  : 'Preenche os inputs a partir de um ficheiro JSON.'
            }
          >
            {hasTested || hasAnyTestInputValue ? 'Limpar teste' : 'Importar teste'}
          </button>
          <button
            type="button"
            className={
              testProgress
                ? 'operation-canvas__test-button operation-canvas__test-button--cancel'
                : 'operation-canvas__test-button'
            }
            // Opens TestValuesModal to review/adjust each designated input's value (already
            // filled in from whatever's currently set — typed on canvas, or loaded via the
            // toolbar's "Importar teste") before running, same as before; runs immediately if
            // there's nothing to review (no designated input at all). While a stagger's in
            // progress, this same button interrupts it instead — cancelPendingTestStagger just
            // stops whatever hasn't fired yet (already-dispatched requests still run to
            // completion; there's no cancelling those without an AbortController this app
            // doesn't otherwise need).
            onClick={() => {
              if (testProgress) {
                cancelPendingTestStagger();
              } else if (testInputEntries.length > 0) {
                openTestModal();
              } else {
                runModelTest();
              }
            }}
            disabled={confirmedCount === 0}
            title={
              testProgress
                ? `Interrompe o teste (${testProgress.done}/${testProgress.total}) — para de calcular as operações que ainda faltam.`
                : confirmedCount === 0
                  ? 'Conclua pelo menos uma operação para a poder testar.'
                  : testInputEntries.length > 0
                    ? 'Reveja os valores de cada input antes de correr o teste.'
                    : 'Calcula cada operação com os valores atuais.'
            }
          >
            {/* The progress fill lives on the button itself instead of a separate bar elsewhere
                on the canvas — one less element to place, and it's right where the user's
                attention already is (they just clicked this). Absolutely positioned under the
                label (z-index), growing left to right as testProgress advances. */}
            {testProgress && (
              <span
                className="operation-canvas__test-button-progress"
                style={{ width: `${(testProgress.done / testProgress.total) * 100}%` }}
              />
            )}
            <span className="operation-canvas__test-button-label">{testProgress ? 'Cancelar teste' : 'Testar modelo'}</span>
          </button>
          {/* Hidden — clicked programmatically by the toolbar's "Importar teste" button above
              (see triggerImportTest) rather than shown directly, so the button can carry its own
              label/icon instead of the browser's default file-input chrome. */}
          <input
            ref={testFileInputRef}
            type="file"
            accept="application/json"
            className="operation-canvas__test-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ''; // so re-importing the same file path fires onChange again
              if (file) loadTestCase(file);
            }}
          />
        </div>
      </div>

      {/* testLoadError has no toolbar display of its own — it's set by the toolbar's "Importar
          teste" (see loadTestCase) but only ever shown inside TestValuesModal (its own
          importError prop), which covers the whole canvas whenever it's open. */}
      {granularTestWarning && <p className="operation-canvas__test-load-error">{granularTestWarning}</p>}

      <div
        ref={viewportRef}
        className={[
          'operation-canvas__viewport',
          pan ? 'operation-canvas__viewport--panning' : '',
          tool === 'select' ? 'operation-canvas__viewport--editing' : '',
          tool === 'select' ? 'operation-canvas__viewport--select' : '',
          pendingPaste ? 'operation-canvas__viewport--placing' : '',
          // Nothing on the canvas — panning, dragging/editing a node, marquee-selecting — should
          // be touchable while a test is staggering through the model's operations: an edit
          // mid-test would leave a still-running test computing against fields that have since
          // changed underneath it.
          testProgress ? 'operation-canvas__viewport--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={testProgress ? undefined : handleViewportMouseDown}
        onClick={testProgress ? undefined : handleViewportClick}
        onWheel={testProgress ? undefined : handleViewportWheel}
        // Keeps the dotted grid (see OperationPanel.css) moving and scaling together with the
        // surface below, instead of staying fixed to the viewport while the nodes on it pan/zoom
        // past — its phase follows the same unscaled viewOffset the surface's own translate uses
        // (see the surface's transform below), and its dot spacing scales by the same zoom.
        style={{
          backgroundPosition: `${viewOffset.x}px ${viewOffset.y}px`,
          backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
        }}
      >
        {/* Floats over the canvas itself (a sibling of the surface below, so it sits outside that
            element's pan/zoom transform and stays put on screen regardless of either) rather than
            living in the toolbar above — same reasoning as the progress fill on "Testar modelo":
            these are canvas-manipulation controls, so they stay in view right where the canvas
            itself is. Split into two groups by what they're controls *over* rather than one big
            row — zoom and "Desfazer"/"Refazer" (view/history, pinned to the viewport's own
            top-left corner) from "+ Adicionar operação"/"Copiar"/"Colar"/"Eliminar"/
            "Cancelar seleção"/"Editar" (the operations themselves, top-right). Each group's own
            mousedown stops propagation before reaching the viewport's (which would otherwise
            start a pan/marquee-select right under the click); handleViewportClick also excludes
            both by their shared class, the same way it already does for a node. */}
        <div
          className="operation-canvas__floating-toolbar operation-canvas__floating-toolbar--left"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="operation-canvas__zoom-controls">
            <button
              type="button"
              className="operation-canvas__zoom-button"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              title="Diminuir zoom"
              aria-label="Diminuir zoom"
            >
              −
            </button>
            <button
              type="button"
              className="operation-canvas__zoom-level"
              onClick={() => zoomBy(1 / zoom)}
              disabled={zoom === 1}
              title="Repor zoom para 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="operation-canvas__zoom-button"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
            >
              +
            </button>
          </div>

          {/* "Desfazer"/"Refazer": step back/forward through this "Editar" session's own history
              (see editHistory/undoEditMode/redoEditMode) — kept with zoom rather than the
              create/select/copy/paste/delete cluster on the right: both this and zoom are "meta"
              controls over the canvas' view/history, not actions on the operations themselves.
              Always rendered while editing, each disabled at whichever end of the history it's
              already at (nothing before the first step, nothing past the last), same "show
              always, disable when there's nothing to do" treatment as "Colar"/"Cancelar seleção"
              get. Also disabled while a draft's in progress (a staged batch, or a single
              operation reopened via its own pencil) — every committed step is a fully-confirmed
              state (see the history effect's own guard), so jumping to one mid-edit would just
              discard whatever's unconfirmed right now. */}
          {tool === 'select' && editHistory && (
            <>
              <button
                type="button"
                className="operation-canvas__tool-button"
                onClick={undoEditMode}
                disabled={editHistory.index <= 0 || hasDraftInProgress}
                aria-label="Desfazer"
                title="Desfazer"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M7 7 3 11l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 11h11a6 6 0 1 1 0 12h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="operation-canvas__tool-button"
                onClick={redoEditMode}
                disabled={editHistory.index >= editHistory.steps.length - 1 || hasDraftInProgress}
                aria-label="Refazer"
                title="Refazer"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M17 7l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 11H10a6 6 0 1 0 0 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
        </div>

        <div
          className="operation-canvas__floating-toolbar operation-canvas__floating-toolbar--right"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {/* "+ Adicionar operação": only rendered in "Editar" mode now — a new operation needs
              to be placed/wired up on the canvas, the same as any other change here, so outside
              "Editar" there's nothing for it to do. Filled/primary-colored (see
              .operation-canvas__tool-button--primary) rather than the plain bordered pill every
              other button here gets — it's this row's main action, the one that starts something
              new rather than acting on what's already there. Its own divider (see
              .operation-canvas__tool-divider) separates it from the selection/clipboard cluster
              just after it — different concerns (creating something new vs. acting on what's
              already selected), both only reachable in "Editar" but not otherwise related. */}
          {tool === 'select' && (
            <>
              <button
                type="button"
                className="operation-canvas__tool-button operation-canvas__tool-button--primary"
                onClick={() => setIsAddModalOpen(true)}
                disabled={hasDraftInProgress}
                title={hasDraftInProgress ? 'Termine a operação em curso antes de criar outra.' : undefined}
              >
                + Adicionar operação
              </button>
              <span className="operation-canvas__tool-divider" />
            </>
          )}

          {/* Copying/moving/pasting operations, only rendered while "Editar" is actually on,
              since that's the only mode any of this has something to do — plain siblings of
              "Editar" in this same flex row rather than a wrapped-up flyout panel, so they come
              out sized identically to it. Rendered before "Editar" in DOM order so they appear to
              its left, with its own divider right after them separating this cluster from
              "Editar"/"Guardar"/"Cancelar" (acting on the current selection/clipboard vs. ending
              the whole session). Every button here is text, not an icon — same convention as
              "Editar" and the rest of this row, rather than singling three of them out (copy/
              paste/trash glyphs aren't universal enough here to carry meaning on their own
              without a label anyway). All four are always rendered, disabled rather than hidden
              when there's nothing for them to act on yet ("Colar" while the clipboard's empty,
              the rest while nothing's selected). There's no separate "Selecionar" toggle any
              more — selecting is just what "Editar" itself does throughout: a plain click on a
              node selects it, shift/ctrl/cmd-click adds/removes it, and a drag over the
              background marquee-selects a range (see onNodeClick/handleViewportMouseDown). */}
          {tool === 'select' && (
            <>
              <button
                type="button"
                className="operation-canvas__tool-button"
                onClick={copySelection}
                disabled={!hasSelection}
                title={hasSelection ? undefined : 'Selecione uma ou mais operações primeiro.'}
              >
                Copiar
              </button>
              <button
                type="button"
                className={
                  pendingPaste
                    ? 'operation-canvas__tool-button operation-canvas__tool-button--active'
                    : 'operation-canvas__tool-button'
                }
                onClick={() => setPendingPaste((current) => !current)}
                disabled={!hasClipboard}
                title={
                  !hasClipboard
                    ? 'Copie uma ou mais operações primeiro.'
                    : pendingPaste
                      ? 'Clique no canvas para colar aqui — ou clique de novo aqui para cancelar.'
                      : 'Cola as operações copiadas onde clicar no canvas.'
                }
              >
                {pendingPaste ? 'Clique no canvas para colar…' : 'Colar'}
              </button>
              <button
                type="button"
                className="operation-canvas__tool-button operation-canvas__tool-button--danger"
                onClick={deleteSelection}
                disabled={!hasSelection}
                title={hasSelection ? undefined : 'Selecione uma ou mais operações primeiro.'}
              >
                Eliminar
              </button>
              <button
                type="button"
                className="operation-canvas__tool-button"
                onClick={() => setSelectedIds([])}
                disabled={!hasSelection}
                title={hasSelection ? undefined : 'Selecione uma ou mais operações primeiro.'}
              >
                {hasSelection ? `Cancelar seleção (${selectedIds.length})` : 'Cancelar seleção'}
              </button>
              <span className="operation-canvas__tool-divider" />
            </>
          )}

          {/* "Editar"/"A editar": the only state operations can actually be dragged to a new
              position in (see the onDragEntry passed to useCanvasViewport below, which drops
              every drag report while this is off) — outside it, a node click still opens its
              detail modal (see onNodeClick), but nothing on the canvas can be repositioned by
              accident while just panning around. Stays this same pencil for as long as nothing's
              actually changed yet (hasEditModeChanges false) — active-styled and relabeled "A
              editar" once "Editar" is actually on, so the color change (not just the label)
              carries over from before this button could also read "Editar" while already
              editing; clicking it then just leaves "Editar" outright (exitEditMode), nothing to
              commit or discard either way. Once something has changed, this becomes
              "Guardar"/"Cancelar" instead (see just below) — an explicit commit-or-discard so a
              whole editing session (every move/copy/paste/delete made while it was on) can be
              undone at once rather than only one drag at a time. */}
          {!hasEditModeChanges && (
            <button
              type="button"
              className={
                tool === 'select'
                  ? 'operation-canvas__tool-button operation-canvas__tool-button--active'
                  : 'operation-canvas__tool-button'
              }
              onClick={tool === 'select' ? exitEditMode : enterEditMode}
              title={
                tool === 'select'
                  ? 'Sai do modo de edição (nada foi alterado ainda).'
                  : 'Ativa o modo de edição: mover operações no canvas.'
              }
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {tool === 'select' ? 'A editar' : 'Editar'}
            </button>
          )}

          {/* "Cancelar"/"Guardar": only once something's actually changed (see hasEditModeChanges
              above) — "Cancelar" restores editModeSnapshot (every entry as it looked the
              moment "Editar" turned on, via cancelEditMode), "Guardar" just leaves things as they
              are (via exitEditMode) and keeps whatever changed. Same relationship
              DraftOperationCard's own ×/"Atualizar operação" has for a single operation's fields,
              just scoped to the whole editing session instead of one operation's config. */}
          {hasEditModeChanges && (
            <>
              <button type="button" className="operation-canvas__tool-button" onClick={cancelEditMode} title="Descarta tudo o que mudou neste modo de edição.">
                Cancelar
              </button>
              <button
                type="button"
                className="operation-canvas__tool-button operation-canvas__tool-button--active"
                onClick={exitEditMode}
                title="Guarda as alterações e sai do modo de edição."
              >
                Guardar
              </button>
            </>
          )}
        </div>

        <div
          className="operation-canvas__surface"
          // translate() is applied in real screen pixels, outside the scale — panning always
          // tracks the cursor 1:1 regardless of zoom (see zoomBy's own comment for why scale
          // needs a transform-origin of 0 0, set in CSS, to keep its math this simple).
          style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${zoom})` }}
        >
          <svg className="operation-canvas__edges">
            {edges.map((edge, index) => (
              <path
                key={`${edge.fromId}-${edge.toId}-${index}`}
                className={activeEdgeKeys.has(`${edge.fromId}-${edge.toId}`) ? 'operation-canvas__edges-path--active' : undefined}
                d={edgePath(edge)}
              />
            ))}
          </svg>

          {entries.map((entry) => {
            // Staged as part of a new-operation batch, in the config panel right now (see
            // renderConfigPanel) — nothing to show on the canvas yet for one of these: no
            // established position of its own until confirmAllStaged actually adds it. An entry
            // reopened for editing (editingEntryId) is different — it already has a position and
            // edges other operations rely on, so unlike staging it stays fully visible here (see
            // the render below, which treats it as confirmed regardless of its own momentarily
            // false entry.confirmed — editEntry flips that off only to reuse the same draft-field
            // UI in the docked panel, not to pull the card off the canvas).
            if (stagingEntryIds.includes(entry.id)) return null;

            return (
              <div
                key={entry.id}
                ref={(el) => {
                  nodeRefs.current[entry.id] = el;
                }}
                className={
                  selectedIds.includes(entry.id) ? 'operation-canvas__node operation-canvas__node--selected' : 'operation-canvas__node'
                }
                style={{ left: entry.position.x, top: entry.position.y, width: NODE_WIDTH, zIndex: nodeZIndex[entry.id] }}
                onMouseDown={beginNodeDrag(entry)}
              >
                {/* entry.id === editingEntryId is the only way an unconfirmed entry ever reaches
                    here (every staged one was already filtered out above) — rendered the same as
                    a confirmed card (see the comment on the filter above) rather than
                    renderDraftCard's 'stage' mode, which is for a staged batch's own layout, not
                    an existing card reopened for editing. */}
                {entry.confirmed || entry.id === editingEntryId ? renderConfirmedCard(entry) : renderDraftCard(entry, 'stage')}
              </div>
            );
          })}
        </div>
      </div>

      {marqueeRect && (
        <div
          className="operation-canvas__marquee"
          style={{ left: marqueeRect.left, top: marqueeRect.top, width: marqueeRect.width, height: marqueeRect.height }}
        />
      )}

      {renderConfigPanel()}

      <TestValuesModal
        open={isTestModalOpen}
        onClose={() => {
          setIsTestModalOpen(false);
          setGranularTestWarning(null);
        }}
        inputs={testInputEntries}
        onChangeValue={updateTestValue}
        onRun={runTestFromModal}
        warning={granularTestWarning}
        importError={testLoadError}
      />
    </div>
  );
}
