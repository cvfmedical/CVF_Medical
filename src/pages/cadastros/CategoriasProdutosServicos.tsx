import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';

interface Categoria {
  id: number;
  descricao: string;
  eh_otica: boolean | null;
  status_ativo: boolean;
}

export function CategoriasProdutosServicos() {
  return (
    <CrudPage<Categoria>
      titulo="Grupos de produtos e serviços"
      tabela="categorias_produtos_servicos"
      ordenarPor="descricao"
      camposFiltro={['descricao']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'descricao', label: 'Descrição' },
        {
          chave: 'eh_otica',
          label: 'Aplica a',
          render: (r) =>
            r.eh_otica === true ? (
              <Badge tono="neutro">Só ótica</Badge>
            ) : r.eh_otica === false ? (
              <Badge tono="neutro">Só não-ótica</Badge>
            ) : (
              <Badge tono="neutro">Ambos</Badge>
            ),
        },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
          rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
        },
      ]}
      campos={[
        { name: 'descricao', label: 'Descrição', type: 'text', obrigatorio: true },
        {
          name: 'eh_otica',
          label: 'Aplica a (filtra o catálogo de itens no Orçamento Técnico conforme a OS seja ou não de uma ótica)',
          type: 'select',
          opcoes: [
            { value: '', label: 'Ambos (ótica e não-ótica)' },
            { value: 'true', label: 'Só ótica' },
            { value: 'false', label: 'Só não-ótica' },
          ],
        },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      antesDeEnviar={(d) => ({
        ...d,
        eh_otica: d.eh_otica === 'true' ? true : d.eh_otica === 'false' ? false : null,
      })}
      validar={(d) => (!d.descricao ? 'Informe a descrição.' : null)}
    />
  );
}
