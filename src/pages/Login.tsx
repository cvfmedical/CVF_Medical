import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Logomark } from '../components/Logomark';

export function Login() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await signIn(email, senha);
    setEnviando(false);
    if (error) setErro(error);
  }

  return (
    <div className="tela-login">
      <form className="card-login" onSubmit={handleSubmit}>
        <Logomark size={32} className="logomark-topo" title="Q-CVF Medical" />
        <h1>Q-CVF Medical</h1>
        <p className="subtitulo">Sistema interno - acesso restrito a funcionários</p>

        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />

        {erro && <p className="erro-login">{erro}</p>}

        <button type="submit" className="botao-primario" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
