import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api';
import { useAuth } from '../auth';

type Pack = {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverKey: string | null;
  authorName: string;
  status: 'draft' | 'published' | 'archived';
  sortOrder: number;
  createdAt: string;
};

const STATUS_LABEL: Record<Pack['status'], string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};

export function Packs() {
  const { can } = useAuth();
  const navigate = useNavigate();

  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [criando, setCriando] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [description, setDescription] = useState('');
  const [enviandoCriacao, setEnviandoCriacao] = useState(false);
  const [erroCriacao, setErroCriacao] = useState('');

  const [publicandoCatalogo, setPublicandoCatalogo] = useState(false);
  const [erroCatalogo, setErroCatalogo] = useState('');
  const [versaoPublicada, setVersaoPublicada] = useState<number | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const lista = await apiFetch<Pack[]>('/packs');
      setPacks(lista);
      // GET /packs não traz a contagem de figurinhas — o detalhe de cada
      // pacote traz. Para uma lista de MVP isso é aceitável; não há endpoint
      // agregado e não cabe criar um só para isto.
      const entradas = await Promise.all(
        lista.map(async (p) => {
          try {
            const detalhe = await apiFetch<{ stickers: unknown[] }>(`/packs/${p.id}`);
            return [p.id, detalhe.stickers.length] as const;
          } catch {
            return [p.id, 0] as const;
          }
        }),
      );
      setContagens(Object.fromEntries(entradas));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os pacotes.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  async function onCriar(e: FormEvent) {
    e.preventDefault();
    setErroCriacao('');
    setEnviandoCriacao(true);
    try {
      const pack = await apiFetch<Pack>('/packs', {
        method: 'POST',
        body: JSON.stringify({ slug, name, authorName, description }),
      });
      // Um pacote novo não tem categoria, figurinha nem capa — segue direto
      // para o editor, que é onde essas coisas são criadas.
      navigate(`/pacotes/${pack.id}`);
    } catch (err) {
      setErroCriacao(err instanceof ApiError ? err.message : 'Não foi possível criar o pacote.');
    } finally {
      setEnviandoCriacao(false);
    }
  }

  async function onPublicarCatalogo() {
    setErroCatalogo('');
    setVersaoPublicada(null);
    setPublicandoCatalogo(true);
    try {
      const res = await apiFetch<{ version: number; url: string; checksum: string }>('/publish', {
        method: 'POST',
      });
      setVersaoPublicada(res.version);
    } catch (err) {
      setErroCatalogo(err instanceof ApiError ? err.message : 'Não foi possível publicar o catálogo.');
    } finally {
      setPublicandoCatalogo(false);
    }
  }

  return (
    <div className="pagina">
      <div className="cabecalho-pagina">
        <h1>Pacotes</h1>
        {can('pack.create') && (
          <button type="button" onClick={() => setCriando((v) => !v)}>
            {criando ? 'Cancelar' : 'Novo pacote'}
          </button>
        )}
      </div>

      {can('pack.publish') && (
        <div className="painel">
          <h2>Catálogo</h2>
          {/* Publicar um pacote e publicar o catálogo são ações diferentes:
              a primeira só deixa o pacote elegível para a vitrine, a segunda
              é o que de fato chega ao app de quem usa. */}
          <p className="sub">
            Publicar um pacote apenas o deixa pronto para entrar no catálogo. As mudanças só
            chegam ao aplicativo quando o catálogo é publicado aqui.
          </p>
          <button type="button" onClick={() => void onPublicarCatalogo()} disabled={publicandoCatalogo}>
            {publicandoCatalogo ? 'Publicando…' : 'Publicar catálogo'}
          </button>
          {versaoPublicada !== null && (
            <p className="sucesso">Catálogo publicado: versão {versaoPublicada}.</p>
          )}
          {erroCatalogo && <p role="alert" className="erro">{erroCatalogo}</p>}
        </div>
      )}

      {criando && can('pack.create') && (
        <form className="painel" onSubmit={onCriar}>
          <label>Identificador
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="marcacoes-esportivas"
            />
            <small>Letras minúsculas, números e hífen.</small>
          </label>
          <label>Nome
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          </label>
          <label>Autor(a)
            <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} minLength={2} required />
          </label>
          <label>Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {erroCriacao && <p role="alert" className="erro">{erroCriacao}</p>}
          <button disabled={enviandoCriacao}>{enviandoCriacao ? 'Criando…' : 'Criar pacote'}</button>
        </form>
      )}

      {erro && <p role="alert" className="erro">{erro}</p>}
      {carregando && <p className="sub">Carregando…</p>}

      {!carregando && packs && packs.length === 0 && (
        <p className="sub">Nenhum pacote cadastrado ainda.</p>
      )}

      {!carregando && packs && packs.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Identificador</th>
              <th>Status</th>
              <th>Figurinhas</th>
            </tr>
          </thead>
          <tbody>
            {packs.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/pacotes/${p.id}`}>{p.name}</Link></td>
                <td>{p.slug}</td>
                <td><span className={`badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
                <td>{contagens[p.id] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
