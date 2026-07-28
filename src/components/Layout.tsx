import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MENU } from '../lib/menu';

export function Layout() {
  const { funcionario, temPermissao, signOut } = useAuth();

  return (
    <div className="layout-app">
      <aside className="sidebar">
        <div className="sidebar-logo">Q-CVF Medical</div>

        <nav>
          <div className="categoria-menu">Visão Geral</div>
          <NavLink to="/" end className={({ isActive }) => 'item-menu' + (isActive ? ' ativo' : '')}>
            Dashboard Inicial
          </NavLink>

          {MENU.map((cat) => {
            const itensVisiveis = cat.itens.filter((item) => temPermissao(item.categoria));
            if (itensVisiveis.length === 0) return null;
            return (
              <div key={cat.titulo}>
                <div className="categoria-menu">{cat.titulo}</div>
                {itensVisiveis.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      'item-menu' + (item.recuo ? ' recuo' : '') + (isActive ? ' ativo' : '')
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <button className="item-menu botao-sair" onClick={() => signOut()}>
          Sair do Sistema
        </button>
      </aside>

      <div className="area-principal">
        <header className="topbar">
          <div />
          <div className="usuario-logado">
            {funcionario?.nome} <span className="cargo">({funcionario?.nivel_acesso})</span>
          </div>
        </header>

        <main className="conteudo">
          <Outlet />
        </main>

        <footer className="rodape">
          <span>CVF MEDICAL MANUT. EM EQUIPAMENTOS CIRÚRGICOS LTDA | CNPJ: 46.948.692/0001-03 | Ribeirão Preto/SP</span>
        </footer>
      </div>
    </div>
  );
}
