## Context

目前文件站的 credential 模型是全域單例：

- `web/app.js` 只維護一組 `token` / `projectId`
- localStorage key 固定為 `iic_cred_token` 與 `iic_cred_project_id`
- Try It 欄位每次 render、切換 spec、切換 operation 時，都會把同一組值重新注入

這個做法在單一環境時可行，但當 OpenAPI 文件內定義多個 `servers` 時，使用者即使已在 Try It 選了不同 server，右上角仍只有一組共用 credential，導致錯誤的 token/project 被帶到新的環境。另一方面，`web/specs.json` 與 standalone build 目前只保存 `{ file, label }`，前端沒有可用的 server metadata 來建立 per-server 設定。

此變更會同時觸及：

- `web/app.js` 的狀態模型、UI 與 Try It 自動填值邏輯
- `web/index.html` 的右上角設定區
- `web/specs.json` 的 schema
- 由 `swagger/*.yaml` 產生 metadata 的 Python 流程
- standalone build 對 `window.__SPECS_LIST__` 的注入格式

## Goals / Non-Goals

**Goals:**

- 讓每份 spec 的每個 server 都有獨立的 token/project 設定
- 讓 Try It 自動填值永遠跟隨目前實際選取的 server
- 將 server 清單從 swagger YAML 自動同步到 `web/specs.json`
- 讓 nginx 模式與 standalone 模式共用同一份 metadata 結構
- 保留既有未宣告 `servers` 的 spec 可用性，不因這次改動而失效

**Non-Goals:**

- 不修改 swagger 文件本身的 `servers` 定義格式
- 不改變 Stoplight Elements 的 request/response 呈現方式
- 不嘗試跨不同 spec 自動合併看似相同的 server credential
- 不把舊的全域 credential 無條件複製到所有 server 設定中

## Decisions

### 1. 擴充 `specs.json` 為 spec + servers metadata，而不是只存 tab 清單

`web/specs.json` 與 standalone 注入的 `window.__SPECS_LIST__` 都改為輸出完整 metadata：

```json
[
  {
    "file": "iam.yaml",
    "label": "IAM",
    "servers": [
      {
        "id": "ai-cloud--https-api-central-iic-nchc-org-tw-iam-api-v1",
        "label": "AI-Cloud",
        "url": "https://api.central.iic.nchc.org.tw/iam/api/v1"
      }
    ]
  }
]
```

`id` 由 Python 腳本根據 server 的 `description + exact url` 穩定產生，避免只靠 label 或正規化 URL 造成碰撞。選這種做法是因為現有 swagger 內已有僅以尾端 `/` 或 description 區分的 server；若只依 URL 或只依 description 存 key，會錯把不同 server 視為同一個。替代方案是前端即時解析 YAML，但那會讓瀏覽器端承擔解析成本，也讓 nginx 與 standalone 需要各自維護一套邏輯，因此不採用。

### 2. Credential 以 `spec file + server id` 為作用域持久化

前端改用新的結構化 localStorage 模型，例如：

- `iic_doc_credentials_v2`: `{ [specFile]: { [serverId]: { token, projectId } } }`
- `iic_active_server_v1`: `{ [specFile]: serverId }`

右上角的 Token/Project 輸入框永遠編輯「目前 active spec + active server」這個作用域。選這種 keying 的理由是它完全對齊 `specs.json` 提供的資料模型，也避免跨 spec 自動共用 credential 時產生不可預期的污染。替代方案是只按 server label 或 URL 存值，但同名不同 URL、或同 URL 不同用途時都可能導致誤用。

對於未宣告 `servers` 的 spec，前端保留 per-spec fallback context，讓這些文件仍可維持單組 credential，而不必在 `specs.json` 內造出不存在於 swagger 的假 server。

### 3. active server 由前端顯式管理，並與 Stoplight server selector 雙向同步

右上角新增 `Server` selector，選項來自目前 spec 的 `servers` metadata。前端以此 selector 作為 credential context 的主要來源，並同步處理兩個方向：

