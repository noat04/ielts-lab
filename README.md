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

## Lộ trình học tập cá nhân

Tab **Lộ trình** cho phép mỗi người dùng tự xây dựng hệ thống học từ A–Z:

- tạo nhiều lộ trình theo band hiện tại, band mục tiêu, ngày thi và lịch học trong tuần;
- chia lộ trình thành các giai đoạn và theo dõi phần trăm hoàn thành;
- lập bài học theo ngày, thời lượng, kỹ năng, mức ưu tiên và tài liệu đi kèm;
- quản lý lịch thi chính thức, mock test và checkpoint;
- lưu thư viện tài liệu cá nhân;
- liên kết buổi học và mục trong sổ lỗi với lộ trình đang hoạt động;
- tổng hợp số bài hoàn thành, phút đã học và số ngày còn lại đến kỳ thi.

Các bảng và chính sách RLS của tính năng này nằm trong migration
`supabase/migrations/20260927100000_add_personal_learning_planner.sql`. Chạy
`supabase db push` trước khi mở tab Lộ trình trên database hiện có.

## Công cụ học tập nâng cao

- Đánh giá đầu vào bốn kỹ năng và cập nhật band xuất phát.
- Sinh lịch học 2–12 tuần theo ngày rảnh, thời lượng, điểm yếu và sổ lỗi.
- Nhập kết quả mock test; Listening và Reading được quy đổi band tự động.
- Tải tài liệu tối đa 50 MB vào bucket Supabase Storage riêng tư.
- Nhận đề xuất bài học từ dữ liệu thật và thêm đề xuất thẳng vào lịch.

Phần đề xuất AI chạy trong Supabase Edge Function để không lộ API key. Sau khi
đẩy migration, cấu hình và deploy function:

```bash
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase secrets set OPENAI_MODEL=gpt-5-mini
supabase functions deploy learning-coach
```

Nếu Edge Function chưa được deploy, website vẫn hiển thị đề xuất cục bộ dựa
trên điểm đầu vào và số lỗi đang mở.

## Nội dung cộng đồng

Tab **Nội dung** gồm:

- trình soạn bài mẹo làm bài với slug, excerpt, chuyên mục, tags, ảnh đại diện;
- SEO title, meta description, focus keyword, canonical URL và SEO checklist;
- schema `Article`, `HowTo`, `FAQPage`; trạng thái nháp, xuất bản hoặc lưu trữ;
- thư viện từ vựng theo chủ đề và từ loại: noun, verb, adjective, adverb,
  idiom, phrasal verb, phrase, pattern, preposition;
- nhập tối đa 2.000 từ/lần từ CSV hoặc XLSX, có kiểm tra và xem trước;
- bài/từ đã xuất bản được cộng đồng đọc, nhưng chỉ tác giả được sửa hoặc xóa.

CSV/XLSX dùng hàng tiêu đề:

```text
topic,word,type,meaning,pronunciation,example,level,collocations,synonyms,antonyms,tags,notes
```

Để đọc XLSX, deploy thêm Edge Function:

```bash
supabase functions deploy parse-vocabulary-file
```

## Weekly Sprint MVP

Tab **Sprint** triển khai luồng Phase 1:

```text
Create Week → Map Source → Add Tasks → Start Session → Submit & Grade
→ Analyse Error → Commit Bug → End Session → Session Result + Study Log
```

- `week_sprints`: mục tiêu, KPI dự kiến và trạng thái tuần.
- `learning_source_mappings`: sách, unit, section, trang, audio và exercises.
- `study_tasks`: warm-up/practice và câu hỏi của từng session.
- `task_attempts`: câu trả lời, kết quả chấm và evidence.
- `session_results`: điểm, thời lượng và số lỗi của buổi học.
- Attempt sai tự tạo bug liên kết với task/session; người học bổ sung root cause và refactor rule.
- End Session gọi database function để cập nhật bài học, tạo Session Result và Study Log trong cùng transaction.

Migration Phase 1 là `20260927103000_add_weekly_sprint_mvp.sql`. Migration chỉ
thêm bảng/cột/FK mới, không xóa hoặc cập nhật dữ liệu cũ.

## Learning Quality · Phase 2

Phần **Learning Quality** nằm ngay dưới lịch của từng Sprint:

- taxonomy lỗi chuẩn theo 4 nhóm: comprehension, language, production và process;
- vòng đời `OPEN → FIXING → RETEST_DUE → RESOLVED/REOPENED`, có severity và lịch sử retest;
- KPI Engine tính adherence, task accuracy, time completion, retest pass rate và overall quality;
- Weekly Retrospective lưu wins, challenges, Stop/Start/Continue và trọng tâm tuần tới;
- Next Week Generator tự mang session chưa hoàn thành cùng task/source sang tuần mới, đồng thời lấp các ngày học còn trống.

Migration Phase 2 là `20260927104000_add_learning_quality_phase2.sql`. Migration
giữ nguyên nội dung học tập cũ; trạng thái `OPEN/DONE` hiện có chỉ được ánh xạ
sang lifecycle mới để màn Sổ lỗi cũ và mới tiếp tục hoạt động cùng nhau.

## Skill Practice · Phase 3

Session Runner hỗ trợ workflow riêng theo kỹ năng:

- Listening Prediction: Anchor → Target Type → Predicted Meaning → Paraphrase/ Distractor → Answer.
- Reading Evidence: Keyword → Predict Paraphrase → Locate Paragraph → Evidence → Answer.
- Sentence Completion: Word Type → Grammar Pattern → Predicted Meaning → Answer.
- Writing A-R-E-A: Brainstorm → Idea → S-V-O → Assertion/Reason/Explanation/Example → Paragraph.
- Speaking Cue Card: 1-minute Notes → Sentence Library → Record → Self Review → Retry.

Attempt lưu cả structured response để phục vụ phân tích về sau. Ghi âm Speaking
được tải vào bucket riêng tư `speaking-recordings` (tối đa 25 MB). Skill KPI hiển
thị target/actual, số attempt đúng, phút học và số lỗi cho từng kỹ năng. Bảng
`learning_events` ghi lại các event chính của workflow để làm analytics hoặc AI
recommendation ở phase tiếp theo.

Migration Phase 3 là `20260927105000_add_skill_practice_phase3.sql`.

## Personal Material Library

Trong tab **Lộ trình**, kho tài liệu cá nhân hỗ trợ:

- upload PDF, DOC, DOCX hoặc TXT tối đa 50 MB vào bucket riêng tư `learning-materials`;
- lưu link Google Drive, Google Docs, Sheets và Slides, tự nhận file ID và tạo URL preview;
- lưu các link tài liệu ngoài;
- phân loại theo thư mục, tags, kỹ năng, yêu thích và tài liệu chính;
- tìm kiếm, lọc theo nguồn/thư mục, preview PDF/Google Drive và tải DOCX;
- chọn lại tài liệu từ thư viện khi tạo Source Mapping cho Weekly Sprint.

Với Google Drive, người dùng cần bật quyền chia sẻ phù hợp cho link. Website chỉ
lưu đường dẫn và metadata, không yêu cầu hoặc lưu thông tin đăng nhập Google.
Migration nâng cấp là `20260927106000_upgrade_personal_material_library.sql`.

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
