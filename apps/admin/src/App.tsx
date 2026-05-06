import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Members } from "./pages/Members";
import { MemberDetail } from "./pages/MemberDetail";
import { Branches } from "./pages/Branches";
import { Rewards } from "./pages/Rewards";
import { StampRules } from "./pages/StampRules";
import { Reports } from "./pages/Reports";
import { Users } from "./pages/Users";
import { Settings } from "./pages/Settings";
import { ServiceLines } from "./pages/ServiceLines";
import { useAuth } from "./api/auth";

export function App() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={token ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/members" element={<Members />} />
        <Route path="/members/:id" element={<MemberDetail />} />
        <Route path="/branches" element={<Branches />} />
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/stamp-rules" element={<StampRules />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/service-lines" element={<ServiceLines />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
