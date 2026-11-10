# Histórico de versões

## 0.12.0 — Retomada da operação

- Ponto de retomada automático no navegador para os valores manuais e o lote do forno.
- Recuperação explícita ao reabrir o mesmo projeto, com validação da configuração e dos valores pelo Java.
- Retomada pausada, preservando massa, temperatura, umidade, tempo acumulado, identificação e curvas do lote.
- Proteção por revisão para evitar sobrescrita de pontos atualizados por outra aba.
- Recuperação de lote concluído com o mesmo ID, preservando a unicidade no histórico.
- Tratamento de ponto corrompido, incompatibilidade e falha de armazenamento ou comunicação.
- Atualização do banco local para versão 3, preservando operações e lotes existentes.

## 0.11.0 — 09/11/2026

- Medições calculadas do forno disponíveis como tags somente leitura de temperatura, umidade, massa, tempo mínimo cumprido e lote seco.
- Indicadores no sinótico e regras de alarme usando as medições do ciclo real da simulação.
- Exemplo de dosagem com indicadores de temperatura e umidade e alarmes de temperatura alta, umidade elevada e conclusão da secagem.
- Inclusão das medições em projetos existentes, renomeação com atualização dos vínculos e persistência no JSON.
- Campos e comandos da interface respeitam as tags calculadas. Regras de alimentação e descarga usam tags manuais.

## 0.10.0 — 09/11/2026

- Regras independentes de alarme por tag, com valores alto/baixo e estados booleanos.
- Criação, edição e exclusão de regras com prioridade, histerese e confirmação temporizada.
- Central de alarmes com filtros de prioridade e estado, reconhecimento individual e dos alarmes visíveis.
- Histórico local de ocorrências por regra, incluindo reconhecimento e falhas de comunicação.
- Importação/exportação das regras no projeto, atualização de vínculos ao renomear tags e limpeza ao excluir tags ou criar uma tela.
- Exemplo de dosagem com alarmes de reserva baixa e proximidade da capacidade.

Os incrementos entre 0.9.0 e 0.10.0 também acrescentaram triturador e forno, receitas de secagem, temperatura, umidade, capacidade do forno, histórico e curvas de lotes e exportação CSV. A lógica de secagem permanece demonstrativa.

## 0.9.0 — 08/11/2026

- Alarme de massa alta do silo com limite editável, reconhecimento e registro de retorno ao normal.
- Gráfico da variável simulada e consulta das operações anteriores salvas no navegador.

## 0.8.2 — 08/11/2026

- Interruptor de sol e lua no cabeçalho. A opção de seguir o sistema fica em Ajuda → Aparência.

## 0.8.1 — 08/11/2026

- Temas claro, escuro e do sistema na supervisão, tags, ajuda e editor, incluindo o sinótico. Preferência guardada no navegador.

## 0.8.0 — 08/11/2026

- Silo com leitura e escala, esteira transportadora, dosador de rosca e misturador com indicação de estado.
- Exemplo de dosagem em kg e permissão booleana opcional para habilitar a entrada de material no simulador Java.

## 0.7.1 — 08/11/2026

- Renomeação e exclusão de projetos na biblioteca local, com confirmação de exclusão e controle de conflitos entre abas.

## 0.7.0 — 08/11/2026

- Biblioteca de projetos no navegador. Salvar e abrir preservam componentes, ligações, tags e regras de simulação.
- Substituição por nome com confirmação e verificação de revisão entre abas. Exportar JSON baixa uma cópia portátil.

## 0.6.0 — 07/11/2026

- Desenho de tubulações e sinais entre portas na tela, com prévia, cancelamento e suporte a zoom. As conexões podem receber tags, ser editadas e ser recuperadas pelo histórico ou arquivo de projeto.

## 0.5.0 — 06/11/2026

- Edição de origem, destino, portas, tipo e vínculo de ligações existentes.
- Renomeação de tags preserva vínculos com objetos, ligações e regra.
- Regra configurável de enchimento/drenagem calculada pelo Java, com limites, iniciar/pausar e parada por falha.
- Guia Por onde começar e exemplo com simulação automática.
- Importação de projetos anteriores mantida e alterações recuperáveis por Desfazer.

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
