import { CrudPage } from '../../components/CrudPage';
import { validarCnpj, formatarCnpj } from '../../lib/cnpj';

interface Cliente {
  id: number;
  razao_social: string;
  cnpj: string;
  hospital_clinica: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
}

export function Clientes() {
  return (
    <CrudPage<Cliente>
      titulo="Clientes / hospitais"
      tabela="clientes"
      ordenarPor="razao_social"
      camposFiltro={['razao_social', 'cnpj', 'hospital_clinica']}
      colunas={[
        { chave: 'razao_social', label: 'Razão social' },
        { chave: 'cnpj', label: 'CNPJ', mono: true },
        { chave: 'hospital_clinica', label: 'Hospital/clínica' },
        { chave: 'telefone', label: 'Telefone' },
        { chave: 'email', label: 'E-mail' },
      ]}
      campos={[
        { name: 'razao_social', label: 'Razão social', type: 'text', obrigatorio: true },
        { name: 'cnpj', label: 'CNPJ', type: 'text', obrigatorio: true },
        { name: 'hospital_clinica', label: 'Hospital/clínica', type: 'text' },
        { name: 'telefone', label: 'Telefone', type: 'text' },
        { name: 'email', label: 'E-mail', type: 'text' },
        { name: 'endereco', label: 'Endereço', type: 'textarea' },
      ]}
      validar={(d) => {
        if (!d.razao_social) return 'Informe a razão social.';
        if (!d.cnpj || !validarCnpj(String(d.cnpj))) return 'CNPJ inválido.';
        return null;
      }}
      antesDeEnviar={(d) => ({ ...d, cnpj: formatarCnpj(String(d.cnpj)) })}
    />
  );
}
