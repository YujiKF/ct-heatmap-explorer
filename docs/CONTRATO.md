# Contrato de dados 1.0

`schema_version: "pacs-inrad-viewer/1.0"`. Catálogo em `public/data/catalog.json`:
`schema_version: "pacs-inrad-catalog/1.0"`, `cases[]` com `case_id`, `title`,
`manifest` relativo ao catálogo, `map_count`, `has_ct`.

## Manifesto

| Campo | Conteúdo |
|---|---|
| `case_id`, `title`, `dataset` | Identidade do exame e origem |
| `grid` | Grade compartilhada por TC, mapas e máscara; `null` para resultados sem volume |
| `ct` | Descritor do volume em HU, ou `null` |
| `body_mask` | Descritor de máscara binária opcional, com método registrado |
| `classes[]` | ID estável, nomes, score, logit, threshold, comparador, decisão e versões |
| `provenance` | Hashes, arquivos de origem, transformações, política e metadados livres |
| `notices[]` | Limitações específicas do exame, exibidas no viewer |

Os manifestos e os dados de cada caso são fornecidos localmente pelo usuário. Valores
ausentes são `null`, nunca zero. Não derive logits de scores nem aplique um threshold
de outro experimento para preencher campos ausentes.

## Grade

Dimensões na ordem `[X,Y,Z]`. O índice linear é **x + X × (y + Y × z)**; X varia
mais rapidamente. Centros de voxel têm índices inteiros, iniciando em zero.

- `space: "index"`: `spacing`, `origin`, `affine`, `orientation` são `null`;
  `geometry_verified: false`. Renderização em unidades de voxel, sem rótulos R/L/A/P.
- `space: "RAS"`: grade ortogonal e alinhada aos eixos. `spacing` positivo em mm,
  `origin` em mm, `orientation: ["R","A","S"]`, affine 4×4 consistente com a
  diagonal spacing e a coluna origin, `geometry_verified: true`.

`p_RAS = affine × [x,y,z,1]`. Affine é uma matriz por linhas em JSON. Grades oblíquas
ou cisalhadas não são aceitas nesta versão. O affine nativo pode ser preservado em
`provenance.source_affine` depois de uma reformatação explícita.

Os nomes axial/coronal/sagital só são anatomicamente confirmados no modo RAS.
Nos casos antigos significam respectivamente XY/XZ/YZ da grade recebida.
A visualização 2D usa X crescente para a direita e K crescente para cima nos planos
longitudinais. Em RAS, as bordas são rotuladas de acordo com essa convenção
neurológica; não se presume convenção radiológica.

## Descritor de array

| Campo | Regra |
|---|---|
| `url` | Caminho relativo ao manifesto, na mesma origem; sem `..` |
| `dtype` | `int16`, `uint8` ou `float32`, sempre little-endian |
| `encoding` | `gzip` ou `raw` |
| `order` | Sempre `x-fastest` |
| `byte_length` | Tamanho descomprimido, exatamente voxels × bytes por valor |
| `sha256` | SHA-256 dos bytes descomprimidos |
| `compressed_sha256` | Opcional, SHA-256 do arquivo empacotado |
| `scale`, `offset` | `valor_físico = armazenado × scale + offset` |

Use extensão `.gz.bin` para evitar que servidores interpretem `.gz` como compressão
de transporte HTTP. O loader também aceita a descompressão HTTP já feita, desde
que tamanho e SHA-256 dos bytes finais coincidam. Arrays não finitos são recusados.
O navegador valida o hash descomprimido; o verificador Python também valida o
hash compactado dos dados importados.

O limite desta implementação é 256³ voxels por grade, com dimensões individuais
até 1024. Isso é um limite técnico de exibição, não uma recomendação científica.
TC e cada heatmap precisam ter exatamente a mesma grade; não há registro implícito.

## Classes e versões

IDs do projeto CT-LiPro são strings de `"0"` a `"17"`, na ordem original. Nomes
humanos podem mudar sem alterar o ID. `score`, `logit` e `threshold` podem ser null.
`comparator` aceita `>=` ou `>`. `decision` null significa sem decisão fornecida;
quando não null precisa coincidir com a comparação. `threshold_status` e
`interpretation` preservam as limitações da política original.

Cada `classes[].heatmaps[]` contém:

- `version`: identificador único dentro da classe;
- `method` e `normalization`: explicações fornecidas pelo produtor;
- `data`: descritor do array;
- `display_range: [0, máximo]`: escala fixa e declarada de atribuição positiva.

O viewer usa `valor / máximo` para a cor e o threshold visual 0–1. Não calcula um
novo máximo com base no caso. Nos dados antigos, uint8 tem `scale=1/255` e
`display_range=[0,1]`. Mapas assinados precisam de uma extensão futura do contrato
e uma escala divergente explícita; não devem ser silenciosamente truncados.

A v1 não fornece máscara separada de cobertura ou comparação simultânea de versões.
Metadados adicionais podem ser preservados em `provenance`. Uma mudança de semântica
de eixo, units, normalização ou tipos deve aumentar a versão do contrato.

## Preparação para as saídas v3

O exportador já recebe TC NIfTI, mapas na **mesma grade nativa**, resultados
associados ao mesmo `case_id`, affine e spacing reais. Verifica affine e shape de
cada mapa contra a TC antes de escrever. Reorienta TC e mapas em conjunto para RAS
e preserva os metadados de origem em `provenance`. A grade entregue só recebe
`geometry_verified: true` após a verificação da transformação, com affine RAS
ortogonal e alinhado aos eixos. Casos oblíquos exigem reformatação explícita e
conjunta antes da exportação.

Quando a execução v3 estiver disponível, seu identificador de versão de heatmap,
método, normalização, arquivos de origem e hashes devem ser declarados no manifesto.
O viewer não infere spacing, orientação, cobertura ou registro a partir de mapas
isolados. Se a saída v3 mudar semântica ou exigir grade oblíqua, o contrato deverá
receber uma nova versão após teste de geometria; `pacs-inrad-viewer/1.0` não a aceita.
