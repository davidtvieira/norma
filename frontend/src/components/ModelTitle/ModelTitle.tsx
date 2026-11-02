import type { ReactNode } from 'react';
import type { FolderStep } from '../../hooks/useNormaFolderPath';
import './ModelTitle.css';

interface ModelTitleProps {
  name: string;
  /** The folders the norma is kept under, top-most first — only to tell where the file comes from. Null or empty: nothing is shown. */
  folderPath: FolderStep[] | null;
  /** Something small after the name (the editor's operation count). */
  suffix?: ReactNode;
}

/**
 * The model's name as the page's title and, under it, a quiet line saying which folder the norma is kept in
 * ("Pasta / Subpasta"). That line is context, not navigation: it has no links, no trail leading into the title.
 */
export function ModelTitle({ name, folderPath, suffix }: ModelTitleProps) {
  const location = folderPath && folderPath.length > 0 ? folderPath.map((step) => step.name).join(' / ') : null;
  return (
    <div className="model-title">
      <div className="model-title__row">
        <h1 className="model-title__name" title={name}>
          {name || 'Modelo sem nome'}
        </h1>
        {suffix}
      </div>
      {location && (
        <p className="model-title__location" title={`Guardada em ${location}`}>
          {location}
        </p>
      )}
    </div>
  );
}
