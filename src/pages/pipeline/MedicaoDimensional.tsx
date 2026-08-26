import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_CHECKPOINT_A, STATUS_CHECKPOINT_B } from '../../lib/statusOS';
import { useEntradaOrcamentoPorOS } from '../../lib/useEntradaOrcamentoPorOS';

// Medição dimensional - largura máxima da parte de inserção (ISO 8600-4).
// Diâmetro do círculo circunscrito (mm) + French size (Fr = 3 x diâmetro para
// seção circular). Paquímetro com exatidão >= 0,05 mm (rastreável).

interface MedicaoDimRow {
  id: number;
  ordem_servico_id: number;
  diametro_max_mm: number | null;
  french_size: number | null;
  resultado: string | null;
}

export function MedicaoDimensional() {
  const navigate = useNavigate();
  // Mesma janela do Checkpoint A/B (bancada de visão) - sem isso o
  // combobox listava OS de qualquer etapa do pipeline.
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes([STATUS_CHECKPOINT_A, STATUS_CHECKPOINT_B]);
  const { codigoEntradaPorOS, orcamentoPorOS } = useEntradaOrcamentoPorOS();
  const padroesQuery = useQuery({
    queryKey: ['padroes-calibracao-ativos-dim'],
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
      <CrudPage<MedicaoDimRow>
        titulo="Medição dimensional (ISO 8600-4)"
        tabela="medicoes_dimensionais"
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
          { chave: 'diametro_max_mm', label: 'Diâmetro máx. (mm)' },
          { chave: 'french_size', label: 'French (Fr)' },
          {
            chave: 'resultado',
            label: 'Resultado',
            render: (r) => (r.resultado ? <Badge tono={r.resultado === 'Aprovado' ? 'teal' : 'danger'}>{r.resultado}</Badge> : '-'),
          },
        ]}
        campos={[
          { name: 'ordem_servico_id', label: 'Ordem de serviço', type: 'combobox', opcoes, obrigatorio: true },
          { name: 'diametro_max_mm', label: 'Diâmetro máx. do círculo circunscrito (mm)', type: 'number', obrigatorio: true },
          {
            name: 'calibracao_id',
            label: 'Padrão de calibração (paquímetro >= 0,05 mm)',
            type: 'combobox',
            opcoes: (padroesQuery.data ?? []).map((p) => ({ value: String(p.id), label: p.identificacao })),
          },
          {
            name: 'resultado',
            label: 'Resultado (<= largura declarada pelo fabricante - ISO 8600-1 §4.3)',
            type: 'select',
            opcoes: ['Aprovado', 'Reprovado'],
          },
          { name: 'observacoes', label: 'Observações', type: 'textarea' },
        ]}
        validar={(d) => {
          if (!d.ordem_servico_id) return 'Selecione a ordem de serviço.';
          if (d.diametro_max_mm === '' || d.diametro_max_mm == null) return 'Informe o diâmetro máximo medido.';
          return null;
        }}
        antesDeEnviar={(d) => {
          const diam = d.diametro_max_mm !== '' && d.diametro_max_mm != null ? Number(d.diametro_max_mm) : null;
          return {
            ...d,
            ordem_servico_id: Number(d.ordem_servico_id),
            diametro_max_mm: diam,
            french_size: diam != null ? Number((diam * 3).toFixed(1)) : null,
            calibracao_id: d.calibracao_id ? Number(d.calibracao_id) : null,
          };
        }}
      />
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
        ISO 8600-4: maior diâmetro do círculo circunscrito perpendicular ao eixo. French (Fr) = 3 × diâmetro
        (seção circular). Use paquímetro com exatidão &ge; 0,05 mm, calibrado.
      </p>
    </div>
  );
}
