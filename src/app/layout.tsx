import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: {
    default: "Content Studio",
    template: "%s · Content Studio",
  },
  description: "Agency content boards for every client.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${spaceGrotesk.variable} h-full`}
    >
      <body className="min-h-full bg-paper font-sans text-ink antialiased">
        <div className="h-1 bg-gold print:hidden" />
        {children}
      </body>
    </html>
  );
}
