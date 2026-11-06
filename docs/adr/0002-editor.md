# ADR 0002 — editor de telas e persistência de arquivos

Status: implementado na versão 0.2.0.

Fabric.js 7.4.0 fornece seleção e transformação de objetos. A dependência é fixada no lockfile e carregada em um módulo separado ao abrir o editor. O backend e o contrato de tags permanecem compatíveis com 0.1.0.

O documento HMI é a fonte da geometria, ordem e vínculos. Objetos Fabric são uma representação desse documento. Valores recebidos do servidor atualizam somente a representação em Operação; não entram no histórico nem no arquivo exportado.

Foi escolhido um formato JSON próprio, com versão e validação estrita, em vez de importar cenas nativas da biblioteca. Isso mantém o contrato pequeno, revisável e independente de mecanismos de construção de classes ou carregamento de URLs.

Neste incremento, persistência significa exportação de arquivo local. Não há gravação automática no servidor. Navegação interna preserva o documento em memória; recarregar exige abrir um JSON exportado.

Grupos, imagens/SVG, expressões e plugins estão fora desse contrato. Serão incluídos somente com requisitos e validações específicos.

Referência: https://fabricjs.com/docs/getting-started/installing/
