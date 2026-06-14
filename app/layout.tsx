import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AxeProvider } from "@/components/axe-provider";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "WatchIT Tower — Monitoramento de Rede",
  description: "WatchIT Tower — Monitoramento de equipamentos de TI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${jetbrainsMono.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AxeProvider>
            <TooltipProvider>
              {children}
              <Toaster richColors />
            </TooltipProvider>
          </AxeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
