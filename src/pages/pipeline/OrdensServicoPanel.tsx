import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { CHECKLIST_AVARIAS, type ChecklistAvarias } from '../../lib/checklistAvarias';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { Badge } from '../../components/Badge';
import { tonoDoStatusOS } from '../../lib/statusOS';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmarSenha } from '../../lib/useConfirmarSenha';
import { mensagemErro } from '../../lib/erros';
import { IconTrash } from '@tabler/icons-react';

// OS ainda não iniciou manutenção física - único momento em que dá pra
// excluir por completo (espelha a checagem feita em excluir_os_completa,
// no banco - a função é quem realmente garante isso, isso aqui é só pra
// decidir se mostra o botão).
const STATUS_EXCLUIVEIS = [
  '1. TRIAGEM / RECEBIMENTO',
  '2. AGUARDANDO ORÇAMENTO',
  '2B. AGUARDANDO PRECIFICAÇÃO',
  '3. AGUARDANDO APROVAÇÃO DO CLIENTE',
];

interface OrdemServico {
  id: number;
  numero_os: string;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  defeito_relatado: string | null;
  status_os: string | null;
  triagem_avarias: ChecklistAvarias | null;
  data_abertura: string;
}

// Une o que antes eram duas telas separadas (Fila de Triagem + Histórico
// de Equipamentos) num único painel: lista todas as OS, com busca;
// clicar numa linha mostra os detalhes completos (checklist de avarias
// da triagem, defeito relatado etc.). O status não é editável aqui -
// ele muda sozinho conforme a OS avança pelas telas do fluxo real
// (orçamento, aprovação do cliente, manutenção, selagem, testes,
// entrega); editar isso à mão aqui destoava do fluxo de verdade.

export function OrdensServicoPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { funcionario } = useAuth();
  const { pedirConfirmacao, ModalConfirmacao } = useConfirmarSenha();
  const [filtro, setFiltro] = useState('');
  const [detalhe, setDetalhe] = useState<OrdemServico | null>(null);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['ordens-servico-painel'],
    queryFn: async (): Promise<OrdemServico[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*')
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      return data as OrdemServico[];
    },
  });

  function excluirOS(os: OrdemServico) {
    setErro(null);
    pedirConfirmacao(
      async () => {
        setExcluindo(os.id);
        try {
          const { error } = await supabase.rpc('excluir_os_completa', { p_os_id: os.id });
          if (error) throw error;
          if (detalhe?.id === os.id) setDetalhe(null);
          qc.invalidateQueries({ queryKey: ['ordens-servico-painel'] });
          qc.invalidateQueries({ queryKey: ['entradas_equipamento'] });
        } catch (e) {
          setErro(mensagemErro(e));
        } finally {
          setExcluindo(null);
        }
      },
      {
        titulo: `Excluir ${os.numero_os} por completo?`,
        mensagem: `A OS, o orçamento (se houver) e o vínculo com a entrada de origem serão apagados. A entrada volta para "Aguardando Triagem" - suas fotos e checklist continuam salvos, mas ela precisa ser convertida em OS de novo. Essa ação não pode ser desfeita.`,
      },
    );
  }

  const linhas = useMemo(() => {
    const todas = query.data ?? [];
    if (!filtro.trim()) return todas;
    const termo = filtro.trim().toLowerCase();
    return todas.filter(
      (os) =>
        os.numero_os.toLowerCase().includes(termo) ||
        os.cliente_nome.toLowerCase().includes(termo) ||
        (os.optica_sn ?? '').toLowerCase().includes(termo) ||
        (os.optica_desc ?? '').toLowerCase().includes(termo),
    );
  }, [query.data, filtro]);

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Ordem de serviço / identificação de peças danificadas</h1>
      <input
        className="campo-filtro"
        placeholder="Buscar por nº OS, cliente, equipamento ou nº de série..."
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />

      {erro && <p className="erro-login">{erro}</p>}

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Nº OS</th>
            <th>Cliente</th>
            <th>Equipamento</th>
            <th>Nº de série</th>
            <th>Status</th>
            <th>Aberta em</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((os) => (
            <tr key={os.id}>
              <td className="mono">{os.numero_os}</td>
              <td>{os.cliente_nome}</td>
              <td>{os.optica_desc}</td>
              <td className="mono">{os.optica_sn}</td>
              <td>
                <Badge tono={tonoDoStatusOS(os.status_os)}>{os.status_os ?? '-'}</Badge>
              </td>
              <td>{new Date(os.data_abertura).toLocaleDateString('pt-BR')}</td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => setDetalhe(os)}>
                  Detalhes
                </button>
                <button
                  className="botao-secundario"
                  style={{ marginLeft: 6 }}
                  onClick={() => navigate(`/registro-entrada?os=${os.id}`)}
                >
                  Registro de entrada
                </button>
                <button
                  className="botao-secundario"
                  style={{ marginLeft: 6 }}
                  onClick={() => navigate(`/orcamento-tecnico?os=${os.id}`)}
                >
                  Ver orçamento
                </button>
                {funcionario?.nivel_acesso === 'Administrador' && STATUS_EXCLUIVEIS.includes(os.status_os ?? '') && (
                  <button
                    className="botao-icone perigo"
                    title="Excluir OS por completo"
                    style={{ marginLeft: 6 }}
                    disabled={excluindo === os.id}
                    onClick={() => excluirOS(os)}
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhuma OS encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {detalhe && (
        <ModalJanela titulo={detalhe.numero_os} aoFechar={() => setDetalhe(null)}>
            <div className="campo-form">
              <label>Cliente</label>
              <p>{detalhe.cliente_nome}</p>
            </div>
            <div className="campo-form">
              <label>Equipamento</label>
              <p>
                {detalhe.optica_desc} ({detalhe.optica_fab}) - <span className="mono">{detalhe.optica_sn}</span>
              </p>
            </div>
            <div className="campo-form">
              <label>Defeito relatado</label>
              <p>{detalhe.defeito_relatado || '-'}</p>
            </div>
            <div className="campo-form">
              <label>Avarias identificadas na triagem</label>
              {CHECKLIST_AVARIAS.filter((item) => detalhe.triagem_avarias?.[item.key]).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Nenhuma avaria marcada</p>
              )}
              {CHECKLIST_AVARIAS.filter((item) => detalhe.triagem_avarias?.[item.key]).map((item) => (
                <Badge key={item.key} tono="copper">
                  {item.label}
                </Badge>
              ))}
            </div>
            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
            </div>
        </ModalJanela>
      )}

      {ModalConfirmacao}
    </div>
  );
}
