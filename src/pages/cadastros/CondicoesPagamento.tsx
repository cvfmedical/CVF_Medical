import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';

interface CondicaoPagamento {
  id: number;
  descricao: string;
  status_ativo: boolean;
}

export function CondicoesPagamento() {
  return (
    <CrudPage<CondicaoPagamento>
      titulo="Condições de pagamento"
      tabela="condicoes_pagamento"
      ordenarPor="descricao"
      camposFiltro={['descricao']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'descricao', label: 'Descrição' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
          rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
        },
      ]}
      campos={[
        { name: 'descricao', label: 'Descrição (ex.: 28 DDL, 2x 28/56 DDL)', type: 'text', obrigatorio: true },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => (!d.descricao ? 'Informe a descrição.' : null)}
    />
  );
}
