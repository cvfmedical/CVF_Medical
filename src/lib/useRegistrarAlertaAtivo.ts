import { createContext, useContext, useEffect } from 'react';

// Cada alerta da pilha flutuante (AlertasFlutuantes) avisa aqui se está
// mostrando algo agora - só assim o container (alcinha de arrastar +
// cartões) sabe quando não tem nada ativo e pode sumir de vez, em vez de
// deixar só a alcinha flutuando sozinha por cima do conteúdo da tela.
export const ContextoAlertasAtivos = createContext<((chave: string, ativo: boolean) => void) | null>(null);

export function useRegistrarAlertaAtivo(chave: string, ativo: boolean) {
  const registrar = useContext(ContextoAlertasAtivos);
  useEffect(() => {
    registrar?.(chave, ativo);
    return () => registrar?.(chave, false);
  }, [registrar, chave, ativo]);
}
