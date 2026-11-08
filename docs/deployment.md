# Publicação da demonstração

## Arquitetura de hospedagem

O Dockerfile constrói o frontend, executa seus testes e inclui o resultado no JAR Java pelo perfil Maven `web-ui`. O servidor atende a página, `/api` e `/ws` no mesmo domínio. O navegador escolhe automaticamente WSS quando a página usa HTTPS.

O contêiner final contém somente Java e a aplicação; executa como usuário sem privilégios. `.dockerignore` usa uma lista de inclusão, deixando ferramentas locais, Git, arquivos de ambiente e credenciais fora do contexto de build.

O perfil Spring `hosted` escuta a porta fornecida pelo provedor. O perfil local continua limitado a loopback. As variáveis utilizadas são de configuração, não de autenticação:

| Variável | Origem / finalidade |
| --- | --- |
| PORT | Porta fornecida pela hospedagem |
| SPRING_PROFILES_ACTIVE | hosted |
| RENDER_EXTERNAL_URL | Domínio HTTPS fornecido pelo Render |
| PUBLIC_ORIGIN | Opcional; origem exata ao usar domínio próprio |

Não colocar chaves ou tokens no repositório, Dockerfile ou frontend. Esta demonstração não precisa de credenciais de equipamentos ou APIs externas.

## Render

1. Criar/acessar uma conta Render e conectar o GitHub, limitando o acesso a `SheusV/sistema-supervisorio`.
2. Criar um Blueprint a partir desse repositório para usar `render.yaml`, ou criar um Web Service com runtime Docker, branch main e Dockerfile na raiz.
3. Revisar o plano Free e seus limites na conta antes de confirmar. Não é plano de produção e pode haver quotas/condições de cobrança da conta.
4. Usar `/api/health` como verificação de saúde. Não cadastrar banco de dados nesta etapa.
5. Aguardar a compilação e conferir HTTPS, WebSocket, editor e exportação de JSON na URL retornada pelo provedor.

Publicado em 06/11/2026: https://nexo-scada-demo.onrender.com. Serviço nexo-scada-demo, plano Free, região Virginia, branch main, GitHub autorizado e repositório vinculado pelo provedor Git, com publicação automática a cada envio à main. Criado diretamente como Web Service; render.yaml permanece como modelo para reproduzir a infraestrutura e não está vinculado a um Blueprint. Health Check Path configurado como /api/health no painel; endpoint conferido externamente com resposta UP. Os seis testes de navegador passaram contra o endereço público.

## Atualizações

A configuração usa `autoDeployTrigger: commit` na branch main. Isso requer conectar o GitHub ao Render; a opção de publicar apenas por uma URL pública de repositório não habilita deploy automático.

Fluxo: alteração em branch → testes e revisão de segredos → integração na main → Render reconstrói a imagem → testes Java/frontend dentro do build → verificação de saúde → nova versão na mesma URL. Se o build falhar, corrigir antes de considerar a nova versão publicada. Testes de navegador continuam sendo executados antes do envio.

O simulador reinicia em cada deploy. Projetos salvos ficam no armazenamento local do navegador, associado à origem do site. Salve ou exporte alterações antes de atualizar a página. Conexões WebSocket podem cair durante a troca de versão e o cliente tenta reconectar.

## Plano gratuito

O serviço gratuito pode suspender após inatividade e levar cerca de um minuto para retomar. Existem limites de horas, banda e builds. A oferta e os valores devem ser conferidos na conta. Não prometer disponibilidade industrial nem usar estratégias de tráfego artificial para evitar a suspensão.

## Teste local do pacote

Com dependências já instaladas, na raiz do projeto:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Build-Package.ps1
java -jar backend/target/scada-platform-0.1.0.jar
```

Abra http://127.0.0.1:8080. Este modo mantém o perfil local. Para testar o perfil de hospedagem, mantendo o acesso restrito ao computador:

```powershell
java -jar backend/target/scada-platform-0.1.0.jar --spring.profiles.active=hosted --server.address=127.0.0.1 --server.port=8081 --scada.allowed-origins=http://127.0.0.1:8081
```

Os testes de navegador podem apontar para o pacote:

```powershell
Set-Location frontend
$env:E2E_BASE_URL = 'http://127.0.0.1:8081'
npm.cmd run test:e2e
```

Se Docker estiver instalado, `docker build -t nexo-scada .` constrói a imagem e `docker run --rm -p 127.0.0.1:8080:8080 nexo-scada` inicia a demonstração no computador. Docker não está instalado localmente; o build real da imagem foi concluído e validado no Render.

## Limites de segurança

A publicação é uma demonstração pública com dados sintéticos. As tags compartilhadas permanecem somente leitura; o endpoint de simulação valida definições e valores próprios sem guardar estado entre requisições. Não há login, dados privados, upload de projeto no servidor, conexão OT ou comandos físicos. Projetos importados são processados no navegador; somente definições/valores de tags e a regra limitada de tanque são enviados ao Java. TLS é terminado pelo provedor; o perfil hosted usa cabeçalhos encaminhados exclusivamente atrás desse proxy.

Qualquer evolução que inclua persistência compartilhada, dados reais ou administração remota exige autenticação, autorização e revisão específica antes de publicação.

Referências oficiais: https://render.com/docs/docker ; https://render.com/docs/deploys ; https://render.com/docs/websocket ; https://render.com/docs/free
