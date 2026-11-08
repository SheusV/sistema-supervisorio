# Próximos incrementos

1. Etapa 0 validada tecnicamente: backend, frontend e fluxo WebSocket real, incluindo reconexão após interrupção do transporte. Revisão visual pelo usuário disponível.
2. Editor: base em 0.2.0; seleção/alinhamento em 0.3.0; ligações, biblioteca ampliada, tags próprias e comandos manuais em 0.4.0. Edição de ligações, renomeação de tags e regra de tanque entregues em 0.5.0. Ligação direta por portas disponível na versão 0.6.0. A biblioteca local da versão 0.7.0 inicia o passo 3. Grupos permanentes e imagens seguem previstos.
3. Em andamento: salvar e reabrir telas no mesmo navegador entregue em 0.7.0. Para acesso entre dispositivos seguem previstos PostgreSQL/Flyway, projetos persistidos, autenticação, perfis e auditoria; testes com Testcontainers.
4. Drivers de leitura, primeiro contra servidores OPC UA/Modbus/MQTT simulados, com qualidade e timeouts testados.
5. Alarmes e histórico com ECharts.
6. Laboratório offline PID/Bode com testes numéricos contra referências analíticas.
7. Wiki pesquisável, ajuda contextual por componente e tutoriais.
8. Extensões versionadas e critérios de segurança de plugins.

Conexão com CLP físico, comandos de escrita e uso em produção exigem fases específicas posteriores. Nenhum desses recursos foi implementado nesta entrega.
