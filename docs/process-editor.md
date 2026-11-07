# Editor de processo — versão 0.5.0

## Experimente

1. Abra Editor e clique em **Exemplo de processo**. Desfazer recupera a tela anterior.
2. Entre em **Operação**. Aguarde a confirmação da simulação Java.
3. Clique no botão desenhado **Ligar / desligar linha**, ou em **Alternar LINHA.HABILITADA**. Bomba, motor, válvula e tubulações compartilham essa tag e refletem seu estado.
4. Informe um valor entre 0 e 100 em **TANQUE.NIVEL** e clique em Aplicar. O nível do tanque acompanha o valor. Clicar na entrada numérica desenhada leva ao campo correspondente.
5. Clique em **Iniciar simulação automática**: a linha ligada enche o tanque; desligada, ele drena. Pausar mantém o nível.
6. Volte à Edição para criar outros equipamentos, tags e ligações. A simulação reinicia com os valores iniciais ao entrar novamente em Operação.

## Monte sua tela

O nome pode ser alterado acima do desenho. A biblioteca contém tanque, bomba, válvula, motor, sensor, indicador, texto, botão, entrada numérica, retângulo e elipse. Objetos podem ser movidos, redimensionados, girados, coloridos, alinhados, vinculados e excluídos. O tanque tem escala mínima/máxima configurável. Texto aceita cor; figuras aceitam uma tag booleana para indicação de estado.

Em **Tags do projeto**, crie até 32 variáveis BOOLEAN ou DOUBLE. Cada variável possui nome, unidade, valor inicial e limites. Os nomes usam letras maiúsculas, números, ponto e sublinhado. As três tags da demonstração são reservadas. Use Editar tag para ajustar nome, unidade, valor inicial e faixa. Renomear atualiza os vínculos dos objetos, ligações e regra; o tipo permanece fixo. Excluir uma tag limpa seus vínculos e remove a regra que a utiliza; Desfazer recupera a alteração inteira.

No painel Propriedades, **Tag vinculada** apresenta somente tags compatíveis. Tanques, sensores, indicadores e entradas aceitam números. Bombas, válvulas, motores, botões e figuras aceitam booleanos. Botões e entradas aceitam somente tags próprias, pois as tags transmitidas pelo WebSocket permanecem somente leitura.

Em **Ligações**, escolha origem, destino, porta de saída, porta de entrada e tipo. Portas disponíveis: esquerda, direita, topo e base. Tubulação usa linha contínua; sinal usa linha tracejada. Uma tag booleana opcional indica o estado da ligação. Os caminhos são ortogonais automáticos e acompanham movimento, escala e rotação. Não há edição de pontos intermediários ou desvio automático de obstáculos. Use **Editar ligação** para alterar origem, destino, portas, tipo e tag sem duplicar a conexão. Excluir um objeto remove suas ligações; Desfazer recupera objetos e ligações juntos.

## Funcionamento da simulação

O navegador envia a definição das tags e os valores propostos ao Java por `POST /api/simulation/evaluate`. O servidor valida nomes, tipos, limites e tamanho da requisição e devolve os valores aceitos, identificados como SIMULATED. Só então a tela atualiza os componentes. As respostas são verificadas também no frontend.

O endpoint não guarda estado entre requisições: uma aba não modifica outra, o simulador compartilhado de demonstração ou equipamentos físicos. O estado da simulação permanece apenas na instância aberta do editor. Sair do editor, voltar à edição ou recarregar reinicia os valores. Exportação salva definições e valores iniciais, não os valores de operação.

Os valores mostrados são os últimos valores aceitos pelo Java, não medições físicas. Uma falha ou timeout de comando torna os valores próprios indisponíveis até Reconectar simulação. Durante uma requisição, os controles ficam bloqueados. Respostas atrasadas de um projeto anterior são descartadas.

Tubulações não implementam fluxo físico. Compartilhar uma tag cria uma associação explícita de estado; não calcula vazão, pressão, balanço de massa ou intertravamentos. A regra explícita é independente do desenho. Este incremento não contém linguagem de programação, scripts, expressões livres, drivers ou escrita em CLPs.

## Regra automática de tanque

Em **Simulação automática**, escolha uma tag DOUBLE de nível, uma BOOLEAN de acionamento e taxas entre 0 e 1000 unidades da tag por segundo simulado. O Java calcula `nível + ((ligada ? entrada : 0) - saída) × segundos`, limitado ao mínimo/máximo da tag. A saída é contínua. Há uma regra por projeto.

A operação começa pausada. Cada ciclo confirmado avança um segundo simulado, com solicitações a cada segundo e sem sobreposição. Lentidão ou abas em segundo plano podem reduzir a velocidade; não há recuperação de tempo perdido. Falhas pausam o cálculo e exigem reconexão, sem retomada automática. Durante um pedido, os controles aguardam sua conclusão. Voltar à edição reinicia os valores. A regra é exportada com o projeto.

## Contrato de projeto v2

O formato v1 permanece aceito. Ao editar, o projeto passa a v2, mantendo os componentes existentes. Projetos v2 não são compatíveis com versões antigas do aplicativo.

- `schemaVersion`: 2; nome e tela 1200 × 720 seguem os limites anteriores.
- `components`: até 100, com campos v1 e tipos adicionais da biblioteca. Campos opcionais: `color` no formato hexadecimal #RRGGBB; `rangeMin` e `rangeMax`, ambos obrigatórios quando uma escala é informada e com mínimo menor que máximo.
- `variables`: até 32 registros com exatamente `name`, `dataType`, `unit`, `initial`, `min`, `max`. Nomes únicos de até 64 caracteres; unidades até 16; números finitos entre −1.000.000 e 1.000.000; valores iniciais dentro da faixa.
- `connections`: até 100 registros com exatamente `id`, `from`, `to`, `fromPort`, `toPort`, `kind`, `binding`. IDs únicos; dois objetos existentes e distintos; portas left/right/top/bottom; tipo pipe/signal; vínculo booleano ou null.
- `simulation`: opcional, com exatamente `levelTag`, `enableTag`, `fillRate`, `drainRate`; referências a tags próprias DOUBLE/BOOLEAN e taxas finitas de 0 a 1000. Projetos antigos sem regra continuam aceitos; versões anteriores à 0.5 não leem a extensão.
- Limite total do arquivo: 256 KiB. Nenhuma URL, imagem remota, script, campo desconhecido ou desserialização Fabric é aceita.

O endpoint Java aceita JSON de até 64 KiB com `variables` e `values`, além de `rule` e `seconds` opcionais. `rule` possui os campos de `simulation`; `seconds` é finito entre 0 e 1 (padrão zero), e passos diferentes de zero exigem regra válida. `values` é um mapa de nomes para valores; nomes ausentes usam o valor inicial. Tags desconhecidas, tipos incorretos e valores fora da faixa resultam em 400; corpo excedente resulta em 413. Um documento inválido não altera nenhum estado compartilhado.

## Validação

Testes cobrem importação/exportação, rejeição de ligações órfãs, nomes reservados, tipos incompatíveis, cores inválidas, exclusão com ligações, edição das tags, comandos Java, clique no botão desenhado, limites numéricos, isolamento entre abas e falha de comunicação. Consulte o relatório de validação.
