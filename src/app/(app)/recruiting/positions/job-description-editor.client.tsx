'use client';

import { RichTextEditor } from '@/components/rich-text-editor.client';

/**
 * WYSIWYG editor for the position job description. Thin wrapper over the shared
 * {@link RichTextEditor} that keeps a hidden input named `name` synced to the
 * editor's HTML, so it submits through the existing server-action FormData flow
 * (the action sanitizes it before storing). Behavior is unchanged: bold, italic,
 * underline, strikethrough, lists, and font-size — no mentions or emoji.
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
  return (
    <RichTextEditor
      name={name}
      defaultValue={defaultValue}
      bodyClassName={bodyClassName}
      placeholder="Responsibilities, requirements, and any other context candidates should know…"
    />
  );
}
