import { CrudPage } from '../../components/CrudPage';

interface CatalogoOtica {
  id: number;
  fabricante: string;
  modelo: string;
  tipo: string | null;
  diametro_mm: number | null;
  angulo_graus: number | null;
}

export function CatalogoOticas() {
  return (
    <CrudPage<CatalogoOtica>
      titulo="Catálogo de Óticas (Modelos)"
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
        { name: 'tipo', label: 'Tipo', type: 'text' },
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
