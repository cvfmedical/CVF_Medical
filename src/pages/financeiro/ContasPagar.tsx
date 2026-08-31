import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { ModalJanela } from '../../components/ModalJanela';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { IconCalendar, IconCheck, IconPlus } from '@tabler/icons-react';

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
  const qc = useQueryClient();
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

  const categoriasQuery = useQuery({
    queryKey: ['categorias-custo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categorias_custo').select('id, nome').order('nome');
      if (error) throw error;
      return data as { id: number; nome: string }[];
    },
  });

  function nomeFornecedor(id: number | null) {
    return id ? fornecedoresQuery.data?.find((f) => f.id === id)?.razao_social ?? `#${id}` : '-';
  }

  // Categoria digitada na hora (não estava na lista) - cadastra ela
  // sozinha em Categorias de custo, pra já aparecer pronta da próxima vez
  // (tanto no combobox quanto na tela de cadastro).
  function talvezCadastrarCategoriaNova(nome: string) {
    const jaExiste = categoriasQuery.data?.some((c) => c.nome.toLowerCase() === nome.toLowerCase());
    if (jaExiste) return;
    supabase
      .from('categorias_custo')
      .insert({ nome })
      .then(({ error }) => {
        if (!error) qc.invalidateQueries({ queryKey: ['categorias-custo'] });
      });
  }

  // Baixa rápida - marca "Pago" com data de hoje, sem abrir o formulário
  // inteiro. Pra reverter (ex.: marcado por engano), edita e troca o
  // status de volta, como qualquer outro campo.
  async function baixarTitulo(c: ContaPagar) {
    if (!confirm(`Confirma a baixa (pagamento) do título ${c.numero_conta}, com data de hoje?`)) return;
    const { error } = await supabase
      .from('contas_pagar')
      .update({ status: 'Pago', data_pagamento: new Date().toISOString().slice(0, 10) })
      .eq('id', c.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['contas_pagar'] });
  }

  // Alterar a data de pagamento de um título já baixado, sem precisar
  // abrir o formulário inteiro (e sem risco de mexer em status/valor por
  // engano) - útil pra corrigir data digitada errado ou lançada com a
  // data de hoje em vez da data real da compensação do boleto.
  const [contaEditandoData, setContaEditandoData] = useState<ContaPagar | null>(null);
  const [novaDataPagamento, setNovaDataPagamento] = useState('');
  const [erroData, setErroData] = useState<string | null>(null);
  const [salvandoData, setSalvandoData] = useState(false);

  function abrirEdicaoData(c: ContaPagar) {
    setContaEditandoData(c);
    setNovaDataPagamento(c.data_pagamento ?? '');
    setErroData(null);
  }

  async function salvarDataPagamento() {
    if (!contaEditandoData) return;
    if (!novaDataPagamento) {
      setErroData('Informe a data de pagamento.');
      return;
    }
    setErroData(null);
    setSalvandoData(true);
    try {
      const { error } = await supabase
        .from('contas_pagar')
        .update({ data_pagamento: novaDataPagamento })
        .eq('id', contaEditandoData.id);
      if (error) throw error;
      setContaEditandoData(null);
      qc.invalidateQueries({ queryKey: ['contas_pagar'] });
    } catch (e) {
      setErroData(mensagemErro(e));
    } finally {
      setSalvandoData(false);
    }
  }

  // ---- Lançamento parcelado ----
  const [modalParceladoAberto, setModalParceladoAberto] = useState(false);
  const [formParcelado, setFormParcelado] = useState({
    tipo_custo: 'Empresa',
    socio: '',
    categoria: '',
    fornecedor_id: '',
    descricao: '',
    valorTotal: '',
    numParcelas: '2',
    primeiroVencimento: '',
    intervaloDias: '30',
  });
  const [erroParcelado, setErroParcelado] = useState<string | null>(null);
  const [salvandoParcelado, setSalvandoParcelado] = useState(false);

  function abrirModalParcelado() {
    setFormParcelado({
      tipo_custo: 'Empresa',
      socio: '',
      categoria: '',
      fornecedor_id: '',
      descricao: '',
      valorTotal: '',
      numParcelas: '2',
      primeiroVencimento: '',
      intervaloDias: '30',
    });
    setErroParcelado(null);
    setModalParceladoAberto(true);
  }

  async function salvarParcelado() {
    setErroParcelado(null);
    if (!formParcelado.descricao) return setErroParcelado('Informe a descrição.');
    const total = Number(formParcelado.valorTotal);
    if (!total || total <= 0) return setErroParcelado('Informe um valor total válido.');
    const n = Number(formParcelado.numParcelas);
    if (!n || n < 1) return setErroParcelado('Informe um número de parcelas válido.');
    if (!formParcelado.primeiroVencimento) return setErroParcelado('Informe o vencimento da 1ª parcela.');

    setSalvandoParcelado(true);
    try {
      const intervalo = Number(formParcelado.intervaloDias) || 30;
      const totalCentavos = Math.round(total * 100);
      const baseCentavos = Math.floor(totalCentavos / n);
      const restoCentavos = totalCentavos - baseCentavos * n;
      const categoria = formParcelado.categoria.trim() || null;
      if (categoria) talvezCadastrarCategoriaNova(categoria);

      for (let i = 0; i < n; i++) {
        const valorCentavos = baseCentavos + (i === n - 1 ? restoCentavos : 0);
        const vencimento = new Date(`${formParcelado.primeiroVencimento}T00:00:00`);
        vencimento.setDate(vencimento.getDate() + intervalo * i);
        const numeroConta = await gerarNumeroConta();
        const { error } = await supabase.from('contas_pagar').insert({
          numero_conta: numeroConta,
          tipo_custo: formParcelado.tipo_custo,
          socio: formParcelado.socio.trim() || null,
          categoria,
          fornecedor_id: formParcelado.fornecedor_id ? Number(formParcelado.fornecedor_id) : null,
          descricao: `${formParcelado.descricao} - Parcela ${i + 1}/${n}`,
          valor: valorCentavos / 100,
          data_vencimento: vencimento.toISOString().slice(0, 10),
          status: 'Em aberto',
        });
        if (error) throw error;
      }
      setModalParceladoAberto(false);
      setNumeroGerado(await gerarNumeroConta());
      qc.invalidateQueries({ queryKey: ['contas_pagar'] });
    } catch (e) {
      setErroParcelado(mensagemErro(e));
    } finally {
      setSalvandoParcelado(false);
    }
  }

  return (
    <div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: -8, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
                Total Empresa: R$ {totalEmpresa.toFixed(2)} · Total Pessoal: R$ {totalPessoal.toFixed(2)}
              </p>
              <button className="botao-secundario botao-pequeno" onClick={abrirModalParcelado}>
                <IconPlus size={16} /> Lançar parcelado
              </button>
            </div>
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
            opcoes: (categoriasQuery.data ?? []).map((c) => c.nome),
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
        antesDeEnviar={(d) => {
          const categoria = (d.categoria as string)?.trim() || null;
          if (categoria) talvezCadastrarCategoriaNova(categoria);
          return {
            ...d,
            fornecedor_id: d.fornecedor_id ? Number(d.fornecedor_id) : null,
            valor: Number(d.valor),
            numero_conta: (d as { numero_conta?: string }).numero_conta || numeroGerado,
            socio: (d.socio as string)?.trim() || null,
            categoria,
          };
        }}
        aposSalvar={async () => {
          setNumeroGerado(await gerarNumeroConta());
        }}
        acoesExtras={(r) =>
          r.status === 'Em aberto' ? (
            <button className="botao-icone" title="Baixar título (marcar como pago hoje)" onClick={() => baixarTitulo(r)}>
              <IconCheck size={16} />
            </button>
          ) : r.status === 'Pago' ? (
            <button className="botao-icone" title="Alterar data de pagamento" onClick={() => abrirEdicaoData(r)}>
              <IconCalendar size={16} />
            </button>
          ) : null
        }
      />

      {modalParceladoAberto && (
        <ModalJanela titulo="Lançar parcelado — Contas a pagar" aoFechar={() => setModalParceladoAberto(false)}>
          <div className="campo-form">
            <label>Tipo *</label>
            <select
              value={formParcelado.tipo_custo}
              onChange={(e) => setFormParcelado((f) => ({ ...f, tipo_custo: e.target.value }))}
            >
              <option value="Empresa">Empresa</option>
              <option value="Pessoal">Pessoal</option>
            </select>
          </div>
          <div className="campo-form">
            <label>Sócio (quando for retirada pessoal)</label>
            <input
              type="text"
              value={formParcelado.socio}
              onChange={(e) => setFormParcelado((f) => ({ ...f, socio: e.target.value }))}
            />
          </div>
          <div className="campo-form">
            <label>Categoria</label>
            <input
              type="text"
              list="categorias-custo-lista"
              value={formParcelado.categoria}
              onChange={(e) => setFormParcelado((f) => ({ ...f, categoria: e.target.value }))}
            />
            <datalist id="categorias-custo-lista">
              {(categoriasQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.nome} />
              ))}
            </datalist>
          </div>
          <div className="campo-form">
            <label>Fornecedor</label>
            <select
              value={formParcelado.fornecedor_id}
              onChange={(e) => setFormParcelado((f) => ({ ...f, fornecedor_id: e.target.value }))}
            >
              <option value="">Sem fornecedor</option>
              {(fornecedoresQuery.data ?? []).map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.razao_social}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-form">
            <label>Descrição *</label>
            <textarea
              value={formParcelado.descricao}
              onChange={(e) => setFormParcelado((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>
          <div className="campo-form">
            <label>Valor total (R$) *</label>
            <input
              type="number"
              step="0.01"
              value={formParcelado.valorTotal}
              onChange={(e) => setFormParcelado((f) => ({ ...f, valorTotal: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Nº de parcelas *</label>
              <input
                type="number"
                min="1"
                value={formParcelado.numParcelas}
                onChange={(e) => setFormParcelado((f) => ({ ...f, numParcelas: e.target.value }))}
              />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Vencimento da 1ª parcela *</label>
              <input
                type="date"
                value={formParcelado.primeiroVencimento}
                onChange={(e) => setFormParcelado((f) => ({ ...f, primeiroVencimento: e.target.value }))}
              />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Intervalo</label>
              <select
                value={formParcelado.intervaloDias}
                onChange={(e) => setFormParcelado((f) => ({ ...f, intervaloDias: e.target.value }))}
              >
                <option value="30">30 em 30 dias</option>
                <option value="28">28 em 28 dias</option>
                <option value="15">15 em 15 dias</option>
                <option value="7">7 em 7 dias</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
            Divide o valor total em partes iguais (a última parcela absorve o centavo de arredondamento, se houver) e
            cria um lançamento de "Contas a pagar" pra cada parcela.
          </p>

          {erroParcelado && <p className="erro-login">{erroParcelado}</p>}

          <div className="modal-acoes">
            <button className="botao-secundario" onClick={() => setModalParceladoAberto(false)} disabled={salvandoParcelado}>
              Cancelar
            </button>
            <button className="botao-primario" onClick={salvarParcelado} disabled={salvandoParcelado}>
              {salvandoParcelado ? 'Salvando...' : 'Gerar parcelas'}
            </button>
          </div>
        </ModalJanela>
      )}

      {contaEditandoData && (
        <ModalJanela titulo={`Alterar data de pagamento — ${contaEditandoData.numero_conta}`} aoFechar={() => setContaEditandoData(null)}>
          <div className="campo-form">
            <label>Data de pagamento *</label>
            <input type="date" value={novaDataPagamento} onChange={(e) => setNovaDataPagamento(e.target.value)} />
          </div>

          {erroData && <p className="erro-login">{erroData}</p>}

          <div className="modal-acoes">
            <button className="botao-secundario" onClick={() => setContaEditandoData(null)} disabled={salvandoData}>
              Cancelar
            </button>
            <button className="botao-primario" onClick={salvarDataPagamento} disabled={salvandoData}>
              {salvandoData ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </ModalJanela>
      )}
    </div>
  );
}
