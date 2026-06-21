"use client";

import { useEffect, useState } from "react";
import { getRole, type Role } from "./role";

// Reads the stored role on the client. Returns null until mounted to avoid a
// server/client hydration mismatch (getRole reads localStorage/cookies).
export function useRole(): Role | null {
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    setRole(getRole());
  }, []);

  return role;
}
