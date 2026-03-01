import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useSimulation } from "./hooks/useSimulation";
import Dashboard from "./pages/Dashboard/Dashboard";
import MapView from "./pages/MapView/MapView";

export default function App() {
  useSimulation();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapView />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
