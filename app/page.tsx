"use client"; 

import React, { useMemo, useState } from "react";

function toNum(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmt(n: number, digits = 2) {
  return n.toFixed(digits);
}

function impliedProb(decimalOdds: number) {
  return 1 / decimalOdds;
}

function fairFromProbs(probs: number[]) {
  const total = probs.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return 1 / total;
}

function poissonP(lambda: number, k: number) {
  if (!Number.isFinite(lambda) || lambda < 0) return 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
}

function bttsFirstHalf(home1H: number, away1H: number) {
  return (1 - Math.exp(-home1H)) * (1 - Math.exp(-away1H));
}

function totalGoalsProbOver(lambda: number, line: 0.5 | 1.5 | 2.5) {
  if (line === 0.5) return 1 - poissonP(lambda, 0);
  if (line === 1.5) return 1 - (poissonP(lambda, 0) + poissonP(lambda, 1));
  return 1 - (poissonP(lambda, 0) + poissonP(lambda, 1) + poissonP(lambda, 2));
}

function inferTotalLambdaFromOvers(p05: number | null, p15: number | null, p25: number | null) {
  let best = { lambda: 1.2, err: Infinity };
  for (let lambda = 0.05; lambda <= 4.5; lambda += 0.001) {
    let err = 0;
    if (p05 !== null) err += Math.pow(totalGoalsProbOver(lambda, 0.5) - p05, 2);
    if (p15 !== null) err += Math.pow(totalGoalsProbOver(lambda, 1.5) - p15, 2);
    if (p25 !== null) err += Math.pow(totalGoalsProbOver(lambda, 2.5) - p25, 2);
    if (err < best.err) best = { lambda, err };
  }
  return best.lambda;
}

function inferHomeShareFromHT1X2(totalLambda: number, homeProb: number | null, drawProb: number | null, awayProb: number | null) {
  let best = { share: 0.5, err: Infinity };
  for (let share = 0.05; share <= 0.95; share += 0.001) {
    const lh = totalLambda * share;
    const la = totalLambda * (1 - share);

    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;

    for (let h = 0; h <= 10; h++) {
      for (let a = 0; a <= 10; a++) {
        const p = poissonP(lh, h) * poissonP(la, a);
        if (h > a) pHome += p;
        else if (h === a) pDraw += p;
        else pAway += p;
      }
    }

    let err = 0;
    if (homeProb !== null) err += Math.pow(pHome - homeProb, 2);
    if (drawProb !== null) err += Math.pow(pDraw - drawProb, 2);
    if (awayProb !== null) err += Math.pow(pAway - awayProb, 2);
    if (err < best.err) best = { share, err };
  }
  return best.share;
}

function normalizeThreeWay(homeOdds: number, drawOdds: number, awayOdds: number) {
  const pH = 1 / homeOdds;
  const pD = 1 / drawOdds;
  const pA = 1 / awayOdds;
  const sum = pH + pD + pA;
  return {
    pHome: pH / sum,
    pDraw: pD / sum,
    pAway: pA / sum,
  };
}

function fitFirstGoalModel(homeOdds: number, drawOdds: number, awayOdds: number, zeroZeroOdds: number, bttsOdds: number | null) {
  if (homeOdds <= 1 || drawOdds <= 1 || awayOdds <= 1 || zeroZeroOdds <= 1) return null;

  const targets = normalizeThreeWay(homeOdds, drawOdds, awayOdds);
  const totalLambda = Math.log(zeroZeroOdds);
  if (!Number.isFinite(totalLambda) || totalLambda <= 0) return null;

  let best = { lh: totalLambda / 2, la: totalLambda / 2, err: Infinity };

  for (let share = 0.02; share <= 0.98; share += 0.001) {
    const lh = totalLambda * share;
    const la = totalLambda * (1 - share);

    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;

    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const p = poissonP(lh, i) * poissonP(la, j);
        if (i > j) pHome += p;
        else if (i === j) pDraw += p;
        else pAway += p;
      }
    }

    let err =
      Math.pow(pHome - targets.pHome, 2) +
      Math.pow(pDraw - targets.pDraw, 2) +
      Math.pow(pAway - targets.pAway, 2);

    if (bttsOdds !== null) {
      const targetBTTS = 1 / bttsOdds;
      const modelBTTS = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
      err += Math.pow(modelBTTS - targetBTTS, 2);
    }

    if (err < best.err) best = { lh, la, err };
  }

  return best;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 20 }}>
      <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 14, fontWeight: 600 }}>{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, fontSize: 14 }}
      />
    </div>
  );
}

