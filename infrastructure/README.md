# Infraestrutura

Backend em 127.0.0.1:8080; frontend Vite em 127.0.0.1:5173. Não há banco, broker, contêiner ou equipamento industrial necessário nesta etapa.

Não publicar o servidor de desenvolvimento na internet. Para hospedagem, o Dockerfile da raiz reúne interface e Java em um serviço. O render.yaml prepara uma demonstração gratuita, com atualizações da main após conectar a conta ao GitHub. O perfil hosted usa o proxy HTTPS do provedor. Não há dados privados ou equipamentos físicos.

Consulte o [guia de publicação](../docs/deployment.md). Serviço publicado em https://nexo-scada-demo.onrender.com. PostgreSQL e Flyway entram quando houver persistência.
