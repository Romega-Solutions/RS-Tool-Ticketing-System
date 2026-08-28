'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontSize } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Smile,
} from 'lucide-react';

// Shared WYSIWYG editor, generalized from the recruiting job-description editor.
// StarterKit (v3) already bundles Underline/Bold/Italic/Strike/lists, so
// `toggleUnderline()` works without registering @tiptap/extension-underline
// separately (doing so would only trigger a duplicate-extension warning).
//
// Output is HTML. Callers either:
//   • read it from a hidden `<input name>` (FormData flow — the recruiting JD), or
//   • drive it controlled via `value` + `onChange` (task description / comments).
// The HTML is sanitized server-side on write and again at render by <RichText>.

export interface RichTextMentionUser {
  id: number;
  name: string;
}

export interface RichTextEditorProps {
  /** When set, renders a hidden input mirroring the HTML for FormData submits. */
  name?: string;
  /** Controlled value (HTML). When provided, external changes sync into the editor. */
  value?: string;
  /** Initial content when uncontrolled. */
  defaultValue?: string | null;
  /** Fired with the editor HTML on every change. */
  onChange?: (html: string) => void;
  placeholder?: string;
  /** Applied to the scroll container around the editor body (height caps, etc.). */
  bodyClassName?: string;
  /** Enables the @mention autocomplete (structured nodes carrying the user id). */
  enableMentions?: boolean;
  mentionUsers?: RichTextMentionUser[];
  /** Adds an emoji-picker button to the toolbar. */
  enableEmoji?: boolean;
}

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 96;

// Lightweight curated set — no heavy emoji extension/asset pack.
const EMOJIS = [
  '😀', '😄', '😁', '😂', '🙂', '😉', '😊', '😍', '😎', '🤔',
  '👍', '👎', '🙌', '👏', '🙏', '🔥', '🎉', '✅', '❌', '⚠️',
  '💡', '📌', '🚀', '❤️', '💯', '👀', '🥳', '😅', '🤝', '⭐',
];

function ToolbarButton({
  onClick, active, disabled, label, buttonRef, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
        active
          ? 'bg-(--rs-primary-100) text-(--rs-primary-700)'
          : 'text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-100)'
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, trailing }: { editor: Editor | null; trailing?: React.ReactNode }) {
  if (!editor) return null;
  const currentSize =
    (editor.getAttributes('textStyle').fontSize as string | undefined) ?? '';
  const currentSizeInt = currentSize ? parseInt(currentSize, 10) : NaN;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-2 py-1.5">
      <ToolbarButton label="Bold"          active={editor.isActive('bold')}      onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="Italic"        active={editor.isActive('italic')}    onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="Underline"     active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive('strike')}    onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarButton>

      <span className="mx-1 h-5 w-px bg-(--rs-neutral-grey-200)" />

      <ToolbarButton label="Bullet list"   active={editor.isActive('bulletList')}  onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>

      <span className="mx-1 h-5 w-px bg-(--rs-neutral-grey-200)" />

      <input
        type="number"
        inputMode="numeric"
        aria-label="Font size (px)"
        title="Font size (px)"
        placeholder="16"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step={1}
        value={Number.isNaN(currentSizeInt) ? '' : currentSizeInt}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) { editor.chain().focus().unsetFontSize().run(); return; }
          const n = Math.trunc(Number(raw));
          if (!Number.isFinite(n)) return;
          const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, n));
          editor.chain().focus().setFontSize(`${clamped}px`).run();
        }}
        className="h-8 w-14 rounded-md border border-(--rs-neutral-grey-200) bg-white px-2 text-xs text-(--rs-neutral-grey-700) focus:border-(--rs-primary-300) focus:outline-none"
      />

      {trailing}
    </div>
  );
}

// Treat Tiptap's empty document ("<p></p>") the same as "".
function normalizeHtml(s: string): string {
  return s.trim() === '' || s.trim() === '<p></p>' ? '' : s;
}

