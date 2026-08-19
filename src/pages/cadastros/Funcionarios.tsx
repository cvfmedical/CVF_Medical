import { CrudPage } from '../../components/CrudPage';
import { NIVEIS_ACESSO } from '../../lib/permissions';
import { Badge } from '../../components/Badge';

interface Funcionario {
  id: number;
  nome: string;
  cargo: string | null;
  nivel_acesso: string;
  email: string | null;
  status_ativo: boolean;
  auth_user_id: string | null;
  usuario_login: string;
  senha_hash: string;
}

export function Funcionarios() {
  return (
    <div>
      <CrudPage<Funcionario>
        titulo="Funcionários / técnicos"
        tabela="funcionarios"
        ordenarPor="nome"
        camposFiltro={['nome', 'cargo', 'email']}
        valorInicial={{ status_ativo: true }}
        colunas={[
          { chave: 'nome', label: 'Nome' },
          { chave: 'cargo', label: 'Cargo' },
          { chave: 'nivel_acesso', label: 'Nível de acesso' },
          { chave: 'email', label: 'E-mail' },
          {
            chave: 'status_ativo',
            label: 'Ativo',
            render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
            rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
          },
          {
            chave: 'auth_user_id',
            label: 'Conta web',
            render: (r) => (
              <Badge tono={r.auth_user_id ? 'teal' : 'copper'}>{r.auth_user_id ? 'Vinculada' : 'Sem acesso'}</Badge>
            ),
          },
        ]}
        campos={[
          { name: 'nome', label: 'Nome', type: 'text', obrigatorio: true },
          { name: 'cargo', label: 'Cargo', type: 'text' },
          { name: 'nivel_acesso', label: 'Nível de acesso', type: 'select', opcoes: [...NIVEIS_ACESSO], obrigatorio: true },
          { name: 'email', label: 'E-mail (usado para o convite de acesso web)', type: 'text', obrigatorio: true },
          { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
        ]}
        validar={(d) => {
          if (!d.nome) return 'Informe o nome.';
          if (!d.nivel_acesso) return 'Selecione o nível de acesso.';
          if (!d.email) return 'Informe o e-mail (necessário para liberar o acesso à web).';
          return null;
        }}
        antesDeEnviar={(d) => {
          const dados = { ...d };
          // usuario_login/senha_hash: colunas legadas (NOT NULL) usadas só
          // pelo login antigo do app desktop (PBKDF2). Funcionário criado
          // pela web não usa desktop, então geramos um valor placeholder
          // que nunca combina com nenhuma senha real (ver verificar_senha
          // em cadastros.py - falha com segurança para valor mal-formado).
          if (!dados.usuario_login) {
            const prefixo = String(dados.email ?? '').split('@')[0] || 'usuario';
            dados.usuario_login = `${prefixo}_${Date.now().toString(36)}`;
          }
          if (!dados.senha_hash) {
            dados.senha_hash = `webonly$${crypto.randomUUID().replace(/-/g, '')}`;
          }
          return dados;
        }}
      />
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 12 }}>
        Para convidar um funcionário sem acesso web, use "Configurações e usuários" (Sistema).
      </p>
    </div>
  );
}
