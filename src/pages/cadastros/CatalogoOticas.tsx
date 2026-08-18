import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { supabase } from '../../lib/supabaseClient';

interface CatalogoOtica {
  id: number;
  fabricante: string;
  modelo: string;
  tipo: string | null;
  diametro_mm: number | null;
  angulo_graus: number | null; // direção de visão nominal (ISO 8600-1 §4.6)
  fov_referencia_graus: number | null; // FOV do golden sample (ISO 8600-1 §4.5)
  tolerancia_fov_pct: number | null;
  tolerancia_direcao_graus: number | null;
  distancia_medicao_mm: number | null;
  metodo_iso: string | null;
  mtf50_referencia_ciclos_px: number | null; // golden sample de resolução (ISO 8600-5)
  resolucao_tolerancia_pct: number | null;
  grupo: string | null;
  subgrupo: string | null;
}

export function CatalogoOticas() {
  const tiposQuery = useQuery({
    queryKey: ['tipos-otica-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_otica')
        .select('id, descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { id: number; descricao: string }[];
    },
  });

  const gruposQuery = useQuery({
    queryKey: ['grupos-produtos-servicos-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_produtos_servicos')
        .select('descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { descricao: string }[];
    },
  });

  const subgruposQuery = useQuery({
    queryKey: ['subgrupos-produtos-servicos-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subgrupos')
        .select('grupo, descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { grupo: string; descricao: string }[];
    },
  });

  return (
    <CrudPage<CatalogoOtica>
      titulo="Catálogo de óticas (modelos)"
      tabela="catalogo_oticas"
      ordenarPor="fabricante"
      camposFiltro={['fabricante', 'modelo', 'tipo']}
      // Novos modelos já nascem com os critérios ISO 8600-1 (15% / 10°),
      // distância do Método A (50mm) e método A por padrão.
      valorInicial={{
        tolerancia_fov_pct: 15,
        tolerancia_direcao_graus: 10,
        distancia_medicao_mm: 50,
        metodo_iso: 'A',
        resolucao_tolerancia_pct: 20,
      }}
      colunas={[
        { chave: 'fabricante', label: 'Fabricante' },
        { chave: 'modelo', label: 'Modelo' },
        { chave: 'tipo', label: 'Tipo' },
        { chave: 'diametro_mm', label: 'Diâmetro (mm)' },
        { chave: 'angulo_graus', label: 'Direção (°)' },
        { chave: 'grupo', label: 'Grupo' },
        { chave: 'subgrupo', label: 'Subgrupo' },
        {
          chave: 'fov_referencia_graus',
          label: 'FOV ref. (°)',
          render: (r) =>
            r.fov_referencia_graus != null ? `${r.fov_referencia_graus}°` : '— (sem golden sample)',
        },
      ]}
      campos={[
        { name: 'fabricante', label: 'Fabricante', type: 'text', obrigatorio: true },
        { name: 'modelo', label: 'Modelo', type: 'text', obrigatorio: true },
        {
          name: 'tipo',
          label: 'Tipo',
          type: 'select',
          opcoes: (tiposQuery.data ?? []).map((t) => ({ value: t.descricao, label: t.descricao })),
        },
        { name: 'diametro_mm', label: 'Diâmetro (mm)', type: 'number' },
        { name: 'angulo_graus', label: 'Direção de visão nominal (°) — ex.: 0/30/45/70', type: 'number' },
        {
          name: 'grupo',
          label: 'Grupo (mesmo cadastro usado em Cadastro de itens - ex.: "ÓTICA RIGIDA", "MINI ÓTICA RIGIDA")',
          type: 'combobox',
          opcoes: (gruposQuery.data ?? []).map((g) => g.descricao),
        },
        {
          name: 'subgrupo',
          label: 'Subgrupo - a lista abaixo mostra "grupo › subgrupo"',
          type: 'combobox',
          opcoes: (subgruposQuery.data ?? []).map((s) => ({ value: s.descricao, label: `${s.grupo} › ${s.descricao}` })),
        },
        {
          name: 'fov_referencia_graus',
          label: 'FOV de referência (°) — normalmente vem do golden sample',
          type: 'number',
        },
        { name: 'tolerancia_fov_pct', label: 'Tolerância FOV (%) — ISO 8600-1 §4.5', type: 'number' },
        {
          name: 'tolerancia_direcao_graus',
          label: 'Tolerância direção (°) — ISO 8600-1 §4.6',
          type: 'number',
        },
        {
          name: 'distancia_medicao_mm',
          label: 'Distância de medição (mm) — Método A = 50',
          type: 'number',
        },
        {
          name: 'metodo_iso',
          label: 'Método ISO 8600-3',
          type: 'select',
          opcoes: [
            { value: 'A', label: 'A — janela distal (50 mm)' },
            { value: 'B', label: 'B — pupila de entrada' },
          ],
        },
        {
          name: 'mtf50_referencia_ciclos_px',
          label: 'MTF50 de referência (ciclos/px) — resolução (golden sample, ISO 8600-5)',
          type: 'number',
        },
        {
          name: 'resolucao_tolerancia_pct',
          label: 'Tolerância de resolução (%) — mínimo aceitável vs referência',
          type: 'number',
        },
      ]}
      validar={(d) => {
        if (!d.fabricante) return 'Informe o fabricante.';
        if (!d.modelo) return 'Informe o modelo.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        grupo: d.grupo || null,
        subgrupo: d.subgrupo || null,
        diametro_mm: d.diametro_mm ? Number(d.diametro_mm) : null,
        angulo_graus: d.angulo_graus !== '' && d.angulo_graus != null ? Number(d.angulo_graus) : null,
        fov_referencia_graus:
          d.fov_referencia_graus !== '' && d.fov_referencia_graus != null
            ? Number(d.fov_referencia_graus)
            : null,
        tolerancia_fov_pct:
          d.tolerancia_fov_pct !== '' && d.tolerancia_fov_pct != null ? Number(d.tolerancia_fov_pct) : 15,
        tolerancia_direcao_graus:
          d.tolerancia_direcao_graus !== '' && d.tolerancia_direcao_graus != null
            ? Number(d.tolerancia_direcao_graus)
            : 10,
        distancia_medicao_mm:
          d.distancia_medicao_mm !== '' && d.distancia_medicao_mm != null
            ? Number(d.distancia_medicao_mm)
            : 50,
        metodo_iso: d.metodo_iso || 'A',
        mtf50_referencia_ciclos_px:
          d.mtf50_referencia_ciclos_px !== '' && d.mtf50_referencia_ciclos_px != null
            ? Number(d.mtf50_referencia_ciclos_px)
            : null,
        resolucao_tolerancia_pct:
          d.resolucao_tolerancia_pct !== '' && d.resolucao_tolerancia_pct != null
            ? Number(d.resolucao_tolerancia_pct)
            : 20,
      })}
    />
  );
}
