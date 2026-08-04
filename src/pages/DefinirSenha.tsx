import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import cvfMarca from '../assets/cvf-marca.png';

// Tela pós-convite: o link de convite/recuperação do Supabase Auth traz
// os tokens no #hash da URL - o supabase-js já detecta isso sozinho
// (detectSessionInUrl é o padrão) e cria uma sessão temporária antes
// deste componente montar. Aqui só falta pedir a senha definitiva via
// updateUser({ password }) - ninguém, nem o administrador, vê essa senha.
export function DefinirSenha() {
  const [checando, setChecando] = useState(true);
  const [temSessao, setTemSessao] = useState(false);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.slice(1));
      const desc = params.get('error_description');
      setErroLink(
        desc?.includes('expired') || params.get('error_code') === 'otp_expired'
          ? 'Este link de convite expirou. Peça para um administrador reenviar o convite em "Configurações e usuários".'
          : desc || 'Este link de convite é inválido.',
      );
      setChecando(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setTemSessao(!!session);
      setChecando(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) {
      setErro('A senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.');
      return;
    }
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) {
      setErro('Não foi possível definir a senha: ' + error.message);
      return;
    }
    setConcluido(true);
  }

  if (concluido) return <Navigate to="/" replace />;

  return (
    <div className="tela-login">
      <div className="card-login">
        <img src={cvfMarca} alt="Q-CVF Medical" className="logomark-topo" />
        <h1>Q-CVF Medical</h1>
        <p className="subtitulo">Definir senha de acesso</p>

        {checando && <p>Verificando convite...</p>}

        {!checando && erroLink && <p className="erro-login">{erroLink}</p>}

        {!checando && !erroLink && !temSessao && (
          <p className="erro-login">
            Não foi possível validar o convite. Peça para um administrador reenviar o convite em "Configurações e
            usuários".
          </p>
        )}

        {!checando && temSessao && (
          <form onSubmit={handleSubmit}>
            <label htmlFor="senha">Nova senha</label>
            <input
              id="senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />

            <label htmlFor="confirmacao">Confirmar senha</label>
            <input
              id="confirmacao"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              required
            />

            {erro && <p className="erro-login">{erro}</p>}

            <button type="submit" className="botao-primario" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Definir senha e entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
