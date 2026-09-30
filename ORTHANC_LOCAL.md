# Integração local com Orthanc

Esta versão consulta o Orthanc pela API REST por meio de um serviço Node local. O navegador usa a mesma origem do serviço; não recebe as credenciais do Orthanc. A importação começa somente quando o usuário escolhe uma série de TC e clica em **Abrir TC no Explorer**.

## Preparar e iniciar

1. Inicie o Orthanc no computador, com sua API REST acessível em `http://127.0.0.1:8042`. É necessário Orthanc 1.11 ou superior para a [rota `/instances/{id}/numpy`](https://orthanc.uclouvain.be/book/users/rest.html#downloading-decoded-images-from-python).
2. Na pasta deste repositório, execute `npm ci` e `npm run build`.
3. Execute `npm run local` ou, no Windows, `INICIAR_CT_HEATMAP_EXPLORER.cmd`.
4. Abra `http://127.0.0.1:8080`, clique em **Atualizar do Orthanc**, selecione uma série CT e clique em **Abrir TC no Explorer**.

Mesmo sem exames de demonstração, o catálogo começa vazio e permite importar uma série do Orthanc. `npm run dev` atende apenas o frontend, sem a API local necessária ao botão de importação.

O serviço escuta somente em `127.0.0.1`. A URL padrão do Orthanc também aponta para `127.0.0.1`. Para outra configuração, use as variáveis de ambiente `ORTHANC_URL`, `ORTHANC_USER`, `ORTHANC_PASSWORD` e `EXPLORER_PORT`. Guarde credenciais apenas no ambiente local; não as coloque em arquivos versionados nem no frontend.

## Dados e geometria

O serviço lista séries CT com pelo menos dois cortes e consulta seus metadados. Para a série escolhida, exige dimensões, orientação e espaçamento consistentes, cortes regulares e uma grade ortogonal alinhada a RAS. Séries oblíquas, multiframe ou irregulares são recusadas. A conversão lê os pixels decodificados do Orthanc, preserva os valores físicos com slope/intercept, reorienta a grade e reduz a dimensão máxima para 160 voxels para visualização; spacing e affine são atualizados.

Cada TC convertida recebe manifesto e hash SHA-256. Séries já importadas são reutilizadas quando a identidade das instâncias não mudou. A importação não modifica o Orthanc, não executa modelos e não produz scores ou heatmaps. Para mostrar um mapa, importe separadamente TC e mapa registrados no mesmo espaço conforme o [contrato](docs/CONTRATO.md).

Os volumes importados ficam por padrão em `%LOCALAPPDATA%\PACS-InRad-Explorer`, nome de diretório preservado para encontrar importações locais anteriores. `EXPLORER_DATA_DIR` permite escolher outro diretório. Esses arquivos podem conter informações identificáveis, inclusive no título do caso; controle o acesso ao computador e ao backup. `public/data/`, `dist/` e o diretório local de volumes não são enviados ao GitHub.

## Verificar

```bash
npm test
npm run test:orthanc
```

O segundo comando sobe um Orthanc simulado com uma TC sintética, importa a série, confere geometria, volume, hashes e cache, e verifica que os dados são gravados fora do site. A conexão com um Orthanc real depende da instalação e das séries disponíveis nesse computador.

Esta integração não oferece autenticação para usuários do viewer, HTTPS ou trilha de auditoria clínica. Ela foi projetada para o próprio computador. Para acesso em rede ou uso clínico, seriam necessários controles adicionais antes de expor o serviço.
