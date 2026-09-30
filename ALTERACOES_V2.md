# Alterações do Explorer v2

## 2.2.0 · Orthanc local

- O serviço Node em `127.0.0.1` lista séries CT do Orthanc via REST e importa manualmente uma série escolhida. Valida dimensões, orientação e espaçamento, recusa séries oblíquas ou irregulares, reorienta para RAS e grava volume e manifesto fora do repositório.
- A aplicação abre com catálogo vazio e oferece o botão **Atualizar do Orthanc**. A TC importada exibe cortes 2D/3D sem criar score nem heatmap. O nome da interface e do repositório passou a **CT Heatmap Explorer**; os identificadores do contrato continuam legados por compatibilidade.
- A importação deixa de depender do manifesto de um caso de demonstração. No repositório, exames e resultados permanecem ausentes; seis testes dependentes dessas fixtures são marcados como *skip*.
- Verificação da cópia sem dados: `npm test` (5 testes sintéticos e 3 testes Orthanc aprovados; 6 de integração com exames em *skip*), `npm run build` e `npm run test:orthanc` (1 teste de importação ponta a ponta aprovado). A interface sem exames foi conferida no navegador.


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
