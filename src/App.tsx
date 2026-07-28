import { Routes, Route } from 'react-router-dom';
import { Login } from './pages/Login';
import { DashboardHome } from './pages/DashboardHome';
import { EmConstrucao } from './pages/EmConstrucao';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { RequirePermission } from './components/RequirePermission';
import { MENU } from './lib/menu';
import { Clientes } from './pages/cadastros/Clientes';
import { Funcionarios } from './pages/cadastros/Funcionarios';
import { Fornecedores } from './pages/cadastros/Fornecedores';
import { CatalogoOticas } from './pages/cadastros/CatalogoOticas';
import { EquipamentosClientes } from './pages/cadastros/EquipamentosClientes';
import { ProdutosServicos } from './pages/cadastros/ProdutosServicos';
import { PadroesCalibracao } from './pages/cadastros/PadroesCalibracao';

// Telas já migradas (Fase A) - path -> componente. O que não estiver aqui
// cai no placeholder EmConstrucao (Fases B/C, ainda não implementadas).
const TELAS_IMPLEMENTADAS: Record<string, React.ComponentType> = {
  '/clientes': Clientes,
  '/funcionarios': Funcionarios,
  '/fornecedores': Fornecedores,
  '/catalogo-oticas': CatalogoOticas,
  '/equipamentos': EquipamentosClientes,
  '/produtos-servicos': ProdutosServicos,
  '/padroes-calibracao': PadroesCalibracao,
};

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
          cat.itens.map((item) => {
            const Tela = TELAS_IMPLEMENTADAS[item.path];
            return (
              <Route
                key={item.path}
                path={item.path}
                element={
                  <RequirePermission categoria={item.categoria}>
                    {Tela ? <Tela /> : <EmConstrucao nome={item.label} />}
                  </RequirePermission>
                }
              />
            );
          }),
        )}
      </Route>
    </Routes>
  );
}
