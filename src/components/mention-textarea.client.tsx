'use client';

import { useCallback, useRef, useState } from 'react';

export interface MentionMember {
  user_id: number;
  name:    string;
}

// Derive the mentioned user ids from a finished comment body by matching each
// member's exact "@Name" token. Robust to names with spaces and to edits/
// deletions (we re-scan the final text rather than tracking a separate set).
export function extractMentionedIds(body: string, members: MentionMember[]): number[] {
  const ids = new Set<number>();
  for (const m of members) {
    if (m.name && body.includes(`@${m.name}`)) ids.add(m.user_id);
  }
  return [...ids];
}

/**
 * Textarea with an inline @mention autocomplete over the supplied members.
 * Typing "@" after whitespace opens a filtered list; selecting inserts
 * "@Name ". Cmd/Ctrl+Enter triggers `onSubmitShortcut`.
 */
export function MentionTextarea({
  value, onChange, members, placeholder, rows = 3, className, onSubmitShortcut,
}: {
  value: string;
  onChange: (v: string) => void;
  members: MentionMember[];
  placeholder?: string;
  rows?: number;
  className?: string;
  onSubmitShortcut?: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen]             = useState(false);
  const [query, setQuery]           = useState('');
  const [tokenStart, setTokenStart] = useState<number | null>(null);
  const [activeIdx, setActiveIdx]   = useState(0);

  const matches = open
    ? members.filter(m => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  const detect = useCallback((text: string, caret: number) => {
    const upto = text.slice(0, caret);
    const at = upto.lastIndexOf('@');
    if (at === -1) { setOpen(false); setTokenStart(null); return; }

    // The char before '@' must be start-of-text or whitespace (so emails like
    // foo@bar don't trigger it).
    const before = at === 0 ? '' : upto[at - 1];
    if (before && !/\s/.test(before)) { setOpen(false); setTokenStart(null); return; }

    const between = upto.slice(at + 1);
    if (between.includes('\n') || between.length > 40) { setOpen(false); setTokenStart(null); return; }

    setQuery(between);
    setTokenStart(at);
    setActiveIdx(0);
    setOpen(true);
  }, []);

  function insert(member: MentionMember) {
    const ta = taRef.current;
    if (!ta || tokenStart == null) return;
    const caret = ta.selectionStart ?? value.length;
    const head = value.slice(0, tokenStart);
    const tail = value.slice(caret);
    const inserted = `@${member.name} `;
    onChange(head + inserted + tail);
    setOpen(false);
    setTokenStart(null);
    const pos = (head + inserted).length;
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos); });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % matches.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert(matches[activeIdx]); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setOpen(false); setTokenStart(null); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onSubmitShortcut) {
      e.preventDefault();
      onSubmitShortcut();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        className={className}
        onChange={e => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => { /* delay close handled via mousedown preventDefault */ }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 bottom-full z-50 mb-1 max-h-56 w-64 overflow-auto rounded-lg border border-(--rs-neutral-grey-200) bg-white py-1 shadow-lg">
          {matches.map((m, i) => (
            <li key={m.user_id}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); insert(m); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  i === activeIdx
                    ? 'bg-(--rs-primary-50) text-(--rs-primary-700)'
                    : 'text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50)'
                }`}
              >
                <span className="font-medium">@{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
