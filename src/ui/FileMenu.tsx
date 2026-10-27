import { useEffect, useRef, useState } from 'react';
import { Icon } from './shared';

/**
 * File menu in the header: New, Open, Save, Import and Export project. It opens on hover or click
 * and closes on Esc, an outside click, leaving it after a hover, or choosing an item. The menu stays
 * mounted while closed so the import file input always exists.
 */
export function FileMenu({
  onNew,
  onOpen,
  onTutorial,
  onSave,
  onImport,
  onExport,
}: {
  onNew: () => void;
  onOpen: () => void;
  onTutorial: () => void;
  onSave: () => void;
  onImport: (file: File | undefined) => void;
  onExport: () => void;
}) {
  // `pinned`: opened by click or keyboard, so it stays open until dismissed.
  const [open, setOpen] = useState<'closed' | 'hover' | 'pinned'>('closed');
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => {
    if (open === 'closed') return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen('closed');
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen('closed');
        root.current?.querySelector<HTMLButtonElement>('.file-menu-button')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  useEffect(() => cancelClose, []);
  const choose = (action: () => void) => () => {
    setOpen('closed');
    action();
  };
  const isOpen = open !== 'closed';
  return (
    <div
      className={`file-menu ${isOpen ? 'open' : ''}`}
      ref={root}
      onMouseEnter={() => {
        cancelClose();
        if (open === 'closed') setOpen('hover');
      }}
      onMouseLeave={() => {
        if (open !== 'hover') return;
        cancelClose();
        closeTimer.current = setTimeout(() => setOpen('closed'), 250);
      }}
    >
      <button
        className="file-menu-button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="file-menu-items"
        onClick={() => setOpen(open === 'pinned' ? 'closed' : 'pinned')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen('pinned');
            requestAnimationFrame(() =>
              root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(),
            );
          }
        }}
      >
        File
        <Icon name="chevron" size={13} />
      </button>
      <div
        className="file-menu-items"
        id="file-menu-items"
        role="menu"
        aria-label="File"
        hidden={!isOpen}
        onKeyDown={(e) => {
          const items = [
            ...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
          ];
          const i = items.indexOf(document.activeElement as HTMLElement);
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
          }
        }}
      >
        <button role="menuitem" onClick={choose(onNew)}>
          <Icon name="plus" size={16} />
          New
        </button>
        <button role="menuitem" onClick={choose(onOpen)}>
          <Icon name="folder" size={16} />
          Open
        </button>
        <button role="menuitem" onClick={choose(onTutorial)}>
          <Icon name="cube" size={16} />
          Tutorial rack
        </button>
        <button role="menuitem" onClick={choose(onSave)}>
          <Icon name="save" size={16} />
          Save
          <kbd aria-hidden="true">Ctrl+S</kbd>
        </button>
        <span className="file-menu-divider" role="separator" />
        <label
          role="menuitem"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.currentTarget.querySelector('input')?.click();
            }
          }}
        >
          <Icon name="upload" size={16} />
          Import
          <input
            aria-label="Import project JSON"
            type="file"
            hidden
            accept="application/json,.json"
            onChange={(e) => {
              setOpen('closed');
              onImport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <button role="menuitem" onClick={choose(onExport)}>
          <Icon name="download" size={16} />
          Export project
        </button>
      </div>
    </div>
  );
}
