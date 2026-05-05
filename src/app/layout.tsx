import type { Metadata } from "next";
import { Source_Sans_3, Merriweather } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "arial", "sans-serif"],
});

const merriweather = Merriweather({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  preload: true,
  weight: ["400", "600", "700"],
  fallback: ["georgia", "serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'),
  title: "RS Ticketing System",
  description: "Task management and reporting for Romega Solutions",
  icons: {
    icon: [
      { url: "/images/rs-icon.png", type: "image/png" },
      { url: "/images/rs-favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/images/rs-favicon.ico",
    apple: "/images/rs-icon.png",
  },
  openGraph: {
    title: "RS Ticketing System",
    description: "Task management and reporting for Romega Solutions",
    siteName: "Romega Solutions",
    images: [{ url: "/images/rs-og-bg.png", width: 1200, height: 630 }],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${merriweather.variable} h-full`}
      data-theme="light"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
