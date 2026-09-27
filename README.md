# IELTS Lab

IELTS Lab là nền tảng học IELTS cá nhân theo mô hình **Weekly Sprint + Bug Tracker**. Dự án không chỉ lưu ghi chú hoặc lịch học, mà quản lý toàn bộ chu trình từ đánh giá đầu vào, lập lộ trình, học hằng ngày, làm bài, chấm điểm, phân tích lỗi, retest, đánh giá KPI đến tự động tạo tuần học tiếp theo.

Ứng dụng được xây dựng bằng Next.js, React, TypeScript và Supabase. Dữ liệu người dùng được lưu trong PostgreSQL, file cá nhân và bản ghi âm được lưu trong Supabase Storage, còn quyền truy cập được bảo vệ bằng Supabase Auth và Row Level Security.

## Mục lục

- [Luồng nghiệp vụ chính](#luồng-nghiệp-vụ-chính)
- [Các khu vực của website](#các-khu-vực-của-website)
- [Chức năng từ A–Z](#chức-năng-từ-az)
- [Kiến trúc kỹ thuật](#kiến-trúc-kỹ-thuật)
- [Cấu trúc dữ liệu](#cấu-trúc-dữ-liệu)
- [Cài đặt local](#cài-đặt-local)
- [Kết nối Supabase Cloud](#kết-nối-supabase-cloud)
- [Edge Functions và AI Coach](#edge-functions-và-ai-coach)
- [Danh sách migration](#danh-sách-migration)
- [Kiểm tra và build](#kiểm-tra-và-build)
- [Quyền riêng tư và bảo mật](#quyền-riêng-tư-và-bảo-mật)
- [Giới hạn hiện tại](#giới-hạn-hiện-tại)

## Luồng nghiệp vụ chính

```text
Đánh giá đầu vào
        ↓
Tạo lộ trình cá nhân
        ↓
Tạo Weekly Sprint
        ↓
Map tài liệu cho từng session
        ↓
Học theo Daily Session
        ↓
Submit → Chấm bài → Phân tích lỗi
        ↓
Tạo Bug → Study Log → KPI
        ↓
Retest lỗi đang mở
        ↓
Weekly Retrospective
        ↓
Carry-over → Generate Next Week
```

Đây là flow trung tâm của dự án. Các tính năng Dashboard, Lộ trình, Sổ lỗi, tài liệu, nội dung và AI đều hỗ trợ flow này.

## Các khu vực của website

| Khu vực | Mục đích |
| --- | --- |
| Tổng quan | Xem mục tiêu, tiến độ, thời gian học, lỗi và kết quả gần nhất |
| Sprint | Lập kế hoạch tuần, chạy session, làm task, chấm bài và review chất lượng |
| Lộ trình | Quản lý roadmap, giai đoạn, lịch học, lịch thi và tài liệu cá nhân |
| Nội dung | Viết bài chuẩn SEO và xây thư viện từ vựng cộng đồng |
| Sổ lỗi | Phân loại lỗi, tìm root cause, đặt refactor rule và theo dõi trạng thái |
| Hành trình | Xem Study Log và lịch sử học tập |

## Chức năng từ A–Z

### 1. Tài khoản và dữ liệu cá nhân

- Đăng ký và đăng nhập bằng Supabase Auth.
- Tự tạo profile sau khi đăng ký.
- Mỗi người dùng chỉ truy cập được dữ liệu thuộc tài khoản của mình.
- Tự động import snapshot ban đầu và dữ liệu cũ trong `localStorage` một lần.
- Không sử dụng service-role key trong frontend.

### 2. Dashboard tổng quan

Dashboard tổng hợp:

- band hiện tại, band mục tiêu và ngày thi;
- số buổi đã học và tổng thời gian học;
- số lỗi đang mở và tỷ lệ lỗi đã sửa;
- tiến độ theo tuần;
- kết quả mock test;
- Study Log và hoạt động gần đây;
- bài học đang lên lịch hoặc cần hoàn thành.

### 3. Lộ trình học cá nhân

Người dùng có thể:

- tạo nhiều lộ trình;
- đặt band hiện tại và band mục tiêu;
- đặt ngày bắt đầu, ngày kết thúc và ngày thi;
- chọn ngày có thể học trong tuần;
- đặt tổng thời gian học mỗi tuần;
- chia lộ trình thành nhiều giai đoạn;
- tạo, chỉnh sửa và hoàn thành bài học theo ngày;
- đặt mức ưu tiên và kỹ năng cho từng bài;
- quản lý kỳ thi chính thức, mock test và checkpoint;
- xem tỷ lệ hoàn thành, phút đã học và số ngày còn lại đến kỳ thi.

### 4. Đánh giá đầu vào

Module đánh giá đầu vào hỗ trợ raw score Listening/Reading, band Writing/Speaking, mức kinh nghiệm và các kỹ năng khó. Kết quả được dùng để tính band ước lượng, cập nhật điểm xuất phát và hỗ trợ hệ thống đề xuất lịch học.

### 5. Sinh lịch học tự động

Website có thể tạo lịch 2–12 tuần dựa trên ngày học, số phút mỗi tuần, band mục tiêu, kỹ năng yếu, đánh giá đầu vào, lỗi đang mở và thời gian còn lại trước kỳ thi. Chạy lại sẽ cập nhật bài có cùng `source_key`, hạn chế dữ liệu trùng.

### 6. Personal Material Library

Kho tài liệu cá nhân hỗ trợ:

- upload PDF, DOC, DOCX và TXT tối đa 50 MB;
- lưu file trong bucket riêng tư `learning-materials`;
- lưu link Google Drive, Docs, Sheets và Slides;
- tự nhận file ID và tạo URL preview;
- lưu đường dẫn tài liệu bên ngoài;
- phân loại theo thư mục, tags và kỹ năng;
- đánh dấu yêu thích hoặc tài liệu chính;
- tìm kiếm, lọc, preview PDF/Google Drive và tải DOCX;
- sử dụng lại tài liệu trong Source Mapping.

Website chỉ lưu link và metadata Google Drive, không lưu tài khoản Google. Chủ tài liệu cần thiết lập quyền chia sẻ phù hợp nếu muốn preview qua link.

### 7. Weekly Sprint

Mỗi tuần được quản lý như một Sprint:

```text
PLANNED → IN_PROGRESS → REVIEW → COMPLETED
```

Sprint lưu tuần số, ngày bắt đầu/kết thúc, mục tiêu, target từng kỹ năng, Daily Session, điểm trung bình, thời gian học, lỗi mới, KPI và Weekly Retrospective.

Form tạo Sprint hỗ trợ nhập nhanh file `.csv`, `.txt`, `.text` hoặc `.md`. File có thể chứa thông tin tuần, target từng kỹ năng và danh sách session gồm ngày, giờ, kỹ năng, tiêu đề, thời lượng, target score và mục tiêu bài học. Giao diện hiển thị preview và cảnh báo trước khi tạo; nếu file không có session, hệ thống dùng lịch học cá nhân để tự sinh session.

### 8. Source Mapping

Mỗi session có thể được map với tài liệu trong thư viện, unit, section, khoảng trang, audio track, script page, phạm vi bài tập, URL và ghi chú. File riêng tư dùng signed URL mới khi tải thay vì lưu URL tạm vào database.

### 9. Study Task và Attempt

Task hỗ trợ Warm-up, Practice, Listening, Reading, Writing, Speaking và Review. Kiểu trả lời gồm text ngắn, số, bài dài và self-check.

Mỗi lần nộp là một Attempt riêng, lưu câu trả lời, evidence, structured response, đúng/sai, điểm, feedback và recording nếu có.

### 10. Daily Session Runner

Session Runner cho phép mở tài liệu, làm task, submit, chấm bài, phân tích lỗi, tạo Bug và kết thúc session. Khi kết thúc, database function tự động tạo `session_results`, cập nhật Daily Lesson và tạo Study Log.

### 11. Workflow Listening

```text
Anchor → Target Type → Predicted Meaning → Paraphrase → Distractor → Answer
```

Structured response lưu cách người học dự đoán trước khi nghe và bằng chứng sau khi nghe.

### 12. Workflow Reading

```text
Keyword → Predict Paraphrase → Locate Paragraph → Evidence Line → Answer
```

Workflow phù hợp với Matching Information, Matching Researchers và các dạng bài cần xác định evidence.

### 13. Sentence Completion

Người học xác định Word Type, Grammar Pattern và Predicted Meaning trước khi nhập đáp án. Flow này hỗ trợ phát hiện `GRAMMAR_PREDICTION`, `ANSWER_BOUNDARY`, `LOCATING` và `VOCABULARY`.

### 14. Workflow Writing

```text
Brainstorm → Core Idea → S + V + O → Assertion → Reason → Explanation → Example → Paragraph
```

Writing hiện dùng structured self-check để xây câu và lập luận trước khi viết đoạn hoàn chỉnh.

### 15. Workflow Speaking

```text
Cue Card → 1-minute Notes → Sentence Library → Record → Listen Again → Self Review → Retry
```

- Ghi âm bằng `MediaRecorder`.
- Lưu trong bucket riêng tư `speaking-recordings`.
- Giới hạn 25 MB mỗi recording.
- Lưu thời lượng và đường dẫn vào Attempt.
- Microphone yêu cầu HTTPS hoặc `localhost`.

### 16. Chấm bài

Hệ thống chuẩn hóa chữ hoa/thường và khoảng trắng, chấm text/number theo đáp án chính xác, hỗ trợ self-check, lưu điểm, feedback, evidence và tính kết quả session.

Writing và Speaking chưa được chấm band IELTS tự động bằng AI.

### 17. Sổ lỗi

Attempt sai tự tạo Bug liên kết với task và session. Bug lưu kỹ năng, câu sai, đáp án đúng, loại lỗi, root cause, refactor rule, evidence, severity, số lần tái phạm và ngày retest.

### 18. Taxonomy lỗi

- Listening/Reading: `ANCHOR`, `TARGET`, `LOCATING`, `PARAPHRASE`, `DISTRACTOR`, `SOUND`, `ATTRIBUTION`, `ANSWER_BOUNDARY`.
- Language: `GRAMMAR_PREDICTION`, `VOCABULARY`, `GRAMMAR`, `SUBJECT_VERB`, `TENSE`, `ARTICLE`, `WORD_FORM`, `WORD_CHOICE`, `COLLOCATION`, `SPELLING`.
- Writing/Speaking: `TASK_RESPONSE`, `COHERENCE`, `CONNECTOR`, `PAUSE`, `REPETITION`, `INCOMPLETE_SENTENCE`, `PRONUNCIATION`.
- Process: `TIME`, `INSTRUCTION`, `OTHER`.

Severity gồm `LOW`, `MEDIUM`, `HIGH` và `CRITICAL`.

### 19. Bug Lifecycle và Retest

```text
OPEN → FIXING → RETEST_DUE → RESOLVED
                         ↘ REOPENED
```

Mỗi lần retest được lưu lịch sử. Pass chuyển Bug thành `RESOLVED`; Fail chuyển thành `REOPENED`, tăng số lần tái phạm và lên lịch lại. Lifecycle mới vẫn đồng bộ với `OPEN/DONE` cũ.

### 20. KPI Engine

KPI tổng theo Sprint gồm session adherence, task accuracy, time completion, retest pass rate, lỗi mới/resolved, carry-over và Overall Quality Score.

KPI theo kỹ năng gồm target, actual, tổng attempt, attempt đúng, session hoàn thành, phút học, số lỗi và trạng thái `NO_DATA`, `NOT_MET` hoặc `PASS`.

### 21. Weekly Retrospective

Cuối tuần, người học lưu năng lượng, tự tin, wins, challenges, Stop/Start/Continue và trọng tâm tuần tiếp theo.

### 22. Carry-over và Next Week Generator

Generator tìm session chưa `DONE`, sao chép session/task/Source Mapping sang Sprint mới, đánh dấu ưu tiên cao, lấp các ngày trống, sử dụng trọng tâm retrospective, hoàn tất Sprint cũ và lưu quan hệ carry-over.

### 22.1. Weekly Review Wizard

Wizard hợp nhất quy trình cuối tuần thành 5 bước trong một màn hình:

1. Tổng kết KPI, thời gian, độ chính xác và session chưa hoàn thành.
2. So sánh hiệu suất theo kỹ năng và xác định kỹ năng yếu nhất.
3. Ưu tiên lỗi theo severity, số lần tái diễn và lịch retest.
4. Ghi năng lượng, mức tự tin, wins, challenges và Stop/Start/Continue.
5. Xem trước, chỉnh mục tiêu và xác nhận kế hoạch tuần kế tiếp.

Khi xác nhận, hệ thống lưu retrospective, carry-over session/task/tài liệu, tạo tuần mới và lên lịch retest cho tối đa ba lỗi ưu tiên. Mọi thay đổi chỉ được ghi sau bước xác nhận cuối cùng.

### 23. Mock Test

- Nhập raw score Listening và Reading.
- Tự động quy đổi band.
- Nhập band Writing và Speaking.
- Tính overall band.
- Lưu loại bài, ngày làm và kết luận.

### 24. AI Learning Coach

AI Coach sử dụng đánh giá đầu vào, kỹ năng yếu, mock test, lỗi mở và lịch sử học để đề xuất bài học. Người dùng có thể thêm đề xuất thẳng vào lịch. Nếu Edge Function chưa deploy, website vẫn có đề xuất cục bộ.

### 25. Bài viết cộng đồng và SEO

Trình biên tập hỗ trợ title, slug, excerpt, Markdown/HTML, category, tags, ảnh, focus keyword, SEO title, meta description, canonical URL, SEO checklist, SEO score và schema `Article`, `HowTo`, `FAQPage`.

Bài published được cộng đồng đọc; chỉ tác giả được sửa/xóa. Migration cũng seed bài hệ thống **Hướng dẫn sử dụng IELTS Lab cho người mới từ A–Z**.

### 26. Thư viện từ vựng

Từ vựng được tổ chức theo chủ đề và từ loại: noun, verb, adjective, adverb, idiom, phrasal verb, phrase, pattern, preposition và other.

Mỗi mục từ lưu nghĩa, phiên âm, ví dụ, level, collocations, synonyms, antonyms, tags và ghi chú. Hệ thống import tối đa 2.000 dòng CSV/XLSX, có kiểm tra và preview.

```text
topic,word,type,meaning,pronunciation,example,level,collocations,synonyms,antonyms,tags,notes
```

### 27. Study Log và Learning Events

Ngoài Study Log, backend có event stream append-only:

- `WEEK_CREATED`;
- `SESSION_CREATED`, `SESSION_STARTED`, `SESSION_COMPLETED`;
- `TASK_STARTED`, `ANSWER_SUBMITTED`, `TASK_GRADED`;
- `ERROR_DETECTED`, `BUG_CREATED`, `BUG_RETESTED`, `BUG_RESOLVED`;
- `KPI_UPDATED`, `WEEK_REVIEWED`, `WEEK_COMPLETED`;
- `NEXT_WEEK_GENERATED`.

Event stream là nền cho Analytics, audit và AI recommendation.

### 28. Nhắc lịch học và lịch thi

Reminder Center tự động lấy dữ liệu từ bài học và kỳ thi đã lên kế hoạch. Người dùng có thể đặt giờ riêng cho từng bài học, chọn giờ học mặc định, cấu hình nhắc trước bài học/kỳ thi, hoãn 15 phút hoặc 1 giờ và bỏ qua lời nhắc.

Lời nhắc được lưu trong Supabase và đồng bộ theo tài khoản. Thông báo trình duyệt xuất hiện khi website đang mở và người dùng đã cấp quyền; lịch sắp tới hoặc quá hạn vẫn luôn có thể xem từ biểu tượng chuông trên thanh điều hướng.

## Kiến trúc kỹ thuật

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | Next.js 16 App Router |
| UI | React 19, CSS thuần |
| Ngôn ngữ | TypeScript 7 |
| Backend/Data API | Supabase |
| Database | PostgreSQL 17 |
| Authentication | Supabase Auth |
| Authorization | PostgreSQL Row Level Security |
| File Storage | Supabase Storage |
| Server functions | Supabase Edge Functions, Deno 2 |
| AI | OpenAI Responses API qua Edge Function |
| Build | Static export qua `output: "export"` |

### Cấu trúc thư mục

```text
app/
  globals.css                 Giao diện toàn hệ thống
  page.tsx                    Entry page
components/
  IeltsDashboard.tsx          Shell và navigation
  LearningPlanner.tsx         Lộ trình cá nhân
  LearningTools.tsx           Diagnostic, schedule, mock test, AI
  WeeklySprint.tsx            Sprint và Session Runner
  SprintQuality.tsx           KPI, retest, retrospective, next week
  WeeklyReviewWizard.tsx      Đánh giá tuần và duyệt kế hoạch tuần sau
  PracticeFields.tsx          Workflow theo kỹ năng và ghi âm
  PersonalResourceLibrary.tsx Kho tài liệu cá nhân
  ContentHub.tsx              Bài viết SEO và từ vựng
lib/supabase/
  client.ts                   Supabase browser client
  dashboard.ts               Dashboard và dữ liệu cũ
  planner.ts                  Lộ trình và tài liệu
  learning-tools.ts           Diagnostic, schedule, tests, AI, upload
  sprints.ts                  Sprint, task, attempt, grading
  quality.ts                  Bug lifecycle, KPI và retrospective
  reminders.ts                Cấu hình và trạng thái nhắc lịch
  content.ts                  Bài viết và từ vựng
supabase/
  migrations/                 Schema và dữ liệu seed
  functions/learning-coach/   AI Learning Coach
  functions/parse-vocabulary-file/ Parser XLSX
```

## Cấu trúc dữ liệu

### Học tập và lộ trình

`profiles`, `study_goals`, `learning_plans`, `plan_phases`, `daily_lessons`, `exam_events`, `diagnostic_assessments`, `study_sessions`, `test_results`.

### Sprint và luyện tập

`week_sprints`, `learning_source_mappings`, `study_tasks`, `task_attempts`, `session_results`, `sprint_kpis`, `skill_kpis`, `weekly_retrospectives`, `carry_over_items`, `learning_events`.

### Sổ lỗi

`bugs`, `error_type_catalog`, `bug_retests`, `theory_notes`.

### Tài liệu và nội dung

`learning_resources`, `content_articles`, `vocabulary_topics`, `vocabulary_entries`, `practice_exercises`, `exercise_progress`, `data_imports`.

### Storage buckets

| Bucket | Quyền | Nội dung |
| --- | --- | --- |
| `learning-materials` | Private | PDF, Word và tài liệu học cá nhân |
| `speaking-recordings` | Private | Bản ghi âm Speaking |

Object path bắt đầu bằng `auth.uid()`. Storage policy chỉ cho chủ tài khoản thao tác với object của mình.

## Cài đặt local

### Yêu cầu

- Node.js 20.9 trở lên;
- npm;
- Supabase CLI;
- Docker Desktop nếu chạy Supabase local.

### Cài dependencies

```bash
npm install
```

### Tạo biến môi trường

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS:

```bash
cp .env.example .env.local
```

Điền Project URL và Publishable Key từ Supabase Dashboard:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Không đặt service-role key vào biến `NEXT_PUBLIC_*`.

### Chạy ứng dụng

```bash
npm run dev
```

Mở `http://localhost:3000`.

### Chạy Supabase local

```bash
supabase start
supabase db reset
```

`supabase db reset` chỉ dùng với database local vì lệnh này xóa và dựng lại dữ liệu local từ migrations. Supabase Studio local mặc định ở `http://localhost:54323`.

## Kết nối Supabase Cloud

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Nên backup database production trước khi đẩy migration mới.

Trong Supabase Dashboard, bật Email provider, đặt Site URL, thêm Redirect URLs và cấu hình SMTP riêng nếu dùng production.

## Edge Functions và AI Coach

API key chỉ lưu dưới dạng Supabase secret:

```bash
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase secrets set OPENAI_MODEL=gpt-5-mini
supabase functions deploy learning-coach
supabase functions deploy parse-vocabulary-file
```

Hai function bật `verify_jwt`, chỉ session đăng nhập hợp lệ mới gọi được.

## Danh sách migration

| Migration | Nội dung |
| --- | --- |
| `20260927090000_create_ielts_lab_schema.sql` | Schema dashboard nền tảng |
| `20260927090100_enable_rls.sql` | Grants và Row Level Security |
| `20260927090200_add_import_idempotency.sql` | Chống import trùng |
| `20260927100000_add_personal_learning_planner.sql` | Lộ trình, phase, lesson, exam |
| `20260927101000_add_learning_tools.sql` | Diagnostic, schedule metadata, Storage |
| `20260927102000_add_community_content.sql` | Bài viết SEO và từ vựng |
| `20260927103000_add_weekly_sprint_mvp.sql` | Sprint, task, attempt, grading |
| `20260927104000_add_learning_quality_phase2.sql` | Taxonomy, retest, KPI, retrospective, carry-over |
| `20260927105000_add_skill_practice_phase3.sql` | Workflow kỹ năng, recording, event stream |
| `20260927106000_upgrade_personal_material_library.sql` | Kho tài liệu cá nhân nâng cao |
| `20260927107000_seed_beginner_guide_article.sql` | Seed bài hướng dẫn người mới |
| `20260927108000_add_study_reminders.sql` | Giờ học, Reminder Center, trigger đồng bộ và RLS |

Không chỉnh sửa migration đã chạy trên production. Hãy tạo migration mới cho thay đổi tiếp theo.

## Cách sử dụng nhanh cho người mới

1. Đăng ký và đăng nhập.
2. Tạo roadmap trong **Lộ trình**.
3. Làm **Đánh giá đầu vào**.
4. Upload PDF/DOCX hoặc thêm Google Drive.
5. Tạo Weekly Sprint.
6. Tạo Source Mapping từ tài liệu cá nhân.
7. Thêm task cho session.
8. Bắt đầu session, submit và phân tích câu sai.
9. End Session để tạo Study Log và KPI.
10. Lên lịch retest trong Sổ lỗi.
11. Viết Weekly Retrospective.
12. Dùng Next Week Generator.
13. Bật **Nhắc lịch** trên thanh điều hướng và cấp quyền thông báo trình duyệt.

Bài hướng dẫn chi tiết có sẵn trong tab **Nội dung** sau khi migration seed được áp dụng.

## Kiểm tra và build

```bash
npm run typecheck
npm run build
```

Dự án dùng static export. Kết quả build nằm trong `out/` và có thể triển khai lên Vercel, Netlify, Cloudflare Pages hoặc shared hosting. Supabase tiếp tục cung cấp Auth, PostgreSQL, Storage và Edge Functions cho frontend tĩnh.

## Quyền riêng tư và bảo mật

- Các bảng cá nhân bật Row Level Security.
- Query frontend dùng Supabase session hiện tại.
- Storage buckets là private và dùng signed URL có thời hạn.
- Nội dung published có thể được cộng đồng đọc; chỉ tác giả được sửa/xóa.
- Bài viết hệ thống công khai nhưng người dùng không thể sửa/xóa.
- OpenAI API key chỉ tồn tại trong Edge Function secrets.
- `.env.local` được loại khỏi Git qua `.gitignore`.

## Import dữ liệu cũ

- Snapshot ban đầu nằm trong `lib/dashboard-data.ts`.
- `localStorage` cũ được kiểm tra sau lần đăng nhập đầu tiên.
- `data_imports` ghi lại nguồn đã import.
- Unique keys và upsert đảm bảo tính idempotent.
- Dữ liệu mới dùng Supabase làm nguồn chính.

## Xử lý sự cố

### Supabase chưa được cấu hình

Kiểm tra `.env.local`, sau đó khởi động lại `npm run dev`.

### Thiếu bảng hoặc database function

```bash
supabase db push --dry-run
supabase db push
```

### Không preview được Google Drive

Kiểm tra định dạng link và quyền chia sẻ. Website không thể vượt qua quyền riêng tư do Google đặt ra.

### Không ghi âm được Speaking

Cấp quyền microphone, dùng HTTPS hoặc `localhost`, và dùng browser hỗ trợ `MediaRecorder`.

### Không đọc được XLSX

Deploy `parse-vocabulary-file` và kiểm tra người dùng đã đăng nhập.

### AI Coach chưa hoạt động

Kiểm tra function đã deploy và hai secrets `OPENAI_API_KEY`, `OPENAI_MODEL` đã được cấu hình.

## Giới hạn hiện tại

- Chấm text/number dùng so khớp đáp án đã chuẩn hóa, chưa có fuzzy matching hoặc nhiều đáp án tương đương.
- Writing và Speaking dùng self-check, chưa chấm IELTS rubric tự động.
- Google Drive dùng link chia sẻ, chưa có OAuth để duyệt Drive.
- DOCX được tải xuống; preview phụ thuộc browser hoặc dịch vụ ngoài.
- Event stream đã có nhưng chưa có trang Analytics chuyên sâu toàn hệ thống.
- AI classification, Writing feedback và Speaking transcription chưa được tích hợp đầy đủ.

## Scripts

| Lệnh | Công dụng |
| --- | --- |
| `npm run dev` | Chạy development server |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run build` | Build static production vào `out/` |
| `npm run start` | Chạy Next server; dự án hiện ưu tiên static export |

## Trạng thái dự án

Dự án đã có Personal Roadmap, Weekly Sprint, Daily Session Runner, Task/Attempt/Grading, Bug Tracker/Retest, KPI/Retrospective, Carry-over/Next Week, Skill Practice, Material Library, Community Content, Vocabulary, AI Coach cơ bản và Learning Event Stream.

Các hướng phát triển tiếp theo phù hợp là Analytics chuyên sâu, AI chấm Writing/Speaking, OAuth Google Drive, thông báo lịch học và adaptive learning dựa trên event history.
