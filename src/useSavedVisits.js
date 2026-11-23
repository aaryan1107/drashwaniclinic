import { useEffect, useState } from "react";
import { savedVisitState } from "./booking.js";
import { supabase } from "./supabase.js";

export function useSavedVisits(userId) {
  const [state, setState] = useState({ saved: [], savedError: false, loadingSaved: Boolean(userId) });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let requestVersion = 0;
    const reload = async () => {
      const version = ++requestVersion;
      try {
        const { data: visits, error } = await supabase.from("appointment_requests")
          .select("id,appointment_date,appointment_time,clinic_name,reason,payment_reference,payment_status,status")
          .eq("patient_id", userId).eq("mode", "Clinic visit").not("payment_reference", "is", null)
          .order("appointment_date", { ascending: false }).order("created_at", { ascending: false }).limit(10);
        if (error) throw error;
        const refs = visits.map((visit) => visit.payment_reference).filter(Boolean);
        const { data: payments, error: paymentError } = refs.length ? await supabase.from("consultation_payments")
          .select("razorpay_payment_id,payment_status")
          .filter("patient->>user_id", "eq", userId).in("razorpay_payment_id", refs) : { data: [] };
        if (paymentError) throw paymentError;
        if (!active || version !== requestVersion) return;
        const byReference = new Map((payments || []).map((row) => [row.razorpay_payment_id, row]));
        setState({ saved: visits.map((visit) => ({ visit, state: savedVisitState(visit, byReference.get(visit.payment_reference)) })), savedError: false, loadingSaved: false });
      } catch {
        if (active && version === requestVersion) {
          setState((current) => ({ ...current, savedError: true, loadingSaved: false }));
        }
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, refresh]);

  return { ...state, reload: () => setRefresh((current) => current + 1) };
}
