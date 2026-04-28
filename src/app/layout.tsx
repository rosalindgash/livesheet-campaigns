import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveSheet Campaigns",
  description: "Single-user Google Sheets and Gmail outreach sequencer.",
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
