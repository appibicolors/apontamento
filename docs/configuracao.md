# Configuração das integrações

## Supabase

1. Crie um projeto gratuito na conta da empresa.
2. Abra o SQL Editor e execute `supabase/schema.sql`.
3. Guarde a URL do projeto e as chaves em variáveis de ambiente da hospedagem.
4. Nunca coloque a `service_role` no navegador.

Variáveis previstas: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (somente servidor).

## Google Drive

1. Crie um projeto no Google Cloud da empresa.
2. Ative a Google Drive API.
3. Crie a pasta `APONTAMENTO DE PRODUÇÃO/ORIGINAIS`.
4. Configure OAuth para o usuário do PCP ou uma identidade de servidor com acesso à pasta.

Variáveis previstas: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` e `GOOGLE_DRIVE_FOLDER_ID`.

O banco armazena apenas o identificador do Drive, a URL, o hash e os dados extraídos. O PDF original permanece no Drive.
