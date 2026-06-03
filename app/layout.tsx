import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoadLight — Balance Your Load, Lighten Your Mind",
  description: "AI-powered task management with mental health awareness. Know when you're doing too much.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
