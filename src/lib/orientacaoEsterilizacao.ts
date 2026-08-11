import { abrirImpressao } from './imprimir';

// Orientação de reprocessamento/limpeza/esterilização de ópticas rígidas.
// Documento informativo (sem preço, sem assinaturas) enviado ao cliente
// para repasse ao CME do hospital. Conteúdo validado contra o manual do
// fabricante (Karl Storz HOPKINS) e a RDC ANVISA 15/2012.
export function montarCorpoOrientacaoEsterilizacao(): string {
  return `
    <h1>Orientações de Manuseio, Limpeza e Esterilização de Ópticas Rígidas</h1>

    <div class="secao"><span class="num">1</span>Manuseio e transporte</div>
    <ul class="check">
      <li>Sempre transportar a óptica na <strong>caixa de acomodação</strong>.</li>
      <li>Ao retirar ou acomodar a óptica, <strong>nunca pressionar o meio da cânula</strong>.</li>
      <li>A cânula é composta internamente por 6 ou mais <em>rod lens</em> (lentes ópticas), tipicamente de 2,70 a 2,77 mm — qualquer queda ou torção pode quebrar as lentes e embaçar a imagem.</li>
    </ul>

    <div class="secao"><span class="num">2</span>Limpeza</div>
    <ol class="passos">
      <li>Efetuar a limpeza com <strong>tecido macio</strong>.</li>
      <li>Retirar todo o excesso dos produtos de limpeza com tecido umedecido em água (preferir água destilada/deionizada).</li>
      <li>Umedecer tecido macio em <strong>álcool 70%</strong> e passar em todas as superfícies — principalmente na lente objetiva, na janela da ocular e no conector do cabo de fibra óptica. Secar com tecido absorvente.</li>
    </ol>
    <p style="font-size:11.5px;color:var(--ink-600);margin:4px 0 0;">Após muitas esterilizações (aprox. 10–20), pode haver depósito nas superfícies de vidro deixando a imagem turva; nesse caso é necessária limpeza específica — encaminhe a óptica para manutenção.</p>

    <div class="secao"><span class="num">3</span>Cuidados na esterilização</div>
    <ul class="check">
      <li><strong>Limpar e secar completamente</strong> a óptica antes de esterilizar.</li>
      <li>Acondicionar em bandeja/estojo apropriado; a óptica <strong>não deve encostar em metal</strong> durante o ciclo.</li>
      <li>Ao final do ciclo, deixar a óptica <strong>esfriar naturalmente</strong>.</li>
    </ul>
    <div class="alerta">
      <strong>&#10007; Nunca resfrie a óptica bruscamente</strong> (não mergulhe em líquido nem exponha ao ar frio
      logo após retirar da autoclave). O choque térmico trinca as lentes.
    </div>

    <div class="secao"><span class="num">4</span>Métodos recomendados</div>
    <table class="metodo">
      <thead><tr><th>Tipo de óptica</th><th>Método</th><th>Ciclo</th><th>Parâmetros</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Óptica AUTOCLAVÁVEL</strong><br>(marcada "AUTOCLAV" na ocular)</td>
          <td>Vapor saturado (autoclave)</td>
          <td>Pré-vácuo fracionado<br><span style="color:#8a3b1a">Nunca ciclo flash / uso imediato</span></td>
          <td>132–134 °C · exposição ~4 min · ~2 bar (27 psi) · com fase de secagem</td>
        </tr>
        <tr>
          <td><strong>Óptica NÃO autoclavável</strong><br>(sem a marcação "AUTOCLAV")</td>
          <td>Óxido de etileno (EtO) <em>ou</em> peróxido de hidrogênio (STERRAD&reg;/plasma)</td>
          <td>Conforme as instruções de uso do fabricante</td>
          <td>Segundo o equipamento de esterilização a baixa temperatura</td>
        </tr>
      </tbody>
    </table>
    <div class="alerta">
      <strong>&#9888; Verifique a marcação antes de autoclavar.</strong> Somente ópticas marcadas
      <strong>"AUTOCLAV"</strong> podem ser esterilizadas a vapor. Ópticas <strong>não autoclaváveis</strong>
      submetidas à autoclave sofrem <strong>dano irreparável</strong> (descolamento/trinca das lentes e perda
      de vedação). Na dúvida, utilize método de baixa temperatura (óxido de etileno ou peróxido de hidrogênio).
    </div>

    <div class="secao"><span class="num">5</span>Nunca</div>
    <ul class="check nunca">
      <li>Utilizar secadores ou sopradores térmicos.</li>
      <li>Utilizar palha de aço ou abrasivos.</li>
      <li>Utilizar instrumentos perfurocortantes para limpar as superfícies — principalmente a lente objetiva.</li>
      <li>Autoclavar óptica <strong>sem</strong> a marcação "AUTOCLAV".</li>
      <li>Usar ciclo de autoclave <strong>flash / de uso imediato</strong>.</li>
      <li>Resfriar a óptica bruscamente após o ciclo.</li>
    </ul>

    <div class="secao"><span class="num">6</span>Referência</div>
    <div class="ref-doc">
      <div class="quote">"Steam sterilize only KARL STORZ telescopes marked 'AUTOCLAV'!"</div>
      <ol>
        <li>KARL STORZ SE &amp; Co. KG. <em>HOPKINS&reg; / HOPKINS&reg; II Telescopes — Instruction Manual</em>, seção "Cleaning, Disinfection and Sterilization Instructions" (parâmetros de vapor validados: pré-vácuo, 132–133 °C, exposição 4,0 min, 27 psi; proibição de ciclo flash/uso imediato).</li>
        <li>BRASIL. ANVISA. <em>RDC nº 15/2012</em> — requisitos de boas práticas para o processamento de produtos para saúde (e demais normas em vigor).</li>
      </ol>
    </div>

    <div class="observacao-box">
      <div class="titulo">Observação importante</div>
      <p>Este documento é uma <strong>orientação geral de referência</strong>, elaborado com base nas instruções
      de uso do fabricante, e <strong>não substitui</strong> as instruções de uso específicas de cada modelo de
      endoscópio. A <strong>validação, a execução e o controle</strong> dos processos de limpeza, desinfecção e
      esterilização são de <strong>responsabilidade do serviço de reprocessamento (CME) da instituição de saúde</strong>,
      que deve seguir as <strong>normas aplicáveis</strong> (RDC ANVISA nº 15/2012 e demais em vigor), as instruções
      de uso do fabricante e os <strong>protocolos internos do hospital</strong>. A CVF Medical não se responsabiliza
      por resultados decorrentes de processos executados fora dessas condições.</p>
    </div>
  `;
}

// Abre a janela de impressão só com a orientação (sem assinaturas).
export function imprimirOrientacaoEsterilizacao() {
  abrirImpressao('Orientação de Esterilização', montarCorpoOrientacaoEsterilizacao(), undefined, {
    semAssinaturas: true,
  });
}
