import { CrudPage } from '../../components/CrudPage';
import { validarCnpj, formatarCnpj } from '../../lib/cnpj';
import { Badge } from '../../components/Badge';

interface Transportadora {
  id: number;
  razao_social: string;
  cnpj: string | null;
  contato_nome: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  status_ativo: boolean;
}

export function Transportadoras() {
  return (
    <CrudPage<Transportadora>
      titulo="Transportadoras"
      tabela="transportadoras"
      ordenarPor="razao_social"
      camposFiltro={['razao_social', 'cnpj']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'razao_social', label: 'Razão social' },
        { chave: 'cnpj', label: 'CNPJ', mono: true },
        { chave: 'contato_nome', label: 'Contato' },
        { chave: 'telefone', label: 'Telefone' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
        },
      ]}
      campos={[
        { name: 'razao_social', label: 'Razão social', type: 'text', obrigatorio: true },
        { name: 'cnpj', label: 'CNPJ', type: 'text' },
        { name: 'contato_nome', label: 'Nome do contato', type: 'text' },
        { name: 'telefone', label: 'Telefone', type: 'text' },
        { name: 'email', label: 'E-mail', type: 'text' },
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
