# Como publicar o Portal do Cliente

O portal é um único arquivo estático: `portal/index.html`. Ele já fala direto
com o Supabase (login, dados do cliente, laudos, orçamentos). Só precisa ser
hospedado. Abaixo o caminho recomendado (Cloudflare Pages + subdomínio).

> A chave usada no `index.html` é a **publishable/anon** do Supabase — é pública
> por natureza e segura de expor. Quem protege os dados é o RLS (cada cliente só
> vê o que é dele).

## 1. Publicar no Cloudflare Pages

Opção mais simples (upload direto):

1. Acesse **dash.cloudflare.com → Workers & Pages → Create → Pages → Upload assets**.
2. Nome do projeto: `portal-cvf` (ou similar).
3. Suba **apenas o `index.html`** da pasta `portal/` (arraste o arquivo). O
   Cloudflare gera uma URL tipo `https://portal-cvf.pages.dev`.
4. Teste essa URL: a tela de login do portal deve aparecer.

(Alternativa via Git: conectar o repositório e definir o **Build output
directory** como `portal`, sem comando de build.)

## 2. Ligar o subdomínio portal.cvfmedical.com.br

1. No projeto do Pages → **Custom domains → Set up a custom domain** →
   `portal.cvfmedical.com.br`.
2. Se o DNS de `cvfmedical.com.br` estiver na Cloudflare, o registro CNAME é
   criado sozinho. Se estiver em outro provedor (Registro.br, GoDaddy, etc.),
   crie um **CNAME** `portal` apontando para `portal-cvf.pages.dev`.

## 3. Configurar o Supabase (Auth) para o novo endereço

No **Supabase → Authentication → URL Configuration**:

1. **Site URL / Redirect URLs**: adicione `https://portal.cvfmedical.com.br`.
   Isso é necessário para os links de **cadastro/confirmação e redefinição de
   senha** do cliente funcionarem.
2. Confirme que o **provedor de e-mail** (SMTP) está configurado para os e-mails
   de confirmação chegarem aos clientes (Authentication → Emails).

## 4. Conferir

- Abrir `https://portal.cvfmedical.com.br`, criar um cadastro de teste com o
  **mesmo e-mail** de um cliente cadastrado no sistema, confirmar pelo link do
  e-mail e verificar se aparecem OS, orçamentos, entradas e laudos daquele
  cliente (e somente dele).

## Observações

- O botão **"Baixar orientação de esterilização"** já está no portal e não
  depende de nada externo.
- Se preferir não usar subdomínio agora, a própria URL `*.pages.dev` já
  funciona para enviar aos clientes.
