import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const heading = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--tabular-nums",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Budget & Tracking | Cap & Gown",
  description: "Semester budget management for Cap & Gown",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes stamps the theme class onto <html> before hydration, so the
    // server and client markup differ by design on this one element.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${heading.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
