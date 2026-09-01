import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconChevronRight, IconLayoutDashboard, IconLogout, IconSearch, IconX } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { MENU, categoriaDoPath, type ItemMenu } from '../lib/menu';
import { normalizarBusca } from '../lib/normalizarBusca';
import cvfMarca from '../assets/cvf-marca.png';
import cvfLogoCompleto from '../assets/cvf-logo-completo.png';
import { AlertasFlutuantes } from './AlertasFlutuantes';
import { BarraRascunhos } from './BarraRascunhos';

export function Layout() {
  const { funcionario, temPermissao, signOut } = useAuth();
  const location = useLocation();

  const categoriasVisiveis = MENU.filter((cat) =>
    cat.itens.some((item) => temPermissao(item.categoria) && !item.oculto),
  );
  const categoriaAtual = categoriaDoPath(location.pathname);
  const noDashboard = location.pathname === '/';

  // Accordion: categoria expandida (uma por vez). Começa na do caminho atual.
  const [aberta, setAberta] = useState<string | null>(categoriaAtual?.titulo ?? null);
  const [buscaMenu, setBuscaMenu] = useState('');
  const buscaAtiva = buscaMenu.trim() !== '';
  const termoBusca = normalizarBusca(buscaMenu.trim());

  return (
    <div className="layout-app">
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-marca">
          <img src={cvfLogoCompleto} alt="Q-CVF Medical" className="sidebar-logo" />
        </NavLink>

        <div className="sidebar-busca">
          <IconSearch size={14} className="sidebar-busca-icone" />
          <input
            type="text"
            placeholder="Buscar no menu..."
            value={buscaMenu}
            onChange={(e) => setBuscaMenu(e.target.value)}
          />
          {buscaAtiva && (
            <button type="button" title="Limpar busca" onClick={() => setBuscaMenu('')}>
              <IconX size={14} />
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => 'sidebar-dash' + (isActive ? ' ativo' : '')}>
            <IconLayoutDashboard size={18} stroke={1.75} />
            <span>Visão geral</span>
          </NavLink>

          {categoriasVisiveis.map((cat) => {
            const IconeCategoria = cat.icone;
            const itensVisiveis = cat.itens.filter((item) => temPermissao(item.categoria) && !item.oculto);
            // Durante a busca, ignora o accordion (uma categoria por vez) e
            // mostra todas as categorias com resultado já abertas - senão
            // não daria pra ver itens de mais de uma categoria de uma vez.
            const categoriaBate = buscaAtiva && normalizarBusca(cat.titulo).includes(termoBusca);
            const itensParaMostrar =
              buscaAtiva && !categoriaBate
                ? itensVisiveis.filter((item) => normalizarBusca(item.label).includes(termoBusca))
                : itensVisiveis;
            if (buscaAtiva && itensParaMostrar.length === 0) return null;
            const expandida = buscaAtiva ? true : aberta === cat.titulo;

            // Agrupa por 'grupo' preservando a ordem original dos itens.
            const grupos: { nome: string | null; itens: ItemMenu[] }[] = [];
            for (const item of itensParaMostrar) {
              const chave = item.grupo ?? null;
              let g = grupos.find((x) => x.nome === chave);
              if (!g) {
                g = { nome: chave, itens: [] };
                grupos.push(g);
              }
              g.itens.push(item);
            }

            return (
              <div key={cat.titulo} className="sidebar-cat">
                <button
                  type="button"
                  className={
                    'sidebar-cat-cab' + (categoriaAtual?.titulo === cat.titulo ? ' atual' : '')
                  }
                  onClick={() => !buscaAtiva && setAberta(expandida ? null : cat.titulo)}
                >
                  <IconeCategoria size={18} stroke={1.75} />
                  <span className="sidebar-cat-nome">{cat.titulo}</span>
                  <IconChevronRight size={15} className={'sidebar-chevron' + (expandida ? ' girado' : '')} />
                </button>

                {expandida && (
                  <div className="sidebar-itens">
                    {grupos.map((g, i) => (
                      <div key={g.nome ?? `sem-grupo-${i}`}>
                        {g.nome && <div className="sidebar-grupo">{g.nome}</div>}
                        {g.itens.map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            end
                            className={({ isActive }) => 'sidebar-item' + (isActive ? ' ativo' : '')}
                            onClick={() => {
                              setBuscaMenu('');
                              setAberta(cat.titulo);
                            }}
                          >
                            {item.label}
                          </NavLink>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {buscaAtiva && categoriasVisiveis.every((cat) => {
            const itensVisiveis = cat.itens.filter((item) => temPermissao(item.categoria) && !item.oculto);
            const categoriaBate = normalizarBusca(cat.titulo).includes(termoBusca);
            return !categoriaBate && itensVisiveis.every((item) => !normalizarBusca(item.label).includes(termoBusca));
          }) && <p className="sidebar-busca-vazia">Nenhum item encontrado.</p>}
        </nav>

        <button type="button" className="sidebar-sair" onClick={() => signOut()}>
          <IconLogout size={18} stroke={1.75} />
          <span>Sair do sistema</span>
        </button>
      </aside>

      <div className="area-principal">
        <header className="topo-app">
          <span className="topo-titulo">{noDashboard ? 'Visão geral' : categoriaAtual?.titulo ?? ''}</span>
          <span className="usuario-logado">
            {funcionario?.nome} <span className="cargo">({funcionario?.nivel_acesso})</span>
          </span>
        </header>

        <main className="conteudo">
          <img src={cvfMarca} alt="" aria-hidden="true" className="marca-dagua-pagina" />
          <div className="conteudo-camada">
            <Outlet />
          </div>
        </main>

        <footer className="rodape">
          <span>CVF MEDICAL MANUT. EM EQUIPAMENTOS CIRÚRGICOS LTDA | CNPJ: 46.948.692/0001-03 | Ribeirão Preto/SP</span>
        </footer>
      </div>

      <AlertasFlutuantes />
      <BarraRascunhos />
    </div>
  );
}
