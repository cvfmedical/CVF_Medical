import { useEffect, useRef, useState } from 'react';
import { IconCamera } from '@tabler/icons-react';
import { ModalJanela } from './ModalJanela';

// Botão "Tirar foto" que abre a webcam/câmera USB conectada ao
// computador (via getUserMedia) num modal, deixa o usuário enquadrar e
// capturar um frame, e devolve um File pronto pra entrar na mesma lista
// de upload dos arquivos escolhidos por <input type="file">.
export function CapturaFoto({ onCapturar }: { onCapturar: (arquivo: File) => void }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    setErro(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => {
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setErro('Não foi possível acessar a câmera (verifique a permissão do navegador).'));

    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [aberto]);

  function fechar() {
    setAberto(false);
  }

  function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const arquivo = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapturar(arquivo);
      fechar();
    }, 'image/jpeg');
  }

  return (
    <>
      <button type="button" className="botao-secundario" onClick={() => setAberto(true)}>
        <IconCamera size={16} /> Tirar foto
      </button>

      {aberto && (
        <ModalJanela titulo="Tirar foto" aoFechar={fechar}>
            {erro ? (
              <p className="erro-login">{erro}</p>
            ) : (
              <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            )}
            <div className="modal-acoes">
              <button className="botao-secundario" onClick={fechar}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={capturar} disabled={!!erro}>
                Capturar
              </button>
            </div>
        </ModalJanela>
      )}
    </>
  );
}
