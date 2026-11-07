# Próximos incrementos

1. Etapa 0 validada tecnicamente: backend, frontend e fluxo WebSocket real, incluindo reconexão após interrupção do transporte. Revisão visual pelo usuário disponível.
2. Editor: base em 0.2.0; seleção/alinhamento em 0.3.0; ligações, biblioteca ampliada, tags próprias e comandos manuais em 0.4.0. Edição de ligações, renomeação de tags e regra de tanque entregues em 0.5.0. Prioridade seguinte: ligação direta no canvas, com testes de comportamento. Grupos permanentes e imagens entram depois, sem substituir essa prioridade funcional.
3. PostgreSQL/Flyway, projetos persistidos, autenticação, perfis e auditoria; testes com Testcontainers.
4. Drivers de leitura, primeiro contra servidores OPC UA/Modbus/MQTT simulados, com qualidade e timeouts testados.
5. Alarmes e histórico com ECharts.
6. Laboratório offline PID/Bode com testes numéricos contra referências analíticas.
7. Wiki pesquisável, ajuda contextual por componente e tutoriais.
8. Extensões versionadas e critérios de segurança de plugins.

Conexão com CLP físico, comandos de escrita e uso em produção exigem fases específicas posteriores. Nenhum desses recursos foi implementado nesta entrega.
