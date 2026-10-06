# MI Diversão — catálogo de locação de brinquedos

Catálogo online com reserva por data, sacolinha, envio do pedido pelo WhatsApp e painel
para os donos. Mesma base do catálogo de bebidas (Next.js), adaptada para aluguel.

## Como abrir

Há três jeitos, do mais simples ao definitivo:

### 1. Só ver funcionando — `Demonstracao.html`
Dê dois cliques. Abre no navegador com o catálogo, a sacolinha e o painel funcionando
(o link do painel fica na faixa escura do topo; senha `midiversao2026`).
É uma **demonstração**: os pedidos ficam guardados só naquele navegador, então ela serve
para mostrar e testar, não para receber pedidos de clientes de verdade.

A mesma demonstração fica publicada na internet, para enviar por link:
**https://fabricior13.github.io/MI-diversao/**
(é o arquivo `index.html` do repositório https://github.com/FabricioR13/MI-diversao,
servido pelo GitHub Pages). Para atualizar o link depois de mudar algo, rode `npm run demo`
e envie o novo `index.html` para o repositório.

### 2. Rodar o site no computador — `Iniciar catalogo.bat`
Dê dois cliques. Na primeira vez ele instala as dependências (precisa do
[Node.js](https://nodejs.org) versão LTS instalado e de internet) e depois abre
http://localhost:3000. Não precisa de banco de dados: os dados ficam no arquivo
`.dados/mi-diversao.json` (apague a pasta `.dados` para recomeçar do zero).

Pelo terminal é o mesmo que `npm install` e depois `npm run dev`.

> A pasta está dentro do OneDrive. A instalação cria milhares de arquivos em `node_modules`
> e o OneDrive pode deixar tudo lento ou travar a instalação. Se acontecer, copie a pasta
> para fora do OneDrive (por exemplo `C:\projetos\mi-diversao`) e rode de lá.

### 3. Publicar para os clientes
Em uma hospedagem (Vercel, por exemplo), configure a variável `DATABASE_URL` com um banco
PostgreSQL (Neon e Supabase têm plano gratuito) e, de preferência, `ADMIN_PASSWORD` e
`ADMIN_SECRET` — veja `.env.example`. As tabelas (todas começam com `mi_`) e os dados
iniciais são criados sozinhos no primeiro acesso. Publicado é que a reserva de um cliente
passa a bloquear a data para todos os outros.

## O que o cliente vê

1. **Escolhe as datas** de entrega (ou retirada) e de devolução antes de tudo.
2. O catálogo mostra o que está livre. Brinquedo já alugado naquele período aparece como
   **Reservado nesta data**, com o valor da diária, e não pode ser selecionado.
3. Na **sacolinha**: itens, datas, entrega (com frete da cidade) ou retirada (sem frete),
   horário previsto de entrega e de devolução, com a opção **Selecionar horários**
   (o pedido sai marcado como "horário a confirmar").
4. Preenche nome, WhatsApp e endereço e toca em **Finalizar pelo WhatsApp**: o pedido é
   gravado e o cliente é levado ao WhatsApp da empresa com a mensagem pronta.
   Ele escolhe a forma de pagamento que prefere (Pix, dinheiro, cartão de crédito ou
   cartão de débito), mas não paga nem informa dados do cartão no site: o pagamento é
   combinado e finalizado no WhatsApp.

## Painel dos donos — `/admin`

Senha inicial: `midiversao2026` (ou a que estiver em `ADMIN_PASSWORD`). **Troque em
Configurações > Senha do painel.**

- **Resumo**: entradas, saídas e saldo do mês, valor a receber, próximas entregas.
- **Reservas**: lista e calendário; mudar situação (pendente, confirmado, entregue,
  devolvido, cancelado), dar desconto, ajustar horários, registrar pagamento (vira uma
  entrada no financeiro) e cadastrar **reserva manual** (combinada por telefone/Instagram).
- **Brinquedos e valores**: valor da diária, quantidade, foto, brinde, ocultar do catálogo,
  criar brinquedos e combos.
- **Entradas e saídas**: lançamentos por mês.
- **Configurações**: WhatsApp que recebe os pedidos, horários padrão, endereço de retirada,
  cidades atendidas e frete de cada uma.

## Regras importantes

- **Valor = diária × número de dias.** Entrega e devolução no mesmo dia = 1 diária;
  entrega no sábado e devolução no domingo = 2 diárias.
- **Um pedido novo ("pendente") já segura a data.** Se o cliente não confirmar no WhatsApp,
  cancele a reserva no painel para liberar o brinquedo.
- **Combo ocupa os brinquedos que o formam.** Alugou "Castelo + Cama Elástica"? A cama
  elástica avulsa e os outros combos com cama ficam reservados naquela data. Se a empresa
  tiver 2 camas, é só mudar a quantidade em Brinquedos e valores.

## Para revisar com a MI Diversão

- Os valores dos **combos** vieram das postagens do Instagram. Os valores **avulsos** e os
  **fretes por cidade** são sugestões simbólicas: ajuste no painel.
- O WhatsApp cadastrado é o que aparece nas postagens: (51) 99255-7812.
- As fotos foram recortadas dos prints do Instagram (baixa resolução). Dá para trocar cada
  uma pelo painel, em Brinquedos e valores > Editar.
- Os prints originais continuam na raiz da pasta; não são usados pelo site.

## Onde fica cada coisa

- `src/components/CatalogApp.tsx` — catálogo, datas e sacolinha
- `src/components/AdminPanel.tsx` — painel
- `src/lib/availability.ts` — regra de disponibilidade por data (inclui combos)
- `src/lib/whatsapp.ts` — texto da mensagem enviada ao WhatsApp
- `src/db/seed.ts` — brinquedos, valores, cidades e fretes iniciais
- `src/db/queries.ts` — regras do negócio; `src/db/store-*.ts` — onde os dados ficam
  (PostgreSQL ou arquivo local); `src/app/api/` — rotas
- `src/app/globals.css` — cores e visual (azul das postagens + vermelho, verde e amarelo do logo)
- `public/brinquedos/` e `public/logo.jpg` — fotos e logo
- `scripts/demonstracao/` — gera o `Demonstracao.html` e o `index.html` de novo com `npm run demo`
  (rode depois de mudar o código, as fotos ou os valores iniciais)

## Como foi testado

O catálogo, a sacolinha, o envio ao WhatsApp e o painel foram testados de ponta a ponta em
navegador (celular e desktop), nos três modos de dados: PostgreSQL, arquivo local e a
demonstração de arquivo único. Os testes cobrem conflito de datas, combos, frete, horários
personalizados e financeiro.

O que **não** foi possível rodar no ambiente de criação: o `npm install`/`next dev` (sem
acesso ao registro do npm) e o `Iniciar catalogo.bat` (ambiente sem Windows). Por isso, na
primeira vez que ligar o site, confira se tudo abre normalmente; `next.config.ts` está
configurado para que um eventual aviso de tipagem não trave o build.
