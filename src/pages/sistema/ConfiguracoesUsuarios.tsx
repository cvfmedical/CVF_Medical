import { useState } from 'react';
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
      ? `Reenviar convite de acesso web para ${f.nome} (${f.email})? Use isso se o link anterior expirou antes dele definir a senha.`
      : `Enviar convite de acesso web para ${f.nome} (${f.email})?`;
    if (!confirm(mensagem)) return;
    setConvidando(f.id);
    try {
      const { data, error } = await supabase.functions.invoke('convidar-funcionario', {
        body: { funcionario_id: f.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      qc.invalidateQueries({ queryKey: ['funcionarios-config'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setConvidando(null);
    }
  }

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Configurações e usuários</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Só administradores podem convidar. O convite envia um e-mail com um link para o funcionário definir a
        própria senha - ninguém, nem o administrador, vê ou define a senha por ele. Se o link expirar antes de ser
        usado, clique em "Reenviar convite".
      </p>

      {erro && <p className="erro-login">{erro}</p>}

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Cargo</th>
            <th>Nível de acesso</th>
            <th>E-mail</th>
            <th>Ativo</th>
            <th>Acesso web</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(query.data ?? []).map((f) => (
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
          {(query.data ?? []).length === 0 && (
            <tr>
              <td colSpan={7}>Nenhum funcionário encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
