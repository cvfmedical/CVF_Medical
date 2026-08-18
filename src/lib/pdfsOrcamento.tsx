import type { ReactNode } from 'react';
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { EMPRESA, formatarMoeda, CHECKLIST_OTICA, AVISO_MANUTENCAO } from './formato';
import { PORTAL_CLIENTE_URL } from './compartilhar';
import cvfLogoCompleto from '../assets/cvf-logo-completo.png';

// PDFs REAIS (arquivos) dos 3 relatórios enviados ao cliente - usados no envio
// automático por e-mail (anexos). São documentos limpos, em texto/tabela; as
// fotos ficam no portal do cliente (evita o custo/latência de embutir imagens).

const azul = '#344d95';
const azulEscuro = '#26386c';
const tinta = '#21201c';
const cinza = '#5c5a54';
const borda = '#e4e1d8';

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 64, paddingHorizontal: 40, fontSize: 10, fontFamily: 'Helvetica', color: tinta },
  cab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 3, borderBottomColor: azul, paddingBottom: 8, marginBottom: 16 },
  cabLogo: { height: 32, width: 'auto' },
  marca: { fontSize: 18, fontWeight: 700, color: azul },
  slogan: { fontSize: 9, fontStyle: 'italic', color: azul },
  titulo: { fontSize: 15, color: azulEscuro, marginBottom: 2 },
  subtitulo: { fontSize: 9, color: cinza, marginBottom: 14 },
  secao: { fontSize: 10, fontWeight: 700, color: azulEscuro, textTransform: 'uppercase', borderBottomWidth: 1, borderBottomColor: borda, paddingBottom: 3, marginTop: 14, marginBottom: 6 },
  linha: { flexDirection: 'row', marginBottom: 4 },
  rotulo: { width: 130, color: cinza },
  valor: { flex: 1 },
  th: { flexDirection: 'row', backgroundColor: '#1b1d20', color: '#fff', paddingVertical: 4, paddingHorizontal: 6 },
  td: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: borda, paddingVertical: 4, paddingHorizontal: 6 },
  cItem: { flex: 1 },
  cQtd: { width: 40, textAlign: 'center' },
  cNum: { width: 80, textAlign: 'right' },
  total: { textAlign: 'right', fontSize: 12, fontWeight: 700, marginTop: 8 },
  legal: { fontSize: 8.5, color: cinza, lineHeight: 1.4, marginBottom: 3 },
  rodape: { position: 'absolute', bottom: 24, left: 40, right: 40, borderTopWidth: 1, borderTopColor: borda, paddingTop: 6, fontSize: 7.5, color: azulEscuro, textAlign: 'center' },
  item: { marginBottom: 3, lineHeight: 1.35 },
  alerta: { backgroundColor: '#fbeee8', borderWidth: 1, borderColor: '#d99b7a', borderLeftWidth: 3, borderLeftColor: '#8a3b1a', borderRadius: 4, padding: 8, marginVertical: 8, color: '#8a3b1a', fontSize: 9 },
  metTh: { flexDirection: 'row', backgroundColor: '#1b1d20', color: '#fff', paddingVertical: 3, paddingHorizontal: 5, fontSize: 8.5 },
  metTd: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: borda, paddingVertical: 3, paddingHorizontal: 5, fontSize: 8.5 },
  obs: { borderWidth: 1.5, borderColor: '#1b1d20', borderRadius: 6, padding: 8, marginTop: 12, fontSize: 8.5, lineHeight: 1.4 },
  // --- Manual do portal do cliente ---
  parteTitulo: { backgroundColor: azul, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8, marginTop: 14, marginBottom: 8 },
  passo: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 },
  passoNum: { width: 18, height: 18, borderRadius: 9, backgroundColor: azul, color: '#fff', fontSize: 9, fontWeight: 700, textAlign: 'center', paddingTop: 4, marginRight: 8 },
  passoTexto: { flex: 1, fontSize: 9.5, lineHeight: 1.4, paddingTop: 2 },
  dica: { backgroundColor: '#f5f3ee', borderWidth: 1, borderColor: borda, borderLeftWidth: 3, borderLeftColor: azul, borderRadius: 4, padding: 9, marginVertical: 8, fontSize: 9, lineHeight: 1.4, color: azulEscuro },
  bulletLinha: { flexDirection: 'row', marginBottom: 5 },
  bulletMarca: { width: 10, fontSize: 9.5 },
  bulletTexto: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },
});

