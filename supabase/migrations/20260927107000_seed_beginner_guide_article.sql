begin;

alter table public.content_articles
  alter column author_id drop not null,
  add column is_system boolean not null default false,
  add column system_key text,
  add constraint content_articles_system_owner_valid check (
    (is_system and author_id is null and system_key is not null)
    or (not is_system and author_id is not null and system_key is null)
  ),
  add constraint content_articles_system_key_unique unique (system_key);

insert into public.content_articles (
  author_id,
  is_system,
  system_key,
  title,
  slug,
  excerpt,
  content,
  content_format,
  category,
  tags,
  focus_keyword,
  seo_title,
  seo_description,
  schema_type,
  status,
  reading_minutes,
  published_at
) values (
  null,
  true,
  'beginner-website-guide-v1',
  'Hướng dẫn sử dụng IELTS Lab cho người mới từ A–Z',
  'huong-dan-su-dung-ielts-lab-cho-nguoi-moi',
  'Hướng dẫn thiết lập lộ trình, thêm tài liệu, tạo Weekly Sprint, học theo ngày, ghi Sổ lỗi, retest và theo dõi KPI trên IELTS Lab.',
  $article$
# Hướng dẫn sử dụng IELTS Lab cho người mới từ A–Z

IELTS Lab là hệ thống hỗ trợ bạn xây dựng và theo dõi lộ trình học IELTS cá nhân. Thay vì chỉ ghi chú bài đã học, website tổ chức quá trình học theo một quy trình hoàn chỉnh:

Đánh giá đầu vào → Tạo lộ trình → Lập Weekly Sprint → Học theo ngày → Làm bài và chấm → Phân tích lỗi → Retest → Đánh giá KPI → Tạo tuần tiếp theo.

## 1. Tạo tài khoản và đăng nhập

Hãy tạo tài khoản bằng email và đăng nhập. Mỗi tài khoản có không gian dữ liệu riêng. Lộ trình, bài học, tài liệu, kết quả luyện tập, bản ghi âm và Sổ lỗi của bạn được bảo vệ bằng Row Level Security.

Sau khi đăng nhập, bạn sẽ thấy các khu vực chính: Tổng quan, Sprint, Lộ trình, Nội dung, Sổ lỗi và Hành trình.

## 2. Thiết lập lộ trình IELTS

Mở trang **Lộ trình** và tạo lộ trình học đầu tiên. Bạn cần nhập:

- Band hiện tại và band mục tiêu.
- Ngày bắt đầu, ngày kết thúc và ngày thi dự kiến.
- Tổng số phút có thể học mỗi tuần.
- Những ngày bạn có thể học.
- Mô tả mục tiêu cá nhân.

Sau khi tạo, hệ thống chuẩn bị các giai đoạn học ban đầu. Bạn có thể sửa, xóa hoặc thêm giai đoạn mới.

## 3. Làm bài đánh giá đầu vào

Trong phần **Công cụ học tập thông minh**, chọn **Đánh giá đầu vào** và nhập số câu đúng Listening, Reading cùng band Writing, Speaking gần nhất.

Kết quả giúp hệ thống xác định điểm xuất phát, kỹ năng yếu và mức ưu tiên khi sinh lịch học. Nếu chưa có điểm chính thức, bạn có thể nhập mức tự đánh giá và cập nhật lại sau.

## 4. Thêm tài liệu học tập

Trong trang Lộ trình, mở **Kho tài liệu của bạn**. Có ba cách thêm tài liệu.

### Upload file cá nhân

Website hỗ trợ PDF, DOC, DOCX và TXT tối đa 50 MB. File được lưu riêng tư trong Supabase Storage và chỉ tài khoản của bạn có quyền truy cập.

### Thêm Google Drive

Bạn có thể lưu đường dẫn Google Drive, Google Docs, Sheets hoặc Slides. Để preview tài liệu trong website, hãy bật quyền chia sẻ phù hợp, ví dụ **Anyone with the link**.

Website chỉ lưu đường dẫn và metadata, không lưu tài khoản hoặc mật khẩu Google.

### Thêm liên kết bên ngoài

Bạn cũng có thể lưu website học IELTS, video bài giảng, bài báo hoặc công cụ luyện tập.

Hãy thêm thư mục, tags và kỹ năng liên quan để có thể tìm lại tài liệu nhanh chóng.

## 5. Tạo Weekly Sprint

Mở trang **Sprint** và chọn **Tạo Weekly Sprint**. Một Sprint tương ứng với một tuần học.

Bạn cần đặt ngày bắt đầu, tên Sprint, mục tiêu tuần và target cho từng kỹ năng. Website sẽ tạo Daily Session dựa trên những ngày học đã chọn trong lộ trình.

Ví dụ mục tiêu tuần: Hoàn thành Reading Section 2 với ít nhất 65% khi bấm giờ.

## 6. Gắn tài liệu bằng Source Mapping

Mỗi Daily Session nên được gắn với một tài liệu cụ thể. Khi tạo Source Mapping, bạn có thể chọn trực tiếp từ kho tài liệu cá nhân rồi nhập:

- Unit và section.
- Trang bắt đầu, trang kết thúc.
- Audio track và script page.
- Phạm vi bài tập.
- Ghi chú riêng.

Khi bắt đầu buổi học, bạn có thể mở đúng tài liệu mà không phải tìm lại.

## 7. Thêm task cho buổi học

Nhấn **Tasks** tại Daily Session để thêm bài tập. Hệ thống hỗ trợ Warm-up, Practice, Listening, Reading, Writing, Speaking và Review.

Bạn có thể chọn workflow phù hợp:

- Listening Prediction: Anchor → Target Type → Prediction → Paraphrase → Answer.
- Reading Evidence: Keyword → Predict Paraphrase → Paragraph → Evidence → Answer.
- Sentence Completion: Word Type → Grammar Pattern → Predicted Meaning → Answer.
- Writing A-R-E-A: Brainstorm → Idea → Assertion → Reason → Explanation → Example.
- Speaking Cue Card: Notes → Sentence Library → Record → Self Review.

## 8. Bắt đầu Daily Session

Nhấn **Start Session**, mở tài liệu và làm lần lượt từng task. Với mỗi câu, hãy nhập câu trả lời và evidence hoặc vị trí tìm thấy đáp án.

Đối với Speaking, trình duyệt sẽ yêu cầu quyền microphone. Bạn có thể ghi âm, nghe lại và thực hiện lại bài nói. Ghi âm hoạt động trên localhost hoặc website sử dụng HTTPS.

## 9. Phân tích lỗi

Khi trả lời sai, website yêu cầu bạn xác định Error Type, Root Cause và Refactor Rule.

Ví dụ:

- Error Type: GRAMMAR_PREDICTION.
- Root Cause: Không nhận ra cấu trúc “both ___ and ___” yêu cầu danh từ.
- Refactor Rule: Luôn dự đoán từ loại trước khi scan bài đọc.

Không nên chỉ ghi “không cẩn thận”. Root cause càng cụ thể thì lần retest càng có giá trị.

## 10. Kết thúc session

Sau khi hoàn thành task, nhập thời lượng thực tế và ghi chú cuối buổi. Khi chọn **End Session**, hệ thống tự động:

- Tạo Session Result.
- Cập nhật Daily Lesson.
- Tạo Study Log.
- Cập nhật điểm và tiến độ Sprint.
- Ghi nhận số lỗi mới.

Bạn không cần nhập lại nhật ký học bằng tay.

## 11. Sử dụng Sổ lỗi và Retest

Vòng đời của một lỗi là OPEN → FIXING → RETEST_DUE → RESOLVED. Nếu retest chưa đạt, lỗi chuyển thành REOPENED và tiếp tục được lên lịch.

Khi retest, hãy làm lại mà không nhìn đáp án. Chỉ chọn Pass khi bạn trả lời đúng một cách độc lập.

## 12. Theo dõi KPI

KPI tổng theo Sprint gồm tỷ lệ hoàn thành session, task accuracy, thời gian học, retest pass rate, số lỗi mới, số lỗi đã giải quyết, carry-over và Overall Quality Score.

Mỗi kỹ năng còn có target, actual, số attempt đúng, tổng thời gian học và số lỗi. Trạng thái KPI gồm PASS, NOT_MET hoặc NO_DATA.

## 13. Viết Weekly Retrospective

Cuối tuần, hãy ghi mức năng lượng, mức tự tin, những điều làm tốt, khó khăn và ba nhóm hành động Stop, Start, Continue.

Cuối cùng, đặt một trọng tâm cụ thể cho tuần tiếp theo. Ví dụ: “Retest lỗi Reading sau ba ngày và luôn ghi evidence”.

## 14. Sinh tuần học tiếp theo

Chọn **Tạo tuần kế tiếp**. Website sẽ tìm session chưa hoàn thành, chuyển chúng sang tuần mới, giữ task và Source Mapping, đồng thời điền các ngày học còn trống.

## Cách bắt đầu đơn giản nhất

Trong tuần đầu tiên, bạn chỉ cần thực hiện:

Tạo lộ trình → Đánh giá đầu vào → Thêm một tài liệu → Tạo Sprint → Hoàn thành một session → Ghi lỗi → Retest.

Không cần sử dụng tất cả tính năng ngay lập tức. Điều quan trọng nhất là học đều, lưu evidence và phân tích nguyên nhân thật sự của mỗi lỗi.

## Câu hỏi thường gặp

### Tôi có cần tạo lộ trình trước không?

Có. Weekly Sprint, lịch học, tài liệu và KPI nên thuộc một lộ trình cụ thể.

### Tôi có thể tải Word hoặc PDF không?

Có. Website hỗ trợ PDF, DOC, DOCX và TXT tối đa 50 MB.

### Website có lưu tài khoản Google không?

Không. Website chỉ lưu đường dẫn Google Drive và metadata tài liệu.

### Tôi có thể ghi âm Speaking không?

Có. Bạn cần cấp quyền microphone và sử dụng HTTPS hoặc localhost.

### Câu sai có tự động vào Sổ lỗi không?

Có. Attempt sai tạo Bug liên kết với task và session tương ứng.

### Website có tự tạo tuần tiếp theo không?

Có. Next Week Generator sử dụng session chưa hoàn thành, KPI và Weekly Retrospective để tạo tuần mới.
  $article$,
  'markdown',
  'Hướng dẫn sử dụng',
  array['IELTS Lab', 'lộ trình IELTS', 'Weekly Sprint', 'Sổ lỗi IELTS', 'học IELTS'],
  'hướng dẫn sử dụng IELTS Lab',
  'Hướng dẫn sử dụng IELTS Lab cho người mới từ A–Z',
  'Hướng dẫn thiết lập lộ trình, thêm tài liệu, tạo Weekly Sprint, học theo ngày, ghi Sổ lỗi và theo dõi KPI trên IELTS Lab.',
  'HowTo',
  'published',
  12,
  now()
)
on conflict (slug) do nothing;

commit;
