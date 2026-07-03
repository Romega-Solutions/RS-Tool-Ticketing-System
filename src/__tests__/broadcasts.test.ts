import { describe, expect, it } from 'vitest';
import {
  normalizeBroadcastInput,
  renderBroadcastEmail,
  selectBroadcastRecipients,
  type BroadcastRecipient,
} from '@/lib/broadcasts';

const users: BroadcastRecipient[] = [
  { id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin', team: 'Executive', isActive: true },
  { id: 2, name: 'Active IC', email: 'ic@example.com', role: 'ic', team: 'Sales', isActive: true },
  { id: 3, name: 'Inactive IC', email: 'old@example.com', role: 'ic', team: 'Sales', isActive: false },
];

describe('broadcast helpers', () => {
  it('defaults to active recipients and validates message content', () => {
    const input = normalizeBroadcastInput({
      subject: '  Portal update  ',
      message: '  Please use the new portal.  ',
      inApp: true,
      sendEmail: true,
    });

    expect(input).toMatchObject({
      target: 'active',
      subject: 'Portal update',
      message: 'Please use the new portal.',
      selectedUserIds: [],
      inApp: true,
      sendEmail: true,
    });
  });

  it('requires selected recipients when target is selected', () => {
    expect(() => normalizeBroadcastInput({
      target: 'selected',
      subject: 'Heads up',
      message: 'Message',
      selectedUserIds: [],
    })).toThrow('Select at least one recipient.');
  });

  it('filters recipients by active or selected target', () => {
    expect(selectBroadcastRecipients(users, { target: 'active', selectedUserIds: [] }).map(user => user.id))
      .toEqual([1, 2]);
    expect(selectBroadcastRecipients(users, { target: 'selected', selectedUserIds: [3, 2, 2] }).map(user => user.id))
      .toEqual([2, 3]);
  });

  it('renders safe email html and text with the portal link', () => {
    const rendered = renderBroadcastEmail({
      subject: '<Portal>',
      message: 'Use https://portal.romega-solutions.com/',
      senderName: 'Ken',
    });

    expect(rendered.html).toContain('&lt;Portal&gt;');
    expect(rendered.html).toContain('https://portal.romega-solutions.com');
    expect(rendered.text).toContain('Sent by Ken');
  });
});
