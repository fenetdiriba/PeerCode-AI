import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeerCode AI",
  description: "Real-time collaborative code editor"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-gray-100 antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
