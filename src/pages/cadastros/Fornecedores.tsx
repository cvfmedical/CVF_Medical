import { CrudPage } from '../../components/CrudPage';
import { validarCnpj, formatarCnpj } from '../../lib/cnpj';
import { Badge } from '../../components/Badge';

interface Fornecedor {
  id: number;
  razao_social: string;
  cnpj: string | null;
  contato_nome: string | null;
  telefone: string | null;
  email: string | null;
  categoria_fornecimento: string | null;
  endereco: string | null;
  status_ativo: boolean;
}

export function Fornecedores() {
  return (
    <CrudPage<Fornecedor>
      titulo="Fornecedores"
      tabela="fornecedores"
      ordenarPor="razao_social"
      camposFiltro={['razao_social', 'cnpj', 'categoria_fornecimento']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'razao_social', label: 'Razão social' },
        { chave: 'cnpj', label: 'CNPJ', mono: true },
        { chave: 'contato_nome', label: 'Contato' },
        { chave: 'categoria_fornecimento', label: 'Categoria' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
          rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
        },
      ]}
      campos={[
        { name: 'razao_social', label: 'Razão social', type: 'text', obrigatorio: true },
        { name: 'cnpj', label: 'CNPJ', type: 'text' },
        { name: 'contato_nome', label: 'Nome do contato', type: 'text' },
        { name: 'telefone', label: 'Telefone', type: 'text' },
        { name: 'email', label: 'E-mail', type: 'text' },
        { name: 'categoria_fornecimento', label: 'Categoria de fornecimento', type: 'text' },
        { name: 'endereco', label: 'Endereço', type: 'textarea' },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => {
        if (!d.razao_social) return 'Informe a razão social.';
        if (d.cnpj && !validarCnpj(String(d.cnpj))) return 'CNPJ inválido.';
        return null;
      }}
      antesDeEnviar={(d) => (d.cnpj ? { ...d, cnpj: formatarCnpj(String(d.cnpj)) } : d)}
    />
  );
}
