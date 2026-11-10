# Configuração das integrações

## Supabase

1. Crie um projeto gratuito na conta da empresa.
2. Abra o SQL Editor e execute `supabase/schema.sql`.
3. Execute também `supabase/002_usuarios_e_permissoes.sql`.
4. A URL e a chave pública estão configuradas no cliente web.
5. Nunca coloque uma chave `secret` ou a antiga `service_role` no navegador.

Qualquer futura chave `secret` será configurada exclusivamente no ambiente protegido do servidor.

## Google Drive

1. Crie um projeto no Google Cloud da empresa.
2. Ative a Google Drive API.
3. Crie a pasta `APONTAMENTO DE PRODUÇÃO/ORIGINAIS`.
4. Configure OAuth para o usuário do PCP ou uma identidade de servidor com acesso à pasta.

Variáveis previstas: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` e `GOOGLE_DRIVE_FOLDER_ID`.

O banco armazena apenas o identificador do Drive, a URL, o hash e os dados extraídos. O PDF original permanece no Drive.

## Microdata ERP

A consulta de OPs do Microdata é feita exclusivamente pela Edge Function
`consultar-op-microdata`. A chave privada nunca deve ser adicionada ao React,
ao GitHub Pages ou ao repositório.

Configure os secrets do projeto Supabase:

```text
MICRODATA_OP_API_BASE_URL=https://op-api.amerilink.cloud
MICRODATA_OP_API_KEY=<chave fornecida pela TI>
```

Depois dos secrets, publique a função da pasta
`supabase/functions/consultar-op-microdata`. A função autentica o usuário,
consulta novamente o ERP antes da gravação e chama a RPC privada que cadastra
a OP e todo o roteiro em uma única transação.

A migração necessária é `supabase/018_integracao_microdata.sql`. Ela cria os
contratos de gravação atômica para Microdata e PDF, sem limpar nem sobrescrever
OPs existentes. A importação PDF permanece como contingência administrativa.
