import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { formatarModeloOtica, type ModeloOticaResumo } from '../../lib/formato';

// Amostra-padrão (golden sample): medição de uma unidade comprovadamente boa
// de um modelo, cujo FOV vira a REFERÊNCIA da CVF (o fabricante não publica
// FOV por modelo). Ao salvar como ativa, grava fov_referencia_graus no
// catálogo do modelo — é contra esse valor que a bancada aplica o ±15%.

interface AmostraPadrao {
  id: number;
  catalogo_otica_id: number;
  numero_serie_padrao: string | null;
  origem: string | null;
  fov_medido_graus: number;
  direcao_medida_graus: number | null;
  incerteza_fov_graus: number | null;
  distancia_medicao_mm: number | null;
  calibracao_id: number | null;
  data_medicao: string | null;
  tecnico: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export function AmostrasPadrao() {
  const modelosQuery = useQuery({
    queryKey: ['catalogo-oticas-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalogo_oticas')
        .select('id, fabricante, modelo, tipo, diametro_mm, angulo_graus')
        .order('fabricante');
      if (error) throw error;
      return data as (ModeloOticaResumo & { id: number })[];
    },
  });

  const padroesQuery = useQuery({
    queryKey: ['padroes-calibracao-ativos'],
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

  const mapaModelo = useMemo(() => {
    const m = new Map<number, string>();
    (modelosQuery.data ?? []).forEach((o) => m.set(o.id, formatarModeloOtica(o)));
    return m;
  }, [modelosQuery.data]);

  return (
    <CrudPage<AmostraPadrao>
      titulo="Amostras-padrão (golden sample)"
      tabela="amostras_padrao"
      ordenarPor="data_medicao"
      camposFiltro={['numero_serie_padrao', 'origem', 'tecnico']}
      valorInicial={{ ativo: true, distancia_medicao_mm: 50 }}
      colunas={[
        {
          chave: 'catalogo_otica_id',
          label: 'Modelo',
          render: (r) => mapaModelo.get(r.catalogo_otica_id) ?? String(r.catalogo_otica_id),
          valorFiltro: (r) => mapaModelo.get(r.catalogo_otica_id) ?? String(r.catalogo_otica_id),
        },
        { chave: 'fov_medido_graus', label: 'FOV ref. (°)', render: (r) => `${r.fov_medido_graus}°` },
        {
          chave: 'direcao_medida_graus',
          label: 'Direção (°)',
          render: (r) => (r.direcao_medida_graus != null ? `${r.direcao_medida_graus}°` : '—'),
        },
        { chave: 'data_medicao', label: 'Data' },
        {
          chave: 'ativo',
          label: 'Referência ativa',
          render: (r) => <Badge tono={r.ativo ? 'teal' : 'neutro'}>{r.ativo ? 'Ativa' : 'Inativa'}</Badge>,
          rotuloFiltro: (r) => (r.ativo ? 'Ativa' : 'Inativa'),
        },
      ]}
      campos={[
        {
          name: 'catalogo_otica_id',
          label: 'Modelo de ótica',
          type: 'combobox',
          obrigatorio: true,
          opcoes: (modelosQuery.data ?? []).map((o) => ({
            value: String(o.id),
            label: formatarModeloOtica(o),
          })),
        },
        { name: 'numero_serie_padrao', label: 'Nº de série da unidade padrão', type: 'text' },
        { name: 'origem', label: 'Origem (ex.: unidade nova aprovada pelo fabricante)', type: 'text' },
        { name: 'fov_medido_graus', label: 'FOV medido (°)', type: 'number', obrigatorio: true },
        { name: 'direcao_medida_graus', label: 'Direção de visão medida (°)', type: 'number' },
        { name: 'incerteza_fov_graus', label: 'Incerteza do FOV (° , k=2 / 95%)', type: 'number' },
        { name: 'distancia_medicao_mm', label: 'Distância de medição (mm)', type: 'number' },
        {
          name: 'calibracao_id',
          label: 'Padrão de calibração usado (alvo)',
          type: 'combobox',
          opcoes: (padroesQuery.data ?? []).map((p) => ({ value: String(p.id), label: p.identificacao })),
        },
        { name: 'data_medicao', label: 'Data da medição', type: 'date' },
        { name: 'tecnico', label: 'Técnico responsável', type: 'text' },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
        { name: 'ativo', label: 'Usar como referência ativa deste modelo', type: 'checkbox' },
      ]}
      validar={(d) => {
        if (!d.catalogo_otica_id) return 'Selecione o modelo de ótica.';
        if (d.fov_medido_graus === '' || d.fov_medido_graus == null) return 'Informe o FOV medido.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        catalogo_otica_id: Number(d.catalogo_otica_id),
        fov_medido_graus: Number(d.fov_medido_graus),
        direcao_medida_graus:
          d.direcao_medida_graus !== '' && d.direcao_medida_graus != null
            ? Number(d.direcao_medida_graus)
            : null,
        incerteza_fov_graus:
          d.incerteza_fov_graus !== '' && d.incerteza_fov_graus != null
            ? Number(d.incerteza_fov_graus)
            : null,
        distancia_medicao_mm:
          d.distancia_medicao_mm !== '' && d.distancia_medicao_mm != null
            ? Number(d.distancia_medicao_mm)
            : 50,
        calibracao_id: d.calibracao_id ? Number(d.calibracao_id) : null,
      })}
      // Ao gravar uma amostra ATIVA, ela vira a referência de FOV do modelo:
      // atualiza catalogo_oticas.fov_referencia_graus e desativa as demais
      // amostras do mesmo modelo (só 1 referência vigente por modelo).
      aposSalvar={async (dados) => {
        if (!dados.ativo) return;
        const modeloId = Number(dados.catalogo_otica_id);
        await supabase
          .from('catalogo_oticas')
          .update({ fov_referencia_graus: Number(dados.fov_medido_graus) })
          .eq('id', modeloId);
      }}
    />
  );
}
