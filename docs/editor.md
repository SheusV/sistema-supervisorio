# Editor de telas — contrato v1

O editor usa Fabric.js 7.4.0 para seleção e transformação, mas o arquivo salvo é um modelo de domínio próprio. Não se importa JSON nativo do Fabric nem se executam classes indicadas pelo arquivo.

## Modelo

- `schemaVersion`: 1.
- `name`: nome de 1 a 80 caracteres.
- `screen`: largura 1200 e altura 720.
- `components`: até 100 componentes, na ordem de fundo para frente.

Cada componente contém exatamente: `id`, `kind`, `label`, `x`, `y`, `width`, `height`, `angle` e `binding`.

| Campo | Regra |
| --- | --- |
| id | Único, até 80 caracteres alfanuméricos, hífen ou sublinhado |
| kind | tank, pump, indicator ou text |
| label | 1–64 caracteres; renderizado como texto, sem HTML |
| x / y | 0–1160 / 0–688 pixels |
| width / height | 40–500 / 32–500 pixels |
| angle | −180 a 180 graus |
| binding | Tag compatível ou null |

Componentes rotacionados ou próximos das bordas podem ultrapassar os limites visuais da tela e serão recortados pelo canvas. O painel permite reposicioná-los. Coordenadas e dimensões são finitas; valores fora dos limites são rejeitados.

Tanques vinculam `TQ001.LEVEL`; bombas vinculam `P001.RUNNING`; indicadores vinculam nível ou temperatura; textos não possuem vínculo. Novas tags e tipos exigem ampliação explícita do contrato.

## Segurança da importação

Limite de arquivo: 256 KiB, validado antes da leitura e novamente no parser. O parser rejeita campos inesperados, tipos não suportados, IDs repetidos, números inválidos e vínculos incompatíveis. Não há URLs, imagens, scripts, expressões livres, eval, importação SVG ou desserialização arbitrária. Objetos Fabric são construídos exclusivamente pelo código da aplicação.

O projeto é validado por completo antes da substituição da tela. Falhas mantêm a tela atual. Abrir um projeto válido é uma ação reversível pelo histórico. Os valores das tags e credenciais não são exportados.

## Edição e operação

Edição usa valores ilustrativos e mantém seleção, arraste, redimensionamento e rotação. Ajustar à grade arredonda a posição para múltiplos de 20 px; dimensões exatas podem ser informadas no painel. A ordem dos componentes determina a sobreposição.

Operação mantém a geometria e bloqueia seleção/alteração. Somente dados GOOD de uma conexão ativa são apresentados. Sem vínculo, com qualidade ruim ou com desconexão, aparece indisponibilidade. Receber uma medição não altera o documento nem seu histórico.

O histórico guarda até 60 revisões; uma nova alteração após desfazer limpa o caminho de refazer. O estado permanece durante a navegação interna. Exportação JSON é necessária para recuperação após recarga. O aviso de saída depende do comportamento do navegador e não substitui a exportação.

## Limites deste incremento

Uma tela por projeto, quatro tipos de componente, sem grupos permanentes, importação de imagens ou servidor de projetos. A edição não grava tags nem substitui automaticamente o sinótico fixo de Supervisão.

## Seleção múltipla — 0.3.0

Shift + clique acrescenta ou remove objetos da seleção. Na lista, Ctrl/Cmd + clique também funciona. Arraste uma área vazia para selecionar objetos, ou use Selecionar todos e Limpar seleção no painel. A seleção é temporária e não altera o contrato JSON v1.

Arrastar uma seleção múltipla mantém distâncias, tamanhos, rotações e vínculos. A grade arredonda o deslocamento conjunto para múltiplos de 20 px; os limites de posição restringem o deslocamento do conjunto sem separar seus objetos. Redimensionamento e rotação são individuais.

Alinhamento usa as bordas ou centros do retângulo envolvente da seleção, considerando a rotação de cada componente. Distribuição exige três objetos, mantém os extremos e iguala os espaços entre as caixas. Se não houver espaço ou uma posição exceder o contrato, a ação é recusada sem alterar o documento. Não se aplica arredondamento à grade ao alinhar ou distribuir; posições podem conter até três casas decimais.

Alinhamento, distribuição, movimento e exclusão conjunta geram uma revisão por ação. Desfazer recupera todos os componentes afetados. Modo Operação desativa seleção e comandos de edição.

Referência da biblioteca: https://fabricjs.com/docs/getting-started/installing/
