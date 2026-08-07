import { useEffect, useState } from 'react';

const DEZ_MINUTOS = 10 * 60 * 1000;

// Permite fechar um alerta flutuante - ele some e reaparece 10 minutos
// depois. O estado é por instância (cada alerta tem o seu), em memória
// (reabre se a página for recarregada, de propósito - é um lembrete).
export function useAlertaDismissivel() {
  const [ocultoAte, setOcultoAte] = useState<number | null>(null);

  useEffect(() => {
    if (ocultoAte == null) return;
    const restante = ocultoAte - Date.now();
    if (restante <= 0) {
      setOcultoAte(null);
      return;
    }
    const t = setTimeout(() => setOcultoAte(null), restante);
    return () => clearTimeout(t);
  }, [ocultoAte]);

  const oculto = ocultoAte != null && Date.now() < ocultoAte;
  const fechar = () => setOcultoAte(Date.now() + DEZ_MINUTOS);

  return { oculto, fechar };
}
