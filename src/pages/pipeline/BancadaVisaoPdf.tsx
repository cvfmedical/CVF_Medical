import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import cvfLogoCompleto from '../../assets/cvf-logo-completo.png';
import { statusMetricas, type MetricasOticas } from '../../lib/metrologiaOptica';

// Porte de gerador_pdf.py - mesma estrutura de 18 seções, mesmos
// limiares de aprovação, mesmo texto normativo/didático. Diferença:
// aqui os dados de cliente (CNPJ, cidade, e-mail) vêm de verdade do
// cadastro, já que o desktop nunca chegou a preencher esses campos na
// prática (sempre caía no valor padrão "-").

const corAzul = '#08336a';
const corBorda = '#1e40af';
const corLinha = '#d1d5db';
const corZebra = '#f8fafc';
const corVerde = '#15803d';
const corVermelho = '#dc2626';

const styles = StyleSheet.create({
  page: { padding: 25, fontSize: 8, fontFamily: 'Helvetica', color: '#111' },
  cabecalho: { flexDirection: 'row', border: 1, borderColor: corBorda, padding: 8, marginBottom: 4, alignItems: 'center' },
  logo: { width: 130, height: 48, objectFit: 'contain', marginRight: 10 },
  tituloMain: { fontSize: 11, color: corAzul, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subMain: { fontSize: 7.5 },
  faixa: { backgroundColor: corAzul, color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8, padding: 4, marginTop: 6, marginBottom: 2 },
  caixa: { border: 1, borderColor: corBorda, padding: 4, marginBottom: 4 },
  linhaDupla: { flexDirection: 'row' },
  colEsq: { flex: 1, padding: 4, borderRightWidth: 0.5, borderRightColor: corLinha },
  colDir: { flex: 1, padding: 4 },
  linhaZebra: { backgroundColor: corZebra },
  linhaBorda: { borderTopWidth: 0.5, borderTopColor: corLinha },
  bold: { fontFamily: 'Helvetica-Bold' },
  tabelaCabecalho: { flexDirection: 'row', backgroundColor: corZebra, borderWidth: 1, borderColor: corBorda, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  tabelaLinha: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: corBorda, fontSize: 7.5 },
  celula: { padding: 3, borderRightWidth: 0.5, borderRightColor: corLinha },
  celulaCentro: { padding: 3, textAlign: 'center', borderRightWidth: 0.5, borderRightColor: corLinha },
  rodapeTexto: { position: 'absolute', bottom: 15, left: 25, right: 25, fontSize: 6.5, color: '#64748b', borderTopWidth: 0.5, borderTopColor: corBorda, paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
});

function statusCor(conforme: boolean) {
  return conforme ? corVerde : corVermelho;
}

function StatusTexto({ conforme }: { conforme: boolean }) {
  return (
    <Text style={{ color: statusCor(conforme), fontFamily: 'Helvetica-Bold' }}>
      {conforme ? 'CONFORME' : 'NÃO CONFORME'}
    </Text>
  );
}

export interface DadosBancadaPdf {
  codLaudo: string;
  numeroOS: string;
  dataEmissao: string;
  dataEnsaio: string;
  etapa: 'checkpoint_a' | 'checkpoint_b' | 'resolucao';
  clienteNome: string;
  clienteCnpj: string;
  clienteFantasia: string;
  clienteCidade: string;
  clienteEmail: string;
  equipamentoDesc: string;
  equipamentoFab: string;
  equipamentoSn: string;
  // null quando a inspeção foi manual (sem medição automática por OpenCV).
  metricas: MetricasOticas | null;
  // Resultado definido pelo técnico (usado quando não há medição automática).
  resultado?: 'Aprovado' | 'Reprovado';
  imagemDataUrl: string | null;
  tecnicoResponsavel: string;
  observacoes: string;
  // Ensaio ISO 8600 (normativo). Quando presente, determina a conformidade
  // (FOV ±% do golden sample e direção ±° do nominal); as métricas OpenCV
  // passam a ser complementares/não-normativas.
  iso?: {
    modeloNome: string;
    metodo: string;
    distanciaMm: number | null;
    fovMedido: number;
    fovReferencia: number;
    fovDesvioPct: number;
    fovTolPct: number;
    fovConforme: boolean;
    fovIncerteza: number | null;
    direcaoMedida: number | null;
    direcaoNominal: number | null;
    direcaoTolGraus: number;
    direcaoConforme: boolean | null;
    calibracao: string | null;
  };
  // Resolução óptica (ISO 8600-5, e-SFR). Presente em laudos de resolução.
  resolucao?: {
    modeloNome: string;
    mtf50: number;
    mtf50Referencia: number | null;
    tolerancia: number; // %
    anguloBorda: number;
    conforme: boolean | null;
    incerteza?: number | null; // U (k=2) em ciclos/px, se houve repetibilidade
  };
}

export function BancadaVisaoPdf({ dados }: { dados: DadosBancadaPdf }) {
  const m = dados.metricas;
  const st = m ? statusMetricas(m) : null;
  const iso = dados.iso ?? null;
  const conforme = iso
    ? iso.fovConforme && iso.direcaoConforme !== false
    : m && st
      ? st.conforme
      : dados.resultado === 'Aprovado';
  const etapaLabel =
    dados.etapa === 'checkpoint_a'
      ? 'Checkpoint A (pré-selagem)'
      : dados.etapa === 'resolucao'
        ? 'Resolução óptica (ISO 8600-5)'
        : 'Checkpoint B (pós-autoclave, final)';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cabecalho}>
          <Image src={cvfLogoCompleto} style={styles.logo} />
          <View>
            <Text style={styles.tituloMain}>LAUDO DE INSPEÇÃO E ENSAIO DE DESEMPENHO ÓPTICO</Text>
            <Text style={styles.subMain}>
              ÓTICA RÍGIDA PARA ENDOSCOPIA (ISO 8600-1 / ISO 8600-3 / ISO 8600-5) — Sistema Q-CVF — {etapaLabel}
            </Text>
          </View>
        </View>

        <View style={styles.caixa}>
          <View style={styles.linhaDupla}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Nº de controle do laudo: </Text>
              {dados.codLaudo}
            </Text>
            <Text style={styles.colDir}>
              <Text style={styles.bold}>Data de emissão: </Text>
              {dados.dataEmissao}
            </Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda]}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Ordem de serviço: </Text>
              {dados.numeroOS}
            </Text>
            <Text style={styles.colDir}>
              <Text style={styles.bold}>Data do ensaio: </Text>
              {dados.dataEnsaio}
            </Text>
          </View>
        </View>

        <Text style={styles.faixa}>1. IDENTIFICAÇÃO DO CLIENTE</Text>
        <View style={styles.caixa}>
          <View style={styles.linhaDupla}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Razão social: </Text>
              {dados.clienteNome || '-'}
            </Text>
            <Text style={styles.colDir}>
              <Text style={styles.bold}>CNPJ/CPF: </Text>
              {dados.clienteCnpj || '-'}
            </Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda, styles.linhaZebra]}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Nome fantasia: </Text>
              {dados.clienteFantasia || '-'}
            </Text>
            <Text style={styles.colDir}>
              <Text style={styles.bold}>Cidade: </Text>
              {dados.clienteCidade || '-'}
            </Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda]}>
            <Text style={{ padding: 4 }}>
              <Text style={styles.bold}>E-mail: </Text>
              {dados.clienteEmail || '-'}
            </Text>
          </View>
        </View>

        <Text style={styles.faixa}>2. IDENTIFICAÇÃO DO ITEM ENSAIADO</Text>
        <View style={styles.caixa}>
          <View style={styles.linhaDupla}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>
              <Text style={styles.bold}>Descrição: </Text>
              {dados.equipamentoDesc || '-'}
            </Text>
            <Text style={styles.colDir}>
              <Text style={styles.bold}>Fabricante: </Text>
              {dados.equipamentoFab || '-'}
            </Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda, styles.linhaZebra]}>
            <Text style={{ padding: 4 }}>
              <Text style={styles.bold}>Nº de Série (N/S): </Text>
              {dados.equipamentoSn || '-'}
            </Text>
          </View>
        </View>

        <Text style={styles.faixa}>3. OBJETIVO, ESCOPO E CLASSIFICAÇÃO DO SERVIÇO</Text>
        <View style={styles.caixa}>
          <Text>
            <Text style={styles.bold}>Objetivo: </Text>
            Registrar a inspeção visual, a configuração da bancada, os resultados dos ensaios e a conclusão técnica.
            {'\n'}
            <Text style={styles.bold}>Classificação: </Text>
            [ ] Inspeção de recebimento&nbsp;&nbsp;&nbsp;[X] Avaliação pós-manutenção&nbsp;&nbsp;&nbsp;[ ] Avaliação preventiva
          </Text>
        </View>

        <Text style={styles.faixa}>4. REFERÊNCIAS NORMATIVAS E MÉTODO DE ENSAIO</Text>
        <View style={styles.caixa}>
          <View style={styles.linhaDupla}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>Procedimento Interno: POP-Q-CVF-OPT-01 Rev. 03</Text>
            <Text style={styles.colDir}>Regra de Decisão: Declaração Direta (ABNT NBR ISO/IEC 17025 Cl. 7.8.6)</Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda, styles.linhaZebra]}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>Resolução e Nitidez: ISO 8600-5:2020</Text>
            <Text style={styles.colDir}>Requisitos Gerais: ABNT NBR ISO 8600-1:2025</Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda]}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>Campo e Visão: ISO 8600-3:2019</Text>
            <Text style={styles.colDir}>Rastreabilidade: Padrões calibrados RBC / ISO 17025</Text>
          </View>
        </View>

        <Text style={styles.faixa}>5. CONDIÇÕES DA BANCADA</Text>
        <View style={styles.caixa}>
          <Text>
            Câmera de vídeo digital (navegador/getUserMedia), acoplador óptico padrão C-Mount, fonte de luz LED,
            alvo de calibração dinâmico. Distância ponta-alvo (d): 50.0 mm (ISO 8600-3). Montagem: eixo óptico
            perpendicular ao alvo.
          </Text>
        </View>

        <Text style={styles.faixa}>6. INSPEÇÃO VISUAL E FUNCIONAL PRÉVIA</Text>
        <View style={styles.tabelaCabecalho}>
          <Text style={[styles.celulaCentro, { width: 20 }]}>#</Text>
          <Text style={[styles.celula, { flex: 2 }]}>Característica verificada</Text>
          <Text style={[styles.celula, { flex: 1 }]}>Norma</Text>
          <Text style={[styles.celulaCentro, { flex: 1 }]}>Situação</Text>
        </View>
        {[
          ['Integridade do tubo e ponta distal', 'ISO 8600-1'],
          ['Integridade da ocular e guia de luz', 'ISO 8600-1'],
          ['Ausência de manchas, umidade ou fungos', 'ISO 8600-1'],
        ].map(([texto, norma], i) => (
          <View style={[styles.tabelaLinha, i % 2 === 1 ? styles.linhaZebra : {}]} key={texto}>
            <Text style={[styles.celulaCentro, { width: 20 }]}>{i + 1}</Text>
            <Text style={[styles.celula, { flex: 2 }]}>{texto}</Text>
            <Text style={[styles.celula, { flex: 1 }]}>{norma}</Text>
            <Text style={[styles.celulaCentro, { flex: 1, color: corVerde, fontFamily: 'Helvetica-Bold' }]}>CONFORME</Text>
          </View>
        ))}

        {iso && (
          <>
            <Text style={styles.faixa}>7. RESULTADOS - CAMPO E DIREÇÃO DE VISÃO (ISO 8600-3 / ISO 8600-1)</Text>
            <View style={styles.tabelaCabecalho}>
              <Text style={[styles.celula, { flex: 2 }]}>Parâmetro</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Medido</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Referência</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Tolerância</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Situação</Text>
            </View>
            <View style={styles.tabelaLinha}>
              <Text style={[styles.celula, { flex: 2 }]}>
                Campo de visão (FOV){iso.fovIncerteza != null ? ` — U=±${iso.fovIncerteza.toFixed(2)}° (k=2)` : ''}
              </Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>{iso.fovMedido.toFixed(1)}°</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>{iso.fovReferencia.toFixed(1)}°</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>±{iso.fovTolPct}% (desvio {iso.fovDesvioPct.toFixed(1)}%)</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>
                <StatusTexto conforme={iso.fovConforme} />
              </Text>
            </View>
            {iso.direcaoMedida != null && iso.direcaoNominal != null && (
              <View style={[styles.tabelaLinha, styles.linhaZebra]}>
                <Text style={[styles.celula, { flex: 2 }]}>Direção de visão</Text>
                <Text style={[styles.celulaCentro, { flex: 1 }]}>{iso.direcaoMedida.toFixed(1)}°</Text>
                <Text style={[styles.celulaCentro, { flex: 1 }]}>{iso.direcaoNominal.toFixed(1)}°</Text>
                <Text style={[styles.celulaCentro, { flex: 1 }]}>±{iso.direcaoTolGraus}°</Text>
                <Text style={[styles.celulaCentro, { flex: 1 }]}>
                  <StatusTexto conforme={iso.direcaoConforme === true} />
                </Text>
              </View>
            )}
            <View style={styles.caixa}>
              <Text style={{ fontSize: 7 }}>
                Método: ISO 8600-3 Método {iso.metodo} | Distância de medição:{' '}
                {iso.distanciaMm != null ? iso.distanciaMm.toFixed(1) : '-'} mm | Modelo: {iso.modeloNome}
                {iso.calibracao ? ` | Padrão de calibração: ${iso.calibracao}` : ''}
                {'\n'}Critérios: FOV com desvio ≤ {iso.fovTolPct}% do valor de referência (golden sample) — ISO 8600-1
                §4.5; direção de visão ≤ ±{iso.direcaoTolGraus}° do nominal — §4.6.
              </Text>
            </View>
          </>
        )}

        {m && st ? (
          <>
            <Text style={styles.faixa}>
              {iso ? '8. MEDIÇÕES COMPLEMENTARES DE IMAGEM (não-normativas)' : '7 a 9. RESULTADOS DE MEDIÇÃO POR IMAGEM'}
            </Text>
            <View style={styles.tabelaCabecalho}>
              <Text style={[styles.celula, { flex: 2 }]}>Característica</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Valor obtido</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Referência interna</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Situação</Text>
            </View>
            {[
              ['Nitidez (Laplaciano)', `${m.nitidez.toFixed(1)} pts`, '≥ 150.0 pts', st.stNitidez],
              ['Uniformidade de iluminação', `${m.luz.toFixed(1)}`, '≥ 40.0', st.stLuz],
              ['Vinhetagem', `${m.vinheta.toFixed(1)}%`, '≤ 25.0 %', st.stVinheta],
              ['Fidelidade de cores', `${m.cor.toFixed(1)}%`, '≤ 10.0 %', st.stCor],
              ['Distorção geométrica', `${m.distorcao.toFixed(1)}%`, '≤ 5.0 %', st.stDistorcao],
            ].map(([texto, valor, req, ok], i) => (
              <View style={[styles.tabelaLinha, i % 2 === 1 ? styles.linhaZebra : {}]} key={texto as string}>
                <Text style={[styles.celula, { flex: 2 }]}>{texto}</Text>
                <Text style={[styles.celulaCentro, { flex: 1 }]}>{valor}</Text>
                <Text style={[styles.celulaCentro, { flex: 1 }]}>{req}</Text>
                <Text style={[styles.celulaCentro, { flex: 1 }]}>
                  <StatusTexto conforme={ok as boolean} />
                </Text>
              </View>
            ))}
            {iso && (
              <View style={styles.caixa}>
                <Text style={{ fontSize: 7 }}>
                  Estas medições por imagem são complementares e NÃO determinam a conformidade normativa (dada pelo
                  item 7 — FOV e direção de visão). Servem como indicadores internos de qualidade de imagem.
                </Text>
              </View>
            )}
          </>
        ) : (
          !iso && !dados.resolucao && (
            <>
              <Text style={styles.faixa}>7 a 9. ENSAIOS DE MEDIÇÃO POR IMAGEM</Text>
              <View style={styles.caixa}>
                <Text>
                  Medição automática por imagem não realizada nesta inspeção (inspeção visual manual). A conclusão
                  baseia-se na avaliação do técnico responsável, conforme item 12.
                </Text>
              </View>
            </>
          )
        )}

        {dados.resolucao && (
          <>
            <Text style={styles.faixa}>{iso ? '7B. RESOLUÇÃO ÓPTICA (ISO 8600-5)' : '7. RESOLUÇÃO ÓPTICA (ISO 8600-5)'}</Text>
            <View style={styles.tabelaCabecalho}>
              <Text style={[styles.celula, { flex: 2 }]}>Parâmetro</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Medido</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Referência</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Tolerância</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>Situação</Text>
            </View>
            <View style={styles.tabelaLinha}>
              <Text style={[styles.celula, { flex: 2 }]}>Resolução (MTF50 — borda inclinada)</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>{dados.resolucao.mtf50.toFixed(4)} c/px</Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>
                {dados.resolucao.mtf50Referencia != null ? `${dados.resolucao.mtf50Referencia.toFixed(4)} c/px` : '-'}
              </Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>
                {dados.resolucao.mtf50Referencia != null ? `≥ ${(100 - dados.resolucao.tolerancia).toFixed(0)}% do ref.` : '-'}
              </Text>
              <Text style={[styles.celulaCentro, { flex: 1 }]}>
                {dados.resolucao.conforme == null ? '-' : <StatusTexto conforme={dados.resolucao.conforme} />}
              </Text>
            </View>
            <View style={styles.caixa}>
              <Text style={{ fontSize: 7 }}>
                Método: e-SFR (borda inclinada — ISO 12233 / ISO 8600-5). Ângulo da borda:{' '}
                {dados.resolucao.anguloBorda.toFixed(2)}° | Modelo: {dados.resolucao.modeloNome}.
                {dados.resolucao.incerteza != null
                  ? ` | Incerteza (k=2): ±${dados.resolucao.incerteza.toFixed(4)} c/px.`
                  : ''}
                {'\n'}Critério: MTF50 medido ≥ {(100 - dados.resolucao.tolerancia).toFixed(0)}% do valor de
                referência (golden sample).
              </Text>
            </View>
          </>
        )}

        <Text style={styles.faixa}>10. REGISTRO DAS OBSERVAÇÕES TÉCNICAS</Text>
        <View style={styles.caixa}>
          <Text>
            Ensaio realizado em bancada computacional Q-CVF (câmera via navegador) com análise de imagem em tempo
            real, calibração por padrão geométrico e validação metrológica fundamentada nas normas ABNT NBR ISO
            8600-1, ISO 8600-3 e ISO 8600-5.
            {dados.observacoes ? `\n\nObservações do técnico: ${dados.observacoes}` : ''}
          </Text>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={styles.faixa}>11. EVIDÊNCIAS FOTOGRÁFICAS</Text>
            {dados.imagemDataUrl ? (
              <View style={[styles.caixa, { padding: 0 }]}>
                <Image src={dados.imagemDataUrl} style={{ width: '100%', height: 130, objectFit: 'cover' }} />
              </View>
            ) : (
              <View style={styles.caixa}>
                <Text>Sem captura de imagem.</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.faixa}>12. CONCLUSÃO TÉCNICA (ISO/IEC 17025 Cl. 7.8.6)</Text>
            <View style={[styles.caixa, styles.linhaZebra]}>
              <Text>
                <Text style={styles.bold}>Situação: </Text>
                <StatusTexto conforme={conforme} />
                {'\n\n'}
                <Text style={styles.bold}>Síntese: </Text>
                {conforme
                  ? 'O equipamento atende a todos os critérios normativos auditados.'
                  : 'Foram detectadas divergências técnicas nos parâmetros auditados.'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.faixa}>13. RECOMENDAÇÕES E DESTINAÇÃO</Text>
        <View style={styles.caixa}>
          <Text>
            <Text style={styles.bold}>Destinação sugerida: </Text>
            {dados.etapa === 'resolucao'
              ? conforme
                ? 'Resolução conforme (ISO 8600-5)'
                : 'Reprovado na resolução — retornar para avaliação'
              : conforme
                ? dados.etapa === 'checkpoint_a'
                  ? 'Seguir para selagem'
                  : 'Liberar para entrega ao cliente'
                : 'Retornar para manutenção / ajuste'}
            {'\n'}
            <Text style={styles.bold}>Prazo recomendado: </Text>
            Imediato
          </Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.faixa}>14. INTERPRETAÇÃO TÉCNICA DOS RESULTADOS (ITENS 7, 8 E 9)</Text>
        <View style={styles.caixa}>
          <Text style={styles.bold}>O que significam os resultados deste laudo? (Guia para leitura técnica):</Text>
          <Text style={{ marginTop: 4 }}>
            • <Text style={styles.bold}>Resolução e Nitidez Óptica:</Text> mede o foco e a definição da imagem. Um
            valor de Laplaciano ≥ 150.0 pts garante que o médico enxergará contornos e microvasos nítidos sem imagem
            borrada.
            {'\n'}• <Text style={styles.bold}>Campo de Visão / FOV:</Text> é a "largura de abertura" da imagem.
            Garante que a área visualizada corresponde ao padrão do modelo — desvio ≤ 15% do valor de referência
            (amostra-padrão), conforme ISO 8600-1 §4.5.
            {'\n'}• <Text style={styles.bold}>Alinhamento / Centragem:</Text> avalia se o feixe de luz e lentes estão
            perfeitamente centralizados. Desvios ≤ 0.5 mm evitam imagem "torta" ou cortada na torre de vídeo.
            {'\n'}• <Text style={styles.bold}>Uniformidade de Iluminação:</Text> mede a quantidade de luz
            transmitida pelas fibras ópticas. Escore ≥ 40.0 pts confirma iluminação forte e suficiente para
            cirurgia.
            {'\n'}• <Text style={styles.bold}>Vinhetagem / Queda de Luz:</Text> mede o sombreamento nas bordas.
            Queda ≤ 25.0% garante que as bordas não fiquem escuras, sinalizando fibras ópticas íntegras.
            {'\n'}• <Text style={styles.bold}>Fidelidade de Cores:</Text> avalia se as lentes amareleram por
            autoclavagens. Desvio ≤ 10.0% garante a cor real de tecidos e sangue preservada.
            {'\n'}• <Text style={styles.bold}>Distorção Geométrica:</Text> mede a deformação de lente ("olho de
            peixe"). Índice ≤ 5.0% impede bordas esticadas e fadiga visual ao cirurgião.
          </Text>
        </View>

        <Text style={styles.faixa}>15. ANEXO - LEGENDA DE ABREVIAÇÕES E SIGLAS</Text>
        <View style={styles.caixa}>
          <View style={styles.linhaDupla}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>DOV: Direção de Visão</Text>
            <Text style={styles.colDir}>FOV: Campo de Visão (Field of View)</Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda]}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>OS: Ordem de Serviço</Text>
            <Text style={styles.colDir}>N/S: Número de Série do Fabricante</Text>
          </View>
          <View style={[styles.linhaDupla, styles.linhaBorda]}>
            <Text style={[styles.colEsq, { borderRightWidth: 0 }]}>Q-CVF: Qualidade CVF Medical</Text>
            <Text style={styles.colDir}>ISO: International Organization for Standardization</Text>
          </View>
        </View>

        <Text style={styles.faixa}>16. CONTROLE DE VALIDADE, ANEXOS E EMISSOR</Text>
        <View style={styles.caixa}>
          <Text>
            <Text style={styles.bold}>Validade declarada:</Text> 12 meses | <Text style={styles.bold}>Forma de envio:</Text> PDF/Digital
            {'\n'}
            <Text style={styles.bold}>Razão Social:</Text> CVF MEDICAL MANUTENÇÃO EM EQUIPAMENTOS CIRÚRGICOS LTDA |{' '}
            <Text style={styles.bold}>CNPJ:</Text> 46.948.692/0001-03
            {'\n'}
            <Text style={styles.bold}>Endereço:</Text> Rua Sete de Setembro, 1929 - Ribeirão Preto/SP - CEP:
            14.025-200 | <Text style={styles.bold}>Contato:</Text> suporte@cvfmedical.com.br
          </Text>
        </View>

        <Text style={styles.faixa}>17. DECLARAÇÕES, APROVAÇÕES E ASSINATURAS</Text>
        <View style={{ flexDirection: 'row', marginTop: 30 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text>________________________________________</Text>
            <Text style={{ marginTop: 2 }}>Executado por: {dados.tecnicoResponsavel || 'Sistema Q-CVF'}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text>________________________________________</Text>
            <Text style={{ marginTop: 2 }}>Revisado/Aprovado por: Resp. Técnico Qualidade</Text>
          </View>
        </View>

        <View style={styles.rodapeTexto} fixed>
          <Text>Documento confidencial - Emitido eletronicamente pelo Sistema Q-CVF Medical</Text>
          <Text render={({ pageNumber }) => `Página ${pageNumber}`} />
        </View>
      </Page>
    </Document>
  );
}
