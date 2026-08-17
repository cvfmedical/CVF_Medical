import { useCallback, useState } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ModalJanela } from '../components/ModalJanela';

interface AcaoPendente {
  titulo?: string;
  mensagem?: string;
  executar: () => void | Promise<void>;
}

// Revalida a senha de quem está logado antes de uma ação sensível (reverter
// precificação, excluir orçamento pra desbloquear a OS, aprovar equipamento
// não-ótica). Não existe padrão de reautenticação no sistema até aqui - usa
// o próprio signInWithPassword do Supabase só pra validar (também renova a
// sessão local, sem efeito colateral ruim); ninguém além do próprio usuário
// vê essa senha.
//
// Uso:
//   const { pedirConfirmacao, ModalConfirmacao } = useConfirmarSenha();
//   <button onClick={() => pedirConfirmacao(minhaAcao, { titulo: '...', mensagem: '...' })}>...</button>
//   {ModalConfirmacao}
export function useConfirmarSenha() {
  const { session } = useAuth();
  const [acaoPendente, setAcaoPendente] = useState<AcaoPendente | null>(null);
  const [senha, setSenha] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pedirConfirmacao = useCallback((executar: () => void | Promise<void>, opts?: { titulo?: string; mensagem?: string }) => {
    setSenha('');
    setErro(null);
    setAcaoPendente({ executar, ...opts });
  }, []);

  function cancelar() {
    setAcaoPendente(null);
    setSenha('');
    setErro(null);
  }

  async function confirmar() {
    if (!acaoPendente || !session?.user.email) return;
    setErro(null);
    setVerificando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: session.user.email, password: senha });
      if (error) {
        setErro('Senha incorreta.');
        return;
      }
      await acaoPendente.executar();
      setAcaoPendente(null);
      setSenha('');
    } finally {
      setVerificando(false);
    }
  }

  const ModalConfirmacao = acaoPendente ? (
    <ModalJanela titulo={acaoPendente.titulo ?? 'Confirmar ação'} aoFechar={cancelar} larguraMax={380}>
      {acaoPendente.mensagem && <p style={{ fontSize: 13, marginBottom: 12 }}>{acaoPendente.mensagem}</p>}
      <div className="campo-form">
        <label>Digite sua senha para confirmar</label>
        <input
          type="password"
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirmar()}
        />
      </div>
      {erro && <p className="erro-login">{erro}</p>}
      <div className="modal-acoes">
        <button className="botao-secundario" onClick={cancelar}>
          Cancelar
        </button>
        <button className="botao-primario" onClick={confirmar} disabled={!senha || verificando}>
          {verificando ? 'Verificando...' : 'Confirmar'}
        </button>
      </div>
    </ModalJanela>
  ) : null;

  return { pedirConfirmacao, ModalConfirmacao };
}
