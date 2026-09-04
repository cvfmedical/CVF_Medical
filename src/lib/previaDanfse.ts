import { EMPRESA } from './formato';

// Prévia visual da DANFSe (NFS-e Nacional) ANTES de transmitir - a nota
// ainda não existe no SEFAZ nesse momento (não tem número/código de
// verificação oficiais), então isso NÃO é o documento fiscal de verdade -
// é só uma simulação em cima dos dados que seriam enviados, pro
// faturamento conferir visualmente antes de confirmar. Por isso a marca
// d'água diagonal enquanto o ambiente for homologação: evita que alguém
// confunda essa prévia com uma nota autorizada de verdade.
export interface DadosPreviaDanfse {
  ambiente: 'homologacao' | 'producao';
  serieDps: string | number;
  numeroDps: string | number;
  dataEmissao: string;
  razaoSocialTomador: string;
  documentoTomador: string;
  logradouroTomador: string;
  numeroTomador: string;
  complementoTomador: string;
  bairroTomador: string;
  cepTomador: string;
  cidadeTomador: string;
  ufTomador: string;
  telefoneTomador: string;
  emailTomador: string;
  descricaoServico: string;
  valorServico: number;
  aliquotaIss: number | null;
  codigoTributacaoNacionalIss: string;
  codigoNbs: string;
  inscricaoMunicipalPrestador: string;
  codigoOpcaoSimplesNacional: number;
  regimeEspecialTributacao: number;
  codigoIndicadorOperacao: string;
  ibsCbsSituacaoTributaria: string;
  ibsCbsClassificacaoTributaria: string;
}

// Texto descritivo do código de tributação nacional do ISSQN - fixo pra
// CVF (140201, "Assistência técnica"), confirmado na Ficha Cadastral da
// prefeitura (2026-09-04). Só usado pra exibição na prévia; o valor
// enviado de verdade é sempre o código, não esse texto.
const DESCRICAO_ATIVIDADE_MUNICIPAL: Record<string, string> = {
  '140201': '14.02.01 - Assistência técnica',
};

function descricaoSimplesNacional(codigo: number): string {
  if (codigo === 3) return 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)';
  if (codigo === 1) return 'Não optante';
  return `Código ${codigo}`;
}

function formatarDocumento(digitos: string): string {
  const d = digitos.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return digitos;
}

function formatarEnderecoTomador(d: DadosPreviaDanfse): string {
  const rua = [d.logradouroTomador, d.numeroTomador].filter(Boolean).join(', ');
  const linha1 = [rua, d.complementoTomador].filter(Boolean).join(' - ');
  const linha2 = [d.bairroTomador, d.cidadeTomador && d.ufTomador ? `${d.cidadeTomador}/${d.ufTomador}` : d.cidadeTomador]
    .filter(Boolean)
    .join(' - ');
  const linha3 = d.cepTomador ? `CEP ${d.cepTomador}` : '';
  return [linha1, linha2, linha3].filter(Boolean).join('<br>') || '<em>Endereço não informado</em>';
}

