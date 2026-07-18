import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../api';

export function AceitarConvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');

    if (password.length < 10) {
      setErro('A senha precisa de ao menos 10 caracteres.');
      return;
    }

    setEnviando(true);
    try {
      await apiFetch('/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token, name, password }),
      });
      setConcluido(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível aceitar o convite.');
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <div className="card">
        <h1>Convite inválido</h1>
        <p className="sub">O link de convite está incompleto. Peça um novo convite.</p>
      </div>
    );
  }

  if (concluido) {
    return (
      <div className="card">
        <h1>Conta criada</h1>
        <p className="sub">Sua conta foi criada. Agora você já pode entrar com seu e-mail e senha.</p>
        <a href="/">Ir para o login</a>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Aceitar convite</h1>
      <p className="sub">Crie seu acesso ao painel do Body Creator.</p>
      <label>Nome
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required autoFocus />
      </label>
      <label>Senha
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
      </label>
      <p className="sub">Mínimo de 10 caracteres.</p>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <button disabled={enviando}>{enviando ? 'Criando conta…' : 'Criar conta'}</button>
    </form>
  );
}
