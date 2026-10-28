import type { CategoryNode } from '../../types/category';

interface CategorySelectProps {
  tree: CategoryNode[];
  /** The chosen folder's id, or null for none. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** What the "no folder" option says; leave out to offer only folders. */
  noneLabel?: string;
  id?: string;
  className?: string;
}

/** A select of the folders, each one's subfolders under it, indented by level and named by their whole path. */
export function CategorySelect({ tree, value, onChange, noneLabel, id, className = 'modal__input' }: CategorySelectProps) {
  function options(nodes: CategoryNode[], parents: string[]): React.ReactNode[] {
    return nodes.flatMap((node) => {
      const path = [...parents, node.name];
      return [
        <option key={node.id} value={node.id}>
          {'\u00a0\u00a0\u00a0'.repeat(path.length - 1)}
          {path.join(' › ')}
        </option>,
        ...options(node.children, path),
      ];
    });
  }

  return (
    <select id={id} className={className} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
      {noneLabel !== undefined && <option value="">{noneLabel}</option>}
      {options(tree, [])}
    </select>
  );
}
