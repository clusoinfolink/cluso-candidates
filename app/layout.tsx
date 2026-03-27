import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cluso Candidates Portal",
  description: "Candidate portal for completing verification service forms",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
