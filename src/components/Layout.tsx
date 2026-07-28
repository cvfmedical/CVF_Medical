import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconLayoutDashboard, IconLogout } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { MENU, categoriaDoPath } from '../lib/menu';
import { Logomark } from './Logomark';

export function Layout() {
  const { funcionario, temPermissao, signOut } = useAuth();
  const location = useLocation();

  const categoriasVisiveis = MENU.filter((cat) => cat.itens.some((item) => temPermissao(item.categoria)));
  const categoriaAtual = categoriaDoPath(location.pathname);
  const noDashboard = location.pathname === '/';

  return (
    <div className="layout-app">
      <aside className="rail">
        <NavLink to="/" className="rail-logo" data-tooltip="Q-CVF Medical">
          <Logomark size={22} title="Q-CVF Medical" />
        </NavLink>

        <nav className="rail-nav">
          <NavLink
            to="/"
            end
            data-tooltip="Visão geral"
            className={({ isActive }) => 'rail-icone' + (isActive ? ' ativo' : '')}
          >
            <IconLayoutDashboard size={20} stroke={1.75} />
          </NavLink>

          {categoriasVisiveis.map((cat) => {
            const IconeCategoria = cat.icone;
            const ativo = categoriaAtual?.titulo === cat.titulo;
            const primeiroItemPermitido = cat.itens.find((item) => temPermissao(item.categoria));
            return (
              <NavLink
                key={cat.titulo}
                to={primeiroItemPermitido?.path ?? '/'}
                data-tooltip={cat.titulo}
                className={'rail-icone' + (ativo ? ' ativo' : '')}
              >
                <IconeCategoria size={20} stroke={1.75} />
              </NavLink>
            );
          })}
        </nav>

        <button className="rail-icone rail-sair" data-tooltip="Sair do sistema" onClick={() => signOut()}>
          <IconLogout size={20} stroke={1.75} />
        </button>
      </aside>

      <div className="area-principal">
        <header className="barra-contextual">
          <div className="barra-contextual-topo">
            <span className="categoria-label">{noDashboard ? 'Visão geral' : categoriaAtual?.titulo ?? ''}</span>
            <span className="usuario-logado">
              {funcionario?.nome} <span className="cargo">({funcionario?.nivel_acesso})</span>
            </span>
          </div>

          {categoriaAtual && (
            <nav className="abas-categoria">
              {categoriaAtual.itens
                .filter((item) => temPermissao(item.categoria))
                .map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => 'aba' + (isActive ? ' ativa' : '')}
                  >
                    {item.label}
                  </NavLink>
                ))}
            </nav>
          )}
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
