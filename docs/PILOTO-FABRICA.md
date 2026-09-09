# Piloto de apontamento na fábrica

## Arquitetura

- **GitHub Pages:** entrega o site estático em HTTPS.
- **Supabase:** autenticação, PostgreSQL, regras de acesso e procedimentos de apontamento.
- **Leitores USB/Bluetooth:** funcionam como teclado nos campos OP, operação, operador e máquina.
- **QR da OP:** contém `OP:<número>|PCP:<usuário>` e é baixado em PNG para impressão.

A chave presente no navegador é a chave publicável do Supabase. Nunca coloque a `service_role` no GitHub ou no site.

## Preparar o banco

No SQL Editor do Supabase, execute nesta ordem:

1. `supabase/005_modo_piloto_operacao_livre.sql`
2. confira os operadores e máquinas que serão preservados;
3. `supabase/006_limpar_dados_para_inicio_fabrica.sql` imediatamente antes do início oficial.

## Publicar no GitHub Pages

1. Crie um repositório e envie este projeto para a branch `main`.
2. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions**.
3. O fluxo `.github/workflows/deploy-pages.yml` publica automaticamente cada atualização da `main`.
4. Abra o endereço HTTPS exibido pelo job `Publicar sistema de apontamento`.

## Roteiro mínimo de liberação

1. Cadastrar e testar um operador e uma máquina de cada posto.
2. Subir uma OP real, conferir os dados e baixar/imprimir seu QR.
3. Em dois dispositivos, apontar operações diferentes da mesma OP.
4. Confirmar operador, máquina, início, fim, duração e observação no Histórico.
5. Fixar o navegador em tela cheia nos postos e manter um procedimento manual de contingência.