interface MentionMenuState {
  open: boolean;
  items: RichTextMentionUser[];
  index: number;
  command: ((attrs: { id: string; label: string }) => void) | null;
  rect: DOMRect | null;
}

const EMPTY_MENU: MentionMenuState = { open: false, items: [], index: 0, command: null, rect: null };

export function RichTextEditor({
  name,
  value,
  defaultValue,
  onChange,
  placeholder,
  bodyClassName,
  enableMentions = false,
  mentionUsers = [],
  enableEmoji = false,
}: RichTextEditorProps) {
  const initial = value ?? defaultValue ?? '';
  const [html, setHtml] = useState(initial);
  const [, force] = useReducer((x: number) => x + 1, 0);

  // Keep the latest mention list reachable from the (once-created) suggestion
  // closure without recreating the editor when `mentionUsers` identity changes.
  const mentionUsersRef = useRef<RichTextMentionUser[]>(mentionUsers);
  useEffect(() => { mentionUsersRef.current = mentionUsers; }, [mentionUsers]);

  // Mention autocomplete popup, bridged from the Tiptap suggestion plugin.
  // `menu` drives rendering; `menuRef` mirrors it for the imperative suggestion
  // callbacks (created once, run outside React's render via DOM events).
  const [menu, setMenu] = useState<MentionMenuState>(EMPTY_MENU);
  const menuRef = useRef<MentionMenuState>(EMPTY_MENU);
  const updateMenu = (next: MentionMenuState) => { menuRef.current = next; setMenu(next); };

  // Emoji picker.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPos, setEmojiPos] = useState<React.CSSProperties | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  // Read through the ref (deferred to suggestion event time, never render).
  function getMentionItems(query: string): RichTextMentionUser[] {
    return mentionUsersRef.current
      .filter(u => u.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 6);
  }

  function openMenu(props: { items: RichTextMentionUser[]; command: (a: { id: string; label: string }) => void; clientRect?: (() => DOMRect | null) | null }) {
    updateMenu({
      open: true,
      items: props.items,
      index: 0,
      command: props.command,
      rect: props.clientRect?.() ?? null,
    });
  }
  function closeMenu() {
    if (!menuRef.current.open) return;
    updateMenu({ ...menuRef.current, open: false });
  }
  function selectMention(i: number) {
    const st = menuRef.current;
    const item = st.items[i];
    if (item && st.command) st.command({ id: String(item.id), label: item.name });
    closeMenu();
  }
  function handleMenuKeyDown({ event }: { event: KeyboardEvent }): boolean {
    const st = menuRef.current;
    if (!st.open || st.items.length === 0) return false;
    if (event.key === 'ArrowDown') { updateMenu({ ...st, index: (st.index + 1) % st.items.length }); return true; }
    if (event.key === 'ArrowUp')   { updateMenu({ ...st, index: (st.index - 1 + st.items.length) % st.items.length }); return true; }
    if (event.key === 'Enter' || event.key === 'Tab') { selectMention(st.index); return true; }
    if (event.key === 'Escape') { closeMenu(); return true; }
    return false;
  }
  function toggleEmoji() {
    if (emojiOpen) { setEmojiOpen(false); return; }
    setEmojiPos(emojiPopoverStyle(emojiBtnRef.current));
    setEmojiOpen(true);
  }

  const extensions: Extensions = [
    StarterKit,
    TextStyle,
    FontSize,
    Placeholder.configure({ placeholder: placeholder ?? 'Write something…' }),
  ];
  if (enableMentions) {
    // The suggestion handlers (items/render) read `mentionUsersRef` and `menuRef`
    // only at ProseMirror event time — never during React render — so the
    // refs-during-render rule is a false positive here.
    // eslint-disable-next-line react-hooks/refs
    extensions.push(Mention.configure({
      HTMLAttributes: { class: 'rs-mention' },
      suggestion: {
        char: '@',
        items: ({ query }: { query: string }) => getMentionItems(query),
        render: () => ({
          onStart: openMenu,
          onUpdate: openMenu,
          onKeyDown: handleMenuKeyDown,
          onExit: closeMenu,
        }),
      },
    }));
  }

  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch in Next
    extensions,
    content: initial,
    editorProps: {
      attributes: { class: 'rs-richtext px-4 py-3 text-sm text-(--rs-neutral-grey-800)' },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      setHtml(next);
      onChange?.(next);
    },
  });

  // Re-render the toolbar so active-mark highlighting tracks the selection.
  useEffect(() => {
    if (!editor) return;
    const update = () => force();
    editor.on('transaction', update);
    return () => { editor.off('transaction', update); };
  }, [editor]);

  // Controlled sync: when the parent's value changes out-of-band (task switch,
  // clearing the comment box after posting), push it into the editor.
  useEffect(() => {
    if (!editor || value === undefined) return;
    if (normalizeHtml(value) !== normalizeHtml(editor.getHTML())) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div>
      <div className="rs-richtext-editor flex flex-col overflow-hidden rounded-xl border border-(--rs-neutral-grey-200) bg-white focus-within:border-(--rs-primary-300) focus-within:ring-4 focus-within:ring-(--rs-primary-100)">
        <Toolbar
          editor={editor}
          trailing={enableEmoji ? (
            <>
              <span className="mx-1 h-5 w-px bg-(--rs-neutral-grey-200)" />
              <ToolbarButton
                label="Insert emoji"
                active={emojiOpen}
                buttonRef={emojiBtnRef}
                onClick={toggleEmoji}
              >
                <Smile className="h-4 w-4" />
              </ToolbarButton>
            </>
          ) : null}
        />
        <div className={bodyClassName ?? ''}>
          <EditorContent editor={editor} />
        </div>
      </div>
      {name !== undefined && <input type="hidden" name={name} value={html} />}

      {/* Mention autocomplete — portal + fixed position so the task sheet's
          overflow can't clip it. Sits above the caret (comment boxes are low). */}
      {enableMentions && menu.open && menu.rect && menu.items.length > 0 && editor && typeof document !== 'undefined' &&
        createPortal(
          <ul
            style={{
              position: 'fixed',
              left: Math.max(8, Math.min(menu.rect.left, window.innerWidth - 264)),
              bottom: window.innerHeight - menu.rect.top + 6,
              zIndex: 1000,
            }}
            className="max-h-56 w-64 overflow-auto rounded-lg border border-(--rs-neutral-grey-200) bg-white py-1 shadow-lg"
          >
            {menu.items.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); selectMention(i); }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    i === menu.index
                      ? 'bg-(--rs-primary-50) text-(--rs-primary-700)'
                      : 'text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50)'
                  }`}
                >
                  <span className="font-medium">@{m.name}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}

      {/* Emoji picker — portal + fixed position, anchored to its toolbar button. */}
      {enableEmoji && emojiOpen && emojiPos && editor && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onMouseDown={() => setEmojiOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Emoji picker"
            style={emojiPos}
            className="z-[1000] w-60 rounded-lg border border-(--rs-neutral-grey-200) bg-white p-2 shadow-lg"
          >
            <div className="grid grid-cols-6 gap-1">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  type="button"
                  onMouseDown={ev => {
                    ev.preventDefault();
                    editor.chain().focus().insertContent(e).run();
                    setEmojiOpen(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-(--rs-neutral-grey-100)"
                  aria-label={`Insert ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function emojiPopoverStyle(btn: HTMLElement | null): React.CSSProperties {
  if (!btn || typeof window === 'undefined') return { position: 'fixed', left: 8, top: 8 };
  const r = btn.getBoundingClientRect();
  const width = 240;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  // Prefer below the button; flip above when there isn't room.
  const below = r.bottom + 6;
  const wouldOverflow = below + 220 > window.innerHeight;
  return wouldOverflow
    ? { position: 'fixed', left, bottom: window.innerHeight - r.top + 6 }
    : { position: 'fixed', left, top: below };
}
