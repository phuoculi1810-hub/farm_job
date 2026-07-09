# Hướng dẫn cài đặt AutoJob + Railway Dashboard

## Tổng quan

Hệ thống gồm 3 phần:

1. **Railway Server** — backend + dashboard cpanel
2. **Loader.lua** — chạy trong Roblox executor, click Play và load script chính
3. **main_autojob.lua** — logic autojob, sync trạng thái lên dashboard

Tất cả kết nối được bảo vệ bằng **API Key** chung.

---

## Bước 1: Tạo API Key

Tạo một chuỗi bí mật ngẫu nhiên (lưu lại, dùng ở mọi nơi):

**PowerShell (Windows):**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

**Hoặc Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ví dụ key: `a3f8c2e91b7d4f6a8e0c1d2b3a4f5e6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2`

---

## Bước 2: Deploy lên Railway

### 2.1 Push code lên GitHub

```bash
cd D:\job_farmtien
git init
git add .
git commit -m "AutoJob dashboard with API key"
git branch -M main
git remote add origin https://github.com/TEN_CUA_BAN/job_farmtien.git
git push -u origin main
```

### 2.2 Tạo project Railway

1. Vào https://railway.app → đăng nhập
2. **New Project** → **Deploy from GitHub repo**
3. Chọn repo `job_farmtien`
4. Railway tự nhận `Dockerfile` và build

### 2.3 Cấu hình biến môi trường

Trong Railway project → tab **Variables** → thêm:

| Biến | Giá trị |
|------|---------|
| `API_KEY` | Key bạn tạo ở Bước 1 |
| `PORT` | `3000` (Railway thường tự gán, có thể bỏ qua) |

### 2.4 Lấy URL public

Railway → **Settings** → **Networking** → **Generate Domain**

Copy URL, ví dụ: `https://autojob-dashboard-production.up.railway.app`

---

## Bước 3: Cấu hình script Roblox

### 3.1 Sửa `main_autojob.lua`

Mở file, sửa 2 dòng trong `CONFIG`:

```lua
DASHBOARD_URL = "https://autojob-dashboard-production.up.railway.app",
API_KEY       = "a3f8c2e91b7d4f6a8e0c1d2b3a4f5e6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2",
```

### 3.2 Upload script lên GitHub (để Loader tải qua HttpGet)

Push `main_autojob.lua` lên cùng repo GitHub.

Lấy link raw:
```
https://raw.githubusercontent.com/TEN_CUA_BAN/job_farmtien/main/main_autojob.lua
```

### 3.3 Sửa `Loader.lua`

```lua
local TARGET_USERNAME = "manchanhkun1"  -- username account này

local MAIN_SCRIPT_URL = "https://raw.githubusercontent.com/TEN_CUA_BAN/job_farmtien/main/main_autojob.lua"
```

### 3.4 Bật HttpService trong executor

Executor (Synapse, Fluxus, v.v.) cần:

- Bật **HttpEnabled** / **Allow HTTP requests**
- Whitelist domain Railway: `autojob-dashboard-production.up.railway.app`

---

## Bước 4: Chạy script trong game

### Mỗi account

1. Mở Roblox, vào game
2. Inject và chạy `Loader.lua`
3. Script tự: đợi player → click Play → tắt Lock-On → padding job → autojob
4. Trạng thái hiện trên dashboard sau ~3 giây (heartbeat)

### Multi-account

| Account | File Loader | Ghi chú |
|---------|-------------|---------|
| manchanhkun1 | Loader.lua (sửa TARGET_USERNAME) | Chạy instance 1 |
| manchanhkun2 | Loader.lua (sửa TARGET_USERNAME) | Chạy instance 2 |

Tất cả account dùng **cùng API_KEY** và **cùng DASHBOARD_URL** trong `main_autojob.lua`.

---

## Bước 5: Dùng Dashboard CPanel

