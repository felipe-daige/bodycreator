import type { Config } from '../config.js';

export type Message = { to: string; subject: string; html: string; text: string };
export type SentMessage = Message & { sentAt: Date };
export type Mailer = { send(msg: Message): Promise<void> };

export function createFakeMailer(): Mailer & { sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  return {
    sent,
    async send(msg) { sent.push({ ...msg, sentAt: new Date() }); },
  };
}

export function createResendMailer(config: Config): Mailer {
  const key = config.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY é obrigatória em produção.');
  return {
    async send(msg) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: config.MAIL_FROM, to: msg.to, subject: msg.subject,
          html: msg.html, text: msg.text,
        }),
      });
      if (!res.ok) {
        throw new Error(`Falha ao enviar e-mail (${res.status}): ${await res.text()}`);
      }
    },
  };
}

export function renderInviteEmail(params: { inviteUrl: string; invitedByName: string }) {
  const { inviteUrl, invitedByName } = params;
  const subject = 'Seu acesso ao painel do Body Creator';
  const text = [
    `${invitedByName} convidou você para o painel do Body Creator.`,
    '',
    'Crie sua senha neste link:',
    inviteUrl,
    '',
    'O convite vale por 7 dias. Depois disso, peça um novo.',
    'Se você não esperava este e-mail, pode ignorá-lo.',
  ].join('\n');
  const html = `
    <p>${invitedByName} convidou você para o painel do <strong>Body Creator</strong>.</p>
    <p><a href="${inviteUrl}">Criar minha senha</a></p>
    <p>O convite vale por 7 dias. Depois disso, peça um novo.</p>
    <p style="color:#666;font-size:12px">Se você não esperava este e-mail, pode ignorá-lo.</p>
  `;
  return { subject, html, text };
}
