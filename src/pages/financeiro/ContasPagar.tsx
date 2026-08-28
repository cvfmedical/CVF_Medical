import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';

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
  tipo_custo: string;
  socio: string | null;
  categoria: string | null;
}

const CATEGORIAS_SUGERIDAS = [
  'Aluguel',
  'Água/Luz',
  'Salários',
  'Combustível',
  'Peças/Insumos',
  'Impostos',
  'Retirada sócio',
  'Outros',
];

async function gerarNumeroConta(): Promise<string> {
  return gerarNumeroSequencial('CP', 'contas_pagar', 'numero_conta');
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
      valorInicial={{ status: 'Em aberto', tipo_custo: 'Empresa' }}
      resumo={(todas) => {
        const totalEmpresa = todas.filter((r) => r.tipo_custo !== 'Pessoal' && r.status !== 'Cancelado').reduce((s, r) => s + Number(r.valor), 0);
        const totalPessoal = todas.filter((r) => r.tipo_custo === 'Pessoal' && r.status !== 'Cancelado').reduce((s, r) => s + Number(r.valor), 0);
        return (
          <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
            Total Empresa: R$ {totalEmpresa.toFixed(2)} · Total Pessoal: R$ {totalPessoal.toFixed(2)}
          </p>
        );
      }}
      colunas={[
        { chave: 'numero_conta', label: 'Nº conta', mono: true },
        {
          chave: 'tipo_custo',
          label: 'Tipo',
          render: (r) => <Badge tono={r.tipo_custo === 'Pessoal' ? 'copper' : 'neutro'}>{r.tipo_custo}</Badge>,
        },
        {
          chave: 'fornecedor_id',
          label: 'Fornecedor',
          render: (r) => nomeFornecedor(r.fornecedor_id),
          valorFiltro: (r) => nomeFornecedor(r.fornecedor_id),
        },
        { chave: 'socio', label: 'Sócio', render: (r) => r.socio || '-' },
        { chave: 'categoria', label: 'Categoria', render: (r) => r.categoria || '-' },
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
          name: 'tipo_custo',
          label: 'Tipo',
          type: 'select',
          opcoes: ['Empresa', 'Pessoal'],
          obrigatorio: true,
        },
        {
          name: 'socio',
          label: 'Sócio (quando for retirada pessoal)',
          type: 'text',
        },
        {
          name: 'categoria',
          label: 'Categoria',
          type: 'combobox',
          opcoes: CATEGORIAS_SUGERIDAS,
          permiteNovo: true,
        },
        {
          name: 'fornecedor_id',
          label: 'Fornecedor',
          type: 'combobox',
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
        socio: (d.socio as string)?.trim() || null,
        categoria: (d.categoria as string)?.trim() || null,
      })}
      aposSalvar={async () => {
        setNumeroGerado(await gerarNumeroConta());
      }}
    />
  );
}
