import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { AppLayout } from "@/components/layout/AppLayout"
import { DashboardPage } from "@/pages/DashboardPage"
import { BenchmarksListPage } from "@/pages/BenchmarksListPage"
import { BenchmarkDetailPage } from "@/pages/BenchmarkDetailPage"
import { BenchmarkEditPage } from "@/pages/BenchmarkEditPage"
import { CompetitorEditPage } from "@/pages/CompetitorEditPage"
import { CompetitorsPage } from "@/pages/CompetitorsPage"
import { TrashPage } from "@/pages/TrashPage"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="benchmarks" element={<BenchmarksListPage />} />
          <Route path="benchmarks/:id" element={<BenchmarkDetailPage />} />
          <Route path="benchmarks/:id/edit" element={<BenchmarkEditPage />} />
          <Route
            path="benchmarks/:id/competitors/:competitorId"
            element={<CompetitorEditPage />}
          />
          <Route path="competitors" element={<CompetitorsPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  )
}

export default App
