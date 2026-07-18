import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../api';
import { useAuth } from '../auth';

type Categoria = { id: string; packId: string; name: string; sortOrder: number };

type Figurinha = {
  id: string;
  packId: string;
  categoryId: string;
  name: string;
  tags: string[];
  fileKey: string;
  width: number;
  height: number;
  bytes: number;
  sortOrder: number;
};

type Pacote = {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverKey: string | null;
  authorName: string;
  status: 'draft' | 'published' | 'archived';
  sortOrder: number;
};

type PacoteDetalhado = Pacote & { categories: Categoria[]; stickers: Figurinha[] };

const STATUS_LABEL: Record<Pacote['status'], string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};

// Regras da figurinha (e da capa, que passa pela mesma validação no servidor)
// aparecem antes do envio para ninguém descobrir o limite errando.
const REGRAS_PNG = 'PNG com fundo transparente, até 2 MB, maior lado entre 512 e 2048 px.';

export function UploadFigurinha({ packId, categoryId, onPronto }: {
  packId: string; categoryId: string; onPronto: () => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!arquivo) { setErro('Escolha o arquivo PNG da figurinha.'); return; }
    setErro(''); setEnviando(true);

    const form = new FormData();
    form.append('id', id);
    form.append('name', name);
    form.append('categoryId', categoryId);
    form.append('tags', JSON.stringify(
      tags.split(',').map((t) => t.trim()).filter(Boolean),
    ));
    form.append('file', arquivo);

    try {
      await apiFetch(`/packs/${packId}/stickers`, { method: 'POST', body: form });
      setId(''); setName(''); setTags(''); setArquivo(null);
      onPronto();
    } catch (e) {
      // O servidor devolve exatamente qual regra falhou, em pt-BR. Mostrar essa
      // mensagem crua é melhor do que um "erro no upload" genérico.
      setErro(e instanceof ApiError ? e.message : 'Não foi possível enviar a figurinha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="upload">
      {/* As regras aparecem antes do envio para ninguém descobrir o limite errando. */}
      <p className="sub">
        PNG com fundo transparente, até 2 MB, maior lado entre 512 e 2048 px.
      </p>
      <label>Identificador
        <input value={id} onChange={(e) => setId(e.target.value)} required
               placeholder="seta-reta" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <small>Letras minúsculas, números e hífen.</small>
      </label>
      <label>Nome
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>Tags
        <input value={tags} onChange={(e) => setTags(e.target.value)}
               placeholder="seta, apontar, marcação" />
        <small>Separadas por vírgula.</small>
      </label>
      <label>Arquivo
        <input type="file" accept="image/png"
               onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} required />
      </label>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <button disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar figurinha'}</button>
    </form>
  );
}

function UploadCapa({ packId, onPronto }: { packId: string; onPronto: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!arquivo) { setErro('Escolha o arquivo PNG da capa.'); return; }
    setErro(''); setEnviando(true);
    const form = new FormData();
    form.append('file', arquivo);
    try {
      await apiFetch(`/packs/${packId}/cover`, { method: 'POST', body: form });
      setArquivo(null);
      onPronto();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível enviar a capa.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="upload">
      <p className="sub">{REGRAS_PNG}</p>
      <label>Arquivo
        <input type="file" accept="image/png"
               onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} required />
      </label>
      {erro && <p role="alert" className="erro">{erro}</p>}
      <button disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar capa'}</button>
    </form>
  );
}

