import { useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { calcularMtfSlantedEdge, paraCiclosPorMm, type ResultadoMtf, type Roi } from '../../lib/esfr';
import { BancadaVisaoPdf } from './BancadaVisaoPdf';

// Teste de resolução óptica (ISO 8600-5, e-SFR / borda inclinada) integrado à
// OS e ao laudo. Fluxo: seleciona OS + modelo, carrega a imagem da câmera
// monocromática, marca a ROI sobre uma borda inclinada (~5°), calcula MTF50,
// compara com a referência do modelo (golden sample) ± tolerância e gera o
// laudo de resolução (PDF + registro no banco).

const MAX_LARGURA = 720;

interface OSItem {
  id: number;
  numero_os: string;
  cliente_id: number;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
}
interface ModeloRes {
  id: number;
  fabricante: string;
  modelo: string;
  mtf50_referencia_ciclos_px: number | null;
  resolucao_tolerancia_pct: number | null;
}

export function TesteResolucao() {
  const { funcionario } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const escalaExibRef = useRef(1);
  const arrasteRef = useRef<{ x0: number; y0: number } | null>(null);

  const [temImagem, setTemImagem] = useState(false);
  const [roi, setRoi] = useState<Roi | null>(null);
  const [resultado, setResultado] = useState<ResultadoMtf | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [escalaPxMm, setEscalaPxMm] = useState('');
  const [osId, setOsId] = useState('');
  const [modeloId, setModeloId] = useState('');
  const [salvando, setSalvando] = useState(false);

  const osQuery = useQuery({
    queryKey: ['os-resolucao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, cliente_id, cliente_nome, optica_desc, optica_fab, optica_sn')
        .order('data_abertura', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as OSItem[];
    },
  });
  const modelosQuery = useQuery({
    queryKey: ['modelos-resolucao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalogo_oticas')
        .select('id, fabricante, modelo, mtf50_referencia_ciclos_px, resolucao_tolerancia_pct')
        .order('fabricante');
      if (error) throw error;
      return data as ModeloRes[];
    },
  });
  const os = osQuery.data?.find((o) => String(o.id) === osId) ?? null;
  const modelo = modelosQuery.data?.find((m) => String(m.id) === modeloId) ?? null;
  const clienteQuery = useQuery({
    queryKey: ['cliente-resolucao', os?.cliente_id],
    enabled: !!os,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, cnpj, nome_fantasia, cidade, email')
        .eq('id', os!.cliente_id)
        .single();
      if (error) throw error;
      return data as { cnpj: string | null; nome_fantasia: string | null; cidade: string | null; email: string | null };
    },
  });

  const tol = modelo?.resolucao_tolerancia_pct ?? 20;
  const conforme =
    resultado && modelo?.mtf50_referencia_ciclos_px != null
      ? resultado.mtf50 >= modelo.mtf50_referencia_ciclos_px * (1 - tol / 100)
      : null;

  function desenhar(roiAtual: Roi | null) {
    const canvas = canvasRef.current;
    const full = imageDataRef.current;
    if (!canvas || !full) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const off = document.createElement('canvas');
    off.width = full.width;
    off.height = full.height;
    off.getContext('2d')!.putImageData(full, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    if (roiAtual) {
      const s = escalaExibRef.current;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(roiAtual.x / s, roiAtual.y / s, roiAtual.w / s, roiAtual.h / s);
    }
  }

  async function carregarImagem(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setErro(null);
    setMsg(null);
    setResultado(null);
    setRoi(null);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Não foi possível ler a imagem.'));
        img.src = url;
      });
      const full = document.createElement('canvas');
      full.width = img.naturalWidth;
      full.height = img.naturalHeight;
      full.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      imageDataRef.current = full.getContext('2d')!.getImageData(0, 0, full.width, full.height);
      const canvas = canvasRef.current!;
      const s = img.naturalWidth > MAX_LARGURA ? img.naturalWidth / MAX_LARGURA : 1;
      escalaExibRef.current = s;
      canvas.width = Math.round(img.naturalWidth / s);
      canvas.height = Math.round(img.naturalHeight / s);
      setTemImagem(true);
      desenhar(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar imagem.');
    }
  }

  function coordCanvas(e: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }
  function mouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!temImagem) return;
    const { x, y } = coordCanvas(e);
    arrasteRef.current = { x0: x, y0: y };
  }
  function roiDe(e: ReactMouseEvent<HTMLCanvasElement>): Roi {
    const s = escalaExibRef.current;
    const { x, y } = coordCanvas(e);
    const { x0, y0 } = arrasteRef.current!;
    return {
      x: Math.round(Math.min(x0, x) * s),
      y: Math.round(Math.min(y0, y) * s),
      w: Math.round(Math.abs(x - x0) * s),
      h: Math.round(Math.abs(y - y0) * s),
    };
  }
  function mouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!arrasteRef.current) return;
    desenhar(roiDe(e));
  }
  function mouseUp(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!arrasteRef.current) return;
    const r = roiDe(e);
    arrasteRef.current = null;
    if (r.w < 20 || r.h < 20) {
      setErro('ROI muito pequena. Arraste um retângulo maior sobre a borda inclinada.');
      setRoi(null);
      desenhar(null);
      return;
    }
    setErro(null);
    setRoi(r);
    desenhar(r);
  }

  function calcular() {
    const full = imageDataRef.current;
    if (!full || !roi) {
      setErro('Carregue a imagem e marque a ROI sobre a borda inclinada.');
      return;
    }
    try {
      const r = calcularMtfSlantedEdge(full, roi);
      if (!r.freq.length || Number.isNaN(r.anguloBordaGraus)) {
        setErro('Não foi possível detectar uma borda na ROI. Marque uma região com borda nítida e inclinada.');
        setResultado(null);
        return;
      }
      setErro(null);
      setResultado(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro no cálculo.');
    }
  }

  async function salvarLaudo() {
    if (!os) {
      setMsg('Selecione a ordem de serviço.');
      return;
    }
    if (!resultado) {
      setMsg('Calcule a MTF antes de salvar.');
      return;
    }
    if (!modelo || modelo.mtf50_referencia_ciclos_px == null) {
      setMsg('Modelo sem MTF50 de referência. Cadastre no catálogo de óticas antes de emitir o laudo de resolução.');
      return;
    }
    setSalvando(true);
    setMsg(null);
    try {
      const numeroLaudo = await gerarNumeroSequencial('LAUDO', 'laudos', 'numero_laudo');
      const cliente = clienteQuery.data;
      const blob = await pdf(
        <BancadaVisaoPdf
          dados={{
            codLaudo: numeroLaudo,
            numeroOS: os.numero_os,
            dataEmissao: new Date().toLocaleDateString('pt-BR'),
            dataEnsaio: new Date().toLocaleString('pt-BR'),
            etapa: 'resolucao',
            clienteNome: os.cliente_nome,
            clienteCnpj: cliente?.cnpj ?? '',
            clienteFantasia: cliente?.nome_fantasia ?? '',
            clienteCidade: cliente?.cidade ?? '',
            clienteEmail: cliente?.email ?? '',
            equipamentoDesc: os.optica_desc ?? '',
            equipamentoFab: os.optica_fab ?? '',
            equipamentoSn: os.optica_sn ?? '',
            metricas: null,
            resultado: conforme ? 'Aprovado' : 'Reprovado',
            imagemDataUrl: null,
            tecnicoResponsavel: funcionario?.nome ?? '',
            observacoes: '',
            resolucao: {
              modeloNome: `${modelo.fabricante} ${modelo.modelo}`,
              mtf50: resultado.mtf50,
              mtf50Referencia: modelo.mtf50_referencia_ciclos_px,
              tolerancia: tol,
              anguloBorda: resultado.anguloBordaGraus,
              conforme,
            },
          }}
        />,
      ).toBlob();

      const caminho = `laudo_${os.id}/${numeroLaudo}.pdf`;
      const { error: eUp } = await supabase.storage.from('laudos-pdf').upload(caminho, blob, {
        contentType: 'application/pdf',
      });
      if (eUp) throw eUp;
      const { error: eIns } = await supabase.from('laudos').insert({
        numero_laudo: numeroLaudo,
        ordem_servico_id: os.id,
        tecnico_responsavel: funcionario?.nome ?? null,
        resultado: conforme ? 'Aprovado' : 'Reprovado',
        storage_path: caminho,
        etapa: 'resolucao',
        catalogo_otica_id: Number(modeloId),
        numero_serie_otica: os.optica_sn ?? null,
        mtf50_medido_ciclos_px: Number(resultado.mtf50.toFixed(4)),
        mtf50_referencia_ciclos_px: modelo.mtf50_referencia_ciclos_px,
        resolucao_angulo_borda_graus: Number(resultado.anguloBordaGraus.toFixed(2)),
        resolucao_conforme: conforme,
      });
      if (eIns) throw eIns;
      setMsg(`Laudo de resolução ${numeroLaudo} gerado e salvo (${conforme ? 'CONFORME' : 'NÃO CONFORME'}).`);
    } catch (e) {
      setMsg(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const anguloAbs = resultado ? Math.abs(resultado.anguloBordaGraus) : 0;
  const anguloOk = resultado ? anguloAbs >= 2 && anguloAbs <= 15 : true;
  const escNum = Number(escalaPxMm.replace(',', '.'));
  const mtf50CicloMm =
    resultado && escNum > 0 && Number.isFinite(resultado.mtf50) ? paraCiclosPorMm(resultado.mtf50, escNum) : null;
  const curva = resultado ? construirCurva(resultado) : '';

  return (
    <div>
      <h1>Teste de resolução (ISO 8600-5)</h1>
      <p style={{ maxWidth: 720, color: 'var(--ink-400)', fontSize: 13 }}>
        Método e-SFR (borda inclinada). Selecione a OS e o modelo, carregue a imagem do alvo de resolução
        (borda ~5°) capturada pela câmera monocromática, marque uma <strong>ROI sobre a borda</strong>, calcule a
        MTF e gere o laudo de resolução.
      </p>

      <div className="campo-form" style={{ maxWidth: 420 }}>
        <label>Ordem de serviço</label>
        <select value={osId} onChange={(e) => setOsId(e.target.value)}>
          <option value="">Selecione...</option>
          {(osQuery.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.numero_os} - {o.cliente_nome}
            </option>
          ))}
        </select>
      </div>
      <div className="campo-form" style={{ maxWidth: 420 }}>
        <label>Modelo da ótica</label>
        <select value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
          <option value="">Selecione...</option>
          {(modelosQuery.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.fabricante} {m.modelo}
            </option>
          ))}
        </select>
        {modelo && modelo.mtf50_referencia_ciclos_px == null && (
          <p className="erro-login">
            Modelo sem MTF50 de referência. Cadastre no "Catálogo de óticas" antes de emitir laudo de resolução.
          </p>
        )}
        {modelo && modelo.mtf50_referencia_ciclos_px != null && (
          <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>
            MTF50 ref.: {modelo.mtf50_referencia_ciclos_px} c/px (mín. {(100 - tol).toFixed(0)}% = ≥{' '}
            {(modelo.mtf50_referencia_ciclos_px * (1 - tol / 100)).toFixed(4)} c/px)
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
        <label className="botao-secundario botao-pequeno" style={{ display: 'inline-block', cursor: 'pointer' }}>
          Carregar imagem (TIFF/PNG)
          <input type="file" accept="image/*" onChange={carregarImagem} style={{ display: 'none' }} />
        </label>
        <button className="botao-primario botao-pequeno" onClick={calcular} disabled={!roi}>
          Calcular MTF
        </button>
        <button className="botao-primario botao-pequeno" onClick={salvarLaudo} disabled={!resultado || salvando}>
          {salvando ? 'Gerando...' : 'Gerar laudo de resolução'}
        </button>
      </div>

      {erro && <p className="erro-login" style={{ maxWidth: 720 }}>{erro}</p>}
      {msg && <p style={{ maxWidth: 720, color: 'var(--ink-400)' }}>{msg}</p>}

      {temImagem && (
        <canvas
          ref={canvasRef}
          onMouseDown={mouseDown}
          onMouseMove={mouseMove}
          onMouseUp={mouseUp}
          style={{ border: '1px solid #cbd5e1', maxWidth: '100%', cursor: 'crosshair' }}
        />
      )}

      {resultado && (
        <div style={{ maxWidth: 720, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>MTF50</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{resultado.mtf50.toFixed(4)} ciclos/px</div>
              {mtf50CicloMm != null && (
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>≈ {mtf50CicloMm.toFixed(1)} ciclos/mm (objeto)</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Ângulo da borda</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: anguloOk ? '#16a34a' : '#dc2626' }}>
                {resultado.anguloBordaGraus.toFixed(2)}°
              </div>
              {!anguloOk && <div style={{ fontSize: 12, color: '#dc2626' }}>Use borda de ~2° a 10°.</div>}
            </div>
            {conforme != null && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Conformidade</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: conforme ? '#16a34a' : '#dc2626' }}>
                  {conforme ? 'CONFORME' : 'NÃO CONFORME'}
                </div>
              </div>
            )}
          </div>

          <div className="campo-form" style={{ maxWidth: 320 }}>
            <label>Escala do objeto (px/mm) — opcional, p/ ciclos/mm</label>
            <input type="number" value={escalaPxMm} onChange={(e) => setEscalaPxMm(e.target.value)} />
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 4 }}>Curva MTF (x: ciclos/px até 0,5; y: 0 a 1)</div>
            <svg viewBox="0 0 320 160" width="320" height="160" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>
              <line x1="0" y1="80" x2="320" y2="80" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
              <text x="2" y="76" fontSize="8" fill="#94a3b8">0,5</text>
              <polyline points={curva} fill="none" stroke="#08336a" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function construirCurva(r: ResultadoMtf): string {
  const pts: string[] = [];
  for (let i = 0; i < r.freq.length; i++) {
    const f = r.freq[i];
    if (f > 0.5) break;
    const x = (f / 0.5) * 320;
    const y = 160 - Math.max(0, Math.min(1, r.mtf[i])) * 160;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}
