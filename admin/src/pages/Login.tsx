import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(''); setEnviando(true);
    try { await login(email, password); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível entrar.'); }
    finally { setEnviando(false); }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Body Creator</h1>
      <p className="sub">Painel de administração</p>
      <label>E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </label>
      <label>Senha
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <button disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
