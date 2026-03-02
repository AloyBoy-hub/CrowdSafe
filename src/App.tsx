import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard/Dashboard";
import MapView from "./pages/MapView/MapView";
import LandingPage from "./pages/Landing/LandingPage";

function AppShell() {
  const location = useLocation();
  const onDashboard = location.pathname === "/dashboard";
  const mapMounted = location.pathname === "/map" || onDashboard;

  return (
    <>
      {mapMounted ? (
        <div className={onDashboard ? "fixed inset-0 invisible pointer-events-none" : "fixed inset-0"}>
          <MapView />
        </div>
      ) : null}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/map" element={null} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