function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <>
      <View style={s.cab}>
        <Image src={cvfLogoCompleto} style={s.cabLogo} />
        <Text style={s.slogan}>Sua imagem, nossa visão.</Text>
      </View>
      <Text style={s.titulo}>{titulo}</Text>
      {subtitulo ? <Text style={s.subtitulo}>{subtitulo}</Text> : null}
    </>
  );
}

function Rodape() {
  return (
    <View style={s.rodape} fixed>
      <Text>{EMPRESA.razaoSocial} • CNPJ: {EMPRESA.cnpj}</Text>
      <Text>{EMPRESA.endereco}</Text>
      <Text>Tel. / WhatsApp: {EMPRESA.telefone} • E-mail: {EMPRESA.email}</Text>
    </View>
  );
}

export interface ItemOrcamentoPdf {
  nome: string;
  quantidade: number;
  precoUnit: number;
}

export interface DadosOrcamentoPdf {
  numeroOrcamento: string;
  numeroOS: string;
  clienteNome: string;
  clienteFinalNome?: string | null;
  equipamento: string;
  numeroSerie: string;
  itens: ItemOrcamentoPdf[];
  subtotal: number;
  desconto: number;
  bonificacao: boolean;
  total: number;
  validade: string;
  pagamento: string;
  observacoes: string;
  ehOtica?: boolean | null;
  garantiaResumo: string;
  garantiaIntro: string;
  garantiaItens: string[];
  clausulas: { titulo: string; texto: string }[];
}

function DocOrcamento({ d }: { d: DadosOrcamentoPdf }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Cabecalho titulo="Orçamento de Manutenção" subtitulo={`Nº ${d.numeroOrcamento} · OS ${d.numeroOS} · ${d.clienteNome}`} />
        {d.clienteFinalNome && (
          <Text style={{ fontSize: 9, color: cinza, marginBottom: 2 }}>Unidade atendida: {d.clienteFinalNome}</Text>
        )}
        <Text style={{ fontSize: 9, color: cinza, marginBottom: 10 }}>
          {d.equipamento}{d.numeroSerie ? ` · Nº série ${d.numeroSerie}` : ''}
        </Text>

        <View style={s.th}>
          <Text style={s.cItem}>Item</Text>
          <Text style={s.cQtd}>Qtd.</Text>
          <Text style={s.cNum}>Preço unit.</Text>
          <Text style={s.cNum}>Subtotal</Text>
        </View>
        {d.itens.map((it, i) => (
          <View style={s.td} key={i}>
            <Text style={s.cItem}>{it.nome}</Text>
            <Text style={s.cQtd}>{it.quantidade}</Text>
            <Text style={s.cNum}>{formatarMoeda(it.precoUnit)}</Text>
            <Text style={s.cNum}>{formatarMoeda(it.precoUnit * it.quantidade)}</Text>
          </View>
        ))}
        {d.bonificacao ? (
          <>
            <Text style={{ textAlign: 'right', color: cinza, marginTop: 6 }}>Subtotal: {formatarMoeda(d.subtotal)}</Text>
            <Text style={{ textAlign: 'right', color: azul, fontWeight: 700, marginTop: 2 }}>Bonificação de fidelidade (serviço em cortesia)</Text>
          </>
        ) : d.desconto > 0 ? (
          <>
            <Text style={{ textAlign: 'right', color: cinza, marginTop: 6 }}>Subtotal: {formatarMoeda(d.subtotal)}</Text>
            <Text style={{ textAlign: 'right', color: cinza, marginTop: 2 }}>Desconto: - {formatarMoeda(d.desconto)}</Text>
          </>
        ) : null}
        <Text style={s.total}>Total: {formatarMoeda(d.total)}</Text>

        {d.ehOtica && (
          <View wrap={false}>
            <Text style={s.secao}>Procedimentos de manutenção incluídos</Text>
            {CHECKLIST_OTICA.map((item, i) => (
              <Text style={s.item} key={i}>• {item}</Text>
            ))}
            <Text style={s.alerta}>{AVISO_MANUTENCAO}</Text>
          </View>
        )}

        <Text style={s.secao}>Condições comerciais</Text>
        <View style={s.linha}><Text style={s.rotulo}>Validade da proposta</Text><Text style={s.valor}>{d.validade || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Condições de pagamento</Text><Text style={s.valor}>{d.pagamento || '-'}</Text></View>

        <View wrap={false}>
          <Text style={s.secao}>Garantia</Text>
          <Text style={{ marginBottom: 3 }}>{d.garantiaResumo}</Text>
          <Text style={s.legal}>{d.garantiaIntro}</Text>
          {d.garantiaItens.map((g, i) => (
            <Text style={s.legal} key={i}>{i + 1}. {g}</Text>
          ))}
          <Text style={s.secao}>Condições gerais</Text>
          {d.clausulas.map((c, i) => (
            <Text style={s.legal} key={i}><Text style={{ fontWeight: 700 }}>{c.titulo}.</Text> {c.texto}</Text>
          ))}
          {d.observacoes ? (
            <>
              <Text style={s.secao}>Observações</Text>
              <Text style={s.legal}>{d.observacoes}</Text>
            </>
          ) : null}
        </View>
        <Rodape />
      </Page>
    </Document>
  );
}

