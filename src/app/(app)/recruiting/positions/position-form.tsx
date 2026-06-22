import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Add position" action — navigates to the full-page editor at
 * /recruiting/positions/new (replaces the old cramped modal).
 */
export function PositionForm() {
  return (
    <Button className="gap-2" render={<Link href="/recruiting/positions/new" />}>
      <Plus className="w-4 h-4" /> Add position
    </Button>
  );
}
