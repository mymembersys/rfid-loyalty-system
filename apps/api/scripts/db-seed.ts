import bcrypt from "bcryptjs";
import { pool } from "../src/db/client";

async function main() {
  // eslint-disable-next-line no-console
  console.log("[db:seed] seeding dev data…");

  // Branches
  const branches = [
    { code: "DG-MAIN", name: "Diagnostic Clinic - Main",      service_line: "diagnostic"    },
    { code: "PS-MAIN", name: "Psychological Clinic - Main",    service_line: "psychological" },
    { code: "GY-MAIN", name: "Wellness Gym - Main",            service_line: "gym"           },
  ];

  for (const b of branches) {
    await pool.query(
      `INSERT INTO branches (code, name, service_line)
       VALUES ($1,$2,$3)
       ON CONFLICT (code) DO NOTHING`,
      [b.code, b.name, b.service_line]
    );
  }

  // Users
  const users = [
    { email: "admin@example.com",     pw: "admin123",   name: "HQ Admin",       role: "admin"     },
    { email: "manager@example.com",   pw: "manager123", name: "Branch Manager", role: "manager"   },
    { email: "frontdesk@example.com", pw: "front123",   name: "Front Desk",     role: "frontdesk" },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.pw, 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, hash, u.name, u.role]
    );
  }

  // Stamp rules
  const rules = [
    { service_line: "diagnostic",    stamps_required: 4,  cooldown_minutes: 1440 },
    { service_line: "psychological", stamps_required: 5,  cooldown_minutes: 1440 },
    { service_line: "gym",           stamps_required: 10, cooldown_minutes: 720  },
  ];
  for (const r of rules) {
    await pool.query(
      `INSERT INTO stamp_rules (service_line, stamps_required, cooldown_minutes)
       VALUES ($1,$2,$3)`,
      [r.service_line, r.stamps_required, r.cooldown_minutes]
    );
  }

  // Sample rewards
  const rewards = [
    { code: "DG-DISC-20", name: "20% off next diagnostic package", service_line: "diagnostic",    stamps_cost: 4,  validity_days: 90 },
    { code: "PS-FREE-FU", name: "Free follow-up therapy session",  service_line: "psychological", stamps_cost: 5,  validity_days: 60 },
    { code: "GY-FREE-DAY", name: "Free 1-day gym pass for guest",  service_line: "gym",           stamps_cost: 10, validity_days: 30 },
  ];
  for (const rw of rewards) {
    await pool.query(
      `INSERT INTO rewards (code, name, service_line, stamps_cost, validity_days)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (code) DO NOTHING`,
      [rw.code, rw.name, rw.service_line, rw.stamps_cost, rw.validity_days]
    );
  }

  // eslint-disable-next-line no-console
  console.log("[db:seed] done.");
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[db:seed] failed:", err);
  process.exit(1);
});
