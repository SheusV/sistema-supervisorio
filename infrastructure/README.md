# Infraestrutura — Etapa 0

Backend em 127.0.0.1:8080; frontend Vite em 127.0.0.1:5173. Não há banco, broker, contêiner ou equipamento industrial necessário nesta etapa.

Acesso pela rede local será preparado com autenticação, TLS, proxy reverso e regras de firewall explícitas. Não publicar este servidor de desenvolvimento na internet. O perfil atual é local e não possui login. Nenhuma regra de firewall ou configuração global do computador foi alterada.

PostgreSQL + Flyway e Testcontainers entram quando houver persistência; adicionar Docker Compose neste momento não validaria nenhum comportamento do incremento.
