import {
  ChevronDown as LucideChevronDown,
  ChevronRight as LucideChevronRight,
  ChevronUp as LucideChevronUp,
  ChevronsDown as LucideChevronsDown,
  ChevronsLeft as LucideChevronsLeft,
  ChevronsUp as LucideChevronsUp,
  Download,
  Eye,
  FolderOpen,
  LayoutGrid,
  List,
  Moon,
  Pencil,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Store,
  Sun,
  Table2,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The app's only icon set: Lucide line icons, all drawn with the same stroke so every screen looks
 * alike. Each icon is sized and colored by whatever holds it (1em box, currentColor); the ones that
 * sit inside text buttons also get `button-icon` (spacing from the label).
 */
const STROKE_WIDTH = 2;

interface IconProps {
  className?: string;
}

function make(Icon: LucideIcon, baseClass?: string) {
  return function AppIcon({ className }: IconProps) {
    const classes = [baseClass, className].filter(Boolean).join(' ');
    return <Icon strokeWidth={STROKE_WIDTH} className={classes || undefined} aria-hidden="true" />;
  };
}

/** Tray with an arrow into it — "Carregar". */
export const LoadIcon = make(Download, 'button-icon');
/** Tray with an arrow out of it — "Guardar". */
export const SaveIcon = make(Upload, 'button-icon');
/** Cross — "Limpar", removing a row. */
export const ClearIcon = make(X, 'button-icon');
/** Floppy disk — saving the model itself ("Guardar modelo"). */
export const DiskIcon = make(Save, 'button-icon');
/** Table grid — looking at the dataset ("Ver dados"). */
export const SpreadsheetIcon = make(Table2, 'button-icon');
/** Lightning bolt — running a test ("Testar modelo"). */
export const BoltIcon = make(Zap, 'button-icon');
/** Pencil — editing ("Editar"). */
export const PencilIcon = make(Pencil, 'button-icon');
/** Open folder — opening something ("Abrir"). */
export const FolderIcon = make(FolderOpen, 'button-icon');
/** Bin — deleting ("Apagar"). */
export const TrashIcon = make(Trash2, 'button-icon');
/** Plus — adding something. */
export const PlusIcon = make(Plus, 'button-icon');

/** Eye — seeing the full thing. */
export const EyeIcon = make(Eye);
/** Cross for icon-only buttons (no label spacing). */
export const CloseIcon = make(X);
export const ChevronDownIcon = make(LucideChevronDown);
export const ChevronUpIcon = make(LucideChevronUp);
export const ChevronRightIcon = make(LucideChevronRight);
export const ChevronsLeftIcon = make(LucideChevronsLeft);
export const ChevronsUpIcon = make(LucideChevronsUp);
export const ChevronsDownIcon = make(LucideChevronsDown);
export const UndoIcon = make(Undo2);
export const RedoIcon = make(Redo2);
export const PlayIcon = make(Play);
export const StopIcon = make(Square);
export const GridIcon = make(LayoutGrid);
export const ListIcon = make(List);
export const SunIcon = make(Sun);
export const MoonIcon = make(Moon);
/** Shop front — browsing the saved models. */
export const StoreIcon = make(Store);
/** Arrow into a tray, for the dropzones. */
export const UploadIcon = make(Upload);
export const FolderOpenIcon = make(FolderOpen);
