import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';

interface ContaPagar {
  id: number;
  numero_conta: string;
  fornecedor_id: number | null;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  status: string;
  observacoes: string | null;
}

async function gerarNumeroConta(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('contas_pagar')
    .select('id', { count: 'exact', head: true })
    .like('numero_conta', `CP-${hoje}-%`);
  return `CP-${hoje}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

function statusTono(status: string, dataVencimento: string): 'copper' | 'teal' | 'danger' | 'neutro' {
  if (status === 'Pago') return 'teal';
  if (status === 'Cancelado') return 'neutro';
  const vencida = new Date(dataVencimento + 'T00:00:00') < new Date(new Date().toDateString());
  return vencida ? 'danger' : 'copper';
}

export function ContasPagar() {
  const [numeroGerado, setNumeroGerado] = useState('');

  // Gera o próximo número assim que a tela carrega e depois de cada
  // salvamento - CrudPage não dá suporte a geração assíncrona dentro de
  // antesDeEnviar, então o número precisa já estar pronto de antemão
  // (mesma limitação/aceitação de corrida já usada nos outros geradores
  // deste sistema).
  useEffect(() => {
    gerarNumeroConta().then(setNumeroGerado);
  }, []);

  const fornecedoresQuery = useQuery({
    queryKey: ['fornecedores-opcoes-contas-pagar'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  function nomeFornecedor(id: number | null) {
    return id ? fornecedoresQuery.data?.find((f) => f.id === id)?.razao_social ?? `#${id}` : '-';
  }

  return (
    <CrudPage<ContaPagar>
      titulo="Contas a pagar"
      tabela="contas_pagar"
      ordenarPor="data_vencimento"
      camposFiltro={['descricao', 'numero_conta']}
      valorInicial={{ status: 'Em aberto' }}
      colunas={[
        { chave: 'numero_conta', label: 'Nº conta', mono: true },
        { chave: 'fornecedor_id', label: 'Fornecedor', render: (r) => nomeFornecedor(r.fornecedor_id) },
        { chave: 'descricao', label: 'Descrição' },
        { chave: 'valor', label: 'Valor', render: (r) => `R$ ${Number(r.valor).toFixed(2)}` },
        {
          chave: 'data_vencimento',
          label: 'Vencimento',
          render: (r) => new Date(r.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
        },
        {
          chave: 'status',
          label: 'Status',
          render: (r) => <Badge tono={statusTono(r.status, r.data_vencimento)}>{r.status}</Badge>,
        },
      ]}
      campos={[
        {
          name: 'fornecedor_id',
          label: 'Fornecedor',
          type: 'select',
          opcoes: (fornecedoresQuery.data ?? []).map((f) => ({ value: String(f.id), label: f.razao_social })),
        },
        { name: 'descricao', label: 'Descrição', type: 'textarea', obrigatorio: true },
        { name: 'valor', label: 'Valor (R$)', type: 'number', obrigatorio: true },
        { name: 'data_vencimento', label: 'Data de vencimento', type: 'date', obrigatorio: true },
        { name: 'data_pagamento', label: 'Data de pagamento', type: 'date' },
        { name: 'forma_pagamento', label: 'Forma de pagamento', type: 'text' },
        { name: 'status', label: 'Status', type: 'select', opcoes: ['Em aberto', 'Pago', 'Cancelado'], obrigatorio: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ]}
      validar={(d) => {
        if (!d.descricao) return 'Informe a descrição.';
        if (!d.valor || Number(d.valor) <= 0) return 'Informe um valor válido.';
        if (!d.data_vencimento) return 'Informe a data de vencimento.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        fornecedor_id: d.fornecedor_id ? Number(d.fornecedor_id) : null,
        valor: Number(d.valor),
        numero_conta: (d as { numero_conta?: string }).numero_conta || numeroGerado,
      })}
      aposSalvar={async () => {
        setNumeroGerado(await gerarNumeroConta());
      }}
    />
  );
}
