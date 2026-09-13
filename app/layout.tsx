import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "IB Study AI",
  description: "A private standalone AI tutor for IB Physics, Chemistry and Mathematics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
