# Próximos incrementos

1. Etapa 0 validada tecnicamente: backend, frontend e fluxo WebSocket real, incluindo reconexão após interrupção do transporte. Revisão visual pelo usuário disponível.
2. Editor HMI inicial entregue em 0.2.0: Fabric.js, componentes básicos, transformação, vínculos restritos, undo/redo e salvar/abrir JSON validado. Próxima evolução: grupos, alinhamento múltiplo e importação segura de imagens.
3. PostgreSQL/Flyway, projetos persistidos, autenticação, perfis e auditoria; testes com Testcontainers.
4. Drivers de leitura, primeiro contra servidores OPC UA/Modbus/MQTT simulados, com qualidade e timeouts testados.
5. Alarmes e histórico com ECharts.
6. Laboratório offline PID/Bode com testes numéricos contra referências analíticas.
7. Wiki pesquisável, ajuda contextual por componente e tutoriais.
8. Extensões versionadas e critérios de segurança de plugins.

Conexão com CLP físico, comandos de escrita e uso em produção exigem fases específicas posteriores. Nenhum desses recursos foi implementado nesta entrega.
