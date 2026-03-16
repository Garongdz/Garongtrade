import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
}

router.post("/ai/analyze", async (req, res) => {
  try {
    const body = req.body as AnalyzeRequest;

    if (!body.symbol || !body.timeframe) {
      res.status(400).json({ error: "symbol and timeframe are required" });
      return;
    }

    const prompt = `You are an expert cryptocurrency futures trader and technical analyst. Analyze the following crypto asset and provide a detailed futures trading recommendation.

ASSET INFORMATION:
- Coin: ${body.name} (${body.symbol.toUpperCase()})
- Current Price: $${body.currentPrice.toLocaleString()}
- 24h Change: ${body.change24h >= 0 ? "+" : ""}${body.change24h.toFixed(2)}%
- 24h High: $${body.high24h.toLocaleString()}
- 24h Low: $${body.low24h.toLocaleString()}
- 24h Volume: $${(body.volume24h / 1e6).toFixed(2)}M
- Market Cap: $${(body.marketCap / 1e9).toFixed(2)}B
- Trading Timeframe: ${body.timeframe}
${body.additionalContext ? `- Additional Context: ${body.additionalContext}` : ""}

Please provide a comprehensive futures trading analysis in the following JSON format exactly (no markdown, pure JSON):
{
  "signal": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": <number 1-100>,
  "summary": "<one sentence executive summary>",
  "trend_analysis": "<detailed trend analysis paragraph>",
  "key_levels": {
    "support": [<price1>, <price2>],
    "resistance": [<price1>, <price2>],
    "entry": <suggested entry price>,
    "stop_loss": <stop loss price>,
    "take_profit_1": <first take profit>,
    "take_profit_2": <second take profit>
  },
  "technical_indicators": {
    "rsi_estimate": "<Oversold/Neutral/Overbought + brief note>",
    "momentum": "<Bullish/Bearish/Neutral + brief note>",
    "volume_analysis": "<analysis of volume>",
    "trend_strength": "<Weak/Moderate/Strong>"
  },
  "risk_assessment": {
    "level": "Low" | "Medium" | "High",
    "factors": ["<risk factor 1>", "<risk factor 2>", "<risk factor 3>"]
  },
  "reasoning": ["<key reason 1>", "<key reason 2>", "<key reason 3>", "<key reason 4>"],
  "disclaimer": "This analysis is for educational purposes only and does not constitute financial advice. Always use proper risk management."
}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
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
      res.status(401).json({ error: "Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY secret." });
    } else {
      res.status(500).json({ error: err?.message || "AI analysis failed" });
    }
  }
});

export default router;
