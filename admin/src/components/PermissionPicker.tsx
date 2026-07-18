// Espelha auth/permissions.ts do servidor (rótulos em pt-BR, uso interno em inglês).
// A validação que importa é a do servidor: este componente só evita que alguém
// monte, na tela, uma combinação que o servidor já sabe que vai recusar.
export const PERMISSOES = [
  { id: 'sticker.import', label: 'Importar figurinhas' },
  { id: 'pack.create', label: 'Criar pacotes' },
  { id: 'pack.edit', label: 'Editar pacotes' },
  { id: 'pack.publish', label: 'Publicar o catálogo' },
  { id: 'pack.price', label: 'Definir preços' },
  { id: 'report.view', label: 'Ver faturamento' },
  { id: 'user.manage', label: 'Gerenciar usuários', somenteAdmin: true },
] as const;

type Papel = 'admin' | 'gerente';

export function PermissionPicker({ role, value, onChange }: {
  role: Papel;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function alternar(id: string) {
    onChange(value.includes(id) ? value.filter((p) => p !== id) : [...value, id]);
  }

  return (
    <fieldset className="permissoes">
      <legend>Permissões</legend>
      {PERMISSOES.map((p) => {
        // Sumir sem explicação vira dúvida; desabilitada com motivo ensina a regra.
        const desabilitada = 'somenteAdmin' in p && p.somenteAdmin && role !== 'admin';
        return (
          <label key={p.id} className={desabilitada ? 'permissao permissao-desabilitada' : 'permissao'}>
            <input
              type="checkbox"
              checked={!desabilitada && value.includes(p.id)}
              disabled={desabilitada}
              onChange={() => alternar(p.id)}
            />
            <span>{p.label}</span>
            {desabilitada && <small>Exclusiva de administradores</small>}
          </label>
        );
      })}
    </fieldset>
  );
}
