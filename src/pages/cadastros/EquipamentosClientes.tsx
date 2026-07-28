import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { supabase } from '../../lib/supabaseClient';

interface EquipamentoCliente {
  id: number;
  cliente_id: number;
  descricao: string;
  tipo_equipamento: string | null;
  fabricante: string | null;
  modelo: string | null;
  numero_serie: string | null;
  data_aquisicao: string | null;
  status_ativo: boolean;
  observacoes: string | null;
}

export function EquipamentosClientes() {
  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  const clientes = clientesQuery.data ?? [];
  const opcoesCliente = clientes.map((c) => ({ value: String(c.id), label: c.razao_social }));
  const nomeClientePorId = (id: number) => clientes.find((c) => c.id === id)?.razao_social ?? `#${id}`;

  if (clientesQuery.isLoading) return <p>Carregando...</p>;

  return (
    <CrudPage<EquipamentoCliente>
      titulo="Equipamentos do Cliente"
      tabela="equipamentos_clientes"
      ordenarPor="descricao"
      camposFiltro={['descricao', 'numero_serie', 'fabricante']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'descricao', label: 'Descrição' },
        { chave: 'cliente_id', label: 'Cliente', render: (r) => nomeClientePorId(r.cliente_id) },
        { chave: 'fabricante', label: 'Fabricante' },
        { chave: 'modelo', label: 'Modelo' },
        { chave: 'numero_serie', label: 'Nº Série' },
        { chave: 'status_ativo', label: 'Ativo', render: (r) => (r.status_ativo ? 'Sim' : 'Não') },
      ]}
      campos={[
        { name: 'cliente_id', label: 'Cliente', type: 'select', opcoes: opcoesCliente, obrigatorio: true },
        { name: 'descricao', label: 'Descrição', type: 'text', obrigatorio: true },
        { name: 'tipo_equipamento', label: 'Tipo de Equipamento', type: 'text' },
        { name: 'fabricante', label: 'Fabricante', type: 'text' },
        { name: 'modelo', label: 'Modelo', type: 'text' },
        { name: 'numero_serie', label: 'Número de Série', type: 'text' },
        { name: 'data_aquisicao', label: 'Data de Aquisição', type: 'date' },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => {
        if (!d.cliente_id) return 'Selecione o cliente.';
        if (!d.descricao) return 'Informe a descrição.';
        return null;
      }}
      antesDeEnviar={(d) => ({ ...d, cliente_id: Number(d.cliente_id) })}
    />
  );
}
