import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_VOLTA_MANUTENCAO } from '../../lib/statusOS';

interface TesteEstanqueidadeRow {
  id: number;
  ordem_servico_id: number;
  pressao_aplicada_kpa: number;
  tempo_segundos: number;
  imersao_total: boolean;
  resultado: string;
  ponto_vazamento: string | null;
}

export function TesteEstanqueidade() {
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  if (isLoading) return <CarregandoTela />;

  return (
    <div>
      <CrudPage<TesteEstanqueidadeRow>
        titulo="Teste de estanqueidade"
        tabela="testes_estanqueidade"
        ordenarPor="id"
        valorInicial={{ imersao_total: false }}
        colunas={[
          {
            chave: 'ordem_servico_id',
            label: 'OS',
            mono: true,
            render: (r) => porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`,
          },
          { chave: 'pressao_aplicada_kpa', label: 'Pressão (kPa)' },
          { chave: 'tempo_segundos', label: 'Tempo (s)' },
          { chave: 'imersao_total', label: 'Imersão total', render: (r) => (r.imersao_total ? 'Sim' : 'Não') },
          {
            chave: 'resultado',
            label: 'Resultado',
            render: (r) => <Badge tono={r.resultado === 'Aprovado' ? 'teal' : 'danger'}>{r.resultado}</Badge>,
          },
        ]}
        campos={[
          { name: 'ordem_servico_id', label: 'Ordem de serviço', type: 'select', opcoes, obrigatorio: true },
          { name: 'pressao_aplicada_kpa', label: 'Pressão aplicada (kPa) - mínimo 20', type: 'number', obrigatorio: true },
          { name: 'tempo_segundos', label: 'Tempo com pressão mantida (segundos) - mínimo 60', type: 'number', obrigatorio: true },
          { name: 'imersao_total', label: 'Endoscópio totalmente imerso', type: 'checkbox' },
          {
            name: 'resultado',
            label: 'Resultado (fluxo constante de bolhas de um ponto = reprovado)',
            type: 'select',
            opcoes: ['Aprovado', 'Reprovado'],
            obrigatorio: true,
          },
          { name: 'ponto_vazamento', label: 'Ponto do vazamento (se reprovado)', type: 'text' },
          { name: 'observacoes', label: 'Observações', type: 'textarea' },
        ]}
        validar={(d) => {
          if (!d.ordem_servico_id) return 'Selecione a ordem de serviço.';
          if (!d.pressao_aplicada_kpa || Number(d.pressao_aplicada_kpa) < 20)
            return 'A pressão aplicada precisa ser de no mínimo 20 kPa (ISO 8600-7).';
          if (!d.tempo_segundos || Number(d.tempo_segundos) < 60)
            return 'O tempo com pressão mantida precisa ser de no mínimo 60 segundos (1 minuto).';
          if (!d.resultado) return 'Selecione o resultado do teste.';
          return null;
        }}
        antesDeEnviar={(d) => ({
          ...d,
          ordem_servico_id: Number(d.ordem_servico_id),
          pressao_aplicada_kpa: Number(d.pressao_aplicada_kpa),
          tempo_segundos: Number(d.tempo_segundos),
        })}
        aposSalvar={async (dados) => {
          await supabase
            .from('ordens_servico')
            .update({
              status_os: dados.resultado === 'Reprovado' ? STATUS_VOLTA_MANUTENCAO : '8. TESTE DE AUTOCLAVE',
            })
            .eq('id', dados.ordem_servico_id as number);
        }}
      />
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
        Reprovado: bolhas presas por tensão superficial não contam como falha, só fluxo constante saindo de um
        ponto específico. Ao salvar como reprovado, a OS volta automaticamente para "Em manutenção".
      </p>
    </div>
  );
}
