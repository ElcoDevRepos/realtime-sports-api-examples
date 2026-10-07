import './globals.css';

export const metadata = {
  title: 'Live Scoreboard',
  description: 'Live scores powered by the Realtime Sports API'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
