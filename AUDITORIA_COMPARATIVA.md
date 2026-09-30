# Auditoria técnica do visualizador

Este resumo acompanha a publicação de código-fonte. Volumes, mapas, resultados por caso, capturas e relatórios derivados de exames permanecem exclusivamente no ambiente local.

Na validação local da versão 2, os arrays de quatro TCs e 24 mapas foram comparados aos visualizadores de origem. A transposição entre armazenamento XYZ em ordem C e X mais rápido preservou os valores voxel a voxel. Três cortes 2D de uma mesma posição também foram comparados por pixels, sem diferenças após retirar o crosshair da referência.

Os arquivos legados não continham affine, spacing ou orientação suficientes para certificar planos anatômicos ou proporções físicas. A renderização permanece em índices quando esses metadados estão ausentes. Os nomes usuais de planos são aliases da grade, acompanhados de aviso na interface.

TC e heatmap compartilham a transformação de índice. Geometria sintética assimétrica cobre ordem dos eixos, reflexão e rotação. O corte 3D compartilha a coordenada do crosshair 2D.

A versão 2.1.1 ajustou exclusivamente o contraste do fundo e dos textos do painel 3D. Os valores e políticas do modelo não foram alterados.

Para reproduzir as verificações de integração, é necessário fornecer localmente as fixtures originais, obtidas com autorização. O repositório não redistribui essas fixtures.
