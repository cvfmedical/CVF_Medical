import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import cvfMarca from '../assets/cvf-marca.png';

// Alternativa ao link de convite/redefinição por e-mail: um código de 6
// dígitos que a pessoa digita aqui manualmente. Existe porque o link
// costuma "expirar sozinho" quando é repassado por WhatsApp (o próprio
// WhatsApp busca a URL pra gerar a prévia da mensagem, e isso já consome o
// link de uso único antes da pessoa clicar) - o código não tem esse
// problema, porque não é uma URL, ninguém "clica" nele sozinho.
export function CodigoAcesso() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo.trim(), type: 'recovery' });
    setEnviando(false);
    if (error) {
      setErro('Código inválido ou expirado. Peça um novo convite/reenvio a um administrador.');
      return;
    }
    navigate('/definir-senha', { replace: true });
  }

  return (
    <div className="tela-login">
      <form className="card-login" onSubmit={handleSubmit}>
        <img src={cvfMarca} alt="Q-CVF Medical" className="logomark-topo" />
        <h1>Q-CVF Medical</h1>
        <p className="subtitulo">Entrar com código de acesso</p>
        <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: -8, marginBottom: 8 }}>
          Digite o e-mail cadastrado e o código de acesso que o administrador te repassou.
        </p>

        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="codigo">Código de acesso</label>
        <input
          id="codigo"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          required
        />

        {erro && <p className="erro-login">{erro}</p>}

        <button type="submit" className="botao-primario" disabled={enviando}>
          {enviando ? 'Verificando...' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}
