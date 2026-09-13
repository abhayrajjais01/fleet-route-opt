import './globals.css';
import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import QueryProvider from '@/components/providers/QueryProvider';
import { AuthProvider } from '@/lib/authContext';

export const metadata: Metadata = {
  title: 'AI Fleet Route Optimizer',
  description: 'Enterprise-grade AI solution for Fleet Route Optimization with VRPTW and LangGraph Copilot',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-command-bg text-slate-100 flex flex-col min-h-screen">
        <QueryProvider>
          <AuthProvider>
            <Navbar />
            <div className="flex flex-1">
              <Sidebar />
              <main className="flex-1 p-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
                {children}
              </main>
            </div>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
