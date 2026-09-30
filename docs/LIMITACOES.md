# Limitações e próximos passos

## Limitações desta entrega

1. Os quatro casos legados da validação local têm geometria física desconhecida e
   volumes já reduzidos pelo viewer anterior. Eles não acompanham este repositório.
   Proporções em voxel podem diferir da anatomia física; não há medidas clínicas
   nem orientação R/L confirmada nesses casos.
2. Scores/thresholds desses quatro casos não vieram nos HTMLs. O quinto caso local
   tem resultados, mas não TC. Ausência é explícita; dados não foram cruzados.
   A TC importada do Orthanc também não recebe resultados de IA automaticamente.
3. O caminho vtk.js foi validado no Edge/Chromium com WebGL 2 e o fallback CPU
   foi forçado e testado no mesmo navegador. Ambos mudaram de imagem ao aplicar
   o corte 3D. Não foi demonstrada equivalência pixel a pixel entre eles nem
   medida a performance em outras GPUs e navegadores.
4. CPU usa resolução de imagem reduzida durante interação e refinamento posterior.
   A latência depende da máquina, volume e tamanho de tela; não há garantia de FPS.
   Sua LUT de transferência usa aproximações discretas para cor/opacidade.
5. A máscara corporal é aproximada (HU > −500, closing, maior componente por corte
   XY e preenchimento de cavidades). Pode falhar no pescoço, contato com mesa,
   estruturas periféricas e exames cortados. Raw é sempre o padrão.
6. O contrato aceita atribuição positiva e grades de índice ou RAS ortogonal.
   Não suporta diretamente mapas assinados, volumes oblíquos/shear, DICOM bruto no navegador,
   máscaras de cobertura, segmentação, medições ou reconstrução oblíqua 2D.
7. A extensão local importa séries CT do Orthanc por REST, com seleção manual e
   conversão no serviço Node. Não há DICOMweb direto no navegador, persistência de
   sessões, lista de usuários, trilha de auditoria clínica ou inferência no servidor.
8. O frontend limita grades a 256³ voxels; não há streaming multirresolução.
   Memória inclui TC float32, até dois mapas em cache e cópias do renderizador.
9. As cores dos mapas são relativas à normalização upstream e não são comparáveis
   entre classes. Interpolação não aumenta a precisão espacial original 24³.
10. Esta entrega melhora exploração visual. Não valida eficácia clínica, localização
    de lesões, ausência de viés, sensibilidade/especificidade ou uso em pacientes.

## Para tornar a ferramenta mais robusta

| Prioridade | Trabalho | Critério de conclusão |
|---|---|---|
| 1 | Exportar TC, affine, spacing, mapa restaurado, cobertura e resultados da MESMA execução | Associação verificável por case ID e hashes; phantom e landmarks conferidos |
| 2 | Testar GPU e navegadores | Matriz Chrome/Edge/Firefox + GPUs, perdas de contexto, memória e FPS mensurados |
| 3 | Consolidar registro e orientação | Testes com volumes assimétricos, inversões, anisotropia e reformatação oblíqua explícita |
| 4 | Fortalecer renderer e ingestão | Limites de descompressão, carregamento em worker, cancelamento, cache e níveis de resolução |
| 5 | Evoluir atribuição independentemente | Fidelidade/estabilidade/controles negativos avaliados; versões e normalização rastreáveis |
| 6 | Validar externamente o modelo | Coorte sem sobreposição de treino, referência revisada e thresholds congelados |
| 7 | Integrar ao ambiente real | DICOMweb, autenticação institucional, autorização, auditoria e fluxo clínico definido |

A primeira prioridade pode ser implementada no fim do notebook existente: exportar
dados e procedência, sem retreinar, alterar logits, scores ou thresholds. Mudanças
futuras no algoritmo de heatmap chegam como nova versão do mesmo contrato.
