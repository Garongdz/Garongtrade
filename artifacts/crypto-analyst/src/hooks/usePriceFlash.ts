import { useState, useEffect, useRef } from "react";

export function usePriceFlash(price: number | undefined): string {
  const [cls, setCls] = useState("");
  const prevRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (price === undefined) return;
    if (prevRef.current !== undefined && price !== prevRef.current) {
      const newCls =
        price > prevRef.current ? "price-flash-up" : "price-flash-down";
      setCls(newCls);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCls(""), 700);
    }
    prevRef.current = price;
    return () => clearTimeout(timerRef.current);
  }, [price]);

  return cls;
}
