# CT Heatmap Explorer

Explorador web de tomografias com heatmaps 2D e 3D e importação manual de séries de TC do Orthanc local. React, TypeScript, Vite e vtk.js, com renderizador CPU/Web Worker quando WebGL 2 não está disponível.

Este repositório contém **somente código, testes e documentação**. Exames, heatmaps, scores, capturas e pesos de modelos não são distribuídos. Ele é independente do [DICOM AI Proxy](https://github.com/YujiKF/dicom-ai-proxy).

## Funcionalidades

- Três cortes 2D sincronizados, crosshair e centralização individual por plano.
- Janela de TC, controle da sobreposição e seleção do mapa de atribuição.
- Volume 3D com presets de pulmão, tecidos moles e ossos; corte interativo sincronizado ao 2D.
- Tema claro e fundo grafite no painel 3D.
- Separação de casos completos e casos contendo somente resultados.
- Importadores, validação de integridade e contrato para TC e heatmap na mesma grade.
- Conexão local com Orthanc: listagem de séries CT, seleção manual e conversão validada de uma série para o contrato do viewer.

O aplicativo não executa o modelo nem modifica seus scores ou thresholds. Os nomes Axial, Coronal e Sagital são aliases de navegação quando a geometria física não foi confirmada; não certificam orientação anatômica.

## Executar localmente

Requer Node.js 22 ou superior e npm. O repositório é privado e requer acesso. Para importar do PACS local, use Orthanc 1.11 ou superior com a API REST disponível em `127.0.0.1:8042`.

```bash
git clone https://github.com/YujiKF/ct-heatmap-explorer.git
cd ct-heatmap-explorer
npm ci
npm run build
npm run local
```

Abra **http://127.0.0.1:8080**. Clique em **Atualizar do Orthanc**, escolha uma série de TC e clique em **Abrir TC no Explorer**. O serviço Node atende somente em `127.0.0.1` e guarda volumes importados fora do repositório. Consulte [ORTHANC_LOCAL.md](ORTHANC_LOCAL.md) para configuração, portas, dados locais e limites.

Para usar mapas de atribuição existentes, forneça localmente um catálogo e os casos autorizados em `public/data/`. Essa pasta é ignorada pelo Git. É possível copiar uma exportação local compatível ou usar os importadores:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/export_case.py --ct /caminho/local/tc.nii.gz --case-id caso_local --heatmap-version versao_local --out public/data
```

Para adicionar um mapa NIfTI já registrado na TC, informe também `--heatmap INDICE_DA_CLASSE=/caminho/local/mapa.nii.gz`. O contrato e as limitações do importador estão em [docs/CONTRATO.md](docs/CONTRATO.md).

`npm run dev` inicia apenas o frontend Vite em **http://localhost:4173**; os botões do Orthanc dependem de `npm run local` e do build. Mesmo sem catálogo de demonstração, o serviço local mostra a tela inicial e permite importar uma TC do Orthanc. Essa importação não executa a IA e não cria scores ou heatmaps.

## Build

`npm run build` gera `dist/`. Com dados em `public/data/`, o build os copia para `dist/data/`: portanto, não publique esse diretório nem um ZIP completo sem verificar a autorização de redistribuição. `dist/` também é ignorado pelo Git. Para a integração Orthanc, sirva o build com `npm run local`, pois ele também fornece a API local.

## Testes

```bash
npm test
npm run test:orthanc
python -m unittest discover -s tests -p "test_*.py"
```

`npm test` executa os testes sintéticos de geometria e contraste e os testes da conversão Orthanc. Se as cinco fixtures originais estiverem disponíveis localmente em `public/data/`, executa também seis testes de integração com esses dados; na cópia do GitHub eles aparecem como *skip*. `npm run test:orthanc` exige `npm run build` e testa o serviço com um Orthanc simulado e uma TC sintética. Nenhum exame real é enviado ao teste. Consulte [ALTERACOES_V2.md](ALTERACOES_V2.md) para os resultados.

## Dados e redistribuição

Os [termos oficiais do CT-RATE](https://huggingface.co/datasets/ibrahimhamamci/CT-RATE#terms-and-conditions-for-using-the-ct-rate-dataset), consultados em 29/09/2026, proíbem no item 5 a redistribuição do dataset ou de partes dele e exigem privacidade e confidencialidade para dados derivados. Embora a página também anuncie CC-BY-NC-SA 4.0, esta publicação não presume autorização para redistribuir exames ou resultados. Obtenha dados na fonte oficial e observe os termos aplicáveis.

O esquema mantém os identificadores de contrato legados `pacs-inrad-viewer/1.0` e `pacs-inrad-catalog/1.0` para compatibilidade com os importadores existentes.

## Documentação

- [Contrato dos dados](docs/CONTRATO.md)
- [Limitações](docs/LIMITACOES.md)
- [Integração local com Orthanc](ORTHANC_LOCAL.md)
- [Resumo técnico da auditoria](AUDITORIA_COMPARATIVA.md)
- [Histórico de alterações](ALTERACOES_V2.md)

A [release v2.2.0](https://github.com/YujiKF/ct-heatmap-explorer/releases/tag/v2.2.0) disponibiliza apenas o código-fonte com a integração local ao Orthanc. O pacote local completo com exames não foi enviado ao GitHub.
