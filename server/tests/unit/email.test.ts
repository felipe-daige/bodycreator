import { describe, it, expect } from 'vitest';
import { createFakeMailer, renderInviteEmail } from '../../src/email/send.js';

describe('renderInviteEmail', () => {
  it('inclui o link do convite no html e no texto', () => {
    const msg = renderInviteEmail({
      inviteUrl: 'bodycreator://convite?token=abc',
      invitedByName: 'Maiara',
    });
    expect(msg.html).toContain('bodycreator://convite?token=abc');
    expect(msg.text).toContain('bodycreator://convite?token=abc');
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

  it('escapa HTML em invitedByName no html', () => {
    const msg = renderInviteEmail({
      inviteUrl: 'https://x/y',
      invitedByName: '<script>alert(1)</script>',
    });
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });

  it('escapa HTML em invitedByName quando tem aspas duplas e ampersand', () => {
    const msg = renderInviteEmail({
      inviteUrl: 'https://x/y',
      invitedByName: 'João & "Admin"',
    });
    expect(msg.html).toContain('João &amp; &quot;Admin&quot;');
    expect(msg.html).not.toContain('João & "Admin"');
  });

  it('mantém invitedByName sem escape na versão text', () => {
    const msg = renderInviteEmail({
      inviteUrl: 'https://x/y',
      invitedByName: '<script>alert(1)</script>',
    });
    expect(msg.text).toContain('<script>alert(1)</script>');
    expect(msg.text).not.toContain('&lt;');
  });

  it('mantém nome simples idêntico no html', () => {
    const msg = renderInviteEmail({
      inviteUrl: 'https://x/y',
      invitedByName: 'Maiara',
    });
    expect(msg.html).toContain('Maiara');
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
