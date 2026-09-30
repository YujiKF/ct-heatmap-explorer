# CT Heatmap Explorer

Explorador web de tomografias com heatmaps 2D e 3D. React, TypeScript, Vite e vtk.js, com renderizador CPU/Web Worker quando WebGL 2 não está disponível.

Este repositório contém **somente código, testes e documentação**. Exames, heatmaps, scores, capturas e pesos de modelos não são distribuídos. Ele é independente do [DICOM AI Proxy](https://github.com/YujiKF/dicom-ai-proxy).

## Funcionalidades

- Três cortes 2D sincronizados, crosshair e centralização individual por plano.
- Janela de TC, controle da sobreposição e seleção do mapa de atribuição.
- Volume 3D com presets de pulmão, tecidos moles e ossos; corte interativo sincronizado ao 2D.
- Tema claro e fundo grafite no painel 3D.
- Separação de casos completos e casos contendo somente resultados.
- Importadores, validação de integridade e contrato para TC e heatmap na mesma grade.

O aplicativo não executa o modelo nem modifica seus scores ou thresholds. Os nomes Axial, Coronal e Sagital são aliases de navegação quando a geometria física não foi confirmada; não certificam orientação anatômica.

## Executar localmente

Requer Node.js 22 ou superior e npm. O repositório é privado e requer acesso.

```bash
git clone https://github.com/YujiKF/ct-heatmap-explorer.git
cd ct-heatmap-explorer
npm ci
```

Antes de abrir exames, forneça um catálogo e os casos autorizados em `public/data/`. Essa pasta é ignorada pelo Git. É possível copiar uma exportação local compatível ou usar os importadores:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/export_case.py --ct /caminho/local/tc.nii.gz --case-id caso_local --heatmap-version versao_local --out public/data
```

Para adicionar um mapa NIfTI já registrado na TC, informe também `--heatmap INDICE_DA_CLASSE=/caminho/local/mapa.nii.gz`. O contrato e as limitações do importador estão em [docs/CONTRATO.md](docs/CONTRATO.md).

```bash
npm run dev
```

Abra **http://localhost:4173**. Sem o catálogo local, o aplicativo não terá exames para carregar.

## Build

```bash
npm run build
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Abra **http://localhost:8080**. O build copia os dados locais de `public/data/` para `dist/data/`: portanto, não publique esse diretório nem um ZIP completo sem verificar a autorização de redistribuição. `dist/` também é ignorado pelo Git.

## Testes

```bash
python -m unittest discover -s tests -p "test_*.py"
```

Os testes TypeScript originais combinam geometria sintética, contraste, sincronização e integração com os cinco casos da validação local. Para executar `npm test`, restaure localmente as fixtures originais em `public/data/`; elas não acompanham este repositório. Os resultados históricos estão em [ALTERACOES_V2.md](ALTERACOES_V2.md), sem exames ou capturas anexos.

## Dados e redistribuição

Os [termos oficiais do CT-RATE](https://huggingface.co/datasets/ibrahimhamamci/CT-RATE#terms-and-conditions-for-using-the-ct-rate-dataset), consultados em 29/09/2026, proíbem no item 5 a redistribuição do dataset ou de partes dele e exigem privacidade e confidencialidade para dados derivados. Embora a página também anuncie CC-BY-NC-SA 4.0, esta publicação não presume autorização para redistribuir exames ou resultados. Obtenha dados na fonte oficial e observe os termos aplicáveis.

O esquema mantém os identificadores de contrato legados `pacs-inrad-viewer/1.0` e `pacs-inrad-catalog/1.0` para compatibilidade com os importadores existentes.

## Documentação

- [Contrato dos dados](docs/CONTRATO.md)
- [Limitações](docs/LIMITACOES.md)
- [Resumo técnico da auditoria](AUDITORIA_COMPARATIVA.md)
- [Histórico de alterações](ALTERACOES_V2.md)

A [release v2.1.1](https://github.com/YujiKF/ct-heatmap-explorer/releases/tag/v2.1.1) disponibiliza apenas o código-fonte. O pacote local completo com exames não foi enviado ao GitHub.
