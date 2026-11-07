# Relatório de validação — versão 0.5.0

Data: 06/11/2026. Ambiente: Windows, Node.js 24.22.1, Java 21.0.13, Microsoft Edge.

## Resultado

Editor integrado e validado com o simulador Java. A supervisão existente permanece funcional. Nenhum equipamento físico foi conectado.

## Verificações realizadas

- TypeScript: compilação sem erros.
- Vite: build de produção aprovado; editor carregado separadamente da tela inicial.
- Vitest: **57 testes aprovados em 6 arquivos**.
- Playwright/Edge: **12 testes aprovados** contra o Java local, incluindo edição de ligações, renomeação de tags, enchimento, drenagem, pausa e falha. Verificação pública desta versão pendente.
- Dependências npm: instalação concluída; auditoria reportou zero vulnerabilidades no momento da instalação.
- Backend: **11 testes Java aprovados**, incluindo isolamento por requisição, tipos, faixas, corpo excedente, campos desconhecidos e JSON malformado. O Dockerfile executa novamente os testes Java/frontend em cada build.
- Docker não está instalado localmente. A hospedagem usa a imagem Linux construída pelo Render em https://nexo-scada-demo.onrender.com.

## Cobertura do editor

- Projeto v2 com tags próprias, componentes ampliados, cores, escalas e ligações; importação v1 preservada.
- Exclusão de equipamento remove ligações; Desfazer recupera tudo. Vínculos incompatíveis, órfãos, nomes reservados e cores inválidas são rejeitados.
- Criação e edição de tags, nome da tela, comandos reais de simulação Java, botão no canvas, limite numérico e isolamento entre abas.
- Falha na API manual torna valores próprios indisponíveis e oferece reconexão. Tubulações não calculam vazão.

- Seleção múltipla pela lista, movimento conjunto no canvas, preservação de rotação e vínculos.
- Seis alinhamentos, distribuição com dimensões diferentes, limites de movimento e rejeição atômica de posições inválidas ou espaço insuficiente.
- Alinhar/excluir vários objetos em uma revisão; recuperação pelo histórico e exportação/reabertura compatível com JSON v1.

- Arquivo de exemplo distribuído aceito pelo parser.
- Preservação de geometria, rotação, rótulo, ordem e vínculo ao exportar e reabrir.
- Rejeição de campos desconhecidos, URLs, scripts, estruturas inválidas, IDs repetidos, limites excedidos e tags incompatíveis.
- Histórico de 60 revisões, desfazer/refazer e descarte do caminho de refazer após nova edição.
- Inserção de componente, propriedades, ordem de exibição e download JSON no navegador.
- Reabertura do JSON exportado sem perder o vínculo.
- Arraste com mouse e ajuste à grade; desfazer retorna à posição anterior.
- Operação com valores recebidos do Java real; biblioteca e propriedades bloqueadas nesse modo.
- Navegação interna preserva o documento; arquivo inválido preserva a tela atual.
- Tela estreita sem transbordamento horizontal da página.

Os testes de contrato usam mensagens controladas; os testes de supervisão, reconexão, comandos e regra automática usam o backend real. A restrição de importar conteúdo fora da raiz do servidor Vite foi respeitada: o teste do exemplo lê o arquivo diretamente como dado local de teste, sem ampliar as permissões do servidor web.

## Capturas

- `screenshots/simulacao-automatica.png`: controles da regra automática na versão 0.5.0.
- `screenshots/processo-operacao.png`: processo conectado e comandos de simulação da versão 0.4.0.

- `screenshots/editor-selecao-multipla.png`: painel de alinhamento e distribuição da versão 0.3.0.

- `screenshots/editor-v0.2.png`: edição e reabertura de projeto com dados controlados.
- `screenshots/editor-operacao-java.png`: editor em Operação com o simulador Java.
- `screenshots/desktop-java-live.png`: supervisão conectada ao Java.
- Arquivos terminados em `test-data.png`: interface com dados controlados.

## Limites

Não foram validados carga, persistência em servidor ou equipamentos industriais. O projeto permanece em memória até ser exportado. Imagens/SVG, grupos permanentes e conexões industriais não fazem parte desta versão.

A validação de reconexão interrompe o transporte WebSocket e verifica sua recuperação; não equivale a um teste de reinício manual do processo Java. Não há certificação de segurança ou disponibilidade industrial.
