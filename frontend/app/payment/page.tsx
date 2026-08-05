"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import styles from "./payment.module.css";

type PaymentResult = {
  status: "success" | "loading" | "error";
  message: string;
  order?: {
    id: string;
    total: number;
    status: string;
  };
  error?: string;
};

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference");
  
  const [result, setResult] = useState<PaymentResult>({
    status: "loading",
    message: "Verifying payment...",
  });
  
  const businessName = getActiveBusinessName();

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }

    if (!reference) {
      setResult({
        status: "error",
        message: "No payment reference found.",
        error: "Missing reference parameter",
      });
      return;
    }

    verifyPayment();
  }, [reference, router]);

  async function verifyPayment() {
    try {
      const response = await api.verifyPayment(reference!);
      
      setResult({
        status: "success",
        message: "Payment verified successfully!",
        order: response.order,
      });

      // Auto-redirect to POS after 3 seconds
      const timer = setTimeout(() => {
        router.push("/pos");
      }, 3000);

      return () => clearTimeout(timer);
    } catch (err: any) {
      setResult({
        status: "error",
        message: "Payment verification failed.",
        error: err.message || "Unknown error occurred",
      });
    }
  }

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.container}>
          {result.status === "loading" && (
            <div className={styles.card}>
              <div className={styles.iconWrapper}>
                <Loader size={48} className={styles.loadingIcon} />
              </div>
              <h1 className={styles.title}>Verifying Payment</h1>
              <p className={styles.message}>{result.message}</p>
              <div className={styles.spinner} />
            </div>
          )}

          {result.status === "success" && (
            <div className={styles.card}>
              <div className={styles.iconWrapper}>
                <CheckCircle2 size={48} className={styles.successIcon} />
              </div>
              <h1 className={styles.title}>Payment Successful!</h1>
              <p className={styles.message}>{result.message}</p>

              {result.order && (
                <div className={styles.orderDetails}>
                  <div className={styles.detailRow}>
                    <span>Order ID:</span>
                    <strong>{result.order.id}</strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Amount:</span>
                    <strong>{formatMoney(result.order.total, "KES")}</strong>
                  </div>
                  <div className={styles.detailRow}>
                    <span>Status:</span>
                    <strong className={styles.statusBadge}>{result.order.status}</strong>
                  </div>
                </div>
              )}

              <p className={styles.redirectMessage}>Redirecting to POS in 3 seconds...</p>
              <button className="btn-primary" onClick={() => router.push("/pos")}>
                Back to POS
              </button>
            </div>
          )}

          {result.status === "error" && (
            <div className={styles.card}>
              <div className={styles.iconWrapper}>
                <AlertCircle size={48} className={styles.errorIcon} />
              </div>
              <h1 className={styles.title}>Payment Failed</h1>
              <p className={styles.message}>{result.message}</p>
              
              {result.error && (
                <div className={styles.errorDetails}>
                  <p>Error: {result.error}</p>
                </div>
              )}

              <button className="btn-primary" onClick={() => router.push("/pos")}>
                Back to POS
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
