import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';

interface ContratoManutencao {
  id: number;
  numero_contrato: string;
  cliente_id: number;
  tipo_contrato: string | null;
  periodicidade_visitas: string | null;
  data_inicio: string;
  data_fim: string | null;
  valor_mensal: number | null;
  forma_pagamento: string | null;
  status: string;
  observacoes: string | null;
}

async function gerarNumeroContrato(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('contratos_manutencao')
    .select('id', { count: 'exact', head: true })
    .like('numero_contrato', `CONT-${hoje}-%`);
  return `CONT-${hoje}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

function statusExibicao(c: ContratoManutencao): { texto: string; tono: 'copper' | 'teal' | 'danger' | 'neutro' } {
  if (c.status === 'Encerrado') return { texto: 'Encerrado', tono: 'neutro' };
  if (c.status === 'Suspenso') return { texto: 'Suspenso', tono: 'danger' };
  if (c.data_fim && new Date(c.data_fim + 'T00:00:00') < new Date(new Date().toDateString())) {
    return { texto: 'Vencido', tono: 'danger' };
  }
  return { texto: 'Ativo', tono: 'teal' };
}

export function ContratosManutencao() {
  const [numeroGerado, setNumeroGerado] = useState('');

  useEffect(() => {
    gerarNumeroContrato().then(setNumeroGerado);
  }, []);

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-contratos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  function nomeCliente(id: number) {
    return clientesQuery.data?.find((c) => c.id === id)?.razao_social ?? `#${id}`;
  }

  return (
    <CrudPage<ContratoManutencao>
      titulo="Contratos de manutenção"
      tabela="contratos_manutencao"
      ordenarPor="data_inicio"
      camposFiltro={['numero_contrato']}
      valorInicial={{ status: 'Ativo' }}
      colunas={[
        { chave: 'numero_contrato', label: 'Nº contrato', mono: true },
        { chave: 'cliente_id', label: 'Cliente', render: (r) => nomeCliente(r.cliente_id) },
        { chave: 'tipo_contrato', label: 'Tipo' },
        { chave: 'periodicidade_visitas', label: 'Periodicidade' },
        {
          chave: 'valor_mensal',
          label: 'Valor mensal',
          render: (r) => (r.valor_mensal != null ? `R$ ${Number(r.valor_mensal).toFixed(2)}` : '-'),
        },
        {
          chave: 'data_fim',
          label: 'Vigência até',
          render: (r) => (r.data_fim ? new Date(r.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : 'Indeterminado'),
        },
        {
          chave: 'status',
          label: 'Status',
          render: (r) => {
            const s = statusExibicao(r);
            return <Badge tono={s.tono}>{s.texto}</Badge>;
          },
        },
      ]}
      campos={[
        {
          name: 'cliente_id',
          label: 'Cliente',
          type: 'select',
          obrigatorio: true,
          opcoes: (clientesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.razao_social })),
        },
        {
          name: 'tipo_contrato',
          label: 'Tipo de contrato',
          type: 'select',
          opcoes: ['Manutenção Preventiva', 'Manutenção Corretiva', 'Preventiva + Corretiva', 'Cobertura Total'],
        },
        {
          name: 'periodicidade_visitas',
          label: 'Periodicidade das visitas',
          type: 'select',
          opcoes: ['Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Sob demanda'],
        },
        { name: 'data_inicio', label: 'Data de início', type: 'date', obrigatorio: true },
        { name: 'data_fim', label: 'Data de fim (deixe em branco se indeterminado)', type: 'date' },
        { name: 'valor_mensal', label: 'Valor mensal (R$)', type: 'number' },
        { name: 'forma_pagamento', label: 'Forma de pagamento', type: 'text' },
        { name: 'status', label: 'Status', type: 'select', opcoes: ['Ativo', 'Suspenso', 'Encerrado'], obrigatorio: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ]}
      validar={(d) => {
        if (!d.cliente_id) return 'Selecione o cliente.';
        if (!d.data_inicio) return 'Informe a data de início.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        cliente_id: Number(d.cliente_id),
        valor_mensal: d.valor_mensal ? Number(d.valor_mensal) : null,
        data_fim: d.data_fim || null,
        numero_contrato: (d as { numero_contrato?: string }).numero_contrato || numeroGerado,
      })}
      aposSalvar={async () => {
        setNumeroGerado(await gerarNumeroContrato());
      }}
    />
  );
}
