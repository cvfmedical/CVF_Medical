import { useQuery } from '@tanstack/react-query';
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
  temperatura_celsius: number | null;
  imersao_total: boolean;
  resultado: string;
  ponto_vazamento: string | null;
}

export function TesteEstanqueidade() {
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  const padroesQuery = useQuery({
    queryKey: ['padroes-calibracao-ativos-est'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('padroes_calibracao')
        .select('id, identificacao')
        .eq('status_ativo', true)
        .order('identificacao');
      if (error) throw error;
      return data as { id: number; identificacao: string }[];
    },
  });
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
          { chave: 'temperatura_celsius', label: 'Temp. (°C)' },
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
          { name: 'temperatura_celsius', label: 'Temperatura da água (°C) - entre 10 e 40 (ISO 8600-7)', type: 'number', obrigatorio: true },
          { name: 'imersao_total', label: 'Endoscópio totalmente imerso (obrigatório)', type: 'checkbox' },
          {
            name: 'calibracao_id',
            label: 'Padrão de calibração (manômetro)',
            type: 'select',
            opcoes: (padroesQuery.data ?? []).map((p) => ({ value: String(p.id), label: p.identificacao })),
          },
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
          const t = Number(d.temperatura_celsius);
          if (d.temperatura_celsius === '' || d.temperatura_celsius == null || t < 10 || t > 40)
            return 'A temperatura da água deve estar entre 10 e 40 °C (ISO 8600-7 §4).';
          if (!d.imersao_total) return 'O ensaio exige imersão total do endoscópio (ISO 8600-7). Marque a imersão total.';
          if (!d.resultado) return 'Selecione o resultado do teste.';
          return null;
        }}
        antesDeEnviar={(d) => ({
          ...d,
          ordem_servico_id: Number(d.ordem_servico_id),
          pressao_aplicada_kpa: Number(d.pressao_aplicada_kpa),
          tempo_segundos: Number(d.tempo_segundos),
          temperatura_celsius: d.temperatura_celsius !== '' && d.temperatura_celsius != null ? Number(d.temperatura_celsius) : null,
          calibracao_id: d.calibracao_id ? Number(d.calibracao_id) : null,
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
        ISO 8600-7: pressão &ge; 20 kPa, &ge; 1 min, imersão total, água a 10-40 °C. Bolhas presas por tensão
        superficial não contam - só fluxo constante saindo de um ponto. Reprovado volta para "Em manutenção".
      </p>
    </div>
  );
}
