import type { Metadata } from "next";
import Script from "next/script";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-pjs",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Cluso Infolink Candidates Portal",
  description: "Candidate portal for completing verification service forms",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={plusJakartaSans.variable}>
      <body className="font-sans antialiased">
        <Script id="performance-api-polyfill" strategy="beforeInteractive">
          {`(function () {
  if (typeof window === "undefined" || !window.performance) return;
  var perf = window.performance;
  var noop = function () {};

  if (typeof perf.clearMarks !== "function") {
    try {
      perf.clearMarks = noop;
    } catch (e) {
      try {
        Object.defineProperty(perf, "clearMarks", {
          configurable: true,
          writable: true,
          value: noop,
        });
      } catch (_) {}
    }
  }

  if (typeof perf.clearMeasures !== "function") {
    try {
      perf.clearMeasures = noop;
    } catch (e) {
      try {
        Object.defineProperty(perf, "clearMeasures", {
          configurable: true,
          writable: true,
          value: noop,
        });
      } catch (_) {}
    }
  }
})();`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
