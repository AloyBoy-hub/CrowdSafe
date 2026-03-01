import { BrowserRouter, Route, Routes } from "react-router-dom";
import NavBar from "./components/NavBar";
import { useSimulation } from "./hooks/useSimulation";
import Dashboard from "./pages/Dashboard/Dashboard";
import MapView from "./pages/MapView/MapView";

export default function App() {
  const { connectionState } = useSimulation();

  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <NavBar connectionState={connectionState} />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<MapView connectionState={connectionState} />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
