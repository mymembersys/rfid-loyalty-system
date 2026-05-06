import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../api/auth";
import { useBranding } from "../useBranding";

export function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const brand = useBranding();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer when navigating to a new page
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileOpen]);

  return (
    <div className={`layout ${mobileOpen ? "drawer-open" : ""}`}>
      <button
        type="button"
        className="mobile-toggle"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(v => !v)}
      >
        <span /><span /><span />
      </button>

      <div
        className="sidebar-overlay"
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand-block">
          {brand.logo_url
            ? <img className="brand-logo" src={brand.logo_url} alt="" />
            : <span className="brand-glyph" />}
          <h2 className="brand-name">{brand.brand_name}</h2>
        </div>
        <nav>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/members">Members</NavLink>
          <NavLink to="/branches">Branches</NavLink>
          <NavLink to="/rewards">Rewards</NavLink>
          <NavLink to="/stamp-rules">Stamp Rules</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          {user?.role === "admin" && <NavLink to="/service-lines">Service Lines</NavLink>}
          {user?.role === "admin" && <NavLink to="/users">Users</NavLink>}
          {user?.role === "admin" && <NavLink to="/settings">Settings</NavLink>}
        </nav>
        <div className="sidebar-foot">
          <div className="who">{user?.full_name} <small>({user?.role})</small></div>
          <button onClick={() => { logout(); nav("/login"); }}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
