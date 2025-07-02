// 【Vercel環境向け最終修正版 Ver.3.0 - モデルをProにアップグレード】
import { GoogleGenerativeAI } from "@google/generative-ai";

// Vercelがこのファイルをサーバーレス関数として認識するためのデフォルトエクスポート
export default async function handler(req, res) {
  // プリフライトリクエスト（OPTIONSメソッド）への対応
  // これにより、異なるドメインからのリクエストが許可されます。
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // CORSヘッダーをPOSTリクエストにも設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // POSTメソッド以外のリクエストは受け付けないようにします。
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed. Please use POST.' } });
  }

  try {
    // Vercelの環境変数からAPIキーを安全に取得します。
    const apiKey = process.env.GEMINI_API_KEY;

    // APIキーが設定されていない場合は、エラーを返します。
    if (!apiKey) {
      console.error("CRITICAL: GEMINI_API_KEY environment variable is not set.");
      return res.status(500).json({ error: { message: 'API key is not configured on the server.' } });
    }

    // フロントエンドから送信されたデータをJSONとして解析します。
    const { prompt } = req.body;

    // プロンプトが空の場合は、エラーを返します。
    if (!prompt) {
      return res.status(400).json({ error: { message: 'Prompt is missing in the request body.' } });
    }

    // Geminiクライアントを初期化します。
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ★★★★★ ここを、最強のProモデルに変更しました ★★★★★
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    // AIにコンテンツ生成をリクエストします。
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text();

    // 成功した結果（AIが生成したテキスト）をJSON形式で返します。
    return res.status(200).json({ text: aiText });

  } catch (error) {
    // 予期せぬエラーが発生した場合の処理
    console.error("API Route Error:", error);
    // エラーの内容をより具体的に返すように修正
    return res.status(500).json({ error: { message: 'An internal server error occurred while communicating with the AI.', details: error.message } });
  }
}