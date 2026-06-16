# AI Model and Infra Cost Comparison for 45-Minute Interview (April 2026)

## 1. LLM Model Cost Comparison (45-min Interview, ~90,000 tokens)

| Model              | Price per 1M tokens (INR) | Est. LLM Cost (INR) | Latency (avg, sec) | Notes                                  |
|--------------------|--------------------------|---------------------|--------------------|-----------------------------------------|
| GPT-4o             | ₹665                     | ₹59.76              | 2–4                | Highest quality, high cost              |
| GPT-4o mini        | ₹133                     | ₹12                 | 1–2                | Fast, good quality, lower cost          |
| GPT-3.5            | ₹15                      | ₹1.35               | 1–2                | Good for basic tasks, lowest cost (OpenAI)|
| Gemini 2.5 Flash   | ₹7                       | ₹0.63               | 0.5–1              | Ultra-fast, basic tasks                 |
| Gemini 2.5 Pro     | ₹21                      | ₹1.89               | 1–2                | Fast, high quality                      |
| Gemini 2 Pro       | ₹28                      | ₹2.52               | 1–2                | High quality                            |
| Gemini 1.5 Pro     | ₹42                      | ₹3.78               | 1–2                | Large context, robust                   |

## 2. TTS/STT Cost and Latency Comparison (45-min Interview)

| Provider   | TTS+STT Cost (INR) | Latency (avg, sec) | Notes                        |
|------------|--------------------|--------------------|------------------------------|
| Sarvam AI  | ₹25.70–₹44.28      | 0.7–1.2            | Fast, low cost, Indian accent|
| Azure      | ₹180–₹250          | 1.2–2.0            | High cost, global support    |

## 3. Infra Cost (45-min Interview)

| Component         | Cost (INR) | Notes                                 |
|-------------------|------------|---------------------------------------|
| Video Storage     | ₹1.23      | 360MB compressed, Bunny.net           |
| EC2 Compute       | ₹0.27      | AWS EC2, scalable                     |

## 4. Example Total Cost (Worst Case, 45-min Interview)

| LLM Model         | TTS/STT Provider | Total Cost (INR) |
|-------------------|------------------|------------------|
| GPT-4o            | Azure            | ₹311.26          |
| GPT-4o mini       | Sarvam (high)    | ₹57.78           |
| Gemini 2.5 Pro    | Sarvam (low)     | ₹28.99           |
| GPT-3.5           | Sarvam (low)     | ₹23.45           |
| Gemini 2.5 Flash  | Sarvam (low)     | ₹22.83           |

## 5. Best & Recommended Pricing

### Best Quality (Recommended)
- LLM: Gemini 2.5 Pro
- TTS/STT: Sarvam AI (low rate)
- Infra: Bunny.net (video), EC2 (compute)

**Total Cost (45-min interview): ₹28.99**

### Cost-Optimized (Ultra Low Cost)
- LLM: Gemini 2.5 Flash
- TTS/STT: Sarvam AI (low rate)
- Infra: Bunny.net (video), EC2 (compute)

**Total Cost (45-min interview): ₹22.83**

### Table: Recommended Configurations

| Configuration         | LLM Model       | TTS/STT      | Infra (storage+compute) | Total Cost (INR) | Output Quality         |
|----------------------|-----------------|--------------|------------------------|------------------|-----------------------|
| Best Quality         | Gemini 2.5 Pro  | Sarvam (low) | Bunny.net + EC2        | ₹28.99           | Excellent             |
| Cost Optimized       | Gemini 2.5 Flash| Sarvam (low) | Bunny.net + EC2        | ₹22.83           | Very Good (fastest)   |

## 6. Latency Notes
- Gemini 2.5 Flash is the fastest for LLM tasks, followed by GPT-4o mini and Gemini 2.5 Pro.
- Sarvam AI is faster than Azure for TTS/STT, especially for Indian languages/accents.

## 6. Recommendations
- For best quality and lowest cost: Gemini 2.5 Pro + Sarvam AI.
- For ultra-low cost: Gemini 2.5 Flash + Sarvam AI.
- Use Azure only if you need global language/accent support and can afford higher cost.

---

_Data sources: OpenAI, Google Cloud, Sarvam AI, Azure pricing and latency benchmarks as of April 2026._