function StatBox({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 16,
        border: dark ? "none" : "1px solid #ddd",
        background: dark ? "#111827" : "#fff",
        color: dark ? "#fff" : "#111",
      }}
    >
      <div style={{ fontSize: 12, textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default function FairOddsBettingCalculator() {
  const [tab, setTab] = useState<"combo" | "fhbtts" | "firstgoal">("combo");

  const [selection1, setSelection1] = useState("9.9");
  const [selection2, setSelection2] = useState("17.75");
  const [selection3, setSelection3] = useState("40");

  const [ov05, setOv05] = useState("1.37");
  const [ov15, setOv15] = useState("2.67");
  const [ov25, setOv25] = useState("7.10");
  const [htHome, setHtHome] = useState("2.18");
  const [htDraw, setHtDraw] = useState("2.63");
  const [htAway, setHtAway] = useState("6.20");

  const [fgHomeOdds, setFgHomeOdds] = useState("4.45");
  const [fgDrawOdds, setFgDrawOdds] = useState("3.425");
  const [fgAwayOdds, setFgAwayOdds] = useState("2.07");
  const [fg00, setFg00] = useState("8.0");
  const [fgBTTS, setFgBTTS] = useState("");

  const combo = useMemo(() => {
    const odds = [toNum(selection1), toNum(selection2), toNum(selection3)].filter((x): x is number => x !== null);
    const probs = odds.map(impliedProb);
    const fair = fairFromProbs(probs);
    return { odds, probs, fair, totalProb: probs.reduce((a, b) => a + b, 0) };
  }, [selection1, selection2, selection3]);

  const firstHalf = useMemo(() => {
    const p05 = toNum(ov05) ? impliedProb(toNum(ov05)!) : null;
    const p15 = toNum(ov15) ? impliedProb(toNum(ov15)!) : null;
    const p25 = toNum(ov25) ? impliedProb(toNum(ov25)!) : null;

    const totalLambda = inferTotalLambdaFromOvers(p05, p15, p25);

    const homeProb = toNum(htHome) ? impliedProb(toNum(htHome)!) : null;
    const drawProb = toNum(htDraw) ? impliedProb(toNum(htDraw)!) : null;
    const awayProb = toNum(htAway) ? impliedProb(toNum(htAway)!) : null;

    const homeShare = inferHomeShareFromHT1X2(totalLambda, homeProb, drawProb, awayProb);
    const home1H = totalLambda * homeShare;
    const away1H = totalLambda * (1 - homeShare);
    const prob = bttsFirstHalf(home1H, away1H);

    return {
      totalLambda,
      home1H,
      away1H,
      prob,
      fair: prob > 0 ? 1 / prob : null,
    };
  }, [ov05, ov15, ov25, htHome, htDraw, htAway]);

  const firstGoal = useMemo(() => {
    const homeOdds = toNum(fgHomeOdds);
    const drawOdds = toNum(fgDrawOdds);
    const awayOdds = toNum(fgAwayOdds);
    const zeroZeroOdds = toNum(fg00);
    const bttsOdds = toNum(fgBTTS);

    if (!homeOdds || !drawOdds || !awayOdds || !zeroZeroOdds) {
      return {
        ready: false,
        message: "Enter Home, Draw, Away and 0-0 mids to build the model.",
      };
    }

    const fit = fitFirstGoalModel(homeOdds, drawOdds, awayOdds, zeroZeroOdds, bttsOdds);
    if (!fit || !Number.isFinite(fit.lh) || !Number.isFinite(fit.la)) {
      return {
        ready: false,
        message: "The inputs do not produce a stable fit. Check the odds and try again.",
      };
    }

    const total = fit.lh + fit.la;
    if (!Number.isFinite(total) || total <= 0) {
      return {
        ready: false,
        message: "Total xG could not be calculated from the inputs.",
      };
    }

    const noGoalProb = Math.exp(-total);
    const homeFirstProb = (fit.lh / total) * (1 - noGoalProb);
    const awayFirstProb = (fit.la / total) * (1 - noGoalProb);
    const bttsProb = (1 - Math.exp(-fit.lh)) * (1 - Math.exp(-fit.la));

    return {
      ready: true,
      lh: fit.lh,
      la: fit.la,
      total,
      noGoalProb,
      homeFirstProb,
      awayFirstProb,
      fairHome: homeFirstProb > 0 ? 1 / homeFirstProb : null,
      fairAway: awayFirstProb > 0 ? 1 / awayFirstProb : null,
      fairNoGoal: noGoalProb > 0 ? 1 / noGoalProb : null,
      bttsProb,
    };
  }, [fgHomeOdds, fgDrawOdds, fgAwayOdds, fg00, fgBTTS]);

  const resetExample = () => {
    setSelection1("9.9");
    setSelection2("17.75");
    setSelection3("40");
    setOv05("1.37");
    setOv15("2.67");
    setOv25("7.10");
    setHtHome("2.18");
    setHtDraw("2.63");
    setHtAway("6.20");
    setFgHomeOdds("4.45");
    setFgDrawOdds("3.425");
    setFgAwayOdds("2.07");
    setFg00("8.0");
    setFgBTTS("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Fair Odds Betting Calculator</h1>
            <p style={{ color: "#555", marginTop: 8 }}>
              Build combo fair odds, estimate first-half BTTS, and model team to score first from exchange data.
            </p>
          </div>
          <button onClick={resetExample} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
            Reset example
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <button onClick={() => setTab("combo")} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", background: tab === "combo" ? "#111827" : "#fff", color: tab === "combo" ? "#fff" : "#111", cursor: "pointer" }}>Combo builder</button>
          <button onClick={() => setTab("fhbtts")} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", background: tab === "fhbtts" ? "#111827" : "#fff", color: tab === "fhbtts" ? "#fff" : "#111", cursor: "pointer" }}>1H BTTS xG model</button>
          <button onClick={() => setTab("firstgoal")} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", background: tab === "firstgoal" ? "#111827" : "#fff", color: tab === "firstgoal" ? "#fff" : "#111", cursor: "pointer" }}>Team to score first</button>
        </div>

        {tab === "combo" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <Card title="Combined fair odds">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <Field label="Selection 1 odds" value={selection1} onChange={setSelection1} />
                <Field label="Selection 2 odds" value={selection2} onChange={setSelection2} />
                <Field label="Selection 3 odds" value={selection3} onChange={setSelection3} />
              </div>
              <p style={{ marginTop: 16, color: "#555" }}>Enter decimal odds for each scoreline or selection. The app sums implied probabilities and converts back to a fair combined price.</p>
            </Card>

            <Card title="Results">
              <div style={{ display: "grid", gap: 10 }}>
                {combo.odds.map((odd, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", background: "#f3f4f6", padding: 12, borderRadius: 10 }}>
                    <span>Selection {idx + 1}</span>
                    <span>Prob {fmt(combo.probs[idx] * 100)}%</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 20 }}>
                <StatBox label="Combined probability" value={`${fmt(combo.totalProb * 100)}%`} dark />
                <StatBox label="Fair odds" value={combo.fair ? fmt(combo.fair) : "-"} />
              </div>
            </Card>
          </div>
        )}

        {tab === "fhbtts" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <Card title="Inputs">
              <div style={{ marginBottom: 18, fontWeight: 600 }}>First-half goal line mids</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <Field label="Over 0.5" value={ov05} onChange={setOv05} />
                <Field label="Over 1.5" value={ov15} onChange={setOv15} />
                <Field label="Over 2.5" value={ov25} onChange={setOv25} />
              </div>

              <div style={{ marginBottom: 18, fontWeight: 600 }}>Half-time 1X2 mids</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <Field label="HT Home" value={htHome} onChange={setHtHome} />
                <Field label="HT Draw" value={htDraw} onChange={setHtDraw} />
                <Field label="HT Away" value={htAway} onChange={setHtAway} />
              </div>
            </Card>

            <Card title="Model output">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                <StatBox label="1H total xG" value={fmt(firstHalf.totalLambda, 3)} />
                <StatBox label="Home 1H xG" value={fmt(firstHalf.home1H, 3)} />
                <StatBox label="Away 1H xG" value={fmt(firstHalf.away1H, 3)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <StatBox label="BTTS first half probability" value={`${fmt(firstHalf.prob * 100)}%`} dark />
                <StatBox label="Fair odds" value={firstHalf.fair ? fmt(firstHalf.fair) : "-"} />
              </div>
            </Card>
          </div>
        )}

        {tab === "firstgoal" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <Card title="Inputs (mid prices)">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <Field label="Home" value={fgHomeOdds} onChange={setFgHomeOdds} />
                <Field label="Draw" value={fgDrawOdds} onChange={setFgDrawOdds} />
                <Field label="Away" value={fgAwayOdds} onChange={setFgAwayOdds} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <Field label="0-0" value={fg00} onChange={setFg00} />
                <Field label="BTTS Yes (optional)" value={fgBTTS} onChange={setFgBTTS} placeholder="Optional" />
              </div>
              <p style={{ marginTop: 16, color: "#555" }}>Uses W/D/W and 0-0 to fit home and away xG, then prices home first, away first, and no goal. BTTS is an optional refinement.</p>
            </Card>

            <Card title="Model output">
              {!firstGoal.ready ? (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: 14 }}>
                  {firstGoal.message}
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                    <StatBox label="Home xG" value={fmt(firstGoal.lh, 3)} />
                    <StatBox label="Away xG" value={fmt(firstGoal.la, 3)} />
                    <StatBox label="No-goal probability" value={`${fmt(firstGoal.noGoalProb * 100)}%`} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                    <StatBox label="Home scores first" value={`${fmt(firstGoal.homeFirstProb * 100)}%`} dark />
                    <StatBox label="Away scores first" value={`${fmt(firstGoal.awayFirstProb * 100)}%`} dark />
                    <StatBox label="Model BTTS" value={`${fmt(firstGoal.bttsProb * 100)}%`} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    <StatBox label="Fair home first odds" value={firstGoal.fairHome ? fmt(firstGoal.fairHome) : "-"} />
                    <StatBox label="Fair away first odds" value={firstGoal.fairAway ? fmt(firstGoal.fairAway) : "-"} />
                    <StatBox label="Fair no-goal odds" value={firstGoal.fairNoGoal ? fmt(firstGoal.fairNoGoal) : "-"} />
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
