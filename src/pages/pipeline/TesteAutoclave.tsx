import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_VOLTA_MANUTENCAO, STATUS_TESTE_AUTOCLAVE, STATUS_CHECKPOINT_B } from '../../lib/statusOS';

interface TesteAutoclaveRow {
  id: number;
  ordem_servico_id: number;
  numero_ciclo: string | null;
  temperatura_celsius: number | null;
  tempo_minutos: number | null;
  resultado: string;
}

export function TesteAutoclave() {
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes([STATUS_TESTE_AUTOCLAVE]);
  if (isLoading) return <CarregandoTela />;

  return (
    <div>
      <CrudPage<TesteAutoclaveRow>
        titulo="Teste de autoclave"
        tabela="testes_autoclave"
        ordenarPor="id"
        camposFiltro={[(r) => porId(r.ordem_servico_id)?.numero_os ?? '', (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '']}
        valorInicial={{ temperatura_celsius: 134, tempo_minutos: 15 }}
        colunas={[
          {
            chave: 'ordem_servico_id',
            label: 'OS',
            mono: true,
            render: (r) => porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`,
          },
          { chave: 'numero_ciclo', label: 'Ciclo' },
          { chave: 'temperatura_celsius', label: 'Temperatura (°C)' },
          { chave: 'tempo_minutos', label: 'Tempo (min)' },
          {
            chave: 'resultado',
            label: 'Resultado',
            render: (r) => <Badge tono={r.resultado === 'Aprovado' ? 'teal' : 'danger'}>{r.resultado}</Badge>,
          },
        ]}
        campos={[
          { name: 'ordem_servico_id', label: 'Ordem de serviço', type: 'combobox', opcoes, obrigatorio: true },
          { name: 'numero_ciclo', label: 'Número do ciclo', type: 'text' },
          { name: 'temperatura_celsius', label: 'Temperatura (°C)', type: 'number' },
          { name: 'tempo_minutos', label: 'Tempo (minutos)', type: 'number' },
          {
            name: 'resultado',
            label: 'Resultado (ciclo correto + ótica sem embaçamento)',
            type: 'select',
            opcoes: ['Aprovado', 'Reprovado'],
            obrigatorio: true,
          },
          { name: 'observacoes', label: 'Observações', type: 'textarea' },
        ]}
        validar={(d) => {
          if (!d.ordem_servico_id) return 'Selecione a ordem de serviço.';
          if (d.temperatura_celsius === '' || d.temperatura_celsius == null)
            return 'Informe a temperatura do ciclo (°C) para registro.';
          if (d.tempo_minutos === '' || d.tempo_minutos == null)
            return 'Informe o tempo do ciclo (minutos) para registro.';
          if (!d.resultado) return 'Selecione o resultado do teste.';
          return null;
        }}
        antesDeEnviar={(d) => ({
          ...d,
          ordem_servico_id: Number(d.ordem_servico_id),
          temperatura_celsius: d.temperatura_celsius ? Number(d.temperatura_celsius) : null,
          tempo_minutos: d.tempo_minutos ? Number(d.tempo_minutos) : null,
        })}
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
        Ciclo padrão da autoclave ECEL Advance: 134°C / 15 min. Ao salvar como reprovado, a OS volta
        automaticamente para "Em manutenção".
      </p>
    </div>
  );
}
