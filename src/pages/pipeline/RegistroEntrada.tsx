import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { enviarArquivoStorage, excluirArquivoStorage, urlAssinadaFoto } from '../../lib/storage';
import { CarregandoTela } from '../../components/CarregandoTela';
import { CapturaFoto } from '../../components/CapturaFoto';
import { IconX } from '@tabler/icons-react';
import { type ChecklistAvarias } from '../../lib/checklistAvarias';
import { useAvariasTriagem } from '../../lib/useAvariasTriagem';
import { imprimirRegistroEntrada, type DadosEntradaParaRelatorio } from '../../lib/relatorioEntrada';

interface OSResumo {
  id: number;
  numero_os: string;
  cliente_id: number;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  defeito_relatado: string | null;
  triagem_avarias: ChecklistAvarias | null;
  prazo_entrega: string | null;
  grupo: string | null;
  subgrupo: string | null;
  eh_otica: boolean | null;
}

interface EntradaResumo {
  id: number;
  codigo_entrada: string;
  condicao_chegada: string | null;
  data_entrada: string;
  numero_controle_cliente: string | null;
  nf_remessa_numero: string | null;
  nf_remessa_serie: string | null;
  nf_remessa_cfop: string | null;
  nf_remessa_chave_acesso: string | null;
  nf_remessa_data_emissao: string | null;
  nf_remessa_valor: number | null;
}

interface FotoExistente {
  id: number;
  storage_path: string;
  url: string | null;
}

