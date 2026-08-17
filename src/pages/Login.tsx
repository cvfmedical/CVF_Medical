import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import cvfMarca from '../assets/cvf-marca.png';

export function Login() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
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
        <img src={cvfMarca} alt="Q-CVF Medical" className="logomark-topo" />
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
        <div className="campo-senha">
          <input
            id="senha"
            type={verSenha ? 'text' : 'password'}
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          <button
            type="button"
            className="ver-senha"
            onClick={() => setVerSenha((v) => !v)}
            title={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
            aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {verSenha ? <IconEyeOff size={18} /> : <IconEye size={18} />}
          </button>
        </div>

        {erro && <p className="erro-login">{erro}</p>}

        <button type="submit" className="botao-primario" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>

        <Link to="/codigo-acesso" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>
          Recebeu um código de acesso em vez de um link?
        </Link>
      </form>
    </div>
  );
}
