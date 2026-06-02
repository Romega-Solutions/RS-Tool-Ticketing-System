import { redirect } from 'next/navigation';

// Weekly Reports and Status Report were merged into a single page at
// /weekly-report. This route stays as a permanent redirect so old links,
// bookmarks, and any cached nav entries still resolve.
export default function ReportsRedirect() {
  redirect('/weekly-report');
}
