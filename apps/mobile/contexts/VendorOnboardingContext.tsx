// ============================================================
// VARS — Vendor Onboarding Context
// Carries pioneer status across all onboarding steps so the
// layout can show the Pioneer banner without per-screen queries.
// ============================================================
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface VendorOnboardingState {
  isPioneer: boolean;
}

const VendorOnboardingContext = createContext<VendorOnboardingState>({ isPioneer: false });

export function VendorOnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isPioneer, setIsPioneer] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('vendors')
      .select('pioneer')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data?.pioneer) setIsPioneer(true); });
  }, [user]);

  return (
    <VendorOnboardingContext.Provider value={{ isPioneer }}>
      {children}
    </VendorOnboardingContext.Provider>
  );
}

export const useVendorOnboarding = () => useContext(VendorOnboardingContext);
