# Alterações do Explorer v2

## Ajuste visual 2.1.1

- O fundo do painel 3D passou de azul acinzentado para grafite (#102334),
  melhorando o contraste com a TC e o mapa translúcidos. vtk.js e o renderizador
  CPU usam a mesma cor; os textos e indicadores sobre o painel foram clareados.
  Presets, opacidades, dados e interações foram mantidos.
- Build, 11 testes automatizados e verificação no navegador dos modos GPU e CPU
  concluídos sem erros de página.

## Interface e exploração

- Mantidos React, TypeScript, Vite, vtk.js, renderizador CPU, importadores e o
  contrato `pacs-inrad-viewer/1.0`.
- Cortes 2D ampliados e colocados antes do 3D. O 3D também foi ampliado, pode ser
  ocultado e oferece corte por Axial/Coronal/Sagital (eixos K/J/I), índice e lado mantido.
- Cada painel 2D ganhou um botão para centralizar seu crosshair no próprio plano,
  preservando o índice do corte selecionado.
- Movimento do corte 3D e crosshair 2D compartilha o mesmo estado I/J/K. vtk.js
  aplica um plano de clipping; o worker CPU exclui amostras do mesmo semiespaço.
- Os títulos usuais Axial, Coronal e Sagital são exibidos como aliases da grade
  IJ/IK/JK. Os casos legados continuam em voxels, com aviso de orientação física
  desconhecida e bordas em I/J/K; nomes não constituem validação anatômica.
- Interface em tema claro com painéis, controles e menus de alto contraste.
- Casos com TC/mapas e casos somente com resultados foram agrupados em separado
  no menu. Controles de imagem ficam ocultos quando não há TC.
- Dropdowns, opções e grupos receberam fundo branco e texto escuro explícitos.
  O foco de teclado foi realçado.
- Presets 3D para pulmão, tecidos moles e ossos usam pontos de transferência
  comuns a vtk.js e CPU. Ossos são atenuados no preset inicial de pulmão.

## Geometria e dados

- Coordenadas físicas, quando válidas, agora são calculadas diretamente pelo
  affine. Grades antigas sem metadados permanecem em índices.
- O contrato atual já aceita uma grade RAS ortogonal com affine e spacing reais;
  o exportador verifica shape e affine de TC/mapa e os reorienta em conjunto.
  A chegada das saídas v3 exige associação de caso, procedência e testes de
  geometria; grades oblíquas ou sem registro continuam recusadas.
- Scores, thresholds, decisões, arrays importados, modelos e notebooks foram
  preservados. Não foi feita inferência, retreinamento ou ajuste de limiares.

## Testes executados

| Verificação | Resultado |
|---|---|
| `npm test` | 11/11; 5 manifestos, 32 assets/hash, scores e thresholds, eixos/espelho/rotação, clipping, centralização individual e contraste |
| `python -m unittest discover -s tests -p "test_*.py"` | 5/5; exportação RAS, affine, registro TC/mapa, rejeições e versões |
| `npm run build` | Concluído; `dist/` gerado |
| Comparação local de pixels de um caso e mapa | 3/3 cortes iguais ao HTML antigo, diferença máxima 0 |
| Navegador Edge/Chromium, vtk.js | Tema claro, dropdown, crosshair, centralização individual, 3D cortado em dois lados, presets, caso só com resultados e 390 px verificados; 0 erros de página |
| Navegador Edge/Chromium, CPU forçado | Corte K alterou a imagem 3D e a posição I/J/K; 0 erros de página |

O build ainda emite aviso de tamanho do chunk vtk.js (carregado separadamente).
Não foi medida taxa de quadros nem validada orientação anatômica dos casos antigos.
Relatórios com dados de exames e capturas foram mantidos apenas no ambiente local. Não acompanham esta publicação de código-fonte.
