import { Route, Routes } from "react-router-dom";
import TopBar from "./components/TopBar";
import TenantsView from "./views/TenantsView";
import TenantView from "./views/TenantView";
import PageEditor from "./views/PageEditor";

export default function App() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<TenantsView />} />
          <Route path="/:slug" element={<TenantView />} />
          <Route path="/:slug/page/*" element={<PageEditor />} />
        </Routes>
      </div>
    </div>
  );
}
