# iic-api-example

IIC API 文件瀏覽站，以 [Stoplight Elements](https://github.com/stoplightio/elements) 渲染 OpenAPI spec，支援三種使用方式：

| 模式 | 說明 |
|---|---|
| **nginx（docker compose）** | 完整開發/分享環境，透過瀏覽器存取本機 HTTP 服務 |
| **standalone HTML** | 單一 `.html` 檔，雙擊即可在本機瀏覽器直接開啟，無需任何伺服器 |
| **桌面版 App（Tauri build）** | 用 Tauri 打包成原生桌面應用程式（macOS／Windows），雙擊圖示即可開啟，無需瀏覽器或伺服器 |

---

## 專案結構

```
swagger/          ← OpenAPI spec 檔案（*.yaml），所有文件的唯一來源
web/              ← 前端原始碼（index.html、app.js、styles.css）
  specs.json      ← 自動產生，列出所有 spec（nginx 模式用）
dist/             ← 自動產生，存放 standalone HTML（亦作為 Tauri 的前端來源）
build_standalone.py  ← 建置 script
src-tauri/        ← Tauri 桌面 App 專案（Rust + tauri.conf.json）
docker-compose.yml
Makefile
```

---

## 更新 swagger YAML 後的操作

### 1. 修改或新增 spec

將 `.yaml` 檔放入（或直接編輯）`swagger/` 目錄：

```
swagger/iam.yaml
swagger/mcc.yaml
swagger/vps.yaml   ← 例如修改這個
swagger/vrm.yaml
swagger/dns.yaml   ← 或新增這個
```

> **無需修改任何程式碼。** `specs.json`、tab 按鈕、standalone HTML 全部自動產生。

---

### 2. 啟動 nginx 文件站

```bash
make doc-up
```

`doc-up` 會自動先執行 `make specs`（重新產生 `web/specs.json`），再啟動 docker compose。

完成後瀏覽 → [http://localhost](http://localhost)

關閉服務：

```bash
make doc-down
```

若只想在不重啟容器的情況下單獨更新 `specs.json`（例如動態掛載的環境）：

```bash
make specs
```

---

### 3. 產生 standalone HTML

```bash
make standalone
```

輸出：`dist/iic-api-docs.html`

直接用瀏覽器開啟，**不需要 nginx、不需要任何伺服器**：

```bash
open dist/iic-api-docs.html        # macOS
xdg-open dist/iic-api-docs.html   # Linux
# 或直接雙擊檔案
```

#### 完全離線版本（含 Stoplight 資源）

預設版本的 Stoplight Elements JS/CSS 仍從 CDN 載入（第一次需要網路，之後瀏覽器快取）。
若需要在完全無網路的環境使用，加上 `OFFLINE=1`：

```bash
make standalone OFFLINE=1
```

這會下載並內嵌所有資源，產生一個可完全離線運作的 HTML 檔。

---

### 4. 建置桌面版 App（Tauri build）

除了下載 GitHub Release 現成的安裝檔，也可以在本機用 Tauri 打包成桌面應用程式。

前置需求：[Node.js](https://nodejs.org/)、[Rust](https://www.rust-lang.org/tools/install)，以及 Tauri 的[平台相依套件](https://tauri.app/start/prerequisites/)。

```bash
npm install

# 產生離線版 standalone HTML 作為 Tauri 的前端來源（frontendDist 指向 dist/）
make standalone OFFLINE=1
cp dist/iic-api-docs.html dist/index.html

# 打包成當前平台的桌面 App
npm run tauri build
```

建置完成的安裝檔會輸出在 `src-tauri/target/release/bundle/` 下（例如 macOS 的 `dmg/`、`macos/`，或 Windows 的 `msi/`、`nsis/`）。

> 也可參考 `.github/workflows/build-tauri.yml`，CI 會在推送到 `release` 分支時自動建置 macOS（Intel／Apple Silicon）與 Windows 版本並發布 GitHub Release。

### 5. macOS 桌面版 App 的 Gatekeeper 問題

GitHub Release 提供 macOS 版 `.dmg`／`.app`（Intel 與 Apple Silicon）。由於目前尚未使用 Apple 開發者憑證簽章與公證（notarize），macOS 會將從網路下載的檔案標記為 quarantine，導致開啟時出現：

> **「IIC-API-Docs」已損毀，無法打開。你應該將其丟到「垃圾桶」。**

是 macOS Gatekeeper 對未簽章 App 的保護機制。

解法：在終端機執行以下指令移除 quarantine 標記後即可正常開啟（依實際安裝路徑調整）：

```bash
xattr -cr /Applications/IIC-API-Docs.app
```

或是先解除 App 內所有檔案的 quarantine 屬性再打開（若上面指令無效）：

```bash
xattr -dr com.apple.quarantine /Applications/IIC-API-Docs.app
```

---

## 指令速查

| 指令 | 說明 |
|---|---|
| `make doc-up` | 重新產生 `specs.json` 並啟動 nginx 文件站 |
| `make doc-down` | 停止 nginx 文件站 |
| `make specs` | 僅重新產生 `web/specs.json` |
| `make standalone` | 產生 `dist/iic-api-docs.html`（需網路載入 Stoplight CDN）|
| `make standalone OFFLINE=1` | 產生完全離線版 standalone HTML（內嵌所有資源）|
| `make swagger SERVICE=<name>` | 用 Swagger UI 預覽單一 spec（port 8088）|
| `npm run tauri build` | 將 `dist/` 內容打包成本機平台的桌面 App（需先產生 `dist/index.html`）|

