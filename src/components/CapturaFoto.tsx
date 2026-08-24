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
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Lista as câmeras disponíveis (webcam interna, USB externa, ou
  // frontal/traseira no celular) - só tem nome/label depois de uma
  // permissão já concedida, por isso só chama depois do 1º getUserMedia.
  async function listarCameras() {
    try {
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      setCameras(dispositivos.filter((d) => d.kind === 'videoinput'));
    } catch {
      // Sem suporte a enumerateDevices - segue só com a câmera padrão.
    }
  }

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    setErro(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : true })
      .then(async (stream) => {
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        if (cameras.length === 0) {
          await listarCameras();
          // Sem escolha explícita ainda - reflete no seletor qual câmera o
          // navegador abriu por padrão, sem precisar reabrir o stream.
          if (!cameraId) {
            const idAtual = stream.getVideoTracks()[0]?.getSettings().deviceId;
            if (idAtual) setCameraId(idAtual);
          }
        }
      })
      .catch(() => setErro('Não foi possível acessar a câmera (verifique a permissão do navegador).'));

    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, cameraId]);

  function fechar() {
    setAberto(false);
    setCameras([]);
    setCameraId('');
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
              <>
                <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
                {cameras.length > 1 && (
                  <div className="campo-form" style={{ marginTop: 8, marginBottom: 0 }}>
                    <label>Câmera</label>
                    <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
                      {cameras.map((c, i) => (
                        <option key={c.deviceId} value={c.deviceId}>
                          {c.label || `Câmera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
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
