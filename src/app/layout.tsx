import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { getLocaleDir } from "@/i18n/config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.metadata");
  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: "/favicon.svg",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("common");

  return (
    <html lang={locale} dir={getLocaleDir(locale)} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          {/* Skip navigation links — visible on focus for keyboard users */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-surface-900 focus:text-text-primary focus:rounded-md focus:outline-2 focus:outline-brand-500"
          >
            {t("skipToMain")}
          </a>
          <a
            href="#sidebar-navigation"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-surface-900 focus:text-text-primary focus:rounded-md focus:outline-2 focus:outline-brand-500"
          >
            {t("skipToNav")}
          </a>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            forcedTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
          <Toaster theme="dark" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
