# Retomada da operação

## Uso

Em Operação, o painel Retomada da operação acompanha a gravação do estado confirmado. Aguarde Ponto de retomada salvo antes de fechar a página.

Ao reabrir o mesmo projeto, o painel oferece:

- Retomar operação salva recupera os valores e o lote, após validação pelo Java.
- Iniciar nova operação descarta o ponto anterior após a validação dos valores iniciais e inicia uma nova gravação.

A simulação automática permanece pausada depois da retomada. Use Iniciar simulação automática quando quiser avançar. O período em que a página esteve fechada não acrescenta aquecimento ou tempo de secagem.

O checkpoint preserva os valores manuais, capacidade e massa do lote, temperatura, umidades, meta, tempo mínimo e tempo cumprido, ID, horários e até 600 amostras. Uma lacuna nas curvas marca a retomada de um lote em andamento.

Os indicadores calculados são regenerados a partir do lote. Alarmes são reavaliados na nova sessão e o histórico de ocorrências continua no navegador.

## Projeto e configuração

A gravação é associada ao nome do projeto e à tag do forno vinculado, ou ao processo quando não houver forno. O checkpoint inclui uma impressão da configuração serializada. Sua validação impede aplicar o estado a um projeto alterado.

Salve ou exporte o projeto antes de fechar. O ponto de retomada preserva a operação, enquanto a biblioteca e o JSON preservam a tela. Ao mudar nome ou vínculo do forno, o escopo da consulta também muda.

Se a configuração divergir, reabra o projeto correspondente ou escolha iniciar uma nova operação. Dados inválidos impedem a retomada e exigem uma decisão explícita.

## Concorrência e falhas

Cada gravação inclui uma revisão única. O IndexedDB compara a revisão lida com a atual numa transação antes de escrever ou excluir. A fila de cada aba serializa seus próprios pedidos.

Quando outra aba altera o ponto entre leitura e gravação, a aba desatualizada pausa a simulação e bloqueia seus comandos. Use Recarregar ponto salvo para consultar a versão atual.

Falhas de comunicação durante a retomada mantêm o ponto armazenado. A opção de retomar pode ser tentada novamente quando o Java estiver disponível.

Uma falha de armazenamento é exibida. Continuar sem gravação permite operar na sessão atual, com aviso de que essas alterações podem ser perdidas ao fechar.

Um lote concluído mantém seu ID na recuperação. A gravação no histórico usa esse ID e evita criar outra cópia da conclusão.

## Persistência

O banco nexo-operation-history passa à versão 3. Os stores runs e batches são preservados e o novo store checkpoints utiliza scope como chave.

O formato de checkpoint usa schemaVersion 1. O parser verifica a configuração, tipos e faixas das tags, estado do lote, limites de capacidade e tempo e validade das amostras. Os valores manuais também passam pelo endpoint Java antes da aplicação.

Há um ponto atual por escopo. As operações e os lotes concluídos continuam com suas políticas de retenção independentes. Os dados pertencem ao perfil e à origem do navegador. Limpar os dados do site remove os pontos.

Mudanças enquanto uma gravação está pendente podem não estar no último ponto confirmado. A indicação no painel diferencia gravação em andamento e ponto confirmado.
