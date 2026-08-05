import "./globals.css";

export const metadata = {
  title: "POS",
  description: "Multi-tenant point of sale",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
