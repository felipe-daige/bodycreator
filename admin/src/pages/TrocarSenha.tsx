import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { apiFetch, ApiError } from '../api';

export function TrocarSenha() {
  const { refresh, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');

    if (newPassword.length < 10) {
      setErro('A nova senha precisa de ao menos 10 caracteres.');
      return;
    }
    if (newPassword !== confirmar) {
      setErro('A confirmação não confere com a nova senha.');
      return;
    }

    setEnviando(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      // O usuário só sai desta tela quando o servidor confirmar mustChangePassword: false.
      await refresh();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Troque sua senha</h1>
      <p className="sub">Por segurança, defina uma nova senha antes de continuar.</p>
      <label>Senha atual
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoFocus />
      </label>
      <label>Nova senha
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} required />
      </label>
      <label>Confirmar nova senha
        <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} minLength={10} required />
      </label>
      <p className="sub">Mínimo de 10 caracteres.</p>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <button disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar nova senha'}</button>
      <button type="button" className="link" onClick={() => void logout()}>Sair</button>
    </form>
  );
}