export interface DadosEntradaPdf {
  codigo: string;
  clienteNome: string;
  equipamento: string;
  fabricante: string;
  numeroSerie: string;
  condicaoChegada: string;
  data: string;
  nfNumero: string;
  nfSerie: string;
  avarias: string[];
  fotos?: string[]; // data URIs (base64) das fotos da entrada
}

function DocEntrada({ d }: { d: DadosEntradaPdf }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Cabecalho titulo="Registro de Entrada" subtitulo={`${d.codigo} · ${d.clienteNome}`} />
        <View style={s.linha}><Text style={s.rotulo}>Equipamento</Text><Text style={s.valor}>{d.equipamento || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Fabricante</Text><Text style={s.valor}>{d.fabricante || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Nº de série</Text><Text style={s.valor}>{d.numeroSerie || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Condição de chegada</Text><Text style={s.valor}>{d.condicaoChegada || '-'}</Text></View>
        <View style={s.linha}><Text style={s.rotulo}>Data de entrada</Text><Text style={s.valor}>{d.data || '-'}</Text></View>
        <Text style={s.secao}>Nota fiscal de remessa</Text>
        <View style={s.linha}><Text style={s.rotulo}>Número / Série</Text><Text style={s.valor}>{d.nfNumero || '-'} / {d.nfSerie || '-'}</Text></View>
        <Text style={s.secao}>Avarias identificadas na triagem</Text>
        {d.avarias.length === 0 ? (
          <Text style={{ color: cinza }}>Nenhuma avaria marcada.</Text>
        ) : (
          d.avarias.map((a, i) => <Text key={i}>• {a}</Text>)
        )}
        {d.fotos && d.fotos.length > 0 && (
          <>
            <Text style={s.secao}>Fotos</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {d.fotos.map((f, i) => (
                <Image key={i} src={f} style={{ width: 150, height: 120, objectFit: 'cover', marginRight: 8, marginBottom: 8, borderRadius: 3 }} />
              ))}
            </View>
          </>
        )}
        <Rodape />
      </Page>
    </Document>
  );
}

export interface ItemOSPdf {
  nome: string;
  quantidade: number;
  observacao: string;
  fotoDataUri?: string; // foto da peça danificada (base64)
}

export interface DadosOSPdf {
  numeroOS: string;
  clienteNome: string;
  clienteFinalNome?: string | null;
  equipamento: string;
  itens: ItemOSPdf[];
  observacoesTecnico?: string | null;
  prazoEntrega?: string | null;
}

function DocOS({ d }: { d: DadosOSPdf }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Cabecalho titulo="Ordem de Serviço" subtitulo={`${d.numeroOS} · ${d.clienteNome}`} />
        {d.clienteFinalNome && (
          <Text style={{ fontSize: 9, color: cinza, marginBottom: 2 }}>Unidade atendida: {d.clienteFinalNome}</Text>
        )}
        <Text style={{ fontSize: 9, color: cinza, marginBottom: 10 }}>{d.equipamento}</Text>
        {d.prazoEntrega ? (
          <View style={s.linha}><Text style={s.rotulo}>Prazo de entrega</Text><Text style={s.valor}>{d.prazoEntrega}</Text></View>
        ) : null}
        {d.itens.length > 0 && (
          <>
            <View style={s.th}>
              <Text style={s.cItem}>Item / peça</Text>
              <Text style={s.cQtd}>Qtd.</Text>
              <Text style={{ flex: 1.4 }}>Observação / avaria</Text>
              <Text style={{ width: 90 }}>Foto</Text>
            </View>
            {d.itens.map((it, i) => (
              <View style={s.td} key={i} wrap={false}>
                <Text style={s.cItem}>{it.nome}</Text>
                <Text style={s.cQtd}>{it.quantidade}</Text>
                <Text style={{ flex: 1.4 }}>{it.observacao || '-'}</Text>
                <View style={{ width: 90 }}>
                  {it.fotoDataUri ? (
                    <Image src={it.fotoDataUri} style={{ width: 82, height: 62, objectFit: 'cover', borderRadius: 3 }} />
                  ) : (
                    <Text>-</Text>
                  )}
                </View>
              </View>
            ))}
          </>
        )}
        {d.observacoesTecnico ? (
          <>
            <Text style={s.secao}>Observações técnicas gerais</Text>
            <Text>{d.observacoesTecnico}</Text>
          </>
        ) : d.itens.length === 0 ? (
          <Text style={{ color: cinza, marginTop: 8 }}>Nenhuma peça ou observação registrada ainda.</Text>
        ) : null}
        <Rodape />
      </Page>
    </Document>
  );
}

// Orientação de manuseio/limpeza/esterilização (documento informativo fixo,
// validado contra Karl Storz HOPKINS + RDC ANVISA 15/2012).
function DocOrientacao() {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Cabecalho titulo="Orientações de Manuseio, Limpeza e Esterilização de Ópticas Rígidas" />

        <Text style={s.secao}>1 · Manuseio e transporte</Text>
        <Text style={s.item}>• Sempre transportar a óptica na caixa de acomodação.</Text>
        <Text style={s.item}>• Ao retirar ou acomodar a óptica, nunca pressionar o meio da cânula.</Text>
        <Text style={s.item}>• A cânula tem 6 ou mais rod lens (2,70–2,77 mm); qualquer queda ou torção pode quebrar as lentes e embaçar a imagem.</Text>

        <Text style={s.secao}>2 · Limpeza</Text>
        <Text style={s.item}>1. Efetuar a limpeza com tecido macio.</Text>
        <Text style={s.item}>2. Retirar o excesso dos produtos de limpeza com tecido umedecido em água (preferir destilada/deionizada).</Text>
        <Text style={s.item}>3. Umedecer tecido macio em álcool 70% e passar em todas as superfícies (lente objetiva, janela da ocular e conector do cabo de fibra óptica). Secar com tecido absorvente.</Text>
        <Text style={[s.legal, { marginTop: 2 }]}>Após muitas esterilizações (aprox. 10–20) pode haver depósito nas superfícies de vidro deixando a imagem turva; nesse caso encaminhe a óptica para manutenção.</Text>

        <Text style={s.secao}>3 · Cuidados na esterilização</Text>
        <Text style={s.item}>• Limpar e secar completamente a óptica antes de esterilizar.</Text>
        <Text style={s.item}>• Acondicionar em bandeja/estojo apropriado; a óptica não deve encostar em metal durante o ciclo.</Text>
        <Text style={s.item}>• Ao final do ciclo, deixar a óptica esfriar naturalmente.</Text>
        <Text style={s.alerta}>✗ Nunca resfrie a óptica bruscamente (não mergulhe em líquido nem exponha ao ar frio logo após a autoclave). O choque térmico trinca as lentes.</Text>

        <Text style={s.secao}>4 · Métodos recomendados</Text>
        <View style={s.metTh}>
          <Text style={{ flex: 1 }}>Tipo de óptica</Text>
          <Text style={{ flex: 1 }}>Método</Text>
          <Text style={{ flex: 1 }}>Ciclo</Text>
          <Text style={{ flex: 1.2 }}>Parâmetros</Text>
        </View>
        <View style={s.metTd}>
          <Text style={{ flex: 1 }}>AUTOCLAVÁVEL (marcada "AUTOCLAV" na ocular)</Text>
          <Text style={{ flex: 1 }}>Vapor saturado (autoclave)</Text>
          <Text style={{ flex: 1 }}>Pré-vácuo fracionado. Nunca ciclo flash / uso imediato</Text>
          <Text style={{ flex: 1.2 }}>132–134 °C · ~4 min · ~2 bar (27 psi) · com secagem</Text>
        </View>
        <View style={s.metTd}>
          <Text style={{ flex: 1 }}>NÃO autoclavável (sem a marcação "AUTOCLAV")</Text>
          <Text style={{ flex: 1 }}>Óxido de etileno (EtO) ou peróxido de hidrogênio (STERRAD®/plasma)</Text>
          <Text style={{ flex: 1 }}>Conforme as instruções de uso do fabricante</Text>
          <Text style={{ flex: 1.2 }}>Segundo o equipamento de baixa temperatura</Text>
        </View>
        <Text style={s.alerta}>⚠ Verifique a marcação antes de autoclavar. Somente ópticas marcadas "AUTOCLAV" podem ir a vapor. Ópticas não autoclaváveis na autoclave sofrem dano irreparável. Na dúvida, use método de baixa temperatura.</Text>

        <Text style={s.secao}>5 · Nunca</Text>
        <Text style={s.item}>✗ Utilizar secadores ou sopradores térmicos.</Text>
        <Text style={s.item}>✗ Utilizar palha de aço ou abrasivos.</Text>
        <Text style={s.item}>✗ Utilizar instrumentos perfurocortantes para limpar as superfícies (principalmente a lente objetiva).</Text>
        <Text style={s.item}>✗ Autoclavar óptica sem a marcação "AUTOCLAV".</Text>
        <Text style={s.item}>✗ Usar ciclo de autoclave flash / de uso imediato.</Text>
        <Text style={s.item}>✗ Resfriar a óptica bruscamente após o ciclo.</Text>

        <Text style={s.secao}>6 · Referência</Text>
        <Text style={[s.legal, { fontStyle: 'italic' }]}>"Steam sterilize only KARL STORZ telescopes marked 'AUTOCLAV'!"</Text>
        <Text style={s.legal}>1. KARL STORZ SE &amp; Co. KG. HOPKINS® / HOPKINS® II Telescopes — Instruction Manual, seção "Cleaning, Disinfection and Sterilization" (pré-vácuo, 132–133 °C, 4,0 min, 27 psi; proibição de ciclo flash).</Text>
        <Text style={s.legal}>2. BRASIL. ANVISA. RDC nº 15/2012 — boas práticas para o processamento de produtos para saúde (e demais normas em vigor).</Text>

        <View style={s.obs}>
          <Text style={{ fontWeight: 700, marginBottom: 3 }}>Observação importante</Text>
          <Text>Este documento é uma orientação geral de referência, elaborada com base nas instruções de uso do fabricante, e não substitui as instruções de uso específicas de cada modelo de endoscópio. A validação, a execução e o controle dos processos de limpeza, desinfecção e esterilização são de responsabilidade do serviço de reprocessamento (CME) da instituição de saúde, que deve seguir as normas aplicáveis (RDC ANVISA nº 15/2012 e demais em vigor), as instruções de uso do fabricante e os protocolos internos do hospital. A CVF Medical não se responsabiliza por resultados decorrentes de processos executados fora dessas condições.</Text>
        </View>
        <Rodape />
      </Page>
    </Document>
  );
}

