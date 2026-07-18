import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../api';
import { useAuth } from '../auth';
import { PermissionPicker } from '../components/PermissionPicker';

type Papel = 'admin' | 'gerente';
type StatusUsuario = 'invited' | 'active' | 'disabled';

type Usuario = {
  id: string;
  email: string;
  name: string;
  role: Papel;
  permissions: string[];
  status: StatusUsuario;
  createdAt: string;
  lastLoginAt: string | null;
};

const PAPEL_LABEL: Record<Papel, string> = { admin: 'Administrador', gerente: 'Gerente' };
const STATUS_LABEL: Record<StatusUsuario, string> = {
  invited: 'Convidado', active: 'Ativo', disabled: 'Desativado',
};

function formatarData(iso: string | null) {
  if (!iso) return 'Nunca entrou';
  return new Date(iso).toLocaleString('pt-BR');
}

export function Users() {
  const { can, user: usuarioAtual } = useAuth();

  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [convidando, setConvidando] = useState(false);
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('gerente');
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [erroConvite, setErroConvite] = useState('');
  const [ultimoConvite, setUltimoConvite] = useState<{ id: string; email: string } | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [permissoesEdicao, setPermissoesEdicao] = useState<string[]>([]);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState('');

  const [desativandoId, setDesativandoId] = useState<string | null>(null);
  const [erroDesativar, setErroDesativar] = useState('');

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      setUsuarios(await apiFetch<Usuario[]>('/users'));
    } catch (err) {
      // Se um gerente sem user.manage cair aqui via URL direta, o servidor
      // recusa com 403 e essa é a mensagem que aparece — a tela não inventa
      // um texto próprio de "acesso negado".
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os usuários.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  function onMudarPapel(novoPapel: Papel) {
    setPapel(novoPapel);
    // user.manage não é atribuível a gerente — se a pessoa trocar de admin
    // para gerente com a caixa já marcada, ela precisa sair da seleção.
    if (novoPapel !== 'admin') {
      setPermissoes((atual) => atual.filter((p) => p !== 'user.manage'));
    }
  }

  async function onConvidar(e: FormEvent) {
    e.preventDefault();
    setErroConvite('');
    setEnviandoConvite(true);
    setUltimoConvite(null);
    setReenviado(false);
    try {
      const convite = await apiFetch<{ id: string; email: string; expiresAt: string }>('/invites', {
        method: 'POST',
        body: JSON.stringify({ email, role: papel, permissions: permissoes }),
      });
      setUltimoConvite({ id: convite.id, email: convite.email });
      setEmail('');
      setPapel('gerente');
      setPermissoes([]);
      setConvidando(false);
    } catch (err) {
      setErroConvite(err instanceof ApiError ? err.message : 'Não foi possível enviar o convite.');
    } finally {
      setEnviandoConvite(false);
    }
  }

  async function onReenviar() {
    if (!ultimoConvite) return;
    setReenviando(true);
    setReenviado(false);
    try {
      await apiFetch(`/invites/${ultimoConvite.id}/resend`, { method: 'POST' });
      setReenviado(true);
    } catch (err) {
      setErroConvite(err instanceof ApiError ? err.message : 'Não foi possível reenviar o convite.');
    } finally {
      setReenviando(false);
    }
  }

  function onIniciarEdicao(usuario: Usuario) {
    setEditandoId(usuario.id);
    setPermissoesEdicao(usuario.permissions);
    setErroEdicao('');
  }

  async function onSalvarEdicao(usuario: Usuario) {
    setSalvandoEdicao(true);
    setErroEdicao('');
    try {
      await apiFetch(`/users/${usuario.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: permissoesEdicao }),
      });
      setEditandoId(null);
      await carregar();
    } catch (err) {
      setErroEdicao(err instanceof ApiError ? err.message : 'Não foi possível salvar as permissões.');
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function onDesativar(usuario: Usuario) {
    if (!window.confirm(`Desativar o acesso de ${usuario.name}? A pessoa não conseguirá mais entrar no painel.`)) {
      return;
    }
    setDesativandoId(usuario.id);
    setErroDesativar('');
    try {
      await apiFetch(`/users/${usuario.id}/disable`, { method: 'POST' });
      await carregar();
    } catch (err) {
      setErroDesativar(err instanceof ApiError ? err.message : 'Não foi possível desativar o usuário.');
    } finally {
      setDesativandoId(null);
    }
  }

  return (
    <div className="pagina">
      <div className="cabecalho-pagina">
        <h1>Usuários</h1>
        {can('user.manage') && (
          <button type="button" onClick={() => setConvidando((v) => !v)}>
            {convidando ? 'Cancelar' : 'Convidar'}
          </button>
        )}
      </div>

      {convidando && can('user.manage') && (
        <form className="painel" onSubmit={onConvidar}>
          <label>E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>Papel
            <select value={papel} onChange={(e) => onMudarPapel(e.target.value as Papel)}>
              <option value="gerente">Gerente</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <PermissionPicker role={papel} value={permissoes} onChange={setPermissoes} />
          {erroConvite && <p role="alert" className="erro">{erroConvite}</p>}
          <button disabled={enviandoConvite}>{enviandoConvite ? 'Enviando…' : 'Enviar convite'}</button>
        </form>
      )}

      {ultimoConvite && (
        <div className="painel">
          <p className="sucesso">Convite enviado para {ultimoConvite.email}.</p>
          <button type="button" onClick={() => void onReenviar()} disabled={reenviando}>
            {reenviando ? 'Reenviando…' : 'Reenviar e-mail de convite'}
          </button>
          {reenviado && <p className="sub">Convite reenviado.</p>}
        </div>
      )}

      {erro && <p role="alert" className="erro">{erro}</p>}
      {carregando && <p className="sub">Carregando…</p>}
      {erroDesativar && <p role="alert" className="erro">{erroDesativar}</p>}

      {!carregando && usuarios && usuarios.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Último acesso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <Fragment key={u.id}>
                <tr>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{PAPEL_LABEL[u.role]}</td>
                  <td><span className={`badge badge-${u.status}`}>{STATUS_LABEL[u.status]}</span></td>
                  <td>{formatarData(u.lastLoginAt)}</td>
                  <td className="acoes">
                    <button type="button" onClick={() => onIniciarEdicao(u)}>Permissões</button>
                    {u.status !== 'disabled' && u.id !== usuarioAtual?.id && (
                      <button type="button" onClick={() => void onDesativar(u)} disabled={desativandoId === u.id}>
                        {desativandoId === u.id ? 'Desativando…' : 'Desativar'}
                      </button>
                    )}
                  </td>
                </tr>
                {editandoId === u.id && (
                  <tr>
                    <td colSpan={6}>
                      <div className="painel">
                        <PermissionPicker role={u.role} value={permissoesEdicao} onChange={setPermissoesEdicao} />
                        {erroEdicao && <p role="alert" className="erro">{erroEdicao}</p>}
                        <div className="acoes">
                          <button type="button" onClick={() => void onSalvarEdicao(u)} disabled={salvandoEdicao}>
                            {salvandoEdicao ? 'Salvando…' : 'Salvar permissões'}
                          </button>
                          <button type="button" className="link" onClick={() => setEditandoId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
