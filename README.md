# AutoJob System + Railway Dashboard

Hệ thống farm job tự động với dashboard điều khiển multi-account realtime, bảo vệ bằng **API Key**.

> **Hướng dẫn cài đặt chi tiết:** xem [INSTALL.md](INSTALL.md)

## Cấu trúc file

| File | Mô tả |
|------|-------|
| `Loader.lua` | Đợi player → click Play Now → load main script |
| `main_autojob.lua` | Logic chính: padding, autojob, bank, hop, sync dashboard |
| `server/` | Railway backend + cpanel dashboard |
| `server/.env.example` | Mẫu biến môi trường |
| `INSTALL.md` | Hướng dẫn cài đặt từng bước |

## API Key

Tất cả request tới `/api/*` yêu cầu header:

```
X-API-Key: your-secret-key
```

Cấu hình ở 3 nơi (cùng một key):

1. **Railway Variables** → `API_KEY`
2. **main_autojob.lua** → `CONFIG.API_KEY`
3. **Dashboard** → nhập khi đăng nhập

## Deploy nhanh

```bash
# 1. Tạo API Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Push GitHub → Deploy Railway → set API_KEY

# 3. Sửa main_autojob.lua (DASHBOARD_URL + API_KEY)

# 4. Chạy Loader.lua trong game
```

## API Endpoints

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `POST /api/bot/heartbeat` | API Key | Bot gửi trạng thái, nhận commands |
| `GET /api/bot/used-jobids` | API Key | JobId đang dùng (tránh trùng) |
| `GET /api/accounts` | API Key | Danh sách account |
| `POST /api/accounts/:user/command` | API Key | Gửi lệnh điều khiển |
| WebSocket `?apiKey=` | API Key | Cập nhật realtime |

## Chạy local

```powershell
cd server
$env:API_KEY="your-key-here"
npm install
npm start
```

Mở http://localhost:3000
