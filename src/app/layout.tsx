import type { Metadata } from "next";
import type { ReactNode } from "react";
import NotificationCenter from "@/components/NotificationCenter";
import "./globals.css";

export const metadata: Metadata = {
  title: "inady KANBAN",
  description: "Drive Cursor and Claude CLI coding agents from a localhost Kanban board",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <NotificationCenter />
      </body>
    </html>
  );
}