1. Mở URL Railway trong trình duyệt
2. Nhập **API Key** (cùng key đã cấu hình Railway)
3. Bảng hiện danh sách account realtime
4. Click account → dùng 7 nút điều khiển

| Nút | Chức năng |
|-----|-----------|
| HOP Server | Hop server ít người, không trùng JobId account khác |
| Stop AutoJob | Hủy job + dừng nhận job |
| Đến Bank | Padding đến tọa độ bank |
| Đến Job | Padding đến tọa độ job |
| Check Player Studs | Nhập bán kính studs, check người quanh tọa độ |
| Send Money | Chuyển tiền cho player |
| Auto Job | Bật nhận job |

API Key được lưu trong `localStorage` trình duyệt. Bấm **Đăng xuất** để xóa.

---

## Bước 6: Chạy local (test trước khi deploy)

```powershell
cd D:\job_farmtien\server
copy .env.example .env
# Sửa .env: API_KEY=your-key-here

# Windows PowerShell — set env tạm:
$env:API_KEY="your-key-here"
npm install
npm start
```

Mở http://localhost:3000 → nhập API Key → test.

Trong `main_autojob.lua` khi test local:
```lua
DASHBOARD_URL = "http://localhost:3000",
API_KEY       = "your-key-here",
```

> Lưu ý: Roblox không gọi được `localhost` từ máy khác. Test bot local cần dùng ngrok hoặc deploy Railway.

---

## API Key — Cách hoạt động

```
┌─────────────┐     X-API-Key header      ┌──────────────┐
│ Roblox Bot  │ ──────────────────────────► │ Railway API  │
│ (main.lua)  │     POST /api/bot/heartbeat │              │
└─────────────┘                             │  Kiểm tra    │
                                            │  API_KEY     │
┌─────────────┐     X-API-Key header      │  env var     │
│ Dashboard   │ ──────────────────────────► │              │
│ (browser)   │     GET /api/accounts       └──────────────┘
└─────────────┘     WS ?apiKey=xxx
```

- Header: `X-API-Key: <your-key>`
- Hoặc: `Authorization: Bearer <your-key>`
- WebSocket: `wss://domain?apiKey=<your-key>`

Request không có key hoặc key sai → trả `401 Unauthorized`.

---

## Checklist cài đặt

- [ ] Tạo API Key ngẫu nhiên
- [ ] Deploy Railway + set biến `API_KEY`
- [ ] Copy URL Railway
- [ ] Sửa `DASHBOARD_URL` + `API_KEY` trong `main_autojob.lua`
- [ ] Sửa `MAIN_SCRIPT_URL` trong `Loader.lua`
- [ ] Push code lên GitHub
- [ ] Bật HttpService trong executor
- [ ] Chạy Loader.lua từng account
- [ ] Đăng nhập dashboard bằng API Key
- [ ] Kiểm tra account hiện trên bảng (trạng thái online)

---

## Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|-----|-------------|----------|
| Dashboard báo "API key không hợp lệ" | Key sai hoặc chưa set trên Railway | Kiểm tra Variables → `API_KEY` |
| Bot không hiện trên dashboard | HttpService tắt hoặc URL sai | Bật HTTP, kiểm tra `DASHBOARD_URL` |
| `401` trong script | `API_KEY` trong lua khác Railway | Đồng bộ key ở cả 2 nơi |
| WebSocket Disconnected (4001) | API Key WS sai | Đăng xuất dashboard, đăng nhập lại |
| Server restart mất dữ liệu | In-memory store | Bình thường — bot reconnect sau ~3s |

---

## Bảo mật

- **Không** commit API Key lên GitHub công khai
- Dùng Railway Variables (không ghi key vào code server)
- Trong `main_autojob.lua` key sẽ nằm trong script — chỉ host trên repo private hoặc paste trực tiếp vào executor
- Đổi API Key định kỳ: sửa Railway Variables + lua + đăng nhập lại dashboard