export function abrirPreviaDanfse(d: DadosPreviaDanfse) {
  const janela = window.open('', '_blank', 'width=900,height=1000');
  if (!janela) {
    alert('Não foi possível abrir a janela de prévia (verifique o bloqueador de pop-ups).');
    return;
  }

  const valorServicoFmt = `R$ ${Number(d.valorServico).toFixed(2)}`;
  const valorIss =
    d.aliquotaIss != null ? `R$ ${((Number(d.valorServico) * d.aliquotaIss) / 100).toFixed(2)}` : 'Não informado';

  janela.document.open();
  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Prévia DANFSe - DPS ${d.numeroDps}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
          margin: 0;
          background: #ccc;
        }
        .acoes { text-align: center; padding: 10px; }
        .acoes button {
          padding: 10px 20px; border-radius: 6px; border: none; background: #344d95;
          color: #fff; font-size: 13px; cursor: pointer;
        }
        .folha {
          position: relative;
          width: 210mm;
          min-height: 297mm;
          margin: 12px auto;
          background: #fff;
          padding: 10mm;
          overflow: hidden;
        }
        .marca-dagua {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-35deg);
          font-size: 90px;
          font-weight: 800;
          color: rgba(200, 0, 0, 0.18);
          white-space: nowrap;
          letter-spacing: 0.05em;
          pointer-events: none;
          z-index: 5;
          user-select: none;
        }
        .aviso-previa {
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          color: #a33;
          border: 1px solid #a33;
          border-radius: 4px;
          padding: 4px;
          margin-bottom: 8px;
        }
        h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
        h2 { font-size: 10px; text-align: center; margin: 0 0 12px; color: #555; font-weight: 400; }
        .secao { border: 1px solid #999; border-radius: 4px; margin-bottom: 8px; }
        .secao-titulo {
          background: #344d95; color: #fff; font-size: 10px; font-weight: 700;
          padding: 3px 8px; letter-spacing: 0.04em; text-transform: uppercase;
        }
        .secao-corpo { padding: 8px; font-size: 11px; }
        .grade { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 16px; }
        .grade-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 16px; }
        .campo .rot { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: 0.03em; }
        .campo .val { font-size: 12px; font-weight: 600; }
        .descricao { white-space: pre-line; font-size: 11px; line-height: 1.5; }
        @media print {
          @page { size: A4; margin: 0; }
          body { background: #fff; }
          .acoes { display: none; }
          .folha { margin: 0; width: 100%; min-height: 100vh; }
        }
      </style>
    </head>
    <body>
      <div class="acoes">
        <button onclick="window.print()">Imprimir / salvar PDF</button>
      </div>
      <div class="folha">
        ${d.ambiente === 'homologacao' ? '<div class="marca-dagua">HOMOLOGAÇÃO</div>' : ''}
        <div class="aviso-previa">
          PRÉVIA - nota ainda não transmitida ao SEFAZ. Número/código de verificação oficiais só existem após a
          autorização.
        </div>
        <h1>DANFSe - Documento Auxiliar da Nota Fiscal de Serviços eletrônica (prévia)</h1>
        <h2>NFS-e Nacional - Simples Nacional</h2>

        <div class="secao">
          <div class="secao-titulo">Prestador de serviços</div>
          <div class="secao-corpo grade">
            <div class="campo"><div class="rot">Razão social</div><div class="val">${EMPRESA.razaoSocial}</div></div>
            <div class="campo"><div class="rot">CNPJ</div><div class="val">${EMPRESA.cnpj}</div></div>
            <div class="campo"><div class="rot">Inscrição municipal</div><div class="val">${d.inscricaoMunicipalPrestador}</div></div>
            <div class="campo" style="grid-column: 1 / -1;"><div class="rot">Endereço</div><div class="val">${EMPRESA.endereco}</div></div>
            <div class="campo"><div class="rot">Situação Simples Nacional</div><div class="val">${descricaoSimplesNacional(d.codigoOpcaoSimplesNacional)}</div></div>
            <div class="campo"><div class="rot">Regime especial</div><div class="val">${d.regimeEspecialTributacao === 0 ? 'Nenhum' : `Código ${d.regimeEspecialTributacao}`}</div></div>
          </div>
        </div>

        <div class="secao">
          <div class="secao-titulo">Tomador de serviços</div>
          <div class="secao-corpo grade-2">
            <div class="campo"><div class="rot">Razão social</div><div class="val">${d.razaoSocialTomador}</div></div>
            <div class="campo"><div class="rot">${d.documentoTomador.replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF'}</div><div class="val">${formatarDocumento(d.documentoTomador)}</div></div>
            <div class="campo" style="grid-column: 1 / -1;"><div class="rot">Endereço</div><div class="val">${formatarEnderecoTomador(d)}</div></div>
            <div class="campo"><div class="rot">Telefone</div><div class="val">${d.telefoneTomador || '-'}</div></div>
            <div class="campo"><div class="rot">E-mail</div><div class="val">${d.emailTomador || '-'}</div></div>
          </div>
        </div>

        <div class="secao">
          <div class="secao-titulo">Identificação da DPS</div>
          <div class="secao-corpo grade">
            <div class="campo"><div class="rot">Série</div><div class="val">${d.serieDps}</div></div>
            <div class="campo"><div class="rot">Número</div><div class="val">${d.numeroDps}</div></div>
            <div class="campo"><div class="rot">Data/hora de emissão</div><div class="val">${d.dataEmissao}</div></div>
          </div>
        </div>

        <div class="secao">
          <div class="secao-titulo">Discriminação dos serviços</div>
          <div class="secao-corpo descricao">${d.descricaoServico}</div>
        </div>

        <div class="secao">
          <div class="secao-titulo">Valores</div>
          <div class="secao-corpo grade">
            <div class="campo"><div class="rot">Valor do serviço</div><div class="val">${valorServicoFmt}</div></div>
            <div class="campo"><div class="rot">Alíquota ISS</div><div class="val">${d.aliquotaIss != null ? `${d.aliquotaIss.toFixed(2)}%` : 'Não informada'}</div></div>
            <div class="campo"><div class="rot">Valor do ISS</div><div class="val">${valorIss}</div></div>
            <div class="campo"><div class="rot">Código NBS</div><div class="val">${d.codigoNbs}</div></div>
            <div class="campo"><div class="rot">Cód. tributação (ISS)</div><div class="val">${d.codigoTributacaoNacionalIss}${DESCRICAO_ATIVIDADE_MUNICIPAL[d.codigoTributacaoNacionalIss] ? ` - ${DESCRICAO_ATIVIDADE_MUNICIPAL[d.codigoTributacaoNacionalIss]}` : ''}</div></div>
            <div class="campo"><div class="rot">Município da prestação/incidência</div><div class="val">Ribeirão Preto/SP</div></div>
          </div>
        </div>

        <div class="secao">
          <div class="secao-titulo">Imposto e contribuição sobre bens e serviços - IBS/CBS</div>
          <div class="secao-corpo grade">
            <div class="campo"><div class="rot">Cód. indicador de operação</div><div class="val">${d.codigoIndicadorOperacao}</div></div>
            <div class="campo"><div class="rot">Situação tributária (CST)</div><div class="val">${d.ibsCbsSituacaoTributaria}</div></div>
            <div class="campo"><div class="rot">Classificação tributária</div><div class="val">${d.ibsCbsClassificacaoTributaria}</div></div>
          </div>
          <div class="secao-corpo" style="padding-top: 0; font-size: 10px; color: #a33;">
            As alíquotas e os valores de CBS/IBS não são enviados por nós - são calculados automaticamente pela
            plataforma Sefin Nacional a partir desses códigos, no momento da autorização. Por isso não aparecem
            aqui na prévia; eles só existem no DANFSe oficial, depois que a nota for transmitida e autorizada.
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
  janela.document.close();
}
