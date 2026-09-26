import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IELTS Lab — Personal Dashboard",
  description: "Dashboard IELTS cá nhân: mục tiêu, sổ lỗi, lịch học và nhật ký.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
