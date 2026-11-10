# Configuração e operação da central de alarmes

## Criar e editar regras

Em Edição, abra Alarmes do projeto e selecione uma tag própria. Tags DOUBLE aceitam Valor alto e Valor baixo. Tags BOOLEAN aceitam Ligado / verdadeiro e Desligado / falso.

Cada regra tem nome, prioridade e atraso de confirmação. As numéricas também têm limite e margem de retorno. Salve a regra e depois salve o projeto na biblioteca ou exporte o JSON para preservar a configuração.

O limite é inclusivo. Um alarme alto em 900 com margem 50 retorna em 850 ou menos. Um alarme baixo em 50 com margem 25 retorna em 75 ou mais. Com margem zero, o retorno exige sair da condição original.

O atraso exige novas leituras confirmadas enquanto a condição persistir. Uma leitura fora da condição ou perda de comunicação reinicia a confirmação pendente.

Use Editar alarme e Excluir alarme na lista. Renomear a tag atualiza o vínculo da regra. Excluir a tag remove suas regras. Desfazer recupera a configuração anterior.

## Operar

A Central de alarmes aparece em Operação quando há regras configuradas. O exemplo de dosagem já inclui:

- Reserva baixa do silo em 50 kg ou menos, retorno em 75 kg, prioridade Média e atraso de 2 s.
- Silo próximo da capacidade em 900 kg ou mais, retorno em 850 kg, prioridade Alta e atraso de 2 s.

O alarme de massa alta da regra de simulação permanece disponível no painel de histórico da dosagem.

Os estados da central são Normal, Confirmando, Ativo, Reconhecido e Sem leitura. O reconhecimento conserva o estado ativo enquanto a condição persistir. O retorno ao normal rearma a regra para uma próxima ativação.

O filtro de prioridade organiza a lista e as ocorrências recentes. O filtro de estado atua na lista atual. Reconhecer alarmes visíveis considera os alarmes apresentados pelos dois filtros. A perda de leitura bloqueia o reconhecimento e conserva o último estado ativo.

## Histórico e limites

O armazenamento usa o banco IndexedDB existente. Cada regra possui escopo pelo nome do projeto e ID da regra. São guardadas até 20 operações por regra, com até 100 eventos e 600 amostras por operação. A central mostra as 100 ocorrências mais recentes dos registros consultados.

Os eventos contêm ativação, reconhecimento, retorno ao normal, comunicação perdida e restabelecida. O reconhecimento é local à sessão e ainda não possui identidade de usuário.

As regras aceitam até 32 entradas por projeto. O parser verifica IDs únicos, vínculo com tags existentes, condição compatível, prioridade, limites e campos permitidos. Projetos sem regras continuam válidos.

O runtime da central depende da aba aberta e das leituras do projeto. A partir da versão 0.11.0, temperatura, umidade, massa, tempo mínimo cumprido e conclusão do forno também estão disponíveis como tags calculadas. Renomear o projeto muda o escopo da consulta. A implementação atual mantém a consulta dos registros pela configuração e escopo existentes.

## Medições do forno

No exemplo de dosagem, as tags calculadas já estão cadastradas. Em um projeto existente com forno, use Tags do projeto → Adicionar medições do forno. A operação acrescenta somente as origens calculadas ausentes e informa conflitos de nomes ou falta de espaço nas 32 tags.

As origens são temperature, moisture, mass, elapsed e finished. O nome da tag pode ser alterado. O parser conserva a origem e valida o tipo, a faixa e o valor inicial previstos para essa medição. Cada origem aparece no máximo uma vez por projeto.

A interface deriva as leituras do lote e mantém o fluxo Java limitado às variáveis manuais. Tags calculadas ficam disponíveis para sensores, indicadores e alarmes; botões e entradas numéricas aceitam tags manuais.

Sem forno vinculado à descarga, as medições ficam indisponíveis. A umidade também fica indisponível sem grãos no forno. A central bloqueia reconhecimento quando a leitura da regra está indisponível.

O exemplo usa os limites demonstrativos de 85 °C com margem de 5 °C para temperatura alta e 20% com margem de 1 ponto percentual para umidade elevada, ambos com confirmação de 2 s. A conclusão do lote usa a condição booleana de FORNO.LOTE_SECO.

O tempo publicado em FORNO.TEMPO representa o tempo mínimo cumprido, limitado ao valor configurado. A massa representa a carga do lote. O modelo continua calculando um único forno vinculado à descarga por projeto.
