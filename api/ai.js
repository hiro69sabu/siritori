// 【最終修正】 正しいパッケージ名を、プロジェクトの標準であるimport形式で読み込む
import { GoogleGenerativeAI } from "@google/generative-ai";

// この関数が、Vercelのサーバーレス関数として動作します
export default async function handler(req, res) {
  // CORSヘッダーの設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSメソッドのプリフライトチェック
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTメソッド以外のリクエストは拒否
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 環境変数からAPIキーを取得
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'APIキーがサーバーに設定されていません。' });
    }

    // フロントエンドからのデータを取得
    const { prompt } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: 'プロンプトがありません。' });
    }
    
    // Gemini APIクライアントの初期化
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // AIにプロンプトを送信
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text();

    // 成功した結果を返す
    res.status(200).json({ text: aiText });

  } catch (error) {
    console.error("APIルートでエラーが発生しました:", error);
    res.status(500).json({ error: 'AIとの通信中にサーバーでエラーが発生しました。' });
  }
}
