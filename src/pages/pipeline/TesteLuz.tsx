import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';

// Teste de luz / transmissão (interno, NÃO-normativo pela ISO 8600).
// Mede o lux emitido vs um baseline por diâmetro; corte em 70% -> propor
// troca da cânula fibrada. Também registra se a direção/uniformidade do
// feixe está OK. Rastreabilidade via padrão de calibração (luxímetro).

interface TesteLuzRow {
  id: number;
  ordem_servico_id: number;
  diametro_mm: number | null;
  lux_medido: number | null;
  lux_baseline: number | null;
  percentual: number | null;
  direcao_luz_ok: boolean | null;
  resultado: string;
}

export function TesteLuz() {
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  const padroesQuery = useQuery({
    queryKey: ['padroes-calibracao-ativos-luz'],
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
      <CrudPage<TesteLuzRow>
        titulo="Teste de luz / transmissão (luxímetro)"
        tabela="testes_luz"
        ordenarPor="id"
        colunas={[
          {
            chave: 'ordem_servico_id',
            label: 'OS',
            mono: true,
            render: (r) => porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`,
          },
          { chave: 'diametro_mm', label: 'Diâm. (mm)' },
          { chave: 'lux_medido', label: 'Lux medido' },
          { chave: 'lux_baseline', label: 'Baseline' },
          { chave: 'percentual', label: '% baseline', render: (r) => (r.percentual != null ? `${r.percentual}%` : '-') },
          {
            chave: 'resultado',
            label: 'Resultado',
            render: (r) => <Badge tono={r.resultado === 'Aprovado' ? 'teal' : 'danger'}>{r.resultado}</Badge>,
          },
        ]}
        campos={[
          { name: 'ordem_servico_id', label: 'Ordem de serviço', type: 'select', opcoes, obrigatorio: true },
          { name: 'diametro_mm', label: 'Diâmetro da ótica (mm)', type: 'number' },
          { name: 'lux_medido', label: 'Lux medido (luxímetro)', type: 'number' },
          { name: 'lux_baseline', label: 'Baseline do diâmetro (lux de referência)', type: 'number' },
          { name: 'direcao_luz_ok', label: 'Direção/uniformidade do feixe OK', type: 'checkbox' },
          {
            name: 'calibracao_id',
            label: 'Padrão de calibração (luxímetro)',
            type: 'select',
            opcoes: (padroesQuery.data ?? []).map((p) => ({ value: String(p.id), label: p.identificacao })),
          },
          {
            name: 'resultado',
            label: 'Resultado (corte em 70% do baseline -> propor troca da cânula fibrada)',
            type: 'select',
            opcoes: ['Aprovado', 'Reprovado'],
            obrigatorio: true,
          },
          { name: 'observacoes', label: 'Observações', type: 'textarea' },
        ]}
        validar={(d) => {
          if (!d.ordem_servico_id) return 'Selecione a ordem de serviço.';
          if (!d.resultado) return 'Selecione o resultado do teste.';
          return null;
        }}
        antesDeEnviar={(d) => {
          const lm = d.lux_medido !== '' && d.lux_medido != null ? Number(d.lux_medido) : null;
          const lb = d.lux_baseline !== '' && d.lux_baseline != null ? Number(d.lux_baseline) : null;
          return {
            ...d,
            ordem_servico_id: Number(d.ordem_servico_id),
            diametro_mm: d.diametro_mm !== '' && d.diametro_mm != null ? Number(d.diametro_mm) : null,
            lux_medido: lm,
            lux_baseline: lb,
            percentual: lm != null && lb ? Number(((lm / lb) * 100).toFixed(1)) : null,
            calibracao_id: d.calibracao_id ? Number(d.calibracao_id) : null,
          };
        }}
      />
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
        Ensaio interno de qualidade (não normatizado pela ISO 8600). O sistema calcula o % do baseline; abaixo de
        70% recomenda-se a troca da cânula fibrada.
      </p>
    </div>
  );
}
