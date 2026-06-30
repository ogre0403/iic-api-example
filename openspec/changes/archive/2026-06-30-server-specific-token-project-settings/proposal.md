## Why

目前文件站右上角的 `Token` 與 `Project ID` 只有一組全域設定，會被自動套用到所有 Swagger 文件與 Try It 操作。當同一份或不同份 OpenAPI 文件定義了多個 `servers`，且各 server 對應不同的 token/project 組合時，使用者很容易把錯誤憑證送到錯誤環境，導致測試失敗或誤用環境。

## What Changes

- 將右上角的 Token/Project 設定改為依「目前文件中定義的 server」分別管理，而不是整站共用一組值。
- Try It 自動帶入 credential 時，改為根據目前選取的 server 套用對應的 token 與 project，而不是無差別套用同一組值。
- 擴充 `web/specs.json` 的內容，除了 spec 檔名與標籤外，也保存各 spec 內宣告的 server 資訊，作為前端初始化與切換 server 時的依據。
- 新增或擴充 Python 產生腳本，從 swagger YAML 自動抽取 spec 清單與 server 清單，在文件更新時同步更新 `web/specs.json`。
- 保留目前以 swagger YAML 為唯一來源的維護方式，避免手動維護 server 設定表。

## Capabilities

### New Capabilities
- `server-scoped-doc-credentials`: 文件站可針對每個 OpenAPI server 個別保存與套用 Token/Project 設定，並從 swagger 自動同步可用的 server 清單。

### Modified Capabilities
- None.

## Impact

- Affected code: `web/app.js`, `web/index.html`, `web/specs.json`, `build_standalone.py` 或新的 swagger metadata 產生 script，以及相關 `Makefile` 流程。
- Affected behavior: 文件站的右上角 credential UI、localStorage 結構、Try It 自動填值邏輯、spec metadata 載入流程。
- Affected inputs: `swagger/*.yaml` 的 `servers` 欄位會成為前端 credential 設定的來源之一。
