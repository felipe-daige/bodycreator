import { describe, it, expect } from 'vitest';
import { createFakeMailer, renderInviteEmail } from '../../src/email/send.js';

describe('renderInviteEmail', () => {
  it('inclui o link do convite no html e no texto', () => {
    const msg = renderInviteEmail({
      inviteUrl: 'https://painel.exemplo.com/convite?token=abc',
      invitedByName: 'Maiara',
    });
    expect(msg.html).toContain('https://painel.exemplo.com/convite?token=abc');
    expect(msg.text).toContain('https://painel.exemplo.com/convite?token=abc');
  });

  it('está em português e diz quem convidou', () => {
    const msg = renderInviteEmail({ inviteUrl: 'https://x/y', invitedByName: 'Maiara' });
    expect(msg.subject).toMatch(/Body Creator/);
    expect(msg.html).toContain('Maiara');
  });

  it('avisa que o convite expira', () => {
    const msg = renderInviteEmail({ inviteUrl: 'https://x/y', invitedByName: 'M' });
    expect(msg.text).toMatch(/7 dias/);
  });
});

describe('createFakeMailer', () => {
  it('guarda as mensagens em vez de enviar', async () => {
    const mailer = createFakeMailer();
    await mailer.send({ to: 'a@x.com', subject: 'S', html: '<p>h</p>', text: 't' });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('a@x.com');
  });
});
