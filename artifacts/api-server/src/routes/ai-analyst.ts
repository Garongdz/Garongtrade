import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
});

interface AnalyzeRequest {
  symbol: string;
  name: string;
  timeframe: string;
  currentPrice: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  high24h: number;
  low24h: number;
  additionalContext?: string;
  language?: "en" | "id";
}

function buildPrompt(body: AnalyzeRequest): string {
  const isId = body.language === "id";

  const langInstruction = isId
    ? `PENTING: Seluruh analisis WAJIB ditulis dalam Bahasa Indonesia. Semua teks dalam field JSON (summary, trend_analysis, rsi_estimate, momentum, volume_analysis, factors, reasoning, disclaimer, dll) harus dalam Bahasa Indonesia yang baik dan benar. Gunakan istilah trading yang umum dipakai di Indonesia.`
    : `Respond entirely in English.`;

  const riskLevels = isId
    ? `"Rendah" | "Sedang" | "Tinggi"`
    : `"Low" | "Medium" | "High"`;

  const disclaimer = isId
    ? `Analisis ini hanya untuk tujuan edukasi dan bukan merupakan saran keuangan. Selalu gunakan manajemen risiko yang tepat.`
    : `This analysis is for educational purposes only and does not constitute financial advice. Always use proper risk management.`;

  return `You are an expert cryptocurrency futures trader and technical analyst.
${langInstruction}

Analyze the following crypto asset and provide a detailed futures trading recommendation.

ASSET INFORMATION:
- Coin: ${body.name} (${body.symbol.toUpperCase()})
- Current Price: $${body.currentPrice.toLocaleString()}
- 24h Change: ${body.change24h >= 0 ? "+" : ""}${body.change24h.toFixed(2)}%
- 24h High: $${body.high24h?.toLocaleString() ?? "N/A"}
- 24h Low: $${body.low24h?.toLocaleString() ?? "N/A"}
- 24h Volume: $${(body.volume24h / 1e6).toFixed(2)}M
- Market Cap: $${(body.marketCap / 1e9).toFixed(2)}B
- Trading Timeframe: ${body.timeframe}
${body.additionalContext ? `- Additional Context / Konteks Tambahan: ${body.additionalContext}` : ""}

Provide a comprehensive futures trading analysis in the following JSON format exactly (no markdown, pure JSON):
{
  "signal": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": <number 1-100>,
  "summary": "<${isId ? "satu kalimat ringkasan eksekutif dalam Bahasa Indonesia" : "one sentence executive summary"}>",
  "trend_analysis": "<${isId ? "paragraf analisis tren yang detail dalam Bahasa Indonesia" : "detailed trend analysis paragraph"}>",
  "key_levels": {
    "support": [<price1>, <price2>],
    "resistance": [<price1>, <price2>],
    "entry": <suggested entry price>,
    "stop_loss": <stop loss price>,
    "take_profit_1": <first take profit>,
    "take_profit_2": <second take profit>
  },
  "technical_indicators": {
    "rsi_estimate": "<${isId ? "Jenuh Jual/Netral/Jenuh Beli + catatan singkat dalam Bahasa Indonesia" : "Oversold/Neutral/Overbought + brief note"}>",
    "momentum": "<${isId ? "Bullish/Bearish/Netral + catatan singkat dalam Bahasa Indonesia" : "Bullish/Bearish/Neutral + brief note"}>",
    "volume_analysis": "<${isId ? "analisis volume dalam Bahasa Indonesia" : "analysis of volume"}>",
    "trend_strength": "<${isId ? "Lemah/Sedang/Kuat" : "Weak/Moderate/Strong"}>"
  },
  "risk_assessment": {
    "level": ${riskLevels},
    "factors": ["<${isId ? "faktor risiko 1 dalam Bahasa Indonesia" : "risk factor 1"}>", "<${isId ? "faktor risiko 2" : "risk factor 2"}>", "<${isId ? "faktor risiko 3" : "risk factor 3"}>"]
  },
  "reasoning": ["<${isId ? "alasan utama 1 dalam Bahasa Indonesia" : "key reason 1"}>", "<${isId ? "alasan 2" : "reason 2"}>", "<${isId ? "alasan 3" : "reason 3"}>", "<${isId ? "alasan 4" : "reason 4"}>"],
  "disclaimer": "${disclaimer}"
}`;
}

router.post("/ai/analyze", async (req, res) => {
  try {
    const body = req.body as AnalyzeRequest;

    if (!body.symbol || !body.timeframe) {
      res.status(400).json({ error: "symbol and timeframe are required" });
      return;
    }

    const prompt = buildPrompt(body);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      res.status(500).json({ error: "No text response from AI" });
      return;
    }

    let analysisText = textBlock.text.trim();
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Could not parse AI response as JSON" });
      return;
    }

    const analysis = JSON.parse(jsonMatch[0]);
    res.json(analysis);
  } catch (err: any) {
    console.error("Error calling Claude API:", err);
    if (err?.status === 401) {
      res.status(401).json({
        error: "Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY secret.",
      });
    } else {
      res.status(500).json({ error: err?.message || "AI analysis failed" });
    }
  }
});

export default router;