- 使用者切換右上角 selector 時，更新 active server、切換顯示中的 token/project，並重新套用到目前可見的 Try It 欄位
- 使用者若直接在 Stoplight 的 Try It server 控制項切換環境，前端用 `MutationObserver` / DOM event 監聽該變化，反向更新右上角 selector 與 credential context

選擇雙向同步，而不是只做右上角 selector 或只做 DOM 偵測，理由是右上角設定區必須清楚顯示現在正在編輯哪個 server，但也不能容許 Stoplight 內部 server 選擇與 topbar 狀態分離。

### 4. Try It 注入邏輯改為 server-aware，且在空值時明確清除欄位

現有 `applyCredentialsToTryIt()` 只根據全域 credential 進行覆寫。變更後它會先解析目前的 credential context，再只注入當前 server 的 token/project；若該 server 未設定某欄位，則清空對應 Try It 欄位，而不是保留上一個 server 的值。這是避免「切 server 但殘留舊 credential」的核心保障。

### 5. 沿用現有 Python build 流程，但抽出可重用的 metadata 生成函式

目前 `build_standalone.py` 已負責掃描 `swagger/*.yaml` 並輸出簡化版 `web/specs.json`。本次不另外引入新的建置系統，而是在現有 Python 腳本中抽出或新增一個明確的 metadata generation 路徑，負責：

- 掃描 swagger 檔案
- 解析每份文件的 `servers`
- 輸出新的 `web/specs.json`
- 回傳相同資料給 standalone build 的 `window.__SPECS_LIST__`

這樣可以保留目前 `make specs` / `make standalone` 的進入點，同時避免前端 hardcode server 清單。替代方案是另開第二支 script，但那會讓 spec 列表與 standalone 內嵌 metadata 變成兩個可能分歧的來源。

### 6. 舊版全域 credential 採相容讀取，不做自動大量遷移

前端保留對 `iic_cred_token` 與 `iic_cred_project_id` 的唯讀 fallback：若 v2 storage 尚未有對應 context 的資料，可先顯示舊值；一旦使用者在新 UI 內保存該 context，之後只讀 v2。這比自動把舊值複製到所有 server 更安全，因為舊資料無法推斷原本屬於哪個 server。

## Risks / Trade-offs

- [Stoplight 的 server selector DOM 結構可能變動] → 將 selector 尋址集中在一處 helper，並以 metadata label/url 比對而非依賴脆弱的單一 CSS selector。
- [某些 spec 沒有 `servers`] → 保留 per-spec fallback context，避免這些文件失去自動填值能力。
- [舊 localStorage 與新結構並存增加邏輯分支] → 僅保留「讀舊寫新」的過渡邏輯，不再寫回舊 key，降低長期複雜度。
- [重新生成 `elements-api` 或切換 operation 時可能打斷同步] → 在既有 `switchApi()`、hash restore、viewer observer 之後統一重新套用 active server 與 credentials。
- [swagger 更新後 server id 改變，舊資料可能成為 orphan] → 以穩定規則產生 `serverId`，並在找不到已保存 server 時自動回退到當前第一個有效 server。

## Migration Plan

1. 先擴充 Python metadata 生成流程，讓 `web/specs.json` 與 standalone metadata 都帶有 `servers`。
2. 更新前端 spec loading 與 topbar UI，使其能識別 active spec 的 server 清單。
3. 將 credential persistence 改為 v2 結構，並保留舊 key 的唯讀 fallback。
4. 導入 Stoplight server selector 同步與新的 Try It injection 邏輯。
5. 驗證 nginx 模式與 standalone 模式在切 spec、切 server、刷新頁面後的行為一致。
6. 若需 rollback，只要回退前端與 build script 變更即可；舊的 global localStorage key 未被破壞，舊版前端仍可繼續使用。

## Open Questions

- 對於 server label 與 URL 同時變更的情況，是否需要提供舊 credential 清理機制，或接受由使用者重新輸入？
- 右上角是否只保留 `Server + Token + Project ID`，或需要補充目前 active spec/server 的只讀提示文字，以降低誤編輯風險？
