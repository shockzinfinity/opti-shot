import { HashRouter, Routes, Route } from 'react-router-dom'
import { HeaderBar } from './components/HeaderBar'
import { Dashboard } from './pages/Dashboard'
import { FolderSelect } from './pages/FolderSelect'
import { ScanProgress } from './pages/ScanProgress'
import { GroupReview } from './pages/GroupReview'
import { Export } from './pages/Export'
import { Trash } from './pages/Trash'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    <HashRouter>
      <div className="flex flex-col h-screen bg-surface-primary text-foreground-primary font-body">
        {/* macOS traffic light zone — draggable, sits above header */}
        <div className="h-9 shrink-0 app-drag" />

        <HeaderBar />

        <main className="flex-1 min-h-0 flex flex-col">
          <Routes>
            <Route path="/" element={<ScrollPage><Dashboard /></ScrollPage>} />
            <Route path="/folders" element={<ScrollPage><FolderSelect /></ScrollPage>} />
            <Route path="/scan" element={<ScrollPage><ScanProgress /></ScrollPage>} />
            <Route path="/review" element={<FullPage><GroupReview /></FullPage>} />
            <Route path="/export" element={<ScrollPage><Export /></ScrollPage>} />
            <Route path="/trash" element={<ScrollPage><Trash /></ScrollPage>} />
            <Route path="/settings" element={<ScrollPage><Settings /></ScrollPage>} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

/** Wrapper for pages that need full-height non-scrollable layout (e.g. review) */
function FullPage({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col flex-1 min-h-0 h-full">{children}</div>
}

/** Wrapper for pages that scroll normally */
function ScrollPage({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 overflow-auto">{children}</div>
}
