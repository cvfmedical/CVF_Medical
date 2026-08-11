import { Routes, Route } from 'react-router-dom';
import { Login } from './pages/Login';
import { DefinirSenha } from './pages/DefinirSenha';
import { DashboardHome } from './pages/DashboardHome';
import { EmConstrucao } from './pages/EmConstrucao';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { RequirePermission } from './components/RequirePermission';
import { MENU } from './lib/menu';
import { Clientes } from './pages/cadastros/Clientes';
import { Funcionarios } from './pages/cadastros/Funcionarios';
import { Fornecedores } from './pages/cadastros/Fornecedores';
import { Transportadoras } from './pages/cadastros/Transportadoras';
import { CatalogoOticas } from './pages/cadastros/CatalogoOticas';
import { EquipamentosClientes } from './pages/cadastros/EquipamentosClientes';
import { ProdutosServicos } from './pages/cadastros/ProdutosServicos';
import { PadroesCalibracao } from './pages/cadastros/PadroesCalibracao';
import { AmostrasPadrao } from './pages/cadastros/AmostrasPadrao';
import { ObservacoesDefeito } from './pages/cadastros/ObservacoesDefeito';
import { CategoriasProdutosServicos } from './pages/cadastros/CategoriasProdutosServicos';
import { TiposOtica } from './pages/cadastros/TiposOtica';
import { CondicoesChegada } from './pages/cadastros/CondicoesChegada';
import { EntradaEquipamento } from './pages/pipeline/EntradaEquipamento';
import { RegistroEntrada } from './pages/pipeline/RegistroEntrada';
import { OrdemServico } from './pages/pipeline/OrdemServico';
import { OrdensServicoPanel } from './pages/pipeline/OrdensServicoPanel';
import { OrcamentoTecnico } from './pages/pipeline/OrcamentoTecnico';
import { OrcamentosAprovados } from './pages/pipeline/OrcamentosAprovados';
import { OrcamentoFinanceiro } from './pages/pipeline/OrcamentoFinanceiro';
import { Manutencao } from './pages/pipeline/Manutencao';
import { Selagem } from './pages/pipeline/Selagem';
import { TesteEstanqueidade } from './pages/pipeline/TesteEstanqueidade';
import { TesteAutoclave } from './pages/pipeline/TesteAutoclave';
import { TesteQualidade } from './pages/pipeline/TesteQualidade';
import { Entrega } from './pages/pipeline/Entrega';
import { Laudos } from './pages/pipeline/Laudos';
import { BancadaVisao } from './pages/pipeline/BancadaVisao';
import { InventarioEstoque } from './pages/estoque/InventarioEstoque';
import { LotesEstoque } from './pages/estoque/LotesEstoque';
import { SolicitacoesCompra } from './pages/estoque/SolicitacoesCompra';
import { ContasReceber } from './pages/financeiro/ContasReceber';
import { ContasPagar } from './pages/financeiro/ContasPagar';
import { Faturamento } from './pages/financeiro/Faturamento';
import { ContratosManutencao } from './pages/comercial/ContratosManutencao';
import { ConfiguracoesUsuarios } from './pages/sistema/ConfiguracoesUsuarios';
import { AcessoPortalCliente } from './pages/sistema/AcessoPortalCliente';

// Telas já migradas - path -> componente. O que não estiver aqui cai no
// placeholder EmConstrucao (ainda não implementado).
const TELAS_IMPLEMENTADAS: Record<string, React.ComponentType> = {
  '/clientes': Clientes,
  '/funcionarios': Funcionarios,
  '/fornecedores': Fornecedores,
  '/transportadoras': Transportadoras,
  '/catalogo-oticas': CatalogoOticas,
  '/equipamentos': EquipamentosClientes,
  '/produtos-servicos': ProdutosServicos,
  '/padroes-calibracao': PadroesCalibracao,
  '/amostras-padrao': AmostrasPadrao,
  '/observacoes-defeito': ObservacoesDefeito,
  '/categorias-produtos-servicos': CategoriasProdutosServicos,
  '/tipos-otica': TiposOtica,
  '/condicoes-chegada': CondicoesChegada,
  '/entrada-equipamento': EntradaEquipamento,
  '/registro-entrada': RegistroEntrada,
  '/ordens-servico/nova': OrdemServico,
  '/ordens-servico': OrdensServicoPanel,
  '/orcamento-tecnico': OrcamentoTecnico,
  '/orcamentos-aprovados': OrcamentosAprovados,
  '/orcamento-financeiro': OrcamentoFinanceiro,
  '/manutencao': Manutencao,
  '/selagem': Selagem,
  '/teste-estanqueidade': TesteEstanqueidade,
  '/teste-autoclave': TesteAutoclave,
  '/teste-qualidade': TesteQualidade,
  '/entrega': Entrega,
  '/laudos': Laudos,
  '/bancada-visao': BancadaVisao,
  '/estoque': InventarioEstoque,
  '/estoque/lotes': LotesEstoque,
  '/estoque/compras': SolicitacoesCompra,
  '/financeiro/contas-receber': ContasReceber,
  '/financeiro/contas-pagar': ContasPagar,
  '/financeiro/faturamento': Faturamento,
  '/comercial/contratos': ContratosManutencao,
  '/sistema/config': ConfiguracoesUsuarios,
  '/sistema/portal-cliente': AcessoPortalCliente,
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/definir-senha" element={<DefinirSenha />} />

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
