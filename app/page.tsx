import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Calculator, Percent, Target } from "lucide-react";

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

export default function FairOddsBettingCalculator() {
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
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Fair Odds Betting Calculator</h1>
            <p className="mt-2 text-sm text-slate-600">
              Build combo fair odds, estimate first-half BTTS from midpoint prices, and model team to score first from exchange data.
            </p>
          </div>
          <Button variant="outline" onClick={resetExample}>Reset example</Button>
        </div>

        <Tabs defaultValue="combo" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="combo">Combo builder</TabsTrigger>
            <TabsTrigger value="fhbtts">1H BTTS xG model</TabsTrigger>
            <TabsTrigger value="firstgoal">Team to score first (model)</TabsTrigger>
          </TabsList>

          <TabsContent value="combo">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Combined fair odds</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Selection 1 odds</Label>
                      <Input value={selection1} onChange={(e) => setSelection1(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Selection 2 odds</Label>
                      <Input value={selection2} onChange={(e) => setSelection2(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Selection 3 odds</Label>
                      <Input value={selection3} onChange={(e) => setSelection3(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">Enter decimal odds for each scoreline or selection. The app sums implied probabilities and converts back to a fair combined price.</p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5" /> Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm">
                    {combo.odds.map((odd, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3">
                        <span>Selection {idx + 1}</span>
                        <span>Prob {fmt(combo.probs[idx] * 100)}%</span>
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-900 p-4 text-white">
                      <div className="text-xs uppercase tracking-wide text-slate-300">Combined probability</div>
                      <div className="mt-2 text-3xl font-semibold">{fmt(combo.totalProb * 100)}%</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Fair odds</div>
                      <div className="mt-2 text-3xl font-semibold">{combo.fair ? fmt(combo.fair) : "-"}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="fhbtts">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Inputs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="mb-3 text-sm font-medium text-slate-700">First-half goal line mids</div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Over 0.5</Label>
                        <Input value={ov05} onChange={(e) => setOv05(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Over 1.5</Label>
                        <Input value={ov15} onChange={(e) => setOv15(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Over 2.5</Label>
                        <Input value={ov25} onChange={(e) => setOv25(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 text-sm font-medium text-slate-700">Half-time 1X2 mids</div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>HT Home</Label>
                        <Input value={htHome} onChange={(e) => setHtHome(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>HT Draw</Label>
                        <Input value={htDraw} onChange={(e) => setHtDraw(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>HT Away</Label>
                        <Input value={htAway} onChange={(e) => setHtAway(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600">
                    The model infers first-half total xG from the goal lines, then splits that total between the teams using HT 1X2.
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>Model output</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="text-xs uppercase tracking-wide text-slate-500">1H total xG</div>
                      <div className="mt-2 text-2xl font-semibold">{fmt(firstHalf.totalLambda, 3)}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Home 1H xG</div>
                      <div className="mt-2 text-2xl font-semibold">{fmt(firstHalf.home1H, 3)}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Away 1H xG</div>
                      <div className="mt-2 text-2xl font-semibold">{fmt(firstHalf.away1H, 3)}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-900 p-4 text-white">
                      <div className="text-xs uppercase tracking-wide text-slate-300">BTTS first half probability</div>
                      <div className="mt-2 text-3xl font-semibold">{fmt(firstHalf.prob * 100)}%</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Fair odds</div>
                      <div className="mt-2 text-3xl font-semibold">{firstHalf.fair ? fmt(firstHalf.fair) : "-"}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="firstgoal">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>Inputs (mid prices)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Home</Label>
                      <Input value={fgHomeOdds} onChange={(e) => setFgHomeOdds(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Draw</Label>
                      <Input value={fgDrawOdds} onChange={(e) => setFgDrawOdds(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Away</Label>
                      <Input value={fgAwayOdds} onChange={(e) => setFgAwayOdds(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>0-0</Label>
                      <Input value={fg00} onChange={(e) => setFg00(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>BTTS Yes (optional)</Label>
                      <Input value={fgBTTS} onChange={(e) => setFgBTTS(e.target.value)} placeholder="Optional" />
                    </div>
                  </div>

                  <p className="text-sm text-slate-600">
                    This tab uses W/D/W and 0-0 to fit home and away xG, then prices home first, away first, and no goal. BTTS is optional and only acts as a refinement.
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>Model output</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!firstGoal.ready ? (
                    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
                      {firstGoal.message}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Home xG</div>
                          <div className="mt-2 text-2xl font-semibold">{fmt(firstGoal.lh, 3)}</div>
                        </div>
                        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Away xG</div>
                          <div className="mt-2 text-2xl font-semibold">{fmt(firstGoal.la, 3)}</div>
                        </div>
                        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs uppercase tracking-wide text-slate-500">No-goal probability</div>
                          <div className="mt-2 text-2xl font-semibold">{fmt(firstGoal.noGoalProb * 100)}%</div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-slate-900 p-4 text-white">
                          <div className="text-xs uppercase tracking-wide text-slate-300">Home scores first</div>
                          <div className="mt-2 text-2xl font-semibold">{fmt(firstGoal.homeFirstProb * 100)}%</div>
                        </div>
                        <div className="rounded-2xl bg-slate-900 p-4 text-white">
                          <div className="text-xs uppercase tracking-wide text-slate-300">Away scores first</div>
                          <div className="mt-2 text-2xl font-semibold">{fmt(firstGoal.awayFirstProb * 100)}%</div>
                        </div>
                        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Model BTTS</div>
                          <div className="mt-2 text-2xl font-semibold">{fmt(firstGoal.bttsProb * 100)}%</div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Fair home first odds</div>
                          <div className="mt-2 text-3xl font-semibold">{firstGoal.fairHome ? fmt(firstGoal.fairHome) : "-"}</div>
                        </div>
                        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Fair away first odds</div>
                          <div className="mt-2 text-3xl font-semibold">{firstGoal.fairAway ? fmt(firstGoal.fairAway) : "-"}</div>
                        </div>
                        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="text-xs uppercase tracking-wide text-slate-500">Fair no-goal odds</div>
                          <div className="mt-2 text-3xl font-semibold">{firstGoal.fairNoGoal ? fmt(firstGoal.fairNoGoal) : "-"}</div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
