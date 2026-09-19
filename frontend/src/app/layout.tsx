import './globals.css';
import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import QueryProvider from '@/components/providers/QueryProvider';
import { AuthProvider } from '@/lib/authContext';

export const metadata: Metadata = {
  title: 'FleetOpt Command | Enterprise Fleet & Route Optimization',
  description: 'Enterprise-grade Autonomous Fleet Dispatch, VRPTW Spatial Routing, and Multi-Agent GenAI Logistics Copilot',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080c14] text-slate-100 flex flex-col min-h-screen antialiased selection:bg-blue-600 selection:text-white">
        <QueryProvider>
          <AuthProvider>
            <Navbar />
            <div className="flex flex-1">
              <Sidebar />
              <main className="flex-1 p-6 md:p-8 overflow-y-auto max-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#0a0f1d]/50 to-[#080c14]">
                {children}
              </main>
            </div>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
