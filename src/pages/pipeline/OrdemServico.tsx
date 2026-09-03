import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { STATUS_OS_ORDENADOS } from '../../lib/statusOS';
import { proximoNumeroDeJob } from '../../lib/numeroSequencial';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { formatarModeloOtica } from '../../lib/formato';

interface CatalogoOtica {
  id: number;
  fabricante: string;
  modelo: string;
  tipo: string | null;
  diametro_mm: number | null;
  angulo_graus: number | null;
  grupo: string | null;
  subgrupo: string | null;
}

interface ProdutoCatalogo {
  id: number;
  nome: string;
  marca_fabricante: string | null;
  tipo: string | null;
  categoria: string | null;
  subgrupo: string | null;
}

// OS aberta direto, sem Entrada - ainda assim usa o número compartilhado
// (Entrada/OS/Orçamento), pra não colidir nem dessincronizar com o resto.
async function gerarNumeroOS(): Promise<string> {
  const n = await proximoNumeroDeJob();
  return `OS-${n}`;
}

export function OrdemServico() {
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [form, setForm] = useState({
    cliente_id: '',
    optica_desc: '',
    optica_fab: '',
    optica_sn: '',
    defeito_relatado: '',
    prazo_entrega: '7 dias',
    status_os: STATUS_OS_ORDENADOS[0] as string,
  });
  // Mesmo combobox único da Entrada (Recebimento/Triagem) - junta catálogo
  // de óticas e Produtos e serviços, preenchendo descrição/fabricante/
  // eh_otica/grupo sozinho. Necessário aqui também porque esta tela cria a
  // OS direto, sem passar pela Entrada.
  const [ehOtica, setEhOtica] = useState<boolean | null>(null);
  const [catalogoOticaId, setCatalogoOticaId] = useState('');
  const [tipoEquipamentoSelecionado, setTipoEquipamentoSelecionado] = useState('');
  const [grupoEquipamento, setGrupoEquipamento] = useState('');
  const [subgrupoEquipamento, setSubgrupoEquipamento] = useState('');

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  const catalogoQuery = useQuery({
    queryKey: ['catalogo-oticas-opcoes'],
    queryFn: async (): Promise<CatalogoOtica[]> => {
      const { data, error } = await supabase
        .from('catalogo_oticas')
        .select('id, fabricante, modelo, tipo, diametro_mm, angulo_graus, grupo, subgrupo')
        .order('fabricante');
      if (error) throw error;
      return data as CatalogoOtica[];
    },
  });

  const produtosCatalogoQuery = useQuery({
    queryKey: ['produtos-servicos-catalogo-entrada'],
    queryFn: async (): Promise<ProdutoCatalogo[]> => {
      const { data, error } = await supabase
        .from('produtos_servicos')
        .select('id, nome, marca_fabricante, tipo, categoria, subgrupo')
        .eq('status_ativo', true)
        .in('tipo', ['Produto', 'Serviço'])
        .order('nome');
      if (error) throw error;
      return data as ProdutoCatalogo[];
    },
  });

  const opcoesTipoEquipamento = [
    ...(catalogoQuery.data ?? []).map((c) => ({ value: `otica:${c.id}`, label: `Ótica — ${formatarModeloOtica(c)}` })),
    ...(produtosCatalogoQuery.data ?? []).map((p) => ({
      value: `produto:${p.id}`,
      label: `${p.tipo} — ${p.nome}${p.marca_fabricante ? ` (${p.marca_fabricante})` : ''}`,
    })),
  ];

  function selecionarTipoEquipamento(valor: string) {
    setTipoEquipamentoSelecionado(valor);
    const [tipo, id] = valor.split(':');
    if (tipo === 'otica') {
      const item = catalogoQuery.data?.find((c) => String(c.id) === id);
      if (!item) return;
      setForm((f) => ({
        ...f,
        optica_fab: item.fabricante,
        optica_desc: item.subgrupo
          ? `${item.subgrupo} - ${formatarModeloOtica({ ...item, fabricante: '' })}`
          : formatarModeloOtica({ ...item, fabricante: '' }),
      }));
      setEhOtica(true);
      setCatalogoOticaId(id);
      setGrupoEquipamento(item.grupo ?? '');
      setSubgrupoEquipamento(item.subgrupo ?? '');
    } else if (tipo === 'produto') {
      const item = produtosCatalogoQuery.data?.find((p) => String(p.id) === id);
      if (!item) return;
      setForm((f) => ({
        ...f,
        optica_fab: item.marca_fabricante ?? '',
        optica_desc: item.subgrupo ? `${item.subgrupo} - ${item.nome}` : item.nome,
      }));
      setEhOtica(false);
      setCatalogoOticaId('');
      setGrupoEquipamento(item.categoria ?? '');
      setSubgrupoEquipamento(item.subgrupo ?? '');
    }
  }

  async function salvar() {
    setErro(null);
    setSucesso(null);
    if (!form.cliente_id) {
      setErro('Selecione o cliente.');
      return;
    }
    const cliente = clientesQuery.data?.find((c) => c.id === Number(form.cliente_id));
    setSalvando(true);
    try {
      const numeroOS = await gerarNumeroOS();
      const { error } = await supabase.from('ordens_servico').insert({
        numero_os: numeroOS,
        cliente_id: Number(form.cliente_id),
        cliente_nome: cliente?.razao_social ?? '',
        optica_desc: form.optica_desc || null,
        optica_fab: form.optica_fab || null,
        optica_sn: form.optica_sn || null,
        defeito_relatado: form.defeito_relatado || null,
        prazo_entrega: form.prazo_entrega || null,
        status_os: form.status_os,
        eh_otica: ehOtica,
        catalogo_otica_id: catalogoOticaId ? Number(catalogoOticaId) : null,
        grupo: grupoEquipamento || null,
        subgrupo: subgrupoEquipamento || null,
      });
      if (error) throw error;
      setSucesso(`OS ${numeroOS} criada com sucesso.`);
      setTimeout(() => navigate('/ordens-servico'), 1200);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Abrir nova OS</h1>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 16 }}>
        Use esta tela só quando não existe uma Entrada do Equipamento prévia (ex: solicitação recebida por
        telefone). O caminho normal é: Entrada do equipamento → "Converter em OS" — o checklist de avarias é
        preenchido lá.
      </p>

      <div className="campo-form">
        <label>Cliente *</label>
        <ComboboxBusca
          opcoes={(clientesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.razao_social }))}
          valor={String(form.cliente_id ?? '')}
          onChange={(valor) => setForm((f) => ({ ...f, cliente_id: valor }))}
        />
      </div>
      <div className="campo-form">
        <label>Selecionar tipo de equipamento</label>
        <ComboboxBusca
          opcoes={opcoesTipoEquipamento}
          valor={tipoEquipamentoSelecionado}
          onChange={selecionarTipoEquipamento}
        />
        <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
          Junta o catálogo de óticas e os equipamentos cadastrados em "Produtos e serviços" - preenche descrição,
          fabricante e o grupo do equipamento sozinho (usado depois pra filtrar as peças disponíveis no
          orçamento). Se preferir, também dá pra digitar os campos abaixo manualmente.
        </p>
      </div>
      <div className="campo-form">
        <label>Descrição do equipamento</label>
        <input
          type="text"
          value={form.optica_desc}
          onChange={(e) => setForm((f) => ({ ...f, optica_desc: e.target.value }))}
        />
      </div>
      <div className="campo-form">
        <label>Fabricante</label>
        <input
          type="text"
          value={form.optica_fab}
          onChange={(e) => setForm((f) => ({ ...f, optica_fab: e.target.value }))}
        />
      </div>
      <div className="campo-form">
        <label>Número de série</label>
        <input
          type="text"
          value={form.optica_sn}
          onChange={(e) => setForm((f) => ({ ...f, optica_sn: e.target.value }))}
        />
      </div>
      <div className="campo-form">
        <label>Defeito relatado</label>
        <textarea
          value={form.defeito_relatado}
          onChange={(e) => setForm((f) => ({ ...f, defeito_relatado: e.target.value }))}
        />
      </div>

      <div className="campo-form">
        <label>Prazo de entrega</label>
        <input
          type="text"
          value={form.prazo_entrega}
          onChange={(e) => setForm((f) => ({ ...f, prazo_entrega: e.target.value }))}
        />
      </div>

      <div className="campo-form">
        <label>Status inicial no workflow</label>
        <select value={form.status_os} onChange={(e) => setForm((f) => ({ ...f, status_os: e.target.value }))}>
          {STATUS_OS_ORDENADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="erro-login">{erro}</p>}
      {sucesso && <p style={{ color: 'var(--teal-800)', fontSize: 13 }}>{sucesso}</p>}

      <button className="botao-primario botao-pequeno" onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando...' : 'Abrir OS'}
      </button>
    </div>
  );
}