function Passo({ n, children }: { n: number; children: ReactNode }) {
  return (
    <View style={s.passo}>
      <Text style={s.passoNum}>{n}</Text>
      <Text style={s.passoTexto}>{children}</Text>
    </View>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={s.bulletLinha}>
      <Text style={s.bulletMarca}>•</Text>
      <Text style={s.bulletTexto}>{children}</Text>
    </View>
  );
}

function Negrito({ children }: { children: ReactNode }) {
  return <Text style={{ fontWeight: 700, color: azulEscuro }}>{children}</Text>;
}

// Versão em PDF do guia de uso do portal (portal/manual.html) - anexada
// junto com o orçamento por e-mail, pra chegar pronta mesmo sem o cliente
// clicar em nenhum link. Manter o conteúdo alinhado com manual.html quando
// um mudar (são 2 versões do mesmo guia, HTML pro portal e PDF pro e-mail).
export function DocManualPortal() {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Cabecalho
          titulo="Portal do Cliente — Guia de Uso"
          subtitulo="Como fazer seu primeiro acesso e acompanhar seus equipamentos, orçamentos e documentos."
        />

        <Text style={s.item}>
          O <Negrito>Portal do Cliente da CVF Medical</Negrito> é onde você acompanha, de forma segura e a qualquer
          hora, tudo o que acontece com seus equipamentos em manutenção: registro de entrada, laudo de peças,
          orçamentos (com aprovação online), laudos técnicos e o termo de entrega.
        </Text>
        <Text style={[s.item, { marginTop: 4 }]}>
          <Negrito>Endereço: </Negrito>
          {PORTAL_CLIENTE_URL}
        </Text>

        <Text style={s.parteTitulo}>Parte 1 — Primeiro acesso (criar seu cadastro)</Text>
        <Passo n={1}>
          Acesse <Negrito>{PORTAL_CLIENTE_URL}</Negrito> pelo navegador (celular ou computador).
        </Passo>
        <Passo n={2}>
          Na tela de login, clique em <Negrito>"Primeiro acesso? Criar cadastro"</Negrito>.
        </Passo>
        <Passo n={3}>
          Informe <Negrito>o mesmo e-mail</Negrito> que você forneceu à CVF Medical (é por ele que o sistema
          reconhece seus equipamentos).
        </Passo>
        <Passo n={4}>
          Crie uma <Negrito>senha</Negrito> (mínimo 6 caracteres) e confirme.
        </Passo>
        <Passo n={5}>
          Clique em <Negrito>"Criar cadastro"</Negrito>. Pronto — seu acesso está criado.
        </Passo>
        <Text style={s.dica}>
          <Negrito>Importante: </Negrito>
          use o mesmo e-mail em que você recebeu este e-mail (é o e-mail cadastrado no sistema da CVF, para onde
          enviamos toda a documentação) - se digitar um e-mail diferente, o portal não encontrará seus
          equipamentos. Em caso de dúvida, fale com a CVF pelo WhatsApp {EMPRESA.telefone}.
        </Text>

        <Text style={s.parteTitulo}>Parte 2 — Entrar no portal</Text>
        <Passo n={1}>
          Na tela de login, digite seu <Negrito>e-mail</Negrito> e sua <Negrito>senha</Negrito>.
        </Passo>
        <Passo n={2}>
          Clique em <Negrito>"Entrar"</Negrito>.
        </Passo>

        <Text style={s.parteTitulo}>Parte 3 — O que você encontra no portal</Text>
        <Bullet>
          <Negrito>Documentos e orientações</Negrito> — materiais de apoio (ex.: orientação de esterilização).
        </Bullet>
        <Bullet>
          <Negrito>Orçamentos</Negrito> — cada orçamento com itens, condições e total; aqui você aprova ou recusa.
        </Bullet>
        <Bullet>
          <Negrito>Entradas de equipamento</Negrito> — o registro de quando o equipamento chegou à CVF, com fotos.
        </Bullet>
        <Bullet>
          <Negrito>Laudo de peças danificadas</Negrito> — as peças e avarias identificadas pela equipe técnica, com
          imagens.
        </Bullet>
        <Bullet>
          <Negrito>Laudos</Negrito> — laudos técnicos em PDF para download.
        </Bullet>
        <Bullet>
          <Negrito>Termo de entrega</Negrito> — o comprovante da devolução do equipamento, para você confirmar o
          recebimento.
        </Bullet>

        <Text style={s.parteTitulo}>Parte 4 — Aprovar (ou recusar) um orçamento</Text>
        <Passo n={1}>
          Abra a seção <Negrito>"Orçamentos aguardando sua aprovação"</Negrito>.
        </Passo>
        <Passo n={2}>
          Confira os itens, o total e as condições. Use <Negrito>"Imprimir orçamento"</Negrito> se quiser salvar em
          PDF.
        </Passo>
        <Passo n={3}>
          Clique em <Negrito>"Aprovar orçamento"</Negrito> para autorizar o serviço, ou{' '}
          <Negrito>"Recusar orçamento"</Negrito>.
        </Passo>
        <Passo n={4}>
          A CVF recebe sua resposta <Negrito>na hora</Negrito> e dá andamento ao serviço.
        </Passo>

        <Text style={s.parteTitulo}>Parte 5 — Confirmar o recebimento (termo de entrega)</Text>
        <Passo n={1}>
          Quando o equipamento for devolvido, o <Negrito>"Termo de entrega"</Negrito> aparece no portal.
        </Passo>
        <Passo n={2}>
          Leia o documento e clique em <Negrito>"Li o documento e confirmo o recebimento"</Negrito>.
        </Passo>
        <Passo n={3}>
          A confirmação fica registrada com <Negrito>data e hora</Negrito>, e a CVF é avisada automaticamente.
        </Passo>

        <Text style={s.parteTitulo}>Resumo do fluxo</Text>
        <Text style={s.item}>
          Você recebe o e-mail com o orçamento → acessa o portal (primeiro acesso: cria cadastro com o mesmo e-mail)
          → analisa o orçamento → aprova ou recusa → acompanha o serviço (entradas, laudo de peças e laudos técnicos)
          → recebe o equipamento → confirma o recebimento no portal.
        </Text>

        <Text style={s.dica}>
          <Negrito>Precisa de ajuda? </Negrito>
          Fale com a CVF Medical pelo WhatsApp {EMPRESA.telefone} ou pelo e-mail {EMPRESA.email}.
        </Text>

        <Rodape />
      </Page>
    </Document>
  );
}

