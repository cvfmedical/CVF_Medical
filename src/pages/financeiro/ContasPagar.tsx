import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { ModalJanela } from '../../components/ModalJanela';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { IconCalendar, IconCheck } from '@tabler/icons-react';

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

  // ---- "+ Novo" unificado - lançamento único OU parcelado, no mesmo
  // formulário (checkbox "Pagamento parcelado" troca Valor/Vencimento
  // por Valor total/Nº de parcelas/Intervalo). Substitui o formulário
  // genérico do CrudPage só pra criação - "Editar" continua usando o
  // formulário genérico normalmente (um título já lançado é sempre uma
  // linha só, mesmo que tenha nascido de um parcelamento).
  const formNovoVazio = {
    tipo_custo: 'Empresa',
    socio: '',
    categoria: '',
    fornecedor_id: '',
    descricao: '',
    parcelado: false,
    repetirTodoAno: false,
    valor: '',
    data_vencimento: '',
    forma_pagamento: '',
    status: 'Em aberto',
    data_pagamento: '',
    observacoes: '',
    valorTotal: '',
    numParcelas: '2',
    primeiroVencimento: '',
    intervaloDias: '30',
  };
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [formNovo, setFormNovo] = useState(formNovoVazio);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  function abrirModalNovo() {
    setFormNovo(formNovoVazio);
    setErroNovo(null);
    setModalNovoAberto(true);
  }

  async function salvarNovo() {
    setErroNovo(null);
    if (!formNovo.descricao) return setErroNovo('Informe a descrição.');
    const categoria = formNovo.categoria.trim() || null;
    const fornecedorId = formNovo.fornecedor_id ? Number(formNovo.fornecedor_id) : null;
    const socio = formNovo.socio.trim() || null;

    if (formNovo.parcelado) {
      const total = Number(formNovo.valorTotal);
      if (!total || total <= 0) return setErroNovo('Informe um valor total válido.');
      const n = Number(formNovo.numParcelas);
      if (!n || n < 1) return setErroNovo('Informe um número de parcelas válido.');
      if (!formNovo.primeiroVencimento) return setErroNovo('Informe o vencimento da 1ª parcela.');

      setSalvandoNovo(true);
      try {
        const intervalo = Number(formNovo.intervaloDias) || 30;
        const totalCentavos = Math.round(total * 100);
        const baseCentavos = Math.floor(totalCentavos / n);
        const restoCentavos = totalCentavos - baseCentavos * n;
        if (categoria) talvezCadastrarCategoriaNova(categoria);

        for (let i = 0; i < n; i++) {
          const valorCentavos = baseCentavos + (i === n - 1 ? restoCentavos : 0);
          const vencimento = new Date(`${formNovo.primeiroVencimento}T00:00:00`);
          vencimento.setDate(vencimento.getDate() + intervalo * i);
          const numeroConta = await gerarNumeroConta();
          const { error } = await supabase.from('contas_pagar').insert({
            numero_conta: numeroConta,
            tipo_custo: formNovo.tipo_custo,
            socio,
            categoria,
            fornecedor_id: fornecedorId,
            descricao: `${formNovo.descricao} - Parcela ${i + 1}/${n}`,
            valor: valorCentavos / 100,
            data_vencimento: vencimento.toISOString().slice(0, 10),
            status: 'Em aberto',
          });
          if (error) throw error;
        }
        setModalNovoAberto(false);
        setNumeroGerado(await gerarNumeroConta());
        qc.invalidateQueries({ queryKey: ['contas_pagar'] });
      } catch (e) {
        setErroNovo(mensagemErro(e));
      } finally {
        setSalvandoNovo(false);
      }
      return;
    }

    if (!formNovo.valor || Number(formNovo.valor) <= 0) return setErroNovo('Informe um valor válido.');
    if (!formNovo.data_vencimento) return setErroNovo('Informe a data de vencimento.');

    setSalvandoNovo(true);
    try {
      if (categoria) talvezCadastrarCategoriaNova(categoria);

      // "Repetir todo mês até dezembro": mesmo valor/descrição, um
      // lançamento por mês restante do ano do vencimento informado (dia
      // fixo, ajustado pro último dia do mês quando o mês alvo for mais
      // curto - ex: vencimento dia 31 vira dia 30 em abril).
      const dataBase = new Date(`${formNovo.data_vencimento}T00:00:00`);
      const datasVencimento = [dataBase];
      if (formNovo.repetirTodoAno) {
        const ano = dataBase.getFullYear();
        const mesBase = dataBase.getMonth();
        const dia = dataBase.getDate();
        for (let mes = mesBase + 1; mes <= 11; mes++) {
          const ultimoDiaMesAlvo = new Date(ano, mes + 1, 0).getDate();
          datasVencimento.push(new Date(ano, mes, Math.min(dia, ultimoDiaMesAlvo)));
        }
      }

      for (const dataVenc of datasVencimento) {
        const primeira = dataVenc === dataBase;
        const numeroConta = primeira ? numeroGerado : await gerarNumeroConta();
        const { error } = await supabase.from('contas_pagar').insert({
          numero_conta: numeroConta,
          tipo_custo: formNovo.tipo_custo,
          socio,
          categoria,
          fornecedor_id: fornecedorId,
          descricao: formNovo.descricao,
          valor: Number(formNovo.valor),
          data_vencimento: dataVenc.toISOString().slice(0, 10),
          data_pagamento: primeira ? formNovo.data_pagamento || null : null,
          forma_pagamento: formNovo.forma_pagamento || null,
          status: primeira ? formNovo.status : 'Em aberto',
          observacoes: formNovo.observacoes || null,
        });
        if (error) throw error;
      }
      setModalNovoAberto(false);
      setNumeroGerado(await gerarNumeroConta());
      qc.invalidateQueries({ queryKey: ['contas_pagar'] });
    } catch (e) {
      setErroNovo(mensagemErro(e));
    } finally {
      setSalvandoNovo(false);
    }
  }

  return (
    <div>
      <CrudPage<ContaPagar>
        titulo="Contas a pagar"
        tabela="contas_pagar"
        ordenarPor="data_vencimento"
        filtroPeriodo={{ campo: 'data_vencimento', label: 'Vencimento', campoValor: 'valor' }}
        camposFiltro={['descricao', 'numero_conta']}
        aoClicarNovo={abrirModalNovo}
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

      {modalNovoAberto && (
        <ModalJanela titulo="Novo — Contas a pagar" aoFechar={() => setModalNovoAberto(false)}>
          <div className="campo-form">
            <label>Tipo *</label>
            <select value={formNovo.tipo_custo} onChange={(e) => setFormNovo((f) => ({ ...f, tipo_custo: e.target.value }))}>
              <option value="Empresa">Empresa</option>
              <option value="Pessoal">Pessoal</option>
            </select>
          </div>
          <div className="campo-form">
            <label>Sócio (quando for retirada pessoal)</label>
            <input type="text" value={formNovo.socio} onChange={(e) => setFormNovo((f) => ({ ...f, socio: e.target.value }))} />
          </div>
          <div className="campo-form">
            <label>Categoria</label>
            <input
              type="text"
              list="categorias-custo-lista"
              value={formNovo.categoria}
              onChange={(e) => setFormNovo((f) => ({ ...f, categoria: e.target.value }))}
            />
            <datalist id="categorias-custo-lista">
              {(categoriasQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.nome} />
              ))}
            </datalist>
          </div>
          <div className="campo-form">
            <label>Fornecedor</label>
            <select value={formNovo.fornecedor_id} onChange={(e) => setFormNovo((f) => ({ ...f, fornecedor_id: e.target.value }))}>
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
            <textarea value={formNovo.descricao} onChange={(e) => setFormNovo((f) => ({ ...f, descricao: e.target.value }))} />
          </div>

          {!formNovo.repetirTodoAno && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '12px 0' }}>
              <input
                type="checkbox"
                checked={formNovo.parcelado}
                onChange={(e) => setFormNovo((f) => ({ ...f, parcelado: e.target.checked }))}
              />
              Pagamento parcelado
            </label>
          )}
          {!formNovo.parcelado && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '12px 0' }}>
              <input
                type="checkbox"
                checked={formNovo.repetirTodoAno}
                onChange={(e) => setFormNovo((f) => ({ ...f, repetirTodoAno: e.target.checked }))}
              />
              Repetir todo mês até dezembro (mesmo valor e descrição)
            </label>
          )}
          {formNovo.repetirTodoAno && (
            <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -8, marginBottom: 8 }}>
              Cria um lançamento "Em aberto" pra esse mês (com o status/data de pagamento informados abaixo) e mais um
              por mês restante do ano do vencimento, mesmo dia, mesmo valor e descrição.
            </p>
          )}

          {formNovo.parcelado ? (
            <>
              <div className="campo-form">
                <label>Valor total (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formNovo.valorTotal}
                  onChange={(e) => setFormNovo((f) => ({ ...f, valorTotal: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="campo-form" style={{ flex: 1 }}>
                  <label>Nº de parcelas *</label>
                  <input
                    type="number"
                    min="1"
                    value={formNovo.numParcelas}
                    onChange={(e) => setFormNovo((f) => ({ ...f, numParcelas: e.target.value }))}
                  />
                </div>
                <div className="campo-form" style={{ flex: 1 }}>
                  <label>Vencimento da 1ª parcela *</label>
                  <input
                    type="date"
                    value={formNovo.primeiroVencimento}
                    onChange={(e) => setFormNovo((f) => ({ ...f, primeiroVencimento: e.target.value }))}
                  />
                </div>
                <div className="campo-form" style={{ flex: 1 }}>
                  <label>Intervalo</label>
                  <select
                    value={formNovo.intervaloDias}
                    onChange={(e) => setFormNovo((f) => ({ ...f, intervaloDias: e.target.value }))}
                  >
                    <option value="30">30 em 30 dias</option>
                    <option value="28">28 em 28 dias</option>
                    <option value="15">15 em 15 dias</option>
                    <option value="7">7 em 7 dias</option>
                  </select>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Divide o valor total em partes iguais (a última parcela absorve o centavo de arredondamento, se
                houver) e cria um lançamento de "Contas a pagar" pra cada parcela, todas como "Em aberto".
              </p>
            </>
          ) : (
            <>
              <div className="campo-form">
                <label>Valor (R$) *</label>
                <input type="number" value={formNovo.valor} onChange={(e) => setFormNovo((f) => ({ ...f, valor: e.target.value }))} />
              </div>
              <div className="campo-form">
                <label>Data de vencimento *</label>
                <input
                  type="date"
                  value={formNovo.data_vencimento}
                  onChange={(e) => setFormNovo((f) => ({ ...f, data_vencimento: e.target.value }))}
                />
              </div>
              <div className="campo-form">
                <label>Data de pagamento</label>
                <input
                  type="date"
                  value={formNovo.data_pagamento}
                  onChange={(e) => setFormNovo((f) => ({ ...f, data_pagamento: e.target.value }))}
                />
              </div>
              <div className="campo-form">
                <label>Forma de pagamento</label>
                <input
                  type="text"
                  value={formNovo.forma_pagamento}
                  onChange={(e) => setFormNovo((f) => ({ ...f, forma_pagamento: e.target.value }))}
                />
              </div>
              <div className="campo-form">
                <label>Status *</label>
                <select value={formNovo.status} onChange={(e) => setFormNovo((f) => ({ ...f, status: e.target.value }))}>
                  <option value="Em aberto">Em aberto</option>
                  <option value="Pago">Pago</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </div>
            </>
          )}

          <div className="campo-form">
            <label>Observações</label>
            <textarea value={formNovo.observacoes} onChange={(e) => setFormNovo((f) => ({ ...f, observacoes: e.target.value }))} />
          </div>

          {erroNovo && <p className="erro-login">{erroNovo}</p>}

          <div className="modal-acoes">
            <button className="botao-secundario" onClick={() => setModalNovoAberto(false)} disabled={salvandoNovo}>
              Cancelar
            </button>
            <button className="botao-primario" onClick={salvarNovo} disabled={salvandoNovo}>
              {salvandoNovo
                ? 'Salvando...'
                : formNovo.parcelado
                  ? 'Gerar parcelas'
                  : formNovo.repetirTodoAno
                    ? 'Gerar lançamentos'
                    : 'Salvar'}
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
