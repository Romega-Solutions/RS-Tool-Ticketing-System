'use client';

import { useEffect, useReducer, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontSize } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered,
} from 'lucide-react';

const FONT_SIZES = [
  { label: 'Small',  value: '13px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large',  value: '20px' },
  { label: 'Huge',   value: '28px' },
];

function ToolbarButton({
  onClick, active, disabled, label, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
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

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const currentSize =
    (editor.getAttributes('textStyle').fontSize as string | undefined) ?? '';

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

      <select
        aria-label="Font size"
        value={currentSize}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(v).run();
        }}
        className="h-8 rounded-md border border-(--rs-neutral-grey-200) bg-white px-2 text-xs text-(--rs-neutral-grey-700) focus:border-(--rs-primary-300) focus:outline-none"
      >
        <option value="">Font size</option>
        {FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  );
}

/**
 * WYSIWYG editor for the position job description. Keeps a hidden input named
 * `name` synced to the editor's HTML so it submits through the existing
 * server-action FormData flow (the action sanitizes it before storing).
 */
export function JobDescriptionEditor({
  name, defaultValue, bodyClassName,
}: {
  name: string;
  defaultValue?: string | null;
  /** Applied to the scroll container around the editor body. Pass a min/max
   *  height (e.g. on the full-page editor) so a long JD scrolls inside the box
   *  with the toolbar pinned, instead of growing the whole page unbounded. */
  bodyClassName?: string;
}) {
  const [html, setHtml] = useState(defaultValue ?? '');
  const [, force] = useReducer((x: number) => x + 1, 0);

  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch in Next
    extensions: [
      StarterKit,
      TextStyle,
      FontSize,
      Placeholder.configure({
        placeholder: 'Responsibilities, requirements, and any other context candidates should know…',
      }),
    ],
    content: defaultValue ?? '',
    editorProps: {
      attributes: { class: 'rs-richtext px-4 py-3 text-sm text-(--rs-neutral-grey-800)' },
    },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
  });

  // Re-render the toolbar so active-mark highlighting tracks the selection.
  useEffect(() => {
    if (!editor) return;
    const update = () => force();
    editor.on('transaction', update);
    return () => { editor.off('transaction', update); };
  }, [editor]);

  return (
    <div>
      <div className="rs-richtext-editor flex flex-col overflow-hidden rounded-xl border border-(--rs-neutral-grey-200) bg-white focus-within:border-(--rs-primary-300) focus-within:ring-4 focus-within:ring-(--rs-primary-100)">
        <Toolbar editor={editor} />
        <div className={bodyClassName ?? ''}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
