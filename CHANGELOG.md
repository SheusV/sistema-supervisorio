# Histórico de versões

## 0.4.0 — 06/11/2026

- Válvulas, motores, sensores, botões, entradas numéricas e figuras na biblioteca.
- Tubulações e sinais ancorados a portas, com indicação de estado por tag booleana.
- Tags de projeto tipadas, valores iniciais/faixas editáveis, cores e escala do tanque.
- Comandos de simulação manual validados pelo Java, sem estado compartilhado entre abas.
- Exemplo de processo conectado; projeto v2 com importação v1 preservada.
- Simulação manual explícita: sem cálculo hidráulico, lógica automática ou comandos físicos.

## 0.3.0 — 06/11/2026

- Seleção múltipla por Shift + clique, área de seleção ou Selecionar todos.
- Movimento conjunto com grade e limites, preservando geometria e vínculos.
- Alinhamento por bordas/centros e distribuição de espaços, considerando rotação.
- Exclusão conjunta e uma revisão de histórico por ação; JSON v1 compatível.

## Preparação de hospedagem — 06/11/2026

- Interface integrada ao pacote Java, perfil hosted e cabeçalhos de segurança.
- Dockerfile com testes durante o build e execução sem privilégios.
- Configuração Render Free com publicação automática da main após conexão da conta.
- Pacote validado localmente: 21 testes frontend, 5 Java e 6 de navegador.
- Serviço público e imagem Docker validados no Render; seis testes de navegador aprovados no endereço público.

## 0.2.0 — 06/11/2026

- Editor Fabric.js com biblioteca de tanque, bomba, indicador e texto.
- Arraste, ajuste à grade, tamanho, rotação, propriedades e ordem de exibição.
- Edição e Operação separadas, com vínculo às tags simuladas existentes.
- Arquivo JSON versionado, validação estrita, exportação/importação e histórico de 60 alterações.
- Documentação de uso revisada e textos de interface orientados à operação.

## 0.1.0 — 06/11/2026

- Backend Java com saúde, consulta de tags e WebSocket.
- Simulador de nível, bomba e temperatura.
- Sinótico React, lista de tags, reconexão e ajuda F1.
- Testes de contrato, interface e comunicação com o backend.