// Tela de revisão exibida logo após "Converter em OS" (Entrada do
// Equipamento) - antes disso a conversão pulava direto pro orçamento
// técnico, sem nenhuma conferência da OS nem geração do Registro de
// Entrada. As avarias já foram identificadas na Entrada (com fotos);
// aqui dá pra revisar/completar isso antes de seguir pro orçamento.
export function RegistroEntrada() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const osId = searchParams.get('os');

  const [avarias, setAvarias] = useState<ChecklistAvarias>({});
  const avariasTriagemQuery = useAvariasTriagem();
  const [prazoEntrega, setPrazoEntrega] = useState('');
  const [fotosExistentes, setFotosExistentes] = useState<FotoExistente[]>([]);
  const [fotosNovas, setFotosNovas] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const osQuery = useQuery({
    queryKey: ['os-registro-entrada', osId],
    enabled: !!osId,
    queryFn: async (): Promise<OSResumo> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, cliente_id, cliente_nome, optica_desc, optica_fab, optica_sn, defeito_relatado, triagem_avarias, prazo_entrega, grupo, subgrupo, eh_otica')
        .eq('id', Number(osId))
        .single();
      if (error) throw error;
      return data as OSResumo;
    },
  });

  const entradaQuery = useQuery({
    queryKey: ['entrada-por-os', osId],
    enabled: !!osId,
    queryFn: async (): Promise<EntradaResumo | null> => {
      const { data, error } = await supabase
        .from('entradas_equipamento')
        .select(
          'id, codigo_entrada, condicao_chegada, data_entrada, numero_controle_cliente, nf_remessa_numero, nf_remessa_serie, nf_remessa_cfop, nf_remessa_chave_acesso, nf_remessa_data_emissao, nf_remessa_valor',
        )
        .eq('ordem_servico_id', Number(osId))
        .maybeSingle();
      if (error) throw error;
      return data as EntradaResumo | null;
    },
  });

  // Travado (Trilha A): uma vez que existe um orçamento pra essa OS, a
  // revisão da OS (checklist de avarias/prazo/fotos) fica somente-leitura -
  // o resto do pipeline (status_os) continua livre, só essa tela é que trava.
  const orcamentoExisteQuery = useQuery({
    queryKey: ['orcamento-existe-para-os', osId],
    enabled: !!osId,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from('orcamentos')
        .select('id', { count: 'exact', head: true })
        .eq('ordem_servico_id', Number(osId));
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  const travado = !!orcamentoExisteQuery.data;

  // Mesmo filtro por grupo/subgrupo já aplicado no Recebimento/Triagem -
  // aqui a OS já tem o grupo salvo (herdado da Entrada), então a lista fica
  // consistente em vez de mostrar avarias de outros tipos de equipamento.
  const checklistFiltrado = (avariasTriagemQuery.data ?? []).filter((item) => {
    // Itens sem grupo marcado são as avarias genéricas de ótica
    // (compartilhadas entre Ótica e Mini-Ótica) - só aparecem pra OS de
    // ótica, senão mostrariam "LENTE DISTAL" etc. pra qualquer equipamento.
    if (!item.grupo) return osQuery.data?.eh_otica !== false;
    if (!osQuery.data?.grupo) return true;
    if (item.grupo !== osQuery.data.grupo) return false;
    if (item.subgrupo && osQuery.data.subgrupo && item.subgrupo !== osQuery.data.subgrupo) return false;
    return true;
  });

  const clienteQuery = useQuery({
    queryKey: ['cliente-registro-entrada', osQuery.data?.cliente_id],
    enabled: !!osQuery.data?.cliente_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select(
          'id, razao_social, telefone, email, cnpj, nome_fantasia, logradouro, numero_endereco, complemento, bairro, cidade, uf, cep',
        )
        .eq('id', osQuery.data!.cliente_id)
        .single();
      if (error) throw error;
      return data as {
        id: number;
        razao_social: string;
        telefone: string | null;
        email: string | null;
        cnpj: string | null;
        nome_fantasia: string | null;
        logradouro: string | null;
        numero_endereco: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
        cep: string | null;
      };
    },
  });

  useEffect(() => {
    if (osQuery.data) {
      setAvarias(osQuery.data.triagem_avarias ?? {});
      setPrazoEntrega(osQuery.data.prazo_entrega ?? '');
    }
  }, [osQuery.data]);

  async function carregarFotos(entradaId: number): Promise<FotoExistente[]> {
    const { data } = await supabase.from('fotos_entrada').select('id, storage_path').eq('entrada_id', entradaId);
    if (!data) return [];
    return Promise.all(
      (data as { id: number; storage_path: string }[]).map(async (f) => ({
        ...f,
        url: await urlAssinadaFoto(f.storage_path),
      })),
    );
  }

  useEffect(() => {
    if (!entradaQuery.data) return;
    carregarFotos(entradaQuery.data.id).then(setFotosExistentes);
  }, [entradaQuery.data]);

  function alternarAvaria(chave: string) {
    setAvarias((a) => ({ ...a, [chave]: !a[chave] }));
  }

  async function excluirFotoExistente(foto: FotoExistente) {
    if (!confirm('Excluir esta foto?')) return;
    const { error } = await supabase.from('fotos_entrada').delete().eq('id', foto.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    await excluirArquivoStorage(foto.storage_path);
    setFotosExistentes((lista) => lista.filter((f) => f.id !== foto.id));
  }

  async function salvar() {
    if (!osQuery.data) return;
    setErro(null);
    setSalvando(true);
    try {
      const { error: erroOS } = await supabase
        .from('ordens_servico')
        .update({ triagem_avarias: avarias, prazo_entrega: prazoEntrega || null })
        .eq('id', osQuery.data.id);
      if (erroOS) throw erroOS;

      if (entradaQuery.data) {
        const { error: erroEntrada } = await supabase
          .from('entradas_equipamento')
          .update({ triagem_avarias: avarias })
          .eq('id', entradaQuery.data.id);
        if (erroEntrada) throw erroEntrada;

        for (const foto of fotosNovas) {
          const caminho = await enviarArquivoStorage(`entrada_${entradaQuery.data.id}`, foto);
          await supabase.from('fotos_entrada').insert({ entrada_id: entradaQuery.data.id, storage_path: caminho });
        }
      }

      setFotosNovas([]);
      qc.invalidateQueries({ queryKey: ['os-registro-entrada', osId] });
      qc.invalidateQueries({ queryKey: ['entrada-por-os', osId] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function gerarRegistro() {
    if (!osQuery.data) return;
    await salvar();
    const dados: DadosEntradaParaRelatorio = entradaQuery.data
      ? { ...entradaQuery.data, equipamento_desc: osQuery.data.optica_desc, equipamento_fab: osQuery.data.optica_fab, equipamento_sn: osQuery.data.optica_sn, defeito_relatado: osQuery.data.defeito_relatado, triagem_avarias: avarias }
      : {
          codigo_entrada: osQuery.data.numero_os,
          equipamento_desc: osQuery.data.optica_desc,
          equipamento_fab: osQuery.data.optica_fab,
          equipamento_sn: osQuery.data.optica_sn,
          defeito_relatado: osQuery.data.defeito_relatado,
          condicao_chegada: null,
          data_entrada: new Date().toISOString(),
          triagem_avarias: avarias,
          numero_controle_cliente: null,
          nf_remessa_numero: null,
          nf_remessa_serie: null,
          nf_remessa_cfop: null,
          nf_remessa_chave_acesso: null,
          nf_remessa_data_emissao: null,
          nf_remessa_valor: null,
        };
    const fotosFrescas = entradaQuery.data ? await carregarFotos(entradaQuery.data.id) : [];
    const urls = fotosFrescas.map((f) => f.url).filter((u): u is string => !!u);
    const c = clienteQuery.data;
    const clienteEndereco = c
      ? [[c.logradouro, c.numero_endereco].filter(Boolean).join(', '), c.complemento, c.bairro, c.cep ? `CEP ${c.cep}` : null]
          .filter(Boolean)
          .join(' - ')
      : null;
    imprimirRegistroEntrada(
      c
        ? {
            razao_social: c.razao_social,
            telefone: c.telefone,
            email: c.email,
            cnpj: c.cnpj,
            nome_fantasia: c.nome_fantasia,
            endereco: clienteEndereco,
            cidade: c.cidade,
            uf: c.uf,
          }
        : undefined,
      dados,
      urls,
      avariasTriagemQuery.data ?? [],
    );
  }

  function continuarParaOrcamento() {
    navigate(`/orcamento-tecnico?os=${osId}`);
  }

  if (!osId) return <p className="erro-login">OS não informada.</p>;
  if (osQuery.isLoading || entradaQuery.isLoading) return <CarregandoTela />;
  if (!osQuery.data) return <p className="erro-login">OS não encontrada.</p>;

  return (
    <div>
      <h1>Registro de entrada - {osQuery.data.numero_os}</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Confira os dados abaixo (vindos da Entrada do Equipamento), complete o que faltar e gere o Registro de
        Entrada antes de seguir para o orçamento.
      </p>

      <div
        style={{
          background: 'var(--paper-50)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        <div>
          <strong>Cliente:</strong> {osQuery.data.cliente_nome}
        </div>
        <div>
          <strong>Equipamento:</strong> {osQuery.data.optica_desc} ({osQuery.data.optica_fab})
        </div>
        <div className="mono">Nº série: {osQuery.data.optica_sn}</div>
        <div>
          <strong>Defeito relatado:</strong> {osQuery.data.defeito_relatado || '-'}
        </div>
        {entradaQuery.data && (
          <>
            <div>
              <strong>Condição de chegada:</strong> {entradaQuery.data.condicao_chegada || '-'}
            </div>
            {entradaQuery.data.numero_controle_cliente && (
              <div>
                <strong>Nº controle do cliente:</strong> {entradaQuery.data.numero_controle_cliente}
              </div>
            )}
          </>
        )}
        {!entradaQuery.data && (
          <p style={{ color: 'var(--copper-500)', marginTop: 8 }}>
            Esta OS não veio de uma Entrada do Equipamento (aberta manualmente) - não há NF de remessa nem fotos
            de entrada para mostrar aqui.
          </p>
        )}
      </div>

      {travado && (
        <p style={{ fontSize: 12, color: 'var(--copper-500)', marginBottom: 8 }}>
          Esta OS já tem um orçamento iniciado - o checklist de avarias, o prazo de entrega e as fotos ficam
          somente-leitura. Peça ao técnico excluir o orçamento (na tela Montar orçamento) pra editar de novo.
        </p>
      )}

      <div className="campo-form">
        <label>Avarias identificadas (marque tudo que se aplica)</label>
        {checklistFiltrado.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              checked={Boolean(avarias[String(item.id)])}
              onChange={() => alternarAvaria(String(item.id))}
              disabled={travado}
            />
            <span style={{ fontSize: 13 }}>{item.descricao}</span>
          </div>
        ))}
      </div>

      <div className="campo-form">
        <label>Prazo de entrega</label>
        <input type="text" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} disabled={travado} />
      </div>

      {entradaQuery.data && (
        <div className="campo-form">
          <label>Fotos</label>
          {fotosExistentes.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {fotosExistentes.map((f) => (
                <div key={f.id} style={{ position: 'relative' }}>
                  {f.url && (
                    <img src={f.url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }} />
                  )}
                  <button
                    type="button"
                    className="botao-icone perigo"
                    title="Excluir foto"
                    style={{ position: 'absolute', top: -8, right: -8, background: 'var(--paper-0)', borderRadius: '50%' }}
                    onClick={() => excluirFotoExistente(f)}
                    disabled={travado}
                  >
                    <IconX size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {!travado && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFotosNovas((lista) => [...lista, ...Array.from(e.target.files ?? [])])}
              />
              <CapturaFoto onCapturar={(arquivo) => setFotosNovas((lista) => [...lista, arquivo])} />
            </div>
          )}
          {fotosNovas.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
              {fotosNovas.map((foto, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
                  <span>{foto.name}</span>
                  <button
                    type="button"
                    className="botao-icone perigo"
                    onClick={() => setFotosNovas((lista) => lista.filter((_, idx) => idx !== i))}
                  >
                    <IconX size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {erro && <p className="erro-login">{erro}</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="botao-secundario" onClick={salvar} disabled={salvando || travado}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        <button className="botao-secundario" onClick={gerarRegistro} disabled={salvando}>
          Gerar Registro de Entrada
        </button>
        <button className="botao-primario" onClick={continuarParaOrcamento}>
          Continuar para orçamento
        </button>
      </div>
    </div>
  );
}
