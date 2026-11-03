'use client';

// Browser half of a direct upload: check the file, ask the server for a
// one-time signed upload URL, send the bytes straight to Supabase Storage,
// then ask the server to record it. The file never passes through a server
// action, so the 1 MB action limit and Vercel's 4.5 MB cap don't apply.

import { createClient } from '@/lib/supabase/client';
import {
  checkUploadFile,
  type DirectUploadReceipt,
  type DirectUploadTicket,
  type UploadActionResult,
  type UploadPolicy,
} from '@/lib/direct-upload';

type StorageUploader = {
  storage: {
    from(bucket: string): {
      uploadToSignedUrl(
        path: string,
        token: string,
        file: Blob,
        options?: { contentType?: string; upsert?: boolean },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function directUpload(args: {
  file:     File;
  policy:   UploadPolicy;
  prepare:  (meta: { name: string; size: number; type: string }) => Promise<UploadActionResult<DirectUploadTicket>>;
  record:   (receipt: DirectUploadReceipt) => Promise<UploadActionResult>;
  /** Injected in tests; defaults to the browser Supabase client. */
  client?:  StorageUploader;
}): Promise<void> {
  const { file } = args;
  const check = checkUploadFile({ name: file.name, size: file.size, type: file.type }, args.policy);
  if (!check.ok) throw new Error(check.error);

  // The server repeats these checks before issuing the signed URL.
  const prepared = await args.prepare({ name: file.name, size: file.size, type: check.contentType });
  if (!prepared.ok) throw new Error(prepared.error);
  const ticket = prepared.data;

  // Re-wrap so the stored object gets the canonical content type even when
  // the browser reported none (common for .docx on some systems).
  const body = new Blob([file], { type: check.contentType });
  const client = args.client ?? (createClient() as unknown as StorageUploader);
  const { error } = await client.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, body, { contentType: check.contentType });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const recorded = await args.record({ path: ticket.path, fileName: file.name, size: file.size, type: check.contentType });
  if (!recorded.ok) throw new Error(recorded.error);
}
