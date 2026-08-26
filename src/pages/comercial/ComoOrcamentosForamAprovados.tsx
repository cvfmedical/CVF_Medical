import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { CarregandoTela } from '../../components/CarregandoTela';
import { useAuth } from '../../contexts/AuthContext';
import { useEntradaOrcamentoPorOS } from '../../lib/useEntradaOrcamentoPorOS';
import { supabase } from '../../lib/supabaseClient';

interface OrcamentoAprovadoDetalhe {
  id: number;
  numero_orcamento: string;
  ordem_servico_id: number;
  data_resposta_cliente: string | null;
  valor_fixo_contrato: number | null;
  aprovacao_manual: boolean | null;
  motivo_aprovacao_manual: string | null;
  aprovado_manualmente_por: number | null;
  ordens_servico: { numero_os: string; cliente_nome: string } | null;
  orcamento_itens: { quantidade: number; preco_unitario: number | null }[];
}

interface Funcionario {
  id: number;
  nome: string;
}

// Mostra, pra cada orçamento já aprovado, se a aprovação veio do Portal
// do Cliente (o cliente clicou "Aprovar orçamento" ali) ou foi registrada
// manualmente por um funcionário (cliente aprovou por telefone/verbal,
// sem usar o portal) - nesse caso mostra quem registrou e o motivo
// digitado na hora. Histórico completo, sem filtro por status da OS
// (diferente da tela "Orçamentos aprovados", que só mostra quem ainda
// está esperando manutenção começar).
export function ComoOrcamentosForamAprovados() {
  const navigate = useNavigate();
  const { temPermissao } = useAuth();
  const podeVerValor = temPermissao('financeiro');

  const orcamentosQuery = useQuery({
    queryKey: ['orcamentos-aprovados-detalhe'],
    queryFn: async (): Promise<OrcamentoAprovadoDetalhe[]> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select(
          'id, numero_orcamento, ordem_servico_id, data_resposta_cliente, valor_fixo_contrato, aprovacao_manual, motivo_aprovacao_manual, aprovado_manualmente_por, ordens_servico(numero_os, cliente_nome), orcamento_itens(quantidade, preco_unitario)',
        )
        .eq('status', 'Aprovado')
        .order('data_resposta_cliente', { ascending: false });
      if (error) throw error;
      return data as unknown as OrcamentoAprovadoDetalhe[];
    },
  });

  const funcionariosQuery = useQuery({
    queryKey: ['funcionarios-nome'],
    queryFn: async (): Promise<Funcionario[]> => {
      const { data, error } = await supabase.from('funcionarios').select('id, nome');
      if (error) throw error;
      return data as Funcionario[];
    },
  });

  const { codigoEntradaPorOS } = useEntradaOrcamentoPorOS();

  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();

  function nomeFuncionario(id: number | null): string {
    if (!id) return '-';
    return funcionariosQuery.data?.find((f) => f.id === id)?.nome ?? '-';
  }

  function como(o: OrcamentoAprovadoDetalhe): string {
    return o.aprovacao_manual ? 'Manual (funcionário)' : 'Portal do cliente';
  }

  function total(o: OrcamentoAprovadoDetalhe): number {
    if (o.valor_fixo_contrato != null) return o.valor_fixo_contrato;
    return o.orcamento_itens.reduce((soma, i) => soma + (i.preco_unitario ?? 0) * i.quantidade, 0);
  }

  const COLUNAS_FILTRAVEIS = [
    'codigo_entrada',
    'numero_os',
    'numero_orcamento',
    'cliente_nome',
    'data_resposta_cliente',
    'como',
    'aprovado_por',
  ];

  function valorColuna(o: OrcamentoAprovadoDetalhe, chave: string): unknown {
    if (chave === 'codigo_entrada') return codigoEntradaPorOS.get(o.ordem_servico_id) ?? '';
    if (chave === 'numero_os') return o.ordens_servico?.numero_os ?? '';
    if (chave === 'cliente_nome') return o.ordens_servico?.cliente_nome ?? '';
    if (chave === 'data_resposta_cliente') return o.data_resposta_cliente;
    if (chave === 'como') return como(o);
    if (chave === 'aprovado_por') return o.aprovacao_manual ? nomeFuncionario(o.aprovado_manualmente_por) : '';
    if (chave === 'motivo') return o.aprovacao_manual ? o.motivo_aprovacao_manual ?? '' : '';
    return (o as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (orcamentosQuery.data ?? []).filter((o) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(o, chave), chave)),
  );
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(
    linhasFiltradas,
    null,
    valorColuna,
  );

  if (orcamentosQuery.isLoading || funcionariosQuery.isLoading) return <CarregandoTela />;

  const colunas: [string, string][] = [
    ['codigo_entrada', 'Entrada'],
    ['numero_os', 'OS'],
    ['numero_orcamento', 'Orçamento'],
    ['cliente_nome', 'Cliente'],
    ['data_resposta_cliente', 'Aprovado em'],
    ['como', 'Como foi aprovado'],
    ['aprovado_por', 'Aprovado por'],
    ['motivo', 'Motivo (se manual)'],
    ...(podeVerValor ? ([['valor', 'Valor']] as [string, string][]) : []),
  ];

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Como os orçamentos foram aprovados</h1>
        {algumFiltroAtivo && (
          <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
            Limpar filtros
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Todo orçamento já aprovado (histórico completo) - "Portal do cliente" quando o próprio cliente clicou em
        "Aprovar orçamento" no portal; "Manual" quando um funcionário registrou a aprovação por fora (ex.: cliente
        aprovou por telefone), com o motivo digitado na hora.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {colunas.map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
          </tr>
          <tr>
            {COLUNAS_FILTRAVEIS.map((chave) => {
              const valoresDisponiveis = Array.from(
                new Set((orcamentosQuery.data ?? []).map((o) => String(valorColuna(o, chave) ?? ''))),
              ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
              return (
                <th key={chave} style={{ padding: '2px 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="campo-filtro-coluna"
                      placeholder="Filtrar..."
                      value={filtrosColuna[chave] ?? ''}
                      onChange={(e) => setFiltroTexto(chave, e.target.value)}
                    />
                    <FiltroColunaValores
                      valores={valoresDisponiveis}
                      selecionados={filtrosValores[chave] ?? new Set()}
                      onChange={(v) => setValoresColuna(chave, v)}
                    />
                  </div>
                </th>
              );
            })}
            <th></th>
            {podeVerValor && <th></th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((o) => (
            <tr key={o.id}>
              <td>
                <span className="link-numero mono" onClick={() => navigate(`/registro-entrada?os=${o.ordem_servico_id}`)}>
                  {codigoEntradaPorOS.get(o.ordem_servico_id) ?? '-'}
                </span>
              </td>
              <td>
                <span
                  className="link-numero mono"
                  title="Abrir orçamento técnico desta OS"
                  onClick={() => navigate(`/orcamento-tecnico?os=${o.ordem_servico_id}`)}
                >
                  {o.ordens_servico?.numero_os}
                </span>
              </td>
              <td>
                <span
                  className="link-numero mono"
                  title="Abrir no Financeiro"
                  onClick={() => navigate(`/orcamento-financeiro?orcamento=${o.id}`)}
                >
                  {o.numero_orcamento}
                </span>
              </td>
              <td>{o.ordens_servico?.cliente_nome}</td>
              <td>{o.data_resposta_cliente ? new Date(o.data_resposta_cliente).toLocaleString('pt-BR') : '-'}</td>
              <td>{como(o)}</td>
              <td>{o.aprovacao_manual ? nomeFuncionario(o.aprovado_manualmente_por) : '-'}</td>
              <td>{o.aprovacao_manual ? o.motivo_aprovacao_manual ?? '-' : '-'}</td>
              {podeVerValor && <td>R$ {total(o).toFixed(2)}</td>}
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={podeVerValor ? 9 : 8}>Nenhum orçamento aprovado encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