async function blobParaBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export interface AnexoBase64 {
  filename: string;
  content: string;
}

// Gera os 3 PDFs e devolve prontos para anexar (filename + base64).
export async function gerarAnexosOrcamento(
  orcamento: DadosOrcamentoPdf,
  entrada: DadosEntradaPdf | null,
  os: DadosOSPdf,
  incluirOrientacao = false,
): Promise<AnexoBase64[]> {
  const anexos: AnexoBase64[] = [];
  if (entrada) {
    const blob = await pdf(<DocEntrada d={entrada} />).toBlob();
    anexos.push({ filename: `Registro-de-Entrada-${entrada.codigo}.pdf`, content: await blobParaBase64(blob) });
  }
  const blobOS = await pdf(<DocOS d={os} />).toBlob();
  anexos.push({ filename: `Ordem-de-Servico-${os.numeroOS}.pdf`, content: await blobParaBase64(blobOS) });
  const blobOrc = await pdf(<DocOrcamento d={orcamento} />).toBlob();
  anexos.push({ filename: `Orcamento-${orcamento.numeroOrcamento}.pdf`, content: await blobParaBase64(blobOrc) });
  if (incluirOrientacao) {
    const blobOri = await pdf(<DocOrientacao />).toBlob();
    anexos.push({ filename: 'Orientacao-de-Esterilizacao.pdf', content: await blobParaBase64(blobOri) });
  }
  const blobManual = await pdf(<DocManualPortal />).toBlob();
  anexos.push({ filename: 'Portal-do-Cliente-Guia-de-Uso.pdf', content: await blobParaBase64(blobManual) });
  return anexos;
}
