import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_VOLTA_MANUTENCAO, STATUS_TESTE_ESTANQUEIDADE, STATUS_TESTE_AUTOCLAVE } from '../../lib/statusOS';

interface TesteEstanqueidadeRow {
  id: number;
  ordem_servico_id: number;
  pressao_aplicada_kpa: number;
  pressao_maxima_fabricante_kpa: number | null;
  tempo_segundos: number;
  temperatura_celsius: number | null;
  imersao_total: boolean;
  metodo_observacao: string | null;
  resultado: string;
  ponto_vazamento: string | null;
}

// Método de observação conforme ISO 8600-7: as bolhas devem ser observadas
// com o endoscópio pressurizado internamente E submerso ao mesmo tempo. O
// método de câmara pré-pressurizada (pressuriza a câmara, despressuriza e só
// então submerge) é um DESVIO da norma e é sinalizado no laudo.
const METODO_ISO = 'ISO 8600-7 (pressurizado e submerso)';
const METODO_CAMARA = 'Câmara pré-pressurizada (desvio da norma)';

export function TesteEstanqueidade() {
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes([STATUS_TESTE_ESTANQUEIDADE]);
  // Pressão máxima segura do fabricante, por modelo - cadastrada em
  // "Catálogo de óticas". Usada só pra pré-preencher/sugerir a trava de
  // sobrepressão quando a OS já tem o modelo identificado (catalogo_otica_id);
  // continua editável, o técnico pode ajustar se tiver info mais específica.
  const catalogoQuery = useQuery({
    queryKey: ['catalogo-oticas-pressao-maxima'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalogo_oticas').select('id, pressao_maxima_kpa');
      if (error) throw error;
      return data as { id: number; pressao_maxima_kpa: number | null }[];
    },
  });
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
        camposFiltro={[(r) => porId(r.ordem_servico_id)?.numero_os ?? '', (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '']}
        // Pressão e tempo já vêm preenchidos com o mínimo exigido pela ISO
        // 8600-7 (20 kPa / 60 s) - é o valor que a CVF aplica como padrão de
        // procedimento; o técnico ajusta se aplicar mais margem. Temperatura,
        // método e imersão total ficam em branco de propósito: são leituras/
        // confirmações reais de cada ensaio, não valores fixos da norma.
        valorInicial={{ imersao_total: false, pressao_aplicada_kpa: 20, tempo_segundos: 60 }}
        colunas={[
          {
            chave: 'ordem_servico_id',
            label: 'OS',
            mono: true,
            render: (r) => porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`,
          },
          {
            chave: 'cliente_nome',
            label: 'Cliente',
            render: (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '-',
          },
          { chave: 'pressao_aplicada_kpa', label: 'Pressão (kPa)' },
          { chave: 'tempo_segundos', label: 'Tempo (s)' },
          { chave: 'temperatura_celsius', label: 'Temp. (°C)' },
          { chave: 'imersao_total', label: 'Imersão total', render: (r) => (r.imersao_total ? 'Sim' : 'Não') },
          {
            chave: 'metodo_observacao',
            label: 'Método',
            render: (r) =>
              r.metodo_observacao === METODO_ISO ? (
                <Badge tono="teal">ISO</Badge>
              ) : r.metodo_observacao ? (
                <Badge tono="copper">Desvio</Badge>
              ) : (
                '-'
              ),
          },
          {
            chave: 'resultado',
            label: 'Resultado',
            render: (r) => <Badge tono={r.resultado === 'Aprovado' ? 'teal' : 'danger'}>{r.resultado}</Badge>,
          },
        ]}
        campos={[
          {
            name: 'ordem_servico_id',
            label: 'Ordem de serviço',
            type: 'combobox',
            opcoes,
            obrigatorio: true,
            aoMudar: (id) => {
              const os = porId(Number(id));
              const pMax = os?.catalogo_otica_id
                ? catalogoQuery.data?.find((c) => c.id === os.catalogo_otica_id)?.pressao_maxima_kpa
                : null;
              if (pMax == null) return;
              return { pressao_maxima_fabricante_kpa: pMax };
            },
          },
          {
            name: 'metodo_observacao',
            label: 'Método de observação das bolhas',
            type: 'select',
            opcoes: [METODO_ISO, METODO_CAMARA],
            obrigatorio: true,
          },
          { name: 'pressao_aplicada_kpa', label: 'Pressão aplicada / lida no manômetro (kPa) - mínimo 20', type: 'number', obrigatorio: true },
          {
            name: 'pressao_maxima_fabricante_kpa',
            label: 'Pressão máx. segura do fabricante/RT (kPa) - opcional, trava de segurança da CVF (não é exigência da ISO 8600-7)',
            type: 'number',
          },
          { name: 'tempo_segundos', label: 'Tempo com pressão mantida e imerso (segundos) - mínimo 60', type: 'number', obrigatorio: true },
          { name: 'temperatura_celsius', label: 'Temperatura da água (°C) - entre 10 e 40 (ISO 8600-7)', type: 'number', obrigatorio: true },
          { name: 'imersao_total', label: 'Endoscópio totalmente imerso (obrigatório)', type: 'checkbox' },
          {
            name: 'calibracao_id',
            label: 'Padrão de calibração (manômetro) - se ainda não tiver, explique em Observações (ex.: manômetro novo aguardando calibração)',
            type: 'combobox',
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
          if (!d.metodo_observacao) return 'Selecione o método de observação das bolhas.';
          if (!d.pressao_aplicada_kpa || Number(d.pressao_aplicada_kpa) < 20)
            return 'A pressão aplicada precisa ser de no mínimo 20 kPa (ISO 8600-7).';
          const pMax = Number(d.pressao_maxima_fabricante_kpa);
          if (d.pressao_maxima_fabricante_kpa !== '' && d.pressao_maxima_fabricante_kpa != null && pMax > 0
            && Number(d.pressao_aplicada_kpa) > pMax)
            return `A pressão aplicada (${d.pressao_aplicada_kpa} kPa) excede a máxima segura do fabricante (${pMax} kPa). Risco de dano à ótica - reduza a pressão.`;
          if (!d.tempo_segundos || Number(d.tempo_segundos) < 60)
            return 'O tempo com pressão mantida precisa ser de no mínimo 60 segundos (1 minuto).';
          const t = Number(d.temperatura_celsius);
          if (d.temperatura_celsius === '' || d.temperatura_celsius == null || t < 10 || t > 40)
            return 'A temperatura da água deve estar entre 10 e 40 °C (ISO 8600-7 §4).';
          if (!d.imersao_total) return 'O ensaio exige imersão total do endoscópio (ISO 8600-7). Marque a imersão total.';
          if (!d.calibracao_id && !String(d.observacoes ?? '').trim())
            return 'Sem padrão de calibração selecionado, explique o motivo em Observações (ex.: manômetro novo, ainda aguardando calibração) - a leitura de pressão fica sem rastreabilidade ISO/IEC 17025 até isso ser resolvido.';
          if (!d.resultado) return 'Selecione o resultado do teste.';
          if (d.metodo_observacao === METODO_CAMARA && d.resultado === 'Aprovado'
            && !String(d.observacoes ?? '').trim())
            return 'Método de câmara pré-pressurizada é um desvio da ISO 8600-7 (as bolhas devem ser observadas com o scope pressurizado E submerso). Registre o motivo do desvio em Observações antes de aprovar.';
          return null;
        }}
        antesDeEnviar={(d) => ({
          ...d,
          ordem_servico_id: Number(d.ordem_servico_id),
          pressao_aplicada_kpa: Number(d.pressao_aplicada_kpa),
          pressao_maxima_fabricante_kpa:
            d.pressao_maxima_fabricante_kpa !== '' && d.pressao_maxima_fabricante_kpa != null
              ? Number(d.pressao_maxima_fabricante_kpa)
              : null,
          tempo_segundos: Number(d.tempo_segundos),
          temperatura_celsius: d.temperatura_celsius !== '' && d.temperatura_celsius != null ? Number(d.temperatura_celsius) : null,
          calibracao_id: d.calibracao_id ? Number(d.calibracao_id) : null,
        })}
        aposSalvar={async (dados) => {
          await supabase
            .from('ordens_servico')
            .update({
              status_os: dados.resultado === 'Reprovado' ? STATUS_VOLTA_MANUTENCAO : STATUS_TESTE_AUTOCLAVE,
            })
            .eq('id', dados.ordem_servico_id as number);
        }}
      />
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 8 }}>
        ISO 8600-7: pressão &ge; 20 kPa, &ge; 1 min, imersão total, água a 10-40 °C, com o endoscópio
        <strong> pressurizado internamente E submerso ao mesmo tempo</strong> (método ISO). O método de câmara
        pré-pressurizada é um desvio - exige justificativa em Observações. Informe a pressão máx. do fabricante
        para travar sobrepressão (ex.: 2 kgf/cm² &asymp; 200 kPa &eacute; ~10&times; o mínimo). Manômetro com
        calibração rastreável obrigatória. Bolhas presas por tensão superficial não contam - só fluxo constante
        saindo de um ponto. Reprovado volta para "Em manutenção".
      </p>
    </div>
  );
}
