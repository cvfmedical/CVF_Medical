import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';

interface ModalidadeManutencao {
  id: number;
  nome: string;
  status_ativo: boolean;
}

// Catálogo de nomes de modalidade (Básica/Intermediária/Completa etc.) -
// o preço fixo de cada uma é definido POR CLIENTE, em Clientes.tsx
// ("Preços por modalidade"), já que cada cliente paga um valor diferente
// pra mesma modalidade.
export function ModalidadesManutencao() {
  return (
    <CrudPage<ModalidadeManutencao>
      titulo="Modalidades de manutenção"
      tabela="modalidades_manutencao"
      ordenarPor="nome"
      camposFiltro={['nome']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'nome', label: 'Nome' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
          rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
        },
      ]}
      campos={[
        { name: 'nome', label: 'Nome (ex: Básica, Intermediária, Completa)', type: 'text', obrigatorio: true },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => (!d.nome ? 'Informe o nome da modalidade.' : null)}
    />
  );
}
