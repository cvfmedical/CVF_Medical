import { useNavigate } from 'react-router-dom';
import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_VOLTA_MANUTENCAO, STATUS_CHECKPOINT_B, STATUS_TESTE_QUALIDADE } from '../../lib/statusOS';
import { useEntradaOrcamentoPorOS } from '../../lib/useEntradaOrcamentoPorOS';

interface TesteQualidadeRow {
  id: number;
  ordem_servico_id: number;
  resultado: string;
  observacoes: string | null;
}

export function TesteQualidade() {
  const navigate = useNavigate();
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes([STATUS_TESTE_QUALIDADE]);
  const { codigoEntradaPorOS, orcamentoPorOS } = useEntradaOrcamentoPorOS();
  if (isLoading) return <CarregandoTela />;

  return (
    <div>
      <CrudPage<TesteQualidadeRow>
        titulo="Teste de qualidade / funcionamento"
        tabela="testes_qualidade"
        ordenarPor="id"
        camposFiltro={[(r) => porId(r.ordem_servico_id)?.numero_os ?? '', (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '']}
        colunas={[
          {
            chave: 'codigo_entrada',
            label: 'Entrada',
            render: (r) => (
              <span className="link-numero mono" onClick={() => navigate(`/registro-entrada?os=${r.ordem_servico_id}`)}>
                {codigoEntradaPorOS.get(r.ordem_servico_id) ?? '-'}
              </span>
            ),
            valorFiltro: (r) => codigoEntradaPorOS.get(r.ordem_servico_id) ?? '-',
          },
          {
            chave: 'ordem_servico_id',
            label: 'OS',
            render: (r) => (
              <span className="link-numero mono" onClick={() => navigate(`/orcamento-tecnico?os=${r.ordem_servico_id}`)}>
                {porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`}
              </span>
            ),
            valorFiltro: (r) => porId(r.ordem_servico_id)?.numero_os ?? r.ordem_servico_id,
          },
          {
            chave: 'numero_orcamento',
            label: 'Orçamento',
            render: (r) => {
              const orc = orcamentoPorOS.get(r.ordem_servico_id);
              return orc ? (
                <span
                  className="link-numero mono"
                  onClick={() => navigate(`/orcamento-tecnico?os=${r.ordem_servico_id}&orcamento=${orc.id}`)}
                >
                  {orc.numero}
                </span>
              ) : (
                <span className="mono" style={{ color: 'var(--ink-400)' }}>
                  -
                </span>
              );
            },
            valorFiltro: (r) => orcamentoPorOS.get(r.ordem_servico_id)?.numero ?? '-',
          },
          {
            chave: 'cliente_nome',
            label: 'Cliente',
            render: (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '-',
            valorFiltro: (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '-',
          },
          {
            chave: 'resultado',
            label: 'Resultado',
            render: (r) => <Badge tono={r.resultado === 'Aprovado' ? 'teal' : 'danger'}>{r.resultado}</Badge>,
          },
          { chave: 'observacoes', label: 'Observações' },
        ]}
        campos={[
          { name: 'ordem_servico_id', label: 'Ordem de serviço', type: 'combobox', opcoes, obrigatorio: true },
          { name: 'resultado', label: 'Resultado', type: 'select', opcoes: ['Aprovado', 'Reprovado'], obrigatorio: true },
          { name: 'observacoes', label: 'Observações', type: 'textarea' },
        ]}
        validar={(d) => {
          if (!d.ordem_servico_id) return 'Selecione a ordem de serviço.';
          if (!d.resultado) return 'Selecione o resultado do teste.';
          return null;
        }}
        antesDeEnviar={(d) => ({ ...d, ordem_servico_id: Number(d.ordem_servico_id) })}
        aposSalvar={async (dados) => {
          await supabase
            .from('ordens_servico')
            .update({
              status_os: dados.resultado === 'Reprovado' ? STATUS_VOLTA_MANUTENCAO : STATUS_CHECKPOINT_B,
            })
            .eq('id', dados.ordem_servico_id as number);
        }}
      />
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
        Caminho alternativo à Selagem, para equipamentos não seláveis (ex: bombas de infusão). Ao salvar como
        aprovado, segue direto para a Bancada de Visão - Checkpoint B. Reprovado volta para "Em manutenção".
      </p>
    </div>
  );
}
