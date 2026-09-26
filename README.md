# IELTS Lab Dashboard — Next.js + Supabase

Dashboard IELTS cá nhân sử dụng Next.js, TypeScript, Supabase Auth và PostgreSQL.

## Chạy dự án

Yêu cầu Node.js 20.9 trở lên.

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

Trước khi chạy, sao chép `.env.example` thành `.env.local` và điền Project URL
cùng Publishable Key từ Supabase Dashboard.

## Khởi tạo database

```bash
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Ứng dụng yêu cầu đăng ký hoặc đăng nhập Supabase. Sau lần đăng nhập đầu tiên,
snapshot trong `lib/dashboard-data.ts` và dữ liệu cũ trong `localStorage` sẽ được
import vào tài khoản một lần.

## Kiểm tra và build

```bash
npm run typecheck
npm run build
```

Build dùng `output: "export"`, vì vậy bản tĩnh nằm trong thư mục `out/` và có thể triển khai lên Vercel, Netlify, Cloudflare Pages hoặc shared hosting.

## Dữ liệu và quyền riêng tư

- Dữ liệu chính được lưu trong Supabase PostgreSQL.
- Supabase Row Level Security giới hạn dữ liệu theo tài khoản đăng nhập.
- Snapshot ban đầu nằm trong `lib/dashboard-data.ts` và chỉ dùng để bootstrap tài khoản.
- `localStorage` cũ chỉ được đọc để import một lần; các thay đổi mới không còn lưu tại đó.
- Google Docs và Google Sheet chỉ là nguồn tham khảo, không nhận dữ liệu ghi ngược.
- Không đưa Supabase secret/service-role key vào mã frontend hoặc biến `NEXT_PUBLIC_*`.
# ielts-lab
