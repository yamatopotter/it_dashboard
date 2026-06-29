import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AxeProvider } from "@/components/axe-provider";
import { PwaRegister } from "@/components/pwa-register";

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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WatchIT Tower",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce forwarded by middleware.ts — lets next-themes nonce its inline anti-flash script
  const nonce = (await headers()).get("X-Nonce") ?? undefined;

  return (
    <html lang="pt-BR" className={`${manrope.variable} ${jetbrainsMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#5544e5" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          <AxeProvider>
            <TooltipProvider>
              {children}
              <Toaster richColors />
            </TooltipProvider>
          </AxeProvider>
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