export function PackEditor() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [pack, setPack] = useState<PacoteDetalhado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [salvandoInfo, setSalvandoInfo] = useState(false);
  const [erroInfo, setErroInfo] = useState('');
  const [infoSalva, setInfoSalva] = useState(false);

  const [novaCategoria, setNovaCategoria] = useState('');
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [erroCategoria, setErroCategoria] = useState('');

  const [categoriaEscolhida, setCategoriaEscolhida] = useState('');

  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erroExclusao, setErroExclusao] = useState('');

  const [publicandoPack, setPublicandoPack] = useState(false);
  const [erroPublicarPack, setErroPublicarPack] = useState('');

  async function carregar() {
    if (!id) return;
    setCarregando(true);
    setErro('');
    try {
      const detalhe = await apiFetch<PacoteDetalhado>(`/packs/${id}`);
      setPack(detalhe);
      setName(detalhe.name);
      setDescription(detalhe.description);
      setSortOrder(detalhe.sortOrder);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar o pacote.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, [id]);

  async function onSalvarInfo(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setErroInfo('');
    setInfoSalva(false);
    setSalvandoInfo(true);
    try {
      await apiFetch(`/packs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description, sortOrder }),
      });
      setInfoSalva(true);
      await carregar();
    } catch (err) {
      setErroInfo(err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSalvandoInfo(false);
    }
  }

  async function onCriarCategoria(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setErroCategoria('');
    setCriandoCategoria(true);
    try {
      await apiFetch(`/packs/${id}/categories`, {
        method: 'POST',
        body: JSON.stringify({ name: novaCategoria }),
      });
      setNovaCategoria('');
      await carregar();
    } catch (err) {
      setErroCategoria(err instanceof ApiError ? err.message : 'Não foi possível criar a categoria.');
    } finally {
      setCriandoCategoria(false);
    }
  }

  async function onExcluirFigurinha(figurinhaId: string) {
    if (!window.confirm('Excluir esta figurinha? Ela some do pacote imediatamente.')) return;
    setErroExclusao('');
    setExcluindoId(figurinhaId);
    try {
      await apiFetch(`/stickers/${figurinhaId}`, { method: 'DELETE' });
      await carregar();
    } catch (err) {
      setErroExclusao(err instanceof ApiError ? err.message : 'Não foi possível excluir a figurinha.');
    } finally {
      setExcluindoId(null);
    }
  }

  async function onPublicarPack() {
    if (!id) return;
    setErroPublicarPack('');
    setPublicandoPack(true);
    try {
      await apiFetch(`/packs/${id}/publish`, { method: 'POST' });
      await carregar();
    } catch (err) {
      setErroPublicarPack(err instanceof ApiError ? err.message : 'Não foi possível publicar o pacote.');
    } finally {
      setPublicandoPack(false);
    }
  }

  async function onDespublicarPack() {
    if (!id) return;
    setErroPublicarPack('');
    setPublicandoPack(true);
    try {
      await apiFetch(`/packs/${id}/unpublish`, { method: 'POST' });
      await carregar();
    } catch (err) {
      setErroPublicarPack(err instanceof ApiError ? err.message : 'Não foi possível despublicar o pacote.');
    } finally {
      setPublicandoPack(false);
    }
  }

  if (carregando) return <p className="sub">Carregando…</p>;
  if (erro) return <p role="alert" className="erro">{erro}</p>;
  if (!pack) return null;

  const categoriaPorId = new Map(pack.categories.map((c) => [c.id, c.name]));

  return (
    <div className="pagina">
      <p><Link to="/pacotes">&larr; Voltar para pacotes</Link></p>
      <div className="cabecalho-pagina">
        <h1>{pack.name}</h1>
        <span className={`badge badge-${pack.status}`}>{STATUS_LABEL[pack.status]}</span>
      </div>
      <p className="sub">Identificador: {pack.slug} · Autor(a): {pack.authorName}</p>

      {can('pack.edit') && (
        <form className="painel" onSubmit={onSalvarInfo}>
          <h2>Informações</h2>
          <label>Nome
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          </label>
          <label>Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>Posição no catálogo
            <input type="number" value={sortOrder}
                   onChange={(e) => setSortOrder(Number(e.target.value))} />
          </label>
          {erroInfo && <p role="alert" className="erro">{erroInfo}</p>}
          {infoSalva && <p className="sucesso">Alterações salvas.</p>}
          <button disabled={salvandoInfo}>{salvandoInfo ? 'Salvando…' : 'Salvar informações'}</button>
        </form>
      )}

      {can('pack.edit') && (
        <div className="painel">
          <h2>Capa</h2>
          <p className="sub">{pack.coverKey ? 'Este pacote já tem uma capa.' : 'Este pacote ainda não tem capa.'}</p>
          <UploadCapa packId={pack.id} onPronto={() => void carregar()} />
        </div>
      )}

      {can('pack.publish') && (
        <div className="painel">
          <h2>Publicação do pacote</h2>
          {/* A diferença entre publicar o pacote e publicar o catálogo precisa
              ficar clara aqui, no ponto em que a ação é tomada. */}
          <p className="sub">
            Publicar o pacote só o torna elegível para entrar no catálogo. Isso não muda nada
            no aplicativo por si só — depois é preciso publicar o catálogo na tela de Pacotes
            para que as mudanças cheguem a quem usa o app.
          </p>
          {pack.status === 'published' ? (
            <button type="button" onClick={() => void onDespublicarPack()} disabled={publicandoPack}>
              {publicandoPack ? 'Despublicando…' : 'Despublicar pacote'}
            </button>
          ) : (
            <button type="button" onClick={() => void onPublicarPack()} disabled={publicandoPack}>
              {publicandoPack ? 'Publicando…' : 'Publicar pacote'}
            </button>
          )}
          {erroPublicarPack && <p role="alert" className="erro">{erroPublicarPack}</p>}
        </div>
      )}

      {can('pack.edit') && (
        <div className="painel">
          <h2>Categorias</h2>
          {pack.categories.length === 0 && <p className="sub">Nenhuma categoria criada ainda.</p>}
          {pack.categories.length > 0 && (
            <ul>
              {pack.categories.map((c) => <li key={c.id}>{c.name}</li>)}
            </ul>
          )}
          <form onSubmit={onCriarCategoria}>
            <label>Nova categoria
              <input value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)}
                     minLength={2} required />
            </label>
            {erroCategoria && <p role="alert" className="erro">{erroCategoria}</p>}
            <button disabled={criandoCategoria}>{criandoCategoria ? 'Criando…' : 'Criar categoria'}</button>
          </form>
        </div>
      )}

      {can('sticker.import') && (
        <div className="painel">
          <h2>Enviar figurinha</h2>
          {pack.categories.length === 0 ? (
            <p className="sub">Crie uma categoria antes de enviar figurinhas.</p>
          ) : (
            <>
              <label>Categoria
                <select value={categoriaEscolhida} onChange={(e) => setCategoriaEscolhida(e.target.value)}>
                  <option value="">Selecione a categoria</option>
                  {pack.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              {categoriaEscolhida && (
                <UploadFigurinha
                  packId={pack.id}
                  categoryId={categoriaEscolhida}
                  onPronto={() => void carregar()}
                />
              )}
            </>
          )}
        </div>
      )}

      <div className="painel">
        <h2>Figurinhas ({pack.stickers.length})</h2>
        {pack.stickers.length === 0 && <p className="sub">Nenhuma figurinha enviada ainda.</p>}
        {pack.stickers.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Identificador</th>
                <th>Categoria</th>
                <th>Tags</th>
                {can('pack.edit') && <th></th>}
              </tr>
            </thead>
            <tbody>
              {pack.stickers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.id}</td>
                  <td>{categoriaPorId.get(s.categoryId) ?? '—'}</td>
                  <td>{s.tags.join(', ')}</td>
                  {can('pack.edit') && (
                    <td>
                      <button type="button" onClick={() => void onExcluirFigurinha(s.id)}
                              disabled={excluindoId === s.id}>
                        {excluindoId === s.id ? 'Excluindo…' : 'Excluir'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {erroExclusao && <p role="alert" className="erro">{erroExclusao}</p>}
      </div>
    </div>
  );
}
