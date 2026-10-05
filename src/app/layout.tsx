import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeerScore",
  description:
    "Open-source index of researchers worldwide with LLM-powered publication analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
