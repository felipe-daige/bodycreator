import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

export function Layout() {
  const { user, can, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="barra-lateral">
        <p className="marca">Body Creator</p>
        <nav>
          <NavLink to="/pacotes" className={({ isActive }) => (isActive ? 'ativo' : undefined)}>
            Pacotes
          </NavLink>
          {/* Some sem explicação seria pior, mas aqui não há nada a explicar:
              quem não gerencia usuários não precisa saber que a tela existe. */}
          {can('user.manage') && (
            <NavLink to="/usuarios" className={({ isActive }) => (isActive ? 'ativo' : undefined)}>
              Usuários
            </NavLink>
          )}
        </nav>
      </aside>
      <div className="area-principal">
        <header className="topo">
          <span>{user?.name}</span>
          <button type="button" className="link" onClick={() => void logout()}>Sair</button>
        </header>
        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
