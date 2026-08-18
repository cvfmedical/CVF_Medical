import { useState } from 'react';
import { normalizarBusca } from '../../lib/normalizarBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';

interface Funcionario {
  id: number;
  nome: string;
  cargo: string | null;
  nivel_acesso: string;
  email: string | null;
  status_ativo: boolean;
  auth_user_id: string | null;
}

export function ConfiguracoesUsuarios() {
  const qc = useQueryClient();
  const [convidando, setConvidando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [linkReenvio, setLinkReenvio] = useState<{ nome: string; link: string; codigo: string } | null>(null);
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['funcionarios-config'],
    queryFn: async (): Promise<Funcionario[]> => {
      const { data, error } = await supabase
        .from('funcionarios')
        .select('id, nome, cargo, nivel_acesso, email, status_ativo, auth_user_id')
        .order('nome');
      if (error) throw error;
      return data as Funcionario[];
    },
  });

  async function convidar(f: Funcionario) {
    setErro(null);
    if (!f.email) {
      setErro(`${f.nome} não tem e-mail cadastrado - edite o funcionário em "Funcionários / técnicos" antes de convidar.`);
      return;
    }
    const mensagem = f.auth_user_id
      ? `Gerar um novo link de acesso para ${f.nome} (${f.email})? Use isso se o link anterior expirou antes dele definir a senha. O link não é enviado por e-mail - você copia e repassa manualmente.`
      : `Enviar convite de acesso web para ${f.nome} (${f.email})?`;
    if (!confirm(mensagem)) return;
    setConvidando(f.id);
    try {
      const { data, error } = await supabase.functions.invoke('convidar-funcionario', {
        body: { funcionario_id: f.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.link) {
        setLinkReenvio({ nome: f.nome, link: data.link, codigo: data.codigo });
      }
      qc.invalidateQueries({ queryKey: ['funcionarios-config'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setConvidando(null);
    }
  }

  if (query.isLoading) return <CarregandoTela />;

  function valorColuna(f: Funcionario, chave: string): unknown {
    if (chave === 'status_ativo') return f.status_ativo ? 'Ativo' : 'Inativo';
    if (chave === 'auth_user_id') return f.auth_user_id ? 'Vinculado' : 'Sem acesso';
    return (f as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (query.data ?? []).filter((f) => {
    const ativos = Object.entries(filtrosColuna).filter(([, v]) => v.trim());
    return ativos.every(([chave, termo]) =>
      normalizarBusca(String(valorColuna(f, chave) ?? '')).includes(normalizarBusca(termo.trim())),
    );
  });
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  return (
    <div>
      <h1>Configurações e usuários</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Só administradores podem convidar. O convite envia um e-mail com um link para o funcionário definir a
        própria senha - ninguém, nem o administrador, vê ou define a senha por ele. Se o link expirar antes de ser
        usado, clique em "Reenviar convite" - nesse caso o link E um código de acesso aparecem na tela pra você
        repassar manualmente (não é enviado por e-mail de novo). Prefira repassar o código: links enviados por
        WhatsApp costumam expirar sozinhos porque o próprio app "clica" neles pra gerar a prévia da mensagem.
      </p>

      {erro && <p className="erro-login">{erro}</p>}

      {linkReenvio && (
        <div style={{ background: 'var(--surface-200)', border: '1px solid var(--ink-200)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            Novo acesso gerado para <strong>{linkReenvio.nome}</strong> (não é enviado por e-mail automaticamente neste
            reenvio).
          </p>

          <p style={{ fontSize: 13, marginBottom: 4 }}>
            <strong>Recomendado - repasse por WhatsApp este código de acesso</strong> (o link abaixo costuma expirar
            sozinho quando mandado por WhatsApp, porque o próprio app busca a URL pra montar a prévia da mensagem, e
            isso já consome o link antes da pessoa clicar; o código não tem esse problema). Peça pra pessoa abrir{' '}
            <em>Recebeu um código de acesso em vez de um link?</em> na tela de login e digitar o e-mail + este código:
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              readOnly
              value={linkReenvio.codigo}
              style={{ flex: 1, fontSize: 18, fontWeight: 600, letterSpacing: 2, textAlign: 'center' }}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="botao-secundario"
              onClick={() => {
                navigator.clipboard.writeText(linkReenvio.codigo);
              }}
            >
              Copiar código
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 4 }}>
            Alternativa (link direto - evite mandar por WhatsApp):
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={linkReenvio.link} style={{ flex: 1, fontSize: 12 }} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="botao-secundario"
              onClick={() => {
                navigator.clipboard.writeText(linkReenvio.link);
              }}
            >
              Copiar link
            </button>
            <button type="button" className="botao-secundario" onClick={() => setLinkReenvio(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['nome', 'Nome'],
              ['cargo', 'Cargo'],
              ['nivel_acesso', 'Nível de acesso'],
              ['email', 'E-mail'],
              ['status_ativo', 'Ativo'],
              ['auth_user_id', 'Acesso web'],
            ].map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
            <th></th>
          </tr>
          <tr>
            {['nome', 'cargo', 'nivel_acesso', 'email', 'status_ativo', 'auth_user_id'].map((chave) => (
              <th key={chave} style={{ padding: '2px 6px' }}>
                <input
                  type="text"
                  className="campo-filtro-coluna"
                  placeholder="Filtrar..."
                  value={filtrosColuna[chave] ?? ''}
                  onChange={(e) => setFiltrosColuna((f) => ({ ...f, [chave]: e.target.value }))}
                />
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((f) => (
            <tr key={f.id}>
              <td>{f.nome}</td>
              <td>{f.cargo}</td>
              <td>{f.nivel_acesso}</td>
              <td>{f.email || '-'}</td>
              <td>
                <Badge tono={f.status_ativo ? 'teal' : 'neutro'}>{f.status_ativo ? 'Ativo' : 'Inativo'}</Badge>
              </td>
              <td>
                <Badge tono={f.auth_user_id ? 'teal' : 'copper'}>{f.auth_user_id ? 'Vinculado' : 'Sem acesso'}</Badge>
              </td>
              <td className="acoes-tabela">
                <button className="botao-secundario" disabled={convidando === f.id} onClick={() => convidar(f)}>
                  {convidando === f.id ? 'Enviando...' : f.auth_user_id ? 'Reenviar convite' : 'Convidar'}
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhum funcionário encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
