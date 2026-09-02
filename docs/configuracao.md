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
