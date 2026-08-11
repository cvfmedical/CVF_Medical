import { useState } from 'react';
import { fovPorAneis } from '../../lib/iso8600';
import { calcularMtfSlantedEdge } from '../../lib/esfr';

// Auto-validação: roda os PRÓPRIOS algoritmos de produção (FOV por 2 anéis e
// e-SFR/MTF) sobre dados sintéticos de VERDADE CONHECIDA e verifica se o
// sistema recupera os valores corretos. Serve como registro de verificação
// (evidência de software para o arquivo da qualidade). Não precisa de hardware.

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

// Borda inclinada com desfoque Gaussiano (MTF teórica = exp(-2·pi²·σ²·f²)).
function gerarBordaImageData(w: number, h: number, sigma: number, slantDeg: number): ImageData {
  const a = Math.tan((slantDeg * Math.PI) / 180);
  const b = w / 2;
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const ex = a * y + b;
    for (let x = 0; x < w; x++) {
      const v = Math.round(255 * 0.5 * (1 + erf((x - ex) / (sigma * Math.SQRT2))));
      const p = (y * w + x) * 4;
      img.data[p] = v;
      img.data[p + 1] = v;
      img.data[p + 2] = v;
      img.data[p + 3] = 255;
    }
  }
  return img;
}

interface LinhaTeste {
  nome: string;
  medido: string;
  esperado: string;
  ok: boolean;
}

export function AutoValidacao() {
  const [linhas, setLinhas] = useState<LinhaTeste[] | null>(null);
  const [rodadoEm, setRodadoEm] = useState('');

  function rodar() {
    const res: LinhaTeste[] = [];
    const r = (beta: number) => 50 * Math.tan((beta * Math.PI) / 180 / 2); // raio físico (mm) a 50 mm
    const k = 10; // px/mm sintético

    // FOV por 2 anéis (40° e 80°), campo real 90° e 70°.
    const aneis = [
      { grau: 40, raioPx: r(40) * k },
      { grau: 80, raioPx: r(80) * k },
    ];
    const f90 = fovPorAneis(r(90) * k, aneis);
    res.push({
      nome: 'FOV por 2 anéis — campo real 90°',
      medido: `${f90.fovGraus.toFixed(2)}°`,
      esperado: '90,00° (±0,5°)',
      ok: Math.abs(f90.fovGraus - 90) < 0.5,
    });
    const f70 = fovPorAneis(r(70) * k, aneis);
    res.push({
      nome: 'FOV por 2 anéis — campo real 70°',
      medido: `${f70.fovGraus.toFixed(2)}°`,
      esperado: '70,00° (±0,5°)',
      ok: Math.abs(f70.fovGraus - 70) < 0.5,
    });

    // e-SFR/MTF sobre borda Gaussiana σ=1,5 px → MTF50 teórico = 0,18738/σ.
    const img = gerarBordaImageData(120, 120, 1.5, 5);
    const m = calcularMtfSlantedEdge(img, { x: 0, y: 0, w: 120, h: 120 });
    const teorico = 0.18738 / 1.5;
    res.push({
      nome: 'MTF50 e-SFR — desfoque σ=1,5 px',
      medido: `${m.mtf50.toFixed(4)} c/px`,
      esperado: `${teorico.toFixed(4)} c/px (±3%)`,
      ok: Number.isFinite(m.mtf50) && Math.abs(m.mtf50 - teorico) / teorico < 0.03,
    });
    res.push({
      nome: 'Ângulo da borda detectado (e-SFR)',
      medido: `${m.anguloBordaGraus.toFixed(2)}°`,
      esperado: '5,00° (±0,3°)',
      ok: Math.abs(m.anguloBordaGraus - 5) < 0.3,
    });

    setLinhas(res);
    setRodadoEm(new Date().toLocaleString('pt-BR'));
  }

  const todosOk = linhas != null && linhas.every((l) => l.ok);

  return (
    <div>
      <h1>Auto-validação do sistema (verificação de software)</h1>
      <p style={{ maxWidth: 760, color: 'var(--ink-400)', fontSize: 13 }}>
        Roda os próprios algoritmos de medição (FOV por 2 anéis — ISO 8600-3; e-SFR/MTF — ISO 8600-5) sobre
        dados sintéticos de <strong>verdade conhecida</strong> e verifica se o sistema recupera os valores
        corretos. Use como <strong>registro de verificação</strong> do software (imprima e arquive na
        qualidade). Não substitui a validação metrológica na bancada real.
      </p>

      <div style={{ display: 'flex', gap: 10, margin: '10px 0' }}>
        <button className="botao-primario botao-pequeno" onClick={rodar}>
          Rodar auto-validação
        </button>
        {linhas && (
          <button className="botao-secundario botao-pequeno" onClick={() => window.print()}>
            Imprimir / salvar PDF
          </button>
        )}
      </div>

      {linhas && (
        <div style={{ maxWidth: 760 }}>
          <p
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: todosOk ? '#16a34a' : '#dc2626',
            }}
          >
            {todosOk ? 'APROVADO — algoritmos verificados' : 'REPROVADO — divergência detectada'}
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-400)' }}> — {rodadoEm}</span>
          </p>
          <table className="tabela-crud">
            <thead>
              <tr>
                <th>Verificação</th>
                <th>Medido pelo sistema</th>
                <th>Esperado (verdade)</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.nome}>
                  <td>{l.nome}</td>
                  <td className="mono">{l.medido}</td>
                  <td className="mono">{l.esperado}</td>
                  <td style={{ color: l.ok ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {l.ok ? 'APROVADO' : 'REPROVADO'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
