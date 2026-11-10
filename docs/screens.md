# Telas de um projeto

Um projeto reúne a configuração de um processo e suas telas. Cada tela possui objetos e ligações próprios. As tags, as regras de simulação, a receita e os alarmes pertencem ao projeto inteiro.

## Uso

1. Abra Editor e escolha Exemplo com várias telas para carregar a linha de grãos.
2. Escolha Visão geral, Recebimento ou Secagem em Tela exibida.
3. Em Edição, Adicionar tela cria uma vista vazia e Duplicar tela copia objetos e ligações da vista atual, mantendo os mesmos vínculos de tags.
4. Use Nome da tela exibida e Renomear tela para identificar a vista. Nome do projeto identifica o conjunto na biblioteca e nos históricos.
5. Excluir tela exibida remove o desenho e abre outra tela. A última tela não pode ser excluída. Desfazer recupera a exclusão.
6. Salvar projeto ou Exportar JSON guarda todas as telas e configurações compartilhadas.

Em Operação, a seleção da tela permanece disponível. Trocar de vista mantém os comandos, a simulação automática, os alarmes, o lote e suas curvas. Navegar não cria uma alteração no histórico de edição nem marca o projeto como modificado. Para retomar depois de fechar o navegador, salve o projeto e aguarde Ponto de retomada salvo. A recuperação continua explícita e pausada, independentemente da tela escolhida ao reabrir.

Editar ou excluir uma tag atualiza os vínculos em todas as telas. Excluir uma tela não exclui as tags nem as regras compartilhadas. Duplicar um desenho representa os mesmos equipamentos e valores do processo.

## Formato e limites

- Até 16 telas, 100 objetos e 100 ligações por tela, com desenho de 1200 × 720.
- O arquivo completo continua limitado a 256 KiB. Esse limite pode ser atingido antes do limite de telas ou objetos.
- Os IDs e nomes de telas devem ser distintos. IDs de componentes e ligações precisam ser únicos dentro de sua tela.
- O JSON v2 mantém components e connections na raiz para a tela atual. screenId e screenName identificam essa tela e additionalScreens contém as demais, sem duplicar a tela atual.
- Os três campos de navegação são fornecidos juntos. Arquivos antigos sem esses campos continuam válidos e abrem com uma tela principal.
- A importação valida também as telas inativas e rejeita propriedades desconhecidas e vínculos inválidos.

Há uma regra de alimentação/descarga e um ciclo de forno por projeto. As telas são vistas desse processo compartilhado. Projetos com vários fornos independentes, navegação por botões desenhados no sinótico, permissões por tela e imagens de fundo permanecem previstos.

## Implementação

project.ts concentra validação, operações de telas, atualização global de vínculos e histórico. ScreenTools.tsx fornece os controles de navegação e edição. O editor continua renderizando os objetos da raiz, enquanto projectComponents consulta todas as telas para identificar o forno mesmo quando ele não aparece na vista atual.

switchProjectScreen preserva as referências das definições compartilhadas para evitar reinicializar observadores de tags e alarmes. operationFingerprint normaliza todas as telas por ID para que a recuperação não dependa da vista aberta. Projetos antigos mantêm sua identificação original. Os testes cobrem edição, importação, biblioteca, vínculos compartilhados, navegação durante a secagem e recuperação em outra vista.
