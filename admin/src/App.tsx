import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Login } from './pages/Login';
import { AceitarConvite } from './pages/AceitarConvite';
import { TrocarSenha } from './pages/TrocarSenha';
import { Packs } from './pages/Packs';
import { PackEditor } from './pages/PackEditor';
import { Users } from './pages/Users';
import { Layout } from './components/Layout';

function Protegido() {
  const { user, loading } = useAuth();
  if (loading) return <p>Carregando…</p>;
  if (!user) return <Login />;
  // Senha inicial do seeder não pode sobreviver ao primeiro acesso.
  if (user.mustChangePassword) return <TrocarSenha />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/pacotes" replace />} />
        <Route path="/pacotes" element={<Packs />} />
        <Route path="/pacotes/:id" element={<PackEditor />} />
        <Route path="/usuarios" element={<Users />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/convite" element={<AceitarConvite />} />
          <Route path="*" element={<Protegido />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
