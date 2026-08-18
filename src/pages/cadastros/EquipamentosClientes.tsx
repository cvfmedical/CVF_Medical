import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { supabase } from '../../lib/supabaseClient';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { formatarModeloOtica } from '../../lib/formato';

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

interface ModeloCatalogo {
  id: number;
  fabricante: string;
  modelo: string;
  tipo: string | null;
  diametro_mm: number | null;
  angulo_graus: number | null;
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

  // Catálogo de óticas (modelos cadastrados) - para puxar o equipamento
  // de um cadastro padrão em vez de digitar o nome à mão.
  const catalogoQuery = useQuery({
    queryKey: ['catalogo-oticas-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalogo_oticas')
        .select('id, fabricante, modelo, tipo, diametro_mm, angulo_graus')
        .order('fabricante');
      if (error) throw error;
      return data as ModeloCatalogo[];
    },
  });

  const clientes = clientesQuery.data ?? [];
  const opcoesCliente = clientes.map((c) => ({ value: String(c.id), label: c.razao_social }));
  const nomeClientePorId = (id: number) => clientes.find((c) => c.id === id)?.razao_social ?? `#${id}`;

  const catalogo = catalogoQuery.data ?? [];
  const opcoesCatalogo = catalogo.map((c) => ({ value: String(c.id), label: formatarModeloOtica(c) }));

  if (clientesQuery.isLoading) return <CarregandoTela />;

  return (
    <CrudPage<EquipamentoCliente>
      titulo="Equipamentos do cliente"
      tabela="equipamentos_clientes"
      ordenarPor="descricao"
      camposFiltro={['descricao', 'numero_serie', 'fabricante']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'descricao', label: 'Descrição' },
        { chave: 'cliente_id', label: 'Cliente', render: (r) => nomeClientePorId(r.cliente_id) },
        { chave: 'fabricante', label: 'Fabricante' },
        { chave: 'modelo', label: 'Modelo' },
        { chave: 'numero_serie', label: 'Nº de série', mono: true },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
        },
      ]}
      campos={[
        { name: 'cliente_id', label: 'Cliente', type: 'combobox', opcoes: opcoesCliente, obrigatorio: true },
        {
          name: '_catalogo',
          label: 'Puxar do catálogo de óticas (preenche os campos abaixo)',
          type: 'select',
          opcoes: opcoesCatalogo,
          aoMudar: (id) => {
            const c = catalogo.find((x) => String(x.id) === id);
            if (!c) return;
            return {
              descricao: formatarModeloOtica(c),
              fabricante: c.fabricante ?? '',
              modelo: c.modelo ?? '',
              tipo_equipamento: c.tipo ?? '',
            };
          },
        },
        { name: 'descricao', label: 'Descrição', type: 'text', obrigatorio: true },
        { name: 'tipo_equipamento', label: 'Tipo de equipamento', type: 'text' },
        { name: 'fabricante', label: 'Fabricante', type: 'text' },
        { name: 'modelo', label: 'Modelo', type: 'text' },
        { name: 'numero_serie', label: 'Número de série', type: 'text' },
        { name: 'data_aquisicao', label: 'Data de aquisição', type: 'date' },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => {
        if (!d.cliente_id) return 'Selecione o cliente.';
        if (!d.descricao) return 'Informe a descrição.';
        return null;
      }}
      antesDeEnviar={(d) => {
        // _catalogo é só um atalho de UI - não é coluna da tabela.
        const { _catalogo, ...resto } = d;
        void _catalogo;
        return { ...resto, cliente_id: Number(d.cliente_id) };
      }}
    />
  );
}
