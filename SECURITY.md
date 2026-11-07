# Segurança do projeto

Este repositório público contém uma demonstração de simulação. O perfil local permanece limitado ao computador; o perfil hosted foi preparado para publicação atrás do proxy HTTPS do provedor, com cabeçalhos de segurança e origem WebSocket restrita. Não há autenticação/RBAC, dados privados ou comandos de escrita para equipamentos físicos. Não está pronto para operação industrial. Consulte [os limites da publicação](docs/deployment.md).

## Antes de cada envio

O endpoint de simulação `/api/simulation/evaluate` valida valores de tags próprias, sem persistência ou mutação de estado compartilhado. Limita o corpo a 64 KiB, a 32 tags, nomes/tipos/faixas permitidos e rejeita campos desconhecidos. Ele não aceita endereços de dispositivos, scripts ou comandos físicos. A interface só atualiza valores após resposta válida; falhas tornam os valores próprios indisponíveis até reconexão. Os projetos continuam sendo lidos no navegador; apenas definições de tags, valores e a regra limitada da simulação são enviados ao Java.

- Revisar a lista de arquivos e o diff do commit.
- Nunca registrar tokens, senhas, chaves privadas, certificados privados ou credenciais de equipamentos.
- Arquivos `.env` e suas variações são ignorados. Um `.env.example`, se criado, deve conter somente nomes e exemplos sem segredos.
- `.gitignore` não protege arquivos já versionados. Conferir também o histórico enviado.
- Manter a autenticação Git fora do repositório, usando o gerenciador de credenciais ou autorização pelo navegador. Não colocar tokens nas URLs dos remotos.

Com Gitleaks instalado, executar antes do commit e antes do envio:

```powershell
gitleaks git --pre-commit --staged --redact .
gitleaks git --redact .
```

A varredura inicial foi realizada com Gitleaks 8.30.1. A ausência de alertas não garante ausência absoluta de segredos; a revisão dos arquivos continua necessária. Não há bloqueio automático de novos commits configurado nesta etapa.

Se uma credencial for publicada por engano, revogá-la/rotacioná-la imediatamente. Apagar somente o arquivo mais recente não remove o segredo do histórico. Não inclua credenciais ao relatar problemas em issues públicas.
