import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const C = {
  bg: "#0B0E11", surface: "#181A20", border: "#2B3139",
  text: "#EAECEF", muted: "#848E9C",
  yellow: "#F0B90B", green: "#0ECB81", red: "#F6465D",
};

type DotState = "idle" | "filled" | "error" | "success";
type MsgType = "error" | "success" | "warning" | "";

export default function LoginPage() {
  const { login } = useAuth();
  const [pin, setPin]           = useState("");
  const [locked, setLocked]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dotState, setDotState] = useState<DotState>("idle");
  const [shake, setShake]       = useState(false);
  const [msg, setMsg]           = useState<{ text: string; type: MsgType }>({ text: "", type: "" });

  const triggerShake = useCallback(() => {
    setShake(false);
    setTimeout(() => setShake(true), 10);
  }, []);

  const updateDots = useCallback((state: DotState) => setDotState(state), []);

  const pressNum = useCallback((num: string) => {
    if (locked || submitting) return;
    setPin((p) => {
      if (p.length >= 6) return p;
      return p + num;
    });
    updateDots("filled");
  }, [locked, submitting, updateDots]);

  const backspace = useCallback(() => {
    if (locked || submitting) return;
    setPin((p) => p.slice(0, -1));
    setMsg({ text: "", type: "" });
  }, [locked, submitting]);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (pin.length === 6 && !submitting && !locked) {
      setSubmitting(true);
      login(pin).then((data) => {
        if (data.success) {
          updateDots("success");
          setMsg({ text: "Selamat datang!", type: "success" });
        } else if (data.locked) {
          setLocked(true);
          updateDots("error");
          triggerShake();
          let remaining: number = data.remaining ?? 30;
          const timer = setInterval(() => {
            setMsg({ text: `Terkunci selama ${remaining} detik`, type: "warning" });
            remaining--;
            if (remaining < 0) {
              clearInterval(timer);
              setLocked(false);
              setPin("");
              updateDots("idle");
              setMsg({ text: "", type: "" });
            }
          }, 1000);
        } else {
          updateDots("error");
          triggerShake();
          const left = data.attemptsLeft ?? 0;
          setMsg({
            text: left === 1 ? "PIN salah — 1 percobaan tersisa" : "PIN salah, coba lagi",
            type: "error",
          });
          setTimeout(() => {
            setPin("");
            updateDots("idle");
          }, 600);
        }
        setSubmitting(false);
      }).catch(() => {
        setMsg({ text: "Koneksi gagal, coba lagi", type: "error" });
        setPin("");
        updateDots("idle");
        setSubmitting(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") pressNum(e.key);
      else if (e.key === "Backspace") backspace();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pressNum, backspace]);

  const dotColor = (i: number): string => {
    const filled = i < pin.length;
    if (dotState === "success") return C.green;
    if (dotState === "error" && filled) return C.red;
    if (filled) return C.yellow;
    return "transparent";
  };

  const dotBorder = (i: number): string => {
    const filled = i < pin.length;
    if (dotState === "success") return C.green;
    if (dotState === "error" && filled) return C.red;
    if (filled) return C.yellow;
    return C.border;
  };

  const msgColor = msg.type === "error" ? C.red : msg.type === "success" ? C.green : C.yellow;

  const numpad = [
    ["1","2","3"],
    ["4","5","6"],
    ["7","8","9"],
    ["","0","back"],
  ];

  return (
    <div
      style={{ background: C.bg, minHeight: "100vh" }}
      className="flex items-center justify-center"
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "40px 36px",
          width: 340,
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <div
            style={{
              background: C.yellow, borderRadius: 8,
              width: 36, height: 36,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: "#000",
            }}
          >G</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
            Garong<span style={{ color: C.yellow }}>'Space</span>
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 32, letterSpacing: ".3px" }}>
          Trading Intelligence Platform
        </div>

        {/* Dots */}
        <div
          className="flex justify-center gap-3.5 mb-6"
          style={{ animation: shake ? "shake .5s ease" : "none" }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              style={{
                width: 14, height: 14,
                borderRadius: "50%",
                border: `2px solid ${dotBorder(i)}`,
                background: dotColor(i),
                transition: "all .15s",
                transform: i < pin.length ? "scale(1.1)" : "scale(1)",
              }}
            />
          ))}
        </div>

        {/* Message */}
        <div style={{ fontSize: 12, height: 18, color: msgColor, marginBottom: 16, transition: "all .2s" }}>
          {msg.text}
        </div>

        {/* Numpad */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {numpad.flat().map((key, idx) => {
            if (key === "") return <div key={idx} />;
            return (
              <button
                key={idx}
                onClick={() => key === "back" ? backspace() : pressNum(key)}
                disabled={locked || submitting}
                style={{
                  background: "#1E2329",
                  border: `1px solid ${C.border}`,
                  borderRadius: "50%",
                  width: 64, height: 64,
                  fontSize: key === "back" ? 18 : 20,
                  fontWeight: 500,
                  color: key === "back" ? C.muted : C.text,
                  cursor: locked || submitting ? "not-allowed" : "pointer",
                  margin: "0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all .1s",
                  opacity: locked || submitting ? 0.5 : 1,
                  userSelect: "none",
                }}
                onMouseEnter={(e) => { if (!locked && !submitting) (e.currentTarget.style.background = "#2B3139"); }}
                onMouseLeave={(e) => { (e.currentTarget.style.background = "#1E2329"); }}
                onMouseDown={(e) => { if (!locked && !submitting) (e.currentTarget.style.transform = "scale(0.92)"); }}
                onMouseUp={(e) => { (e.currentTarget.style.transform = "scale(1)"); }}
              >
                {key === "back" ? "⌫" : key}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: "#444", marginTop: 8 }}>
          Platform ini dilindungi akses pribadi
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          15%{transform:translateX(-8px)}
          30%{transform:translateX(8px)}
          45%{transform:translateX(-6px)}
          60%{transform:translateX(6px)}
          75%{transform:translateX(-3px)}
          90%{transform:translateX(3px)}
        }
      `}</style>
    </div>
  );
}
