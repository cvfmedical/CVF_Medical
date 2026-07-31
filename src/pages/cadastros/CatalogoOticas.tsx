import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { supabase } from '../../lib/supabaseClient';

interface CatalogoOtica {
  id: number;
  fabricante: string;
  modelo: string;
  tipo: string | null;
  diametro_mm: number | null;
  angulo_graus: number | null;
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

  return (
    <CrudPage<CatalogoOtica>
      titulo="Catálogo de óticas (modelos)"
      tabela="catalogo_oticas"
      ordenarPor="fabricante"
      camposFiltro={['fabricante', 'modelo', 'tipo']}
      colunas={[
        { chave: 'fabricante', label: 'Fabricante' },
        { chave: 'modelo', label: 'Modelo' },
        { chave: 'tipo', label: 'Tipo' },
        { chave: 'diametro_mm', label: 'Diâmetro (mm)' },
        { chave: 'angulo_graus', label: 'Ângulo (°)' },
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
        { name: 'angulo_graus', label: 'Ângulo (graus)', type: 'number' },
      ]}
      validar={(d) => {
        if (!d.fabricante) return 'Informe o fabricante.';
        if (!d.modelo) return 'Informe o modelo.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        diametro_mm: d.diametro_mm ? Number(d.diametro_mm) : null,
        angulo_graus: d.angulo_graus ? Number(d.angulo_graus) : null,
      })}
    />
  );
}
