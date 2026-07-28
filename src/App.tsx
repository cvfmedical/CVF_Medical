import { Routes, Route } from 'react-router-dom';
import { Login } from './pages/Login';
import { DashboardHome } from './pages/DashboardHome';
import { EmConstrucao } from './pages/EmConstrucao';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { RequirePermission } from './components/RequirePermission';
import { MENU } from './lib/menu';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardHome />} />

        {MENU.flatMap((cat) =>
          cat.itens.map((item) => (
            <Route
              key={item.path}
              path={item.path}
              element={
                <RequirePermission categoria={item.categoria}>
                  {/* Telas ainda não migradas (Fases A/B/C) caem aqui até
                      serem implementadas - ver plano de migração. */}
                  <EmConstrucao nome={item.label} />
                </RequirePermission>
              }
            />
          )),
        )}
      </Route>
    </Routes>
  );
}
